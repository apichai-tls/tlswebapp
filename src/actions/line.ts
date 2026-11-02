"use server";

import { prisma } from "@/lib/prisma";
import { invalidateDbCache } from "@/lib/db-cache";
import { publishOrderEvent } from "@/lib/realtime-bus";
import { formatJobDisplayId } from "@/lib/utils";
import {
  getLineBotInfo,
  getLineUserProfile,
  sendLinePushMessage,
  isValidLineUserId,
  type LineBotInfo,
  type LineContactRecord,
  type LineMessageObject,
} from "@/lib/line";

const DEFAULT_LINE_ACCESS_TOKEN =
  "m37vbSx77LMvPDo1W96a25iygwrnEqsBdtzOeXM5qQoYBugNMtab0l1Xhvv7BinKNuTSFGz0dlPTZM7dWZxiYxhxASsfd0pmGvCHp0GAjTn0867M7DMdZWnM1ry+K//X7dbvrR2jEG3ec4MG4UCMAwdB04t89/1O/w1cDnyilFU=";
const DEFAULT_LINE_CHANNEL_SECRET = "b6eb43581993184cac88721953b211dd";
const DEFAULT_LINE_BASIC_ID = "@050ehvzb";
const DEFAULT_LINE_BOT_NAME = "NoName Laundry";

export interface LineOaSettings {
  enableLineOa: boolean;
  channelAccessToken: string;
  channelSecret: string;
  lineBasicId: string;
  botName: string;
  autoSendDeliveryPhoto: boolean;
}

export async function getStoredLineOaSettings(): Promise<LineOaSettings> {
  try {
    const keys = [
      "enableLineOa",
      "lineChannelAccessToken",
      "lineChannelSecret",
      "lineBasicId",
      "lineBotName",
      "lineAutoSendDeliveryPhoto",
    ];
    const rows = await prisma.setting.findMany({
      where: { key: { in: keys } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      enableLineOa: map.get("enableLineOa") !== "false",
      channelAccessToken:
        map.get("lineChannelAccessToken") ||
        process.env.LINE_CHANNEL_ACCESS_TOKEN ||
        DEFAULT_LINE_ACCESS_TOKEN,
      channelSecret:
        map.get("lineChannelSecret") ||
        process.env.LINE_CHANNEL_SECRET ||
        DEFAULT_LINE_CHANNEL_SECRET,
      lineBasicId: map.get("lineBasicId") || DEFAULT_LINE_BASIC_ID,
      botName: map.get("lineBotName") || DEFAULT_LINE_BOT_NAME,
      autoSendDeliveryPhoto: map.get("lineAutoSendDeliveryPhoto") !== "false",
    };
  } catch {
    return {
      enableLineOa: true,
      channelAccessToken:
        process.env.LINE_CHANNEL_ACCESS_TOKEN || DEFAULT_LINE_ACCESS_TOKEN,
      channelSecret:
        process.env.LINE_CHANNEL_SECRET || DEFAULT_LINE_CHANNEL_SECRET,
      lineBasicId: DEFAULT_LINE_BASIC_ID,
      botName: DEFAULT_LINE_BOT_NAME,
      autoSendDeliveryPhoto: true,
    };
  }
}

export async function testLineOaConnectionAction(customToken?: string): Promise<{
  success: boolean;
  botInfo?: LineBotInfo;
  error?: string;
}> {
  try {
    let token = (customToken || "").trim();
    if (!token) {
      const stored = await getStoredLineOaSettings();
      token = stored.channelAccessToken;
    }
    if (!token) {
      return {
        success: false,
        error: "Please enter your LINE Channel Access Token (Long-lived).",
      };
    }

    const botInfo = await getLineBotInfo(token);
    return {
      success: true,
      botInfo,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to connect to LINE Messaging API.",
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
    const token = (params.channelAccessToken || "").trim();
    let botInfo: LineBotInfo | undefined;

    if (token) {
      const testRes = await testLineOaConnectionAction(token);
      if (!testRes.success) {
        return { success: false, error: testRes.error };
      }
      botInfo = testRes.botInfo;
    }

    const entries: Array<{ key: string; value: string }> = [
      { key: "enableLineOa", value: params.enableLineOa === false ? "false" : "true" },
      { key: "lineChannelAccessToken", value: token },
      { key: "lineChannelSecret", value: (params.channelSecret || "").trim() },
      {
        key: "lineBasicId",
        value:
          (params.lineBasicId || "").trim() ||
          botInfo?.basicId ||
          botInfo?.premiumId ||
          "@thatlaundryshop",
      },
      {
        key: "lineBotName",
        value: botInfo?.displayName || "",
      },
      {
        key: "lineAutoSendDeliveryPhoto",
        value: params.autoSendDeliveryPhoto === false ? "false" : "true",
      },
    ];

    for (const item of entries) {
      await prisma.setting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: { key: item.key, value: item.value },
      });
    }

    invalidateDbCache();
    return { success: true, botInfo };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save LINE OA settings.",
    };
  }
}

