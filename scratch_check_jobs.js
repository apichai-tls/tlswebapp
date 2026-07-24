const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("Recent Jobs:\n", JSON.stringify(jobs.map(j => ({
    id: j.id,
    customerName: j.customerName,
    items: j.items,
    totalAmount: j.totalAmount,
    fee: j.fee,
    remark: j.remark
  })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
