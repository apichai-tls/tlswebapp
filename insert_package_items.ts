import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const packageItems = [
  {
    id: "PAC-PAC-001",
    name: "PACKAGE (CUSTOM)",
    nameEn: "Package (Custom)",
    price: 0,
    memberPrice: 0,
    category: "PACKAGE",
    unit: "pack"
  },
  {
    id: "PAC-001",
    name: "แพ็กเกจซักรีด ฿2,000",
    nameEn: "Laundry Package ฿2,000",
    price: 2000,
    memberPrice: 2000,
    category: "PACKAGE",
    unit: "pack"
  },
  {
    id: "PAC-002",
    name: "แพ็กเกจซักรีด ฿3,000",
    nameEn: "Laundry Package ฿3,000",
    price: 3000,
    memberPrice: 3150,
    category: "PACKAGE",
    unit: "pack"
  },
  {
    id: "PAC-003",
    name: "แพ็กเกจซักรีด ฿5,000",
    nameEn: "Laundry Package ฿5,000",
    price: 5000,
    memberPrice: 5300,
    category: "PACKAGE",
    unit: "pack"
  },
  {
    id: "PAC-004",
    name: "แพ็กเกจซักรีด ฿6,000",
    nameEn: "Laundry Package ฿6,000",
    price: 6000,
    memberPrice: 6600,
    category: "PACKAGE",
    unit: "pack"
  },
  {
    id: "PAC-005",
    name: "แพ็กเกจซักรีด ฿10,000",
    nameEn: "Laundry Package ฿10,000",
    price: 10000,
    memberPrice: 11500,
    category: "PACKAGE",
    unit: "pack"
  }
];

async function main() {
  console.log('Deleting existing PACKAGE category service items...');
  await prisma.serviceItem.deleteMany({
    where: {
      category: 'PACKAGE'
    }
  });

  console.log('Inserting package items...');
  for (const item of packageItems) {
    await prisma.serviceItem.create({
      data: item
    });
    console.log(`- Inserted: ${item.name} (${item.id})`);
  }

  console.log('Successfully completed!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
