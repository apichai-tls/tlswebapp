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

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        addresses: {
          orderBy: { isPrimary: 'desc' }
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
        gender: customer.gender,
        dob: customer.dob,
        tier: customer.tier,
        isMember: customer.isMember,
        memberId: customer.memberId,
        isVIP: customer.isVIP,
        creditBalance: customer.creditBalance,
        taxId: customer.taxId,
        companyName: customer.companyName,
        remark: customer.remark,
        brand: customer.brand,
        addresses: customer.addresses
      }
    })
  } catch (err: any) {
    console.error('Profile GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const customerId = resolveCustomerId(req)
    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized: Valid customer token or key required' }, { status: 401 })
    }

    const body = await req.json()
    const {
      fullName,
      name,
      nickName,
      gender,
      dob,
      secondaryPhone,
      lineId,
      taxId,
      companyName,
      remark
    } = body

    const updateData: any = {}
    if (fullName || name) updateData.name = (fullName || name).trim().toUpperCase()
    if (nickName !== undefined) updateData.nickName = nickName ? nickName.trim() : null
    if (gender !== undefined) updateData.gender = gender
    if (dob !== undefined) updateData.dob = dob
    if (secondaryPhone !== undefined) updateData.secondaryPhone = secondaryPhone ? secondaryPhone.trim() : null
    if (lineId !== undefined) updateData.lineId = lineId ? lineId.trim() : null
    if (taxId !== undefined) updateData.taxId = taxId ? taxId.trim() : null
    if (companyName !== undefined) updateData.companyName = companyName ? companyName.trim() : null
    if (remark !== undefined) updateData.remark = remark

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: updateData,
      include: {
        addresses: { orderBy: { isPrimary: 'desc' } }
      }
    })

    const profileData = {
      id: updated.id,
      name: updated.name,
      nickName: updated.nickName,
      phone: updated.phone,
      email: updated.email,
      gender: updated.gender,
      dob: updated.dob,
      addresses: updated.addresses
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      profile: profileData,
      customer: profileData
    })
  } catch (err: any) {
    console.error('Profile PUT error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export const PATCH = PUT

