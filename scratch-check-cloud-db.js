const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_staging";
  const client = new Client({ connectionString });
  
  console.log('Connecting to Cloud SQL (tls_staging)...');
  await client.connect();
  
  console.log('Listing tables and counting records:');
  const tables = ['AdminUser', 'Customer', 'ShopLocation', 'Job', 'ServiceItem'];
  for (const table of tables) {
    try {
      const countRes = await client.query(`SELECT COUNT(*) FROM "${table}";`);
      console.log(`- Table "${table}": ${countRes.rows[0].count} rows`);
      
      if (parseInt(countRes.rows[0].count) > 0) {
        if (table === 'AdminUser') {
          const sample = await client.query(`SELECT id, email, name, role FROM "${table}" LIMIT 3;`);
          console.log(`  Sample AdminUsers:`, sample.rows);
        } else if (table === 'Customer') {
          const sample = await client.query(`SELECT id, name, phone FROM "${table}" LIMIT 3;`);
          console.log(`  Sample Customers:`, sample.rows);
        } else if (table === 'ShopLocation') {
          const sample = await client.query(`SELECT id, name FROM "${table}" LIMIT 3;`);
          console.log(`  Sample ShopLocations:`, sample.rows);
        }
      }
    } catch (e) {
      console.log(`- Table "${table}" error: ${e.message}`);
    }
  }
  
  await client.end();
}

main().catch(console.error);
