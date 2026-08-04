import { Client } from 'pg';

const connectionString = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432';

async function inspectDb(dbName: string) {
  const client = new Client({
    connectionString: `${connectionString}/${dbName}`,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`\n🔍 Inspecting Database: "${dbName}"`);
    
    const tablesRes = await client.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       ORDER BY table_name`
    );

    console.log('Tables found:');
    if (tablesRes.rows.length === 0) {
      console.log('  (No tables found)');
    } else {
      tablesRes.rows.forEach(r => console.log(`  - ${r.table_name}`));
    }
  } catch (err: any) {
    console.error(`❌ Error inspecting ${dbName}:`, err.message);
  } finally {
    await client.end();
  }
}

async function main() {
  await inspectDb('tls_web_test');
  await inspectDb('TlsWebNew-JSC');
}

main().catch(console.error);
