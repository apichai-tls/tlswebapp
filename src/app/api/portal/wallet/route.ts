import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePortalCustomer, checkPortalPublicAccess } from '@/lib/portal-auth'

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

    const [customer, walletTxs, vouchers] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: session.customerId }
      }),
      prisma.walletTransaction.findMany({
        where: {
          customerId: session.customerId,
          approvalStatus: { in: ['APPROVED', 'PENDING'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      }),
      prisma.customerVoucher.findMany({
        where: { customerId: session.customerId },
        orderBy: { issuedAt: 'desc' }
      })
    ])

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      wallet: {
        creditBalance: customer.creditBalance || 0,
        tier: customer.tier || 'Regular',
        isMember: customer.isMember,
        memberId: customer.memberId,
        memberStartDate: customer.memberStartDate,
        memberExpiryDate: customer.memberExpiryDate,
        isVIP: customer.isVIP
      },
      transactions: walletTxs.map(tx => ({
        id: tx.id,
        type: tx.type,
        direction: tx.direction,
        amount: tx.amount,
        bonusAmount: tx.bonusAmount || 0,
        packageName: tx.packageName || null,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        referenceId: tx.referenceId,
        referenceType: tx.referenceType,
        reason: tx.reason,
        paymentChannel: tx.paymentChannel,
        approvalStatus: tx.approvalStatus,
        createdAt: tx.createdAt
      })),
      vouchers: vouchers.map(v => ({
        id: v.id,
        code: v.code,
        name: v.name,
        description: v.description,
        discountType: v.discountType,
        discountValue: v.discountValue,
        minOrderAmount: v.minOrderAmount,
        maxDiscount: v.maxDiscount,
        status: v.status,
        issuedAt: v.issuedAt,
        expiryDate: v.expiryDate,
        usedAt: v.usedAt
      }))
    })
  } catch (err: any) {
    console.error('Portal wallet GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
