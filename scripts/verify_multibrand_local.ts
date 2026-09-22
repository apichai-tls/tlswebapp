import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== Running Multi-Brand Schema Verification Tests ===\n')

  // Test 1: Check existing data
  const customerCount = await prisma.customer.count()
  const jobCount = await prisma.job.count()
  console.log(`Test 1: Existing Data Integrity:
  - Customers: ${customerCount}
  - Jobs: ${jobCount}`)
  if (customerCount < 1000) throw new Error('Customer count unexpectedly low!')

  // Test 2: Create customer in that_laundry_shop
  const testPhone = '+66 89 999 8888'
  const tlsCust = await prisma.customer.create({
    data: {
      name: 'TEST TLS CUSTOMER',
      phone: testPhone,
      brand: 'that_laundry_shop'
    }
  })
  console.log(`\nTest 2: Created TLS Customer (id: ${tlsCust.id}, brand: ${tlsCust.brand})`)

  // Test 3: Create customer in noname_laundry with the EXACT SAME phone (Brand Isolation)
  const nonameCust = await prisma.customer.create({
    data: {
      name: 'TEST NONAME CUSTOMER',
      phone: testPhone,
      brand: 'noname_laundry',
      sourceSystem: 'web_booking'
    }
  })
  console.log(`Test 3: Created Noname Customer with SAME phone (id: ${nonameCust.id}, brand: ${nonameCust.brand}) -> PASS (Brand Isolation works!)`)

  // Test 4: Attempt to create DUPLICATE within noname_laundry -> must fail
  let duplicateFailed = false
  try {
    await prisma.customer.create({
      data: {
        name: 'DUPLICATE NONAME CUSTOMER',
        phone: testPhone,
        brand: 'noname_laundry'
      }
    })
  } catch (err: any) {
    duplicateFailed = true
    console.log(`Test 4: Attempted duplicate phone in noname_laundry -> REJECTED as expected! (Error: ${err.message.split('\n')[0]})`)
  }
  if (!duplicateFailed) {
    throw new Error('Test 4 Failed: Duplicate phone in noname_laundry was NOT rejected!')
  }

  // Test 5: Create CustomerAddress for nonameCust with Google Maps data
  const address = await prisma.customerAddress.create({
    data: {
      customerId: nonameCust.id,
      label: 'Home Condo',
      placeId: 'ChIJ1234567890abcdef',
      placeName: 'The Estelle Phrom Phong',
      latitude: 13.731234,
      longitude: 100.569876,
      address: 'Sukhumvit 26, Klongtan',
      roomNumber: '1802',
      district: 'Khlong Toei',
      province: 'Bangkok',
      postalCode: '10110',
      contactName: 'Ms. Anna (Maid)',
      contactPhone: '+66 81 111 2222',
      leaveWithJuristic: true,
      deliveryNote: 'Leave at juristic counter on 1st floor'
    }
  })
  console.log(`\nTest 5: Created CustomerAddress (id: ${address.id}, placeName: "${address.placeName}", lat/lng: ${address.latitude}, ${address.longitude}) -> PASS`)

  // Clean up test data
  console.log('\nCleaning up test records...')
  await prisma.customer.delete({ where: { id: nonameCust.id } }) // cascade deletes address
  await prisma.customer.delete({ where: { id: tlsCust.id } })
  console.log('✔ Test records cleaned up successfully.')

  console.log('\n🎉 ALL 5 VERIFICATION TESTS PASSED PERFECTLY!')
}

main()
  .catch((e) => {
    console.error('Verification failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
