import { prisma } from "@/lib/prisma";
import { invalidateDbCache, primeCustomerCache } from "@/lib/db-cache";
import { publishOrderEvent } from "@/lib/realtime-bus";
import { formatJobDisplayId, isValidPhoneNumber } from "@/lib/utils";
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
import {
  resolvePublicHttpsMediaUrl,
  recordOutboundSocialMessageFromSystemInternal,
} from "@/lib/social-inbox-internal";

// Primary Brand: ThatLaundryShop (@thatlaundryshop / @wnp4531h)
export const TLS_CHANNEL_ID = "1657371072";
export const TLS_CHANNEL_SECRET = "b6eb43581993184cac88721953b211dd";
export const DEFAULT_LINE_BASIC_ID = "@thatlaundryshop";
export const DEFAULT_LINE_BOT_NAME = "ThatLaundryShop";

// Secondary Brand: NoName Laundry (@050ehvzb, Channel 2011968333)
export const NONAME_ACCESS_TOKEN =
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

    if (brand === "noname_laundry") {
      return {
        enableLineOa: map.get("enableLineOa") !== "false",
        channelAccessToken: process.env.NONAME_LINE_ACCESS_TOKEN || NONAME_ACCESS_TOKEN,
        channelSecret: process.env.NONAME_LINE_CHANNEL_SECRET || "",
        lineBasicId: "@050ehvzb",
        botName: "NoName Laundry",
        autoSendDeliveryPhoto: map.get("lineAutoSendDeliveryPhoto") !== "false",
      };
    }

    const rawStoredToken = map.get("lineChannelAccessToken") || "";
    const cleanStoredToken = rawStoredToken && !rawStoredToken.includes("••••") ? rawStoredToken : "";
    let storedToken = cleanStoredToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
    if (!storedToken || storedToken === NONAME_ACCESS_TOKEN) {
      storedToken = await issueLineChannelAccessTokenFromCredentials(
        TLS_CHANNEL_ID,
        TLS_CHANNEL_SECRET
      );
    }

    const rawSecret = map.get("lineChannelSecret") || "";
    const cleanSecret = rawSecret && !rawSecret.includes("••••") ? rawSecret : "";

    return {
      enableLineOa: map.get("enableLineOa") !== "false",
      channelAccessToken: storedToken,
      channelSecret:
        cleanSecret ||
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

export async function testLineOaConnectionInternal(customToken?: string): Promise<{
  success: boolean;
  botInfo?: LineBotInfo;
  resolvedToken?: string;
  error?: string;
}> {
  try {
    let token = customToken && !customToken.includes("••••") ? customToken.trim() : "";
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

function normalizeHandle(str?: string | null): string {
  if (!str) return "";
  const cleaned = str.trim().toLowerCase().replace(/^@+/, "").trim();
  if (
    !cleaned ||
    cleaned.length < 2 ||
    cleaned === "-" ||
    cleaned === "--" ||
    cleaned === "n/a" ||
    cleaned === "na" ||
    cleaned === "none" ||
    cleaned === "null" ||
    cleaned === "undefined" ||
    cleaned === "line user" ||
    !/[a-z0-9\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/i.test(cleaned)
  ) {
    return "";
  }
  return cleaned;
}

function normalizeValidPhoneDigits(phone?: string | null): string {
  if (!isValidPhoneNumber(phone)) return "";
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 8 || /^0+$/.test(digits)) return "";
  if (digits.startsWith("66") && digits.length >= 10) {
    return "0" + digits.slice(2);
  }
  return digits;
}

let isBackgroundFollowerSyncRunning = false;
let lastFollowerListCheckAt = 0;
let cachedTotalFollowerCount = 0;
let cachedRemainingUnsyncedCount = 0;
let cachedEnrichedContacts: LineContactRecord[] | null = null;
let cachedEnrichedContactsAt = 0;

export function invalidateLineContactsCache(): void {
  cachedEnrichedContacts = null;
  cachedEnrichedContactsAt = 0;
}

function ensureBackgroundLineFollowerSyncLoop(): void {
  if (isBackgroundFollowerSyncRunning) return;
  isBackgroundFollowerSyncRunning = true;
  (async () => {
    try {
      let safetyIterations = 0;
      while (safetyIterations < 40) {
        safetyIterations++;
        const res = await syncLineOaFollowersInternal(500, true);
        if (!res.success || (res.remainingUnsyncedCount ?? 0) <= 0 || res.syncedCount === 0) {
          break;
        }
        await new Promise((r) => setTimeout(r, 80));
      }
    } catch (err) {
      console.warn("[LINE OA Auto-Sync] Background loop error:", err);
    } finally {
      isBackgroundFollowerSyncRunning = false;
    }
  })();
}

export async function syncLineOaFollowersInternal(
  maxToSync = 400,
  isInternalBackgroundCall = false
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

    const row = await prisma.setting.findUnique({ where: { key: "lineOaContacts" } });
    let existingContacts: LineContactRecord[] = [];
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) existingContacts = parsed;
      } catch {}
    }
    const existingById = new Map(existingContacts.map((c) => [c.userId, c]));

    const followerIds: string[] = [];
    let nextCursor: string | undefined = undefined;
    do {
      const page = await fetchLineFollowerIdsPage(settings.channelAccessToken, nextCursor, 1000);
      followerIds.push(...page.userIds);
      nextCursor = page.next;
    } while (nextCursor && followerIds.length < 20000);

    lastFollowerListCheckAt = Date.now();
    cachedTotalFollowerCount = Math.max(followerIds.length, existingById.size);

    const allUnsyncedIds = followerIds.filter((id) => !existingById.has(id));
    const safeMax = Math.max(1, Math.min(1000, Number(maxToSync) || 400));
    const idsToFetch = allUnsyncedIds.slice(0, safeMax);
    const remainingAfterBatch = Math.max(0, allUnsyncedIds.length - idsToFetch.length);
    cachedRemainingUnsyncedCount = remainingAfterBatch;

    if (idsToFetch.length === 0) {
      cachedEnrichedContacts = existingContacts;
      cachedEnrichedContactsAt = Date.now();
      return {
        success: true,
        syncedCount: 0,
        linkedCustomerCount: 0,
        totalFollowersCount: cachedTotalFollowerCount,
        remainingUnsyncedCount: 0,
        isAutoSyncing: false,
        contacts: existingContacts,
      };
    }

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

    const batchSize = 60;
    for (let i = 0; i < idsToFetch.length; i += batchSize) {
      const slice = idsToFetch.slice(i, i + batchSize);
      const profiles = await Promise.all(
        slice.map((uid) => getLineUserProfile(settings.channelAccessToken, uid))
      );

      for (const prof of profiles) {
        if (!prof || !prof.userId) continue;
        const normDisplay = normalizeHandle(prof.displayName);

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
          } else if (
            nameMatches.length > 1 &&
            new Set(nameMatches.map((c) => normalizeHandle(c.name)).filter(Boolean)).size === 1
          ) {
            matchedCust = nameMatches[0];
          }
        }

        if (matchedCust && matchedCust.lineId !== prof.userId) {
          prisma.customer
            .update({
              where: { id: matchedCust.id },
              data: { lineId: prof.userId },
            })
            .then((c) => primeCustomerCache(c))
            .catch(() => {});
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
          linkedCustomerPhone: isValidPhoneNumber(matchedCust?.phone) ? matchedCust!.phone : null,
        });
      }
    }

    const mergedContacts = Array.from(existingById.values()).slice(0, 20000);
    if (idsToFetch.length > 0 || linkedCustomerCount > 0) {
      await prisma.setting.upsert({
        where: { key: "lineOaContacts" },
        update: { value: JSON.stringify(mergedContacts) },
        create: { key: "lineOaContacts", value: JSON.stringify(mergedContacts) },
      });
      cachedEnrichedContacts = mergedContacts;
      cachedEnrichedContactsAt = Date.now();
    }

    if (!isInternalBackgroundCall && remainingAfterBatch > 0) {
      ensureBackgroundLineFollowerSyncLoop();
    }

    return {
      success: true,
      syncedCount: idsToFetch.length,
      linkedCustomerCount,
      totalFollowersCount: cachedTotalFollowerCount,
      remainingUnsyncedCount: remainingAfterBatch,
      isAutoSyncing: remainingAfterBatch > 0 || isBackgroundFollowerSyncRunning,
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

export async function getLineOaContactsInternal(): Promise<{
  success: boolean;
  contacts: LineContactRecord[];
  totalFollowersCount?: number;
  remainingUnsyncedCount?: number;
  isAutoSyncing?: boolean;
  error?: string;
}> {
  try {
    if (
      cachedEnrichedContacts &&
      cachedEnrichedContacts.length > 0 &&
      !isBackgroundFollowerSyncRunning &&
      cachedRemainingUnsyncedCount === 0 &&
      Date.now() - cachedEnrichedContactsAt < 5 * 60 * 1000
    ) {
      return {
        success: true,
        contacts: cachedEnrichedContacts,
        totalFollowersCount: Math.max(cachedTotalFollowerCount, cachedEnrichedContacts.length),
        remainingUnsyncedCount: 0,
        isAutoSyncing: false,
      };
    }

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

    if (contacts.length === 0) {
      const syncRes = await syncLineOaFollowersInternal(300);
      if (syncRes.success && syncRes.contacts.length > 0) {
        contacts = syncRes.contacts;
      }
    } else if (
      cachedRemainingUnsyncedCount > 0 ||
      (lastFollowerListCheckAt > 0 && Date.now() - lastFollowerListCheckAt > 6 * 60 * 60 * 1000)
    ) {
      ensureBackgroundLineFollowerSyncLoop();
    }

    if (contacts.length > 0) {
      const userIds = contacts.map((c) => c.userId).filter(Boolean);
      const linkedCustomers = await prisma.customer.findMany({
        where: { lineId: { in: userIds } },
        select: { id: true, name: true, phone: true, lineId: true },
      });
      const byLineId = new Map<string, (typeof linkedCustomers)[number]>();
      const lineIdCounts = new Map<string, Set<string>>();
      for (const lc of linkedCustomers) {
        if (!lc.lineId) continue;
        const normName = normalizeHandle(lc.name);
        if (!lineIdCounts.has(lc.lineId)) lineIdCounts.set(lc.lineId, new Set());
        if (normName) lineIdCounts.get(lc.lineId)!.add(normName);
        if (!byLineId.has(lc.lineId)) {
          byLineId.set(lc.lineId, lc);
        }
      }
      contacts = contacts.map((c) => {
        const uniqueNamesCount = lineIdCounts.get(c.userId)?.size ?? 0;
        const match = uniqueNamesCount <= 1 ? byLineId.get(c.userId) : undefined;
        const candidatePhone = match?.phone || c.linkedCustomerPhone || null;
        return {
          ...c,
          linkedCustomerId: match?.id || c.linkedCustomerId || null,
          linkedCustomerName: match?.name || c.linkedCustomerName || null,
          linkedCustomerPhone: isValidPhoneNumber(candidatePhone) ? candidatePhone : null,
        };
      });
    }

    cachedEnrichedContacts = contacts;
    cachedEnrichedContactsAt = Date.now();

    return {
      success: true,
      contacts,
      totalFollowersCount: Math.max(cachedTotalFollowerCount, contacts.length),
      remainingUnsyncedCount: cachedRemainingUnsyncedCount,
      isAutoSyncing: isBackgroundFollowerSyncRunning || cachedRemainingUnsyncedCount > 0,
    };
  } catch (err: any) {
    return {
      success: false,
      contacts: [],
      error: err instanceof Error ? err.message : "Failed to load LINE contacts",
    };
  }
}

export async function updateCachedLineContactsAfterLink(
  lineUserId: string,
  updatedCustomer: { id: string; name: string; phone: string | null }
): Promise<void> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "lineOaContacts" } });
    if (row?.value) {
      const list: LineContactRecord[] = JSON.parse(row.value);
      if (Array.isArray(list)) {
        const next = list.map((c) =>
          c.userId === lineUserId
            ? {
                ...c,
                linkedCustomerId: updatedCustomer.id,
                linkedCustomerName: updatedCustomer.name,
                linkedCustomerPhone: isValidPhoneNumber(updatedCustomer.phone)
                  ? updatedCustomer.phone
                  : null,
              }
            : c
        );
        await prisma.setting.upsert({
          where: { key: "lineOaContacts" },
          update: { value: JSON.stringify(next) },
          create: { key: "lineOaContacts", value: JSON.stringify(next) },
        });
        cachedEnrichedContacts = next;
        cachedEnrichedContactsAt = Date.now();
      }
    }
  } catch {}
}

