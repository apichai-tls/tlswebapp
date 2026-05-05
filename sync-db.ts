import { PrismaClient } from '@prisma/client';

const prodUrl = "postgresql://postgres.nynjbpeizpueantiedio:2wRZVD3KHLGMxQw2@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true";
const stageUrl = "postgresql://postgres.liqoqtrztogxssgrgjcq:MhM2TSv%25-*P%23aWn@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const prismaProd = new PrismaClient({ datasources: { db: { url: prodUrl } } });
const prismaStage = new PrismaClient({ datasources: { db: { url: stageUrl } } });

async function sync() {
  console.log("Starting DB Sync from Staging to Production...");

  // 1. Delete all existing data in Production (respecting foreign keys)
  console.log("Clearing Production data...");
  await prismaProd.job.deleteMany();
  await prismaProd.customer.deleteMany();
  await prismaProd.pOI.deleteMany();
  await prismaProd.rider.deleteMany();
  await prismaProd.serviceItem.deleteMany();
  await prismaProd.adminUser.deleteMany();
  await prismaProd.shopLocation.deleteMany();
  await prismaProd.setting.deleteMany();
  await prismaProd.priceList.deleteMany();
  
  // 2. Fetch all data from Staging
  console.log("Fetching data from Staging...");
  const customers = await prismaStage.customer.findMany();
  const jobs = await prismaStage.job.findMany();
  const pois = await prismaStage.pOI.findMany();
  const riders = await prismaStage.rider.findMany();
  const services = await prismaStage.serviceItem.findMany();
  const admins = await prismaStage.adminUser.findMany();
  const shops = await prismaStage.shopLocation.findMany();
  const settings = await prismaStage.setting.findMany();
  const prices = await prismaStage.priceList.findMany();

  // 3. Insert into Production (respecting foreign keys)
  console.log("Writing data to Production...");
  
  if (customers.length > 0) await prismaProd.customer.createMany({ data: customers });
  console.log(`Synced ${customers.length} Customers`);
  
  if (jobs.length > 0) await prismaProd.job.createMany({ data: jobs });
  console.log(`Synced ${jobs.length} Jobs`);
  
  if (pois.length > 0) await prismaProd.pOI.createMany({ data: pois });
  console.log(`Synced ${pois.length} POIs`);
  
  if (riders.length > 0) await prismaProd.rider.createMany({ data: riders });
  console.log(`Synced ${riders.length} Riders`);
  
  if (services.length > 0) await prismaProd.serviceItem.createMany({ data: services });
  console.log(`Synced ${services.length} ServiceItems`);
  
  if (admins.length > 0) await prismaProd.adminUser.createMany({ data: admins });
  console.log(`Synced ${admins.length} AdminUsers`);
  
  if (shops.length > 0) await prismaProd.shopLocation.createMany({ data: shops });
  console.log(`Synced ${shops.length} ShopLocations`);
  
  if (settings.length > 0) await prismaProd.setting.createMany({ data: settings });
  console.log(`Synced ${settings.length} Settings`);
  
  if (prices.length > 0) await prismaProd.priceList.createMany({ data: prices });
  console.log(`Synced ${prices.length} PriceLists`);

  console.log("✅ Sync complete!");
}

sync().catch(e => {
  console.error("Sync failed:", e);
}).finally(() => {
  prismaProd.$disconnect();
  prismaStage.$disconnect();
});
