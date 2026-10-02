import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyBeamWebhookSignature } from '@/lib/external-api-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const signature =
      req.headers.get('x-beam-signature') ||
      req.headers.get('beam-signature') ||
      req.headers.get('x-signature') ||
      req.headers.get('signature')

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

    const eventHeader = req.headers.get('x-beam-event') || req.headers.get('beam-event')
    const event =
      eventHeader ||
      payload.event ||
      payload.type ||
      (payload.status === 'SUCCEEDED' ? 'charge.succeeded' : payload.status === 'PAID' ? 'payment_link.paid' : 'unknown')

    console.log(`[Beam Webhook] Event: ${event}`)

    // We process charge.succeeded, payment_link.paid, bolt_intent.paid, purchase.succeeded, and payment.succeeded
    const successEvents = [
      'charge.succeeded',
      'payment_link.paid',
      'bolt_intent.paid',
      'payment.succeeded',
      'purchase.succeeded'
    ]

    // Handle failure / cancellation events cleanly with 200 OK so Beam doesn't retry
    if (event === 'charge.failed' || event === 'card_authorization.failed' || event === 'bolt_intent.canceled' || event === 'bolt_intent.expired') {
      console.warn(`[Beam Webhook] Payment unsuccessful or canceled event received: ${event}`)
      return NextResponse.json({ received: true, event, status: 'acknowledged_failure' })
    }

    if (event === 'refund.succeeded' || event === 'refund.failed') {
      console.log(`[Beam Webhook] Refund event received: ${event}`)
      return NextResponse.json({ received: true, event, status: 'acknowledged_refund' })
    }

    if (event === 'transaction.created') {
      console.log(`[Beam Webhook] Accounting ledger event received: ${event}`)
      return NextResponse.json({ received: true, event, status: 'acknowledged_transaction' })
    }

    if (event && !successEvents.includes(event)) {
      // Return 200 OK for other events so Beam doesn't retry
      return NextResponse.json({ received: true, ignored: true, event })
    }

    // Resolve order / job ID from referenceId, order object, or metadata
    const orderId =
      payload.referenceId ||
      payload.reference_id ||
      payload.order?.referenceId ||
      payload.order?.reference_id ||
      payload.data?.referenceId ||
      payload.data?.reference_id ||
      payload.data?.order?.referenceId ||
      payload.data?.order?.reference_id ||
      payload.metadata?.orderId ||
      payload.metadata?.jobId ||
      payload.metadata?.reference_id

    if (!orderId) {
      console.warn('[Beam Webhook] Missing order referenceId in payload:', payload)
      return NextResponse.json({ error: 'Missing reference_id in payload' }, { status: 400 })
    }

    // Lookup job by primary ID first, then fallback to billNo
    let job = await prisma.job.findUnique({
      where: { id: orderId }
    })

    if (!job) {
      job = await prisma.job.findFirst({
        where: { billNo: orderId }
      })
    }

    if (!job) {
      console.warn(`[Beam Webhook] Job not found for reference_id: ${orderId}`)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Resolve payment amount (Beam amounts may be in minor currency satang if integer > 1000, or standard float)
    let paidAmount = job.totalAmount || 0
    const rawAmtVal =
      payload.amount ??
      payload.order?.netAmount ??
      payload.data?.amount ??
      payload.data?.order?.netAmount

    if (rawAmtVal !== undefined) {
      const num = parseFloat(rawAmtVal)
      if (!isNaN(num)) {
        if (job.totalAmount && Math.abs(num - job.totalAmount * 100) < 1) {
          paidAmount = job.totalAmount
        } else if (num > 10000 && Number.isInteger(num)) {
          paidAmount = num / 100
        } else {
          paidAmount = num
        }
      }
    }

    // Determine payment method details
    let paymentMethodCode = 'transfer'
    let paymentChannel = 'Beam (PromptPay)'

    const pm = payload.paymentMethod || payload.data?.paymentMethod
    if (pm) {
      if (typeof pm === 'string') {
        paymentMethodCode = pm.toLowerCase().includes('card') ? 'card' : 'transfer'
        paymentChannel = `Beam (${pm.toUpperCase()})`
      } else if (typeof pm === 'object') {
        const pmType = (pm.paymentMethodType || pm.type || '').toUpperCase()
        if (pmType === 'CARD' || pm.card) {
          paymentMethodCode = 'card'
          const brand = pm.card?.brand ? `${pm.card.brand} ` : ''
          const last4 = pm.card?.last4 ? `****${pm.card.last4}` : ''
          paymentChannel = `Beam (Card ${brand}${last4})`.trim()
        } else if (pmType === 'QR_PROMPT_PAY' || pm.qrPromptPay) {
          paymentMethodCode = 'transfer'
          paymentChannel = 'Beam (PromptPay)'
        } else if (pmType === 'MOBILE_BANKING' || pm.mobileBanking) {
          paymentMethodCode = 'transfer'
          paymentChannel = 'Beam (Mobile Banking)'
        } else {
          paymentMethodCode = 'transfer'
          paymentChannel = `Beam (${pmType || 'Gateway'})`
        }
      }
    }

    const chargeId =
      payload.chargeId ||
      payload.id ||
      payload.data?.chargeId ||
      payload.data?.id ||
      payload.paymentLinkId ||
      'BEAM-' + Date.now()

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

    // Idempotency: avoid recording duplicate payment if job is already marked as paid via Beam or this charge is already recorded
    const isAlreadyPaidViaBeam =
      job.isPaid &&
      (existingPayments.some((p: any) => p.chargeId === chargeId || (p.channel && p.channel.toLowerCase().includes('beam'))) ||
        (job.paymentChannel && job.paymentChannel.toLowerCase().includes('beam')))

    if (isAlreadyPaidViaBeam) {
      console.log(`[Beam Webhook] Job ${job.id} is already marked as paid via Beam. Acknowledging event: ${event}`)
      return NextResponse.json({
        success: true,
        message: 'Payment already recorded previously',
        orderId: job.id,
        isPaid: true
      })
    }

    const newPaymentEntry = {
      amount: paidAmount,
      method: paymentMethodCode,
      channel: paymentChannel,
      timestamp: now.toISOString(),
      chargeId
    }

    adminNotesObj.payments = [...existingPayments, newPaymentEntry]

    // Update Job to Paid
    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        isPaid: true,
        isShopPaid: true,
        paymentMethod: paymentMethodCode,
        paymentChannel,
        totalAmount: paidAmount,
        csoPaidAt: now,
        shopPaidAt: now,
        subStatus: job.subStatus === 'billing' ? 'wash' : job.subStatus, // advance to wash
        adminNotesJson: JSON.stringify(adminNotesObj)
      }
    })

    console.log(`✔ [Beam Webhook] Job ${job.id} successfully marked as PAID (Amount: ${paidAmount} THB, Channel: ${paymentChannel})`)

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
