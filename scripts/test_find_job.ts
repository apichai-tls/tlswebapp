import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Fetching Job 2026000866 ---');
  const job = await prisma.job.findUnique({
    where: { id: '2026000866' }
  });

  if (!job) {
    console.log('Job not found.');
    // Let's also search for jobs with similar IDs or recently updated jobs with proof images
    const sampleJobs = await prisma.job.findMany({
      where: {
        OR: [
          { proofImageUrl: { not: null } },
          { pickupProofImageUrl: { not: null } },
          { deliveryProofImageUrl: { not: null } }
        ]
      },
      take: 5
    });
    console.log('Sample jobs with proof images:');
    sampleJobs.forEach(j => {
      console.log(`ID: ${j.id}, type: ${j.type}, status: ${j.status}`);
      console.log(`  pickupProofImageUrl: ${j.pickupProofImageUrl}`);
      console.log(`  deliveryProofImageUrl: ${j.deliveryProofImageUrl}`);
      console.log(`  proofImageUrl: ${j.proofImageUrl}`);
    });
    return;
  }

  console.log('Job details:');
  console.log(JSON.stringify(job, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
