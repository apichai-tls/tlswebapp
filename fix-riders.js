const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const riders = await prisma.rider.findMany();
  for (const r of riders) {
    if (r.avatarUrl && r.avatarUrl.startsWith('blob:')) {
      const newUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name)}&background=0D8ABC&color=fff&size=150`;
      await prisma.rider.update({
        where: { id: r.id },
        data: { avatarUrl: newUrl }
      });
      console.log('Fixed:', r.name);
    }
  }
}

main().finally(() => prisma.$disconnect());
