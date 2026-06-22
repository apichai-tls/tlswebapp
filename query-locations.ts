import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const shopLocations = await prisma.shopLocation.findMany();
  const pois = await prisma.pOI.findMany();
  const customersCount = await prisma.customer.count();
  const sampleCustomers = await prisma.customer.findMany({
    select: {
      name: true,
      defaultAddress: true,
      defaultLat: true,
      defaultLng: true
    },
    take: 5
  });

  console.log("=== SHOP LOCATIONS ===");
  console.log(JSON.stringify(shopLocations, null, 2));

  console.log("\n=== POIS ===");
  console.log(JSON.stringify(pois, null, 2));

  console.log(`\n=== CUSTOMERS (Total: ${customersCount}, Sample 5) ===`);
  console.log(JSON.stringify(sampleCustomers, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
