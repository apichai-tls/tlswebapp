import { PrismaClient } from '@prisma/client'

async function syncAll() {
  const testUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_test?connection_limit=1";
  const stagingUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging?connection_limit=1";

  const testDb = new PrismaClient({ datasourceUrl: testUrl });
  const stagingDb = new PrismaClient({ datasourceUrl: stagingUrl });

  try {
    console.log('Fetching all data from Test...');
    const shopLocations = await testDb.shopLocation.findMany();
    const customers = await testDb.customer.findMany();
    const riders = await testDb.rider.findMany();
    const jobs = await testDb.job.findMany();
    const riderTransactions = await testDb.riderTransaction.findMany();
    const serviceItems = await testDb.serviceItem.findMany();
    const priceLists = await testDb.priceList.findMany();
    const adminUsers = await testDb.adminUser.findMany();
    const settings = await testDb.setting.findMany();
    const pois = await testDb.pOI.findMany();

    console.log(`Fetched data lengths: ShopLocation(${shopLocations.length}), Customer(${customers.length}), Rider(${riders.length}), Job(${jobs.length}), Transaction(${riderTransactions.length}), ServiceItem(${serviceItems.length}), PriceList(${priceLists.length}), AdminUser(${adminUsers.length}), Setting(${settings.length}), POI(${pois.length})`);

    console.log('Clearing Staging data (in child-to-parent order)...');
    await stagingDb.riderTransaction.deleteMany();
    await stagingDb.job.deleteMany();
    await stagingDb.rider.deleteMany();
    await stagingDb.customer.deleteMany();
    await stagingDb.shopLocation.deleteMany();
    await stagingDb.serviceItem.deleteMany();
    await stagingDb.priceList.deleteMany();
    await stagingDb.adminUser.deleteMany();
    await stagingDb.setting.deleteMany();
    await stagingDb.pOI.deleteMany();

    console.log('Inserting into Staging (in parent-to-child order)...');
    if (shopLocations.length > 0) await stagingDb.shopLocation.createMany({ data: shopLocations });
    if (customers.length > 0) await stagingDb.customer.createMany({ data: customers });
    if (riders.length > 0) await stagingDb.rider.createMany({ data: riders });
    if (jobs.length > 0) await stagingDb.job.createMany({ data: jobs });
    if (riderTransactions.length > 0) await stagingDb.riderTransaction.createMany({ data: riderTransactions });
    if (serviceItems.length > 0) await stagingDb.serviceItem.createMany({ data: serviceItems });
    if (priceLists.length > 0) await stagingDb.priceList.createMany({ data: priceLists });
    if (adminUsers.length > 0) await stagingDb.adminUser.createMany({ data: adminUsers });
    if (settings.length > 0) await stagingDb.setting.createMany({ data: settings });
    if (pois.length > 0) await stagingDb.pOI.createMany({ data: pois });

    console.log('Full DB sync from Test to Staging completed successfully!');
  } catch (error) {
    console.error('Error syncing databases:', error);
  } finally {
    await testDb.$disconnect();
    await stagingDb.$disconnect();
  }
}

syncAll().catch(console.error);