function isBillOrInternalPhotoUrl(url: string, billImageUrlRaw?: string | null): boolean {
  const lower = (url || "").trim().toLowerCase();
  if (!lower) return true;
  if (
    lower.includes("/bills/") ||
    lower.includes("/bills-") ||
    lower.includes("subtype=bills") ||
    lower.includes("proforma-") ||
    lower.includes("receipt-")
  ) {
    return true;
  }
  if (billImageUrlRaw) {
    try {
      const parsed = JSON.parse(billImageUrlRaw);
      const billList = Array.isArray(parsed) ? parsed : [parsed];
      if (billList.some((b) => typeof b === "string" && b.trim() === url.trim())) {
        return true;
      }
    } catch {
      if (billImageUrlRaw.trim() === url.trim()) return true;
    }
  }
  return false;
}

export function parseJobDeliveryPhotos(job: {
  deliveryProofImageUrl?: string | null;
  proofImageUrl?: string | null;
  billImageUrl?: string | null;
  adminNotesJson?: string | null;
}): string[] {
  const urls: string[] = [];
  const pushParsed = (raw?: string | null) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          if (typeof u === "string" && u.trim() && !isBillOrInternalPhotoUrl(u.trim(), job.billImageUrl)) {
            urls.push(u.trim());
          }
        }
        return;
      }
    } catch {}
    if (typeof raw === "string" && raw.trim() && !isBillOrInternalPhotoUrl(raw.trim(), job.billImageUrl)) {
      urls.push(raw.trim());
    }
  };

  pushParsed(job.deliveryProofImageUrl);
  if (urls.length === 0) {
    pushParsed(job.proofImageUrl);
  }
  return Array.from(new Set(urls));
}

