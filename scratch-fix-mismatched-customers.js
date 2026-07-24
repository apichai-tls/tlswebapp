const { Client } = require('pg');

async function main() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/tls_test";
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Finding all jobs with mismatched customer IDs in Local DB...");
  const res = await client.query(`
    SELECT j.id as "jobId", j."customerName" as "jobCustomerName", j."customerPhone" as "jobCustomerPhone", j."customerId" as "currentCustomerId", c.name as "currentCustomerName"
    FROM "Job" j
    JOIN "Customer" c ON j."customerId" = c.id
    WHERE TRIM(j."customerName") != TRIM(c.name);
  `);

  console.log(`Found ${res.rows.length} mismatched jobs.`);

  let updatedCount = 0;
  for (const row of res.rows) {
    const { jobId, jobCustomerName, jobCustomerPhone, currentCustomerId, currentCustomerName } = row;
    
    // Find customer by name in the Customer table (exact match ignoring leading/trailing spaces)
    const nameToSearch = jobCustomerName.trim();
    const customerRes = await client.query(
      'SELECT id, name, phone FROM "Customer" WHERE TRIM(name) = $1 LIMIT 1;',
      [nameToSearch]
    );

    if (customerRes.rows.length > 0) {
      const correctCustomer = customerRes.rows[0];
      console.log(`Job ${jobId}: Mismatch detected. Job name: "${jobCustomerName}" (Phone: ${jobCustomerPhone}). Current linked customer: "${currentCustomerName}" (ID: ${currentCustomerId}).`);
      console.log(`-> Correct Customer Found: "${correctCustomer.name}" (ID: ${correctCustomer.id}, Phone: ${correctCustomer.phone}).`);
      
      // Update the Job's customerId
      await client.query(
        'UPDATE "Job" SET "customerId" = $1 WHERE id = $2;',
        [correctCustomer.id, jobId]
      );
      console.log(`-> Updated Job ${jobId} with customerId = ${correctCustomer.id}`);
      updatedCount++;
    } else {
      console.log(`Job ${jobId}: Mismatch detected but no customer named "${nameToSearch}" exists in Customer table.`);
    }
  }

  console.log(`\nSuccessfully updated ${updatedCount} jobs in Local DB.`);
  await client.end();
}

main().catch(console.error);
