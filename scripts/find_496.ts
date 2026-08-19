import * as fs from 'fs';
import * as path from 'path';

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
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { totalAmount: 496 },
        { totalAmount: 495 }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('Found jobs with totalAmount 495 or 496 (last 10):', jobs.length);
  jobs.forEach((j: any) => console.log(`ID: ${j.id}, Total: ${j.totalAmount}, Fee: ${j.fee}, LaundryPrice: ${j.totalAmount - j.fee} (approx), Speed: ?`));
}

main().finally(() => prisma.$disconnect());