export async function sendDeliveryProofViaLineInternal(params: {
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

    if (!customer && isValidPhoneNumber(job.customerPhone)) {
      customer = await prisma.customer.findFirst({
        where: { phone: job.customerPhone! },
      });
    }

    const targetName = (customer?.name || job.customerName || "").trim();
    if ((!customer || !isValidLineUserId(customer.lineId)) && targetName.length >= 2) {
      const siblingWithLine = await prisma.customer.findFirst({
        where: {
          name: { equals: targetName, mode: "insensitive" },
          lineId: { startsWith: "U" },
        },
      });
      if (siblingWithLine && isValidLineUserId(siblingWithLine.lineId)) {
        const otherCustomersWithSameLineId = await prisma.customer.findMany({
          where: { lineId: siblingWithLine.lineId },
          select: { name: true },
        });
        const distinctNames = new Set(
          otherCustomersWithSameLineId.map((c) => normalizeHandle(c.name)).filter(Boolean)
        );
        if (distinctNames.size <= 1) {
          if (customer) {
            const updatedC = await prisma.customer.update({
              where: { id: customer.id },
              data: { lineId: siblingWithLine.lineId },
            });
            primeCustomerCache(updatedC);
            customer.lineId = siblingWithLine.lineId;
          } else {
            customer = siblingWithLine;
          }
        }
      }
    }

    if (customer?.lineId && isValidLineUserId(customer.lineId) && !params.overrideLineUserId) {
      const sharedProfiles = await prisma.customer.findMany({
        where: { lineId: customer.lineId },
        select: { id: true, name: true },
      });
      const distinctNames = new Set(
        sharedProfiles.map((p) => normalizeHandle(p.name)).filter(Boolean)
      );
      if (distinctNames.size > 1) {
        customer.lineId = null;
      }
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

    if (jobLineIdFromNotes && isValidLineUserId(jobLineIdFromNotes) && !params.overrideLineUserId) {
      const targetNorm = normalizeHandle(customer?.name || job.customerName);
      if (
        jobLineIdFromNotes === "U81d5e33ad54c67eaa7a761fdfa549c77" &&
        targetNorm &&
        !targetNorm.includes("nathan")
      ) {
        jobLineIdFromNotes = "";
      } else {
        const sharedByNotes = await prisma.customer.findMany({
          where: { lineId: jobLineIdFromNotes },
          select: { name: true },
        });
        const distinctNotesNames = new Set(
          sharedByNotes.map((p) => normalizeHandle(p.name)).filter(Boolean)
        );
        if (distinctNotesNames.size > 1) {
          jobLineIdFromNotes = "";
        }
      }
    }

    let lineUserId = (
      params.overrideLineUserId ||
      (isValidLineUserId(jobLineIdFromNotes) ? jobLineIdFromNotes : "") ||
      customer?.lineId ||
      jobLineIdFromNotes ||
      ""
    ).trim();

    if (!isValidLineUserId(lineUserId)) {
      const contactsRes = await getLineOaContactsInternal();
      const normSavedLineHandle = normalizeHandle(jobLineIdFromNotes || customer?.lineId);
      const normCustomerName = normalizeHandle(customer?.name || job.customerName);
      const validJobPhoneDigits = normalizeValidPhoneDigits(
        job.customerPhone || customer?.phone
      );

      const matchedContact =
        contactsRes.contacts.find(
          (c) =>
            (customer &&
              c.linkedCustomerId === customer.id &&
              (!c.linkedCustomerName ||
                !normCustomerName ||
                normalizeHandle(c.linkedCustomerName) === normCustomerName)) ||
            (Boolean(validJobPhoneDigits) &&
              normalizeValidPhoneDigits(c.linkedCustomerPhone) === validJobPhoneDigits)
        ) ||
        (normSavedLineHandle
          ? contactsRes.contacts.find(
              (c) => normalizeHandle(c.displayName) === normSavedLineHandle
            )
          : undefined) ||
        (normCustomerName
          ? (() => {
              const byName = contactsRes.contacts.filter(
                (c) => normalizeHandle(c.displayName) === normCustomerName
              );
              return byName.length === 1 ? byName[0] : undefined;
            })()
          : undefined);

      if (matchedContact && isValidLineUserId(matchedContact.userId)) {
        lineUserId = matchedContact.userId;
        if (customer) {
          const updatedC = await prisma.customer.update({
            where: { id: customer.id },
            data: { lineId: lineUserId },
          });
          primeCustomerCache(updatedC);
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
      const updatedC = await prisma.customer.update({
        where: { id: customer.id },
        data: { lineId: lineUserId },
      });
      primeCustomerCache(updatedC);
    }

    const rawPhotos = parseJobDeliveryPhotos(job);
    const resolvedPhotos = await Promise.all(
      rawPhotos.slice(0, 4).map((u) => resolvePublicHttpsMediaUrl(u))
    );
    const httpsPhotos = resolvedPhotos.filter((u): u is string => Boolean(u));

    const branch = job.branchId
      ? await prisma.shopLocation.findUnique({ where: { id: job.branchId } }).catch(() => null)
      : null;
    const locationSignal = [
      job.dropoffLocation || "",
      job.pickupLocation || "",
      (job as any).deliveryAddress || "",
      customer?.defaultAddress || "",
      branch?.name || "",
      branch?.area || "",
      job.branchId || "",
    ].join(" ");
    const dLat = Number((job as any).dropoffLat ?? (job as any).pickupLat ?? 0);
    const dLng = Number((job as any).dropoffLng ?? (job as any).pickupLng ?? 0);
    const isPattayaCoords =
      dLat > 12.5 && dLat < 13.35 && dLng > 100.75 && dLng < 101.15;
    const isPattayaLocation =
      (branch?.area || "").toUpperCase() === "PTY" ||
      isPattayaCoords ||
      /pattaya|พัทยา|chonburi|ชลบุรี|jomtien|จอมเทียน|naklua|นาเกลือ|pratumnak|พระตำหนัก|banglamung|บางละมุง/i.test(
        locationSignal
      );
    const googleReviewUrl = isPattayaLocation
      ? "https://g.page/r/Ca87xY1AD8r3EBE/review"
      : "https://g.page/r/CRQrSI5dp5a8EBE/review";

    const displayId = formatJobDisplayId(job.id);
    const customerDisplayName = job.customerName || customer?.name || "Valued Customer";
    const dropoffText = job.dropoffLocation ? `\n📍 Location: ${job.dropoffLocation}` : "";
    const shopBrandLabel =
      brand === "noname_laundry" ? "NoName Laundry" : "That Laundry Shop";

    const textMessage =
      params.customMessage?.trim() ||
      `✨ Hello ${customerDisplayName},\nYour laundry order #${displayId} has been delivered! 🧺🚚${dropoffText}\n\nThank you for choosing ${shopBrandLabel}! 💚\nIf you are happy with our service, please give us an honest good review on Google:\n${googleReviewUrl}`;

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
      deliveryPhotoSentMessageText: textMessage,
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

    try {
      await recordOutboundSocialMessageFromSystemInternal({
        channel: "line",
        externalContactId: lineUserId,
        contactName: customer?.name || job.customerName || undefined,
        contactPhone: isValidPhoneNumber(customer?.phone || job.customerPhone)
          ? customer?.phone || job.customerPhone || ""
          : "",
        customerId: customer?.id || job.customerId || null,
        text: textMessage,
        imageUrls: rawPhotos.slice(0, 4),
        senderName: params.actorName || "LINE OA Bot",
        messageId: `msg_line_job_${job.id}`,
      });
    } catch (inboxErr) {
      console.warn("[LINE OA] Failed to record outbound message to Social Inbox:", inboxErr);
    }

    invalidateDbCache("jobs");
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

    const res = await sendDeliveryProofViaLineInternal({
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
