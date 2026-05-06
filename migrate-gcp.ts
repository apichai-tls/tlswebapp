import { PrismaClient } from "@prisma/client";
const sourceUrl = "postgresql://postgres.liqoqtrztogxssgrgjcq:MhM2TSv%25-*P%23aWn@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const targetUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres";

const prismaSource = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const prismaTarget = new PrismaClient({ datasources: { db: { url: targetUrl } } });

async function main() {
  console.log("Connecting to databases...");
  try {
    console.log("Fetching from Source...");
    const priceLists = await prismaSource.priceList.findMany();
    const customers = await prismaSource.customer.findMany();
    const serviceItems = await prismaSource.serviceItem.findMany();
    const riders = await prismaSource.rider.findMany();
    const shopLocations = await prismaSource.shopLocation.findMany();
    const settings = await prismaSource.setting.findMany();
    const jobs = await prismaSource.job.findMany();
    const pois = await prismaSource.pOI.findMany();

    console.log(`Found ${jobs.length} Jobs, ${pois.length} POIs`);

    console.log("Clearing Target Database...");
    await prismaTarget.job.deleteMany();
    await prismaTarget.pOI.deleteMany();
    await prismaTarget.customer.deleteMany();
    await prismaTarget.priceList.deleteMany();
    await prismaTarget.serviceItem.deleteMany();
    await prismaTarget.rider.deleteMany();
    await prismaTarget.shopLocation.deleteMany();
    await prismaTarget.setting.deleteMany();

    console.log("Inserting into Target Database...");
    if (priceLists.length > 0) await prismaTarget.priceList.createMany({ data: priceLists });
    if (customers.length > 0) await prismaTarget.customer.createMany({ data: customers });
    if (serviceItems.length > 0) await prismaTarget.serviceItem.createMany({ data: serviceItems });
    if (riders.length > 0) await prismaTarget.rider.createMany({ data: riders });
    if (shopLocations.length > 0) await prismaTarget.shopLocation.createMany({ data: shopLocations });
    if (settings.length > 0) await prismaTarget.setting.createMany({ data: settings });
    if (jobs.length > 0) await prismaTarget.job.createMany({ data: jobs });
    
    // Insert POIs in batches to avoid payload too large
    if (pois.length > 0) {
      console.log(`Inserting ${pois.length} POIs in batches...`);
      const batchSize = 500;
      for (let i = 0; i < pois.length; i += batchSize) {
        const batch = pois.slice(i, i + batchSize);
        await prismaTarget.pOI.createMany({ data: batch });
        console.log(`Inserted ${i + batch.length} / ${pois.length} POIs`);
      }
    }

    console.log("🎉 Database Migration to Google Cloud Completed Successfully!");
  } catch (error) {
    console.error("❌ Error migrating database:", error);
  } finally {
    await prismaSource.$disconnect();
    await prismaTarget.$disconnect();
  }
}
main();
