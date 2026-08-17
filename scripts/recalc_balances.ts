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
  
  const riders = await prisma.rider.findMany();
  console.log(`Found ${riders.length} riders. Recalculating balances...`);
  
  for (const rider of riders) {
    const txs = await prisma.riderTransaction.findMany({
      where: { riderId: rider.id }
    });
    
    // Sum amount based on type? Wait, do we subtract any?
    // Let's check how many have negative amounts or if it's all just sum of 'amount'.
    // In typical ledger, amount can be negative or we just sum it up.
    let total = 0;
    for (const tx of txs) {
        total += tx.amount;
    }
    
    if (Math.abs(rider.commissionBalance - total) > 0.01) {
        console.log(`Rider ${rider.name} (ID: ${rider.id}): Balance mismatch! Current: ${rider.commissionBalance}, Calculated: ${total}`);
        await prisma.rider.update({
            where: { id: rider.id },
            data: { commissionBalance: total }
        });
        console.log(` -> Fixed balance for ${rider.name} to ${total}`);
    }
  }
  
  console.log('Finished recalculating balances.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
