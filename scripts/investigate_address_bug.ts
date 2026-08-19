import * as fs from 'fs';
import * as path from 'path';

// Load .env.prod
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
  const jobId = '2026002654';
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      customer: true
    }
  });
  if (!job) return;

  console.log(`Job CreatedAt: ${job.createdAt}`);
  console.log(`Job UpdatedAt: ${job.updatedAt}`);
  if (job.customer) {
    console.log(`Customer Name: ${job.customer.name}`);
    console.log(`Customer UpdatedAt: ${job.customer.updatedAt}`);
  }
}
main().finally(() => prisma.$disconnect());
