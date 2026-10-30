import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePortalCustomer, checkPortalPublicAccess } from '@/lib/portal-auth'
import { formatPortalOrder } from '@/lib/portal-utils'

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

    const now = new Date()

    const [customer, jobs, vouchers, walletTxs] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: session.customerId },
        include: {
          addresses: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
          }
        }
      }),
      prisma.job.findMany({
        where: { customerId: session.customerId },
        orderBy: { createdAt: 'desc' },
        take: 30
      }),
      prisma.customerVoucher.findMany({
        where: {
          customerId: session.customerId,
          status: 'ACTIVE',
          OR: [{ expiryDate: null }, { expiryDate: { gte: now } }]
        },
        orderBy: { issuedAt: 'desc' }
      }),
      prisma.walletTransaction.findMany({
        where: {
          customerId: session.customerId,
          approvalStatus: { in: ['APPROVED', 'PENDING'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ])

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const formattedOrders = jobs.map(formatPortalOrder)
    const activeOrders = formattedOrders.filter(o => o.isActive)
    const recentOrders = formattedOrders.slice(0, 6)

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        nickName: customer.nickName,
        phone: customer.phone,
        secondaryPhone: customer.secondaryPhone,
        email: customer.email,
        lineId: customer.lineId,
        whatsappId: customer.whatsappId,
        tier: customer.tier || 'Regular',
        isMember: customer.isMember,
        memberId: customer.memberId,
        memberExpiryDate: customer.memberExpiryDate,
        isVIP: customer.isVIP,
        creditBalance: customer.creditBalance || 0,
        brand: customer.brand || 'that_laundry_shop',
        defaultAddress: customer.defaultAddress,
        roomNo: customer.roomNo,
        addresses: customer.addresses || []
      },
      stats: {
        activeOrdersCount: activeOrders.length,
        totalOrdersCount: formattedOrders.length,
        activeVouchersCount: vouchers.length,
        creditBalance: customer.creditBalance || 0
      },
      activeOrders,
      recentOrders,
      activeVouchers: vouchers,
      recentWalletTransactions: walletTxs
    })
  } catch (err: any) {
    console.error('Portal dashboard GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
