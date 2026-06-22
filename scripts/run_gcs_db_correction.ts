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
  console.log('=== Database & GCS Correction Script Started ===');
  console.log(`Using Database: ${process.env.DATABASE_URL?.substring(0, 45)}...`);
  console.log(`Using GCS Bucket: ${bucketName}`);

  // 1. Fetch files from GCS
  console.log('Listing proof files from GCS...');
  const [files] = await storage.bucket(bucketName).getFiles({
    prefix: 'jobs/',
  });

  const proofFiles = files.filter(f => f.name.includes('/proofs') || f.name.includes('/proofs-'));
  console.log(`Found ${proofFiles.length} proof files in GCS.`);

  // 2. Group GCS files by Job ID
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
  console.log(`Unique Job IDs to process: ${jobIds.length}`);

  // 3. Fetch all these jobs from DB
  const jobs = await prisma.job.findMany({
    where: { id: { in: jobIds } }
  });

  const jobMap = new Map<string, any>();
  jobs.forEach(j => jobMap.set(j.id, j));
  console.log(`Found ${jobs.length} jobs in database.`);

  let totalJobsUpdated = 0;
  let totalPickupImages = 0;
  let totalDeliveryImages = 0;
  let jobsReclassified = 0; // Jobs that actually changed fields

  console.log('\nProcessing updates...');

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

    const pickupUrls: string[] = [];
    const deliveryUrls: string[] = [];

    for (const f of filesList) {
      const imgTime = f.timeCreated;
      const diffPickup = pickupTime ? Math.abs(imgTime.getTime() - pickupTime.getTime()) : Infinity;
      const diffDelivery = deliveryTime ? Math.abs(imgTime.getTime() - deliveryTime.getTime()) : Infinity;

      const diffPickupMin = diffPickup !== Infinity ? diffPickup / (60 * 1000) : null;
      const diffDeliveryMin = diffDelivery !== Infinity ? diffDelivery / (60 * 1000) : null;

      const isCloseToPickup = diffPickupMin !== null && diffPickupMin <= 10;
      const isCloseToDelivery = diffDeliveryMin !== null && diffDeliveryMin <= 10;

      // Logic classification
      const conditionDeliverySpecial = (!hasDeliveryRider && !isDeliveryCompleted && !isCloseToPickup);

      let classification = 'delivery'; // Default fallback

      if (diffPickupMin !== null && isCloseToPickup && (diffDeliveryMin === null || diffPickup < diffDelivery)) {
        classification = 'pickup';
      } else if (diffDeliveryMin !== null && isCloseToDelivery) {
        classification = 'delivery';
      } else if (conditionDeliverySpecial) {
        classification = 'delivery';
      } else if (diffPickupMin !== null && (diffDeliveryMin === null || diffPickup < diffDelivery) && diffPickupMin <= 720) {
        // Fallback for pickup within 12 hours (e.g. offline rider uploading later)
        classification = 'pickup';
      } else if (diffDeliveryMin !== null) {
        classification = 'delivery';
      }

      if (classification === 'pickup') {
        pickupUrls.push(f.url);
        totalPickupImages++;
      } else {
        deliveryUrls.push(f.url);
        totalDeliveryImages++;
      }
    }

    const finalPickupValue = pickupUrls.length > 0 ? JSON.stringify(pickupUrls) : null;
    const finalDeliveryValue = deliveryUrls.length > 0 ? JSON.stringify(deliveryUrls) : null;
    const finalProofValue = deliveryUrls.length > 0 ? JSON.stringify(deliveryUrls) : null;

    // Check if the new values differ from current DB values
    const hasChanges = 
      job.pickupProofImageUrl !== finalPickupValue ||
      job.deliveryProofImageUrl !== finalDeliveryValue ||
      job.proofImageUrl !== finalProofValue;

    if (hasChanges) {
      jobsReclassified++;
      
      // Update in DB
      await prisma.job.update({
        where: { id: jobId },
        data: {
          pickupProofImageUrl: finalPickupValue,
          deliveryProofImageUrl: finalDeliveryValue,
          proofImageUrl: finalProofValue,
        }
      });

      console.log(`✅ Job ${jobId} updated:`);
      console.log(`   Before -> Pickup: ${job.pickupProofImageUrl || 'null'}, Delivery: ${job.deliveryProofImageUrl || 'null'}`);
      console.log(`   After  -> Pickup: ${finalPickupValue || 'null'}, Delivery: ${finalDeliveryValue || 'null'}`);
      
      totalJobsUpdated++;
    }
  }

  console.log('\n=== RUN SUMMARY ===');
  console.log(`Total jobs processed: ${jobIds.length}`);
  console.log(`Total jobs updated (reclassified): ${jobsReclassified}`);
  console.log(`Total GCS images classified: ${proofFiles.length}`);
  console.log(`  - Pickup Proof Images: ${totalPickupImages}`);
  console.log(`  - Delivery Proof Images: ${totalDeliveryImages}`);
  console.log(`Database update completed successfully!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
