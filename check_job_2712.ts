import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Find job
  const job = await prisma.job.findFirst({
    where: { id: { contains: "2026002712" } },
    select: {
      id: true,
      isPaid: true,
      isShopPaid: true,
      paymentChannel: true,
      totalAmount: true,
      itemsJson: true,
      customerId: true,
      walletBalanceAfter: true,
    }
  });
  console.log("Job:", JSON.stringify(job, null, 2));

  if (job?.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: job.customerId },
      select: { id: true, name: true, phone: true, creditBalance: true, isMember: true }
    });
    console.log("Customer:", JSON.stringify(customer, null, 2));

    // Parse items to find packages
    if (job.itemsJson) {
      const items = JSON.parse(job.itemsJson);
      const packageItems = items.filter((i: any) => i.category === "PACKAGE" || i.serviceId?.includes("package") || i.name?.toLowerCase().includes("package"));
      console.log("Package items:", JSON.stringify(packageItems, null, 2));
      const packageTotal = packageItems.reduce((s: number, i: any) => s + (i.price * i.quantity), 0);
      console.log("Package total to add to wallet:", packageTotal);
    }
  }
}
main().finally(() => prisma.$disconnect());
