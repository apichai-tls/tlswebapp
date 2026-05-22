import { Client } from 'pg';

async function main() {
  const prodUrl = 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres';
  const testUrl = 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test';

  const prodClient = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  const testClient = new Client({ connectionString: testUrl, ssl: { rejectUnauthorized: false } });

  try {
    await prodClient.connect();
    await testClient.connect();

    console.log('Connected to both databases.');

    // 1. Delete all jobs in Test DB
    console.log('Clearing Jobs in Test DB...');
    await testClient.query('DELETE FROM "Job"');
    console.log('Cleared all Jobs in Test DB.');

    // 2. Fetch all jobs from Prod DB
    console.log('Fetching Jobs from Prod DB...');
    const prodJobsResult = await prodClient.query('SELECT * FROM "Job"');
    const prodJobs = prodJobsResult.rows;
    console.log(`Fetched ${prodJobs.length} Jobs from Prod DB.`);

    if (prodJobs.length === 0) {
      console.log('No jobs to sync. Exiting.');
      return;
    }

    // 3. Insert jobs into Test DB
    console.log('Inserting Jobs to Test DB...');
    
    // Create parameterized query for batch insert or single inserts
    // Single inserts might be slower but safer for error handling
    let inserted = 0;
    for (const job of prodJobs) {
      const columns = Object.keys(job).map(k => `"${k}"`).join(', ');
      const placeholders = Object.keys(job).map((_, i) => `$${i + 1}`).join(', ');
      const values = Object.values(job);

      try {
        await testClient.query(`INSERT INTO "Job" (${columns}) VALUES (${placeholders})`, values);
        inserted++;
      } catch (err) {
        console.error(`Failed to insert job ${job.id}:`, err);
      }
    }
    
    console.log(`Successfully inserted ${inserted} out of ${prodJobs.length} jobs.`);

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    await prodClient.end();
    await testClient.end();
  }
}

main().catch(console.error);
