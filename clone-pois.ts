import { PrismaClient } from '@prisma/client';

const prodUrl = "postgresql://postgres.nynjbpeizpueantiedio:2wRZVD3KHLGMxQw2@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres";
const stageUrl = "postgresql://postgres.liqoqtrztogxssgrgjcq:MhM2TSv%25-*P%23aWn@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const prismaProd = new PrismaClient({ datasources: { db: { url: prodUrl } } });
const prismaStage = new PrismaClient({ datasources: { db: { url: stageUrl } } });

async function main() {
  console.log("Connecting to databases to clone POIs...");
  
  try {
    console.log("Fetching POIs from Production...");
    const pois = await prismaProd.pOI.findMany();
    console.log(`Found ${pois.length} POIs`);

    console.log("Clearing Staging POIs...");
    await prismaStage.pOI.deleteMany();

    console.log("Inserting POIs into Staging Database (this might take a few seconds)...");
    
    // Split into chunks of 500 to prevent query too large errors
    const CHUNK_SIZE = 500;
    for (let i = 0; i < pois.length; i += CHUNK_SIZE) {
      const chunk = pois.slice(i, i + CHUNK_SIZE);
      await prismaStage.pOI.createMany({ data: chunk });
      console.log(`Inserted ${i + chunk.length} / ${pois.length}`);
    }

    console.log("🎉 POI Clone Completed Successfully!");
  } catch (error) {
    console.error("❌ Error cloning POIs:", error);
  } finally {
    await prismaProd.$disconnect();
    await prismaStage.$disconnect();
  }
}

main();
