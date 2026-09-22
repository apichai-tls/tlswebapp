import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Starting Pre-Multi-Brand DB Backup ---')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(process.cwd(), 'backups')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const outputPath = path.join(backupDir, `backup_${timestamp}_pre_multibrand.json`)
  console.log(`Target: ${outputPath}`)

  console.log('Fetching tables...')
  const [
    customers,
    jobs,
    serviceItems,
    riders,
    riderTransactions,
    priceLists,
    shopLocations,
    pois,
    settings,
    cashierShifts,
    transactions,
    jobRefunds
  ] = await Promise.all([
    prisma.customer.findMany(),
    prisma.job.findMany(),
    prisma.serviceItem.findMany(),
    prisma.rider.findMany(),
    prisma.riderTransaction.findMany(),
    prisma.priceList.findMany(),
    prisma.shopLocation.findMany(),
    prisma.pOI.findMany(),
    prisma.setting.findMany(),
    prisma.cashierShift.findMany(),
    prisma.transaction.findMany(),
    prisma.jobRefund.findMany()
  ])

  console.log(`Counts:
- Customers: ${customers.length}
- Jobs: ${jobs.length}
- ServiceItems: ${serviceItems.length}
- Riders: ${riders.length}
- Settings: ${settings.length}
- CashierShifts: ${cashierShifts.length}
- Transactions: ${transactions.length}
- JobRefunds: ${jobRefunds.length}`)

  const backupData = {
    metadata: {
      createdAt: new Date().toISOString(),
      reason: 'Pre Multi-Brand CRM schema migration'
    },
    customers,
    jobs,
    serviceItems,
    riders,
    riderTransactions,
    priceLists,
    shopLocations,
    pois,
    settings,
    cashierShifts,
    transactions,
    jobRefunds
  }

  fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2), 'utf-8')
  const stats = fs.statSync(outputPath)
  console.log(`Backup completed successfully! Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`)
}

main()
  .catch(e => {
    console.error('Backup failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
