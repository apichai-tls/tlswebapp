const { Client } = require('pg');

const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres";

async function clearProd() {
  console.log("Connecting to Production database...");
  const client = new Client({ 
    connectionString: prodUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log("Connected.");

  try {
    console.log("Starting deletion of Customers, Jobs, and RiderTransactions on Prod...");
    
    console.log("Truncating RiderTransaction...");
    await client.query('TRUNCATE TABLE "RiderTransaction" CASCADE;');
    
    console.log("Truncating Job...");
    await client.query('TRUNCATE TABLE "Job" CASCADE;');
    
    console.log("Truncating Customer...");
    await client.query('TRUNCATE TABLE "Customer" CASCADE;');
    
    console.log("Resetting Rider completedJobs and commissionBalance to 0...");
    await client.query('UPDATE "Rider" SET "completedJobs" = 0, "commissionBalance" = 0;');

    console.log("Production data cleanup completed successfully!");
  } catch (err) {
    console.error("Error during cleanup:", err);
  } finally {
    await client.end();
  }
}

clearProd();
