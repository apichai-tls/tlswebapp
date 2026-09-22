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

export async function GET(req: Request) {
  try {
    const customerId = resolveCustomerId(req)
    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized: Valid customer token or key required' }, { status: 401 })
    }

    const addresses = await prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
    })

    return NextResponse.json({
      success: true,
      addresses
    })
  } catch (err: any) {
    console.error('Addresses GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const customerId = resolveCustomerId(req)
    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized: Valid customer token or key required' }, { status: 401 })
    }

    const body = await req.json()
    const {
      label = 'Home Condo',
      placeName,
      placeId,
      latitude,
      longitude,
      googleMapsUrl,
      address,
      roomNumber,
      subDistrict,
      district = 'Bangkok',
      province = 'Bangkok',
      postalCode,
      contactName,
      contactPhone,
      leaveWithJuristic = true,
      deliveryNote,
      isPrimary = false
    } = body

    if (!address && !placeName) {
      return NextResponse.json({ error: 'Address or place name is required' }, { status: 400 })
    }

    // If this address is primary, unset previous primary
    if (isPrimary) {
      await prisma.customerAddress.updateMany({
        where: { customerId, isPrimary: true },
        data: { isPrimary: false }
      })
    }

    const newAddress = await prisma.customerAddress.create({
      data: {
        customerId,
        label,
        placeName: placeName || null,
        placeId: placeId || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        googleMapsUrl: googleMapsUrl || null,
        address: address || placeName || '',
        roomNumber: roomNumber || null,
        subDistrict: subDistrict || null,
        district,
        province,
        postalCode: postalCode || null,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        leaveWithJuristic: Boolean(leaveWithJuristic),
        deliveryNote: deliveryNote || null,
        isPrimary: Boolean(isPrimary)
      }
    })

    // Compatibility Bridge: Sync primary address into Customer record for legacy POS reading
    if (isPrimary) {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          defaultAddress: newAddress.address || newAddress.placeName,
          defaultLat: newAddress.latitude,
          defaultLng: newAddress.longitude,
          roomNo: newAddress.roomNumber,
          secondaryAddress: newAddress.roomNumber ? `Room ${newAddress.roomNumber}` : null
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Address saved successfully',
      address: newAddress
    }, { status: 201 })
  } catch (err: any) {
    console.error('Addresses POST error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const customerId = resolveCustomerId(req)
    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized: Valid customer token or key required' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const addressId = searchParams.get('id')
    if (!addressId) {
      return NextResponse.json({ error: 'Address ID is required' }, { status: 400 })
    }

    // Verify ownership
    const address = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerId }
    })

    if (!address) {
      return NextResponse.json({ error: 'Address not found or unauthorized' }, { status: 404 })
    }

    await prisma.customerAddress.delete({ where: { id: addressId } })

    return NextResponse.json({
      success: true,
      message: 'Address deleted successfully'
    })
  } catch (err: any) {
    console.error('Addresses DELETE error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
