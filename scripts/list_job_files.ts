import * as fs from 'fs';
import * as path from 'path';
import { Storage } from '@google-cloud/storage';

// Load .env.prod manually
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

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const bucketName = process.env.GCS_BUCKET_NAME || 'tls-images-prod';
const jobIds = ['2026000927', '2026000893', '2026000436'];

async function main() {
  console.log(`Listing GCS files in bucket: ${bucketName}...`);
  
  for (const jobId of jobIds) {
    console.log(`\nFiles for Job ${jobId}:`);
    const [files] = await storage.bucket(bucketName).getFiles({
      prefix: `jobs/2026/`,
    });
    
    // Filter files containing the jobId anywhere in their path
    const jobFiles = files.filter(f => f.name.includes(jobId));
    if (jobFiles.length === 0) {
      console.log('No files found.');
    } else {
      jobFiles.forEach(f => {
        console.log(`  - ${f.name} (Created: ${f.metadata.timeCreated}, Size: ${f.metadata.size} bytes)`);
      });
    }
  }
}

main().catch(console.error);
