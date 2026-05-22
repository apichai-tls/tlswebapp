const { Client } = require('pg');

const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres";
const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test";

async function copyTable(prodClient, testClient, tableName) {
  console.log(`Copying table ${tableName}...`);
  const { rows: records } = await prodClient.query(`SELECT * FROM "${tableName}"`);
  console.log(`Found ${records.length} records in Prod.`);

  const { rows: testColumns } = await testClient.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = '${tableName}'
  `);
  const testCols = testColumns.map(c => c.column_name);

  let insertedCount = 0;
  for (const record of records) {
    const colsToInsert = [];
    const valuesToInsert = [];
    const params = [];
    let i = 1;

    for (const [key, value] of Object.entries(record)) {
      if (testCols.includes(key)) {
        colsToInsert.push(`"${key}"`);
        valuesToInsert.push(`$${i}`);
        params.push(value);
        i++;
      }
    }

    // Special logic for Job table
    if (tableName === 'Job' && testCols.includes('laundryTypes') && !Object.keys(record).includes('laundryTypes')) {
      let laundryTypes = null;
      if (record.serviceType === 'wash_iron_fold') {
        laundryTypes = "W,I,F";
      } else if (record.serviceType === 'wash_fold') {
        laundryTypes = "W,F";
      }

      if (laundryTypes) {
        colsToInsert.push('"laundryTypes"');
        valuesToInsert.push(`$${i}`);
        params.push(laundryTypes);
        i++;
      }
    }

    const query = `INSERT INTO "${tableName}" (${colsToInsert.join(', ')}) VALUES (${valuesToInsert.join(', ')})`;
    
    try {
        await testClient.query(query, params);
        insertedCount++;
    } catch(err) {
        console.error(`Failed to insert record into ${tableName}`, record.id, err.message);
    }
  }

  console.log(`Successfully inserted ${insertedCount} records into ${tableName}.\n`);
}

async function main() {
  const prodClient = new Client({ 
      connectionString: prodUrl,
      ssl: { rejectUnauthorized: false }
  });
  const testClient = new Client({ 
      connectionString: testUrl,
      ssl: { rejectUnauthorized: false }
  });

  await prodClient.connect();
  await testClient.connect();

  console.log("Connected to both DBs\n");

  console.log("Deleting existing test data...");
  await testClient.query('DELETE FROM "Job"');
  await testClient.query('DELETE FROM "Customer"');
  console.log("Cleared old data.\n");

  await copyTable(prodClient, testClient, 'Customer');
  await copyTable(prodClient, testClient, 'Job');

  await prodClient.end();
  await testClient.end();
}

main().catch(console.error);
