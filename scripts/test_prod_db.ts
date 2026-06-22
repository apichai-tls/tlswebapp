import * as fs from 'fs';
import * as path from 'path';

// Manual loading of .env.prod
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
  console.log('Using DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 45) + '...');
  console.log('Using GCS_BUCKET_NAME:', process.env.GCS_BUCKET_NAME);
  
  console.log('\n--- Querying Job 2026000866 from Production DB ---');
  const job = await prisma.job.findUnique({
    where: { id: '2026000866' }
  });

  if (!job) {
    console.log('❌ Job 2026000866 not found in Production DB.');
    // List some jobs to see what we have
    const totalJobs = await prisma.job.count();
    console.log(`Total jobs in DB: ${totalJobs}`);
    const sampleJobs = await prisma.job.findMany({
      take: 10
    });
    console.log('Sample jobs:');
    sampleJobs.forEach(j => console.log(`  - ID: ${j.id}, Status: ${j.status}, Type: ${j.type}`));
  } else {
    console.log('✅ Job 2026000866 found!');
    console.log(JSON.stringify(job, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
