const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const cloudUrl = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres";
const localUrl = "postgresql://postgres:123456@localhost:5432/tls_test";

const itemsBackupFile = path.join(__dirname, "image_service_items.json");
const priceListsBackupFile = path.join(__dirname, "image_price_lists.json");

async function main() {
  console.log('=== Starting Dedicated Database Restoration Process ===');
  
  const cloudClient = new Client({ connectionString: cloudUrl, ssl: { rejectUnauthorized: false } });
  const localClient = new Client({ connectionString: localUrl });

  try {
    console.log('Connecting to Production and Local databases...');
    await cloudClient.connect();
    await localClient.connect();
    console.log('Connected successfully!');

    // 1. Wipe local tables
    console.log('Truncating all tables in local database (tls_test)...');
    await localClient.query(`
      TRUNCATE TABLE 
        "RiderTransaction", 
        "Rider", 
        "Job", 
        "CashierShift", 
        "AdminUser", 
        "Customer", 
        "ShopLocation", 
        "ServiceItem", 
        "PriceList", 
        "POI", 
        "Setting", 
        "ActivityLog" 
      CASCADE;
    `);
    console.log('Wiped local tables.');

    // 2. Helper to sync reference data
    async function syncTable(tableName) {
      console.log(`Syncing table "${tableName}" from Cloud DB...`);
      const res = await cloudClient.query(`SELECT * FROM "${tableName}"`);
      const rows = res.rows;
      console.log(`- Retrieved ${rows.length} rows.`);
      
      if (rows.length === 0) return;

      const cols = Object.keys(rows[0]);
      const colNames = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = cols.map(c => {
          const val = row[c];
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            if (Array.isArray(val)) {
              return val;
            }
            return JSON.stringify(val);
          }
          return val;
        });
        await localClient.query(query, values);
      }
      console.log(`- Restored ${rows.length} rows to "${tableName}".`);
    }

    // 3. Sync reference tables from Production
    const tablesToSync = [
      'ShopLocation',
      'Customer',
      'Setting',
      'POI',
      'AdminUser',
      'Rider',
      'CashierShift',
      'ActivityLog'
    ];

    for (const table of tablesToSync) {
      await syncTable(table);
    }

    // 4. Restore custom Categories & Items from local backup
    console.log('Restoring custom Category/Items configuration...');
    if (!fs.existsSync(itemsBackupFile)) {
      throw new Error(`Backup file not found at: ${itemsBackupFile}`);
    }
    const items = JSON.parse(fs.readFileSync(itemsBackupFile, 'utf8'));
    console.log(`- Loaded ${items.length} items from: ${itemsBackupFile}`);
    
    if (items.length > 0) {
      const cols = Object.keys(items[0]);
      const colNames = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO "ServiceItem" (${colNames}) VALUES (${placeholders})`;
      
      for (const item of items) {
        const values = cols.map(c => item[c]);
        await localClient.query(query, values);
      }
      console.log(`- Inserted ${items.length} custom service items.`);
    }

    // 5. Restore custom PriceLists from local backup
    console.log('Restoring custom Price Lists configuration...');
    if (!fs.existsSync(priceListsBackupFile)) {
      throw new Error(`Backup file not found at: ${priceListsBackupFile}`);
    }
    const priceLists = JSON.parse(fs.readFileSync(priceListsBackupFile, 'utf8'));
    console.log(`- Loaded ${priceLists.length} price lists.`);

    if (priceLists.length > 0) {
      const cols = Object.keys(priceLists[0]);
      const colNames = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO "PriceList" (${colNames}) VALUES (${placeholders})`;

      for (const pl of priceLists) {
        const values = cols.map(c => {
          const val = pl[c];
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            if (Array.isArray(val)) {
              return val;
            }
            return JSON.stringify(val);
          }
          return val;
        });
        await localClient.query(query, values);
      }
      console.log(`- Inserted ${priceLists.length} custom price lists.`);
    }

    console.log('\n=== Restoration Completed Successfully! ===');

  } catch (err) {
    console.error('An error occurred during database restoration:', err);
  } finally {
    await cloudClient.end();
    await localClient.end();
  }
}

main();
