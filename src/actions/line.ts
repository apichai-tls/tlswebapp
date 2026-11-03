"use server";

import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { invalidateDbCache } from "@/lib/db-cache";
import { publishOrderEvent } from "@/lib/realtime-bus";
import { formatJobDisplayId } from "@/lib/utils";
import {
  getLineBotInfo,
  getLineUserProfile,
  sendLinePushMessage,
  isValidLineUserId,
  issueLineChannelAccessTokenFromCredentials,
  fetchLineFollowerIdsPage,
  type LineBotInfo,
  type LineContactRecord,
  type LineMessageObject,
} from "@/lib/line";

// Primary Brand: ThatLaundryShop (@thatlaundryshop / @wnp4531h)
const TLS_CHANNEL_ID = "1657371072";
const TLS_CHANNEL_SECRET = "b6eb43581993184cac88721953b211dd";
const DEFAULT_LINE_BASIC_ID = "@thatlaundryshop";
const DEFAULT_LINE_BOT_NAME = "ThatLaundryShop";

// Secondary Brand: NoName Laundry (@050ehvzb, Channel 2011968333)
const NONAME_ACCESS_TOKEN =
  "m37vbSx77LMvPDo1W96a25iygwrnEqsBdtzOeXM5qQoYBugNMtab0l1Xhvv7BinKNuTSFGz0dlPTZM7dWZxiYxhxASsfd0pmGvCHp0GAjTn0867M7DMdZWnM1ry+K//X7dbvrR2jEG3ec4MG4UCMAwdB04t89/1O/w1cDnyilFU=";

export interface LineOaSettings {
  enableLineOa: boolean;
  channelAccessToken: string;
  channelSecret: string;
  lineBasicId: string;
  botName: string;
  autoSendDeliveryPhoto: boolean;
}

export async function getStoredLineOaSettings(brand?: string | null): Promise<LineOaSettings> {
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

    // If order is explicitly for NoName Laundry, use NoName Laundry token
    if (brand === "noname_laundry") {
      return {
        enableLineOa: map.get("enableLineOa") !== "false",
        channelAccessToken: NONAME_ACCESS_TOKEN,
        channelSecret: "",
        lineBasicId: "@050ehvzb",
        botName: "NoName Laundry",
        autoSendDeliveryPhoto: map.get("lineAutoSendDeliveryPhoto") !== "false",
      };
    }

    // Default / That Laundry Shop: generate or use stored token for Channel 1657371072 (@thatlaundryshop)
    let storedToken = map.get("lineChannelAccessToken") || process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    // If stored token is empty or was the NoName token, issue fresh token for ThatLaundryShop (1657371072)
    if (!storedToken || storedToken === NONAME_ACCESS_TOKEN) {
      storedToken = await issueLineChannelAccessTokenFromCredentials(
        TLS_CHANNEL_ID,
        TLS_CHANNEL_SECRET
      );
    }

    return {
      enableLineOa: map.get("enableLineOa") !== "false",
      channelAccessToken: storedToken,
      channelSecret:
        map.get("lineChannelSecret") ||
        process.env.LINE_CHANNEL_SECRET ||
        TLS_CHANNEL_SECRET,
      lineBasicId: map.get("lineBasicId") || DEFAULT_LINE_BASIC_ID,
      botName: map.get("lineBotName") || DEFAULT_LINE_BOT_NAME,
      autoSendDeliveryPhoto: map.get("lineAutoSendDeliveryPhoto") !== "false",
    };
  } catch {
    const fallbackToken = await issueLineChannelAccessTokenFromCredentials(
      TLS_CHANNEL_ID,
      TLS_CHANNEL_SECRET
    ).catch(() => "");
    return {
      enableLineOa: true,
      channelAccessToken: fallbackToken,
      channelSecret: TLS_CHANNEL_SECRET,
      lineBasicId: DEFAULT_LINE_BASIC_ID,
      botName: DEFAULT_LINE_BOT_NAME,
      autoSendDeliveryPhoto: true,
    };
  }
}

