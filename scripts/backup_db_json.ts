import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

async function main() {
  console.log('Fetching database tables...')
  const customers = await prisma.customer.findMany()
  const jobs = await prisma.job.findMany()
  const serviceItems = await prisma.serviceItem.findMany()
  const riders = await prisma.rider.findMany()
  const riderTransactions = await prisma.riderTransaction.findMany()
  const priceLists = await prisma.priceList.findMany()
  const shopLocations = await prisma.shopLocation.findMany()
  const pois = await prisma.pOI.findMany()
  const settings = await prisma.setting.findMany()
  const activityLogs = await prisma.activityLog.findMany()
  const adminUsers = await prisma.adminUser.findMany()
  
  const articles = await prisma.article.findMany()
  const bookings = await prisma.booking.findMany()
  const cashierShifts = await prisma.cashierShift.findMany()
  const contactRequests = await prisma.contactRequest.findMany()
  const keywordQueues = await prisma.keywordQueue.findMany()
  const locations = await prisma.location.findMany()
  const membershipRequests = await prisma.membershipRequest.findMany()
  const pricings = await prisma.pricing.findMany()
  const transactions = await prisma.transaction.findMany()
  const websiteAdminUsers = await prisma.website_admin_users.findMany()

  console.log('Compiling backup object...')
  const backupData = {
    customers, jobs, serviceItems, riders, riderTransactions, priceLists, shopLocations, pois, settings, activityLogs, adminUsers,
    articles, bookings, cashierShifts, contactRequests, keywordQueues, locations, membershipRequests, pricings, transactions, websiteAdminUsers
  }

  const outputPath = 'backups/tls_prod_db_data_20260728.json'
  console.log(`Writing to ${outputPath}...`)
  fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2))
  console.log('Backup complete!')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
