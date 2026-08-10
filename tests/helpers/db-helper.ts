import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/crypto";

const prisma = new PrismaClient();

export async function resetAndSeedDatabase() {
  console.log("🧹 Resetting test database...");
  
  // 1. Delete dependent transactional records using raw SQL truncate cascade for FK safety
  const tables = ["ActivityLog", "RiderTransaction", "Job", "Customer", "Rider", "CashierShift", "ShopLocation", "AdminUser", "ServiceItem"];
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    } catch (e: any) {
      // If table is not present, fall back to deleteMany or ignore
      console.warn(`⚠️ Could not truncate "${table}" via SQL, skipping:`, e.message);
    }
  }

  console.log("🌱 Seeding default test database records...");

  // 2. Seed Shop Location (Branch)
  const branch = await prisma.shopLocation.create({
    data: {
      id: "BRANCH-01",
      name: "TLS BKK Main Branch",
      address: "123 Sukhumvit Rd, Bangkok",
      lat: 13.7367,
      lng: 100.5231,
      area: "BKK",
    },
  });

  // 3. Seed Multiple Branches
  const branch2 = await prisma.shopLocation.create({
    data: {
      id: "BRANCH-02",
      name: "TLS BKK Branch 2 (Phrom Phong)",
      address: "456 Sukhumvit 39, Bangkok",
      lat: 13.73,
      lng: 100.56,
      area: "BKK",
      isPosEnabled: true,
    },
  });

  // 4. Seed Admin & Staff Users (Multi-branch & Spectator)
  const adminUser = await prisma.adminUser.create({
    data: {
      id: "USER-ADMIN-01",
      email: "admin@tls.com",
      password: "admin1234",
      name: "Super Admin User",
      role: "admin",
      permissions: JSON.stringify(["jobs", "dispatch", "pos", "customers", "settings", "users", "activity-logs"]),
      area: "BKK",
    },
  });

  const staffBranch1 = await prisma.adminUser.create({
    data: {
      id: "USER-STAFF-01",
      email: "staff1@tls.com",
      password: "staff1234",
      name: "Staff User Branch 1",
      role: "staff",
      permissions: JSON.stringify(["pos", "jobs"]),
      branchId: branch.id,
      area: "BKK",
    },
  });

  const staffBranch2 = await prisma.adminUser.create({
    data: {
      id: "USER-STAFF-02",
      email: "staff2@tls.com",
      password: "staff1234",
      name: "Staff User Branch 2",
      role: "staff",
      permissions: JSON.stringify(["pos", "jobs"]),
      branchId: branch2.id,
      area: "BKK",
    },
  });

  const spectatorUser = await prisma.adminUser.create({
    data: {
      id: "USER-SPECTATOR-01",
      email: "spectator@tls.com",
      password: "spectator1234",
      name: "Spectator View Only User",
      role: "spectator",
      permissions: JSON.stringify(["pos", "jobs"]),
      branchId: branch.id,
      area: "BKK",
    },
  });

  // Open a Cashier Shift so POS tests are not blocked
  await prisma.cashierShift.create({
    data: {
      id: "SHIFT-01",
      branchId: branch.id,
      userId: adminUser.id,
      userName: adminUser.name,
      startingCash: 1000,
      expectedCash: 1000,
      status: "open",
    }
  });

  // 4. Seed Rider
  await prisma.rider.create({
    data: {
      id: "RIDER-01",
      name: "Test Rider One",
      nickname: "Rider 1",
      phone: "0812345678",
      status: "online",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
      branchId: branch.id,
      color: "#3b82f6",
    },
  });

  // 5. Seed Customer
  await prisma.customer.create({
    data: {
      id: "CUSTOMER-01",
      name: "John Doe",
      phone: "0898765432",
      defaultAddress: "456 Rama IX Rd, Bangkok",
      defaultLat: 13.7563,
      defaultLng: 100.5664,
    },
  });

  // 6. Ensure default settings are present
  const defaultSettings = [
    { key: "commission_rate_bkk", value: "10" },
    { key: "commission_rate_pty", value: "12" },
  ];
  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    });
  }

  // 7. Seed Service Items
  await prisma.serviceItem.createMany({
    data: [
      { id: "item-wash-fold", name: "Standard Wash & Fold", price: 80, memberPrice: 70, category: "Weight", unit: "kg" },
      { id: "item-polo", name: "Polo Shirt", price: 50, memberPrice: 40, category: "Clothing", unit: "piece" },
      { id: "item-bedsheet", name: "Bedsheet", price: 120, memberPrice: 100, category: "Bedding", unit: "piece" },
    ],
  });

  // 8. Seed default Jobs
  await prisma.job.create({
    data: {
      id: "2026001045",
      type: "full_service",
      customerId: "CUSTOMER-01",
      customerName: "John Doe",
      customerPhone: "0898765432",
      pickupLocation: "John Doe's House",
      dropoffLocation: "That Laundry Shop",
      pickupLat: 13.7563,
      pickupLng: 100.5664,
      dropoffLat: 13.7367,
      dropoffLng: 100.5231,
      distance: 3.5,
      fee: 40,
      status: "pickup",
      subStatus: null,
      scheduledAt: new Date(),
      pickupScheduledAt: new Date(),
      pickupRiderId: "RIDER-01",
      branchId: "BRANCH-01",
      remark: "Pickup: Leave at Lobby",
      itemsJson: JSON.stringify([{ name: "Polo Shirt", quantity: 2, price: 50 }]),
      legsJson: JSON.stringify({
        pickupOutbound: { status: "pending", completedAt: null },
        pickupInbound: { status: "pending", completedAt: null },
        deliveryOutbound: { status: "pending", completedAt: null },
        deliveryInbound: { status: "pending", completedAt: null }
      })
    }
  });

  await prisma.job.create({
    data: {
      id: "2026001099",
      type: "pickup",
      customerId: "CUSTOMER-01",
      customerName: "John Doe",
      customerPhone: "0898765432",
      pickupLocation: "John Doe's House",
      dropoffLocation: "That Laundry Shop",
      pickupLat: 13.7563,
      pickupLng: 100.5664,
      dropoffLat: 13.7367,
      dropoffLng: 100.5231,
      distance: 3.5,
      fee: 40,
      status: "completed",
      subStatus: null,
      scheduledAt: new Date(),
      pickupScheduledAt: new Date(),
      completedAt: new Date(),
      pickupRiderId: "RIDER-01",
      branchId: "BRANCH-01",
      isPaid: true,
      itemsJson: JSON.stringify([{ name: "Standard Wash & Fold", quantity: 5, price: 80 }]),
    }
  });

  console.log("✅ Seed completed.");
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
