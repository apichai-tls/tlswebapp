const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const prodUrl = process.env.PROD_DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';

function formatSqlValue(val, dataType) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') {
    // JSON or Array
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  // String escaping
  const escaped = String(val).replace(/'/g, "''");
  return `'${escaped}'`;
}

async function backupProduction() {
  console.log('====================================================');
  console.log('   PRODUCTION DATABASE BACKUP ENGINE (PostgreSQL)    ');
  console.log('====================================================');

  const urlObj = new URL(prodUrl);
  if (urlObj.pathname !== '/postgres' || urlObj.hostname !== '34.10.25.133') {
    console.error('CRITICAL ERROR: Safety check failed! Target is not Production postgres on 34.10.25.133');
    process.exit(1);
  }

  const client = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Production Database successfully.');

  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const sqlFilePath = path.join(backupDir, `prod_backup_${timestamp}.sql`);
  const jsonFilePath = path.join(backupDir, `prod_backup_${timestamp}.json`);

  console.log(`SQL Backup file  : ${sqlFilePath}`);
  console.log(`JSON Backup file : ${jsonFilePath}`);

  const sqlStream = fs.createWriteStream(sqlFilePath, { encoding: 'utf8' });
  sqlStream.write(`-- That Laundry Shop Production Database Backup\n`);
  sqlStream.write(`-- Created At: ${now.toISOString()}\n`);
  sqlStream.write(`-- Server: 34.10.25.133:5432/postgres\n\n`);
  sqlStream.write(`SET client_encoding = 'UTF8';\n`);
  sqlStream.write(`SET standard_conforming_strings = on;\n\n`);

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Discovered ${tables.length} tables to backup.\n`);

  const summary = [];
  const fullJsonData = {
    metadata: {
      source: '34.10.25.133/postgres',
      createdAt: now.toISOString(),
      tableCount: tables.length
    },
    tables: {}
  };

  for (const table of tables) {
    process.stdout.write(`Dumping table "${table}"... `);

    // Get columns
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [table]);

    const columns = colsRes.rows;
    const colNames = columns.map(c => c.column_name);
    const quotedColNames = colNames.map(c => `"${c}"`).join(', ');

    // Fetch data
    const dataRes = await client.query(`SELECT ${quotedColNames} FROM public."${table}"`);
    const rows = dataRes.rows;
    fullJsonData.tables[table] = rows;
    summary.push({ table, rowCount: rows.length });

    sqlStream.write(`--\n-- Data for Name: ${table}; Type: TABLE DATA; Rows: ${rows.length}\n--\n`);

    if (rows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const valuesStatements = batch.map(row => {
          const rowVals = columns.map(col => formatSqlValue(row[col.column_name], col.data_type));
          return `(${rowVals.join(', ')})`;
        }).join(',\n  ');

        sqlStream.write(`INSERT INTO public."${table}" (${quotedColNames}) VALUES\n  ${valuesStatements}\nON CONFLICT DO NOTHING;\n\n`);
      }
    }

    console.log(`✓ (${rows.length} rows)`);
  }

  sqlStream.end();

  // Write JSON backup
  console.log('\nWriting JSON structured backup...');
  fs.writeFileSync(jsonFilePath, JSON.stringify(fullJsonData, null, 2), 'utf8');

  await client.end();

  const sqlStats = fs.statSync(sqlFilePath);
  const jsonStats = fs.statSync(jsonFilePath);

  console.log('\n====================================================');
  console.log('              BACKUP SUMMARY TABLE                  ');
  console.log('====================================================');
  console.table(summary);

  console.log('====================================================');
  console.log(`✅ SQL Backup Complete  : ${(sqlStats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`✅ JSON Backup Complete : ${(jsonStats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total Tables Backed Up : ${tables.length}`);
  console.log('====================================================');
}

backupProduction().catch(err => {
  console.error('\n❌ Backup Failed:', err);
  process.exit(1);
});
