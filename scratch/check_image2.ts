import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const jobs = await prisma.job.findMany();
  let totalLength = 0;
  for (const job of jobs) {
    if (job.proofImageUrl) totalLength += job.proofImageUrl.length;
    if (job.billImageUrl) totalLength += job.billImageUrl.length;
    if (job.bagImageUrl) totalLength += job.bagImageUrl.length;
  }
  console.log('Total length of all image URLs in DB:', totalLength);
}
main().finally(() => prisma.$disconnect());
