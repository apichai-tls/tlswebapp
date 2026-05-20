import { PrismaClient } from '@prisma/client'

async function checkCounts() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const stagingUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging?connection_limit=1";

  const dbs = [
    { name: 'Production', url: prodUrl },
    { name: 'Test', url: testUrl },
    { name: 'Staging', url: stagingUrl },
  ];

  const results: any = {};

  for (const dbInfo of dbs) {
    const prisma = new PrismaClient({ datasourceUrl: dbInfo.url });
    try {
      results[dbInfo.name] = {
        AdminUser: await prisma.adminUser.count(),
        Customer: await prisma.customer.count(),
        Job: await prisma.job.count(),
        Rider: await prisma.rider.count(),
        ShopLocation: await prisma.shopLocation.count(),
        ServiceItem: await prisma.serviceItem.count(),
        PriceList: await prisma.priceList.count(),
        POI: await prisma.pOI.count(),
      };
    } catch (e: any) {
       console.error(`Error connecting to ${dbInfo.name}: ${e.message}`);
       results[dbInfo.name] = { error: 'Failed to connect' };
    } finally {
      await prisma.$disconnect();
    }
  }

  console.table(results);
}

checkCounts().catch(console.error);
