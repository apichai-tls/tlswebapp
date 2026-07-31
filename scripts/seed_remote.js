const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:%40K0tApq9R%40(CEQk%22@34.10.25.133:5432/tls_test?sslmode=no-verify"
    }
  }
});

async function seed() {
  console.log("Seeding...");
  try {
    await prisma.shopLocation.create({
      data: { id: "BRANCH-01", name: "TLS BKK", address: "BKK", lat: 13, lng: 100, area: "BKK", isPosEnabled: true }
    });
    await prisma.shopLocation.create({
      data: { id: "BRANCH-02", name: "Pattaya Branch", address: "PTY", lat: 12, lng: 100, area: "PTY", isPosEnabled: false }
    });
    await prisma.adminUser.create({
      data: { id: "ADMIN-01", email: "admin@tls.com", password: "123", name: "Admin", role: "admin", permissions: "[]" }
    });
    await prisma.adminUser.create({
      data: { id: "MGR-01", email: "ekachai@tls.com", password: "123", name: "Ekachai", role: "manager", area: "PTY", permissions: "[]" }
    });
    console.log("Done!");
  } catch(e) { console.error(e.message); }
}
seed().finally(() => process.exit(0));
