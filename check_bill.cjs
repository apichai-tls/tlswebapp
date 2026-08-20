const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const res = await client.query(
    'SELECT id, "billImageUrl", "updatedAt" FROM "Job" WHERE id LIKE $1 ORDER BY "updatedAt" DESC LIMIT 3',
    ['%2681%']
  );
  for (const row of res.rows) {
    console.log('\n=== Job:', row.id, '===');
    console.log('updatedAt:', row.updatedAt);
    if (row.billImageUrl) {
      try {
        const urls = JSON.parse(row.billImageUrl);
        const arr = Array.isArray(urls) ? urls : [urls];
        console.log('Total images:', arr.length);
        arr.forEach((u, i) => console.log('[' + (i+1) + ']', u));
        console.log('\n>>> LATEST:', arr[arr.length - 1]);
      } catch (e) { console.log('raw:', row.billImageUrl); }
    } else { console.log('No billImageUrl'); }
  }
  await client.end();
}).catch(console.error);
