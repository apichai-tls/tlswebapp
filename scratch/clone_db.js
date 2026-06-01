const { Client } = require('pg');

const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres";
const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test";

const tables = [
  "PriceList",
  "POI",
  "Setting",
  "AdminUser",
  "ServiceItem",
  "ShopLocation",
  "Customer",
  "Rider",             // Depends on ShopLocation
  "Job",               // Depends on Customer, ShopLocation
  "RiderTransaction"   // Depends on Rider
];

async function clone() {
  console.log("Connecting to Production database...");
  const prodClient = new Client({ 
    connectionString: prodUrl,
    ssl: { rejectUnauthorized: false }
  });
  await prodClient.connect();
  console.log("Connected to Production database.");

  const data = {};
  for (const table of tables) {
    console.log(`Fetching data from ${table}...`);
    const res = await prodClient.query(`SELECT * FROM "${table}"`);
    data[table] = res.rows;
    console.log(`Fetched ${res.rows.length} rows from ${table}.`);
  }
  await prodClient.end();

  console.log("Connecting to Test database...");
  const testClient = new Client({ 
    connectionString: testUrl,
    ssl: { rejectUnauthorized: false }
  });
  await testClient.connect();
  console.log("Connected to Test database.");

  try {
    const reverseTables = [...tables].reverse();
    for (const table of reverseTables) {
      console.log(`Truncating table ${table}...`);
      await testClient.query(`TRUNCATE TABLE "${table}" CASCADE;`);
    }

    for (const table of tables) {
      const rows = data[table];
      if (rows.length === 0) {
        console.log(`No rows to insert for ${table}.`);
        continue;
      }

      console.log(`Inserting ${rows.length} rows into ${table} in batches...`);
      const columns = Object.keys(rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(', ');

      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        
        const valuePlaceholders = [];
        const values = [];
        
        let paramIdx = 1;
        for (const row of chunk) {
          const rowPlaceholders = [];
          for (const col of columns) {
            rowPlaceholders.push(`$${paramIdx++}`);
            values.push(row[col]);
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        }
        
        const query = `INSERT INTO "${table}" (${colNames}) VALUES ${valuePlaceholders.join(', ')}`;
        await testClient.query(query, values);
      }
      console.log(`Successfully batch inserted data into ${table}.`);
    }

    console.log("Cloning completed successfully!");
  } catch (err) {
    console.error("Error during cloning:", err);
  } finally {
    await testClient.end();
  }
}

clone();