export async function testLineOaConnectionAction(customToken?: string): Promise<{
  success: boolean;
  botInfo?: LineBotInfo;
  resolvedToken?: string;
  error?: string;
}> {
  try {
    let token = (customToken || "").trim();
    if (!token || token === NONAME_ACCESS_TOKEN) {
      token = await issueLineChannelAccessTokenFromCredentials(
        TLS_CHANNEL_ID,
        TLS_CHANNEL_SECRET
      );
    }

    const botInfo = await getLineBotInfo(token);
    return {
      success: true,
      botInfo,
      resolvedToken: token,
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
    let token = (params.channelAccessToken || "").trim();
    let botInfo: LineBotInfo | undefined;

    const testRes = await testLineOaConnectionAction(token);
    if (!testRes.success) {
      return { success: false, error: testRes.error };
    }
    botInfo = testRes.botInfo;
    if (testRes.resolvedToken) {
      token = testRes.resolvedToken;
    }

    const entries: Array<{ key: string; value: string }> = [
      { key: "enableLineOa", value: params.enableLineOa === false ? "false" : "true" },
      { key: "lineChannelAccessToken", value: token },
      { key: "lineChannelSecret", value: (params.channelSecret || "").trim() || TLS_CHANNEL_SECRET },
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

function normalizeHandle(str?: string | null): string {
  if (!str) return "";
  return str.trim().toLowerCase().replace(/^@/, "");
}

/**
 * Syncs existing followers directly from `@thatlaundryshop` via LINE's Verified Followers API
 * (`GET /v2/bot/followers/ids` + `GET /v2/bot/profile/{userId}`) and automatically links them to CRM customers!
 */
export async function syncLineOaFollowersAction(maxToSync = 150): Promise<{
  success: boolean;
  syncedCount: number;
  linkedCustomerCount: number;
  contacts: LineContactRecord[];
  error?: string;
}> {
  try {
    const settings = await getStoredLineOaSettings("that_laundry_shop");
    if (!settings.channelAccessToken) {
      return {
        success: false,
        syncedCount: 0,
        linkedCustomerCount: 0,
        contacts: [],
        error: "LINE Channel Access Token is not configured.",
      };
    }

    // Load existing contacts cache
    const row = await prisma.setting.findUnique({ where: { key: "lineOaContacts" } });
    let existingContacts: LineContactRecord[] = [];
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) existingContacts = parsed;
      } catch {}
    }
    const existingById = new Map(existingContacts.map((c) => [c.userId, c]));

    // Fetch ALL follower IDs across pages from LINE API (up to 5,000 followers)
    const followerIds: string[] = [];
    let nextCursor: string | undefined = undefined;
    do {
      const page = await fetchLineFollowerIdsPage(settings.channelAccessToken, nextCursor, 1000);
      followerIds.push(...page.userIds);
      nextCursor = page.next;
    } while (nextCursor && followerIds.length < 5000);

    // Fetch profiles for followers not yet in cache (up to maxToSync per batch so each click loads the next batch!)
    const idsToFetch = followerIds
      .filter((id) => !existingById.has(id))
      .slice(0, maxToSync);

    const allCustomers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        nickName: true,
        phone: true,
        lineId: true,
      },
    });

    let linkedCustomerCount = 0;
    const nowIso = new Date().toISOString();

    // Fetch in parallel batches of 15
    const batchSize = 15;
    for (let i = 0; i < idsToFetch.length; i += batchSize) {
      const slice = idsToFetch.slice(i, i + batchSize);
      const profiles = await Promise.all(
        slice.map((uid) => getLineUserProfile(settings.channelAccessToken, uid))
      );

      for (const prof of profiles) {
        if (!prof || !prof.userId) continue;
        const normDisplay = normalizeHandle(prof.displayName);

        // Match against CRM customer by saved `lineId`, or unique `name` / `nickName`
        let matchedCust =
          allCustomers.find((c) => c.lineId === prof.userId) ||
          (normDisplay
            ? allCustomers.find(
                (c) =>
                  c.lineId &&
                  !isValidLineUserId(c.lineId) &&
                  normalizeHandle(c.lineId) === normDisplay
              )
            : undefined);

        if (!matchedCust && normDisplay) {
          const nameMatches = allCustomers.filter(
            (c) =>
              normalizeHandle(c.name) === normDisplay ||
              (c.nickName && normalizeHandle(c.nickName) === normDisplay)
          );
          if (nameMatches.length === 1) {
            matchedCust = nameMatches[0];
          }
        }

        if (matchedCust && matchedCust.lineId !== prof.userId) {
          await prisma.customer.update({
            where: { id: matchedCust.id },
            data: { lineId: prof.userId },
          });
          matchedCust.lineId = prof.userId;
          linkedCustomerCount++;
        }

        existingById.set(prof.userId, {
          userId: prof.userId,
          displayName: prof.displayName || "LINE User",
          pictureUrl: prof.pictureUrl,
          statusMessage: prof.statusMessage,
          lastInteractionAt: nowIso,
          linkedCustomerId: matchedCust?.id || null,
          linkedCustomerName: matchedCust?.name || null,
          linkedCustomerPhone: matchedCust?.phone || null,
        });
      }
    }

    const mergedContacts = Array.from(existingById.values()).slice(0, 5000);
    await prisma.setting.upsert({
      where: { key: "lineOaContacts" },
      update: { value: JSON.stringify(mergedContacts) },
      create: { key: "lineOaContacts", value: JSON.stringify(mergedContacts) },
    });

    if (linkedCustomerCount > 0) {
      invalidateDbCache();
    }

    return {
      success: true,
      syncedCount: idsToFetch.length,
      linkedCustomerCount,
      contacts: mergedContacts,
    };
  } catch (err: any) {
    return {
      success: false,
      syncedCount: 0,
      linkedCustomerCount: 0,
      contacts: [],
      error: err instanceof Error ? err.message : "Failed to sync LINE followers",
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

    // If contacts cache is empty on first load, automatically sync initial batch of followers from @thatlaundryshop!
    if (contacts.length === 0) {
      const syncRes = await syncLineOaFollowersAction(60);
      if (syncRes.success && syncRes.contacts.length > 0) {
        contacts = syncRes.contacts;
      }
    }

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

async function resolvePublicHttpsImageUrl(url: string): Promise<string | null> {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;

  // If it's a local relative path (e.g. "/uploads/job/proofs/T2026000023-1793634099947.png"),
  // upload the local file buffer to a public HTTPS image relay so LINE's servers can fetch it!
  if (trimmed.startsWith("/uploads/")) {
    try {
      const relWithoutLeadingSlash = trimmed.replace(/^\/+/, "");
      const candidatePaths = [
        path.resolve(process.cwd(), "storage", relWithoutLeadingSlash),
        path.resolve(process.cwd(), "public", relWithoutLeadingSlash),
      ];
      const existingFile = candidatePaths.find((p) => fs.existsSync(p));
      if (existingFile) {
        const buf = await fs.promises.readFile(existingFile);
        const fd = new FormData();
        fd.append("key", "6d207e02198a847aa98d0a2a901485a5");
        fd.append("action", "upload");
        fd.append("source", buf.toString("base64"));
        fd.append("format", "json");
        const upRes = await fetch("https://freeimage.host/api/1/upload", {
          method: "POST",
          body: fd,
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          if (upData?.image?.url && String(upData.image.url).startsWith("https://")) {
            return String(upData.image.url);
          }
        }
      }
    } catch (err) {
      console.warn("[LINE Photo Upload Relay] Fallback to URL:", err);
    }
  }

  // If it's a GCS URL, generate a public/signed HTTPS URL if needed
  if (trimmed.startsWith("https://storage.googleapis.com/")) {
    try {
      const { generateDownloadUrl, bucketName } = await import("@/lib/gcs");
      const prefix = `https://storage.googleapis.com/${bucketName}/`;
      if (trimmed.startsWith(prefix)) {
        const gcsKey = trimmed.slice(prefix.length);
        const signed = await generateDownloadUrl(gcsKey, 60 * 24 * 7); // 7 days
        if (signed && signed.startsWith("https://")) {
          return signed;
        }
      }
    } catch {}
    return trimmed;
  }

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
    const job = await prisma.job.findUnique({
      where: { id: params.jobId },
    });
    if (!job) {
      return { success: false, error: `Order #${params.jobId} not found.` };
    }

    let customer = job.customerId
      ? await prisma.customer.findUnique({ where: { id: job.customerId } })
      : null;

    if (!customer && job.customerPhone) {
      customer = await prisma.customer.findFirst({
        where: { phone: job.customerPhone },
      });
    }

    const brand = customer?.brand || "that_laundry_shop";
    const settings = await getStoredLineOaSettings(brand);
    if (!settings.channelAccessToken) {
      return {
        success: false,
        error: "LINE OA is not connected yet.",
      };
    }

    let jobLineIdFromNotes = "";
    if (job.adminNotesJson) {
      try {
        const parsedNotes = JSON.parse(job.adminNotesJson);
        if (parsedNotes && typeof parsedNotes.customerLineId === "string") {
          jobLineIdFromNotes = parsedNotes.customerLineId.trim();
        }
      } catch {}
    }

    let lineUserId = (
      params.overrideLineUserId ||
      (isValidLineUserId(jobLineIdFromNotes) ? jobLineIdFromNotes : "") ||
      customer?.lineId ||
      jobLineIdFromNotes ||
      ""
    ).trim();

    if (!isValidLineUserId(lineUserId)) {
      const contactsRes = await getLineOaContactsAction();
      const normSavedLineHandle = (jobLineIdFromNotes || customer?.lineId || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "");
      const normCustomerName = (customer?.name || job.customerName || "")
        .trim()
        .toLowerCase();

      const matchedContact =
        contactsRes.contacts.find(
          (c) =>
            (customer && c.linkedCustomerId === customer.id) ||
            (job.customerPhone &&
              c.linkedCustomerPhone &&
              c.linkedCustomerPhone.replace(/\D/g, "") ===
                job.customerPhone.replace(/\D/g, ""))
        ) ||
        (normSavedLineHandle
          ? contactsRes.contacts.find(
              (c) =>
                c.displayName.trim().toLowerCase().replace(/^@/, "") ===
                normSavedLineHandle
            )
          : undefined) ||
        (normCustomerName
          ? (() => {
              const byName = contactsRes.contacts.filter(
                (c) => c.displayName.trim().toLowerCase() === normCustomerName
              );
              return byName.length === 1 ? byName[0] : undefined;
            })()
          : undefined);

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
        error:
          "Could not find a linked LINE ID for this customer yet. Please select their LINE profile from the dropdown below.",
      };
    }

    if (
      params.overrideLineUserId &&
      isValidLineUserId(params.overrideLineUserId) &&
      customer &&
      customer.lineId !== lineUserId
    ) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { lineId: lineUserId },
      });
    }

    const rawPhotos = parseJobDeliveryPhotos(job);
    const resolvedPhotos = await Promise.all(
      rawPhotos.slice(0, 4).map((u) => resolvePublicHttpsImageUrl(u))
    );
    const httpsPhotos = resolvedPhotos.filter((u): u is string => Boolean(u));

    const displayId = formatJobDisplayId(job.id);
    const customerDisplayName = job.customerName || customer?.name || "Valued Customer";
    const dropoffText = job.dropoffLocation ? `\n📍 Location: ${job.dropoffLocation}` : "";
    const shopBrandLabel =
      brand === "noname_laundry" ? "NoName Laundry" : "That Laundry Shop";

    const textMessage =
      params.customMessage?.trim() ||
      `✨ Hello ${customerDisplayName},\nYour laundry order #${displayId} has been delivered! 🧺🚚${dropoffText}\n\nThank you for choosing ${shopBrandLabel}! 💚`;

    const messages: LineMessageObject[] = [
      {
        type: "text",
        text: textMessage,
      },
    ];

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

export async function tryAutoSendLineDeliveryProofOnUpload(jobId: string): Promise<void> {
  try {
    const settings = await getStoredLineOaSettings();
    if (!settings.enableLineOa || !settings.autoSendDeliveryPhoto || !settings.channelAccessToken) {
      return;
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

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
