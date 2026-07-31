import { Client } from 'pg';

const connectionString = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432';

async function main() {
  const webClient = new Client({
    connectionString: `${connectionString}/tls_web_test`,
    ssl: { rejectUnauthorized: false }
  });
  const prodClient = new Client({
    connectionString: `${connectionString}/postgres`,
    ssl: { rejectUnauthorized: false }
  });

  await webClient.connect();
  await prodClient.connect();

  try {
    // 1. Inspect "Member" table in tls_web_test
    console.log('🔍 Columns of "Member" in tls_web_test:');
    const memberCols = await webClient.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'Member' AND table_schema = 'public'`
    );
    memberCols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

    // 2. Inspect "Customer" table in postgres
    console.log('\n🔍 Columns of "Customer" in postgres:');
    const customerCols = await prodClient.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'Customer' AND table_schema = 'public'`
    );
    customerCols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

  } catch (err: any) {
    console.error('❌ Error inspecting columns:', err.message);
  } finally {
    await webClient.end();
    await prodClient.end();
  }
}

main().catch(console.error);
