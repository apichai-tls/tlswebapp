const { PrismaClient } = require('@prisma/client');

// Using the PROD database URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres"
    }
  }
});

async function main() {
  console.log("Connecting to Production Database...");
  
  // 1. Delete all Rider Transactions
  console.log("Deleting RiderTransactions...");
  const txRes = await prisma.riderTransaction.deleteMany({});
  console.log(`✅ Deleted ${txRes.count} RiderTransactions`);
  
  // 2. Delete all Jobs
  console.log("Deleting Jobs...");
  const jobRes = await prisma.job.deleteMany({});
  console.log(`✅ Deleted ${jobRes.count} Jobs`);
  
  // 3. Reset Rider Balances
  console.log("Resetting Rider balances and completed jobs...");
  const riderRes = await prisma.rider.updateMany({
    data: { 
      commissionBalance: 0, 
      completedJobs: 0 
    }
  });
  console.log(`✅ Reset balances for ${riderRes.count} Riders`);

  console.log("🎉 Successfully wiped all order data from Production.");
}

main()
  .catch(e => {
    console.error("❌ Error occurred:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
