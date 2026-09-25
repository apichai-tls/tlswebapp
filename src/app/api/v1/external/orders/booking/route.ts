import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCustomerToken, verifyServiceApiKey } from '@/lib/external-api-auth'

export const dynamic = 'force-dynamic'

function resolveCustomerId(req: Request): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const verified = verifyCustomerToken(authHeader)
    if (verified?.customerId) return verified.customerId
  }
  const directId = req.headers.get('x-customer-id')
  if (directId && verifyServiceApiKey(req)) return directId
  return null
}

export async function POST(req: Request) {
  try {
    const customerId = resolveCustomerId(req)
    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized: Valid customer token or key required' }, { status: 401 })
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { addresses: true }
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const body = await req.json()
    const {
      addressId,
      address,
      scheduledDate,
      timeSlot,
      servicePreferences = [],
      customerNote,
      leaveWithJuristic = true
    } = body

    // 1. Resolve Pickup Address
    let pickupAddr: any = null
    if (addressId) {
      pickupAddr = customer.addresses.find(a => a.id === addressId)
    }
    if (!pickupAddr && address) {
      // Save new address for this customer
      pickupAddr = await prisma.customerAddress.create({
        data: {
          customerId,
          label: address.label || 'Pickup Location',
          placeName: address.placeName || null,
          placeId: address.placeId || null,
          latitude: address.latitude ? parseFloat(address.latitude) : null,
          longitude: address.longitude ? parseFloat(address.longitude) : null,
          googleMapsUrl: address.googleMapsUrl || null,
          address: address.address || address.placeName || '',
          roomNumber: address.roomNumber || null,
          subDistrict: address.subDistrict || null,
          district: address.district || 'Bangkok',
          province: address.province || 'Bangkok',
          postalCode: address.postalCode || null,
          contactName: address.contactName || customer.name,
          contactPhone: address.contactPhone || customer.phone,
          leaveWithJuristic: Boolean(leaveWithJuristic),
          deliveryNote: address.deliveryNote || null,
          isPrimary: customer.addresses.length === 0
        }
      })
    }

    if (!pickupAddr) {
      // Fallback to customer default address
      pickupAddr = {
        address: customer.defaultAddress || 'Bangkok',
        latitude: customer.defaultLat || 13.736717,
        longitude: customer.defaultLng || 100.523186,
        roomNumber: customer.roomNo || ''
      }
    }

    // 2. Parse Scheduled Date and Time Slot
    let scheduledTime = new Date()
    if (scheduledDate) {
      const [year, month, day] = scheduledDate.split('-').map(Number)
      if (year && month && day) {
        let hour = 10
        if (timeSlot && typeof timeSlot === 'string') {
          const matchedHour = timeSlot.match(/^(\d{1,2})/)
          if (matchedHour) hour = parseInt(matchedHour[1], 10)
        }
        scheduledTime = new Date(year, month - 1, day, hour, 0, 0)
      }
    }

    const fullPickupLocation = [
      pickupAddr.placeName,
      pickupAddr.roomNumber ? `Room ${pickupAddr.roomNumber}` : '',
      pickupAddr.address
    ].filter(Boolean).join(', ')

    const remarkParts = [
      `[Noname Web Booking] TimeSlot: ${timeSlot || 'Anytime'}`,
      servicePreferences.length > 0 ? `Services: ${servicePreferences.join(', ')}` : '',
      leaveWithJuristic ? 'อนุญาตให้ฝากนิติบุคคลได้' : '',
      customerNote ? `Note: ${customerNote}` : ''
    ].filter(Boolean).join(' | ')

    // 3. Create Job in POS (Status: tba)
    const job = await prisma.job.create({
      data: {
        type: 'pickup',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        pickupLocation: fullPickupLocation,
        pickupLat: pickupAddr.latitude || 13.736717,
        pickupLng: pickupAddr.longitude || 100.523186,
        dropoffLocation: 'That Laundry Shop (Central)',
        dropoffLat: 13.736717,
        dropoffLng: 100.523186,
        distance: 3.5, // Default estimated distance
        fee: 0,
        status: 'tba',
        serviceType: servicePreferences[0] || 'wash_fold',
        laundryTypes: servicePreferences.join(','),
        brand: 'noname_laundry',
        source: 'app',
        scheduledAt: scheduledTime,
        pickupScheduledAt: scheduledTime,
        remark: remarkParts,
        totalAmount: 0 // Flow A: Evaluated and billed at store
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Booking confirmed successfully',
      order: {
        id: job.id,
        status: job.status,
        scheduledAt: job.scheduledAt,
        timeSlot: timeSlot || null,
        pickupLocation: job.pickupLocation,
        brand: job.brand,
        createdAt: job.createdAt
      }
    })
  } catch (err: any) {
    console.error('Booking POST error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
