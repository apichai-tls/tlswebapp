'use server';

import { prisma } from '@/lib/prisma';
import { patchSettingsInCache } from '@/lib/db-cache';
import { assertServerActionAuthorized, canUserAccessJob } from '@/lib/server-auth';
import type { WiseProfile, WiseBalanceItem, WiseActivityItem } from '@/lib/wise';
import {
  testWiseApiConnectionInternal,
  fetchWiseLiveBalancesInternal,
  fetchWiseRecentTransactionsInternal,
  recordWiseJobPaymentInternal,
  checkWiseJobPaymentStatusInternal,
  syncAllPendingWiseJobsInternal,
} from '@/lib/wise-internal';

export async function testWiseApiConnectionAction(customToken?: string): Promise<{
  success: boolean;
  profiles?: WiseProfile[];
  selectedProfile?: WiseProfile;
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ requireAdmin: true });
    return await testWiseApiConnectionInternal(customToken);
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unauthorized',
    };
  }
}

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
    await assertServerActionAuthorized({ requireAdmin: true });
    return await fetchWiseLiveBalancesInternal(customToken, customProfileId);
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unauthorized',
    };
  }
}

export async function getWiseRecentTransactionsAction(limit: number = 20): Promise<{
  success: boolean;
  activities?: WiseActivityItem[];
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ requireAdmin: true });
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    return await fetchWiseRecentTransactionsInternal(safeLimit);
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unauthorized',
    };
  }
}

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
    const user = await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });
    const job = await prisma.job.findUnique({
      where: { id: params.jobId },
      select: { id: true, branchId: true, riderId: true, pickupRiderId: true, deliveryRiderId: true },
    });
    if (!job) {
      return { success: false, error: `Job ${params.jobId} not found` };
    }
    if (!canUserAccessJob(user, job)) {
      return { success: false, error: 'Forbidden: no access to this branch order.' };
    }
    return await recordWiseJobPaymentInternal(params);
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unauthorized',
    };
  }
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
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    return await checkWiseJobPaymentStatusInternal(params);
  } catch (err: any) {
    return {
      success: false,
      isPaid: false,
      error: err instanceof Error ? err.message : 'Unauthorized',
    };
  }
}

export async function syncAllPendingWiseJobsAction(): Promise<{
  success: boolean;
  paidJobs: Array<{ jobId: string; amount: number; senderName: string; job?: any }>;
}> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    return await syncAllPendingWiseJobsInternal();
  } catch {
    return { success: false, paidJobs: [] };
  }
}

export async function saveWiseApiCredentialsAction(
  token: string,
  profileId: string | number
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertServerActionAuthorized({ requireWrite: true, requireAdmin: true });
    const cleanToken = (token || '').trim();
    const cleanProfileId = String(profileId || '').trim();

    const ops: any[] = [];
    const cachePatch: Record<string, string> = {};

    if (cleanToken && !cleanToken.includes('••••')) {
      ops.push(
        prisma.setting.upsert({
          where: { key: 'wiseApiToken' },
          update: { value: cleanToken },
          create: { key: 'wiseApiToken', value: cleanToken },
        })
      );
      cachePatch.wiseApiToken = cleanToken;
    }

    if (cleanProfileId) {
      ops.push(
        prisma.setting.upsert({
          where: { key: 'wiseProfileId' },
          update: { value: cleanProfileId },
          create: { key: 'wiseProfileId', value: cleanProfileId },
        })
      );
      cachePatch.wiseProfileId = cleanProfileId;
    }

    if (ops.length > 0) {
      await prisma.$transaction(ops);
      patchSettingsInCache(cachePatch);
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save Wise credentials',
    };
  }
}
