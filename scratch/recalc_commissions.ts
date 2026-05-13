import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Original Fee Formula from store.ts: ระยะทางปัดเศษขึ้น คูณ 3 คูณ 10 บาท (ขั้นต่ำ 30 บาท)
function calculateFee(distanceKm: number): number {
  if (!distanceKm || distanceKm <= 0) return 0;
  const distanceFare = Math.ceil(distanceKm * 3) * 10;
  return Math.max(30, distanceFare);
}

async function main() {
  console.log("Recalculating with original formula...");

  console.log("Deleting old RiderTransactions...");
  await prisma.riderTransaction.deleteMany({});

  console.log("Resetting Rider balances...");
  await prisma.rider.updateMany({
    data: {
      commissionBalance: 0,
      completedJobs: 0
    }
  });

  const jobs = await prisma.job.findMany();
  const riders = await prisma.rider.findMany();
  const riderMap = new Map(riders.map(r => [r.id, r]));

  for (const job of jobs) {
    // Split total distance into pickup and delivery legs to apply the formula individually
    const pickupDist = Math.round((job.distance / 2) * 10) / 10;
    const deliveryDist = Math.round((job.distance - pickupDist) * 10) / 10;

    // Apply exact original formula
    const pickupCommission = calculateFee(pickupDist);
    const deliveryCommission = calculateFee(deliveryDist);
    const totalFee = pickupCommission + deliveryCommission;

    await prisma.job.update({
      where: { id: job.id },
      data: {
        pickupDistance: pickupDist,
        deliveryDistance: deliveryDist,
        pickupCommission: pickupCommission,
        deliveryCommission: deliveryCommission,
        fee: totalFee
      }
    });

    const isPickupDone = !['pending', 'accepted', 'pickup'].includes(job.status);
    const isDeliveryDone = job.status === 'completed';

    if (isPickupDone && job.pickupRiderId) {
      const rider = riderMap.get(job.pickupRiderId);
      if (rider) {
        rider.commissionBalance += pickupCommission;
        rider.completedJobs += 1;
        
        await prisma.riderTransaction.create({
          data: {
            riderId: rider.id,
            jobId: job.id,
            amount: pickupCommission,
            type: "commission_pickup",
            detail: `Job ${job.id.substring(0, 6)} - รับผ้า (${pickupDist}km)`
          }
        });
      }
    }

    if (isDeliveryDone && job.deliveryRiderId) {
      const rider = riderMap.get(job.deliveryRiderId);
      if (rider) {
        rider.commissionBalance += deliveryCommission;
        rider.completedJobs += 1;
        
        await prisma.riderTransaction.create({
          data: {
            riderId: rider.id,
            jobId: job.id,
            amount: deliveryCommission,
            type: "commission_delivery",
            detail: `Job ${job.id.substring(0, 6)} - ส่งผ้า (${deliveryDist}km)`
          }
        });
      }
    }
  }

  console.log("Saving updated Rider balances...");
  for (const [_, rider] of riderMap) {
    await prisma.rider.update({
      where: { id: rider.id },
      data: {
        commissionBalance: rider.commissionBalance,
        completedJobs: rider.completedJobs
      }
    });
  }

  console.log("✅ Successfully recalculated all commissions using the ORIGINAL formula!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
