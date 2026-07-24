const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Querying all ServiceItems from tls_dev.db...');
  const services = await prisma.serviceItem.findMany();
  console.log(`TOTAL_PRODUCTS_FOUND: ${services.length}`);
  
  const cats = {};
  services.forEach(s => {
    cats[s.category] = (cats[s.category] || 0) + 1;
  });
  console.log('Categories and counts:', cats);
  
  // Save all items to JSON
  const outPath = path.join(__dirname, 'tls_products.json');
  fs.writeFileSync(outPath, JSON.stringify(services, null, 2));
  console.log(`Saved items to: ${outPath}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
