import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyBeamWebhookSignature } from '@/lib/external-api-auth'
import { invalidateDbCache } from '@/lib/db-cache'
import { processTopUpAction } from '@/actions/db'

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
    const rawEvent =
      eventHeader ||
      payload.event ||
      payload.type ||
      (payload.status === 'SUCCEEDED' ? 'charge.succeeded' : payload.status === 'PAID' ? 'payment_link.paid' : 'unknown')

    const event = String(rawEvent).toLowerCase().trim()
    console.log(`[Beam Webhook] Event: ${event}`)

    // Handle failure / cancellation events cleanly with 200 OK so Beam doesn't retry
    if (
      event === 'charge.failed' ||
      event === 'card_authorization.failed' ||
      event === 'bolt_intent.canceled' ||
      event === 'bolt_intent.expired'
    ) {
      console.warn(`[Beam Webhook] Payment unsuccessful or canceled event received: ${event}`)
      return NextResponse.json({ received: true, event, status: 'acknowledged_failure' })
    }

    if (event === 'refund.succeeded' || event === 'refund.failed') {
      console.log(`[Beam Webhook] Refund event received: ${event}`)
      return NextResponse.json({ received: true, event, status: 'acknowledged_refund' })
    }

    // Success events
    const successEvents = [
      'charge.succeeded',
      'payment_link.paid',
      'bolt_intent.paid',
      'payment.succeeded',
      'purchase.succeeded',
    ]

    let isSuccessEvent = successEvents.includes(event)

    // transaction.created can also be a successful payment event
    if (event === 'transaction.created') {
      const txType = (payload.transactionType || payload.type || '').toUpperCase()
      if (txType === 'PAYMENT' || payload.grossAmount > 0) {
        isSuccessEvent = true
      } else {
        console.log(`[Beam Webhook] Non-payment transaction ledger event: ${txType}`)
        return NextResponse.json({ received: true, event, status: 'acknowledged_transaction' })
      }
    }

    if (!isSuccessEvent && payload.status !== 'SUCCEEDED' && payload.status !== 'PAID') {
      // Return 200 OK for other unhandled events so Beam doesn't endlessly retry
      return NextResponse.json({ received: true, ignored: true, event })
    }

    // Resolve order / reference ID
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
      payload.metadata?.reference_id ||
      payload.metadata?.referenceId

    // Resolve paymentLinkId / sourceId
    const paymentLinkId =
      payload.paymentLinkId ||
      payload.payment_link_id ||
      payload.sourceId ||
      payload.source_id ||
      (payload.source === 'PAYMENT_LINK' ? payload.sourceId : undefined) ||
      (payload.chargeSource === 'PAYMENT_LINK' ? payload.sourceId : undefined) ||
      payload.data?.paymentLinkId ||
      payload.data?.sourceId ||
      payload.id

    // ─────────────────────────────────────────────────────────────────────────────
    // BRANCH A: TOP-UP HANDLING (Member Wallet Top-Up via Beam)
    // ─────────────────────────────────────────────────────────────────────────────
    const isTopUpOrder = typeof orderId === 'string' && orderId.startsWith('TU-')
    let pendingTopUp = null

    if (isTopUpOrder || paymentLinkId || orderId) {
      pendingTopUp = await prisma.transaction.findFirst({
        where: {
          OR: [
            ...(orderId ? [{ id: orderId }] : []),
            ...(paymentLinkId ? [{ description: { contains: paymentLinkId } }] : []),
            ...(orderId ? [{ description: { contains: orderId } }] : []),
          ],
          type: 'BEAM_TOPUP_PENDING',
        },
      })
    }

    if (pendingTopUp) {
      if (pendingTopUp.status === 'COMPLETED') {
        console.log(`[Beam Webhook] Top-Up ${pendingTopUp.id} was already completed previously. Acknowledging 200 OK.`)
        return NextResponse.json({
          success: true,
          type: 'topup',
          message: 'Top-up already completed previously',
          customerId: pendingTopUp.memberId,
        })
      }

      let meta: any = {}
      try {
        meta = JSON.parse(pendingTopUp.description)
      } catch {}

      // Resolve paid amount (satang conversion: Beam amounts are integers in Satang)
      let paidAmount = pendingTopUp.amount
      const rawAmt =
        payload.amount ??
        payload.grossAmount ??
        payload.order?.netAmount ??
        payload.data?.amount ??
        payload.data?.order?.netAmount

      if (rawAmt !== undefined) {
        const num = parseFloat(rawAmt)
        if (!isNaN(num)) {
          if (pendingTopUp.amount && Math.abs(num - pendingTopUp.amount * 100) < 1) {
            paidAmount = pendingTopUp.amount
          } else if (num >= 100 && Number.isInteger(num)) {
            paidAmount = num / 100
          } else {
            paidAmount = num
          }
        }
      }

      const receiptNumber = `TOP-${Date.now().toString().slice(-6)}`
      const finalBonus = meta.bonusAmount || 0
      const finalTotalCredit = meta.totalCredit || (paidAmount + finalBonus)

      await processTopUpAction({
        receiptNumber,
        customerId: pendingTopUp.memberId,
        paidAmount,
        bonusAmount: finalBonus,
        totalCredit: finalTotalCredit,
        paymentChannel: 'BEAM Gateway',
        packageName: meta.packageName || 'TOPUP',
        actorId: meta.actorId || null,
        actorName: meta.actorName || 'Beam Webhook',
        branchId: meta.branchId || null,
        priceListId: meta.priceListId || null,
        paymentLinkId: paymentLinkId || meta.paymentLinkId || undefined,
      })

      await prisma.transaction.update({
        where: { id: pendingTopUp.id },
        data: {
          status: 'COMPLETED',
          updatedAt: new Date(),
        },
      })

      try {
        invalidateDbCache()
      } catch (e) {
        console.warn('[Beam Webhook] Failed to invalidate cache after topup:', e)
      }

      console.log(`✔ [Beam Webhook] Top-Up for Customer ${pendingTopUp.memberId} successfully fulfilled (Amount: ${paidAmount} THB, Credit: ${finalTotalCredit})`)

      return NextResponse.json({
        success: true,
        type: 'topup',
        message: 'Top-Up recorded and wallet credited',
        customerId: pendingTopUp.memberId,
        paidAmount,
        totalCredit: finalTotalCredit,
      })
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // BRANCH B: LAUNDRY JOB HANDLING
    // ─────────────────────────────────────────────────────────────────────────────
    if (!orderId && !paymentLinkId) {
      console.warn('[Beam Webhook] Missing both order referenceId and paymentLinkId in payload:', payload)
      return NextResponse.json({ error: 'Missing reference_id in payload' }, { status: 400 })
    }

    const cleanOrderId = typeof orderId === 'string'
      ? orderId.replace(/^Order\s*#?/i, '').replace(/^#/, '').trim()
      : ''

    let job = null

    // 1. Primary ID lookup
    if (orderId) {
      job = await prisma.job.findUnique({
        where: { id: orderId }
      })
    }

    // 2. BillNo lookup
    if (!job && orderId) {
      job = await prisma.job.findFirst({
        where: { billNo: orderId }
      })
    }

    // 3. Cleaned Order ID lookup
    if (!job && cleanOrderId) {
      job = await prisma.job.findUnique({
        where: { id: cleanOrderId }
      })
      if (!job) {
        job = await prisma.job.findFirst({
          where: { billNo: cleanOrderId }
        })
      }
    }

    // 4. Fallback: match by paymentLinkId in adminNotesJson
    if (!job && paymentLinkId) {
      job = await prisma.job.findFirst({
        where: {
          adminNotesJson: { contains: paymentLinkId }
        }
      })
    }

    // 5. Fallback: match by orderId inside adminNotesJson
    if (!job && orderId) {
      job = await prisma.job.findFirst({
        where: {
          adminNotesJson: { contains: orderId }
        }
      })
    }

    if (!job) {
      console.warn(`[Beam Webhook] Job not found for reference_id: ${orderId} (paymentLinkId: ${paymentLinkId})`)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Resolve payment amount (Beam amounts are in Satang if >= 100 integer)
    let paidAmount = job.totalAmount || 0
    const rawAmtVal =
      payload.amount ??
      payload.grossAmount ??
      payload.order?.netAmount ??
      payload.data?.amount ??
      payload.data?.order?.netAmount

    if (rawAmtVal !== undefined) {
      const num = parseFloat(rawAmtVal)
      if (!isNaN(num)) {
        if (job.totalAmount && Math.abs(num - job.totalAmount * 100) < 1) {
          paidAmount = job.totalAmount
        } else if (num >= 100 && Number.isInteger(num)) {
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
      paymentLinkId ||
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
        isPaid: true,
      })
    }

    const newPaymentEntry = {
      amount: paidAmount,
      method: paymentMethodCode,
      channel: paymentChannel,
      timestamp: now.toISOString(),
      chargeId,
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
        status: job.status === 'billing' ? 'pending' : job.status,
        subStatus: job.subStatus === 'billing' ? 'wash' : job.subStatus,
        adminNotesJson: JSON.stringify(adminNotesObj),
      },
    })

    try {
      invalidateDbCache()
    } catch (cacheErr) {
      console.warn('[Beam Webhook] Failed to invalidate cache:', cacheErr)
    }

    console.log(`✔ [Beam Webhook] Job ${job.id} successfully marked as PAID (Amount: ${paidAmount} THB, Channel: ${paymentChannel})`)

    return NextResponse.json({
      success: true,
      message: 'Payment recorded and order marked as paid',
      orderId: updatedJob.id,
      isPaid: updatedJob.isPaid,
      paidAmount,
      channel: updatedJob.paymentChannel,
    })
  } catch (err: any) {
    console.error('Beam Webhook error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
