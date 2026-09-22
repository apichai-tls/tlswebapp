import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyBeamWebhookSignature } from '@/lib/external-api-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-beam-signature') || req.headers.get('X-Beam-Signature')

    // Verify HMAC-SHA256 signature if webhook secret is configured
    if (process.env.BEAM_WEBHOOK_SECRET) {
      const isValid = verifyBeamWebhookSignature(rawBody, signature, process.env.BEAM_WEBHOOK_SECRET)
      if (!isValid) {
        console.warn('✘ Beam Webhook: Invalid signature received')
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
      }
    }

    let payload: any = {}
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    console.log(`[Beam Webhook] Event: ${payload.event || payload.type || 'unknown'}`)

    const event = payload.event || payload.type
    const data = payload.data || payload

    // We process charge.succeeded, payment_link.paid, and bolt_intent.paid
    const successEvents = [
      'charge.succeeded',
      'payment_link.paid',
      'bolt_intent.paid',
      'payment.succeeded'
    ]

    if (event && !successEvents.includes(event)) {
      // Return 200 OK for other events so Beam doesn't retry
      return NextResponse.json({ received: true, ignored: true, event })
    }

    // Resolve order / job ID from reference_id or metadata
    const orderId =
      data.reference_id ||
      data.referenceId ||
      data.metadata?.orderId ||
      data.metadata?.jobId ||
      data.metadata?.reference_id

    if (!orderId) {
      console.warn('[Beam Webhook] Missing order reference_id in payload:', data)
      return NextResponse.json({ error: 'Missing reference_id in payload' }, { status: 400 })
    }

    const job = await prisma.job.findUnique({
      where: { id: orderId }
    })

    if (!job) {
      console.warn(`[Beam Webhook] Job not found for reference_id: ${orderId}`)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Resolve payment amount (Beam amounts may be in minor currency satang if integer > 1000, or standard float)
    let paidAmount = job.totalAmount || 0
    if (data.amount !== undefined) {
      const rawAmt = parseFloat(data.amount)
      paidAmount = rawAmt > 10000 && Number.isInteger(rawAmt) ? rawAmt / 100 : rawAmt
    }

    const paymentMethodCode = data.payment_method || data.paymentMethod || 'promptpay'
    const chargeId = data.id || data.charge_id || 'BEAM-' + Date.now()
    const now = new Date()

    // Parse existing payments from adminNotesJson
    let adminNotesObj: any = {}
    let existingPayments: any[] = []
    try {
      if (job.adminNotesJson) {
        adminNotesObj = JSON.parse(job.adminNotesJson)
        if (Array.isArray(adminNotesObj.payments)) {
          existingPayments = adminNotesObj.payments
        }
      }
    } catch {}

    const newPaymentEntry = {
      amount: paidAmount,
      method: paymentMethodCode === 'card' ? 'card' : 'transfer',
      channel: `Beam Checkout (${paymentMethodCode.toUpperCase()})`,
      timestamp: now.toISOString(),
      chargeId
    }

    adminNotesObj.payments = [...existingPayments, newPaymentEntry]

    // Update Job to Paid
    const updatedJob = await prisma.job.update({
      where: { id: orderId },
      data: {
        isPaid: true,
        isShopPaid: true,
        paymentMethod: paymentMethodCode === 'card' ? 'card' : 'transfer',
        paymentChannel: `Beam (${paymentMethodCode.toUpperCase()})`,
        csoPaidAt: now,
        shopPaidAt: now,
        subStatus: job.subStatus === 'billing' ? 'wash' : job.subStatus, // advance to wash
        adminNotesJson: JSON.stringify(adminNotesObj)
      }
    })

    console.log(`✔ [Beam Webhook] Job ${orderId} successfully marked as PAID (Amount: ${paidAmount} THB)`)

    return NextResponse.json({
      success: true,
      message: 'Payment recorded and order marked as paid',
      orderId: updatedJob.id,
      isPaid: updatedJob.isPaid,
      paidAmount,
      channel: updatedJob.paymentChannel
    })
  } catch (err: any) {
    console.error('Beam Webhook error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
