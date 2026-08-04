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

const customerIds = [
  'efef6529-79f2-42e8-bd80-8f9eadca142e', // โมโมเอะ
  '20253af3-5f71-458b-a10c-fb02fe67ce55', // TYD
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    // Also let's find the customer for job 2026000927
    const jobRes = await client.query('SELECT "customerId", "customerName", "customerPhone" FROM "Job" WHERE id = \'2026000927\'');
    let job927CustId = null;
    if (jobRes.rows.length > 0) {
      job927CustId = jobRes.rows[0].customerId;
      console.log(`Job 2026000927 Customer details in Job table: Name="${jobRes.rows[0].customerName}", Phone="${jobRes.rows[0].customerPhone}", ID="${job927CustId}"`);
    }

    const allCustIds = [...customerIds];
    if (job927CustId) allCustIds.push(job927CustId);

    console.log('\n--- CUSTOMERS INFO ---');
    for (const custId of allCustIds) {
      const custRes = await client.query('SELECT * FROM "Customer" WHERE id = $1', [custId]);
      if (custRes.rows.length === 0) {
        console.log(`Customer with ID ${custId} not found.`);
        continue;
      }
      const cust = custRes.rows[0];
      console.log(`\nCustomer ID: ${cust.id}`);
      console.log(`  Name: ${cust.name}`);
      console.log(`  Phone: ${cust.phone}`);
      console.log(`  Credit Balance: ฿${cust.creditBalance}`);
      console.log(`  Is Member: ${cust.isMember} | VIP: ${cust.isVIP} | Corporate: ${cust.isCorporate}`);
      console.log(`  Default Address: ${cust.defaultAddress}`);
      console.log(`  Remark: ${cust.remark}`);
    }

  } catch (err) {
    console.error('Error during query:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
