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
  console.log('Connecting to PROD database...');
  
  // Find Rider Pai
  const riders = await prisma.rider.findMany();
  const pai = riders.find((r: any) => r.name.toLowerCase().includes('pai') || (r.nickname && r.nickname.toLowerCase().includes('pai')) || r.id === 'pai');
  
  if (!pai) {
    console.log('Could not find Rider Pai in the database. Available riders:');
    console.log(riders.map((r: any) => `${r.id} - ${r.name} (${r.nickname})`).join('\n'));
    process.exit(1);
  }
  
  console.log(`Found Rider Pai: ${pai.name} (ID: ${pai.id})`);
  
  // Define today (2026-08-03)
  const todayStart = new Date('2026-08-03T00:00:00.000+07:00');
  const todayEnd = new Date('2026-08-03T23:59:59.999+07:00');
  
  console.log(`Checking jobs for ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);
  
  // Find all jobs modified or paid today
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { csoPaidAt: { gte: todayStart, lte: todayEnd } },
        { shopPaidAt: { gte: todayStart, lte: todayEnd } },
        { updatedAt: { gte: todayStart, lte: todayEnd } }
      ]
    }
  });
  
  const paiJobs = jobs.filter((j: any) => 
    (j.paymentChannel && j.paymentChannel.toLowerCase().includes('pai')) ||
    j.riderId === pai.id ||
    j.pickupRiderId === pai.id ||
    j.deliveryRiderId === pai.id
  );
  
  console.log(`\nFound ${paiJobs.length} jobs related to Pai updated today:\n`);
  paiJobs.forEach((j: any) => {
    console.log(`Job ${j.id}:`);
    console.log(`  - Status: ${j.status}`);
    console.log(`  - Payment Channel: ${j.paymentChannel}`);
    console.log(`  - Payment Method: ${j.paymentMethod}`);
    console.log(`  - Amount: ฿${j.totalAmount}`);
    console.log(`  - CSO Paid At: ${j.csoPaidAt}`);
    console.log(`  - Shop Paid At: ${j.shopPaidAt}`);
    console.log(`  - Updated: ${j.updatedAt}`);
    console.log('');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
