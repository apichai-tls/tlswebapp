const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pois = await prisma.pOI.findMany({
    where: {
      OR: [
        { name: { contains: '19 At Chidlom' } }
      ]
    }
  });
  
  const shops = await prisma.shopLocation.findMany({
    where: {
      OR: [
        { name: { contains: 'TLSSR' } },
        { name: { contains: 'TLSS1' } }
      ]
    }
  });

  console.log("POIs:", pois);
  console.log("Shops:", shops);
}

main().finally(() => prisma.$disconnect());
