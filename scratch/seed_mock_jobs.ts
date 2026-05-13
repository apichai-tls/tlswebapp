import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to database...");
  
  // 1. Delete old jobs
  console.log("Deleting all existing jobs...");
  await prisma.job.deleteMany({});
  
  // 2. Fetch Customers and Riders
  const customers = await prisma.customer.findMany();
  const riders = await prisma.rider.findMany();
  const shops = await prisma.shopLocation.findMany();

  if (customers.length === 0 || riders.length === 0) {
    console.error("Please add at least one customer and one rider to the database first.");
    return;
  }

  const shopLat = shops.length > 0 ? shops[0].lat : 13.7367;
  const shopLng = shops.length > 0 ? shops[0].lng : 100.5231;
  const shopAddress = shops.length > 0 ? shops[0].address : "Headquarters";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const plusTwoDays = new Date(today);
  plusTwoDays.setDate(plusTwoDays.getDate() + 2);

  const plusThreeDays = new Date(today);
  plusThreeDays.setDate(plusThreeDays.getDate() + 3);

  const getRandomRiderId = () => riders[Math.floor(Math.random() * riders.length)].id;
  const getRandomCustomer = () => customers[Math.floor(Math.random() * customers.length)];
  const getRandomHourMin = (baseDate: Date, minHour: number, maxHour: number) => {
    const d = new Date(baseDate);
    const hour = Math.floor(Math.random() * (maxHour - minHour + 1)) + minHour;
    const min = Math.random() < 0.5 ? 0 : 30;
    d.setHours(hour, min, 0, 0);
    return d;
  };

  const jobsToCreate = [];

  console.log("Generating 100 Jobs for Today...");
  for (let i = 0; i < 100; i++) {
    const isPickupToday = i < 50;
    const customer = getRandomCustomer();
    const distance = Math.round((Math.random() * 10 + 2) * 10) / 10;
    const fee = Math.max(30, Math.ceil(distance * 3) * 10);
    const totalAmount = Math.floor(Math.random() * 800) + 200; // 200 - 999 THB
    
    let status = "";
    let pickupTime: Date;
    let deliveryTime: Date;

    if (isPickupToday) {
      pickupTime = getRandomHourMin(today, 8, 17);
      deliveryTime = getRandomHourMin(plusTwoDays, 8, 17);
      if (pickupTime.getHours() < 15) {
        status = "active"; // Already picked up
      } else {
        status = "pickup"; // Waiting for rider to pick up
      }
    } else {
      pickupTime = getRandomHourMin(yesterday, 8, 17);
      deliveryTime = getRandomHourMin(today, 8, 17);
      if (deliveryTime.getHours() < 15) {
        status = "completed"; // Already delivered
      } else {
        status = "delivery"; // Waiting for rider to deliver
      }
    }

    jobsToCreate.push({
      type: "full_service",
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      pickupLocation: customer.defaultAddress || "Customer Address",
      dropoffLocation: shopAddress,
      pickupLat: customer.defaultLat || 13.7,
      pickupLng: customer.defaultLng || 100.5,
      dropoffLat: shopLat,
      dropoffLng: shopLng,
      distance: distance,
      fee: fee,
      totalAmount: totalAmount,
      status: status,
      createdAt: isPickupToday ? new Date(pickupTime.getTime() - 86400000) : new Date(pickupTime.getTime() - 86400000), // Created 1 day before pickup
      scheduledAt: pickupTime,
      pickupScheduledAt: pickupTime,
      deliveryScheduledAt: deliveryTime,
      pickupRiderId: getRandomRiderId(),
      deliveryRiderId: getRandomRiderId(),
      serviceType: "wash_iron_fold",
      paymentMethod: "transfer"
    });
  }

  console.log("Generating 100 Jobs for Tomorrow...");
  for (let i = 0; i < 100; i++) {
    const isPickupTomorrow = i < 50;
    const customer = getRandomCustomer();
    const distance = Math.round((Math.random() * 10 + 2) * 10) / 10;
    const fee = Math.max(30, Math.ceil(distance * 3) * 10);
    const totalAmount = Math.floor(Math.random() * 800) + 200;
    
    let status = "";
    let pickupTime: Date;
    let deliveryTime: Date;
    let pickupRider = null;

    if (isPickupTomorrow) {
      pickupTime = getRandomHourMin(tomorrow, 8, 17);
      deliveryTime = getRandomHourMin(plusThreeDays, 8, 17);
      status = "pending";
      pickupRider = null; // Unassigned
    } else {
      pickupTime = getRandomHourMin(yesterday, 8, 17);
      deliveryTime = getRandomHourMin(tomorrow, 8, 17);
      status = "active"; // Clothes are in the shop
      pickupRider = getRandomRiderId(); // Was picked up yesterday
    }

    jobsToCreate.push({
      type: "full_service",
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      pickupLocation: customer.defaultAddress || "Customer Address",
      dropoffLocation: shopAddress,
      pickupLat: customer.defaultLat || 13.7,
      pickupLng: customer.defaultLng || 100.5,
      dropoffLat: shopLat,
      dropoffLng: shopLng,
      distance: distance,
      fee: fee,
      totalAmount: totalAmount,
      status: status,
      createdAt: new Date(pickupTime.getTime() - 86400000),
      scheduledAt: pickupTime,
      pickupScheduledAt: pickupTime,
      deliveryScheduledAt: deliveryTime,
      pickupRiderId: pickupRider,
      deliveryRiderId: null, // Unassigned for tomorrow's delivery
      serviceType: "wash_fold",
      paymentMethod: "cash"
    });
  }

  console.log("Inserting 200 Jobs into the database...");
  
  // Use createMany if supported, otherwise loop. SQLite might have issues with large createMany depending on Prisma version, but we are using Postgres.
  await prisma.job.createMany({
    data: jobsToCreate
  });

  console.log("✅ Successfully seeded 200 jobs!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
