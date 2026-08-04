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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log('Connecting to:', connectionString?.substring(0, 45) + '...');
  
  const client = new Client({ 
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  await client.connect();

  try {
    // 1. Check Job table columns
    console.log('\n--- 1. Checking columns of Job table ---');
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Job'
    `);
    console.log('Columns in Job table:');
    const colNames = colsRes.rows.map(r => r.column_name);
    console.log(colNames.join(', '));

    // 2. Query jobs where isStuck = true (if isStuck exists)
    if (colNames.includes('isStuck')) {
      console.log('\n--- 2. Stuck Jobs (isStuck = true) ---');
      const stuckRes = await client.query('SELECT * FROM "Job" WHERE "isStuck" = true ORDER BY "updatedAt" DESC');
      console.log(`Found ${stuckRes.rows.length} stuck jobs:`);
      for (const row of stuckRes.rows) {
        console.log(`Job ID: ${row.id}`);
        console.log(`  Customer: ${row.customerName} (${row.customerPhone})`);
        console.log(`  Type: ${row.type}, Status: ${row.status}, Substatus: ${row.subStatus}`);
        console.log(`  Is Stuck: ${row.isStuck}, Is Paid: ${row.isPaid}`);
        console.log(`  Created: ${row.createdAt}, Updated: ${row.updatedAt}`);
        console.log(`  legsJson: ${row.legsJson}`);
        console.log(`  remark: ${row.remark}`);
        console.log('--------------------------------------');
      }
    } else {
      console.log('\nisStuck column does not exist in Job table.');
    }

    // 3. Check for recently updated jobs
    console.log('\n--- 3. Top 10 Recently Updated Jobs ---');
    const recentRes = await client.query('SELECT id, status, "subStatus", "customerName", "updatedAt" FROM "Job" ORDER BY "updatedAt" DESC LIMIT 10');
    for (const row of recentRes.rows) {
      console.log(`ID: ${row.id} | Status: ${row.status} | SubStatus: ${row.subStatus} | Customer: ${row.customerName} | Updated: ${row.updatedAt}`);
    }

    // 4. Query recent activity logs (if ActivityLog exists)
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tableNames = tablesRes.rows.map(r => r.table_name);
    console.log('\nTables in public schema:', tableNames.join(', '));

    if (tableNames.includes('ActivityLog')) {
      console.log('\n--- 4. Recent Activity Logs ---');
      const logRes = await client.query('SELECT * FROM "ActivityLog" ORDER BY "createdAt" DESC LIMIT 15');
      for (const log of logRes.rows) {
        console.log(`[${log.createdAt}] Entity: ${log.entityType}/${log.entityId} | Action: ${log.action} | User: ${log.userName}`);
        console.log(`  Details: ${log.details}`);
      }
    }

  } catch (err) {
    console.error('Error during query:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
