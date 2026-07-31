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
  const destPath = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\d726a6e4-7f6a-4925-86f3-d18241837db3\\bill_927.jpg';
  const gcsPath = 'jobs/2026/06/23/2026000927/bills/img-1782210087518.jpg';
  
  console.log(`Downloading gs://${bucketName}/${gcsPath} to ${destPath}...`);
  
  try {
    await storage.bucket(bucketName).file(gcsPath).download({
      destination: destPath
    });
    console.log('✅ Download completed successfully!');
  } catch (err) {
    console.error('❌ Failed to download file:', err);
  }
}

main().catch(console.error);
