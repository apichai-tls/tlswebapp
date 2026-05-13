import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Fixing Rider Commissions and Transactions...");

  // 1. Delete all existing RiderTransactions
  console.log("Deleting old RiderTransactions...");
  await prisma.riderTransaction.deleteMany({});

  // 2. Reset Rider balances and completedJobs
  console.log("Resetting Rider balances...");
  await prisma.rider.updateMany({
    data: {
      commissionBalance: 0,
      completedJobs: 0
    }
  });

  // 3. Fetch all jobs and riders
  const jobs = await prisma.job.findMany();
  const riders = await prisma.rider.findMany();
  const riderMap = new Map(riders.map(r => [r.id, r]));

  console.log(`Processing ${jobs.length} jobs to calculate commissions...`);

  for (const job of jobs) {
    const pickupCommission = Math.ceil((job.fee || 30) / 2);
    const deliveryCommission = (job.fee || 30) - pickupCommission;

    // Update job with commission values
    await prisma.job.update({
      where: { id: job.id },
      data: { pickupCommission, deliveryCommission }
    });

    const isPickupDone = !['pending', 'accepted', 'pickup'].includes(job.status);
    const isDeliveryDone = job.status === 'completed';

    // Process Pickup Commission
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
            detail: `Job ${job.id.substring(0, 6)} - รับผ้า`
          }
        });
      }
    }

    // Process Delivery Commission
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
            detail: `Job ${job.id.substring(0, 6)} - ส่งผ้า`
          }
        });
      }
    }
  }

  // 4. Save updated rider balances back to DB
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

  console.log("✅ Successfully recalculated all commissions and transactions!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
