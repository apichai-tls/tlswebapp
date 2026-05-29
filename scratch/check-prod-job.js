const { Client } = require('pg');

const connectionString = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres";

async function main() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  await client.connect();
  console.log("Connected to production database with SSL.");

  // Let's search for jobs where ID contains '2026000300'
  console.log("Searching for jobs with '2026000300'...");
  const res = await client.query(
    "SELECT * FROM \"Job\" WHERE \"id\" = $1 OR \"id\" LIKE $2 OR \"customerPhone\" LIKE $2 LIMIT 10",
    ['2026000300', '%2026000300%']
  );

  console.log(`Found ${res.rows.length} jobs:`);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);
