const { Client } = require('pg');

const prodUrl = process.env.PROD_DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';

async function migrateProduction() {
  console.log('====================================================');
  console.log('   PRODUCTION DATABASE SCHEMA MIGRATION ENGINE      ');
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
    console.log('\n[1/5] Adding multi-brand columns to Customer table...');
    await client.query(`
      ALTER TABLE "Customer" 
        ADD COLUMN IF NOT EXISTS "brand" TEXT DEFAULT 'that_laundry_shop',
        ADD COLUMN IF NOT EXISTS "gender" TEXT DEFAULT 'Rather not say',
        ADD COLUMN IF NOT EXISTS "nickName" TEXT,
        ADD COLUMN IF NOT EXISTS "secondaryPhone" TEXT,
        ADD COLUMN IF NOT EXISTS "isSecondaryWhatsapp" BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS "verifiedVia" TEXT,
        ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT DEFAULT 'pos_store';
    `);

    console.log('[2/5] Backfilling existing Customer records with default brand & channel...');
    const custBackfill = await client.query(`
      UPDATE "Customer" 
      SET 
        "brand" = COALESCE("brand", 'that_laundry_shop'),
        "sourceSystem" = COALESCE("sourceSystem", 'pos_store'),
        "gender" = COALESCE("gender", 'Rather not say'),
        "isSecondaryWhatsapp" = COALESCE("isSecondaryWhatsapp", false),
        "isVerified" = COALESCE("isVerified", false)
      WHERE "brand" IS NULL OR "sourceSystem" IS NULL;
    `);
    console.log(`  -> Customer rows updated: ${custBackfill.rowCount}`);

    console.log('[3/5] Adding brand column to Job table...');
    await client.query(`
      ALTER TABLE "Job" 
        ADD COLUMN IF NOT EXISTS "brand" TEXT DEFAULT 'that_laundry_shop';
    `);

    const jobBackfill = await client.query(`
      UPDATE "Job" 
      SET "brand" = 'that_laundry_shop' 
      WHERE "brand" IS NULL;
    `);
    console.log(`  -> Job rows updated: ${jobBackfill.rowCount}`);

    console.log('[4/5] Creating CustomerAddress table with Foreign Keys...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CustomerAddress" (
        "id" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "label" TEXT NOT NULL DEFAULT 'Home Condo',
        "placeId" TEXT,
        "placeName" TEXT,
        "latitude" DOUBLE PRECISION,
        "longitude" DOUBLE PRECISION,
        "googleMapsUrl" TEXT,
        "address" TEXT NOT NULL,
        "roomNumber" TEXT,
        "subDistrict" TEXT,
        "district" TEXT NOT NULL,
        "province" TEXT NOT NULL DEFAULT 'Bangkok',
        "postalCode" TEXT,
        "contactName" TEXT,
        "contactPhone" TEXT,
        "leaveWithJuristic" BOOLEAN NOT NULL DEFAULT true,
        "deliveryNote" TEXT,
        "isPrimary" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    console.log('[5/5] Creating indexes and partial unique constraint for Noname...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_customers_brand" ON "Customer"("brand");
      CREATE INDEX IF NOT EXISTS "idx_jobs_brand" ON "Job"("brand");
      CREATE INDEX IF NOT EXISTS "idx_customeraddress_customerid" ON "CustomerAddress"("customerId");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_customers_noname_phone_unique" ON "Customer"("phone") WHERE "brand" = 'noname_laundry';
    `);

    await client.query('COMMIT');
    console.log('\n✅ Production DB Migration COMMIT successfully completed!');

    // VERIFICATION
    console.log('\n====================================================');
    console.log('              POST-MIGRATION VERIFICATION           ');
    console.log('====================================================');

    const customerSummary = await client.query(`
      SELECT 
        "brand", 
        "sourceSystem", 
        count(*) as count 
      FROM "Customer" 
      GROUP BY "brand", "sourceSystem";
    `);
    console.log('Customer Distribution:');
    console.table(customerSummary.rows);

    const jobSummary = await client.query(`
      SELECT 
        "brand", 
        count(*) as count 
      FROM "Job" 
      GROUP BY "brand";
    `);
    console.log('Job Distribution:');
    console.table(jobSummary.rows);

    const addrTbl = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'CustomerAddress';
    `);
    console.log(`CustomerAddress table verified: ${addrTbl.rows.length > 0 ? 'EXISTS (OK)' : 'MISSING (FAIL)'}`);

    const indexList = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('Customer', 'Job', 'CustomerAddress') 
        AND indexname IN ('idx_customers_brand', 'idx_jobs_brand', 'idx_customeraddress_customerid', 'idx_customers_noname_phone_unique');
    `);
    console.log('Verified New Indexes:');
    console.table(indexList.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration FAILED, transaction rolled back safely:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrateProduction();
