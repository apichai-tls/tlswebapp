"use server";

import { prisma } from "@/lib/prisma";
import { patchSettingsInCache, primeCustomerCache } from "@/lib/db-cache";
import { assertServerActionAuthorized, canUserAccessJob, canAccessCustomerRecords } from "@/lib/server-auth";
import { isValidLineUserId, type LineBotInfo, type LineContactRecord } from "@/lib/line";
import {
  DEFAULT_LINE_BASIC_ID,
  DEFAULT_LINE_BOT_NAME,
  TLS_CHANNEL_SECRET,
  testLineOaConnectionInternal,
  syncLineOaFollowersInternal,
  getLineOaContactsInternal,
  updateCachedLineContactsAfterLink,
  sendDeliveryProofViaLineInternal,
} from "@/lib/line-internal";

export async function testLineOaConnectionAction(customToken?: string): Promise<{
  success: boolean;
  botInfo?: LineBotInfo;
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ requireAdmin: true });
    const res = await testLineOaConnectionInternal(customToken);
    // Never return resolvedToken to client
    return {
      success: res.success,
      botInfo: res.botInfo,
      error: res.error,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unauthorized",
    };
  }
}

export async function saveLineOaSettingsAction(params: {
  enableLineOa?: boolean;
  channelAccessToken: string;
  channelSecret?: string;
  lineBasicId?: string;
  autoSendDeliveryPhoto?: boolean;
}): Promise<{
  success: boolean;
  botInfo?: LineBotInfo;
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ requireWrite: true, requireAdmin: true });
    let token = (params.channelAccessToken || "").trim();
    if (token.includes("••••")) token = "";

    const testRes = await testLineOaConnectionInternal(token);
    if (!testRes.success) {
      return { success: false, error: testRes.error };
    }
    const botInfo = testRes.botInfo;
    if (testRes.resolvedToken) {
      token = testRes.resolvedToken;
    }

    const rawSecret = (params.channelSecret || "").trim();
    const cleanSecret = rawSecret && !rawSecret.includes("••••") ? rawSecret : "";

    const entries: Array<{ key: string; value: string }> = [
      { key: "enableLineOa", value: params.enableLineOa === false ? "false" : "true" },
      { key: "lineChannelAccessToken", value: token },
      ...(cleanSecret
        ? [{ key: "lineChannelSecret", value: cleanSecret }]
        : []),
      {
        key: "lineBasicId",
        value:
          botInfo?.premiumId
            ? `@${botInfo.premiumId.replace(/^@/, "")}`
            : (params.lineBasicId || "").trim() ||
              botInfo?.basicId ||
              DEFAULT_LINE_BASIC_ID,
      },
      {
        key: "lineBotName",
        value: botInfo?.displayName || DEFAULT_LINE_BOT_NAME,
      },
      {
        key: "lineAutoSendDeliveryPhoto",
        value: params.autoSendDeliveryPhoto === false ? "false" : "true",
      },
    ];

    if (!cleanSecret) {
      const existingSecret = await prisma.setting.findUnique({ where: { key: "lineChannelSecret" } });
      if (!existingSecret?.value) {
        entries.push({ key: "lineChannelSecret", value: TLS_CHANNEL_SECRET });
      }
    }

    await prisma.$transaction(
      entries.map((item) =>
        prisma.setting.upsert({
          where: { key: item.key },
          update: { value: item.value },
          create: { key: item.key, value: item.value },
        })
      )
    );

    const cachePatch: Record<string, string> = {};
    for (const item of entries) {
      cachePatch[item.key] = item.value;
    }
    patchSettingsInCache(cachePatch);

    return { success: true, botInfo };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save LINE OA settings.",
    };
  }
}

export async function syncLineOaFollowersAction(
  maxToSync = 400
): Promise<{
  success: boolean;
  syncedCount: number;
  linkedCustomerCount: number;
  totalFollowersCount?: number;
  remainingUnsyncedCount?: number;
  isAutoSyncing?: boolean;
  contacts: LineContactRecord[];
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ["rider"] });
    return await syncLineOaFollowersInternal(maxToSync, false);
  } catch (err: any) {
    return {
      success: false,
      syncedCount: 0,
      linkedCustomerCount: 0,
      contacts: [],
      error: err instanceof Error ? err.message : "Unauthorized",
    };
  }
}

export async function getLineOaContactsAction(): Promise<{
  success: boolean;
  contacts: LineContactRecord[];
  totalFollowersCount?: number;
  remainingUnsyncedCount?: number;
  isAutoSyncing?: boolean;
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ["rider"] });
    return await getLineOaContactsInternal();
  } catch (err: any) {
    return {
      success: false,
      contacts: [],
      error: err instanceof Error ? err.message : "Unauthorized",
    };
  }
}

export async function linkLineUserToCustomerAction(params: {
  lineUserId: string;
  customerId: string;
}): Promise<{
  success: boolean;
  customerName?: string;
  error?: string;
}> {
  try {
    const user = await assertServerActionAuthorized({
      requireWrite: true,
      forbidRoles: ["rider"],
    });
    const lineUserId = (params.lineUserId || "").trim();
    const customerId = (params.customerId || "").trim();
    if (!isValidLineUserId(lineUserId)) {
      return {
        success: false,
        error: "Invalid LINE User ID (must start with 'U' followed by 32 hex characters).",
      };
    }
    if (!customerId) {
      return { success: false, error: "Customer ID is required." };
    }

    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, branchId: true },
    });
    if (!existingCustomer) {
      return { success: false, error: "Customer not found." };
    }
    if (!canAccessCustomerRecords(user, existingCustomer.branchId)) {
      return { success: false, error: "Forbidden: no access to this customer." };
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: { lineId: lineUserId },
    });
    primeCustomerCache(updated);
    await updateCachedLineContactsAfterLink(lineUserId, {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
    });

    return { success: true, customerName: updated.name };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to link LINE user to customer.",
    };
  }
}

export async function sendDeliveryProofViaLineAction(params: {
  jobId: string;
  overrideLineUserId?: string;
  customMessage?: string;
  actorName?: string;
}): Promise<{
  success: boolean;
  sentToUserId?: string;
  photoCount?: number;
  error?: string;
}> {
  try {
    const user = await assertServerActionAuthorized({ requireWrite: true });
    const job = await prisma.job.findUnique({
      where: { id: params.jobId },
      select: { id: true, branchId: true, riderId: true, pickupRiderId: true, deliveryRiderId: true },
    });
    if (!job) {
      return { success: false, error: `Order #${params.jobId} not found.` };
    }
    if (!canUserAccessJob(user, job)) {
      return { success: false, error: "Forbidden: no access to this order." };
    }
    return await sendDeliveryProofViaLineInternal({
      ...params,
      actorName: params.actorName || user.name || "LINE OA Staff",
    });
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unauthorized",
    };
  }
}
