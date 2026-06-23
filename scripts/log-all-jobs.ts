import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching all jobs from local database...");
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Found ${jobs.length} total jobs.`);

  // 1. Group by Status
  const statusCounts: Record<string, number> = {};
  jobs.forEach(j => {
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
  });

  // 2. Group by Type
  const typeCounts: Record<string, number> = {};
  jobs.forEach(j => {
    typeCounts[j.type] = (typeCounts[j.type] || 0) + 1;
  });

  // 3. Payment Status & Revenue
  let totalRevenue = 0;
  let paidRevenue = 0;
  let unpaidRevenue = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  jobs.forEach(j => {
    const amt = j.totalAmount || 0;
    totalRevenue += amt;
    if (j.isPaid) {
      paidRevenue += amt;
      paidCount++;
    } else {
      unpaidRevenue += amt;
      unpaidCount++;
    }
  });

  // 4. Stuck Jobs
  const stuckJobs = jobs.filter(j => j.isStuck);

  // 5. Source distribution (app vs pos)
  const sourceCounts: Record<string, number> = {};
  jobs.forEach(j => {
    const src = j.source || 'unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  // Prepare Report Object
  const analysisReport = {
    generatedAt: new Date().toISOString(),
    totalJobs: jobs.length,
    statusBreakdown: statusCounts,
    typeBreakdown: typeCounts,
    sourceBreakdown: sourceCounts,
    financials: {
      totalRevenueEstimation: totalRevenue,
      paidRevenue: paidRevenue,
      unpaidRevenue: unpaidRevenue,
      paidCount,
      unpaidCount
    },
    stuckJobsCount: stuckJobs.length,
    stuckJobsList: stuckJobs.map(j => ({
      id: j.id,
      customerName: j.customerName,
      status: j.status,
      subStatus: j.subStatus,
      totalAmount: j.totalAmount,
      createdAt: j.createdAt
    }))
  };

  // Log summary to console
  console.log("\n=================================");
  console.log("=== JOBS ANALYSIS SUMMARY ===");
  console.log("=================================");
  console.log(`Total Jobs: ${analysisReport.totalJobs}`);
  console.log("\n--- Status Breakdown ---");
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`- ${status.toUpperCase().padEnd(12)}: ${count} jobs`);
  });

  console.log("\n--- Type Breakdown ---");
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`- ${type.padEnd(15)}: ${count} jobs`);
  });

  console.log("\n--- Source Breakdown ---");
  Object.entries(sourceCounts).forEach(([src, count]) => {
    console.log(`- ${src.toUpperCase().padEnd(10)}: ${count} jobs`);
  });

  console.log("\n--- Financial Metrics ---");
  console.log(`- Total Paid Revenue : ฿${paidRevenue.toLocaleString()}`);
  console.log(`- Total Unpaid Debt  : ฿${unpaidRevenue.toLocaleString()}`);
  console.log(`- Total Est. Value   : ฿${totalRevenue.toLocaleString()} (${paidCount} paid, ${unpaidCount} unpaid)`);

  console.log("\n--- Stuck Jobs ---");
  console.log(`Total Stuck Jobs: ${stuckJobs.length}`);
  if (stuckJobs.length > 0) {
    stuckJobs.slice(0, 5).forEach(j => {
      console.log(`  * Job ${j.id}: ${j.customerName} - Status: ${j.status}/${j.subStatus} (฿${j.totalAmount})`);
    });
    if (stuckJobs.length > 5) console.log(`  ... and ${stuckJobs.length - 5} more.`);
  }

  // Write detailed report to scratch folder
  const scratchDir = path.join(__dirname, '../scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir);
  }
  const reportPath = path.join(scratchDir, 'all_jobs_analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(analysisReport, null, 2));
  console.log(`\nDetailed analysis report written to: ${reportPath}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
