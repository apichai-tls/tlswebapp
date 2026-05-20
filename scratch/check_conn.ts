import { PrismaClient } from '@prisma/client'

async function checkConnections() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: prodUrl });

  try {
    const result = await prisma.$queryRaw`SELECT count(*) FROM pg_stat_activity;`;
    console.log('Current connections:', result);
    
    const detailed = await prisma.$queryRaw`SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;`;
    console.log('Connections by DB:', detailed);
  } catch (error) {
    console.error('Error checking connections:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkConnections().catch(console.error);
