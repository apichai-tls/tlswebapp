import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const jobs = await prisma.job.findMany({ where: { createdAt: { gte: new Date('2026-05-19T00:00:00Z'), lt: new Date('2026-05-20T00:00:00Z') } } });
  console.log('Total jobs from yesterday:', jobs.length);
}
main();
