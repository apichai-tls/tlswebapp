const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const riders = await prisma.rider.findMany();
  console.log("Riders:", riders.map(r => ({ id: r.id, name: r.name })));
}

main().finally(() => prisma.$disconnect());
