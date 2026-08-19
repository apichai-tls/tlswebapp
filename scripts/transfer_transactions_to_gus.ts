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
    console.log('Could not find Rider Gus.');
    process.exit(1);
  }
  
  console.log(`Found Rider Gus: ${gus.name} (ID: ${gus.id})`);

  const jobIds = ['2026002640', '2026002604'];
  
  // Find RiderTransactions for these jobs
  for (const jobId of jobIds) {
    console.log(`\nChecking RiderTransactions for Job ${jobId}...`);
    const txs = await prisma.riderTransaction.findMany({
      where: { jobId }
    });
    
    if (txs.length === 0) {
      console.log(`  No transactions found for Job ${jobId}`);
      continue;
    }
    
    for (const tx of txs) {
      console.log(`  - Found TX ${tx.id} | Amount: ${tx.amount} | Type: ${tx.type} | Current Rider: ${tx.riderId}`);
      if (tx.riderId !== gus.id) {
        console.log(`    -> Updating riderId to ${gus.id}...`);
        await prisma.riderTransaction.update({
          where: { id: tx.id },
          data: { riderId: gus.id }
        });
        console.log(`    -> Successfully updated TX ${tx.id}`);
      } else {
        console.log(`    -> TX already belongs to Gus.`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