export async function getLineOaContactsAction(): Promise<{
  success: boolean;
  contacts: LineContactRecord[];
  error?: string;
}> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: "lineOaContacts" },
    });
    let contacts: LineContactRecord[] = [];
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          contacts = parsed;
        }
      } catch {}
    }

    // Hydrate linked customer info from Customer table where lineId matches userId
    if (contacts.length > 0) {
      const userIds = contacts.map((c) => c.userId).filter(Boolean);
      const linkedCustomers = await prisma.customer.findMany({
        where: { lineId: { in: userIds } },
        select: { id: true, name: true, phone: true, lineId: true },
      });
      const byLineId = new Map(linkedCustomers.map((c) => [c.lineId, c]));
      contacts = contacts.map((c) => {
        const match = byLineId.get(c.userId);
        return {
          ...c,
          linkedCustomerId: match?.id || c.linkedCustomerId || null,
          linkedCustomerName: match?.name || c.linkedCustomerName || null,
          linkedCustomerPhone: match?.phone || c.linkedCustomerPhone || null,
        };
      });
    }

    return { success: true, contacts };
  } catch (err: any) {
    return {
      success: false,
      contacts: [],
      error: err instanceof Error ? err.message : "Failed to load LINE contacts",
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

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: { lineId: lineUserId },
      select: { id: true, name: true, phone: true },
    });

    // Also update lineOaContacts cache if present
    try {
      const row = await prisma.setting.findUnique({ where: { key: "lineOaContacts" } });
      if (row?.value) {
        const list: LineContactRecord[] = JSON.parse(row.value);
        if (Array.isArray(list)) {
          const next = list.map((c) =>
            c.userId === lineUserId
              ? {
                  ...c,
                  linkedCustomerId: updated.id,
                  linkedCustomerName: updated.name,
                  linkedCustomerPhone: updated.phone,
                }
              : c
          );
          await prisma.setting.upsert({
            where: { key: "lineOaContacts" },
            update: { value: JSON.stringify(next) },
            create: { key: "lineOaContacts", value: JSON.stringify(next) },
          });
        }
      }
    } catch {}

    invalidateDbCache();
    return { success: true, customerName: updated.name };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to link LINE user to customer.",
    };
  }
}

function parseJobDeliveryPhotos(job: {
  deliveryProofImageUrl?: string | null;
  proofImageUrl?: string | null;
  adminNotesJson?: string | null;
}): string[] {
  const urls: string[] = [];
  const pushParsed = (raw?: string | null) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          if (typeof u === "string" && u.trim()) urls.push(u.trim());
        }
        return;
      }
    } catch {}
    if (typeof raw === "string" && raw.trim()) {
      urls.push(raw.trim());
    }
  };

  pushParsed(job.deliveryProofImageUrl);
  if (urls.length === 0) {
    pushParsed(job.proofImageUrl);
  }
  return Array.from(new Set(urls));
}

function resolvePublicHttpsImageUrl(url: string): string | null {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  if (trimmed.startsWith("/")) {
    const base = (
      process.env.NEXT_PUBLIC_APP_URL || "https://www.thatlaundryshop.com"
    ).replace(/\/+$/, "");
    return `${base}${trimmed}`;
  }
  return null;
}

