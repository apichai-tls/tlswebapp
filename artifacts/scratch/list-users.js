const { PrismaClient } = require('@prisma/client');

async function listUsers(url, label) {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const users = await prisma.$queryRaw`SELECT id, username, name, role FROM "User"`;
    console.log(`--- ${label} USERS ---`);
    console.log(users);
  } catch (err) {
    console.log(`Failed for ${label}:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await listUsers('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test', 'TEST');
  await listUsers('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging', 'STAGING');
  await listUsers('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres', 'PROD');
}

main();
