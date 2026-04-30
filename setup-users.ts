import { PrismaClient } from '@prisma/client';

const prodUrl = "postgresql://postgres.nynjbpeizpueantiedio:2wRZVD3KHLGMxQw2@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true";
const stageUrl = "postgresql://postgres.liqoqtrztogxssgrgjcq:MhM2TSv%25-*P%23aWn@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

const prismaProd = new PrismaClient({ datasources: { db: { url: prodUrl } } });
const prismaStage = new PrismaClient({ datasources: { db: { url: stageUrl } } });

async function createTable(prisma: PrismaClient, name: string) {
  try {
    console.log(`Creating AdminUser table on ${name}...`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminUser" (
          "id" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "role" TEXT NOT NULL DEFAULT 'staff',
          "permissions" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Attempt to create index, ignore if it exists
    try {
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");`);
    } catch (e) {}

    console.log(`Seeding default admin on ${name}...`);
    // Create default admin if not exists
    await prisma.$executeRawUnsafe(`
      INSERT INTO "AdminUser" ("id", "email", "password", "name", "role", "permissions", "updatedAt")
      VALUES ('admin_seed', 'admin@tls.com', 'admin1234', 'Super Admin', 'admin', '["dashboard","jobs","customers","dispatch","riders","map","calculator","settings","users"]', CURRENT_TIMESTAMP)
      ON CONFLICT ("email") DO NOTHING;
    `);
    
    console.log(`${name} setup complete!`);
  } catch (error) {
    console.error(`Failed on ${name}:`, error);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await createTable(prismaProd, "Production");
  await createTable(prismaStage, "Staging");
}

main();
