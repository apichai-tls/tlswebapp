import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCustomerToken, verifyServiceApiKey } from '@/lib/external-api-auth'
import { resolvePortalCustomer } from '@/lib/portal-auth'
import { resolveRequestUser, canUserAccessJob } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params

    const hasServiceKey = verifyServiceApiKey(req)
    const authHeader = req.headers.get('authorization')
    const extCustomer = authHeader ? verifyCustomerToken(authHeader) : null
    const portalCustomer = !extCustomer ? resolvePortalCustomer(req) : null
    const authenticatedCustomerId =
      extCustomer?.customerId ||
      portalCustomer?.customerId ||
      (hasServiceKey ? req.headers.get('x-customer-id') : null) ||
      null

    const staffAuth = !hasServiceKey && !authenticatedCustomerId ? await resolveRequestUser(req) : null
    const staffUser = staffAuth?.user || null

    if (!hasServiceKey && !authenticatedCustomerId && !staffUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const job = await prisma.job.findUnique({
      where: { id }
    })

    if (!job) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (staffUser) {
      if (!canUserAccessJob(staffUser, job)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (!hasServiceKey) {
      if (!job.customerId || job.customerId !== authenticatedCustomerId) {
        return NextResponse.json({ error: 'Unauthorized to view this order' }, { status: 403 })
      }
    } else if (authenticatedCustomerId && job.customerId && job.customerId !== authenticatedCustomerId) {
      return NextResponse.json({ error: 'Unauthorized to view this order' }, { status: 403 })
    }

    let items: any[] = []
    try {
      if (job.itemsJson) items = JSON.parse(job.itemsJson)
    } catch {}

    const isPaid = Boolean(job.isPaid || job.isShopPaid)
    const readyForPayment = (job.totalAmount || 0) > 0 && !isPaid

    return NextResponse.json({
      success: true,
      order: {
        id: job.id,
        billNo: job.billNo,
        brand: job.brand,
        status: job.status,
        subStatus: job.subStatus,
        serviceType: job.serviceType,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
        pickupLocation: job.pickupLocation,
        dropoffLocation: job.dropoffLocation,
        scheduledAt: job.scheduledAt,
        completedAt: job.completedAt,
        pickupScheduledAt: job.pickupScheduledAt,
        deliveryScheduledAt: job.deliveryScheduledAt,
        items,
        totalAmount: job.totalAmount || 0,
        deliveryFee: job.fee || 0,
        discount: job.discount || 0,
        isPaid,
        readyForPayment,
        paymentMethod: job.paymentMethod,
        paymentChannel: job.paymentChannel,
        remark: job.remark,
        bagImageUrl: job.bagImageUrl,
        pickupProofImageUrl: job.pickupProofImageUrl,
        deliveryProofImageUrl: job.deliveryProofImageUrl,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      }
    })
  } catch (err: any) {
    console.error('Order detail GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
