const { PrismaClient } = require('@prisma/client');

const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?sslmode=no-verify";

async function main() {
  const prodPrisma = new PrismaClient({
    datasources: {
      db: {
        url: prodUrl,
      },
    },
  });
  
  const testPrisma = new PrismaClient();

  console.log("Connecting to databases...");
  await prodPrisma.$connect();
  await testPrisma.$connect();
  console.log("Connected.");

  console.log("Fetching data from Prod...");
  const customers = await prodPrisma.customer.findMany();
  const jobs = await prodPrisma.$queryRaw`SELECT * FROM "Job"`;
  const riders = await prodPrisma.rider.findMany();
  const riderTransactions = await prodPrisma.riderTransaction.findMany();
  console.log(`Found ${customers.length} customers, ${jobs.length} jobs, ${riders.length} riders, ${riderTransactions.length} transactions.`);

  // Clear Test DB (we don't delete Customer/Rider to avoid FK issues with other tables, just upsert them)
  console.log("Deleting old Jobs and RiderTransactions from Test DB...");
  await testPrisma.riderTransaction.deleteMany({});
  await testPrisma.job.deleteMany({});
  
  console.log("Upserting Customers to Test DB...");
  for (const c of customers) {
    await testPrisma.customer.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }

  console.log("Upserting Riders to Test DB...");
  for (const r of riders) {
    await testPrisma.rider.upsert({
      where: { id: r.id },
      update: r,
      create: r,
    });
  }

  console.log("Inserting RiderTransactions to Test DB...");
  for (const rt of riderTransactions) {
    await testPrisma.riderTransaction.create({
      data: rt
    });
  }

  console.log("Inserting Jobs to Test DB...");
  for (let j of jobs) {
    // Map serviceType to laundryTypes if present
    if (!j.laundryTypes) {
      if (j.serviceType === 'wash_iron_fold') {
        j.laundryTypes = "W,I,F";
      } else if (j.serviceType === 'wash_fold') {
        j.laundryTypes = "W,F";
      }
    }

    try {
      await testPrisma.job.create({
        data: j
      });
    } catch (e) {
      console.error(`Failed to insert job ${j.id}: ${e.message}`);
    }
  }

  console.log("Migration completed.");
  await prodPrisma.$disconnect();
  await testPrisma.$disconnect();
}

main().catch(console.error);
