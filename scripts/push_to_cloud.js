const { Client } = require('pg');

const localUrl = "postgresql://postgres:123456@localhost:5432/tls_test";
const cloudUrl = "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test";

async function main() {
  console.log('=== Pushing Data from Local to Cloud Run Test DB (FAST BATCH) ===');
  
  const localClient = new Client({ connectionString: localUrl });
  const cloudClient = new Client({ connectionString: cloudUrl, ssl: { rejectUnauthorized: false } });

  try {
    await localClient.connect();
    await cloudClient.connect();
    
    console.log('Truncating cloud tables...');
    await cloudClient.query(`
      TRUNCATE TABLE 
        "RiderTransaction", "Rider", "Job", "CashierShift", 
        "AdminUser", "Customer", "ShopLocation", "ServiceItem", 
        "PriceList", "POI", "Setting", "ActivityLog" 
      CASCADE;
    `);

    async function syncTable(tableName) {
      console.log(`Syncing table "${tableName}"...`);
      
      const cloudColsRes = await cloudClient.query(`
        SELECT column_name, column_default, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);
      const cloudCols = cloudColsRes.rows;
      
      const localColsRes = await localClient.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);
      const localCols = localColsRes.rows.map(r => r.column_name);

      const res = await localClient.query(`SELECT * FROM "${tableName}"`);
      const rows = res.rows;
      if (rows.length === 0) return;

      // We only insert columns that exist locally.
      // For columns that exist on Cloud but NOT locally:
      // If it's NOT NULL and NO DEFAULT, we MUST supply a fake value or it crashes!
      const columnsToInsert = [];
      const extraDefaults = {};
      
      for (const cc of cloudCols) {
         if (localCols.includes(cc.column_name)) {
            columnsToInsert.push(cc.column_name);
         } else {
            // Missing locally!
            if (cc.is_nullable === 'NO' && cc.column_default === null) {
               console.log(`Warning: Column ${cc.column_name} is NOT NULL with NO DEFAULT. Supplying fake value.`);
               // Hacky defaults based on column name/type
               if (cc.column_name.includes('Date') || cc.column_name.includes('At')) {
                  extraDefaults[cc.column_name] = new Date();
               } else if (cc.column_name.includes('Id')) {
                  extraDefaults[cc.column_name] = null; // Will crash if truly not null, but let's hope
               } else if (cc.column_name.toLowerCase().includes('is') || cc.column_name.toLowerCase().includes('force')) {
                  extraDefaults[cc.column_name] = false;
               } else {
                  extraDefaults[cc.column_name] = '';
               }
               columnsToInsert.push(cc.column_name);
            }
         }
      }

      const colNames = columnsToInsert.map(c => `"${c}"`).join(', ');
      
      // Batch insert logic
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
         const batch = rows.slice(i, i + BATCH_SIZE);
         let placeholders = [];
         let flatValues = [];
         let vIndex = 1;
         
         for (const row of batch) {
            let rowPlaceholders = [];
            for (const col of columnsToInsert) {
               let val = row[col];
               if (val === undefined) {
                  val = extraDefaults[col]; // use our fake default
               }
               if (val !== null && val !== undefined && typeof val === 'object' && !(val instanceof Date)) {
                  val = Array.isArray(val) ? val : JSON.stringify(val);
               }
               flatValues.push(val);
               rowPlaceholders.push(`$${vIndex++}`);
            }
            placeholders.push(`(${rowPlaceholders.join(', ')})`);
         }
         
         const query = `INSERT INTO "${tableName}" (${colNames}) VALUES ${placeholders.join(', ')}`;
         await cloudClient.query(query, flatValues);
      }
      
      console.log(`- Restored ${rows.length} rows to "${tableName}".`);
    }

    const tablesToSync = [
      'ShopLocation', 'Customer', 'Setting', 'POI', 'AdminUser',
      'Rider', 'CashierShift', 'ActivityLog', 'ServiceItem', 'PriceList', 'Job'
    ];

    for (const table of tablesToSync) {
      await syncTable(table);
    }

    console.log('\\n=== Push Completed Successfully! ===');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await cloudClient.end();
    await localClient.end();
  }
}

main();
