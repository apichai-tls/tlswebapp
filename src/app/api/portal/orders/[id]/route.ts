import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolvePortalCustomer, checkPortalPublicAccess } from '@/lib/portal-auth'
import { formatPortalOrder } from '@/lib/portal-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const access = await checkPortalPublicAccess(req)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Customer Portal is currently closed / Coming Soon', portalClosed: true }, { status: 503 })
    }
    const { id } = await context.params
    const session = resolvePortalCustomer(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        branch: true
      }
    })

    if (!job) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (job.customerId !== session.customerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const order = formatPortalOrder(job)

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        branchName: job.branch?.name || 'Main Hub'
      }
    })
  } catch (err: any) {
    console.error('Portal order detail GET error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
