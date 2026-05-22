import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres' } } });
async function main() {
  const count = await prisma.job.count();
  console.log('Total jobs:', count);
}
main();
