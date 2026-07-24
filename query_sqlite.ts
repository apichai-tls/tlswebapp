import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.$queryRawUnsafe('SELECT * FROM "ServiceItem"');
  console.log("SQLITE_ITEMS_START");
  console.log(JSON.stringify(items, null, 2));
  console.log("SQLITE_ITEMS_END");
}

main().catch(console.error).finally(() => prisma.$disconnect());
