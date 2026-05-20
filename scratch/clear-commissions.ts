import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Delete all rider transactions
  const transactionResult = await prisma.riderTransaction.deleteMany()
  console.log(`Deleted ${transactionResult.count} rider transactions`)

  // Reset commission balance for all riders
  const riderResult = await prisma.rider.updateMany({
    data: {
      commissionBalance: 0
    }
  })
  console.log(`Reset commission balance for ${riderResult.count} riders`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
