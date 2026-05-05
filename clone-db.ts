import { PrismaClient } from '@prisma/client';

const prodUrl = "postgresql://postgres.nynjbpeizpueantiedio:2wRZVD3KHLGMxQw2@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres";
const stageUrl = "postgresql://postgres.liqoqtrztogxssgrgjcq:MhM2TSv%25-*P%23aWn@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const prismaProd = new PrismaClient({ datasources: { db: { url: prodUrl } } });
const prismaStage = new PrismaClient({ datasources: { db: { url: stageUrl } } });

async function main() {
  console.log("Connecting to databases...");
  
  try {
    // 1. Fetch from Prod
    console.log("Fetching from Production...");
    const priceLists = await prismaProd.priceList.findMany();
    const customers = await prismaProd.customer.findMany();
    const serviceItems = await prismaProd.serviceItem.findMany();
    const riders = await prismaProd.rider.findMany();
    const shopLocations = await prismaProd.shopLocation.findMany();
    // POIs excluded as there are too many (2000+) and usually static or fetched from API
    const settings = await prismaProd.setting.findMany();
    const jobs = await prismaProd.job.findMany();

    console.log(`Found ${priceLists.length} PriceLists`);
    console.log(`Found ${customers.length} Customers`);
    console.log(`Found ${serviceItems.length} ServiceItems`);
    console.log(`Found ${riders.length} Riders`);
    console.log(`Found ${shopLocations.length} ShopLocations`);
    console.log(`Found ${settings.length} Settings`);
    console.log(`Found ${jobs.length} Jobs`);

    // 2. Clear Staging
    console.log("Clearing Staging Database...");
    await prismaStage.job.deleteMany();
    await prismaStage.customer.deleteMany();
    await prismaStage.priceList.deleteMany();
    await prismaStage.serviceItem.deleteMany();
    await prismaStage.rider.deleteMany();
    await prismaStage.shopLocation.deleteMany();
    await prismaStage.setting.deleteMany();

    // 3. Insert into Staging
    console.log("Inserting into Staging Database...");
    
    if (priceLists.length > 0) await prismaStage.priceList.createMany({ data: priceLists });
    if (customers.length > 0) await prismaStage.customer.createMany({ data: customers });
    if (serviceItems.length > 0) await prismaStage.serviceItem.createMany({ data: serviceItems });
    if (riders.length > 0) await prismaStage.rider.createMany({ data: riders });
    if (shopLocations.length > 0) await prismaStage.shopLocation.createMany({ data: shopLocations });
    if (settings.length > 0) await prismaStage.setting.createMany({ data: settings });
    if (jobs.length > 0) await prismaStage.job.createMany({ data: jobs });

    console.log("🎉 Database Clone Completed Successfully!");
  } catch (error) {
    console.error("❌ Error cloning database:", error);
  } finally {
    await prismaProd.$disconnect();
    await prismaStage.$disconnect();
  }
}

main();
