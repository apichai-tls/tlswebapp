import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Starting status migration...');

  // Map old statuses -> new statuses
  const migrations = [
    // All "in-shop" / "processing" phases -> billing
    { from: ['picked_up', 'ready_to_wash', 'washed'], to: 'billing' },
    // "active" / "accepted" -> pickup (rider has accepted but not confirmed pickup yet)
    { from: ['active', 'accepted'], to: 'pickup' },
  ];

  for (const { from, to } of migrations) {
    const result = await prisma.job.updateMany({
      where: {
        status: { in: from }
      },
      data: {
        status: to
      }
    });
    console.log(`Migrated ${result.count} jobs from [${from.join(', ')}] -> "${to}"`);
  }

  console.log('Migration complete.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
