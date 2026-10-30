import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePortalCustomer, hashPassword, verifyPassword, checkPortalPublicAccess } from '@/lib/portal-auth'

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

    const customer = await prisma.customer.findUnique({
      where: { id: session.customerId },
      include: {
        addresses: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
        }
      }
    })

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: customer.id,
        name: customer.name,
        nickName: customer.nickName,
        phone: customer.phone,
        secondaryPhone: customer.secondaryPhone,
        email: customer.email,
        lineId: customer.lineId,
        whatsappId: customer.whatsappId,
        gender: customer.gender,
        dob: customer.dob,
        tier: customer.tier || 'Regular',
        isMember: customer.isMember,
        memberId: customer.memberId,
        memberExpiryDate: customer.memberExpiryDate,
        isVIP: customer.isVIP,
        creditBalance: customer.creditBalance || 0,
        taxId: customer.taxId,
        companyName: customer.companyName,
        remark: customer.remark,
        defaultAddress: customer.defaultAddress,
        roomNo: customer.roomNo,
        brand: customer.brand || 'that_laundry_shop',
        addresses: customer.addresses
      }
    })
  } catch (err: any) {
    console.error('Portal profile GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const access = await checkPortalPublicAccess(req)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Customer Portal is currently closed / Coming Soon', portalClosed: true }, { status: 503 })
    }
    const session = resolvePortalCustomer(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    // Password change handling
    if (body.action === 'change_password') {
      const { currentPassword, newPassword } = body
      if (!newPassword || String(newPassword).length < 4) {
        return NextResponse.json(
          { error: 'New password/PIN must be at least 4 characters' },
          { status: 400 }
        )
      }

      const existing = await prisma.customer.findUnique({
        where: { id: session.customerId }
      })
      if (!existing) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }

      if (existing.passwordHash && currentPassword) {
        const valid = verifyPassword(String(currentPassword), existing.passwordHash)
        if (!valid) {
          return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
        }
      }

      await prisma.customer.update({
        where: { id: session.customerId },
        data: {
          passwordHash: hashPassword(String(newPassword))
        }
      })

      return NextResponse.json({
        success: true,
        message: 'Password updated successfully'
      })
    }

    // Standard profile update
    const {
      name,
      nickName,
      email,
      secondaryPhone,
      whatsappId,
      lineId,
      dob,
      taxId,
      companyName,
      remark
    } = body

    const updateData: any = {}
    if (name !== undefined && String(name).trim()) {
      updateData.name = String(name).trim().toUpperCase()
    }
    if (nickName !== undefined) updateData.nickName = nickName ? String(nickName).trim() : null
    if (email !== undefined) updateData.email = email ? String(email).trim().toLowerCase() : null
    if (secondaryPhone !== undefined) {
      updateData.secondaryPhone = secondaryPhone ? String(secondaryPhone).trim() : null
    }
    if (whatsappId !== undefined) updateData.whatsappId = whatsappId ? String(whatsappId).trim() : null
    if (lineId !== undefined) updateData.lineId = lineId ? String(lineId).trim() : null
    if (dob !== undefined) updateData.dob = dob ? String(dob).trim() : null
    if (taxId !== undefined) updateData.taxId = taxId ? String(taxId).trim() : null
    if (companyName !== undefined) updateData.companyName = companyName ? String(companyName).trim() : null
    if (remark !== undefined) updateData.remark = remark ? String(remark).trim() : null

    const updated = await prisma.customer.update({
      where: { id: session.customerId },
      data: updateData,
      include: {
        addresses: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      profile: updated
    })
  } catch (err: any) {
    console.error('Portal profile PUT error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = resolvePortalCustomer(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action = 'add_address' } = body

    if (action === 'delete_address') {
      const { addressId } = body
      if (!addressId) {
        return NextResponse.json({ error: 'Address ID is required' }, { status: 400 })
      }
      await prisma.customerAddress.deleteMany({
        where: { id: addressId, customerId: session.customerId }
      })
      const addresses = await prisma.customerAddress.findMany({
        where: { customerId: session.customerId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
      })
      return NextResponse.json({ success: true, addresses })
    }

    if (action === 'set_primary') {
      const { addressId } = body
      if (!addressId) {
        return NextResponse.json({ error: 'Address ID is required' }, { status: 400 })
      }
      await prisma.customerAddress.updateMany({
        where: { customerId: session.customerId },
        data: { isPrimary: false }
      })
      const primaryAddr = await prisma.customerAddress.update({
        where: { id: addressId },
        data: { isPrimary: true }
      })
      await prisma.customer.update({
        where: { id: session.customerId },
        data: {
          defaultAddress: [primaryAddr.placeName, primaryAddr.address].filter(Boolean).join(', '),
          roomNo: primaryAddr.roomNumber || null
        }
      })
      const addresses = await prisma.customerAddress.findMany({
        where: { customerId: session.customerId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
      })
      return NextResponse.json({ success: true, addresses })
    }

    // Add a new address
    const {
      label = 'Home / Condo',
      placeName,
      address,
      roomNumber,
      district = 'Bangkok',
      postalCode,
      leaveWithJuristic = true,
      deliveryNote,
      isPrimary = false
    } = body

    if (!placeName && !address) {
      return NextResponse.json({ error: 'Condo/Building name or street address is required' }, { status: 400 })
    }

    const existingCount = await prisma.customerAddress.count({
      where: { customerId: session.customerId }
    })
    const makePrimary = Boolean(isPrimary || existingCount === 0)

    if (makePrimary) {
      await prisma.customerAddress.updateMany({
        where: { customerId: session.customerId, isPrimary: true },
        data: { isPrimary: false }
      })
    }

    const created = await prisma.customerAddress.create({
      data: {
        customerId: session.customerId,
        label: String(label).trim() || 'Home / Condo',
        placeName: placeName ? String(placeName).trim() : null,
        address: address ? String(address).trim() : String(placeName || '').trim(),
        roomNumber: roomNumber ? String(roomNumber).trim() : null,
        district: String(district || 'Bangkok').trim(),
        province: 'Bangkok',
        postalCode: postalCode ? String(postalCode).trim() : null,
        leaveWithJuristic: Boolean(leaveWithJuristic),
        deliveryNote: deliveryNote ? String(deliveryNote).trim() : null,
        isPrimary: makePrimary
      }
    })

    if (makePrimary) {
      await prisma.customer.update({
        where: { id: session.customerId },
        data: {
          defaultAddress: [created.placeName, created.address].filter(Boolean).join(', '),
          roomNo: created.roomNumber || null
        }
      })
    }

    const addresses = await prisma.customerAddress.findMany({
      where: { customerId: session.customerId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
    })

    return NextResponse.json({
      success: true,
      message: 'Address saved',
      addresses
    })
  } catch (err: any) {
    console.error('Portal profile POST address error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
