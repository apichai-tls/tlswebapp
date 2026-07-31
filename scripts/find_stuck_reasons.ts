import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

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

const stuckJobIds = ['2026000927', '2026000893', '2026000436'];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    for (const jobId of stuckJobIds) {
      console.log(`\n=============================================`);
      console.log(`=== JOB ID: ${jobId} ===`);
      console.log(`=============================================`);

      // 1. Fetch current job record
      const jobRes = await client.query('SELECT * FROM "Job" WHERE id = $1', [jobId]);
      if (jobRes.rows.length === 0) {
        console.log(`Job ${jobId} not found in database.`);
        continue;
      }
      const job = jobRes.rows[0];
      console.log('JOB RECORD:');
      console.log(JSON.stringify(job, null, 2));

      // 2. Fetch activity logs for this job
      console.log('\nACTIVITY LOGS:');
      const logsRes = await client.query(
        'SELECT * FROM "ActivityLog" WHERE "entityId" = $1 AND "entityType" = \'job\' ORDER BY "createdAt" ASC',
        [jobId]
      );
      if (logsRes.rows.length === 0) {
        console.log('No activity logs found for this job.');
      } else {
        logsRes.rows.forEach(log => {
          console.log(`[${log.createdAt.toISOString()}] Action: ${log.action} | User: ${log.userName} (${log.userId})`);
          console.log(`  Details: ${log.details}`);
        });
      }

      // 3. Fetch any Rider Transactions for this job
      console.log('\nRIDER TRANSACTIONS:');
      const txRes = await client.query(
        'SELECT * FROM "RiderTransaction" WHERE "jobId" = $1 ORDER BY "createdAt" ASC',
        [jobId]
      );
      if (txRes.rows.length === 0) {
        console.log('No rider transactions found.');
      } else {
        txRes.rows.forEach(tx => {
          console.log(`[${tx.createdAt.toISOString()}] Rider: ${tx.riderId} | Type: ${tx.type} | Amount: ฿${tx.amount} | Detail: ${tx.detail}`);
        });
      }
    }
  } catch (err) {
    console.error('Error during query:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
