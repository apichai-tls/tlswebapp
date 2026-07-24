const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/tls_test";
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Finding jobs where customer name in Job does not match Customer name in database...");
  const res = await client.query(`
    SELECT j.id as "jobId", j."customerName" as "jobCustomerName", j."customerPhone" as "jobCustomerPhone", j."customerId", c.name as "customerTableName", c.phone as "customerTablePhone"
    FROM "Job" j
    JOIN "Customer" c ON j."customerId" = c.id
    WHERE j."customerName" != c.name;
  `);

  console.log("Mismatched jobs count:", res.rows.length);
  console.log("Mismatched jobs sample:", JSON.stringify(res.rows.slice(0, 20), null, 2));

  await client.end();
}

main().catch(console.error);
