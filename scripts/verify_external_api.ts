import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URL = 'http://localhost:3000/api/v1/external'

async function runTests() {
  console.log('====================================================')
  console.log('  STARTING NONAME LAUNDRY EXTERNAL API VERIFICATION ')
  console.log('====================================================')

  const testPhone = '+66 89 777 8899'
  const testEmail = 'alex.test.suite@nonamelaundry.test'
  const testPassword = 'Password123!'

  // Pre-cleanup in case previous run crashed
  const existing = await prisma.customer.findFirst({
    where: { phone: testPhone, brand: 'noname_laundry' }
  })
  if (existing) {
    await prisma.job.deleteMany({ where: { customerId: existing.id } })
    await prisma.customerAddress.deleteMany({ where: { customerId: existing.id } })
    await prisma.customer.delete({ where: { id: existing.id } })
    console.log('Cleared existing test customer records.')
  }

  let customerToken = ''
  let customerId = ''
  let addressId = ''
  let orderId = ''

  // 1. REGISTER
  console.log('\n[TEST 1] Register New Customer via API...')
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alex TestSuite',
      phone: testPhone,
      email: testEmail,
      password: testPassword,
      brand: 'noname_laundry'
    })
  })
  const regData = await regRes.json()
  if (regRes.status === 201 && regData.success && regData.token) {
    console.log('✔ PASS: Registration succeeded. Customer ID:', regData.customer.id)
    customerToken = regData.token
    customerId = regData.customer.id
  } else {
    throw new Error(`FAIL: Registration failed: ${JSON.stringify(regData)}`)
  }

  // 2. DUPLICATE REGISTER CHECK
  console.log('\n[TEST 2] Verify Duplicate Prevention for Noname Laundry...')
  const dupRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alex Duplicate',
      phone: testPhone,
      email: testEmail,
      password: testPassword,
      brand: 'noname_laundry'
    })
  })
  const dupData = await dupRes.json()
  if (dupRes.status === 409) {
    console.log('✔ PASS: Duplicate phone correctly blocked with 409 Conflict.')
  } else {
    throw new Error(`FAIL: Duplicate was not blocked: ${JSON.stringify(dupData)}`)
  }

  // 3. LOGIN
  console.log('\n[TEST 3] Customer Login with Phone + Password...')
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: testPhone,
      password: testPassword,
      brand: 'noname_laundry'
    })
  })
  const loginData = await loginRes.json()
  if (loginRes.status === 200 && loginData.token) {
    console.log('✔ PASS: Login successful, token received.')
    customerToken = loginData.token
  } else {
    throw new Error(`FAIL: Login failed: ${JSON.stringify(loginData)}`)
  }

  // 4. PROFILE GET & UPDATE
  console.log('\n[TEST 4] Get & Update Profile...')
  const profilePatchRes = await fetch(`${BASE_URL}/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`
    },
    body: JSON.stringify({
      nickName: 'Al',
      gender: 'male',
      secondaryPhone: '+66 82 111 2233',
      isSecondaryWhatsapp: true
    })
  })
  const profilePatchData = await profilePatchRes.json()
  if (profilePatchRes.status === 200 && profilePatchData.customer.nickName === 'Al') {
    console.log('✔ PASS: Profile updated successfully.')
  } else {
    throw new Error(`FAIL: Profile patch failed: ${JSON.stringify(profilePatchData)}`)
  }

  // 5. ADD ADDRESS & VERIFY COMPATIBILITY BRIDGE
  console.log('\n[TEST 5] Add Address with Coordinates & Room No...')
  const addrRes = await fetch(`${BASE_URL}/addresses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`
    },
    body: JSON.stringify({
      label: 'Home Condo',
      placeName: 'The Line Asoke-Ratchada',
      latitude: 13.7573,
      longitude: 100.5645,
      roomNumber: '1802',
      address: 'Rama 9 Rd, Din Daeng, Bangkok',
      leaveWithJuristic: true,
      deliveryNote: 'Juristic office on 1st floor',
      isPrimary: true
    })
  })
  const addrData = await addrRes.json()
  if (addrRes.status === 201 && addrData.address.id) {
    addressId = addrData.address.id
    console.log('✔ PASS: Address created. ID:', addressId)

    // Check DB customer table compatibility bridge
    const dbCustomer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (
      dbCustomer?.roomNo === '1802' &&
      dbCustomer?.defaultLat === 13.7573 &&
      dbCustomer?.defaultLng === 100.5645
    ) {
      console.log('✔ PASS: Address Compatibility Bridge synced to Customer table.')
    } else {
      throw new Error(`FAIL: Compatibility bridge failed to sync to customer: ${JSON.stringify(dbCustomer)}`)
    }
  } else {
    throw new Error(`FAIL: Address creation failed: ${JSON.stringify(addrData)}`)
  }

  // 6. BOOKING ORDER (Order Flow A: Pickup First, Count Later)
  console.log('\n[TEST 6] Book Pickup Order...')
  const bookRes = await fetch(`${BASE_URL}/orders/booking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`
    },
    body: JSON.stringify({
      addressId,
      scheduledDate: '2026-09-25',
      timeSlot: '14:00 - 16:00',
      servicePreferences: ['wash_fold', 'dry_clean'],
      customerNote: 'Fragile silk shirt included',
      leaveWithJuristic: true
    })
  })
  const bookData = await bookRes.json()
  if (bookRes.status === 200 && bookData.order.id) {
    orderId = bookData.order.id
    console.log('✔ PASS: Booking created with ID:', orderId)
    console.log('  Status:', bookData.order.status, '| Brand:', bookData.order.brand)
  } else {
    throw new Error(`FAIL: Booking failed: ${JSON.stringify(bookData)}`)
  }

  // 7. GET ORDER STATUS (BEFORE PAYMENT)
  console.log('\n[TEST 7] Order Status Before Billing...')
  const orderDetail1Res = await fetch(`${BASE_URL}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${customerToken}` }
  })
  const orderDetail1 = await orderDetail1Res.json()
  if (
    orderDetail1.success &&
    orderDetail1.order.isPaid === false &&
    orderDetail1.order.readyForPayment === false
  ) {
    console.log('✔ PASS: Order is pending, not ready for payment yet (Amount: 0).')
  } else {
    throw new Error(`FAIL: Unexpected order state before billing: ${JSON.stringify(orderDetail1)}`)
  }

  // 8. SIMULATE POS STORE CASHIER BILLING
  console.log('\n[TEST 8] Simulate POS Cashier counting laundry & billing...')
  const billedItems = [
    { name: 'Wash & Fold (4.5 kg)', quantity: 1, price: 180 },
    { name: 'Silk Shirt Dry Clean', quantity: 1, price: 120 }
  ]
  const totalAmount = 300
  await prisma.job.update({
    where: { id: orderId },
    data: {
      itemsJson: JSON.stringify(billedItems),
      totalAmount,
      subStatus: 'billing',
      billNo: 'BIL-202609-0088'
    }
  })

  // Customer checks order status again - should now be ready for payment
  const orderDetail2Res = await fetch(`${BASE_URL}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${customerToken}` }
  })
  const orderDetail2 = await orderDetail2Res.json()
  if (
    orderDetail2.success &&
    orderDetail2.order.readyForPayment === true &&
    orderDetail2.order.totalAmount === 300 &&
    orderDetail2.order.items.length === 2
  ) {
    console.log('✔ PASS: Customer sees bill amount (300 THB) and readyForPayment = true.')
  } else {
    throw new Error(`FAIL: Order did not update to ready for payment: ${JSON.stringify(orderDetail2)}`)
  }

  // 9. SIMULATE BEAM CHECKOUT WEBHOOK (PromptPay payment received)
  console.log('\n[TEST 9] Beam Checkout Webhook (Payment Notification)...')
  const webhookSecret = process.env.BEAM_WEBHOOK_SECRET || 'beam_sec_live_test_123'
  const webhookBodyObj = {
    event: 'charge.succeeded',
    data: {
      id: 'ch_beam_live_' + Date.now(),
      reference_id: orderId,
      amount: 300,
      currency: 'THB',
      payment_method: 'promptpay',
      status: 'succeeded'
    }
  }
  const rawWebhookBody = JSON.stringify(webhookBodyObj)
  const beamSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawWebhookBody)
    .digest('hex')

  const webhookRes = await fetch(`${BASE_URL}/payments/beam-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-beam-signature': beamSignature
    },
    body: rawWebhookBody
  })
  const webhookData = await webhookRes.json()
  if (webhookRes.status === 200 && webhookData.success && webhookData.isPaid === true) {
    console.log('✔ PASS: Beam webhook processed successfully! Order marked as PAID.')
  } else {
    throw new Error(`FAIL: Beam webhook failed: ${JSON.stringify(webhookData)}`)
  }

  // 10. VERIFY ORDER STATUS AFTER PAYMENT
  console.log('\n[TEST 10] Verify Order State & Workflow Progression...')
  const orderDetail3Res = await fetch(`${BASE_URL}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${customerToken}` }
  })
  const orderDetail3 = await orderDetail3Res.json()
  if (
    orderDetail3.success &&
    orderDetail3.order.isPaid === true &&
    orderDetail3.order.subStatus === 'wash' &&
    orderDetail3.order.paymentChannel?.includes('Beam')
  ) {
    console.log('✔ PASS: Order is marked isPaid = true and subStatus auto-advanced to "wash".')
  } else {
    throw new Error(`FAIL: Order status after payment incorrect: ${JSON.stringify(orderDetail3)}`)
  }

  // 11. DIGITAL E-RECEIPT GENERATION
  console.log('\n[TEST 11] Customer fetches Digital E-Receipt...')
  const receiptRes = await fetch(`${BASE_URL}/orders/${orderId}/receipt`, {
    headers: { Authorization: `Bearer ${customerToken}` }
  })
  const receiptData = await receiptRes.json()
  if (
    receiptRes.status === 200 &&
    receiptData.success &&
    receiptData.receipt.storeName === 'Noname Laundry' &&
    receiptData.receipt.status === 'PAID' &&
    receiptData.receipt.totalAmount === 300
  ) {
    console.log('✔ PASS: Digital E-Receipt generated with brand "Noname Laundry" and total 300 THB.')
    console.log('  Receipt Number:', receiptData.receipt.receiptNumber)
    console.log('  Payment Channel:', receiptData.receipt.paymentChannel)
  } else {
    throw new Error(`FAIL: Digital receipt failed: ${JSON.stringify(receiptData)}`)
  }

  // 12. CLEANUP TEST RECORD
  console.log('\n[CLEANUP] Removing test suite records...')
  await prisma.job.delete({ where: { id: orderId } })
  await prisma.customerAddress.deleteMany({ where: { customerId } })
  await prisma.customer.delete({ where: { id: customerId } })
  console.log('✔ PASS: Cleaned up test data cleanly.')

  console.log('\n====================================================')
  console.log('  ALL 11 API SUITE TESTS PASSED WITH 100% SUCCESS!  ')
  console.log('====================================================')
}

runTests()
  .catch(err => {
    console.error('\n❌ Test Suite Aborted with Error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
