import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const customerId = "4e095832-8367-4534-881c-43e5b3af9b04";
  const jobId = "2026002712";
  const packageAmountToAdd = 4000; // ฿3,000 (PAC-002) + ฿1,000 (PAC-PAC-001)

  // Get current balance
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, creditBalance: true, isMember: true }
  });
  
  console.log("Before:", customer);

  const newBalance = (customer?.creditBalance || 0) + packageAmountToAdd;
  
  // Update customer wallet
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      creditBalance: newBalance,
      isMember: true, // Package buyer should be member
    }
  });

  // Update job's walletBalanceAfter for audit trail
  await prisma.job.update({
    where: { id: jobId },
    data: { walletBalanceAfter: newBalance }
  });

  console.log(`✅ Wallet updated for ${customer?.name}`);
  console.log(`   Added: ฿${packageAmountToAdd.toLocaleString()}`);
  console.log(`   New balance: ฿${newBalance.toLocaleString()}`);
}
main().finally(() => prisma.$disconnect());
