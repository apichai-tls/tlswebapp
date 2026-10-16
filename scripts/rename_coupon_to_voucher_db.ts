import { Client } from 'pg';

async function renameTable() {
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
    console.log('Renaming CustomerCoupon to CustomerVoucher...');
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'CustomerCoupon') THEN
          ALTER TABLE "CustomerCoupon" RENAME TO "CustomerVoucher";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerCoupon_pkey') THEN
          ALTER TABLE "CustomerVoucher" RENAME CONSTRAINT "CustomerCoupon_pkey" TO "CustomerVoucher_pkey";
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerCoupon_customerId_fkey') THEN
          ALTER TABLE "CustomerVoucher" RENAME CONSTRAINT "CustomerCoupon_customerId_fkey" TO "CustomerVoucher_customerId_fkey";
        END IF;
      END $$;
    `);

    // Rename indexes
    const indexRenames = [
      ['CustomerCoupon_customerId_status_idx', 'CustomerVoucher_customerId_status_idx'],
      ['CustomerCoupon_code_idx', 'CustomerVoucher_code_idx'],
      ['CustomerCoupon_status_idx', 'CustomerVoucher_status_idx'],
      ['CustomerCoupon_brand_idx', 'CustomerVoucher_brand_idx'],
      ['CustomerCoupon_campaignId_idx', 'CustomerVoucher_campaignId_idx'],
      ['CustomerCoupon_applicableCategory_idx', 'CustomerVoucher_applicableCategory_idx'],
      ['CustomerCoupon_sourceJobId_idx', 'CustomerVoucher_sourceJobId_idx']
    ];

    for (const [oldName, newName] of indexRenames) {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = '${oldName}' AND n.nspname = 'public') THEN
            ALTER INDEX "${oldName}" RENAME TO "${newName}";
          END IF;
        END $$;
      `);
    }

    console.log('Renaming completed successfully!');

    // Verification
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('CustomerCoupon', 'CustomerVoucher');
    `);
    console.log('\nExisting tables in database:');
    console.table(res.rows);

    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'CustomerVoucher'
      ORDER BY ordinal_position;
    `);
    console.log('\nCustomerVoucher columns:');
    console.table(cols.rows);

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

renameTable();
