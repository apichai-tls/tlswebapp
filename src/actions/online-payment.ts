'use server';

import { prisma } from '@/lib/prisma';
import { createBeamPaymentLink, getBeamChargesByReference, disableBeamPaymentLink } from '@/lib/beam';

export interface CreateOnlinePaymentResult {
  success: boolean;
  paymentLinkId?: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  amount?: number;
  error?: string;
}

export interface CheckPaymentStatusResult {
  success: boolean;
  isPaid: boolean;
  paidAmount?: number;
  paymentChannel?: string;
  paidAt?: string;
  error?: string;
}

/**
 * Create or retrieve an online payment link and QR code for a given Job
 */
export async function createJobOnlinePaymentAction(
  jobId: string,
  customAmount?: number
): Promise<CreateOnlinePaymentResult> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (job.isPaid || job.isShopPaid) {
      return { success: false, error: 'ออเดอร์นี้ชำระเงินเรียบร้อยแล้ว' };
    }

    const amount = Number(customAmount !== undefined ? customAmount : (job.totalAmount || 0));
    if (amount <= 0) {
      return { success: false, error: 'ยอดชำระต้องมากกว่า 0 บาท' };
    }

    // Call Beam API to generate payment link
    const description = `TLS Order #${job.billNo || job.id} (${job.customerName || 'Customer'})`;
    const res = await createBeamPaymentLink({
      referenceId: job.id,
      amount,
      description,
      customerPhone: job.customerPhone || undefined,
    });

    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'Failed to create payment link with Beam' };
    }

    const { id: paymentLinkId, url: paymentUrl } = res.data;

    // Use standard QR code generator service for the payment URL
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(paymentUrl)}`;

    // Update job notes with payment link metadata
    try {
      let adminNotesObj: any = {};
      if (job.adminNotesJson) {
        adminNotesObj = JSON.parse(job.adminNotesJson);
      }
      adminNotesObj.lastBeamPaymentLink = {
        id: paymentLinkId,
        url: paymentUrl,
        amount,
        createdAt: new Date().toISOString(),
      };

      await prisma.job.update({
        where: { id: job.id },
        data: {
          adminNotesJson: JSON.stringify(adminNotesObj),
        },
      });
    } catch (dbErr) {
      console.warn('[Beam Action] Failed to save payment link meta to job:', dbErr);
    }

    return {
      success: true,
      paymentLinkId,
      paymentUrl,
      qrCodeUrl,
      amount,
    };
  } catch (err: any) {
    console.error('[Beam Action] createJobOnlinePaymentAction error:', err);
    return { success: false, error: err.message || 'Server error' };
  }
}

/**
 * Check if the Job has been marked as paid (either by webhook or by direct Beam API poll)
 */
export async function checkJobOnlinePaymentStatusAction(
  jobId: string
): Promise<CheckPaymentStatusResult> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return { success: false, isPaid: false, error: 'Job not found' };
    }

    // Check if already marked as paid in local database (via Webhook)
    if (job.isPaid || job.isShopPaid) {
      return {
        success: true,
        isPaid: true,
        paidAmount: job.totalAmount || 0,
        paymentChannel: job.paymentChannel || 'Beam Checkout',
        paidAt: (job.shopPaidAt || job.csoPaidAt || new Date()).toISOString(),
      };
    }

    // If not marked yet in DB, check Beam charges directly as a fallback
    const chargesRes = await getBeamChargesByReference(job.id);
    if (chargesRes.success && chargesRes.data && chargesRes.data.length > 0) {
      const successfulCharge = chargesRes.data.find(
        (c: any) => c.status === 'SUCCEEDED' || c.status === 'SUCCESS' || c.status === 'CAPTURED'
      );

      if (successfulCharge) {
        // Mark job as paid in DB
        const now = new Date();
        const paidAmount = successfulCharge.amount ? successfulCharge.amount / 100 : (job.totalAmount || 0);
        const methodType = successfulCharge.paymentMethod?.paymentMethodType || 'BEAM';

        let adminNotesObj: any = {};
        let existingPayments: any[] = [];
        try {
          if (job.adminNotesJson) {
            adminNotesObj = JSON.parse(job.adminNotesJson);
            if (Array.isArray(adminNotesObj.payments)) {
              existingPayments = adminNotesObj.payments;
            }
          }
        } catch {}

        const newPaymentEntry = {
          amount: paidAmount,
          method: 'card',
          channel: `Beam Checkout (${methodType})`,
          timestamp: now.toISOString(),
          chargeId: successfulCharge.chargeId || successfulCharge.id,
        };

        adminNotesObj.payments = [...existingPayments, newPaymentEntry];

        const updated = await prisma.job.update({
          where: { id: job.id },
          data: {
            isPaid: true,
            isShopPaid: true,
            paymentMethod: 'card',
            paymentChannel: `Beam (${methodType})`,
            csoPaidAt: now,
            shopPaidAt: now,
            subStatus: job.subStatus === 'billing' ? 'wash' : job.subStatus,
            adminNotesJson: JSON.stringify(adminNotesObj),
          },
        });

        return {
          success: true,
          isPaid: true,
          paidAmount,
          paymentChannel: updated.paymentChannel || 'Beam Checkout',
          paidAt: now.toISOString(),
        };
      }
    }

    return {
      success: true,
      isPaid: false,
    };
  } catch (err: any) {
    console.error('[Beam Action] checkJobOnlinePaymentStatusAction error:', err);
    return { success: false, isPaid: false, error: err.message };
  }
}
