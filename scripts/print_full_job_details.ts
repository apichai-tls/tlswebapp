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
      console.log(`=== FULL DETAIL FOR JOB ID: ${jobId} ===`);
      console.log(`=============================================`);
      const jobRes = await client.query('SELECT * FROM "Job" WHERE id = $1', [jobId]);
      if (jobRes.rows.length > 0) {
        console.log(JSON.stringify(jobRes.rows[0], null, 2));
      } else {
        console.log('Not found');
      }
    }
  } catch (err) {
    console.error('Error during query:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
