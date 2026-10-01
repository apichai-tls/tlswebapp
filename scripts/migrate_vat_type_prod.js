const { Client } = require('pg');

const prodUrl = process.env.PROD_DATABASE_URL || 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';

async function migrateVatTypeProd() {
  console.log('====================================================');
  console.log('   PRODUCTION DB MIGRATION: Customer.vatType       ');
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
    // Check if column already exists
    const checkRes = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Customer' AND column_name = 'vatType';
    `);

    if (checkRes.rows.length > 0) {
      console.log('ℹ️ Column "vatType" already exists in "Customer" table:', checkRes.rows[0]);
    } else {
      console.log('\n[1/2] Adding "vatType" column to "Customer" table...');
      await client.query('BEGIN');
      await client.query(`
        ALTER TABLE "Customer" 
          ADD COLUMN IF NOT EXISTS "vatType" TEXT DEFAULT 'default';
      `);

      console.log('[2/2] Backfilling existing Customer rows to "default"...');
      const backfillRes = await client.query(`
        UPDATE "Customer" 
        SET "vatType" = 'default' 
        WHERE "vatType" IS NULL;
      `);
      console.log(`  -> Customer rows backfilled: ${backfillRes.rowCount}`);

      await client.query('COMMIT');
      console.log('✅ Migration committed successfully!');
    }

    // Verification
    console.log('\n====================================================');
    console.log('              POST-MIGRATION VERIFICATION           ');
    console.log('====================================================');
    const verifyRes = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Customer' AND column_name = 'vatType';
    `);
    console.log('Customer.vatType column in Production DB:');
    console.table(verifyRes.rows);

    const stats = await client.query(`
      SELECT "vatType", COUNT(*)::int as count 
      FROM "Customer" 
      GROUP BY "vatType";
    `);
    console.log('Customer vatType distribution:');
    console.table(stats.rows);

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

migrateVatTypeProd();
