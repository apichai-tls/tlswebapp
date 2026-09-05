import { prisma } from '../src/lib/prisma';

async function backfill() {
  console.log('--- Starting Customer isNew Backfill ---');
  
  // 1. Get total customer count
  const totalCustomers = await prisma.customer.count();
  console.log(`Total customers in database: ${totalCustomers}`);

  // 2. Find all jobs that are completed or paid (and not cancel)
  const paidOrCompletedJobs = await prisma.job.findMany({
    where: {
      status: { not: 'cancel' },
      OR: [
        { status: 'completed' },
        { isPaid: true },
        { isShopPaid: true }
      ]
    },
    select: {
      customerId: true,
      customerPhone: true
    }
  });
  console.log(`Found ${paidOrCompletedJobs.length} eligible paid/completed jobs.`);

  // 3. Extract unique customer IDs and customer phones
  const customerIds = Array.from(new Set(paidOrCompletedJobs.map(j => j.customerId).filter(Boolean))) as string[];
  const customerPhones = Array.from(new Set(paidOrCompletedJobs.map(j => j.customerPhone).filter(Boolean))) as string[];
  console.log(`Unique matched Customer IDs: ${customerIds.length}`);
  console.log(`Unique matched Customer Phones: ${customerPhones.length}`);

  // 4. Update customers who match either customerId or customerPhone to isNew = false
  const updateResult = await prisma.customer.updateMany({
    where: {
      OR: [
        { id: { in: customerIds } },
        { phone: { in: customerPhones } }
      ]
    },
    data: {
      isNew: false
    }
  });
  console.log(`Updated ${updateResult.count} customers to isNew = false.`);

  // 5. Check remaining customers with isNew = true
  const remainingNewCount = await prisma.customer.count({
    where: {
      isNew: true
    }
  });
  console.log(`Remaining genuinely NEW customers (isNew = true): ${remainingNewCount}`);
  console.log('--- Backfill Completed Successfully ---');
}

backfill()
  .catch((err) => {
    console.error('Backfill error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
