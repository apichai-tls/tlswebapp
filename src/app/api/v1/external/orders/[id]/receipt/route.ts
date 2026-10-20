import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateReceiptNumber } from '@/lib/utils'
import { verifyCustomerToken, verifyServiceApiKey } from '@/lib/external-api-auth'
import { resolveRequestUser, canUserAccessJob } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params

    // 1. Verify authentication before returning any order or customer details
    const authHeader = req.headers.get('authorization')
    const verifiedCustomer = authHeader ? verifyCustomerToken(authHeader) : null
    const isServiceCaller = verifyServiceApiKey(req)
    const { user: staffUser } = await resolveRequestUser(req)
    const isAuthorizedStaff = Boolean(staffUser && staffUser.isActive)

    if (!verifiedCustomer && !isServiceCaller && !isAuthorizedStaff) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid customer token, service API key, or staff session required' },
        { status: 401 }
      )
    }

    const job = await prisma.job.findUnique({
      where: { id }
    })

    if (!job) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // 2. Enforce customer ownership or staff branch authorization
    if (verifiedCustomer) {
      if (!job.customerId || job.customerId !== verifiedCustomer.customerId) {
        return NextResponse.json(
          { error: 'Forbidden: You do not have permission to view this receipt' },
          { status: 403 }
        )
      }
    } else if (isServiceCaller) {
      const requestedCustomerId = req.headers.get('x-customer-id')
      if (requestedCustomerId && job.customerId && job.customerId !== requestedCustomerId) {
        return NextResponse.json(
          { error: 'Forbidden: Receipt does not belong to the specified customer' },
          { status: 403 }
        )
      }
    } else if (staffUser) {
      if (!canUserAccessJob(staffUser, job)) {
        return NextResponse.json(
          { error: 'Forbidden: You do not have branch access to this order' },
          { status: 403 }
        )
      }
    }

    const isPaid = Boolean(job.isPaid || job.isShopPaid)
    if (!isPaid) {
      return NextResponse.json({ error: 'Receipt is not available yet (Order is not paid)' }, { status: 400 })
    }

    let items: any[] = []
    try {
      if (job.itemsJson) items = JSON.parse(job.itemsJson)
    } catch {}

    const receiptNumber = job.billNo || generateReceiptNumber(job.id)
    const paidAt = job.shopPaidAt || job.csoPaidAt || job.completedAt || job.updatedAt

    return NextResponse.json({
      success: true,
      receipt: {
        storeName: 'Noname Laundry',
        tagline: 'Online Laundry & Dry Clean Service',
        website: 'https://nonamelaundry.com',
        receiptNumber,
        orderId: job.id,
        customerName: job.customerName || 'Customer',
        customerPhone: job.customerPhone || '-',
        deliveryAddress: job.pickupLocation,
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          total: (i.quantity || 1) * (i.price || 0)
        })),
        subtotal: job.totalAmount || 0,
        deliveryFee: job.fee || 0,
        discount: job.discount || 0,
        totalAmount: job.totalAmount || 0,
        paymentChannel: job.paymentChannel || 'Beam Checkout',
        paidAt,
        status: 'PAID',
        createdAt: job.createdAt
      }
    })
  } catch (err: any) {
    console.error('Receipt GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
