import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:MhM2TSv%25-*P%23aWn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    }
  }
});
async function main() {
  try {
    const shops = await prisma.shopLocation.findMany();
    console.log("Shops:", shops);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
