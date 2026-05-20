import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Reset completedJobs for all riders
  const riderResult = await prisma.rider.updateMany({
    data: {
      completedJobs: 0
    }
  })
  console.log(`Reset completedJobs for ${riderResult.count} riders`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
