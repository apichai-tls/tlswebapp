const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres";
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log("Querying Cloud Job 2026001906...");
  const res = await client.query('SELECT id, "customerId", "customerName", "customerPhone" FROM "Job" WHERE id = \'2026001906\';');
  console.log("Cloud Job:", JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);
