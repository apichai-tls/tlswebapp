import { Client } from 'pg';

const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test';

async function migrateTestDb() {
  console.log('====================================================');
  console.log('      TEST DB MIGRATION (tls_test on 34.10.25.133)   ');
  console.log('====================================================');

  const client = new Client({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Remote Test Database (tls_test)...');

  try {
    await client.query('BEGIN');

    // 1. Customer.vatType
    console.log('\n[1/4] Ensuring Customer.vatType column exists...');
    await client.query(`
      ALTER TABLE "Customer" 
        ADD COLUMN IF NOT EXISTS "vatType" TEXT DEFAULT 'default';
    `);

    console.log('[2/4] Backfilling Customer.vatType to "default"...');
    const backfillRes = await client.query(`
      UPDATE "Customer" 
      SET "vatType" = 'default' 
      WHERE "vatType" IS NULL;
    `);
    console.log(`  -> Customer rows backfilled: ${backfillRes.rowCount}`);

    // 2. CustomerCoupon table
    console.log('\n[3/4] Creating CustomerCoupon table if not exists...');
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

    // 3. CustomerCoupon Indexes
    console.log('[4/4] Creating indexes for CustomerCoupon...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_customerId_status_idx" ON "CustomerCoupon"("customerId", "status");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_code_idx" ON "CustomerCoupon"("code");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_status_idx" ON "CustomerCoupon"("status");
      CREATE INDEX IF NOT EXISTS "CustomerCoupon_brand_idx" ON "CustomerCoupon"("brand");
      CREATE INDEX IF NOT EXISTS "Job_customerId_idx" ON "Job"("customerId");
      CREATE INDEX IF NOT EXISTS "Booking_memberId_idx" ON "Booking"("memberId");
      CREATE INDEX IF NOT EXISTS "Transaction_memberId_idx" ON "Transaction"("memberId");
    `);

    await client.query('COMMIT');
    console.log('\n✅ Test DB Migration COMMIT successfully completed!');

    // Verification
    console.log('\n====================================================');
    console.log('              POST-MIGRATION VERIFICATION           ');
    console.log('====================================================');
    const vatCheck = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Customer' AND column_name = 'vatType';
    `);
    console.log('Customer.vatType:');
    console.table(vatCheck.rows);

    const couponCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'CustomerCoupon';
    `);
    console.log('CustomerCoupon Table:', couponCheck.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed and rolled back:', err);
    throw err;
  } finally {
    await client.end();
  }
}

migrateTestDb().catch(console.error);
