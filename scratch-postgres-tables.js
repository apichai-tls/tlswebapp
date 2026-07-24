const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/tls_test";
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Listing tables in tls_test database:");
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  for (const row of res.rows) {
    const tableName = row.table_name;
    const countRes = await client.query(`SELECT COUNT(*) FROM "${tableName}";`);
    console.log(`- Table: ${tableName}, Row Count: ${countRes.rows[0].count}`);
  }

  await client.end();
}

main().catch(console.error);
