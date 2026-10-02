'use server';

import { prisma } from '@/lib/prisma';
import {
  createBeamPaymentLink,
  getBeamPaymentLink,
  getBeamChargesByReference,
  disableBeamPaymentLink,
} from '@/lib/beam';

export interface CreateOnlinePaymentResult {
  success: boolean;
  paymentLinkId?: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  amount?: number;
  isAlreadyPaid?: boolean;
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
 * Helper to mark a job as paid in DB and append to adminNotes payments history
 */
async function markJobAsPaidInDb(params: {
  job: any;
  paidAmount: number;
  paymentMethodCode?: string;
  channelName?: string;
  chargeId?: string;
}) {
  const { job, paidAmount, paymentMethodCode = 'card', channelName = 'Beam Checkout', chargeId } = params;
  const now = new Date();

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
    method: paymentMethodCode === 'card' ? 'card' : 'transfer',
    channel: channelName,
    timestamp: now.toISOString(),
    chargeId: chargeId || 'BEAM-' + Date.now(),
  };

  adminNotesObj.payments = [...existingPayments, newPaymentEntry];

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      isPaid: true,
      isShopPaid: true,
      paymentMethod: paymentMethodCode === 'card' ? 'card' : 'transfer',
      paymentChannel: channelName,
      totalAmount: paidAmount,
      csoPaidAt: now,
      shopPaidAt: now,
      subStatus: job.subStatus === 'billing' ? 'wash' : job.subStatus,
      adminNotesJson: JSON.stringify(adminNotesObj),
    },
  });

  return updated;
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
      return { success: false, isAlreadyPaid: true, error: 'ออเดอร์นี้ชำระเงินเรียบร้อยแล้ว' };
    }

    const amount = Number(customAmount !== undefined ? customAmount : (job.totalAmount || 0));
    if (amount <= 0) {
      return { success: false, error: 'ยอดชำระต้องมากกว่า 0 บาท' };
    }

    // Check if we already have an active Beam Payment Link for this job
    let adminNotesObj: any = {};
    try {
      if (job.adminNotesJson) {
        adminNotesObj = JSON.parse(job.adminNotesJson);
      }
    } catch {}

    const existingLink = adminNotesObj.lastBeamPaymentLink;
    if (existingLink?.id && existingLink?.url && Math.abs((existingLink.amount || 0) - amount) < 0.01) {
      // Check status of existing link with Beam
      const linkCheck = await getBeamPaymentLink(existingLink.id);
      if (linkCheck.success && linkCheck.data) {
        if (linkCheck.data.status === 'PAID') {
          // Already paid! Update DB immediately
          await markJobAsPaidInDb({
            job,
            paidAmount: amount,
            channelName: 'Beam Checkout (PAID)',
            chargeId: existingLink.id,
          });
          return {
            success: false,
            isAlreadyPaid: true,
            error: 'ออเดอร์นี้ลูกค้าชำระเงินเรียบร้อยแล้ว',
          };
        }

        if (linkCheck.data.status === 'ACTIVE') {
          // Link is still active and valid, reuse it!
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(existingLink.url)}`;
          return {
            success: true,
            paymentLinkId: existingLink.id,
            paymentUrl: existingLink.url,
            qrCodeUrl,
            amount,
          };
        }
      }
    }

    // Call Beam API to generate a new payment link
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
          ...(Math.abs((job.totalAmount || 0) - amount) >= 0.01 ? { totalAmount: amount } : {}),
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
 * Check if the Job has been marked as paid (either by webhook, payment link check, or charge poll)
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

    // 1. Check if already marked as paid in local database (via Webhook)
    if (job.isPaid || job.isShopPaid) {
      return {
        success: true,
        isPaid: true,
        paidAmount: job.totalAmount || 0,
        paymentChannel: job.paymentChannel || 'Beam Checkout',
        paidAt: (job.shopPaidAt || job.csoPaidAt || new Date()).toISOString(),
      };
    }

    let adminNotesObj: any = {};
    try {
      if (job.adminNotesJson) {
        adminNotesObj = JSON.parse(job.adminNotesJson);
      }
    } catch {}

    // 2. Check Beam Payment Link status directly
    if (adminNotesObj.lastBeamPaymentLink?.id) {
      const linkRes = await getBeamPaymentLink(adminNotesObj.lastBeamPaymentLink.id);
      if (linkRes.success && linkRes.data?.status === 'PAID') {
        const paidAmount = adminNotesObj.lastBeamPaymentLink.amount || job.totalAmount || 0;
        const updated = await markJobAsPaidInDb({
          job,
          paidAmount,
          channelName: 'Beam Checkout (Online)',
          chargeId: adminNotesObj.lastBeamPaymentLink.id,
        });

        return {
          success: true,
          isPaid: true,
          paidAmount,
          paymentChannel: updated.paymentChannel || 'Beam Checkout',
          paidAt: new Date().toISOString(),
        };
      }
    }

    // 3. Fallback: check Beam charges directly
    const chargesRes = await getBeamChargesByReference(job.id);
    if (chargesRes.success && chargesRes.data && chargesRes.data.length > 0) {
      const successfulCharge = chargesRes.data.find(
        (c: any) => c.status === 'SUCCEEDED' || c.status === 'SUCCESS' || c.status === 'CAPTURED'
      );

      if (successfulCharge) {
        const paidAmount = successfulCharge.amount ? successfulCharge.amount / 100 : (job.totalAmount || 0);
        const methodType = successfulCharge.paymentMethod?.paymentMethodType || 'BEAM';
        const updated = await markJobAsPaidInDb({
          job,
          paidAmount,
          paymentMethodCode: methodType === 'CARD' ? 'card' : 'transfer',
          channelName: `Beam (${methodType})`,
          chargeId: successfulCharge.chargeId || successfulCharge.id,
        });

        return {
          success: true,
          isPaid: true,
          paidAmount,
          paymentChannel: updated.paymentChannel || 'Beam Checkout',
          paidAt: new Date().toISOString(),
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

/**
 * On-demand action to check and synchronize payment status with user-friendly feedback
 */
export async function syncJobBeamPaymentStatusAction(jobId: string): Promise<{
  success: boolean;
  isPaid: boolean;
  message: string;
  paidAmount?: number;
}> {
  const result = await checkJobOnlinePaymentStatusAction(jobId);
  if (!result.success) {
    return {
      success: false,
      isPaid: false,
      message: result.error || 'ไม่สามารถตรวจสอบสถานะกับ Beam ได้',
    };
  }

  if (result.isPaid) {
    return {
      success: true,
      isPaid: true,
      paidAmount: result.paidAmount,
      message: `🎉 ได้รับยอดชำระเงิน ฿${result.paidAmount?.toLocaleString()} เรียบร้อยแล้ว`,
    };
  }

  return {
    success: true,
    isPaid: false,
    message: 'ยังไม่พบรายการชำระเงิน หรือลูกค้ารอดำเนินการ',
  };
}

