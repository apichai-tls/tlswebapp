const { Client } = require('pg');

const prodUrl = process.env.PROD_DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';

async function migrateCustomerCouponProd() {
  console.log('====================================================');
  console.log('  PRODUCTION DB MIGRATION: CustomerCoupon Table    ');
  console.log('====================================================');

  const urlObj = new URL(prodUrl);
  if (urlObj.pathname !== '/postgres' || urlObj.hostname !== '34.10.25.133') {
    console.error('CRITICAL SAFETY TRIGGER: Database must be postgres on 34.10.25.133! Current:', urlObj.href);
    process.exit(1);
  }

  const client = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Production Database (34.10.25.133/postgres)...');

  try {
    await client.query('BEGIN');

    console.log('\n[1/3] Creating CustomerCoupon table with Foreign Keys...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CustomerCoupon" (
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
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CustomerCoupon_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "CustomerCoupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    console.log('[2/3] Creating CustomerCoupon indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_customerId_status_idx" ON "CustomerCoupon"("customerId", "status");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_code_idx" ON "CustomerCoupon"("code");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_status_idx" ON "CustomerCoupon"("status");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_brand_idx" ON "CustomerCoupon"("brand");
    `);

    console.log('[3/3] Creating relation performance indexes (Job, Booking, Transaction)...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "Job_customerId_idx" ON "Job"("customerId");
      CREATE INDEX IF NOT EXISTS "Booking_memberId_idx" ON "Booking"("memberId");
      CREATE INDEX IF NOT EXISTS "Transaction_memberId_idx" ON "Transaction"("memberId");
    `);

    await client.query('COMMIT');
    console.log('\n✅ Production DB Migration COMMIT successfully completed!');

    // Post-migration verification
    console.log('\n====================================================');
    console.log('              POST-MIGRATION VERIFICATION           ');
    console.log('====================================================');

    const tblCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'CustomerCoupon';
    `);
    console.log(`CustomerCoupon table exists: ${tblCheck.rows.length > 0 ? 'YES (OK)' : 'NO (FAIL)'}`);

    const colsCheck = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'CustomerCoupon'
      ORDER BY ordinal_position;
    `);
    console.log('\nCustomerCoupon Columns:');
    console.table(colsCheck.rows);

    const indexes = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename IN ('CustomerCoupon', 'Job', 'Booking', 'Transaction')
        AND indexname IN (
          'CustomerCoupon_customerId_status_idx',
          'CustomerCoupon_code_idx',
          'CustomerCoupon_status_idx',
          'CustomerCoupon_brand_idx',
          'Job_customerId_idx',
          'Booking_memberId_idx',
          'Transaction_memberId_idx'
        )
      ORDER BY tablename, indexname;
    `);
    console.log('\nVerified New Indexes:');
    console.table(indexes.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration FAILED, transaction rolled back safely:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrateCustomerCouponProd().catch(err => {
  console.error(err);
  process.exit(1);
});
