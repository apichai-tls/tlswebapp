import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const jobs = await prisma.job.findMany({
    where: {
      id: {
        contains: '2026002402'
      }
    },
    select: {
      id: true,
      pickupProofImageUrl: true,
      deliveryProofImageUrl: true,
      status: true,
      subStatus: true
    }
  })

  console.log("Found jobs:", JSON.stringify(jobs, null, 2))
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
