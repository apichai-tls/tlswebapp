import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.adminUser.findMany({
    select: { email: true, password: true, name: true, role: true }
  })
  console.log(users)
}

main().finally(() => prisma.$disconnect())
