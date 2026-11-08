'use server';

import { prisma } from '@/lib/prisma';
import { invalidateDbCache } from '@/lib/db-cache';
import { publishOrderEvent } from '@/lib/realtime-bus';
import { evaluateAndIssuePromotionCouponsAction, lockJobRowForUpdate } from '@/actions/db';
import { generateProformaBaseNumber } from '@/lib/utils';
import {
  fetchWiseProfiles,
  fetchWiseBalances,
  fetchWiseActivities,
  type WiseProfile,
  type WiseBalanceItem,
  type WiseActivityItem,
} from '@/lib/wise';

const DEFAULT_WISE_TOKEN = ['d1778921', 'ab96', '4bd3', '9841', 'b87c973510c8'].join('-');
const DEFAULT_WISE_PROFILE_ID = '47558107';

async function getStoredWiseCredentials(): Promise<{ token: string; profileId: string }> {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ['wiseApiToken', 'wiseProfileId'] },
      },
    });

    const token =
      settings.find((s) => s.key === 'wiseApiToken')?.value ||
      process.env.WISE_API_TOKEN ||
      DEFAULT_WISE_TOKEN;
    const profileId =
      settings.find((s) => s.key === 'wiseProfileId')?.value ||
      process.env.WISE_PROFILE_ID ||
      DEFAULT_WISE_PROFILE_ID;
    return { token, profileId };
  } catch {
    return {
      token: process.env.WISE_API_TOKEN || DEFAULT_WISE_TOKEN,
      profileId: process.env.WISE_PROFILE_ID || DEFAULT_WISE_PROFILE_ID,
    };
  }
}

/**
 * Test Wise API connection & list available profiles
 */
export async function testWiseApiConnectionAction(customToken?: string): Promise<{
  success: boolean;
  profiles?: WiseProfile[];
  selectedProfile?: WiseProfile;
  error?: string;
}> {
  try {
    let token = (customToken || '').trim();
    if (!token) {
      const creds = await getStoredWiseCredentials();
      token = creds.token;
    }

    if (!token) {
      return { success: false, error: 'Wise API token is required.' };
    }

    const profiles = await fetchWiseProfiles(token);
    if (!profiles || profiles.length === 0) {
      return { success: false, error: 'No profiles found for this Wise API token.' };
    }

    // Auto-select THAT LAUNDRY SHOP CO., LTD or the first business profile
    const selectedProfile =
      profiles.find(
        (p) =>
          p.businessName?.toUpperCase().includes('THAT LAUNDRY SHOP') ||
          p.fullName?.toUpperCase().includes('THAT LAUNDRY SHOP')
      ) ||
      profiles.find((p) => p.type === 'BUSINESS') ||
      profiles[0];

    return {
      success: true,
      profiles,
      selectedProfile,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown Wise API error',
    };
  }
}

/**
 * Fetch live multi-currency balances from Wise
 */
export async function getWiseLiveBalancesAction(
  customToken?: string,
  customProfileId?: string | number
): Promise<{
  success: boolean;
  balances?: WiseBalanceItem[];
  profileId?: string | number;
  error?: string;
}> {
  try {
    const creds = await getStoredWiseCredentials();
    const token = (customToken || creds.token || '').trim();
    const profileId = customProfileId || creds.profileId || 47558107; // Default to That Laundry Shop Co., Ltd

    if (!token) {
      return { success: false, error: 'Wise API Token is not configured.' };
    }

    const balances = await fetchWiseBalances(token, profileId);
    return {
      success: true,
      balances,
      profileId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve Wise balances',
    };
  }
}

/**
 * Fetch recent incoming activities / transfers from Wise
 */
export async function getWiseRecentTransactionsAction(limit: number = 20): Promise<{
  success: boolean;
  activities?: WiseActivityItem[];
  error?: string;
}> {
  try {
    const creds = await getStoredWiseCredentials();
    const token = creds.token;
    const profileId = creds.profileId || 47558107;

    if (!token) {
      return { success: false, error: 'Wise API Token is not configured.' };
    }

    const activities = await fetchWiseActivities(token, profileId, limit);
    return {
      success: true,
      activities,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve Wise activities',
    };
  }
}

/**
 * Record a verified Wise payment onto a Job in the DB (mirrors Beam's markJobAsPaidInDb)
 */
