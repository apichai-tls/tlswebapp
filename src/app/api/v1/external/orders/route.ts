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

    const jobs = await prisma.job.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' }
    })

    const orders = jobs.map(j => {
      let items: any[] = []
      try {
        if (j.itemsJson) items = JSON.parse(j.itemsJson)
      } catch {}

      return {
        id: j.id,
        billNo: j.billNo,
        status: j.status,
        subStatus: j.subStatus,
        serviceType: j.serviceType,
        pickupLocation: j.pickupLocation,
        scheduledAt: j.scheduledAt,
        completedAt: j.completedAt,
        totalAmount: j.totalAmount || 0,
        isPaid: Boolean(j.isPaid || j.isShopPaid),
        paymentChannel: j.paymentChannel,
        itemsCount: items.length,
        items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        brand: j.brand,
        createdAt: j.createdAt
      }
    })

    return NextResponse.json({
      success: true,
      orders
    })
  } catch (err: any) {
    console.error('Orders GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
