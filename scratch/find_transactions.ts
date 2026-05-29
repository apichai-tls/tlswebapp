import { PrismaClient } from '@prisma/client';

async function run() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: prodUrl });

  try {
    console.log('Searching for Rider Transactions for job 2026000226...');
    const txs = await prisma.riderTransaction.findMany({
      where: { jobId: '2026000226' }
    });

    console.log('Found Transactions:', JSON.stringify(txs, null, 2));
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
