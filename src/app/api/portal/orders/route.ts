import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePortalCustomer, checkPortalPublicAccess } from '@/lib/portal-auth'
import { formatPortalOrder } from '@/lib/portal-utils'
import { invalidateDbCache } from '@/lib/db-cache'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const access = await checkPortalPublicAccess(req)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Customer Portal is currently closed / Coming Soon', portalClosed: true }, { status: 503 })
    }
    const session = resolvePortalCustomer(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jobs = await prisma.job.findMany({
      where: { customerId: session.customerId },
      orderBy: { createdAt: 'desc' }
    })

    const orders = jobs.map(formatPortalOrder)

    return NextResponse.json({
      success: true,
      orders
    })
  } catch (err: any) {
    console.error('Portal orders GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

function parseBangkokTimestamp(dateStr: string, hour: number, minute = 0): Date {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (y && m && d) {
    const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
    return new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0) - BANGKOK_OFFSET_MS)
  }
  return new Date()
}

function parseSlotHours(timeSlot: string): { startHour: number; endHour: number } {
  const matches = Array.from(String(timeSlot).matchAll(/(\d{1,2}):(\d{2})/g))
  if (matches.length >= 2) {
    const startHour = Math.min(23, Math.max(0, parseInt(matches[0][1], 10)))
    const endHour = Math.min(23, Math.max(startHour + 1, parseInt(matches[1][1], 10)))
    return { startHour, endHour }
  }
  if (matches.length === 1) {
    const startHour = Math.min(22, Math.max(0, parseInt(matches[0][1], 10)))
    return { startHour, endHour: startHour + 2 }
  }
  return { startHour: 10, endHour: 12 }
}

