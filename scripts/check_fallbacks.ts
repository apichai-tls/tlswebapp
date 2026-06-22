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

import { Storage } from '@google-cloud/storage';
import { PrismaClient } from '@prisma/client';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const prisma = new PrismaClient();
const bucketName = process.env.GCS_BUCKET_NAME || 'tls-images-prod';

async function main() {
  const [files] = await storage.bucket(bucketName).getFiles({
    prefix: 'jobs/',
  });

  const proofFiles = files.filter(f => f.name.includes('/proofs') || f.name.includes('/proofs-'));
  
  const gcsJobFiles: Record<string, any[]> = {};
  proofFiles.forEach(file => {
    const parts = file.name.split('/');
    if (parts.length >= 5) {
      const jobId = parts[4];
      if (!gcsJobFiles[jobId]) {
        gcsJobFiles[jobId] = [];
      }
      gcsJobFiles[jobId].push({
        path: file.name,
        timeCreated: new Date(file.metadata.timeCreated || ''),
        url: `https://storage.googleapis.com/${bucketName}/${file.name}`,
      });
    }
  });

  const jobIds = Object.keys(gcsJobFiles);
  const jobs = await prisma.job.findMany({
    where: { id: { in: jobIds } }
  });

  const jobMap = new Map<string, any>();
  jobs.forEach(j => jobMap.set(j.id, j));

  console.log('--- Checking Fallbacks ---');
  for (const jobId of jobIds) {
    const job = jobMap.get(jobId);
    const filesList = gcsJobFiles[jobId];
    if (!job) continue;

    let legs: any = null;
    if (job.legsJson) {
      try {
        legs = JSON.parse(job.legsJson);
      } catch (err) {}
    }

    const pickupTimeStr = legs?.pickupOutbound?.completedAt || legs?.pickupInbound?.completedAt;
    const deliveryTimeStr = legs?.deliveryOutbound?.completedAt || legs?.deliveryInbound?.completedAt;
    const pickupTime = pickupTimeStr ? new Date(pickupTimeStr) : null;
    const deliveryTime = deliveryTimeStr ? new Date(deliveryTimeStr) : null;

    const hasDeliveryRider = !!(legs?.deliveryOutbound?.riderId || job.deliveryRiderId);
    const isDeliveryCompleted = legs?.deliveryOutbound?.status === 'completed' || job.status === 'completed';

    for (const f of filesList) {
      const imgTime = f.timeCreated;
      const diffPickup = pickupTime ? Math.abs(imgTime.getTime() - pickupTime.getTime()) : Infinity;
      const diffDelivery = deliveryTime ? Math.abs(imgTime.getTime() - deliveryTime.getTime()) : Infinity;

      const diffPickupMin = diffPickup !== Infinity ? diffPickup / (60 * 1000) : null;
      const diffDeliveryMin = diffDelivery !== Infinity ? diffDelivery / (60 * 1000) : null;

      const isCloseToPickup = diffPickupMin !== null && diffPickupMin <= 10;
      const isCloseToDelivery = diffDeliveryMin !== null && diffDeliveryMin <= 10;
      
      const conditionDeliverySpecial = (!hasDeliveryRider && !isDeliveryCompleted && !isCloseToPickup);

      // Check if it classifies as fallback
      let isFallback = false;
      if (diffPickupMin !== null && isCloseToPickup && (diffDeliveryMin === null || diffPickup < diffDelivery)) {
        // pickup
      } else if (diffDeliveryMin !== null && isCloseToDelivery) {
        // delivery
      } else if (conditionDeliverySpecial) {
        // delivery (special)
      } else if (diffPickupMin !== null && (diffDeliveryMin === null || diffPickup < diffDelivery)) {
        isFallback = true;
      }

      if (isFallback) {
        console.log(`Job ID: ${jobId}, File: ${f.path}`);
        console.log(`  Created: ${imgTime.toISOString()}`);
        console.log(`  Pickup CompletedAt: ${pickupTime?.toISOString()}`);
        console.log(`  Delivery CompletedAt: ${deliveryTime?.toISOString()}`);
        console.log(`  Diff Pickup: ${diffPickupMin?.toFixed(2)} mins`);
        console.log(`  Diff Delivery: ${diffDeliveryMin?.toFixed(2)} mins`);
        console.log(`  Job Status: ${job.status}, Type: ${job.type}`);
        console.log(`  hasDeliveryRider: ${hasDeliveryRider}, isDeliveryCompleted: ${isDeliveryCompleted}`);
        console.log('---------------------------------------------');
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
