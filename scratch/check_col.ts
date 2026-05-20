import { PrismaClient } from '@prisma/client'

async function checkColumn() {
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: testUrl });
  try {
    const cust = await prisma.customer.findFirst();
    console.log("Customer record:", cust);
  } catch (e: any) {
    console.error("Error:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkColumn().catch(console.error);
