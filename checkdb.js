const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.adminUser.findMany({ where: { name: { contains: 'Ekachai' } } });
  console.log('Users:', users);
  const shops = await prisma.shopLocation.findMany();
  console.log('Shops:', shops);
}
main().catch(console.error).finally(() => prisma.$disconnect());
