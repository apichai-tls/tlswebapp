import { PrismaClient } from '@prisma/client';

async function run() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: prodUrl });

  try {
    console.log('Searching in Production for job 2026000370...');
    const job = await prisma.job.findUnique({
      where: { id: '2026000370' }
    });

    if (job) {
      console.log('--- FOUND JOB 2026000370 ---');
      console.log(JSON.stringify(job, null, 2));
    } else {
      console.log('Job 2026000370 not found.');
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