/**
 * Send Delivery Proof Photo(s) + Notification Message to Customer via LINE OA
 * Automatically marks `isDeliveryPhotoSent = true` on the Job when sent!
 */
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
    const settings = await getStoredLineOaSettings();
    if (!settings.channelAccessToken) {
      return {
        success: false,
        error:
          "LINE OA is not connected yet. Please paste your LINE Channel Access Token in Settings → Payments & Integrations.",
      };
    }

    const job = await prisma.job.findUnique({
      where: { id: params.jobId },
    });
    if (!job) {
      return { success: false, error: `Order #${params.jobId} not found.` };
    }

    // 1. Resolve Customer & LINE userId (`U...`)
    let customer = job.customerId
      ? await prisma.customer.findUnique({ where: { id: job.customerId } })
      : null;

    if (!customer && job.customerPhone) {
      customer = await prisma.customer.findFirst({
        where: { phone: job.customerPhone },
      });
    }

    let lineUserId = (params.overrideLineUserId || customer?.lineId || "").trim();

    // If customer.lineId is not a U... ID yet, check if lineOaContacts has a match by customerId or phone or displayName
    if (!isValidLineUserId(lineUserId)) {
      const contactsRes = await getLineOaContactsAction();
      const matchedContact = contactsRes.contacts.find(
        (c) =>
          (customer && c.linkedCustomerId === customer.id) ||
          (job.customerPhone &&
            c.linkedCustomerPhone &&
            c.linkedCustomerPhone.replace(/\D/g, "") === job.customerPhone.replace(/\D/g, "")) ||
          (customer?.lineId &&
            c.displayName.toLowerCase() === customer.lineId.toLowerCase().replace(/^@/, "")) ||
          (job.customerName &&
            c.displayName.toLowerCase() === job.customerName.toLowerCase())
      );
      if (matchedContact && isValidLineUserId(matchedContact.userId)) {
        lineUserId = matchedContact.userId;
        if (customer) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: { lineId: lineUserId },
          });
        }
      }
    }

    if (!isValidLineUserId(lineUserId)) {
      return {
        success: false,
        error: customer?.lineId
          ? `Customer's LINE field ("${customer.lineId}") is a display handle, not a linked LINE OA User ID (U...). Ask the customer to send any message or their phone number to your LINE OA, or select them from Recent LINE Contacts.`
          : "This customer does not have a linked LINE OA User ID yet. Ask them to message your LINE Official Account or link their LINE profile in Settings / Delivery Proof dialog.",
      };
    }

    // If overrideLineUserId was provided and valid, persist it to the customer record for future auto-sends
    if (params.overrideLineUserId && isValidLineUserId(params.overrideLineUserId) && customer && customer.lineId !== lineUserId) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { lineId: lineUserId },
      });
    }

    // 2. Collect delivery proof photo URLs
    const rawPhotos = parseJobDeliveryPhotos(job);
    const httpsPhotos = rawPhotos
      .map(resolvePublicHttpsImageUrl)
      .filter((u): u is string => Boolean(u));

    const displayId = formatJobDisplayId(job.id);
    const customerDisplayName = job.customerName || customer?.name || "Valued Customer";
    const dropoffText = job.dropoffLocation ? `\n📍 Location: ${job.dropoffLocation}` : "";

    const textMessage =
      params.customMessage?.trim() ||
      `✨ Hello ${customerDisplayName},\nYour laundry order #${displayId} has been delivered! 🧺🚚${dropoffText}\n\nThank you for choosing That Laundry Shop! 💚`;

    const messages: LineMessageObject[] = [
      {
        type: "text",
        text: textMessage,
      },
    ];

    // Attach up to 4 delivery proof photos (total max 5 messages per push)
    for (const photoUrl of httpsPhotos.slice(0, 4)) {
      messages.push({
        type: "image",
        originalContentUrl: photoUrl,
        previewImageUrl: photoUrl,
      });
    }

    const pushRes = await sendLinePushMessage(
      settings.channelAccessToken,
      lineUserId,
      messages
    );

    if (!pushRes.ok) {
      return {
        success: false,
        error: pushRes.error || "Failed to send message via LINE OA.",
      };
    }

    // 3. Mark job as `isDeliveryPhotoSent = true` inside `adminNotesJson`
    let existingMeta: Record<string, any> = {};
    if (job.adminNotesJson) {
      try {
        existingMeta = JSON.parse(job.adminNotesJson) || {};
      } catch {}
    }

    const nowIso = new Date().toISOString();
    const nextMeta = {
      ...existingMeta,
      isDeliveryPhotoSent: true,
      deliveryPhotoSentAt: nowIso,
      deliveryPhotoSentBy: params.actorName || "LINE OA Bot",
      deliveryPhotoSentChannel: "LINE OA",
      deliveryPhotoSentLineUserId: lineUserId,
    };

    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        adminNotesJson: JSON.stringify(nextMeta),
      },
    });

    await prisma.activityLog.create({
      data: {
        entityId: job.id,
        entityType: "job",
        action: "LINE_DELIVERY_PROOF_SENT",
        details: JSON.stringify({
          lineUserId,
          photoCount: httpsPhotos.length,
          sentBy: params.actorName || "LINE OA Auto",
          sentAt: nowIso,
        }),
        userName: params.actorName || "LINE OA Bot",
      },
    });

    invalidateDbCache();
    await publishOrderEvent({
      type: "job.updated",
      job: updatedJob,
      action: "update",
      changedFields: ["adminNotesJson"],
      actorName: params.actorName || "LINE OA Bot",
    }).catch(() => {});

    return {
      success: true,
      sentToUserId: lineUserId,
      photoCount: httpsPhotos.length,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unexpected error sending via LINE OA.",
    };
  }
}

/**
 * Helper triggered automatically when a rider uploads a delivery proof photo (`deliveryProofImageUrl`)
 * Checks if `autoSendDeliveryPhoto` is enabled and the customer has a linked LINE OA `userId`.
 */
export async function tryAutoSendLineDeliveryProofOnUpload(jobId: string): Promise<void> {
  try {
    const settings = await getStoredLineOaSettings();
    if (!settings.enableLineOa || !settings.autoSendDeliveryPhoto || !settings.channelAccessToken) {
      return;
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    // Avoid duplicate auto-send if already marked as sent
    if (job.adminNotesJson) {
      try {
        const meta = JSON.parse(job.adminNotesJson);
        if (meta?.isDeliveryPhotoSent) return;
      } catch {}
    }

    const photos = parseJobDeliveryPhotos(job);
    if (photos.length === 0) return;

    const res = await sendDeliveryProofViaLineAction({
      jobId,
      actorName: "LINE OA Auto-Send",
    });

    if (res.success) {
      console.log(
        `[LINE OA Auto-Send] Automatically sent ${res.photoCount} delivery proof photo(s) for Job #${jobId} to LINE user ${res.sentToUserId}`
      );
    }
  } catch (err) {
    console.warn(`[LINE OA Auto-Send] Non-fatal error for job ${jobId}:`, err);
  }
}
