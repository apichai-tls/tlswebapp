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
  
  // Find Rider Gus
  const riders = await prisma.rider.findMany();
  const gus = riders.find((r: any) => r.name.toLowerCase().includes('gus') || (r.nickname && r.nickname.toLowerCase().includes('gus')) || r.id.toLowerCase().includes('gus'));
  
  if (!gus) {
    console.log('Could not find Rider Gus in the database. Available riders:');
    console.log(riders.map((r: any) => `${r.id} - ${r.name} (${r.nickname})`).join('\n'));
    process.exit(1);
  }
  
  console.log(`Found Rider Gus: ${gus.name} (ID: ${gus.id})`);
  
  // Job 1: 2026002640 (Pickup)
  const job1Id = '2026002640';
  const job1 = await prisma.job.findUnique({ where: { id: job1Id } });
  if (job1) {
    console.log(`Updating Job ${job1Id} (Pickup)...`);
    console.log(`  - Old pickupRiderId: ${job1.pickupRiderId}`);
    await prisma.job.update({
      where: { id: job1Id },
      data: { pickupRiderId: gus.id }
    });
    console.log(`  - Successfully updated pickupRiderId to ${gus.id}`);
  } else {
    console.log(`Job ${job1Id} not found.`);
  }

  // Job 2: 2026002604 (Delivery)
  const job2Id = '2026002604';
  const job2 = await prisma.job.findUnique({ where: { id: job2Id } });
  if (job2) {
    console.log(`Updating Job ${job2Id} (Delivery)...`);
    console.log(`  - Old deliveryRiderId: ${job2.deliveryRiderId}`);
    await prisma.job.update({
      where: { id: job2Id },
      data: { deliveryRiderId: gus.id }
    });
    console.log(`  - Successfully updated deliveryRiderId to ${gus.id}`);
  } else {
    console.log(`Job ${job2Id} not found.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
