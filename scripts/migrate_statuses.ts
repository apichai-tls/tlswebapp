import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.job.updateMany({
    where: {
      status: {
        in: ['picked_up', 'ready_to_wash', 'washed']
      }
    },
    data: {
      status: 'billing'
    }
  });
  console.log(`Updated ${count.count} jobs.`);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
