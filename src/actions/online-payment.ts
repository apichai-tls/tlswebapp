'use server';

import { prisma } from '@/lib/prisma';
import { invalidateDbCache } from '@/lib/db-cache';
import { publishOrderEvent } from '@/lib/realtime-bus';
import { assertServerActionAuthorized, canUserAccessJob } from '@/lib/server-auth';
import { processTopUpAction, evaluateAndIssuePromotionCouponsAction, lockJobRowForUpdate } from '@/actions/db';
import { generateProformaBaseNumber } from '@/lib/utils';
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
 * Helper to record a Beam payment in DB and mark job as paid once full totalAmount is covered
 */
async function markJobAsPaidInDb(params: {
  job: any;
  paidAmount: number;
  paymentMethodCode?: string;
  channelName?: string;
  chargeId?: string;
}) {
  const { job: initialJob, paidAmount, paymentMethodCode = 'card', channelName = 'Beam Checkout', chargeId } = params;
  const now = new Date();

  const { updated, transitionedToShopPaid } = await prisma.$transaction(async (tx) => {
    await lockJobRowForUpdate(tx, initialJob.id);
    const job = (await tx.job.findUnique({ where: { id: initialJob.id } })) || initialJob;

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

    const effectiveChargeId = chargeId || 'BEAM-' + Date.now();
    const alreadyRecorded = existingPayments.some(
      (p: any) => p && p.chargeId && (p.chargeId === effectiveChargeId || p.chargeId === adminNotesObj.lastBeamPaymentLink?.id)
    );

    const updatedPayments = alreadyRecorded
      ? existingPayments
      : [
          ...existingPayments,
          {
            amount: paidAmount,
            method: paymentMethodCode === 'card' ? 'card' : 'transfer',
            channel: channelName,
            timestamp: now.toISOString(),
            chargeId: effectiveChargeId,
          },
        ];

    adminNotesObj.payments = updatedPayments;

    const totalPaidAfter = updatedPayments.reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);
    const currentJobTotal = Number(job.totalAmount) || 0;
    const effectiveTotalAmount = Math.max(currentJobTotal, totalPaidAfter);
    const isFullyPaidNow = effectiveTotalAmount > 0 && totalPaidAfter >= effectiveTotalAmount - 0.01;

    if (!isFullyPaidNow) {
      delete adminNotesObj.lastBeamPaymentLink;
    }

    let hasLaundryItems = false;
    try {
      if (job.itemsJson) {
        const parsedItems = JSON.parse(job.itemsJson);
        if (Array.isArray(parsedItems)) {
          hasLaundryItems = parsedItems.some(
            (item: any) => item.category !== "PACKAGE" && !String(item.name || "").toLowerCase().includes("package")
          );
        }
      }
    } catch {}
    const autoProformaFields =
      hasLaundryItems && !job.proformaNumber
        ? {
            proformaNumber: generateProformaBaseNumber(job.id),
            proformaRevision: job.proformaRevision ?? (job.id.startsWith('RF-') ? 1 : 0),
          }
        : {};

    const didTransition = Boolean(isFullyPaidNow && !job.isShopPaid);
    const savedJob = await tx.job.update({
      where: { id: job.id },
      data: {
        isPaid: isFullyPaidNow ? true : job.isPaid,
        isShopPaid: isFullyPaidNow ? true : job.isShopPaid,
        paymentMethod: paymentMethodCode === 'card' ? 'card' : 'transfer',
        paymentChannel: channelName,
        totalAmount: effectiveTotalAmount,
        ...(isFullyPaidNow && !job.shopPaidAt ? { csoPaidAt: now, shopPaidAt: now } : {}),
        subStatus: isFullyPaidNow && job.subStatus === 'billing' ? 'wash' : job.subStatus,
        adminNotesJson: JSON.stringify(adminNotesObj),
        ...autoProformaFields,
      },
    });

    return { updated: savedJob, transitionedToShopPaid: didTransition };
  });

  try {
    await publishOrderEvent({
      type: 'job.updated',
      job: updated,
      action: 'online_payment_paid',
      changedFields: ['isPaid', 'isShopPaid', 'paymentMethod', 'paymentChannel', 'adminNotesJson'],
      actorName: 'Beam Online Payment',
    });
  } catch (err) {
    console.warn('[Online Payment] Failed to publish order event:', err);
  }

  if (transitionedToShopPaid && updated.customerId) {
    try {
      await evaluateAndIssuePromotionCouponsAction({
        jobId: updated.id,
        customerId: updated.customerId,
        actor: { name: 'System (Online Payment)' },
      });
    } catch (e) {
      console.warn('[recordOnlinePaymentSuccess] Promo evaluation failed:', e);
    }
  }

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
    const authUser = await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (!canUserAccessJob(authUser, job)) {
      return { success: false, error: 'Forbidden: You do not have access to this job' };
    }

    if (job.isPaid || job.isShopPaid) {
      return { success: false, isAlreadyPaid: true, error: 'ออเดอร์นี้ชำระเงินเรียบร้อยแล้ว' };
    }

    let jobItems: any[] = [];
    try {
      if (job.itemsJson) {
        const parsed = JSON.parse(job.itemsJson);
        if (Array.isArray(parsed)) jobItems = parsed;
      }
    } catch {}
    if (jobItems.length === 0) {
      return {
        success: false,
        error: 'กรุณาเพิ่มและบันทึกรายการผ้าก่อนสร้างลิงก์ชำระเงิน Beam (ป้องกันการคิดเฉพาะค่ารถ)',
      };
    }

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

    const alreadyPaid = existingPayments.reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);
    const jobTotal = Number(job.totalAmount) || 0;
    const remainingBalance = Math.max(0, Math.round((jobTotal - alreadyPaid) * 100) / 100);

    const amount = Number(
      alreadyPaid > 0 && remainingBalance > 0
        ? remainingBalance
        : customAmount !== undefined
          ? customAmount
          : remainingBalance || jobTotal
    );
    if (amount <= 0) {
      return { success: false, error: 'ยอดชำระต้องมากกว่า 0 บาท' };
    }

    const clearedIds: string[] = Array.isArray(adminNotesObj.clearedChargeIds) ? adminNotesObj.clearedChargeIds : [];
    const recordedIds = new Set<string>([
      ...clearedIds,
      ...existingPayments.map((p: any) => p?.chargeId).filter(Boolean),
    ]);

    const existingLink = adminNotesObj.lastBeamPaymentLink;
    if (
      existingLink?.id &&
      existingLink?.url &&
      !recordedIds.has(existingLink.id) &&
      Math.abs((existingLink.amount || 0) - amount) < 0.01
    ) {
      const linkCheck = await getBeamPaymentLink(existingLink.id);
      if (linkCheck.success && linkCheck.data) {
        if (linkCheck.data.status === 'PAID') {
          const updated = await markJobAsPaidInDb({
            job,
            paidAmount: amount,
            channelName: 'Beam Checkout (PAID)',
            chargeId: existingLink.id,
          });
          if (updated.isShopPaid) {
            return {
              success: false,
              isAlreadyPaid: true,
              error: 'ออเดอร์นี้ลูกค้าชำระเงินเรียบร้อยแล้ว',
            };
          }
        }

        if (linkCheck.data.status === 'ACTIVE') {
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

    const description = alreadyPaid > 0
      ? `TLS Order #${job.billNo || job.id} (${job.customerName || 'Customer'}) - Remaining Balance`
      : `TLS Order #${job.billNo || job.id} (${job.customerName || 'Customer'})`;
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
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(paymentUrl)}`;

    try {
      adminNotesObj.lastBeamPaymentLink = {
        id: paymentLinkId,
        url: paymentUrl,
        amount,
        createdAt: new Date().toISOString(),
      };

      const hasLaundryItems = jobItems.some(
        (item: any) => item.category !== "PACKAGE" && !String(item.name || "").toLowerCase().includes("package")
      );
      const autoProformaFields =
        hasLaundryItems && !job.proformaNumber
          ? {
              proformaNumber: generateProformaBaseNumber(job.id),
              proformaRevision: job.proformaRevision ?? (job.id.startsWith('RF-') ? 1 : 0),
            }
          : {};

      const updatedWithLink = await prisma.job.update({
        where: { id: job.id },
        data: {
          adminNotesJson: JSON.stringify(adminNotesObj),
          ...(alreadyPaid === 0 && amount > (job.totalAmount || 0) ? { totalAmount: amount } : {}),
          ...autoProformaFields,
        },
      });
      await publishOrderEvent({
        type: 'job.updated',
        job: updatedWithLink,
        action: 'payment_link_created',
        changedFields: ['adminNotesJson'],
        actorName: authUser.name || authUser.email || 'Beam Payment Link',
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
    const authUser = await assertServerActionAuthorized({ forbidRoles: ['rider'] });

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return { success: false, isPaid: false, error: 'Job not found' };
    }

    if (!canUserAccessJob(authUser, job)) {
      return { success: false, isPaid: false, error: 'Forbidden: You do not have access to this job' };
    }

    if (job.isPaid && job.isShopPaid) {
      return {
        success: true,
        isPaid: true,
        paidAmount: job.totalAmount || 0,
        paymentChannel: job.paymentChannel || 'Beam Checkout',
        paidAt: (job.shopPaidAt || job.csoPaidAt || new Date()).toISOString(),
      };
    }

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

    const clearedIds: string[] = Array.isArray(adminNotesObj.clearedChargeIds) ? adminNotesObj.clearedChargeIds : [];
    const ignoredIds = new Set<string>([
      ...clearedIds,
      ...existingPayments.map((p: any) => p?.chargeId).filter(Boolean),
    ]);

    if (adminNotesObj.lastBeamPaymentLink?.id && !ignoredIds.has(adminNotesObj.lastBeamPaymentLink.id)) {
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
          isPaid: Boolean(updated.isShopPaid),
          paidAmount,
          paymentChannel: updated.paymentChannel || 'Beam Checkout',
          paidAt: new Date().toISOString(),
        };
      }
    }

    const chargesRes = await getBeamChargesByReference(job.id);
    if (chargesRes.success && chargesRes.data && chargesRes.data.length > 0) {
      const successfulCharge = chargesRes.data.find((c: any) => {
        const isSuccess = c.status === 'SUCCEEDED' || c.status === 'SUCCESS' || c.status === 'CAPTURED';
        if (!isSuccess) return false;
        const cId = c.chargeId || c.id;
        const sId = c.sourceId;
        if (cId && ignoredIds.has(cId)) return false;
        if (sId && ignoredIds.has(sId)) return false;
        return true;
      });

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
          isPaid: Boolean(updated.isShopPaid),
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
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
  } catch (err: any) {
    return {
      success: false,
      isPaid: false,
      message: err?.message || 'Unauthorized',
    };
  }

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

export interface CreateTopUpOnlinePaymentParams {
  amount: number;
  customerId: string;
  customerName?: string;
  bonusAmount?: number;
  totalCredit?: number;
  packageName?: string;
  branchId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  priceListId?: string | null;
}

/**
 * Create a Beam Payment Link and QR Code for a Member Top-Up
 */
export async function createTopUpOnlinePaymentAction(
  params: CreateTopUpOnlinePaymentParams
): Promise<CreateOnlinePaymentResult> {
  try {
    const authUser = await assertServerActionAuthorized({
      requireWrite: true,
      forbidRoles: ['rider'],
      targetBranchId: params.branchId || null,
    });

    const amount = Number(params.amount);
    if (!amount || amount <= 0) {
      return { success: false, error: 'ยอด Top-Up ต้องมากกว่า 0 บาท' };
    }

    const referenceId = `TU-${params.customerId.slice(-4)}-${Date.now().toString(36).toUpperCase()}`;
    const description = `Top-Up (${params.packageName || 'Member Wallet'}) - ${params.customerName || params.customerId}`;

    const result = await createBeamPaymentLink({
      referenceId,
      amount,
      description,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || 'Failed to create Beam Payment Link',
      };
    }

    const paymentLinkId = result.data.id;
    const paymentUrl = result.data.url;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(paymentUrl)}`;

    const metaPayload = {
      paymentLinkId,
      paymentUrl,
      paidAmount: amount,
      bonusAmount: params.bonusAmount || 0,
      totalCredit: params.totalCredit || amount,
      packageName: params.packageName || 'TOPUP',
      branchId: params.branchId || authUser.branchId || null,
      actorId: authUser.id,
      actorName: authUser.name || authUser.email || 'Staff',
      priceListId: params.priceListId || null,
    };

    try {
      await prisma.transaction.create({
        data: {
          id: referenceId,
          memberId: params.customerId,
          amount,
          type: 'BEAM_TOPUP_PENDING',
          description: JSON.stringify(metaPayload),
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (dbErr) {
      console.error('[Beam TopUp] Failed to save pending transaction intent:', dbErr);
    }

    return {
      success: true,
      paymentLinkId,
      paymentUrl,
      qrCodeUrl,
      amount,
    };
  } catch (err: any) {
    console.error('[Beam TopUp] createTopUpOnlinePaymentAction error:', err);
    return {
      success: false,
      error: err.message || 'Failed to connect to Beam Payment Gateway',
    };
  }
}

/**
 * Check payment status of a Top-up Payment Link
 */
export async function checkTopUpPaymentStatusAction(
  paymentLinkId: string
): Promise<CheckPaymentStatusResult> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });

    const completedIntent = await prisma.transaction.findFirst({
      where: {
        type: 'BEAM_TOPUP_PENDING',
        status: 'COMPLETED',
        description: { contains: paymentLinkId },
      },
    });

    if (completedIntent) {
      return {
        success: true,
        isPaid: true,
        paidAmount: completedIntent.amount,
        paymentChannel: 'BEAM Gateway',
      };
    }

    const linkCheck = await getBeamPaymentLink(paymentLinkId);
    if (!linkCheck.success || !linkCheck.data) {
      return { success: false, isPaid: false, error: linkCheck.error };
    }

    const isPaid = linkCheck.data.status === 'PAID';
    if (!isPaid) {
      return {
        success: true,
        isPaid: false,
      };
    }

    const paidAmount = linkCheck.data.amount ? linkCheck.data.amount / 100 : undefined;

    const pendingIntent = await prisma.transaction.findFirst({
      where: {
        type: 'BEAM_TOPUP_PENDING',
        status: 'PENDING',
        description: { contains: paymentLinkId },
      },
    });

    if (pendingIntent) {
      let meta: any = {};
      try {
        meta = JSON.parse(pendingIntent.description);
      } catch {}

      const receiptNumber = `TOP-${Date.now().toString().slice(-6)}`;
      const finalPaidAmount = meta.paidAmount || paidAmount || pendingIntent.amount;
      const finalBonus = meta.bonusAmount || 0;
      const finalTotalCredit = meta.totalCredit || (finalPaidAmount + finalBonus);

      await processTopUpAction({
        receiptNumber,
        customerId: pendingIntent.memberId,
        paidAmount: finalPaidAmount,
        bonusAmount: finalBonus,
        totalCredit: finalTotalCredit,
        paymentChannel: 'BEAM Gateway',
        packageName: meta.packageName || 'TOPUP',
        actorId: meta.actorId || null,
        actorName: meta.actorName || 'Beam Poller',
        branchId: meta.branchId || null,
        priceListId: meta.priceListId || null,
        paymentLinkId,
      });

      await prisma.transaction.update({
        where: { id: pendingIntent.id },
        data: {
          status: 'COMPLETED',
          updatedAt: new Date(),
        },
      });

      try {
        invalidateDbCache();
      } catch {}
    }

    return {
      success: true,
      isPaid: true,
      paidAmount,
      paymentChannel: 'BEAM Gateway',
    };
  } catch (err: any) {
    console.error('[Beam TopUp] checkTopUpPaymentStatusAction error:', err);
    return { success: false, isPaid: false, error: err.message };
  }
}
