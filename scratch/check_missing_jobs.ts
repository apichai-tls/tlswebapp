import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres' } } });
async function main() {
  const jobs = await prisma.job.findMany({ where: { id: { in: ['2026000001', '2026000002', '2026000003', '2026000004', '2026000005', '2026000006', '2026000007', '2026000008', '2026000009', '2026000010', '2026000011', '2026000012', '2026000013', '2026000014', '2026000015', '2026000016'] } }, select: { id: true, createdAt: true, status: true, customerName: true } });
  console.log('Found jobs:', jobs);
}
main();
