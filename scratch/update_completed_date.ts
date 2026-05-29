import { PrismaClient } from '@prisma/client';

async function run() {
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";
  const prisma = new PrismaClient({ datasourceUrl: prodUrl });

  try {
    const job = await prisma.job.findUnique({
      where: { id: '2026000148' }
    });

    if (!job) {
      console.error('Job 2026000148 not found in Production DB.');
      return;
    }

    console.log('--- CURRENT JOB STATE ---');
    console.log(`ID: ${job.id}`);
    console.log(`Status: ${job.status}`);
    console.log(`CompletedAt: ${job.completedAt}`);
    console.log(`LegsJson: ${job.legsJson}`);

    // Let's parse and construct the updated legsJson
    let updatedLegs = null;
    if (job.legsJson) {
      try {
        const legs = JSON.parse(job.legsJson);
        
        legs.deliveryOutbound = {
          ...legs.deliveryOutbound,
          status: 'completed',
          completedAt: '2026-05-23T09:40:26.347Z'
        };

        legs.deliveryInbound = {
          ...legs.deliveryInbound,
          status: 'completed',
          completedAt: '2026-05-23T09:40:26.347Z'
        };

        updatedLegs = JSON.stringify(legs);
      } catch (e: any) {
        console.error('Failed to parse legsJson:', e.message);
      }
    }

    const targetCompletedAt = new Date('2026-05-23T09:40:26.347Z');

    console.log('\n--- PLANNED UPDATES ---');
    console.log(`New CompletedAt: ${targetCompletedAt.toISOString()}`);
    console.log(`New LegsJson: ${updatedLegs}`);

    // Perform update
    const updatedJob = await prisma.job.update({
      where: { id: '2026000148' },
      data: {
        completedAt: targetCompletedAt,
        legsJson: updatedLegs
      }
    });

    console.log('\n--- SUCCESS ---');
    console.log('Updated Job State in DB:');
    console.log(`ID: ${updatedJob.id}`);
    console.log(`Status: ${updatedJob.status}`);
    console.log(`CompletedAt: ${updatedJob.completedAt}`);
    console.log(`LegsJson: ${updatedJob.legsJson}`);

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
