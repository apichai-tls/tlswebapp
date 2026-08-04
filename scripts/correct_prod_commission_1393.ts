import { Client } from 'pg';

const connectionString = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('✅ Connected to Production DB for correction.');

  try {
    await client.query('BEGIN');

    // 1. Fetch current rider balances
    const billyRes = await client.query('SELECT * FROM "Rider" WHERE "id" = $1', ['RIDER-04']);
    const qRes = await client.query('SELECT * FROM "Rider" WHERE "id" = $1', ['RIDER-006']);
    const billy = billyRes.rows[0];
    const q = qRes.rows[0];

    console.log(`\nBefore adjustment:`);
    console.log(`- Billy (RIDER-04) commissionBalance: ${billy.commissionBalance}`);
    console.log(`- Q (RIDER-006) commissionBalance: ${q.commissionBalance}`);

    // 2. Fetch transaction amounts
    const txBillyRes = await client.query('SELECT * FROM "RiderTransaction" WHERE "id" = $1', ['3df333b3-ee33-4050-9712-54fc0074926d']);
    const txQRes = await client.query('SELECT * FROM "RiderTransaction" WHERE "id" = $1', ['02e3f949-fbb5-4e56-9f7b-fb9dcf66c9bc']);
    const txBilly = txBillyRes.rows[0];
    const txQ = txQRes.rows[0];

    console.log(`- Transaction Billy: Amount = ${txBilly?.amount}`);
    console.log(`- Transaction Q: Amount = ${txQ?.amount}`);

    // Calculation:
    // Distance = 2.974 km.
    // Math.floor(2.974) * 3 = 6 baht.
    // Billy adjustment: new amount = 6, difference = 417 - 6 = 411 to subtract.
    // Q adjustment: new amount = 6, difference = 417 - 6 = 411 to subtract.
    const newCommission = 6;
    const diffBilly = (txBilly?.amount || 417) - newCommission;
    const diffQ = (txQ?.amount || 417) - newCommission;

    // 3. Update Rider balances
    await client.query('UPDATE "Rider" SET "commissionBalance" = "commissionBalance" - $1 WHERE "id" = $2', [diffBilly, 'RIDER-04']);
    await client.query('UPDATE "Rider" SET "commissionBalance" = "commissionBalance" - $1 WHERE "id" = $2', [diffQ, 'RIDER-006']);

    // 4. Update Rider Transactions
    await client.query('UPDATE "RiderTransaction" SET "amount" = $1 WHERE "id" = $2', [newCommission, '3df333b3-ee33-4050-9712-54fc0074926d']);
    await client.query('UPDATE "RiderTransaction" SET "amount" = $1 WHERE "id" = $2', [newCommission, '02e3f949-fbb5-4e56-9f7b-fb9dcf66c9bc']);

    // 5. Update Job record distance, coordinates, and commissions
    await client.query(
      `UPDATE "Job" 
       SET "pickupDistance" = 2.974, 
           "deliveryDistance" = 2.974, 
           "pickupCommission" = $1, 
           "deliveryCommission" = $1,
           "pickupLat" = 12.9349242,
           "pickupLng" = 100.8826178,
           "dropoffLat" = 12.9349242,
           "dropoffLng" = 100.8826178
       WHERE "id" = $2`,
      [newCommission, '2026001393']
    );

    await client.query('COMMIT');
    console.log('\n✅ DB Transaction committed successfully.');

    // Verification
    const billyAfterRes = await client.query('SELECT * FROM "Rider" WHERE "id" = $1', ['RIDER-04']);
    const qAfterRes = await client.query('SELECT * FROM "Rider" WHERE "id" = $1', ['RIDER-006']);
    console.log(`\nAfter adjustment:`);
    console.log(`- Billy (RIDER-04) commissionBalance: ${billyAfterRes.rows[0].commissionBalance}`);
    console.log(`- Q (RIDER-006) commissionBalance: ${qAfterRes.rows[0].commissionBalance}`);

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error in transaction, rolled back:', err.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
