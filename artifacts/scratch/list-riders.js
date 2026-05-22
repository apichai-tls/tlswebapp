const { PrismaClient } = require('@prisma/client');

async function listRiders(url, label) {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const riders = await prisma.$queryRaw`SELECT id, name, nickname FROM "Rider"`;
    console.log(`--- ${label} ---`);
    console.log(riders);
  } catch (err) {
    console.log(`Failed for ${label}:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await listRiders('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test', 'TEST');
  await listRiders('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging', 'STAGING');
  await listRiders('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres', 'PROD');
}

main();
