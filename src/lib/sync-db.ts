import { Client } from 'pg';

export interface SyncSummary {
  success: boolean;
  totalJobsInTest: number;
  testJobsPreserved: number;
  syncedTables: Record<string, number>;
  durationMs: number;
  error?: string;
}

const TABLES_TO_SYNC = [
  'ShopLocation',
  'PriceList',
  'ServiceItem',
  'POI',
  'AdminUser',
  'Customer',
  'Rider',
  'Setting',
  'Job',
  'Transaction',
  'RiderTransaction',
  'Task',
  'Notification',
  'ActivityLog',
  'Article',
  'ContactRequest',
  'KeywordQueue',
  'Location',
  'MembershipRequest',
  'Pricing',
  'WebsiteAdminUser'
];

async function createConnectedClient(connectionString: string): Promise<Client> {
  const prefersNoSsl = 
    connectionString.includes('sslmode=disable') ||
    connectionString.includes('127.0.0.1') || 
    connectionString.includes('localhost') || 
    connectionString.includes('/cloudsql');

  if (prefersNoSsl) {
    const client = new Client({ connectionString });
    await client.connect();
    return client;
  }

  try {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    return client;
  } catch (err: any) {
    if (err?.message?.includes('does not support SSL')) {
      const fallbackClient = new Client({ connectionString });
      await fallbackClient.connect();
      return fallbackClient;
    }
    throw err;
  }
}

export async function performProdToTestSync(): Promise<SyncSummary> {
  const startTime = Date.now();
  const prodUrl = process.env.PROD_DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';
  const testUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test';

  // Strict guardrail: Prevent syncing if testUrl points to prod database!
  if (testUrl.includes('/postgres') && !testUrl.includes('/tls_test')) {
    throw new Error('Safety guard: Target database cannot be the Production database!');
  }

  const [prodClient, testClient] = await Promise.all([
    createConnectedClient(prodUrl),
    createConnectedClient(testUrl),
  ]);

  const syncedTables: Record<string, number> = {};

  try {
    for (const table of TABLES_TO_SYNC) {
      const colsQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `;
      const [prodColsRes, testColsRes] = await Promise.all([
        prodClient.query(colsQuery, [table]),
        testClient.query(colsQuery, [table]),
      ]);

      if (prodColsRes.rows.length === 0 || testColsRes.rows.length === 0) {
        continue;
      }

      const prodCols = new Set(prodColsRes.rows.map((r: any) => r.column_name as string));
      const commonCols: string[] = testColsRes.rows
        .map((r: any) => r.column_name as string)
        .filter((col: string) => prodCols.has(col));

      if (commonCols.length === 0) continue;

      const quotedCols = commonCols.map((c: string) => `"${c}"`).join(', ');
      const querySuffix = table === 'ActivityLog' ? ' ORDER BY "createdAt" DESC LIMIT 3000' : '';
      const prodDataRes = await prodClient.query(`SELECT ${quotedCols} FROM public."${table}"${querySuffix}`);
      const totalProdRows = prodDataRes.rows.length;

      if (totalProdRows === 0) {
        syncedTables[table] = 0;
        continue;
      }

      const BATCH_SIZE = 500;
      const updateCols = commonCols.filter((c: string) => c !== 'id');
      const updateClause = updateCols.length > 0
        ? `DO UPDATE SET ${updateCols.map((c: string) => `"${c}" = EXCLUDED."${c}"`).join(', ')}`
        : 'DO NOTHING';

      let count = 0;
      for (let i = 0; i < totalProdRows; i += BATCH_SIZE) {
        const batch = prodDataRes.rows.slice(i, i + BATCH_SIZE);
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
          VALUES ${rowsPlaceholders.join(',\n')}
          ON CONFLICT ("id") ${updateClause};
        `;

        await testClient.query(insertSql, valuesList);
        count += batch.length;
      }

      syncedTables[table] = count;
    }

    const [testJobsRes, totalJobsRes] = await Promise.all([
      testClient.query(`SELECT count(*) as count FROM public."Job" WHERE id LIKE 'T%'`),
      testClient.query(`SELECT count(*) as count FROM public."Job"`),
    ]);

    return {
      success: true,
      totalJobsInTest: parseInt(totalJobsRes.rows[0].count, 10),
      testJobsPreserved: parseInt(testJobsRes.rows[0].count, 10),
      syncedTables,
      durationMs: Date.now() - startTime,
    };
  } finally {
    await Promise.all([prodClient.end(), testClient.end()]);
  }
}
