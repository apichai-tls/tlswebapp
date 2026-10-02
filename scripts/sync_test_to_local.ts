import { Client } from 'pg';

interface TableSyncResult {
  table: string;
  count: number;
  durationMs: number;
}

const TABLES_ORDER = [
  // Master / config tables
  'ShopLocation',
  'PriceList',
  'ServiceItem',
  'POI',
  'AdminUser',
  'RoleDefinition',
  'Department',
  'Setting',
  // People
  'Customer',
  'CustomerAddress',
  'Rider',
  'CashierShift',
  // Operations & Financials
  'Job',
  'JobRefund',
  'Transaction',
  'RiderTransaction',
  'WalletTransaction',
  'Task',
  'Notification',
  'ActivityLog',
  // Web / Extra
  'Article',
  'Booking',
  'ContactRequest',
  'KeywordQueue',
  'Location',
  'MembershipRequest',
  'Pricing',
  'website_admin_users'
];

async function run() {
  const remoteUrl = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test';
  const localUrl = 'postgresql://postgres:123456@localhost:5432/tls_test';

  console.log('====================================================');
  console.log('  Pull Database from Remote Test -> Local Database  ');
  console.log('====================================================');
  console.log(`Source (Test):  34.10.25.133:5432/tls_test`);
  console.log(`Target (Local): localhost:5432/tls_test\n`);

  const startTime = Date.now();

  const remote = new Client({ connectionString: remoteUrl, ssl: { rejectUnauthorized: false } });
  const local = new Client({ connectionString: localUrl });

  console.log('Connecting to databases...');
  await Promise.all([remote.connect(), local.connect()]);
  console.log('Connected successfully.\n');

  try {
    // Disable triggers & foreign key checks on local for bulk load
    console.log('Disabling triggers and foreign keys on local (session_replication_role = replica)...');
    await local.query("SET session_replication_role = 'replica';");

    // Fetch all existing tables in remote
    const remoteTablesRes = await remote.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const remoteTablesSet = new Set(remoteTablesRes.rows.map(r => r.table_name));

    // Determine tables to sync
    const tablesToSync = TABLES_ORDER.filter(t => remoteTablesSet.has(t));
    // Add any remaining remote tables not in TABLES_ORDER
    for (const t of remoteTablesSet) {
      if (!tablesToSync.includes(t)) {
        tablesToSync.push(t);
      }
    }

    // Truncate all local target tables upfront in a single CASCADE command
    console.log('Truncating target tables on local upfront...');
    const localExistingTables: string[] = [];
    for (const t of tablesToSync) {
      const check = await local.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1);`, [t]);
      if (check.rows[0].exists) {
        localExistingTables.push(`public."${t}"`);
      }
    }
    if (localExistingTables.length > 0) {
      await local.query(`TRUNCATE TABLE ${localExistingTables.join(', ')} CASCADE;`);
    }
    console.log(`Truncated ${localExistingTables.length} tables cleanly.\n`);

    const results: TableSyncResult[] = [];

    for (const table of tablesToSync) {
      const tableStart = Date.now();
      process.stdout.write(`Syncing ${table.padEnd(22)} ... `);

      // Check if table exists on local
      const localTableCheck = await local.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        );
      `, [table]);

      if (!localTableCheck.rows[0].exists) {
        console.log('[SKIP: Table does not exist in local schema]');
        continue;
      }

      // Find common columns
      const colsQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `;
      const [remoteColsRes, localColsRes] = await Promise.all([
        remote.query(colsQuery, [table]),
        local.query(colsQuery, [table])
      ]);

      const localColsSet = new Set(localColsRes.rows.map((r: any) => r.column_name));
      const commonCols = remoteColsRes.rows
        .map((r: any) => r.column_name as string)
        .filter((c: string) => localColsSet.has(c));

      if (commonCols.length === 0) {
        console.log('[SKIP: No matching columns]');
        continue;
      }

      const quotedCols = commonCols.map(c => `"${c}"`).join(', ');

      // Stream / paginate data from remote
      const totalCountRes = await remote.query(`SELECT count(*) as count FROM public."${table}"`);
      const totalRows = parseInt(totalCountRes.rows[0].count, 10);

      if (totalRows === 0) {
        console.log('0 rows (empty)');
        results.push({ table, count: 0, durationMs: Date.now() - tableStart });
        continue;
      }

      const BATCH_SIZE = 1000;
      let insertedCount = 0;

      // For ActivityLog, sync the latest 10,000 entries to optimize time and storage
      const isActivityLog = table === 'ActivityLog';
      const maxRowsToFetch = isActivityLog ? Math.min(totalRows, 10000) : totalRows;
      const orderClause = isActivityLog ? ' ORDER BY "createdAt" DESC' : '';

      const FETCH_PAGE_SIZE = 5000;
      for (let offset = 0; offset < maxRowsToFetch; offset += FETCH_PAGE_SIZE) {
        const fetchLimit = Math.min(FETCH_PAGE_SIZE, maxRowsToFetch - offset);
        const remoteDataRes = await remote.query(
          `SELECT ${quotedCols} FROM public."${table}"${orderClause} LIMIT ${fetchLimit} OFFSET ${offset}`
        );
        const rows = remoteDataRes.rows;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const valuesList: any[] = [];
          const rowsPlaceholders: string[] = [];
          let pIdx = 1;

          for (const row of batch) {
            const placeholders: string[] = [];
            for (const col of commonCols) {
              valuesList.push(row[col]);
              placeholders.push(`$${pIdx++}`);
            }
            rowsPlaceholders.push(`(${placeholders.join(', ')})`);
          }

          const insertSql = `
            INSERT INTO public."${table}" (${quotedCols})
            VALUES ${rowsPlaceholders.join(',\n')};
          `;

          await local.query(insertSql, valuesList);
          insertedCount += batch.length;
        }
      }

      // Reset sequences if table has serial column
      try {
        const seqQuery = `
          SELECT column_name, pg_get_serial_sequence(table_name, column_name) as seq
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
            AND pg_get_serial_sequence(table_name, column_name) IS NOT NULL;
        `;
        const seqRes = await local.query(seqQuery, [table]);
        for (const sRow of seqRes.rows) {
          if (sRow.seq) {
            await local.query(`
              SELECT setval('${sRow.seq}', COALESCE((SELECT MAX("${sRow.column_name}") FROM public."${table}"), 1), true);
            `);
          }
        }
      } catch (e) {
        // Ignore sequence error if not applicable
      }

      const durationMs = Date.now() - tableStart;
      console.log(`${insertedCount.toLocaleString().padStart(6)} rows (${(durationMs / 1000).toFixed(1)}s)`);
      results.push({ table, count: insertedCount, durationMs });
    }

    // Re-enable triggers & foreign key checks on local
    console.log('\nRestoring triggers and foreign keys on local (session_replication_role = origin)...');
    await local.query("SET session_replication_role = 'origin';");

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalSyncedRows = results.reduce((acc, r) => acc + r.count, 0);

    console.log('\n====================================================');
    console.log(`  Sync Complete! Total rows synced: ${totalSyncedRows.toLocaleString()}`);
    console.log(`  Time taken: ${totalDuration}s`);
    console.log('====================================================\n');

  } finally {
    await Promise.all([remote.end(), local.end()]);
  }
}

run().catch((err) => {
  console.error('\nSync failed with error:', err);
  process.exit(1);
});
