import { PrismaClient } from '@prisma/client'

async function syncPois() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const stagingUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging?connection_limit=1";

  let pois: any[] = [];

  // 1. Fetch from Production
  console.log('Fetching POIs from Production...');
  const prodDb = new PrismaClient({ datasourceUrl: prodUrl });
  try {
    pois = await prodDb.pOI.findMany();
    console.log(`Found ${pois.length} POIs in Production.`);
  } finally {
    await prodDb.$disconnect();
  }

  if (pois.length === 0) {
    console.log('No POIs to sync.');
    return;
  }

  // 2. Sync Test
  console.log('Syncing POIs to Test...');
  const testDb = new PrismaClient({ datasourceUrl: testUrl });
  try {
    await testDb.pOI.deleteMany();
    await testDb.pOI.createMany({ data: pois });
    console.log('Test sync completed.');
  } finally {
    await testDb.$disconnect();
  }

  // 3. Sync Staging
  console.log('Syncing POIs to Staging...');
  const stagingDb = new PrismaClient({ datasourceUrl: stagingUrl });
  try {
    await stagingDb.pOI.deleteMany();
    await stagingDb.pOI.createMany({ data: pois });
    console.log('Staging sync completed.');
  } finally {
    await stagingDb.$disconnect();
  }

  console.log('All syncs completed successfully!');
}

syncPois().catch(console.error);
