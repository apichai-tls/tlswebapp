import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function measure() {
  const start = Date.now();
  
  await Promise.all([
    prisma.customer.findMany().then(() => console.log(`customer: ${Date.now() - start}ms`)),
    prisma.job.findMany().then(() => console.log(`job: ${Date.now() - start}ms`)),
    prisma.rider.findMany().then(() => console.log(`rider: ${Date.now() - start}ms`)),
    prisma.serviceItem.findMany().then(() => console.log(`serviceItem: ${Date.now() - start}ms`)),
    prisma.priceList.findMany().then(() => console.log(`priceList: ${Date.now() - start}ms`)),
    prisma.shopLocation.findMany().then(() => console.log(`shopLocation: ${Date.now() - start}ms`)),
    prisma.setting.findMany().then(() => console.log(`setting: ${Date.now() - start}ms`)),
  ]);

  console.log(`Total DB parallel queries: ${Date.now() - start}ms`);
}

measure()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
