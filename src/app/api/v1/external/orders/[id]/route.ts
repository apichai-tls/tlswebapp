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

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const customerId = resolveCustomerId(req)

    const job = await prisma.job.findUnique({
      where: { id }
    })

    if (!job) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // If customerId is provided, ensure customer owns this job
    if (customerId && job.customerId && job.customerId !== customerId) {
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
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