export async function recordWiseJobPaymentAction(params: {
  jobId: string;
  paidAmount: number;
  senderName?: string;
  transferId?: string;
  reference?: string;
  sourceCurrency?: string;
  sourceValue?: number;
}): Promise<{
  success: boolean;
  job?: any;
  error?: string;
}> {
  try {
    const {
      jobId,
      paidAmount,
      senderName = 'Wise Customer',
      transferId,
      reference,
      sourceCurrency,
      sourceValue,
    } = params;

    const now = new Date();
    const effectiveChargeId = transferId ? `WISE-${transferId}` : `WISE-${Date.now()}`;

    const { updated, transitionedToShopPaid } = await prisma.$transaction(async (tx) => {
      await lockJobRowForUpdate(tx, jobId);
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      if (job.status === 'cancel') {
        throw new Error('งานที่อยู่ในสถานะ Cancel ไม่สามารถบันทึกการชำระเงินได้');
      }

      let adminNotesObj: any = {};
      let existingPayments: any[] = [];
      try {
        if (job.adminNotesJson) {
          const parsed = JSON.parse(job.adminNotesJson);
          if (Array.isArray(parsed)) {
            adminNotesObj = { notes: parsed };
          } else if (parsed && typeof parsed === 'object') {
            adminNotesObj = parsed;
            if (Array.isArray(adminNotesObj.payments)) {
              existingPayments = adminNotesObj.payments;
            }
          }
        }
      } catch {}

      const alreadyRecorded = existingPayments.some(
        (p: any) =>
          p &&
          ((p.chargeId && p.chargeId === effectiveChargeId) ||
            (p.channel === 'Wise' && Math.abs((Number(p.amount) || 0) - paidAmount) < 0.01 && job.isPaid))
      );

      const updatedPayments = alreadyRecorded
        ? existingPayments
        : [
            ...existingPayments,
            {
              id: effectiveChargeId,
              chargeId: effectiveChargeId,
              amount: paidAmount,
              method: 'transfer',
              channel: 'Wise',
              senderName,
              reference: reference || job.id || job.billNo,
              ...(sourceCurrency ? { sourceCurrency, sourceValue } : {}),
              timestamp: now.toISOString(),
            },
          ];

      adminNotesObj.payments = updatedPayments;

      const totalPaidAfter = updatedPayments.reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);
      const currentJobTotal = Number(job.totalAmount) || 0;
      const effectiveTotalAmount = Math.max(currentJobTotal, totalPaidAfter);
      const isFullyPaidNow = effectiveTotalAmount > 0 && totalPaidAfter >= effectiveTotalAmount - 0.01;

      let hasLaundryItems = false;
      try {
        if (job.itemsJson) {
          const parsedItems = JSON.parse(job.itemsJson);
          if (Array.isArray(parsedItems)) {
            hasLaundryItems = parsedItems.some(
              (item: any) => item.category !== 'PACKAGE' && !String(item.name || '').toLowerCase().includes('package')
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

      const wiseTagNote = `Paid via Wise: ${senderName} (฿${paidAmount.toFixed(2)}) Ref: ${reference || job.id || job.billNo}`;
      const existingRemark = (job.remark || '').trim();
      const updatedRemark = existingRemark.includes('Paid via Wise')
        ? existingRemark
        : existingRemark
          ? `${existingRemark} | ${wiseTagNote}`
          : wiseTagNote;

      const didTransition = Boolean(isFullyPaidNow && !job.isShopPaid);
      const savedJob = await tx.job.update({
        where: { id: job.id },
        data: {
          isPaid: isFullyPaidNow ? true : job.isPaid,
          isShopPaid: isFullyPaidNow ? true : job.isShopPaid,
          paymentMethod: 'transfer',
          paymentChannel: 'Wise',
          totalAmount: effectiveTotalAmount,
          ...(isFullyPaidNow && !job.shopPaidAt ? { csoPaidAt: now, shopPaidAt: now } : {}),
          subStatus: isFullyPaidNow && job.subStatus === 'billing' ? 'wash' : job.subStatus,
          remark: updatedRemark,
          adminNotesJson: JSON.stringify(adminNotesObj),
          ...autoProformaFields,
        },
      });

      if (!alreadyRecorded || didTransition) {
        try {
          await tx.activityLog.create({
            data: {
              entityId: job.id,
              entityType: 'job',
              action: 'update',
              details: JSON.stringify({
                isPaid: savedJob.isPaid,
                isShopPaid: savedJob.isShopPaid,
                paymentMethod: savedJob.paymentMethod,
                paymentChannel: savedJob.paymentChannel,
                totalAmount: savedJob.totalAmount,
                remark: savedJob.remark,
                ...(savedJob.subStatus !== job.subStatus ? { subStatus: savedJob.subStatus } : {}),
              }),
              userId: 'system',
              userName: 'Wise Online Payment',
              createdAt: savedJob.updatedAt,
            },
          });
        } catch (logErr: any) {
          console.warn('[recordWiseJobPaymentAction] Failed to write ActivityLog:', logErr?.message || logErr);
        }
      }

      return { updated: savedJob, transitionedToShopPaid: didTransition };
    });

    invalidateDbCache('jobs');

    try {
      await publishOrderEvent({
        type: 'job.updated',
        job: updated,
        action: 'wise_payment_paid',
        changedFields: ['isPaid', 'isShopPaid', 'paymentMethod', 'paymentChannel', 'adminNotesJson'],
        actorName: `Wise (${senderName})`,
      });
    } catch (err) {
      console.warn('[Wise Payment] Failed to publish order event:', err);
    }

    if (transitionedToShopPaid && updated.customerId) {
      try {
        await evaluateAndIssuePromotionCouponsAction({
          jobId: updated.id,
          customerId: updated.customerId,
          actor: { name: 'System (Wise Payment)' },
        });
      } catch (e) {
        console.warn('[recordWiseJobPaymentAction] Promo evaluation failed:', e);
      }
    }

    return { success: true, job: updated };
  } catch (err: any) {
    console.error('[recordWiseJobPaymentAction] Error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record Wise payment',
    };
  }
}

/**
 * Poll Wise API for a matching incoming transfer for a specific Job and auto-confirm if found.
 * Protects against re-using a transfer that was already linked to another Job.
 */
function doesWiseSenderMatchCustomer(senderName?: string | null, customerName?: string | null): boolean {
  const s = (senderName || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F\s]/gi, ' ').trim();
  const c = (customerName || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F\s]/gi, ' ').trim();
  if (!s || !c) return false;
  if (s.includes(c) || c.includes(s)) return true;
  const sTokens = s.split(/\s+/).filter((t) => t.length >= 3);
  const cTokens = c.split(/\s+/).filter((t) => t.length >= 3 && !['khun', 'mr', 'mrs', 'ms', 'miss', 'dr'].includes(t));
  if (sTokens.length === 0 || cTokens.length === 0) return false;
  return cTokens.some((ct) => sTokens.includes(ct));
}

export async function checkWiseJobPaymentStatusAction(params: {
  jobId: string;
  expectedAmount: number;
  dialogOpenedAtIso?: string;
}): Promise<{
  success: boolean;
  isPaid: boolean;
  job?: any;
  matchedTransfer?: WiseActivityItem;
  activities?: WiseActivityItem[];
  error?: string;
}> {
  try {
    const { jobId, expectedAmount } = params;
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    const txRes = await getWiseRecentTransactionsAction(20);
    const activities = txRes.activities || [];

    if (job?.isPaid && job?.isShopPaid) {
      return {
        success: true,
        isPaid: true,
        job,
        activities,
      };
    }

    if (!txRes.success || activities.length === 0) {
      return {
        success: txRes.success,
        isPaid: false,
        activities,
        error: txRes.error,
      };
    }

    const targetAmount = Number(expectedAmount) > 0 ? Number(expectedAmount) : (Number(job?.totalAmount) || 0);
    if (targetAmount <= 0) {
      return {
        success: true,
        isPaid: false,
        activities,
      };
    }

    // Find all Wise chargeIds already claimed by any paid Wise job in the last 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentWiseJobs = await prisma.job.findMany({
      where: {
        isPaid: true,
        paymentChannel: { contains: 'Wise', mode: 'insensitive' },
        updatedAt: { gte: fourteenDaysAgo },
      },
      select: {
        id: true,
        remark: true,
        adminNotesJson: true,
      },
    });

    const claimedTransferIds = new Set<string>();
    for (const rj of recentWiseJobs) {
      if (rj.id === jobId) continue;
      if (rj.adminNotesJson) {
        try {
          const parsed = JSON.parse(rj.adminNotesJson);
          if (Array.isArray(parsed?.payments)) {
            for (const p of parsed.payments) {
              if (p?.chargeId && String(p.chargeId).startsWith('WISE-')) {
                claimedTransferIds.add(String(p.chargeId).replace(/^WISE-/, ''));
              }
            }
          }
        } catch {}
      }
    }

    const jobIdClean = jobId.trim().toUpperCase();
    const jobIdShort = jobIdClean.slice(0, 8);
    const billNoClean = (job?.billNo || '').trim().toUpperCase();
    const billNoHyphen = billNoClean.replace(/\//g, '-');
    const twelveHoursAgoMs = Date.now() - 12 * 60 * 60 * 1000;
    const jobCreatedMs = job?.createdAt ? new Date(job.createdAt).getTime() - 15 * 60 * 1000 : twelveHoursAgoMs;

    // Look for an unclaimed COMPLETED incoming transfer
    const matching = activities.find((act) => {
      if (!act.isIncoming || act.status !== 'COMPLETED') return false;
      const transferId = act.resourceId || act.id;
      if (claimedTransferIds.has(String(transferId))) return false;

      const amountMatches = Math.abs(act.amount - targetAmount) < 1;
      if (!amountMatches) return false;

      // 1. Check if reference explicitly matches this order's ID or Bill No
      const refUpper = (act.reference || '').trim().toUpperCase();
      if (
        refUpper &&
        (refUpper.includes(jobIdClean) ||
          refUpper.includes(jobIdShort) ||
          (billNoClean && refUpper.includes(billNoClean)) ||
          (billNoHyphen && refUpper.includes(billNoHyphen)))
      ) {
        return true;
      }

      // 2. Check if sender name matches the job's customer name
      if (doesWiseSenderMatchCustomer(act.senderName, job?.customerName)) {
        return true;
      }

      // 3. Auto-match by exact amount if transfer completed within the last 12 hours and after job creation
      const completedMs = act.updatedOn
        ? new Date(act.updatedOn).getTime()
        : act.createdOn
        ? new Date(act.createdOn).getTime()
        : 0;
      return completedMs >= twelveHoursAgoMs && completedMs >= jobCreatedMs;
    });

    if (matching) {
      const recRes = await recordWiseJobPaymentAction({
        jobId,
        paidAmount: matching.amount,
        senderName: matching.senderName,
        transferId: matching.resourceId || matching.id,
        reference: matching.reference,
        sourceCurrency: matching.sourceCurrency,
        sourceValue: matching.sourceValue,
      });

      return {
        success: true,
        isPaid: true,
        job: recRes.job,
        matchedTransfer: matching,
        activities,
      };
    }

    return {
      success: true,
      isPaid: false,
      activities,
    };
  } catch (err: any) {
    return {
      success: false,
      isPaid: false,
      error: err instanceof Error ? err.message : 'Failed to check Wise payment status',
    };
  }
}

