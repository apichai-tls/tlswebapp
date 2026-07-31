import * as fs from 'fs';
import * as path from 'path';

// Load .env.prod manually
const envPath = path.join(process.cwd(), '.env.prod');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const firstEqual = trimmed.indexOf('=');
    if (firstEqual === -1) return;
    const key = trimmed.slice(0, firstEqual).trim();
    let val = trimmed.slice(firstEqual + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== INVESTIGATING PROD DATABASE ===');
  console.log('Using DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 45) + '...');

  // 1. Check for Stuck Jobs
  console.log('\n--- 1. Stuck Jobs (isStuck = true) ---');
  const stuckJobs = await prisma.job.findMany({
    where: { isStuck: true },
    orderBy: { updatedAt: 'desc' }
  });
  console.log(`Found ${stuckJobs.length} stuck jobs.`);
  stuckJobs.forEach(job => {
    console.log(`ID: ${job.id}`);
    console.log(`  Customer: ${job.customerName} (${job.customerPhone})`);
    console.log(`  Type: ${job.type}, Status: ${job.status}, Substatus: ${job.subStatus}`);
    console.log(`  Is Stuck: ${job.isStuck}, Is Paid: ${job.isPaid}`);
    console.log(`  Created: ${job.createdAt}, Updated: ${job.updatedAt}`);
    console.log(`  legsJson: ${job.legsJson}`);
    console.log(`  remark: ${job.remark}`);
    console.log('--------------------------------------');
  });

  // 2. Check for Jobs with status Cancel or Return
  console.log('\n--- 2. Cancelled or Returned Jobs ---');
  const cancelJobs = await prisma.job.findMany({
    where: { status: { in: ['cancel', 'return'] } },
    orderBy: { updatedAt: 'desc' },
    take: 10
  });
  console.log(`Found ${cancelJobs.length} cancel/return jobs (showing up to 10):`);
  cancelJobs.forEach(job => {
    console.log(`ID: ${job.id} | Status: ${job.status} | Customer: ${job.customerName} | Updated: ${job.updatedAt}`);
  });

  // 3. Check for recently updated jobs (last 10)
  console.log('\n--- 3. Recent 10 Jobs ---');
  const recentJobs = await prisma.job.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 10
  });
  recentJobs.forEach(job => {
    console.log(`ID: ${job.id} | Status: ${job.status} | Customer: ${job.customerName} | Updated: ${job.updatedAt}`);
  });

  // 4. Check Activity Log
  console.log('\n--- 4. Recent Activity Logs (last 15) ---');
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15
    });
    logs.forEach(log => {
      console.log(`[${log.createdAt.toISOString()}] Entity: ${log.entityType}/${log.entityId} | Action: ${log.action} | User: ${log.userName}`);
      console.log(`  Details: ${log.details}`);
    });
  } catch (err) {
    console.log('ActivityLog query failed or model does not exist:', err);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
