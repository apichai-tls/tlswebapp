import { Client } from 'pg';

const connectionString = 'postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/postgres';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('✅ Connected to Production DB for auditing June commissions.\n');

  try {
    // 1. Fetch all jobs in June 2026 (Month 06)
    // Note: Database timestamps are in UTC.
    const startJune = new Date('2026-06-01T00:00:00Z');
    const endJune = new Date('2026-06-30T23:59:59.999Z');

    console.log(`Auditing jobs created or completed between ${startJune.toISOString()} and ${endJune.toISOString()}...\n`);

    const jobsRes = await client.query(
      `SELECT * FROM "Job" 
       WHERE ("createdAt" >= $1 AND "createdAt" <= $2)
          OR ("completedAt" >= $1 AND "completedAt" <= $2)
       ORDER BY "createdAt" ASC`,
      [startJune, endJune]
    );

    const jobs = jobsRes.rows;
    console.log(`Found ${jobs.length} jobs in June 2026.`);

    // Fetch all transactions in June 2026 or associated with these jobs
    const jobIds = jobs.map(j => j.id);
    let txRes;
    if (jobIds.length > 0) {
      txRes = await client.query(
        `SELECT * FROM "RiderTransaction" 
         WHERE "jobId" IN (${jobIds.map((_, i) => `$${i + 1}`).join(', ')})
            OR ("createdAt" >= $${jobIds.length + 1} AND "createdAt" <= $${jobIds.length + 2})`,
        [...jobIds, startJune, endJune]
      );
    } else {
      txRes = await client.query(
        `SELECT * FROM "RiderTransaction" 
         WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
        [startJune, endJune]
      );
    }
    const txs = txRes.rows;
    console.log(`Found ${txs.length} rider transactions.\n`);

    // Index transactions by jobId + type
    const txMap: Record<string, typeof txs> = {};
    txs.forEach(t => {
      const key = `${t.jobId}_${t.type}`;
      if (!txMap[key]) txMap[key] = [];
      txMap[key].push(t);
    });

    let missingTransactions = 0;
    let mismatchedAmounts = 0;
    let duplicateTransactions = 0;
    let correctLegs = 0;

    const report: string[] = [];

    for (const job of jobs) {
      const isAlreadyCompleted = job.status === 'completed';
      const isPickupLegDone = job.status === 'billing' || job.status === 'delivery' || job.status === 'completed';

      // 1. Audit Pickup Leg
      if (job.pickupRiderId && isPickupLegDone) {
        const key = `${job.id}_commission_pickup`;
        const matchTxs = txMap[key] || [];

        const expectedComm = job.pickupCommission || 0;

        if (matchTxs.length === 0) {
          if (expectedComm > 0) {
            report.push(`❌ Job [${job.id}]: Missing commission_pickup for Rider ${job.pickupRiderId}. Expected: ${expectedComm}฿`);
            missingTransactions++;
          }
        } else {
          if (matchTxs.length > 1) {
            report.push(`⚠️ Job [${job.id}]: Duplicate commission_pickup for Rider ${job.pickupRiderId}. Found ${matchTxs.length} txs.`);
            duplicateTransactions++;
          }
          const actualComm = matchTxs[0].amount;
          if (actualComm !== expectedComm) {
            report.push(`❌ Job [${job.id}]: Amount mismatch on commission_pickup for Rider ${job.pickupRiderId}. Expected: ${expectedComm}฿, Found: ${actualComm}฿`);
            mismatchedAmounts++;
          } else {
            correctLegs++;
          }
        }
      }

      // 2. Audit Delivery Leg
      if (job.deliveryRiderId && isAlreadyCompleted) {
        const key = `${job.id}_commission_delivery`;
        const matchTxs = txMap[key] || [];

        const expectedComm = job.deliveryCommission || 0;

        if (matchTxs.length === 0) {
          if (expectedComm > 0) {
            report.push(`❌ Job [${job.id}]: Missing commission_delivery for Rider ${job.deliveryRiderId}. Expected: ${expectedComm}฿`);
            missingTransactions++;
          }
        } else {
          if (matchTxs.length > 1) {
            report.push(`⚠️ Job [${job.id}]: Duplicate commission_delivery for Rider ${job.deliveryRiderId}. Found ${matchTxs.length} txs.`);
            duplicateTransactions++;
          }
          const actualComm = matchTxs[0].amount;
          if (actualComm !== expectedComm) {
            report.push(`❌ Job [${job.id}]: Amount mismatch on commission_delivery for Rider ${job.deliveryRiderId}. Expected: ${expectedComm}฿, Found: ${actualComm}฿`);
            mismatchedAmounts++;
          } else {
            correctLegs++;
          }
        }
      }
    }

    console.log('--- AUDIT REPORT DETAILS ---');
    if (report.length === 0) {
      console.log('✅ Perfect Match! All June rider commissions are correct and complete.');
    } else {
      report.forEach(line => console.log(line));
    }
    console.log('\n--- AUDIT SUMMARY ---');
    console.log(`- Total Correct Legs checked: ${correctLegs}`);
    console.log(`- Missing Transactions: ${missingTransactions}`);
    console.log(`- Mismatched Amounts: ${mismatchedAmounts}`);
    console.log(`- Duplicate Transactions: ${duplicateTransactions}`);

  } catch (err: any) {
    console.error('❌ Error during audit:', err.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
