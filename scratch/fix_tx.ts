import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: { status: { in: ['pickup_completed', 'completed'] } }
  });
  
  let added = 0;
  for (const job of jobs) {
    if (job.pickupRiderId && job.pickupCommission != null) {
      const tx = await prisma.riderTransaction.findFirst({
        where: { jobId: job.id, type: 'commission_pickup' }
      });
      if (!tx) {
        await prisma.riderTransaction.create({
          data: {
            riderId: job.pickupRiderId,
            jobId: job.id,
            amount: job.pickupCommission,
            type: 'commission_pickup',
            detail: `Job ${job.id} - Pickup`
          }
        });
        await prisma.rider.update({
          where: { id: job.pickupRiderId },
          data: { commissionBalance: { increment: job.pickupCommission } }
        });
        added++;
      }
    }
    
    if (job.status === 'completed' && job.deliveryRiderId && job.deliveryCommission != null) {
      const tx = await prisma.riderTransaction.findFirst({
        where: { jobId: job.id, type: 'commission_delivery' }
      });
      if (!tx) {
        await prisma.riderTransaction.create({
          data: {
            riderId: job.deliveryRiderId,
            jobId: job.id,
            amount: job.deliveryCommission,
            type: 'commission_delivery',
            detail: `Job ${job.id} - Delivery`
          }
        });
        await prisma.rider.update({
          where: { id: job.deliveryRiderId },
          data: { commissionBalance: { increment: job.deliveryCommission } }
        });
        added++;
      }
    }
  }
  console.log('Added ' + added + ' missing transactions.');
}

main().catch(console.error);
