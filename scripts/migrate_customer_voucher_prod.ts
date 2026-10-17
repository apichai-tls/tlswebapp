import { Client } from 'pg';

const prodUrl = process.env.PROD_DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';

async function migrate() {
  console.log('====================================================');
  console.log('   PRODUCTION DB MIGRATION: CustomerVoucher Table    ');
  console.log('====================================================');

  const cleanUrl = prodUrl.replace(/[?&]sslmode=[^&]+/, '');
  const urlObj = new URL(cleanUrl);
  if (urlObj.pathname !== '/postgres' || urlObj.hostname !== '34.10.25.133') {
    console.error('CRITICAL SAFETY TRIGGER: Database must be postgres on 34.10.25.133! Current:', urlObj.href);
    process.exit(1);
  }

  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to Production Database (34.10.25.133/postgres)...');

  try {
    await client.query('BEGIN');

    // 1. Check if CustomerCoupon exists and CustomerVoucher does NOT exist
    const checkRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('CustomerCoupon', 'CustomerVoucher')
    `);
    const tables = checkRes.rows.map(r => r.table_name);
    console.log('Current tables found:', tables);

    if (tables.includes('CustomerCoupon') && !tables.includes('CustomerVoucher')) {
      console.log('\n[Step 1] Adding new columns to CustomerCoupon before rename...');
      await client.query(`
        ALTER TABLE "CustomerCoupon"
          ADD COLUMN IF NOT EXISTS "applicableCategory" TEXT,
          ADD COLUMN IF NOT EXISTS "campaignId" TEXT,
          ADD COLUMN IF NOT EXISTS "discountAmountUsed" DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS "sourceJobId" TEXT;
      `);

      console.log('[Step 2] Renaming CustomerCoupon table to CustomerVoucher...');
      await client.query(`ALTER TABLE "CustomerCoupon" RENAME TO "CustomerVoucher";`);

      console.log('[Step 3] Renaming Constraints...');
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerCoupon_pkey') THEN
            ALTER TABLE "CustomerVoucher" RENAME CONSTRAINT "CustomerCoupon_pkey" TO "CustomerVoucher_pkey";
          END IF;
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerCoupon_customerId_fkey') THEN
            ALTER TABLE "CustomerVoucher" RENAME CONSTRAINT "CustomerCoupon_customerId_fkey" TO "CustomerVoucher_customerId_fkey";
          END IF;
        END $$;
      `);
    } else if (!tables.includes('CustomerVoucher')) {
      console.log('\n[Step 1] Creating CustomerVoucher table from scratch...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "CustomerVoucher" (
          "id" TEXT NOT NULL,
          "customerId" TEXT NOT NULL,
          "customerName" TEXT,
          "customerPhone" TEXT,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "discountType" TEXT NOT NULL,
          "discountValue" DOUBLE PRECISION NOT NULL,
          "minOrderAmount" DOUBLE PRECISION,
          "maxDiscount" DOUBLE PRECISION,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiryDate" TIMESTAMP(3),
          "usedAt" TIMESTAMP(3),
          "usedJobId" TEXT,
          "issuedById" TEXT,
          "issuedByName" TEXT,
          "issuedReason" TEXT,
          "brand" TEXT NOT NULL DEFAULT 'that_laundry_shop',
          "applicableCategory" TEXT,
          "campaignId" TEXT,
          "discountAmountUsed" DOUBLE PRECISION,
          "sourceJobId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CustomerVoucher_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "CustomerVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
    } else {
      console.log('\n[Step 1] CustomerVoucher already exists, ensuring all columns are present...');
      await client.query(`
        ALTER TABLE "CustomerVoucher"
          ADD COLUMN IF NOT EXISTS "applicableCategory" TEXT,
          ADD COLUMN IF NOT EXISTS "campaignId" TEXT,
          ADD COLUMN IF NOT EXISTS "discountAmountUsed" DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS "sourceJobId" TEXT;
      `);
    }

    console.log('[Step 4] Ensuring all indexes exist on CustomerVoucher...');
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

    // Create indexes if they don't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS "CustomerVoucher_customerId_status_idx" ON "CustomerVoucher"("customerId", "status");
      CREATE INDEX IF NOT EXISTS "CustomerVoucher_code_idx" ON "CustomerVoucher"("code");
      CREATE INDEX IF NOT EXISTS "CustomerVoucher_status_idx" ON "CustomerVoucher"("status");
      CREATE INDEX IF NOT EXISTS "CustomerVoucher_brand_idx" ON "CustomerVoucher"("brand");
      CREATE INDEX IF NOT EXISTS "CustomerVoucher_campaignId_idx" ON "CustomerVoucher"("campaignId");
      CREATE INDEX IF NOT EXISTS "CustomerVoucher_applicableCategory_idx" ON "CustomerVoucher"("applicableCategory");
      CREATE INDEX IF NOT EXISTS "CustomerVoucher_sourceJobId_idx" ON "CustomerVoucher"("sourceJobId");
    `);

    await client.query('COMMIT');
    console.log('\n✅ Production DB Migration COMMIT successfully completed!');

    // Verification
    console.log('\n====================================================');
    console.log('              POST-MIGRATION VERIFICATION           ');
    console.log('====================================================');

    const checkTable = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'CustomerVoucher'
    `);
    console.log('CustomerVoucher table exists:', checkTable.rows.length > 0 ? 'YES (SUCCESS)' : 'NO (FAILED)');

    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'CustomerVoucher'
      ORDER BY ordinal_position;
    `);
    console.log('\nCustomerVoucher columns in Prod:');
    console.table(cols.rows);

    const testQuery = await client.query('SELECT count(*) FROM "CustomerVoucher"');
    console.log('\nTotal rows in CustomerVoucher:', testQuery.rows[0].count);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed and rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
