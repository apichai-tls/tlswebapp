import { Client } from 'pg';

const connectionString = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const res = await client.query('SELECT * FROM "PriceList" WHERE id = $1', ['PL-MP56NWKW']);
    if (res.rows.length > 0) {
      console.log('✅ PriceList ID "PL-MP56NWKW" exists in Database!');
      console.log('Details:', res.rows[0]);
    } else {
      console.warn('⚠️ PriceList ID "PL-MP56NWKW" was NOT found in the database. Listing all available PriceLists:');
      const all = await client.query('SELECT id, name FROM "PriceList"');
      all.rows.forEach(row => {
        console.log(`- ID: ${row.id}, Name: ${row.name}`);
      });
    }
  } catch (err: any) {
    console.error('❌ Error checking PriceList:', err.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
