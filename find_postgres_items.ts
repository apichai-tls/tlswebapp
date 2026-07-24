// @ts-nocheck
import { Client } from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/postgres";
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Fetching list of all databases...");
  const dbResult = await client.query("SELECT datname FROM pg_database WHERE datistemplate = false;");
  const databases = dbResult.rows.map(r => r.datname);
  console.log("Databases found:", databases);

  await client.end();

  for (const dbName of databases) {
    if (dbName === 'postgres' || dbName === 'system' || dbName === 'template1') continue;
    console.log(`Checking database: ${dbName}...`);
    const dbClient = new Client({ connectionString: `postgresql://postgres:123456@localhost:5432/${dbName}` });
    try {
      await dbClient.connect();
      // Check if ServiceItem table exists
      const tableCheck = await dbClient.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'ServiceItem'
        );
      `);
      const exists = tableCheck.rows[0].exists;
      if (exists) {
        const countRes = await dbClient.query('SELECT COUNT(*) FROM "ServiceItem";');
        const count = parseInt(countRes.rows[0].count);
        console.log(`  Table "ServiceItem" exists. Row count: ${count}`);
        if (count > 10) {
          const items = await dbClient.query('SELECT * FROM "ServiceItem" LIMIT 5;');
          console.log(`  Sample items:`, items.rows);
          
          // Dump all items if count is around 94
          const allItems = await dbClient.query('SELECT * FROM "ServiceItem";');
          console.log(`FOUND_ALL_ITEMS_IN_${dbName}`);
          console.log(JSON.stringify(allItems.rows, null, 2));
          console.log(`END_ALL_ITEMS_IN_${dbName}`);
        }
      } else {
        console.log(`  Table "ServiceItem" does not exist.`);
      }
    } catch (err) {
      console.error(`  Error checking ${dbName}:`, err);
    } finally {
      await dbClient.end();
    }
  }
}

main().catch(console.error);
