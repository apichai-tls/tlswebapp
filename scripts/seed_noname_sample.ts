import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Seeding 1 Sample Customer from Noname Laundry ===')

  const testEmail = 'alex.smith@example.com'
  const testPhone = '+66 82 455 9182'

  // 1. Clean up any previous test record with this phone/email in noname_laundry
  const existing = await prisma.customer.findFirst({
    where: {
      OR: [
        { phone: testPhone, brand: 'noname_laundry' },
        { email: testEmail, brand: 'noname_laundry' }
      ]
    }
  })

  if (existing) {
    console.log(`Found existing test customer (${existing.id}), cleaning up first...`)
    await prisma.job.deleteMany({ where: { customerId: existing.id } })
    await prisma.customer.delete({ where: { id: existing.id } })
  }

  // 2. Create the Noname Laundry customer
  const customer = await prisma.customer.create({
    data: {
      name: 'ALEXANDER SMITH',
      nickName: 'Alex',
      gender: 'Male',
      dob: '1992-05-15',
      phone: testPhone,
      isWhatsapp: true,
      email: testEmail,
      lineId: '@alex_bkk',
      brand: 'noname_laundry',
      sourceSystem: 'web_booking',
      isVerified: true,
      verifiedVia: 'sms',
      tier: 'Regular',
      remark: 'ลูกค้าใหม่จากเว็บ Noname — แพ้น้ำหอมปรับผ้านุ่ม ขอสูตรอ่อนโยน',
      defaultAddress: 'The Estelle Phrom Phong, Sukhumvit 26',
      defaultLat: 13.731234,
      defaultLng: 100.569876,
      roomNo: '1802',
      secondaryAddress: 'Room 1802, Fl. 18 (The Estelle)',
      addresses: {
        create: {
          label: 'Home Condo',
          placeName: 'The Estelle Phrom Phong',
          placeId: 'ChIJ1234567890abcdef',
          latitude: 13.731234,
          longitude: 100.569876,
          googleMapsUrl: 'https://maps.google.com/?q=13.731234,100.569876',
          address: '8 Sukhumvit 26, Khlong Tan',
          roomNumber: '1802, Floor 18',
          subDistrict: 'Khlong Tan',
          district: 'Khlong Toei',
          province: 'Bangkok',
          postalCode: '10110',
          contactName: 'Alexander Smith',
          contactPhone: testPhone,
          leaveWithJuristic: true,
          deliveryNote: 'ฝากถุงผ้าไว้กับนิติบุคคลล็อบบี้ชั้น 1 ได้เลย',
          isPrimary: true
        }
      }
    },
    include: {
      addresses: true
    }
  })

  console.log(`✔ Created Customer:
- ID: ${customer.id}
- Name: ${customer.name} (Nick: ${customer.nickName})
- Phone: ${customer.phone}
- Email: ${customer.email}
- Brand: ${customer.brand}
- Source: ${customer.sourceSystem}
- Primary Address: ${customer.addresses[0]?.placeName} (Room: ${customer.addresses[0]?.roomNumber})`)

  // 3. Create 1 Sample Booking Job for this customer (Flow A - Pending Pickup)
  const scheduledTime = new Date()
  scheduledTime.setHours(scheduledTime.getHours() + 2) // 2 hours from now

  const job = await prisma.job.create({
    data: {
      type: 'pickup',
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      pickupLocation: 'The Estelle Phrom Phong, Room 1802',
      pickupLat: 13.731234,
      pickupLng: 100.569876,
      dropoffLocation: 'That Laundry Shop (Store)',
      dropoffLat: 13.736717,
      dropoffLng: 100.523186,
      distance: 3.8,
      fee: 40,
      status: 'pending',
      serviceType: 'wash_fold',
      brand: 'noname_laundry',
      source: 'app',
      scheduledAt: scheduledTime,
      pickupScheduledAt: scheduledTime,
      remark: 'Booking จากเว็บ Noname: นัดรับถุงผ้าที่ล็อบบี้ ฝากนิติไว้แล้ว',
      totalAmount: 0 // Flow A: Price evaluated after counting at store
    }
  })

  console.log(`✔ Created Sample Web Booking Order:
- Job ID: ${job.id}
- Status: ${job.status} (รอเข้ารับผ้า)
- Brand: ${job.brand}
- Scheduled: ${job.scheduledAt}`)

  console.log('\n🎉 Successfully seeded sample Noname Laundry customer and booking!')
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
