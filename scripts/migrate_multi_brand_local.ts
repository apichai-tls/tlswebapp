import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Starting Local Multi-Brand Schema Migration ===')

  // 1. Run prisma db push to apply schema changes locally
  console.log('Step 1: Pushing schema changes locally via prisma db push...')
  try {
    execSync('npx prisma db push --accept-data-loss', {
      stdio: 'inherit',
      env: { ...process.env }
    })
    console.log('✔ Prisma db push completed successfully!')
  } catch (err: any) {
    console.error('✘ Prisma db push failed:', err.message)
    process.exit(1)
  }

  // 2. Apply Partial Unique Indexes on PostgreSQL for Brand Isolation
  console.log('Step 2: Applying Partial Unique Indexes on PostgreSQL...')

  // Index 1: Unique Phone for Noname Laundry
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_noname_phone_unique 
    ON "Customer"("phone") 
    WHERE "brand" = 'noname_laundry' 
      AND "phone" IS NOT NULL 
      AND "phone" NOT IN ('', '-', '--', '+66 -', '+66 --');
  `)
  console.log('✔ Created idx_customers_noname_phone_unique')

  // Index 2: Unique Email for Noname Laundry
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_noname_email_unique 
    ON "Customer"("email") 
    WHERE "brand" = 'noname_laundry' 
      AND "email" IS NOT NULL 
      AND "email" NOT IN ('', '-', '--');
  `)
  console.log('✔ Created idx_customers_noname_email_unique')

  // Index 3: Fast lookups by brand
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_customers_brand ON "Customer"("brand");
  `)
  console.log('✔ Created idx_customers_brand')

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_jobs_brand ON "Job"("brand");
  `)
  console.log('✔ Created idx_jobs_brand')

  console.log('=== Local Migration Completed Successfully! ===')
}

main()
  .catch((e) => {
    console.error('Migration error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
