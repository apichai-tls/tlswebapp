import { PrismaClient } from '@prisma/client';

async function checkDb(dbName: string, url: string) {
  console.log(`\n======================= DATABASE: ${dbName} =======================`);
  const prisma = new PrismaClient({ datasourceUrl: url });

  try {
    const job = await prisma.job.findUnique({
      where: { id: '2026000226' }
    });

    if (job) {
      console.log(`Status: ${job.status}`);
      console.log(`CompletedAt: ${job.completedAt}`);
      console.log(`PickupProofImageUrl: ${job.pickupProofImageUrl}`);
      console.log(`DeliveryProofImageUrl: ${job.deliveryProofImageUrl}`);
      console.log(`BillImageUrl: ${job.billImageUrl}`);
      console.log(`LegsJson: ${job.legsJson}`);
    } else {
      console.log('Job not found.');
    }
  } catch (error: any) {
    console.error(`Error in ${dbName}:`, error.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function run() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const stagingUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging?connection_limit=1";

  await checkDb('Production', prodUrl);
  await checkDb('Test', testUrl);
  await checkDb('Staging', stagingUrl);
}

run();
