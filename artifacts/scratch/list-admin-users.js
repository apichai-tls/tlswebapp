const { PrismaClient } = require('@prisma/client');

async function listAdminUsers(url, label) {
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const users = await prisma.$queryRaw`SELECT id, email, name, role FROM "AdminUser"`;
    console.log(`--- ${label} AdminUsers ---`);
    console.log(users);
  } catch (err) {
    console.log(`Failed for ${label}:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await listAdminUsers('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test', 'TEST');
  await listAdminUsers('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging', 'STAGING');
  await listAdminUsers('postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres', 'PROD');
}

main();
