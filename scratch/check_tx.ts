import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const riders = await prisma.rider.findMany();

  for (const rider of riders) {
    const riderId = rider.id;
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { pickupRiderId: riderId },
          { deliveryRiderId: riderId },
          { riderId: riderId }
        ]
      }
    });

    const txs = await prisma.riderTransaction.findMany({
      where: { riderId }
    });

    const completedPickupJobs = jobs.filter(j => (j.status === 'pickup_completed' || j.status === 'completed' || j.status === 'ready_for_delivery' || j.status === 'active' || j.status === 'delivery') && j.pickupRiderId === riderId);
    const completedDeliveryJobs = jobs.filter(j => j.status === 'completed' && j.deliveryRiderId === riderId);

    if (jobs.length > 0) {
      console.log(`\nRider: ${rider.name} (${riderId})`);
      console.log(`Jobs: ${jobs.length} | Txs: ${txs.length} | Completed Pickups: ${completedPickupJobs.length} | Completed Deliveries: ${completedDeliveryJobs.length}`);

      for (const job of completedPickupJobs) {
        if (!job.pickupCommission) continue;
        const hasTx = txs.some(t => t.jobId === job.id && t.type === 'commission_pickup');
        if (!hasTx) console.log(`  MISSING PICKUP TX FOR JOB: ${job.id} | commission=${job.pickupCommission}`);
      }

      for (const job of completedDeliveryJobs) {
        if (!job.deliveryCommission) continue;
        const hasTx = txs.some(t => t.jobId === job.id && t.type === 'commission_delivery');
        if (!hasTx) console.log(`  MISSING DELIVERY TX FOR JOB: ${job.id} | commission=${job.deliveryCommission}`);
      }
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
