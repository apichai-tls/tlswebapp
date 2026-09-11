/**
 * Sync Prod DB to Test DB (Incremental Upsert) CLI runner
 */
import { performProdToTestSync } from '../src/lib/sync-db';

async function main() {
  console.log('====================================================');
  console.log('  Incremental Prod -> Test Database Synchronization');
  console.log('====================================================');
  console.log('Starting sync...\n');

  try {
    const summary = await performProdToTestSync();
    console.log('Synced tables summary:');
    for (const [tbl, count] of Object.entries(summary.syncedTables)) {
      console.log(`- ${tbl}: ${count} rows upserted`);
    }

    console.log('\n====================================================');
    console.log(`[SUMMARY] Total Jobs in Test: ${summary.totalJobsInTest}`);
    console.log(`[SUMMARY] Test-created Jobs (starting with 'T') Preserved: ${summary.testJobsPreserved}`);
    console.log(`[SUMMARY] Time taken: ${(summary.durationMs / 1000).toFixed(1)}s`);
    console.log('Sync completed successfully!');
    console.log('====================================================');
  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(1);
  }
}

main();
