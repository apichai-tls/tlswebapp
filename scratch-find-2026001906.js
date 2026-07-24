const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/tls_test";
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Querying Local Job 2026001906...");
  const jobRes = await client.query('SELECT * FROM "Job" WHERE id = \'2026001906\';');
  console.log("Local Job 2026001906:", JSON.stringify(jobRes.rows, null, 2));

  console.log("\nQuerying Customer b64213e2-5825-470a-ba98-502cd486234e...");
  const c1 = await client.query('SELECT * FROM "Customer" WHERE id = \'b64213e2-5825-470a-ba98-502cd486234e\';');
  console.log("Customer b64213e2-5825-470a-ba98-502cd486234e:", JSON.stringify(c1.rows, null, 2));

  console.log("\nQuerying Customer for K.อ๊อบ...");
  const cOb = await client.query('SELECT * FROM "Customer" WHERE name = \'K.อ๊อบ\' OR id = \'8f1ac2eb-e333-4eb8-9129-da016ab11bb7\';');
  console.log("Customer K.อ๊อบ:", JSON.stringify(cOb.rows, null, 2));

  await client.end();
}

main().catch(console.error);
