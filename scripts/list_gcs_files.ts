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

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const bucketName = process.env.GCS_BUCKET_NAME || 'tls-images-prod';

async function main() {
  console.log(`Listing proof files in bucket: ${bucketName}...`);
  const [files] = await storage.bucket(bucketName).getFiles({
    prefix: 'jobs/',
  });

  const proofFiles = files.filter(f => f.name.includes('/proofs') || f.name.includes('/proofs-'));
  console.log(`Found ${proofFiles.length} proof files under jobs/`);
  
  const jobFilesMap: Record<string, any[]> = {};
  
  proofFiles.forEach(file => {
    const parts = file.name.split('/');
    if (parts.length >= 5) {
      const jobId = parts[4];
      if (!jobFilesMap[jobId]) {
        jobFilesMap[jobId] = [];
      }
      jobFilesMap[jobId].push({
        name: file.name,
        timeCreated: file.metadata.timeCreated,
        size: file.metadata.size,
      });
    }
  });

  console.log('\n--- GCS Proof Files Summary ---');
  for (const [jobId, list] of Object.entries(jobFilesMap)) {
    console.log(`Job ID: ${jobId} (${list.length} files)`);
    list.forEach(f => {
      console.log(`  - Path: ${f.name}`);
      console.log(`    Created: ${f.timeCreated}`);
    });
  }
}

main().catch(console.error);
