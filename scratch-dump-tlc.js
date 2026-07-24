const path = require('path');
const fs = require('fs');

// Path to TLC's generated Prisma Client
const tlcPrismaPath = path.resolve(__dirname, '../../TLC/TLC LAUNDRY SERVICE/node_modules/@prisma/client');
console.log(`Loading TLC Prisma Client from: ${tlcPrismaPath}`);

const { PrismaClient } = require(tlcPrismaPath);

// Create client pointing to TLC's database url
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:../../TLC/TLC LAUNDRY SERVICE/prisma/dev.db'
    }
  }
});

async function main() {
  console.log('Querying TLC ServiceItem table...');
  const services = await prisma.serviceItem.findMany();
  console.log(`Successfully retrieved ${services.length} services from TLC database.`);
  
  // Save to json
  const outPath = path.join(__dirname, 'tlc_products.json');
  fs.writeFileSync(outPath, JSON.stringify(services, null, 2));
  console.log(`Saved services list to: ${outPath}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
