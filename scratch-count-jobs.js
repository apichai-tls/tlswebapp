const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/tls_test";
  const client = new Client({ connectionString });
  await client.connect();

  const res = await client.query('SELECT COUNT(*) FROM "Job";');
  console.log("Total Jobs:", res.rows[0].count);

  const jobs = await client.query('SELECT id, status, "isPaid", "customerId" FROM "Job" LIMIT 5;');
  console.log("Sample Jobs:", JSON.stringify(jobs.rows, null, 2));

  await client.end();
}

main().catch(console.error);
