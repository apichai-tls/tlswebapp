import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { Storage } from '@google-cloud/storage';

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

const prodPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'sslmode=no-verify',
    }
  }
});

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const bucketName = process.env.GCS_BUCKET_NAME || 'tls-images-prod';

async function generateForJob(targetId: string) {
  console.log(`\n=== GENERATING VIA LOCAL SERVER FOR JOB #${targetId} ===`);
  const job = await prodPrisma.job.findUnique({
    where: { id: targetId },
    include: { branch: true }
  });

  if (!job) {
    throw new Error(`Job #${targetId} not found on Prod DB`);
  }

  const customer = job.customerId
    ? await prodPrisma.customer.findUnique({
        where: { id: job.customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          isMember: true,
          memberId: true,
          creditBalance: true,
        }
      })
    : null;

  const currentRev = (job as any).proformaRevision || 0;
  // If cart total changed from prior proforma, bump revision
  const newRev = Math.max(1, currentRev + 1);

  const payload = {
    job: {
      ...job,
      proformaRevision: newRev,
    },
    customer,
    branch: job.branch,
  };
  const base64Data = Buffer.from(JSON.stringify(payload)).toString('base64');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1200 },
    deviceScaleFactor: 2,
  });

  // 1. Receipt
  const receiptUrl = `http://localhost:3000/tools/receipt-preview?data=${encodeURIComponent(base64Data)}&isDraft=false`;
  console.log(`Navigating to Local Server Receipt: ${receiptUrl.substring(0, 80)}...`);
  await page.goto(receiptUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#receipt-capture-container', { state: 'visible' });
  await page.waitForTimeout(800);

  const receiptEl = await page.$('#receipt-capture-container');
  if (!receiptEl) throw new Error("Could not find #receipt-capture-container");

  const receiptBuffer = await receiptEl.screenshot({ type: 'png' });
  const receiptLocalPath = path.join(
    'C:/Users/ASUS/.gemini/antigravity/brain/3ecbe04d-4538-47ed-ab3e-7751ac104515',
    `receipt_${targetId}_local_server.png`
  );
  fs.writeFileSync(receiptLocalPath, receiptBuffer);
  console.log(`✔ Saved receipt to: ${receiptLocalPath}`);

  // 2. Proforma (New Revision)
  const proformaUrl = `http://localhost:3000/tools/receipt-preview?data=${encodeURIComponent(base64Data)}&isDraft=true`;
  console.log(`Navigating to Local Server Proforma Rev ${newRev}...`);
  await page.goto(proformaUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#receipt-capture-container', { state: 'visible' });
  await page.waitForTimeout(800);

  const proformaEl = await page.$('#receipt-capture-container');
  if (!proformaEl) throw new Error("Could not find #receipt-capture-container for proforma");

  const proformaBuffer = await proformaEl.screenshot({ type: 'png' });
  const proformaLocalPath = path.join(
    'C:/Users/ASUS/.gemini/antigravity/brain/3ecbe04d-4538-47ed-ab3e-7751ac104515',
    `proforma_${targetId}_rev${newRev}_local_server.png`
  );
  fs.writeFileSync(proformaLocalPath, proformaBuffer);
  console.log(`✔ Saved proforma to: ${proformaLocalPath}`);

  await browser.close();

  // 3. Upload to GCS
  const bucket = storage.bucket(bucketName);

  // A. Upload Receipt (today's folder)
  const gcsReceiptPathToday = `jobs/2026/10/07/${targetId}/proofs/receipt-${targetId}.png`;
  await bucket.file(gcsReceiptPathToday).save(receiptBuffer, {
    contentType: 'image/png',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=60' },
  });
  const publicReceiptUrl = `https://storage.googleapis.com/${bucketName}/${gcsReceiptPathToday}`;
  console.log(`✔ Uploaded Receipt to GCS: ${publicReceiptUrl}`);

  // B. Overwrite old receipt (if any)
  const gcsReceiptPathYesterday = `jobs/2026/10/06/${targetId}/proofs/receipt-${targetId}.png`;
  await bucket.file(gcsReceiptPathYesterday).save(receiptBuffer, {
    contentType: 'image/png',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=60' },
  }).catch(() => {});

  // C. Upload Proforma (New Revision)
  const gcsProformaPath = `jobs/2026/10/07/${targetId}/proofs/proforma-PR-${targetId}-rev${newRev}.png`;
  await bucket.file(gcsProformaPath).save(proformaBuffer, {
    contentType: 'image/png',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=60' },
  });
  const publicProformaUrl = `https://storage.googleapis.com/${bucketName}/${gcsProformaPath}`;
  console.log(`✔ Uploaded Proforma Rev ${newRev} to GCS: ${publicProformaUrl}`);

  // D. Overwrite old Proforma rev0 so old link also shows correct total
  const gcsProformaRev0 = `jobs/2026/10/07/${targetId}/proofs/proforma-PR-${targetId}-rev0.png`;
  await bucket.file(gcsProformaRev0).save(proformaBuffer, {
    contentType: 'image/png',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=60' },
  }).catch(() => {});

  // 4. Update Database on Prod
  let currentBills: string[] = [];
  try {
    if (job.billImageUrl) {
      const parsed = JSON.parse(job.billImageUrl);
      currentBills = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {}

  const filteredBills = currentBills.filter(u => 
    typeof u === 'string' &&
    !u.includes(`receipt-${targetId}.png`) &&
    !u.includes(`proforma-PR-${targetId}-rev`) &&
    !u.includes('proforma-DRAFT') &&
    !u.includes('/DRAFT/')
  );

  const updatedBills = [
    publicReceiptUrl,
    publicProformaUrl,
    ...filteredBills,
  ];

  await prodPrisma.job.update({
    where: { id: targetId },
    data: {
      proformaRevision: newRev,
      billImageUrl: JSON.stringify(updatedBills),
    },
  });
  console.log(`✔ Updated Job #${targetId} on Prod DB successfully!`);

  await prodPrisma.activityLog.create({
    data: {
      entityId: targetId,
      entityType: 'job',
      action: 'UPDATE_JOB',
      details: JSON.stringify({
        reason: `Regenerate Proforma Rev ${newRev} to match finalized Receipt ฿${job.totalAmount}`,
        newReceiptUrl: publicReceiptUrl,
        newProformaUrl: publicProformaUrl,
        proformaRevision: newRev,
        totalAmount: job.totalAmount,
      }),
      userId: 'system_hotfix',
      userName: 'Local Server Generator',
    },
  });
  console.log("✔ ActivityLog recorded on Prod!");
}

async function main() {
  const jobId = process.argv[2] || '2026005139';
  await generateForJob(jobId);
}

main().catch(console.error).finally(() => prodPrisma.$disconnect());
