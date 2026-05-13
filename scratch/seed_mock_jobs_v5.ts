import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const roundHalfUp = (val: number) => Math.ceil(val * 2) / 2;

function calculateTotalFee(pickupDist: number, deliveryDist: number): number {
  let total = 0;
  const ratePerKm = 10;
  total += roundHalfUp(pickupDist * 2) * ratePerKm;
  total += roundHalfUp(deliveryDist) * ratePerKm;
  return Math.max(30, total);
}

async function main() {
  console.log("Connecting to database...");
  
  // 1. Delete old jobs and transactions
  console.log("Deleting all existing jobs and transactions...");
  await prisma.riderTransaction.deleteMany({});
  await prisma.job.deleteMany({});
  
  // 2. Reset Rider balances
  console.log("Resetting Rider balances...");
  await prisma.rider.updateMany({
    data: { commissionBalance: 0, completedJobs: 0 }
  });

  // 3. Fetch Customers, Riders, Shops
  const customers = await prisma.customer.findMany();
  const riders = await prisma.rider.findMany();
  const shops = await prisma.shopLocation.findMany();

  if (customers.length === 0 || riders.length === 0) {
    console.error("Please add at least one customer and one rider to the database first.");
    return;
  }

  const riderMap = new Map(riders.map(r => [r.id, r]));
  const shopLat = shops.length > 0 ? shops[0].lat : 13.7367;
  const shopLng = shops.length > 0 ? shops[0].lng : 100.5231;

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
  const year = new Date().getFullYear().toString();
  let currentIdSeq = 1;

  console.log("Generating 100 Jobs for Today...");
  for (let i = 0; i < 100; i++) {
    const isPickupToday = i < 50;
    const customer = getRandomCustomer();
    const distanceTotal = Math.round((Math.random() * 10 + 2) * 10) / 10;
    const pickupDist = Math.round((distanceTotal / 2) * 10) / 10;
    const deliveryDist = Math.round((distanceTotal - pickupDist) * 10) / 10;

    const pickupCommission = Math.floor(pickupDist * 2) * 2;
    const deliveryCommission = Math.floor(deliveryDist) * 2;
    const totalFee = calculateTotalFee(pickupDist, deliveryDist);
    const laundryPrice = Math.floor(Math.random() * 800) + 200; 
    const totalAmount = laundryPrice + totalFee;
    
    let status = "";
    let pickupTime: Date;
    let deliveryTime: Date;
    let pRiderId = null;
    let dRiderId = null;
    let isPickupCompleted = false;
    let isDeliveryCompleted = false;

    if (isPickupToday) {
      pickupTime = getRandomHourMin(today, 8, 17);
      deliveryTime = getRandomHourMin(plusTwoDays, 8, 17);
      pRiderId = getRandomRiderId();
      dRiderId = null;

      if (pickupTime.getHours() < 15) {
        status = "active";
        isPickupCompleted = true;
      } else {
        status = "pickup";
      }
    } else {
      pickupTime = getRandomHourMin(yesterday, 8, 17);
      deliveryTime = getRandomHourMin(today, 8, 17);
      pRiderId = getRandomRiderId();
      dRiderId = getRandomRiderId();
      isPickupCompleted = true;

      if (deliveryTime.getHours() < 15) {
        status = "completed";
        isDeliveryCompleted = true;
      } else {
        status = "delivery";
      }
    }

    const jobId = `${year}${currentIdSeq.toString().padStart(6, '0')}`;
    currentIdSeq++;

    jobsToCreate.push({
      id: jobId,
      type: "full_service",
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      pickupLocation: customer.defaultAddress || "Customer Address",
      dropoffLocation: customer.defaultAddress || "Customer Address",
      pickupLat: customer.defaultLat || 13.7,
      pickupLng: customer.defaultLng || 100.5,
      dropoffLat: customer.defaultLat || 13.7,
      dropoffLng: customer.defaultLng || 100.5,
      distance: distanceTotal,
      pickupDistance: pickupDist,
      deliveryDistance: deliveryDist,
      fee: totalFee,
      pickupCommission: pickupCommission,
      deliveryCommission: deliveryCommission,
      totalAmount: totalAmount,
      status: status,
      createdAt: isPickupToday ? new Date(pickupTime.getTime() - 86400000) : new Date(pickupTime.getTime() - 86400000),
      scheduledAt: pickupTime,
      pickupScheduledAt: pickupTime,
      deliveryScheduledAt: deliveryTime,
      pickupRiderId: pRiderId,
      deliveryRiderId: dRiderId,
      serviceType: "wash_iron_fold",
      paymentMethod: "transfer",
      _isPickupCompleted: isPickupCompleted,
      _isDeliveryCompleted: isDeliveryCompleted
    });
  }

  console.log("Generating 100 Jobs for Tomorrow...");
  for (let i = 0; i < 100; i++) {
    const isPickupTomorrow = i < 50;
    const customer = getRandomCustomer();
    const distanceTotal = Math.round((Math.random() * 10 + 2) * 10) / 10;
    const pickupDist = Math.round((distanceTotal / 2) * 10) / 10;
    const deliveryDist = Math.round((distanceTotal - pickupDist) * 10) / 10;

    const pickupCommission = Math.floor(pickupDist * 2) * 2;
    const deliveryCommission = Math.floor(deliveryDist) * 2;
    const totalFee = calculateTotalFee(pickupDist, deliveryDist);
    const laundryPrice = Math.floor(Math.random() * 800) + 200; 
    const totalAmount = laundryPrice + totalFee;
    
    let status = "";
    let pickupTime: Date;
    let deliveryTime: Date;
    let pRiderId = null;
    let dRiderId = null;
    let isPickupCompleted = false;

    if (isPickupTomorrow) {
      pickupTime = getRandomHourMin(tomorrow, 8, 17);
      deliveryTime = getRandomHourMin(plusThreeDays, 8, 17);
      status = "pending";
      pRiderId = null;
      dRiderId = null;
    } else {
      pickupTime = getRandomHourMin(yesterday, 8, 17);
      deliveryTime = getRandomHourMin(tomorrow, 8, 17);
      status = "active";
      pRiderId = getRandomRiderId();
      dRiderId = null;
      isPickupCompleted = true;
    }

    const jobId = `${year}${currentIdSeq.toString().padStart(6, '0')}`;
    currentIdSeq++;

    jobsToCreate.push({
      id: jobId,
      type: "full_service",
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      pickupLocation: customer.defaultAddress || "Customer Address",
      dropoffLocation: customer.defaultAddress || "Customer Address",
      pickupLat: customer.defaultLat || 13.7,
      pickupLng: customer.defaultLng || 100.5,
      dropoffLat: customer.defaultLat || 13.7,
      dropoffLng: customer.defaultLng || 100.5,
      distance: distanceTotal,
      pickupDistance: pickupDist,
      deliveryDistance: deliveryDist,
      fee: totalFee,
      pickupCommission: pickupCommission,
      deliveryCommission: deliveryCommission,
      totalAmount: totalAmount,
      status: status,
      createdAt: new Date(pickupTime.getTime() - 86400000),
      scheduledAt: pickupTime,
      pickupScheduledAt: pickupTime,
      deliveryScheduledAt: deliveryTime,
      pickupRiderId: pRiderId,
      deliveryRiderId: dRiderId,
      serviceType: "wash_fold",
      paymentMethod: "cash",
      _isPickupCompleted: isPickupCompleted,
      _isDeliveryCompleted: false
    });
  }

  console.log("Inserting 200 Jobs into the database...");
  
  for (const jobData of jobsToCreate) {
    const isPickupCompleted = jobData._isPickupCompleted;
    const isDeliveryCompleted = jobData._isDeliveryCompleted;
    
    delete (jobData as any)._isPickupCompleted;
    delete (jobData as any)._isDeliveryCompleted;

    const job = await prisma.job.create({
      data: jobData
    });

    if (isPickupCompleted && job.pickupRiderId) {
      const rider = riderMap.get(job.pickupRiderId);
      if (rider) {
        rider.commissionBalance += job.pickupCommission!;
        rider.completedJobs += 1;
        await prisma.riderTransaction.create({
          data: {
            riderId: rider.id,
            jobId: job.id,
            amount: job.pickupCommission!,
            type: "commission_pickup",
            detail: `Job ${job.id} - รับผ้า (${job.pickupDistance}km)`
          }
        });
      }
    }

    if (isDeliveryCompleted && job.deliveryRiderId) {
      const rider = riderMap.get(job.deliveryRiderId);
      if (rider) {
        rider.commissionBalance += job.deliveryCommission!;
        rider.completedJobs += 1;
        await prisma.riderTransaction.create({
          data: {
            riderId: rider.id,
            jobId: job.id,
            amount: job.deliveryCommission!,
            type: "commission_delivery",
            detail: `Job ${job.id} - ส่งผ้า (${job.deliveryDistance}km)`
          }
        });
      }
    }
  }

  console.log("Saving updated Rider balances...");
  for (const [_, rider] of riderMap) {
    await prisma.rider.update({
      where: { id: rider.id },
      data: {
        commissionBalance: rider.commissionBalance,
        completedJobs: rider.completedJobs
      }
    });
  }

  console.log("✅ Successfully seeded 200 jobs with correct 2-way data, formulas, and new ID Format (YYYYXXXXXX)!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
