import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('POIs:', await prisma.pOI.count());
  console.log('Jobs:', await prisma.job.count());
}

main().finally(() => prisma.$disconnect());
