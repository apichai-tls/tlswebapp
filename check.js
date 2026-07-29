const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.adminUser.findMany().then(users => console.log(users.map(u => u.email))).catch(console.error).finally(() => prisma.$disconnect());
