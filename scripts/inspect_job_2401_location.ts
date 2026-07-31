import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const jobs = await prisma.job.findMany({
    where: {
      id: {
        contains: '2026002401'
      }
    },
    select: {
      id: true,
      pickupLocation: true,
      pickupLat: true,
      pickupLng: true,
      dropoffLocation: true,
      dropoffLat: true,
      dropoffLng: true,
      legsJson: true,
      customerName: true
    }
  })

  console.log("Job data:", JSON.stringify(jobs, null, 2))
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
