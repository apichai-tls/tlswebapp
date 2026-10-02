import { Client } from 'pg';

async function check() {
  const remoteUrl = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test';
  const localUrl = 'postgresql://postgres:123456@localhost:5432/tls_test';

  const remote = new Client({ connectionString: remoteUrl, ssl: { rejectUnauthorized: false } });
  const local = new Client({ connectionString: localUrl });

  await remote.connect();
  await local.connect();

  const tablesRes = await remote.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Found ${tables.length} tables in remote Test DB.\n`);

  console.log('Table Name'.padEnd(25) + 'Remote Count'.padEnd(15) + 'Local Count'.padEnd(15));
  console.log('-'.repeat(55));

  for (const tbl of tables) {
    let rCount = '0';
    let lCount = '0';
    try {
      const r = await remote.query(`SELECT count(*) as count FROM public."${tbl}"`);
      rCount = r.rows[0].count;
    } catch (e: any) {
      rCount = 'ERR';
    }
    try {
      const l = await local.query(`SELECT count(*) as count FROM public."${tbl}"`);
      lCount = l.rows[0].count;
    } catch (e: any) {
      lCount = 'NOT_FOUND';
    }
    console.log(tbl.padEnd(25) + rCount.padEnd(15) + lCount.padEnd(15));
  }

  await remote.end();
  await local.end();
}

check().catch(console.error);
