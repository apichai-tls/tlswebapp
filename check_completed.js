const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      createdAt: true,
      totalAmount: true,
      status: true,
      isPaid: true
    }
  });

  const today = new Date();
  
  // 30 days filter
  const start30 = new Date(today);
  start30.setDate(start30.getDate() - 30);
  start30.setHours(0,0,0,0);
  
  const jobs30 = jobs.filter(j => new Date(j.createdAt) >= start30);
  const completed30 = jobs30.filter(j => j.status === "completed");
  const rev30 = jobs30.filter(j => j.isPaid).reduce((s, j) => s + (j.totalAmount || 0), 0);
  
  console.log("30 Days Stats:");
  console.log(`Total jobs in 30 days: ${jobs30.length}`);
  console.log(`Completed jobs in 30 days: ${completed30.length}`);
  console.log(`Revenue in 30 days: ${rev30}`);
  
  // Custom filter (05/01/2026 - 07/16/2026)
  const customStart = new Date("2026-05-01T00:00:00");
  const customEnd = new Date("2026-07-16T23:59:59");
  
  const jobsCustom = jobs.filter(j => {
    const d = new Date(j.createdAt);
    return d >= customStart && d <= customEnd;
  });
  const completedCustom = jobsCustom.filter(j => j.status === "completed");
  const revCustom = jobsCustom.filter(j => j.isPaid).reduce((s, j) => s + (j.totalAmount || 0), 0);
  
  console.log("\nCustom (May 1 to July 16) Stats:");
  console.log(`Total jobs in Custom: ${jobsCustom.length}`);
  console.log(`Completed jobs in Custom: ${completedCustom.length}`);
  console.log(`Revenue in Custom: ${revCustom}`);
  
  // Total in DB
  const totalCompleted = jobs.filter(j => j.status === "completed");
  const totalRev = jobs.filter(j => j.isPaid).reduce((s, j) => s + (j.totalAmount || 0), 0);
  console.log("\nTotal Database Stats:");
  console.log(`Total completed jobs: ${totalCompleted.length}`);
  console.log(`Total revenue: ${totalRev}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