export async function POST(req: Request) {
  try {
    const access = await checkPortalPublicAccess(req)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Customer Portal is currently closed / Coming Soon', portalClosed: true }, { status: 503 })
    }
    const session = resolvePortalCustomer(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const customer = await prisma.customer.findUnique({
      where: { id: session.customerId },
      include: {
        addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] }
      }
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const body = await req.json()
    const {
      addressId,
      customAddress,
      condoName,
      roomNumber,
      saveNewAddress = true,
      tripType = 'full_service',
      expressOption = 'Standard: Next Day Deliver Any Time Before 18:00 (No Fixed Time)',
      serviceSpeed = 'standard',
      scheduledDate,
      timeSlot = '09:00 - 12:00',
      serviceTypes = ['Wash & Fold (Weight)'],
      bagCount = 1,
      bagImageUrls = [],
      voucherCode = null,
      leaveWithJuristic = true,
      juristicTagOrDesk = '',
      note = ''
    } = body

    // 1. Resolve Pickup Address & Coordinates
    let locationBase = ''
    let cleanRoom = roomNumber ? String(roomNumber).replace(/^Room\s*/i, '').trim() : ''
    let pickupLat = customer.defaultLat || 13.736717
    let pickupLng = customer.defaultLng || 100.523186

    if (addressId && addressId !== 'pos_default' && addressId !== 'custom') {
      const savedAddr = customer.addresses.find(a => a.id === addressId)
      if (savedAddr) {
        locationBase = [savedAddr.placeName, savedAddr.address]
          .filter(Boolean)
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .join(', ')
        if (!cleanRoom && savedAddr.roomNumber) {
          cleanRoom = String(savedAddr.roomNumber).replace(/^Room\s*/i, '').trim()
        }
        if (savedAddr.latitude) pickupLat = savedAddr.latitude
        if (savedAddr.longitude) pickupLng = savedAddr.longitude
      }
    } else if (addressId === 'pos_default' && customer.defaultAddress) {
      locationBase = customer.defaultAddress.replace(/\s*\(Room\s+[^)]+\)\s*$/i, '').trim()
      if (!cleanRoom && customer.roomNo) {
        cleanRoom = String(customer.roomNo).replace(/^Room\s*/i, '').trim()
      }
    } else {
      const parts = [
        condoName ? String(condoName).trim() : null,
        customAddress ? String(customAddress).trim() : null
      ].filter(Boolean)
      locationBase = parts.join(', ')

      // Optionally save new address to customer's address book
      if (saveNewAddress && locationBase) {
        const isFirstAddress = customer.addresses.length === 0
        await prisma.customerAddress.create({
          data: {
            customerId: customer.id,
            label: condoName ? String(condoName).trim() : 'Home / Condo',
            placeName: condoName ? String(condoName).trim() : null,
            address: customAddress ? String(customAddress).trim() : locationBase,
            roomNumber: cleanRoom || null,
            district: 'Bangkok',
            province: 'Bangkok',
            contactName: customer.name,
            contactPhone: customer.phone,
            leaveWithJuristic: Boolean(leaveWithJuristic),
            deliveryNote: juristicTagOrDesk ? String(juristicTagOrDesk).trim() : null,
            isPrimary: isFirstAddress
          }
        })

        if (!customer.defaultAddress) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: {
              defaultAddress: locationBase,
              roomNo: cleanRoom || customer.roomNo || null
            }
          })
        }
      }
    }

    if (!locationBase) {
      locationBase = customer.defaultAddress || 'Bangkok'
    }

    // Format pickupLocation matching POS convention: "Base Location (Room 1204)"
    const formattedCustomerLocation = cleanRoom
      ? `${locationBase} (Room ${cleanRoom})`
      : locationBase

    // 2. Resolve Branch / Hub location
    let targetBranch = customer.branchId
      ? await prisma.shopLocation.findUnique({ where: { id: customer.branchId } })
      : null
    if (!targetBranch) {
      targetBranch = await prisma.shopLocation.findFirst({
        orderBy: { id: 'asc' }
      })
    }

    const hubAddress = targetBranch?.name || 'That Laundry Shop Hub'
    const hubLat = targetBranch?.lat || 13.7417
    const hubLng = targetBranch?.lng || 100.5526
    const resolvedBranchId = customer.branchId || targetBranch?.id || null

    // 3. Parse Pickup & Delivery Scheduled Timestamps in Thailand Timezone (UTC+7)
    const { startHour: pStart, endHour: pEnd } = parseSlotHours(timeSlot)
    const pickupStart = scheduledDate
      ? parseBangkokTimestamp(scheduledDate, pStart, 0)
      : new Date()
    const pickupEnd = scheduledDate
      ? parseBangkokTimestamp(scheduledDate, pEnd, 0)
      : new Date(pickupStart.getTime() + 2 * 60 * 60 * 1000)

    const isRoundTrip = tripType !== 'pickup'
    const deliveryStart: Date | null = null
    const deliveryEnd: Date | null = null

    // 4. Normalize Service & Laundry Types for POS compatibility
    const normalizedServices: string[] = Array.isArray(serviceTypes) && serviceTypes.length > 0
      ? serviceTypes.map(s => String(s).trim())
      : ['Wash & Fold (Weight)']

    const primaryServiceType = normalizedServices[0] || 'Wash & Fold (Weight)'
    const laundryTypesCsv = normalizedServices.join(', ')

    // 5. Build structured Remark for POS Cashier & Rider
    const numBags = Math.max(1, parseInt(String(bagCount || 1), 10) || 1)
    const speedLabel = expressOption
      ? String(expressOption).trim()
      : serviceSpeed === 'express'
      ? 'Express Service'
      : 'Standard Service'
    const remarkParts = [
      `[Customer Portal Booking]`,
      `Speed: ${speedLabel}`,
      `Pickup Slot: ${timeSlot}`,
      `Laundry: ${laundryTypesCsv}`,
      `Bags: ${numBags}`,
      leaveWithJuristic
        ? `Leave/Collect at Juristic${juristicTagOrDesk ? ` (${String(juristicTagOrDesk).trim()})` : ''}`
        : 'In-Person Handover',
      voucherCode ? `Promo/Voucher: ${String(voucherCode).trim()}` : null,
      note ? `Note: ${String(note).trim()}` : null
    ].filter(Boolean)

    const cleanBagPhotos = Array.isArray(bagImageUrls)
      ? bagImageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : []
    const bagImageField =
      cleanBagPhotos.length === 0
        ? null
        : cleanBagPhotos.length === 1
        ? cleanBagPhotos[0]
        : JSON.stringify(cleanBagPhotos)

    // 6. Generate Sequential Job ID (matching addJobAction in src/actions/db.ts)
    const year = new Date().getFullYear().toString()
    const isTestDb = Boolean(
      process.env.DATABASE_URL?.includes('/tls_test') ||
        process.env.DIRECT_URL?.includes('/tls_test') ||
        process.env.APP_ENV === 'test'
    )
    const prefix = isTestDb ? `T${year}` : year

    const createdJob = await prisma.$transaction(async tx => {
      const seqLockKey = `job_seq:${prefix}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seqLockKey}))`

      const latestJob = await tx.job.findFirst({
        where: { id: { startsWith: prefix } },
        orderBy: { id: 'desc' }
      })

      let jobId = `${prefix}000001`
      if (latestJob) {
        const numericPart = latestJob.id.replace(/^T/, '').substring(4)
        const lastNum = parseInt(numericPart, 10)
        if (!isNaN(lastNum)) {
          jobId = `${prefix}${(lastNum + 1).toString().padStart(6, '0')}`
        }
      }

      const jobRow = await tx.job.create({
        data: {
          id: jobId,
          type: isRoundTrip ? 'full_service' : 'pickup',
          status: 'tba',
          subStatus: null,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          pickupLocation: formattedCustomerLocation,
          dropoffLocation: isRoundTrip ? formattedCustomerLocation : hubAddress,
          pickupLat,
          pickupLng,
          dropoffLat: isRoundTrip ? pickupLat : hubLat,
          dropoffLng: isRoundTrip ? pickupLng : hubLng,
          distance: 0,
          fee: 0,
          scheduledAt: pickupStart,
          pickupScheduledAt: pickupStart,
          pickupScheduledEndAt: pickupEnd,
          deliveryScheduledAt: deliveryStart,
          deliveryScheduledEndAt: deliveryEnd,
          serviceType: primaryServiceType,
          laundryTypes: laundryTypesCsv,
          bagImageUrl: bagImageField,
          source: 'app',
          brand: customer.brand || 'that_laundry_shop',
          branchId: resolvedBranchId,
          createdBy: `Customer Portal (${customer.name})`,
          remark: remarkParts.join(' | '),
          totalAmount: 0
        }
      })

      try {
        await tx.activityLog.create({
          data: {
            entityId: jobRow.id,
            entityType: 'job',
            action: 'create',
            details: JSON.stringify(jobRow),
            userId: customer.id,
            userName: `${customer.name} (Customer Portal)`
          }
        })
      } catch (e) {
        console.error('Failed to write activityLog for portal booking', e)
      }

      return jobRow
    })

    // 7. Invalidate cache & broadcast real-time event to POS / Rider screens
    try {
      invalidateDbCache('jobs')
      const { publishOrderEvent } = await import('@/lib/realtime-bus')
      await publishOrderEvent({
        type: 'job.created',
        job: createdJob,
        action: 'create',
        actorId: customer.id,
        actorName: `${customer.name} (Portal)`
      })
    } catch (e) {
      console.warn('Realtime publish warning:', e)
    }

    return NextResponse.json({
      success: true,
      message: 'Pickup scheduled successfully',
      order: formatPortalOrder(createdJob)
    })
  } catch (err: any) {
    console.error('Portal orders POST booking error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
