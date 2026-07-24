const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/tls_test";
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Querying Customer K.อ๊อบ...");
  const res = await client.query('SELECT * FROM "Customer" WHERE id = \'8f1ac2eb-e333-4eb8-9129-da016ab11bb7\';');
  console.log("Customer details:", JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);
