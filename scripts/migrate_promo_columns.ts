import { Client } from 'pg';

async function migrate() {
  let connectionString = process.env.DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test';
  connectionString = connectionString.replace(/[?&]sslmode=[^&]+/, '');
  console.log('Connecting to database...');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to:', connectionString.replace(/:[^:@]+@/, ':****@'));

  try {
    console.log('Adding missing columns to CustomerCoupon...');
    await client.query(`
      ALTER TABLE "CustomerCoupon"
        ADD COLUMN IF NOT EXISTS "applicableCategory" TEXT,
        ADD COLUMN IF NOT EXISTS "campaignId" TEXT,
        ADD COLUMN IF NOT EXISTS "discountAmountUsed" DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "sourceJobId" TEXT;
    `);
    console.log('Columns added successfully.');

    console.log('Adding indexes to CustomerCoupon...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_campaignId_idx" ON "CustomerCoupon"("campaignId");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_applicableCategory_idx" ON "CustomerCoupon"("applicableCategory");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_sourceJobId_idx" ON "CustomerCoupon"("sourceJobId");
    `);
    console.log('Indexes created successfully.');

    // Verify columns
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'CustomerCoupon'
      ORDER BY ordinal_position;
    `);

    console.log('\nVerified columns on CustomerCoupon:');
    console.table(res.rows);

    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
