import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const jobs = await prisma.job.findMany({ where: { bagImageUrl: { not: null } }, select: { id: true, bagImageUrl: true } });
  if (jobs.length > 0) {
    console.log(jobs[0].bagImageUrl?.substring(0, 50));
    console.log('Length:', jobs[0].bagImageUrl?.length);
  } else {
    console.log('No jobs with bag image');
  }
}
main().finally(() => prisma.$disconnect());
