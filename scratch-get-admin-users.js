const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/tls_test";
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Admin Users:");
  const res = await client.query('SELECT id, email, password, role FROM "AdminUser";');
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);
