const { PrismaClient } = require('@prisma/client');

async function main() {
  const stagingPrisma = new PrismaClient({
    datasourceUrl: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/tls_staging',
  });

  console.log("Querying Staging for 'piti'...");
  const stagingRiders = await stagingPrisma.$queryRaw`SELECT * FROM "Rider" WHERE name ILIKE '%piti%' OR nickname ILIKE '%piti%'`;
  console.log("Staging riders found:", stagingRiders);

  if (stagingRiders.length > 0) {
    const piti = stagingRiders[0];
    console.log("Found target rider:", piti.id, piti.name);
    
    // Check if it exists in production
    const prodPrisma = new PrismaClient({
      datasourceUrl: 'postgresql://postgres:_%5B%3Al%7C%40tQ)rv%5B1259@34.10.25.133:5432/postgres',
    });

    try {
      console.log("Checking Production...");
      const prodCheck = await prodPrisma.$queryRaw`SELECT * FROM "Rider" WHERE id = ${piti.id}`;
      if (prodCheck.length > 0) {
        console.log("Rider already exists in Production!");
      } else {
        console.log("Rider not found in Production. Proceeding to restore...");
        // Exclude the 'color' column from the insert if it doesn't exist in prod yet, 
        // or just insert all standard columns. 
        // We'll push the schema to prod later if needed, but for now we just want to restore.
        await prodPrisma.$queryRaw`
          INSERT INTO "Rider" 
          ("id", "name", "nickname", "phone", "status", "currentLat", "currentLng", "avatarUrl", "rating", "completedJobs", "commissionBalance", "nationalId", "vehicleType", "vehiclePlate", "branchId") 
          VALUES 
          (${piti.id}, ${piti.name}, ${piti.nickname}, ${piti.phone}, ${piti.status}, ${piti.currentLat}, ${piti.currentLng}, ${piti.avatarUrl}, ${piti.rating}, ${piti.completedJobs}, ${piti.commissionBalance}, ${piti.nationalId}, ${piti.vehicleType}, ${piti.vehiclePlate}, ${piti.branchId})
        `;
        console.log("Successfully restored to Production!");
      }
    } catch (err) {
      console.error("Production Error:", err);
    } finally {
      await prodPrisma.$disconnect();
    }
  }

  await stagingPrisma.$disconnect();
}

main().catch(console.error);
