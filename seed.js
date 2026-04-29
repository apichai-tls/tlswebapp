require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const dbPath = path.join(__dirname, 'src', 'lib', 'data', 'mock-db.json');

async function main() {
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  console.log('Seeding customers...');
  for (const c of data.customers || []) {
    await prisma.customer.create({
      data: {
        id: c.id,
        name: c.name,
        phone: c.phone,
        defaultAddress: c.defaultAddress,
        defaultLat: c.defaultCoords?.lat || 0,
        defaultLng: c.defaultCoords?.lng || 0,
        priceListId: c.priceListId,
        creditBalance: c.creditBalance || 0,
        tier: c.tier,
        isMember: c.isMember || false,
      }
    });
  }

  console.log('Seeding shop locations...');
  for (const s of data.shopLocations || []) {
    await prisma.shopLocation.create({
      data: {
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.coords?.lat || 0,
        lng: s.coords?.lng || 0,
      }
    });
  }

  console.log('Seeding services...');
  for (const s of data.services || []) {
    await prisma.serviceItem.create({
      data: {
        id: s.id,
        name: s.name,
        price: s.price,
        memberPrice: s.memberPrice,
        category: s.category,
        unit: s.unit,
      }
    });
  }

  console.log('Seeding riders...');
  for (const r of data.riders || []) {
    await prisma.rider.create({
      data: {
        id: r.id,
        name: r.name,
        phone: r.phone,
        status: r.status,
        currentLat: r.currentLocation?.lat,
        currentLng: r.currentLocation?.lng,
        avatarUrl: r.avatarUrl,
        rating: r.rating || 5,
        completedJobs: r.completedJobs || 0,
        nationalId: r.nationalId,
        vehicleType: r.vehicleType,
        vehiclePlate: r.vehiclePlate,
      }
    });
  }

  console.log('Seeding POIs...');
  for (const p of data.pois || []) {
    await prisma.pOI.create({
      data: {
        id: p.id,
        name: p.name,
        address: p.address,
        lat: p.coords?.lat || 0,
        lng: p.coords?.lng || 0,
      }
    });
  }

  console.log('Seeding settings...');
  for (const [key, value] of Object.entries(data.settings || {})) {
    await prisma.setting.create({
      data: { key, value: String(value) }
    });
  }

  console.log('Seeding price lists...');
  for (const pl of data.priceLists || []) {
    await prisma.priceList.create({
      data: {
        id: pl.id,
        name: pl.name,
        isDefault: pl.isDefault || false,
        servicePrices: JSON.stringify(pl.servicePrices || {}),
      }
    });
  }

  console.log('Seeding jobs...');
  for (const j of data.jobs || []) {
    await prisma.job.create({
      data: {
        id: j.id,
        type: j.type || 'full_service',
        customerId: j.customerId,
        customerName: j.customerName,
        customerPhone: j.customerPhone,
        pickupLocation: j.pickupLocation,
        dropoffLocation: j.dropoffLocation,
        pickupLat: j.pickupCoords?.lat || 0,
        pickupLng: j.pickupCoords?.lng || 0,
        dropoffLat: j.dropoffCoords?.lat || 0,
        dropoffLng: j.dropoffCoords?.lng || 0,
        distance: j.distance || 0,
        fee: j.fee || 0,
        status: j.status,
        createdAt: j.createdAt ? new Date(j.createdAt) : new Date(),
        scheduledAt: j.scheduledAt ? new Date(j.scheduledAt) : new Date(),
        completedAt: j.completedAt ? new Date(j.completedAt) : null,
        proofImageUrl: j.proofImageUrl,
        riderId: j.riderId,
        bagImageUrl: j.bagImageUrl,
        serviceType: j.serviceType,
        source: j.source,
        totalAmount: j.totalAmount,
        paymentMethod: j.paymentMethod,
        discount: j.discount || 0,
        pickupScheduledAt: j.pickupScheduledAt ? new Date(j.pickupScheduledAt) : null,
        deliveryScheduledAt: j.deliveryScheduledAt ? new Date(j.deliveryScheduledAt) : null,
        pickupRiderId: j.pickupRiderId,
        deliveryRiderId: j.deliveryRiderId,
        itemsJson: j.items ? JSON.stringify(j.items) : null,
        legsJson: j.legs ? JSON.stringify(j.legs) : null,
        remark: j.remark,
      }
    });
  }

  console.log('Seed completed.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
