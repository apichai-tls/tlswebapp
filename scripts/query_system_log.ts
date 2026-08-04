import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const job = await prisma.job.findUnique({ where: { id: '2026002420' } })
  console.log('Job Type:', job?.type, 'Source:', job?.source)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
