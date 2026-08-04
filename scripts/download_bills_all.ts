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

async function main() {
  const destDir = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\d726a6e4-7f6a-4925-86f3-d18241837db3';
  
  const filesToDownload = [
    { gcs: 'jobs/2026/06/22/2026000893/bills/img-1782125816895.jpg', local: 'bill_893.jpg' },
    { gcs: 'jobs/2026/06/12/2026000436/bills/img-1781257925980.jpg', local: 'bill_436.jpg' }
  ];
  
  for (const item of filesToDownload) {
    const destPath = path.join(destDir, item.local);
    console.log(`Downloading gs://${bucketName}/${item.gcs} to ${destPath}...`);
    try {
      await storage.bucket(bucketName).file(item.gcs).download({
        destination: destPath
      });
      console.log(`✅ Download of ${item.local} completed successfully!`);
    } catch (err) {
      console.error(`❌ Failed to download ${item.local}:`, err);
    }
  }
}

main().catch(console.error);
