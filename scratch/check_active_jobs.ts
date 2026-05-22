import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres' } } });
async function main() {
  const jobs = await prisma.job.findMany({ where: { status: { in: ['pending', 'accepted', 'active', 'pickup', 'delivery', 'picked_up'] } } });
  console.log(jobs.map(j => ({ id: j.id, status: j.status, pickupRider: j.pickupRiderId, deliveryRider: j.deliveryRiderId })));
}
main();