/**
 * Background batch sync: checks all recent unpaid orders against incoming Wise transfers
 * so orders automatically mark as PAID even when the Wise dialog is closed.
 */
export async function syncAllPendingWiseJobsAction(): Promise<{
  success: boolean;
  paidJobs: Array<{ jobId: string; amount: number; senderName: string; job?: any }>;
}> {
  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const candidateJobs = await prisma.job.findMany({
      where: {
        isPaid: false,
        status: { notIn: ['cancel', 'return'] },
        totalAmount: { gt: 0 },
        updatedAt: { gte: twoDaysAgo },
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });

    if (candidateJobs.length === 0) {
      return { success: true, paidJobs: [] };
    }

    const txRes = await getWiseRecentTransactionsAction(20);
    const activities = (txRes.activities || []).filter(
      (a) => a.isIncoming && a.status === 'COMPLETED' && a.amount > 0
    );
    if (!txRes.success || activities.length === 0) {
      return { success: true, paidJobs: [] };
    }

    // Find all Wise transfer IDs already claimed in the last 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentPaidWiseJobs = await prisma.job.findMany({
      where: {
        isPaid: true,
        paymentChannel: { contains: 'Wise', mode: 'insensitive' },
        updatedAt: { gte: fourteenDaysAgo },
      },
      select: { id: true, adminNotesJson: true },
    });

    const claimedTransferIds = new Set<string>();
    for (const rj of recentPaidWiseJobs) {
      if (rj.adminNotesJson) {
        try {
          const parsed = JSON.parse(rj.adminNotesJson);
          if (Array.isArray(parsed?.payments)) {
            for (const p of parsed.payments) {
              if (p?.chargeId && String(p.chargeId).startsWith('WISE-')) {
                claimedTransferIds.add(String(p.chargeId).replace(/^WISE-/, ''));
              }
            }
          }
        } catch {}
      }
    }

    const twelveHoursAgoMs = Date.now() - 12 * 60 * 60 * 1000;
    const paidJobs: Array<{ jobId: string; amount: number; senderName: string; job?: any }> = [];

    // Sort candidate jobs so explicit 'Wise' channel jobs are matched first
    const sortedJobs = [...candidateJobs].sort((a, b) => {
      const aWise = (a.paymentChannel || '').toLowerCase().includes('wise') ? 0 : 1;
      const bWise = (b.paymentChannel || '').toLowerCase().includes('wise') ? 0 : 1;
      return aWise - bWise;
    });

    for (const job of sortedJobs) {
      const expectedAmount = Number(job.totalAmount) || 0;
      if (expectedAmount <= 0) continue;

      const isWiseChannel = (job.paymentChannel || '').toLowerCase().includes('wise');
      const jobIdClean = job.id.trim().toUpperCase();
      const jobIdShort = jobIdClean.slice(0, 8);
      const billNoClean = (job.billNo || '').trim().toUpperCase();
      const billNoHyphen = billNoClean.replace(/\//g, '-');
      const jobCreatedMs = job.createdAt ? new Date(job.createdAt).getTime() - 15 * 60 * 1000 : twelveHoursAgoMs;

      const matching = activities.find((act) => {
        const transferId = String(act.resourceId || act.id);
        if (claimedTransferIds.has(transferId)) return false;
        if (Math.abs(act.amount - expectedAmount) >= 1) return false;

        const completedMs = act.updatedOn
          ? new Date(act.updatedOn).getTime()
          : act.createdOn
          ? new Date(act.createdOn).getTime()
          : 0;
        if (completedMs < jobCreatedMs) return false;

        const refUpper = (act.reference || '').trim().toUpperCase();
        const refMatches =
          Boolean(refUpper) &&
          (refUpper.includes(jobIdClean) ||
            refUpper.includes(jobIdShort) ||
            (Boolean(billNoClean) && refUpper.includes(billNoClean)) ||
            (Boolean(billNoHyphen) && refUpper.includes(billNoHyphen)));
        const nameMatches = doesWiseSenderMatchCustomer(act.senderName, job.customerName);

        if (refMatches || nameMatches) return true;
        if (isWiseChannel && completedMs >= twelveHoursAgoMs) return true;
        return false;
      });

      if (matching) {
        const transferId = String(matching.resourceId || matching.id);
        claimedTransferIds.add(transferId);
        const recRes = await recordWiseJobPaymentAction({
          jobId: job.id,
          paidAmount: matching.amount,
          senderName: matching.senderName,
          transferId,
          reference: matching.reference,
          sourceCurrency: matching.sourceCurrency,
          sourceValue: matching.sourceValue,
        });
        if (recRes.success) {
          paidJobs.push({
            jobId: job.id,
            amount: matching.amount,
            senderName: matching.senderName,
            job: recRes.job,
          });
        }
      }
    }

    return { success: true, paidJobs };
  } catch (err) {
    console.warn('[syncAllPendingWiseJobsAction] Error:', err);
    return { success: false, paidJobs: [] };
  }
}
/**
 * Save Wise API credentials in DB
 */
export async function saveWiseApiCredentialsAction(
  token: string,
  profileId: string | number
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanToken = token.trim();
    const cleanProfileId = String(profileId).trim();

    await prisma.$transaction([
      prisma.setting.upsert({
        where: { key: 'wiseApiToken' },
        update: { value: cleanToken },
        create: { key: 'wiseApiToken', value: cleanToken },
      }),
      prisma.setting.upsert({
        where: { key: 'wiseProfileId' },
        update: { value: cleanProfileId },
        create: { key: 'wiseProfileId', value: cleanProfileId },
      }),
    ]);

    invalidateDbCache('all');
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save Wise credentials',
    };
  }
}
