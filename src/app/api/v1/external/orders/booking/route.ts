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
      orderId,
      id,
      addressId,
      address,
      scheduledDate,
      timeSlot,
      servicePreferences = [],
      customerNote,
      leaveWithJuristic = true,
      status = 'tba'
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

    // 2. Parse Scheduled Date and Time Slot explicitly in Thailand timezone (Asia/Bangkok, UTC+7)
    let scheduledTime = new Date()
    if (scheduledDate) {
      const [year, month, day] = String(scheduledDate).split('-').map(Number)
      if (year && month && day) {
        let hour = 10
        let minute = 0
        if (timeSlot && typeof timeSlot === 'string') {
          const matchedTime = timeSlot.match(/^(\d{1,2})(?::(\d{2}))?/)
          if (matchedTime) {
            hour = Math.min(23, Math.max(0, parseInt(matchedTime[1], 10)))
            if (matchedTime[2]) {
              minute = Math.min(59, Math.max(0, parseInt(matchedTime[2], 10)))
            }
          }
        }
        // Convert Bangkok local wall-clock time (UTC+7) to exact UTC timestamp regardless of container TZ
        const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
        scheduledTime = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - BANGKOK_OFFSET_MS)
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

    const customJobId = (orderId || id || '').trim() || undefined;

    // 3. Create Job in POS (Status: tba)
    const job = await prisma.job.create({
      data: {
        id: customJobId,
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

    const { publishOrderEvent } = await import('@/lib/realtime-bus')
    await publishOrderEvent({
      type: 'job.created',
      job,
      action: 'external_booking',
      actorName: customer.name || 'External Booking',
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
