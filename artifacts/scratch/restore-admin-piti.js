const { PrismaClient } = require('@prisma/client');

async function main() {
  const stagingPrisma = new PrismaClient({
    datasourceUrl: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging',
  });

  const prodPrisma = new PrismaClient({
    datasourceUrl: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres',
  });

  try {
    const stagingUsers = await stagingPrisma.$queryRaw`SELECT * FROM "AdminUser" WHERE email = 'piti_03@tls.com'`;
    if (stagingUsers.length > 0) {
      const piti = stagingUsers[0];
      console.log("Found in staging:", piti.email, piti.id);

      const prodCheck = await prodPrisma.$queryRaw`SELECT * FROM "AdminUser" WHERE email = 'piti_03@tls.com'`;
      if (prodCheck.length > 0) {
        console.log("Already exists in production");
      } else {
        await prodPrisma.$queryRaw`
          INSERT INTO "AdminUser" 
          ("id", "email", "password", "name", "role", "permissions", "area", "createdAt", "updatedAt") 
          VALUES 
          (${piti.id}, ${piti.email}, ${piti.password}, ${piti.name}, ${piti.role}, ${piti.permissions}, ${piti.area}, ${piti.createdAt}, ${piti.updatedAt})
        `;
        console.log("Successfully restored Piti to Production AdminUser table!");
      }
    } else {
      console.log("Not found in staging either.");
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await stagingPrisma.$disconnect();
    await prodPrisma.$disconnect();
  }
}

main();
