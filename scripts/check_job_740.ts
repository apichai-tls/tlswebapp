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

const jobId = '2026000740';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    console.log(`=== Querying Job ${jobId} ===`);
    const jobRes = await client.query('SELECT * FROM "Job" WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) {
      console.log('Job not found.');
      return;
    }
    console.log('Job details:');
    console.log(JSON.stringify(jobRes.rows[0], null, 2));

    console.log('\n=== Querying Activity Logs for Job ${jobId} ===');
    const logsRes = await client.query(
      'SELECT * FROM "ActivityLog" WHERE "entityId" = $1 AND "entityType" = \'job\' ORDER BY "createdAt" ASC',
      [jobId]
    );
    console.log(`Found ${logsRes.rows.length} logs:`);
    logsRes.rows.forEach(log => {
      console.log(`[${log.createdAt.toISOString()}] Action: ${log.action} | User: ${log.userName} (${log.userId})`);
      console.log(`  Details: ${log.details}`);
    });

  } catch (err) {
    console.error('Error during query:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
