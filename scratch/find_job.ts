import { PrismaClient } from '@prisma/client';

async function run() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: prodUrl });

  try {
    console.log('Searching in Production for job 2026000226...');
    const job = await prisma.job.findUnique({
      where: { id: '2026000226' }
    });

    if (job) {
      console.log('--- FOUND JOB ---');
      console.log(JSON.stringify(job, null, 2));

      if (job.deliveryProofImageUrl) {
        console.log('\n--- ANALYZING DELIVERY PROOF URL TIMESTAMPS ---');
        try {
          const urls = JSON.parse(job.deliveryProofImageUrl);
          if (Array.isArray(urls)) {
            urls.forEach((url, index) => {
              // Extract timestamp from filename, e.g., img-1779529226347.jpg
              const match = url.match(/img-(\d+)\.jpg/);
              if (match && match[1]) {
                const ts = parseInt(match[1], 10);
                console.log(`Proof ${index + 1} Image Timestamp: ${new Date(ts).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (${new Date(ts).toISOString()})`);
              } else {
                console.log(`Proof ${index + 1}: ${url} (could not parse timestamp)`);
              }
            });
          }
        } catch (e: any) {
          console.log('Could not parse deliveryProofImageUrl as JSON array:', e.message);
        }
      }
    } else {
      console.log('Job 2026000226 not found.');
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
