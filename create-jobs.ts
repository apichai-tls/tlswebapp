import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bkkBranch = await prisma.shopLocation.findFirst({ where: { area: 'BKK' } });
  const ptyBranch = await prisma.shopLocation.findFirst({ where: { area: 'PTY' } });

  if (!bkkBranch || !ptyBranch) {
    console.error("Could not find branches for BKK or PTY");
    return;
  }

  const legsBkk = {
    pickupOutbound: { status: "pending", scheduledAt: new Date() },
    pickupInbound: { status: "pending", scheduledAt: new Date() },
    deliveryOutbound: { status: "pending", scheduledAt: new Date(Date.now() + 86400000) },
    deliveryInbound: { status: "pending", scheduledAt: new Date(Date.now() + 86400000) }
  };

  // Create BKK Job
  await prisma.job.create({
    data: {
      customerName: "Khun Somchai (Random BKK)",
      customerPhone: "0812345678",
      pickupLocation: "Siam Paragon, Bangkok",
      dropoffLocation: "Central World, Bangkok",
      pickupLat: 13.7462, pickupLng: 100.5348,
      dropoffLat: 13.7468, dropoffLng: 100.5393,
      scheduledAt: new Date(),
      status: "pending",
      paymentMethod: "cash",
      isPaid: false,
      fee: 60,
      totalAmount: 280,
      serviceType: "wash_fold",
      source: "pos",
      distance: 5.2,
      branchId: bkkBranch.id,
      type: "full_service",
      legsJson: JSON.stringify(legsBkk)
    }
  });

  const legsPty = {
    pickupOutbound: { status: "pending", scheduledAt: new Date() },
    pickupInbound: { status: "pending", scheduledAt: new Date() },
    deliveryOutbound: { status: "pending", scheduledAt: new Date(Date.now() + 86400000) },
    deliveryInbound: { status: "pending", scheduledAt: new Date(Date.now() + 86400000) }
  };

  // Create PTY Job
  await prisma.job.create({
    data: {
      customerName: "Khun Somsri (Random PTY)",
      customerPhone: "0898765432",
      pickupLocation: "Central Festival, Pattaya",
      dropoffLocation: "Terminal 21, Pattaya",
      pickupLat: 12.9348, pickupLng: 100.8824,
      dropoffLat: 12.9501, dropoffLng: 100.8887,
      scheduledAt: new Date(),
      status: "pending",
      paymentMethod: "transfer",
      isPaid: true,
      fee: 80,
      totalAmount: 300,
      serviceType: "wash_iron_fold",
      source: "pos",
      distance: 8.5,
      branchId: ptyBranch.id,
      type: "full_service",
      legsJson: JSON.stringify(legsPty)
    }
  });

  console.log("Jobs created successfully!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
