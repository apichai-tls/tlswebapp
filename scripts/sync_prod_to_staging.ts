import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

async function wipeDatabase() {
  console.log('Wiping staging database...')
  
  // Wiping from child to parent to avoid foreign key constraints
  await prisma.activityLog.deleteMany()
  await prisma.riderTransaction.deleteMany()
  await prisma.job.deleteMany()
  await prisma.booking.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.rider.deleteMany()
  await prisma.cashierShift.deleteMany()
  await prisma.adminUser.deleteMany()
  await prisma.shopLocation.deleteMany()
  await prisma.serviceItem.deleteMany()
  await prisma.priceList.findMany().then(async (priceLists) => {
    // some priceLists might have relations, but they are generally standalone
    await prisma.priceList.deleteMany()
  })
  await prisma.pOI.deleteMany()
  await prisma.setting.deleteMany()
  await prisma.article.deleteMany()
  await prisma.contactRequest.deleteMany()
  await prisma.keywordQueue.deleteMany()
  await prisma.location.deleteMany()
  await prisma.membershipRequest.deleteMany()
  await prisma.pricing.deleteMany()
  await prisma.website_admin_users.deleteMany()

  console.log('Staging database wiped successfully.')
}

async function seedDatabase(backupData: any) {
  console.log('Seeding staging database...')

  // Insert parents first
  if (backupData.shopLocations?.length) await prisma.shopLocation.createMany({ data: backupData.shopLocations })
  if (backupData.websiteAdminUsers?.length) await prisma.website_admin_users.createMany({ data: backupData.websiteAdminUsers })
  if (backupData.customers?.length) await prisma.customer.createMany({ data: backupData.customers })
  if (backupData.riders?.length) await prisma.rider.createMany({ data: backupData.riders })
  if (backupData.adminUsers?.length) await prisma.adminUser.createMany({ data: backupData.adminUsers })
  if (backupData.cashierShifts?.length) await prisma.cashierShift.createMany({ data: backupData.cashierShifts })
  
  // Insert children
  if (backupData.jobs?.length) await prisma.job.createMany({ data: backupData.jobs })
  if (backupData.transactions?.length) await prisma.transaction.createMany({ data: backupData.transactions })
  if (backupData.bookings?.length) await prisma.booking.createMany({ data: backupData.bookings })
  if (backupData.riderTransactions?.length) await prisma.riderTransaction.createMany({ data: backupData.riderTransactions })
  if (backupData.activityLogs?.length) await prisma.activityLog.createMany({ data: backupData.activityLogs })

  // Independent entities
  if (backupData.serviceItems?.length) await prisma.serviceItem.createMany({ data: backupData.serviceItems })
  if (backupData.priceLists?.length) await prisma.priceList.createMany({ data: backupData.priceLists })
  if (backupData.pois?.length) await prisma.pOI.createMany({ data: backupData.pois })
  if (backupData.settings?.length) await prisma.setting.createMany({ data: backupData.settings })
  if (backupData.articles?.length) await prisma.article.createMany({ data: backupData.articles })
  if (backupData.contactRequests?.length) await prisma.contactRequest.createMany({ data: backupData.contactRequests })
  if (backupData.keywordQueues?.length) await prisma.keywordQueue.createMany({ data: backupData.keywordQueues })
  if (backupData.locations?.length) await prisma.location.createMany({ data: backupData.locations })
  if (backupData.membershipRequests?.length) await prisma.membershipRequest.createMany({ data: backupData.membershipRequests })
  if (backupData.pricings?.length) await prisma.pricing.createMany({ data: backupData.pricings })

  console.log('Staging database seeded successfully.')
}

async function main() {
  console.log('Loading backup file...')
  const backupData = JSON.parse(fs.readFileSync('backups/tls_prod_db_data_20260728.json', 'utf-8'))
  
  await wipeDatabase()
  await seedDatabase(backupData)
  
  console.log('Sync complete!')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
