import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres' } } });
async function main() {
  const riders = await prisma.rider.findMany({ select: { id: true } });
  console.log('Rider IDs:', riders.map(r => r.id));
}
main();
