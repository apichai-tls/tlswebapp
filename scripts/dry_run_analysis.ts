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
  console.log('--- Starting Dry Run Analysis (Hypothesis: NOT close to pickup) ---');
  
  console.log(`Listing files from GCS bucket: ${bucketName}...`);
  const [files] = await storage.bucket(bucketName).getFiles({
    prefix: 'jobs/',
  });

  const proofFiles = files.filter(f => f.name.includes('/proofs') || f.name.includes('/proofs-'));
  console.log(`Found ${proofFiles.length} proof files in GCS.\n`);

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
    where: {
      id: { in: jobIds }
    }
  });

  const jobMap = new Map<string, any>();
  jobs.forEach(j => jobMap.set(j.id, j));

  const report: any[] = [];
  let totalPickup = 0;
  let totalDelivery = 0;
  let totalUnknown = 0;

  for (const jobId of jobIds) {
    const job = jobMap.get(jobId);
    const filesList = gcsJobFiles[jobId];

    if (!job) continue;

    let legs: any = null;
    if (job.legsJson) {
      try {
        legs = JSON.parse(job.legsJson);
      } catch (err) {
        console.error(`Failed to parse legsJson for job ${jobId}`);
      }
    }

    const pickupTimeStr = legs?.pickupOutbound?.completedAt || legs?.pickupInbound?.completedAt;
    const deliveryTimeStr = legs?.deliveryOutbound?.completedAt || legs?.deliveryInbound?.completedAt;

    const pickupTime = pickupTimeStr ? new Date(pickupTimeStr) : null;
    const deliveryTime = deliveryTimeStr ? new Date(deliveryTimeStr) : null;

    const hasDeliveryRider = !!(legs?.deliveryOutbound?.riderId || job.deliveryRiderId);
    const isDeliveryCompleted = legs?.deliveryOutbound?.status === 'completed' || job.status === 'completed';

    const jobAnalysis: any = {
      jobId,
      status: job.status,
      type: job.type,
      pickupTime,
      deliveryTime,
      hasDeliveryRider,
      isDeliveryCompleted,
      files: [],
    };

    for (const f of filesList) {
      const imgTime = f.timeCreated;
      
      const diffPickup = pickupTime ? Math.abs(imgTime.getTime() - pickupTime.getTime()) : Infinity;
      const diffDelivery = deliveryTime ? Math.abs(imgTime.getTime() - deliveryTime.getTime()) : Infinity;

      const diffPickupMin = diffPickup !== Infinity ? diffPickup / (60 * 1000) : null;
      const diffDeliveryMin = diffDelivery !== Infinity ? diffDelivery / (60 * 1000) : null;

      let classification = 'unknown';
      let reason = '';

      const isCloseToPickup = diffPickupMin !== null && diffPickupMin <= 10; // Within 10 minutes
      const isCloseToDelivery = diffDeliveryMin !== null && diffDeliveryMin <= 10;

      // Hypothesis: No delivery rider and delivery not completed, but image time is NOT close to pickup time -> delivery
      const conditionDeliverySpecial = (!hasDeliveryRider && !isDeliveryCompleted && !isCloseToPickup);

      if (diffPickupMin !== null && isCloseToPickup && (diffDeliveryMin === null || diffPickup < diffDelivery)) {
        classification = 'pickup';
        reason = `Close to pickup time (${diffPickupMin.toFixed(2)} mins)`;
      } else if (diffDeliveryMin !== null && isCloseToDelivery) {
        classification = 'delivery';
        reason = `Close to delivery time (${diffDeliveryMin.toFixed(2)} mins)`;
      } else if (conditionDeliverySpecial) {
        classification = 'delivery';
        reason = `Special rule: No delivery rider, delivery not completed, and GCS time is NOT close to pickup time (${diffPickupMin !== null ? diffPickupMin.toFixed(2) + ' mins' : 'N/A'})`;
      } else if (diffPickupMin !== null && (diffDeliveryMin === null || diffPickup < diffDelivery)) {
        // Fallback for when it is closest to pickup but outside 10 mins (maybe we still classify as pickup? Or delivery?)
        // Let's see how many fallback cases we have.
        classification = 'pickup_fallback_out_of_range';
        reason = `Closest to pickup, but time diff is ${diffPickupMin.toFixed(2)} mins (greater than 10 mins)`;
      } else if (diffDeliveryMin !== null) {
        classification = 'delivery';
        reason = `Closest to delivery, but time diff is ${diffDeliveryMin.toFixed(2)} mins (greater than 10 mins)`;
      } else {
        classification = 'delivery_default';
        reason = `No completed leg timestamps match. Defaults to delivery.`;
      }

      jobAnalysis.files.push({
        path: f.path,
        url: f.url,
        timeCreated: imgTime,
        diffPickupMin,
        diffDeliveryMin,
        classification,
        reason,
      });

      if (classification === 'pickup') totalPickup++;
      else if (classification.startsWith('delivery')) totalDelivery++;
      else totalUnknown++;
    }

    report.push(jobAnalysis);
  }

  // Print results for key jobs
  const keyJobs = ['2026000866', '2026000864'];
  console.log('\n--- KEY JOBS RESULTS ---');
  report.filter(r => keyJobs.includes(r.jobId)).forEach(r => {
    console.log(`\nJob ${r.jobId} [Type: ${r.type}, Status: ${r.status}]`);
    console.log(`  Pickup Time: ${r.pickupTime?.toISOString() || 'N/A'}`);
    console.log(`  Delivery Time: ${r.deliveryTime?.toISOString() || 'N/A'}`);
    console.log(`  Has Delivery Rider: ${r.hasDeliveryRider}, Completed: ${r.isDeliveryCompleted}`);
    
    r.files.forEach((f: any) => {
      console.log(`  - File: ${f.path}`);
      console.log(`    Time Created: ${f.timeCreated.toISOString()}`);
      console.log(`    Diff Pickup: ${f.diffPickupMin !== null ? f.diffPickupMin.toFixed(2) + ' m' : 'N/A'}`);
      console.log(`    Diff Delivery: ${f.diffDeliveryMin !== null ? f.diffDeliveryMin.toFixed(2) + ' m' : 'N/A'}`);
      console.log(`    ==> Classification: ${f.classification}`);
      console.log(`    Reason: ${f.reason}`);
    });
  });

  console.log('\n--- STATS SUMMARY ---');
  console.log(`Total Pickup Proofs: ${totalPickup}`);
  console.log(`Total Delivery Proofs: ${totalDelivery}`);
  console.log(`Total Unclassified (unknown): ${totalUnknown}`);
  
  // Count how many fallbacks
  let totalPickupFallback = 0;
  report.forEach(r => {
    r.files.forEach((f: any) => {
      if (f.classification === 'pickup_fallback_out_of_range') totalPickupFallback++;
    });
  });
  console.log(`Total Pickup Fallback (Out of Range): ${totalPickupFallback}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
