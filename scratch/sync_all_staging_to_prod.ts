import { PrismaClient } from '@prisma/client'

async function syncAll() {
  const stagingUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging?connection_limit=1";
  const prodUrl = "postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres?connection_limit=1";

  const stagingDb = new PrismaClient({ datasourceUrl: stagingUrl });
  const prodDb = new PrismaClient({ datasourceUrl: prodUrl });

  try {
    console.log('Fetching all data from Staging...');
    const shopLocations = await stagingDb.shopLocation.findMany();
    const customers = await stagingDb.customer.findMany();
    const riders = await stagingDb.rider.findMany();
    const jobs = await stagingDb.job.findMany();
    const riderTransactions = await stagingDb.riderTransaction.findMany();
    const serviceItems = await stagingDb.serviceItem.findMany();
    const priceLists = await stagingDb.priceList.findMany();
    const adminUsers = await stagingDb.adminUser.findMany();
    const settings = await stagingDb.setting.findMany();
    const pois = await stagingDb.pOI.findMany();

    console.log(`Fetched data lengths: ShopLocation(${shopLocations.length}), Customer(${customers.length}), Rider(${riders.length}), Job(${jobs.length}), Transaction(${riderTransactions.length}), ServiceItem(${serviceItems.length}), PriceList(${priceLists.length}), AdminUser(${adminUsers.length}), Setting(${settings.length}), POI(${pois.length})`);

    console.log('Clearing Production data (in child-to-parent order)...');
    await prodDb.riderTransaction.deleteMany();
    await prodDb.job.deleteMany();
    await prodDb.rider.deleteMany();
    await prodDb.customer.deleteMany();
    await prodDb.shopLocation.deleteMany();
    await prodDb.serviceItem.deleteMany();
    await prodDb.priceList.deleteMany();
    await prodDb.adminUser.deleteMany();
    await prodDb.setting.deleteMany();
    await prodDb.pOI.deleteMany();

    console.log('Inserting into Production (in parent-to-child order)...');
    if (shopLocations.length > 0) await prodDb.shopLocation.createMany({ data: shopLocations });
    if (customers.length > 0) await prodDb.customer.createMany({ data: customers });
    if (riders.length > 0) await prodDb.rider.createMany({ data: riders });
    if (jobs.length > 0) await prodDb.job.createMany({ data: jobs });
    if (riderTransactions.length > 0) await prodDb.riderTransaction.createMany({ data: riderTransactions });
    if (serviceItems.length > 0) await prodDb.serviceItem.createMany({ data: serviceItems });
    if (priceLists.length > 0) await prodDb.priceList.createMany({ data: priceLists });
    if (adminUsers.length > 0) await prodDb.adminUser.createMany({ data: adminUsers });
    if (settings.length > 0) await prodDb.setting.createMany({ data: settings });
    if (pois.length > 0) await prodDb.pOI.createMany({ data: pois });

    console.log('Full DB sync from Staging to Production completed successfully!');
  } catch (error) {
    console.error('Error syncing databases:', error);
  } finally {
    await stagingDb.$disconnect();
    await prodDb.$disconnect();
  }
}

syncAll().catch(console.error);
