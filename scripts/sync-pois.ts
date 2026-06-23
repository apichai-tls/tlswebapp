import { PrismaClient } from '@prisma/client';

const localUrl = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test?sslmode=no-verify";
const prodUrl = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres?sslmode=no-verify";

async function main() {
  const localPrisma = new PrismaClient({ datasources: { db: { url: localUrl } } });
  const prodPrisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });

  console.log("Fetching POIs from Local DB...");
  const localPois = await localPrisma.pOI.findMany();
  console.log(`Found ${localPois.length} POIs in Local DB.`);

  console.log("Fetching POIs from Prod DB...");
  const prodPois = await prodPrisma.pOI.findMany();
  console.log(`Found ${prodPois.length} POIs in Prod DB.`);

  const prodPoiIds = new Set(prodPois.map(p => p.id));
  const missingPois = localPois.filter(p => !prodPoiIds.has(p.id));

  console.log(`Missing POIs to copy: ${missingPois.length}`);

  if (missingPois.length > 0) {
    console.log("Copying missing POIs to Prod DB...");
    // Split into chunks of 500 to prevent query limits
    const chunkSize = 500;
    for (let i = 0; i < missingPois.length; i += chunkSize) {
      const chunk = missingPois.slice(i, i + chunkSize);
      await prodPrisma.pOI.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      console.log(`Copied chunk ${Math.floor(i / chunkSize) + 1} (${chunk.length} items)`);
    }
    console.log("Copying completed successfully.");
  } else {
    console.log("No missing POIs to copy.");
  }

  await localPrisma.$disconnect();
  await prodPrisma.$disconnect();
}

main().catch(console.error);
