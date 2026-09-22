import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, generateCustomerToken, verifyServiceApiKey } from '@/lib/external-api-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!verifyServiceApiKey(req)) {
      return NextResponse.json({ error: 'Unauthorized API key' }, { status: 401 })
    }

    const body = await req.json()
    const {
      fullName,
      name,
      nickName,
      phone,
      mobileNumber,
      email,
      password,
      gender,
      brand = 'noname_laundry',
      address
    } = body

    const finalName = (fullName || name || '').trim().toUpperCase()
    const finalPhone = (mobileNumber || phone || '').trim()
    const finalEmail = (email || '').trim().toLowerCase() || null

    if (!finalName) {
      return NextResponse.json({ error: 'Full name is required (กรุณากรอกชื่อ-นามสกุล)' }, { status: 400 })
    }

    if (!finalPhone && !finalEmail) {
      return NextResponse.json({ error: 'Phone or Email is required (กรุณากรอกเบอร์โทรหรืออีเมล)' }, { status: 400 })
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters (รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร)' }, { status: 400 })
    }

    // Check duplicate phone in this brand
    if (finalPhone) {
      const existingPhone = await prisma.customer.findFirst({
        where: { brand, phone: finalPhone }
      })
      if (existingPhone) {
        return NextResponse.json({ error: 'This phone number is already registered for this service' }, { status: 409 })
      }
    }

    // Check duplicate email in this brand
    if (finalEmail) {
      const existingEmail = await prisma.customer.findFirst({
        where: { brand, email: finalEmail }
      })
      if (existingEmail) {
        return NextResponse.json({ error: 'This email is already registered for this service' }, { status: 409 })
      }
    }

    const passwordHash = hashPassword(password)

    // Create Customer with optional initial address
    const customer = await prisma.customer.create({
      data: {
        name: finalName,
        nickName: nickName || null,
        phone: finalPhone,
        email: finalEmail,
        passwordHash,
        gender: gender || 'Rather not say',
        brand,
        sourceSystem: 'web_booking',
        isVerified: false,
        tier: 'Regular',
        defaultAddress: address?.address || address?.placeName || null,
        defaultLat: address?.latitude || null,
        defaultLng: address?.longitude || null,
        roomNo: address?.roomNumber || null,
        secondaryAddress: address?.roomNumber ? `Room ${address.roomNumber}` : null,
        addresses: address ? {
          create: {
            label: address.label || 'Home Condo',
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
            contactName: address.contactName || finalName,
            contactPhone: address.contactPhone || finalPhone,
            leaveWithJuristic: address.leaveWithJuristic !== false,
            deliveryNote: address.deliveryNote || null,
            isPrimary: true
          }
        } : undefined
      },
      include: {
        addresses: true
      }
    })

    const token = generateCustomerToken({
      customerId: customer.id,
      brand: customer.brand,
      phone: customer.phone,
      email: customer.email
    })

    return NextResponse.json({
      success: true,
      message: 'Registration successful',
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        nickName: customer.nickName,
        phone: customer.phone,
        email: customer.email,
        brand: customer.brand,
        gender: customer.gender,
        addresses: customer.addresses
      }
    }, { status: 201 })
  } catch (err: any) {
    console.error('Register API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
