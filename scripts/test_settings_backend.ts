import * as fs from 'fs';
import * as path from 'path';

// Manual loading of .env.prod or local test env
const envPath = path.join(process.cwd(), '.env');
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
import { updateSettingAction } from '../src/actions/db';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Starting Settings Backend Integration Test ===\n');

  // 1. Setup mock active job
  const jobId = 'TEST-BACKEND-JOB-88';
  console.log(`Setting up mock active job ${jobId}...`);
  
  // Cleanup any old test jobs first
  await prisma.job.deleteMany({ where: { id: jobId } });

  const job = await prisma.job.create({
    data: {
      id: jobId,
      type: 'pickup',
      status: 'pickup',
      pickupDistance: 5.5,
      pickupCommission: 11, // originally 5.5 * 2 = 11
      deliveryDistance: 0.0,
      deliveryCommission: 0,
      customerName: 'Test Customer',
      customerPhone: '0999999999',
      pickupLocation: 'Test Pickup Location',
      dropoffLocation: 'Test Dropoff Location',
      pickupLat: 13.7563,
      pickupLng: 100.5664,
      dropoffLat: 13.7367,
      dropoffLng: 100.5231,
      distance: 3.5,
      fee: 40,
      scheduledAt: new Date(),
    }
  });

  console.log(`Created active job. Distance: ${job.pickupDistance} km. Current Commission: ฿${job.pickupCommission}`);

  // 2. Call updateSettingAction to update riderCommissionPerKm to 4.5
  console.log('\n--- Updating Rider Commission Setting to 4.5 Baht/km ---');
  await updateSettingAction('riderCommissionPerKm', '4.5');

  // 3. Verify setting persisted in DB
  const setting = await prisma.setting.findUnique({
    where: { key: 'riderCommissionPerKm' }
  });

  if (setting?.value === '4.5') {
    console.log(`✅ Setting key 'riderCommissionPerKm' updated to ${setting.value} in DB.`);
  } else {
    console.error(`❌ Failed: Setting value is incorrect:`, setting);
    process.exit(1);
  }

  // 4. Verify that the active job commission was updated by the DB trigger/logic
  // Expected: FLOOR(5.5) * 4.5 = 5 * 4.5 = 22.5
  const updatedJob = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (updatedJob && updatedJob.pickupCommission === 22.5) {
    console.log(`✅ Active Job pickupCommission updated successfully to: ฿${updatedJob.pickupCommission}`);
  } else {
    console.error(`❌ Failed: Active Job commission was not updated or incorrect. Expected ฿22.5, got ฿${updatedJob?.pickupCommission}`);
    process.exit(1);
  }

  // 5. Clean up
  console.log('\n--- Cleaning Up Mock Data ---');
  await prisma.job.deleteMany({ where: { id: jobId } });
  
  // Restore setting back to default 2
  await updateSettingAction('riderCommissionPerKm', '2');
  console.log('✅ Cleaned up successfully.');
  console.log('\n=== Backend Settings Test PASSED! ===');
}

main()
  .catch(async (e) => {
    console.error('❌ Test failed with exception:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
