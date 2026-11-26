'use server';

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { uploadBufferToGcs } from '@/lib/gcs';
import { assertServerActionAuthorized } from '@/lib/server-auth';
import {
  SocialChannel,
  SocialChannelConfig,
  SocialChannelLiveStatus,
  SocialConversation,
  SocialMessage,
  SocialMessageAttachment,
  SocialMessageReplyRef,
} from '@/types/social-inbox';
import {
  formatPhoneForWhatsApp,
  formatDisplayPhone,
  buildWhatsAppUrl,
  buildWhatsAppWebUrl,
  buildWhatsAppProtocolUrl,
  normalizePhoneKey,
} from '@/lib/social-helpers';
import {
  isValidLineTargetId,
  isValidLineUserId,
  sendLinePushMessage,
  getLineBotInfo,
  LineMessageObject,
  LineContactRecord,
} from '@/lib/line';
import { getStoredLineOaSettings } from '@/lib/line-internal';
import {
  markGmailEmailsAsReadBySender,
  resolveGmailCredentials,
  sendGmailReply,
  syncGmailInboxMessages,
  testGmailConnection,
} from '@/lib/gmail-inbox';
import {
  SOCIAL_CONVERSATIONS_KEY,
  SOCIAL_MESSAGES_KEY,
  SOCIAL_CONFIG_KEY,
  getDefaultSocialChannelConfig as getDefaultChannelConfig,
  maskSocialChannelConfigSecrets,
  isSafeExternalHttpUrl,
  resolvePublicHttpsMediaUrl as resolvePublicHttpsImageUrl,
  loadRawSocialInboxStore as loadRawInboxStore,
  saveRawSocialInboxStore as saveInboxStore,
  saveRawSocialConversationsOnly,
  getSocialStoreVersion,
  bumpSocialStoreVersion,
  invalidateSocialStoreCache,
  withSocialStoreLock,
  recordSocialReadWatermark,
  applyReadWatermarks,
  recordInboundSocialMessageInternal,
  ensureSocialInboxSchemaAndMigrate,
  loadSocialChannelConfig,
  querySocialConversations,
  queryConversationMessages,
  queryRecentSocialMessages,
  queryDeltaSocialMessages,
  searchSocialMessagesInternal,
  type SocialMessageSearchHit,
  findSocialConversationById,
  findSocialConversationForContact,
  upsertSocialConversationRow,
  insertSocialMessageAndTouchConversation,
  deleteSocialConversationAndMessages,
  markSocialConversationsReadInDb,
  processPendingSocialMediaJobs,
  mapDbRowToConversation,
} from '@/lib/social-inbox-internal';
import {
  getWhatsAppQrStatus,
  getWhatsAppQrStatusAsync,
  startWhatsAppQrConnection,
  disconnectWhatsAppQrSession,
  sendDirectWhatsAppQrMessage,
  markWhatsAppChatReadOnDevice,
  type WhatsAppQrState,
} from '@/lib/whatsapp-qr-manager';
import {
  resolveWhatsAppCloudCredentials,
  verifyWhatsAppCloudConnection,
  sendWhatsAppCloudApiMessage,
  markWhatsAppCloudMessageAsRead,
  type WhatsAppCloudVerificationResult,
} from '@/lib/whatsapp-cloud-api';

import { PrismaClient } from '@prisma/client';

const FOLLOWER_ONLY_FALLBACK_TS = '2026-01-01T00:00:00.000Z';

let _roLiveLinePrisma: PrismaClient | null = null;
function getReadOnlyLiveLineDb(): PrismaClient | null {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('/tls_test')) return null;
  if (!_roLiveLinePrisma) {
    const liveUrl = dbUrl.replace(/\/tls_test(\?.*)?$/, '/postgres$1');
    _roLiveLinePrisma = new PrismaClient({
      datasources: { db: { url: liveUrl } },
    });
  }
  return _roLiveLinePrisma;
}

function cleanNameForLineMatch(s?: string | null): string {
  if (!s) return '';
  return String(s)
    .replace(/\([A-Z]{2,4}\d{3,5}\)/gi, '')
    .replace(/\bVIP\b/gi, '')
    .replace(/^(K\.|MS\.|MR\.|MRS\.|MISS\s+|คุณ)/i, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseJsonImageUrls(raw?: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const u of parsed) {
        if (typeof u === 'string' && u.trim()) out.push(u.trim());
      }
      return Array.from(new Set(out));
    }
  } catch {}
  if (typeof raw === 'string' && raw.trim()) out.push(raw.trim());
  return Array.from(new Set(out));
}

function normalizeAndSortConversations(
  conversations: SocialConversation[],
  messages: SocialMessage[]
): { conversations: SocialConversation[]; messages: SocialMessage[]; didClean: boolean } {
  let didClean = false;

  // Remove old test order T2026000023 message or any collision conv_line_line_oa_ / 6c696e655f6f615f messages
  const filteredMessages = messages.filter((m) => {
    if (
      m.id === 'msg_line_job_T2026000023' ||
      m.id.includes('_T2026') ||
      m.conversationId.startsWith('conv_line_line_oa_') ||
      m.conversationId === 'conv_line_oa_6c696e655f6f615f'
    ) {
      didClean = true;
      return false;
    }
    return true;
  });
  conversations = conversations.filter((c) => {
    if (
      c.id.startsWith('conv_line_line_oa_') ||
      c.id === 'conv_line_oa_6c696e655f6f615f'
    ) {
      didClean = true;
      return false;
    }
    return true;
  });

  // Group messages by conversationId
  const msgsByConvId = new Map<string, SocialMessage[]>();
  for (const m of filteredMessages) {
    const list = msgsByConvId.get(m.conversationId) || [];
    list.push(m);
    msgsByConvId.set(m.conversationId, list);
  }

  for (const list of msgsByConvId.values()) {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const normalizedConvs = conversations.map((conv) => {
    const convMsgs = msgsByConvId.get(conv.id) || [];
    let updated = { ...conv };

    // Fix Nathan's conversation name if previously overwritten by -- phone bug
    if (conv.externalContactId === 'U81d5e33ad54c67eaa7a761fdfa549c77') {
      if (updated.contactName !== 'Nathan' || (updated.customerName && updated.customerName !== 'NATHAN')) {
        updated.contactName = 'Nathan';
        updated.customerName = 'NATHAN';
        didClean = true;
      }
    }

    // Fix Joe's conversation if previously linked to JUSTIN CHAN via test order T2026000023
    if (
      conv.externalContactId === 'Ub0668bfe6e6d9dd2bd4d2b09ff833bcc' &&
      updated.customerName === 'JUSTIN CHAN'
    ) {
      updated.customerName = 'JOE';
      updated.customerId = null;
      didClean = true;
    }

    // Auto-heal WhatsApp conversations where 10-digit international phone (e.g. Singapore 65xxxxxxxx) had +66 prepended
    if (updated.channel === 'whatsapp' && updated.contactPhone?.startsWith('+6665') && updated.contactPhone.length === 13) {
      const fixedPhone = `+${updated.contactPhone.slice(3)}`;
      if (updated.contactName === updated.contactPhone) {
        updated.contactName = fixedPhone;
      }
      updated.contactPhone = fixedPhone;
      didClean = true;
    }

    if (convMsgs.length > 0) {
      const latestMsg = convMsgs[convMsgs.length - 1];
      const latestMsgMs = new Date(latestMsg.createdAt || 0).getTime();
      const convLastMs = new Date(updated.lastMessageAt || 0).getTime();
      const isTgGroupInbound =
        updated.channel === 'telegram' &&
        (updated.contactName?.startsWith('👥') || updated.externalContactId?.startsWith('-')) &&
        latestMsg.direction === 'inbound' &&
        Boolean(latestMsg.senderName);
      const expectedPreview =
        isTgGroupInbound && !latestMsg.text.startsWith(`${latestMsg.senderName}:`)
          ? `${latestMsg.senderName}: ${latestMsg.text}`
          : latestMsg.text;

      if (
        latestMsgMs >= convLastMs &&
        (updated.lastMessageText !== expectedPreview ||
          updated.lastMessageAt !== latestMsg.createdAt)
      ) {
        updated.lastMessageText = expectedPreview;
        updated.lastMessageAt = latestMsg.createdAt;
        updated.lastMessageDirection = latestMsg.direction;
        if (
          !updated.updatedAt ||
          latestMsgMs > new Date(updated.updatedAt).getTime()
        ) {
          updated.updatedAt = latestMsg.createdAt;
        }
        didClean = true;
      }
    } else if (
      updated.channel === 'line' &&
      (updated.lastMessageText === 'Connected via LINE Official Account (@thatlaundryshop)' ||
        updated.lastMessageText === '[Followed LINE OA]' ||
        updated.lastMessageText?.includes('#T2026'))
    ) {
      if (
        updated.lastMessageAt !== FOLLOWER_ONLY_FALLBACK_TS ||
        updated.lastMessageText?.includes('#T2026')
      ) {
        updated.lastMessageText = 'Connected via LINE Official Account (@thatlaundryshop)';
        updated.lastMessageAt = FOLLOWER_ONLY_FALLBACK_TS;
        updated.updatedAt = FOLLOWER_ONLY_FALLBACK_TS;
        didClean = true;
      }
    }

    // Auto-clear stale unreadCount if the latest message is outbound (we already replied!)
    if (updated.lastMessageDirection === 'outbound' && (updated.unreadCount || 0) > 0) {
      updated.unreadCount = 0;
      didClean = true;
    }

    return updated;
  });

  // Deduplicate conversations sharing the same channel + externalContactId (or same WhatsApp 9-digit phone tail)
  const dedupeKeyFor = (c: SocialConversation): string => {
    const ext = String(c.externalContactId || '').trim();
    if (c.channel === 'whatsapp') {
      const digits = String(c.contactPhone || ext).replace(/\D/g, '');
      if (digits.length >= 7) return `whatsapp:phone:${digits.slice(-9)}`;
    }
    if (ext) return `${c.channel}:ext:${ext}`;
    return `${c.channel}:id:${c.id}`;
  };

  const dedupedMap = new Map<string, SocialConversation>();
  const remappedConvIds = new Map<string, string>();
  for (const conv of normalizedConvs) {
    const k = dedupeKeyFor(conv);
    const existing = dedupedMap.get(k);
    if (!existing) {
      dedupedMap.set(k, conv);
    } else {
      didClean = true;
      const existingTs = new Date(existing.lastMessageAt || 0).getTime();
      const convTs = new Date(conv.lastMessageAt || 0).getTime();
      const primary = convTs > existingTs ? conv : existing;
      const secondary = convTs > existingTs ? existing : conv;
      remappedConvIds.set(secondary.id, primary.id);
      const merged: SocialConversation = {
        ...primary,
        customerId: primary.customerId || secondary.customerId || null,
        customerName: primary.customerName || secondary.customerName || null,
        customerMemberId: primary.customerMemberId || secondary.customerMemberId || null,
        contactPhone: primary.contactPhone || secondary.contactPhone || '',
        contactAvatar: primary.contactAvatar || secondary.contactAvatar,
        unreadCount:
          primary.lastMessageDirection === 'outbound'
            ? 0
            : Math.max(primary.unreadCount || 0, secondary.unreadCount || 0),
      };
      dedupedMap.set(k, merged);
    }
  }

  let finalMessages = filteredMessages;
  if (remappedConvIds.size > 0) {
    finalMessages = filteredMessages.map((m) => {
      const targetId = remappedConvIds.get(m.conversationId);
      return targetId ? { ...m, conversationId: targetId } : m;
    });
  }

  const dedupedConvs = Array.from(dedupedMap.values());

  const hasRealConversationActivity = (c: SocialConversation): number => {
    if ((msgsByConvId.get(c.id)?.length || 0) > 0) return 1;
    if (
      c.lastMessageText &&
      c.lastMessageText !== 'Connected via LINE Official Account (@thatlaundryshop)' &&
      c.lastMessageText !== '[Followed LINE OA]'
    ) {
      return 1;
    }
    return 0;
  };

  dedupedConvs.sort((a, b) => {
    const aUnread = (a.unreadCount || 0) > 0 ? 1 : 0;
    const bUnread = (b.unreadCount || 0) > 0 ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    const aActive = hasRealConversationActivity(a);
    const bActive = hasRealConversationActivity(b);
    if (aActive !== bActive) return bActive - aActive;
    const aCrm = a.customerId ? 1 : 0;
    const bCrm = b.customerId ? 1 : 0;
    if (!aActive && !bActive && aCrm !== bCrm) return bCrm - aCrm;
    return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
  });

  return { conversations: dedupedConvs, messages: finalMessages, didClean };
}

/**
 * Ultra-fast initial loader: reads directly from the versioned store/RAM cache
 * and returns only the latest 250 messages (20x smaller payload than 5,000 messages!)
 * so the Live Chat UI opens near-instantly. Older thread history loads on-demand via `getConversationMessagesAction`.
 */
const globalForFastSnapshot = globalThis as unknown as {
  __tlsFastSocialSnapshot?: {
    version: string;
    conversations: SocialConversation[];
    recentMessages: SocialMessage[];
    maskedConfig: SocialChannelConfig;
    builtAt: number;
  };
};

/**
 * Ultra-fast initial loader for the Omnichannel Live Chat Hub.
 * Memoized in server RAM by store version (0.1ms repeat response!) and returns
 * only the latest 250 messages (20x smaller payload than 5,000 messages!)
 * so the Live Chat UI opens near-instantly. Older thread history loads on-demand via `getConversationMessagesAction`.
 */
export async function getSocialInboxFastAction() {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    const currentVersion = await getSocialStoreVersion();
    const cachedSnap = globalForFastSnapshot.__tlsFastSocialSnapshot;
    if (
      cachedSnap &&
      currentVersion !== '0' &&
      cachedSnap.version === currentVersion &&
      Date.now() - cachedSnap.builtAt < 30_000
    ) {
      return {
        success: true,
        conversations: applyReadWatermarks(cachedSnap.conversations),
        messages: cachedSnap.recentMessages,
        config: cachedSnap.maskedConfig,
        version: cachedSnap.version,
      };
    }

    const { conversations, messages, config, version } = await loadRawInboxStore(currentVersion);
    const norm = normalizeAndSortConversations(applyReadWatermarks(conversations), messages);
    // Sort messages chronologically ascending and return only the 250 newest for ultra-fast boot
    const sortedMsgs = norm.messages
      .slice()
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    const recentMessages = sortedMsgs.slice(-250);
    const maskedConfig = maskSocialChannelConfigSecrets(config);

    if (version !== '0') {
      globalForFastSnapshot.__tlsFastSocialSnapshot = {
        version,
        conversations: norm.conversations,
        recentMessages,
        maskedConfig,
        builtAt: Date.now(),
      };
    }

    return {
      success: true,
      conversations: norm.conversations,
      messages: recentMessages,
      config: maskedConfig,
      version,
    };
  } catch (err: any) {
    console.error('[getSocialInboxFastAction] Error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to load inbox',
      conversations: [] as SocialConversation[],
      messages: [] as SocialMessage[],
      config: getDefaultChannelConfig(),
      version: '0',
    };
  }
}

/**
 * Tiny (~5 KB, ~20ms) on-demand loader for full message history of a single clicked conversation.
 */
export async function getConversationMessagesAction(conversationId: string): Promise<{
  success: boolean;
  messages: SocialMessage[];
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    if (!conversationId) return { success: true, messages: [] };
    const threadMsgs = await queryConversationMessages(conversationId, 1000);
    return { success: true, messages: threadMsgs };
  } catch (err: any) {
    return { success: false, messages: [], error: err?.message || 'Failed to load thread messages' };
  }
}

export async function searchSocialMessagesAction(input: {
  query: string;
  channel?: string;
}): Promise<{
  success: boolean;
  hits: SocialMessageSearchHit[];
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    const hits = await searchSocialMessagesInternal({
      query: input?.query || '',
      channel: input?.channel,
      limit: 80,
    });
    return { success: true, hits };
  } catch (err: any) {
    return {
      success: false,
      hits: [],
      error: err?.message || 'Failed to search messages',
    };
  }
}

/**
 * Fast lookup of all Social Inbox conversations (WhatsApp, LINE OA, Messenger, IG, Telegram)
 * belonging to a specific customer inside the Edit Job 5th column.
 */
export async function getCustomerJobChatThreadsAction(input: {
  customerId?: string | null;
  customerPhone?: string | null;
  secondaryPhone?: string | null;
  customerName?: string | null;
  lineUserId?: string | null;
  whatsappId?: string | null;
  preferredConversationId?: string | null;
}): Promise<{
  success: boolean;
  conversations: SocialConversation[];
  activeConversationId: string | null;
  messages: SocialMessage[];
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    await ensureSocialInboxSchemaAndMigrate();

    const orFilters: any[] = [];
    const custId = (input.customerId || '').trim();
    if (custId) {
      orFilters.push({ customerId: custId });
    }

    let lineUid = (input.lineUserId || '').trim();
    if (!lineUid && custId) {
      const custLineRow = await prisma.customer.findUnique({
        where: { id: custId },
        select: { lineId: true },
      });
      if (custLineRow?.lineId) {
        lineUid = custLineRow.lineId.trim();
      }
    }
    if (lineUid) {
      orFilters.push({ externalContactId: lineUid });
    }

    const phoneCandidates = new Set<string>();
    for (const rawPhone of [input.customerPhone, input.secondaryPhone, input.whatsappId]) {
      if (!rawPhone) continue;
      const parts = String(rawPhone)
        .split(/[\/,;]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      for (const part of parts) {
        const norm = normalizePhoneKey(part);
        if (norm && norm.length >= 7) {
          phoneCandidates.add(norm);
        }
        const digitsOnly = part.replace(/\D/g, '');
        if (digitsOnly.length >= 8) {
          phoneCandidates.add(digitsOnly.slice(-9));
        }
      }
    }

    for (const phoneKey of phoneCandidates) {
      orFilters.push({ contactPhone: { contains: phoneKey } });
      orFilters.push({ externalContactId: { contains: phoneKey } });
    }

    const rawName = (input.customerName || '').trim();
    const cleanedName = cleanNameForLineMatch(rawName);
    if (
      rawName.length >= 3 &&
      !/^(walk[\s-]*in|guest|customer|test)$/i.test(rawName)
    ) {
      orFilters.push({ contactName: { equals: rawName, mode: 'insensitive' } });
      if (cleanedName && cleanedName.length >= 3 && cleanedName !== rawName.toLowerCase()) {
        orFilters.push({ contactName: { equals: cleanedName, mode: 'insensitive' } });
      }
    }

    if (orFilters.length === 0) {
      return {
        success: true,
        conversations: [],
        activeConversationId: null,
        messages: [],
      };
    }

    const rows = await prisma.socialConversation.findMany({
      where: { OR: orFilters },
      orderBy: { lastMessageAt: 'desc' },
      take: 12,
    });

    const conversations: SocialConversation[] = rows.map((row) => {
      const conv = mapDbRowToConversation(row);
      if (!conv.customerId && custId) {
        conv.customerId = custId;
      }
      return conv;
    });

    // Auto-backfill customerId in DB if matched by phone/LINE and not yet linked
    if (custId && rows.some((r) => !r.customerId)) {
      const unlinkedIds = rows.filter((r) => !r.customerId).map((r) => r.id);
      void prisma.socialConversation
        .updateMany({
          where: { id: { in: unlinkedIds }, customerId: null },
          data: { customerId: custId },
        })
        .catch(() => {});
    }

    const preferred =
      (input.preferredConversationId &&
        conversations.find((c) => c.id === input.preferredConversationId)) ||
      conversations[0] ||
      null;

    const messages = preferred ? await queryConversationMessages(preferred.id, 300) : [];

    return {
      success: true,
      conversations,
      activeConversationId: preferred?.id || null,
      messages,
    };
  } catch (err: any) {
    console.error('[getCustomerJobChatThreadsAction] Error:', err);
    return {
      success: false,
      conversations: [],
      activeConversationId: null,
      messages: [],
      error: err?.message || 'Failed to load customer chat threads',
    };
  }
}

/**
 * Load all unified inbox conversations, messages, channel configs, and merge LINE OA contacts
 */
export async function getSocialInboxDataAction() {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });

    let { conversations, messages, config } = await loadRawInboxStore();

    const roLiveDb = getReadOnlyLiveLineDb();

    // Fetch customers for automatic enrichment & matching (merge live DB customers on localhost read-only)
    const [localCustomers, liveCustomers] = await Promise.all([
      prisma.customer.findMany({
        select: {
          id: true,
          name: true,
          nickName: true,
          phone: true,
          memberId: true,
          lineId: true,
          creditBalance: true,
          brand: true,
        },
      }),
      roLiveDb
        ? roLiveDb.customer
            .findMany({
              select: {
                id: true,
                name: true,
                nickName: true,
                phone: true,
                memberId: true,
                lineId: true,
                creditBalance: true,
                brand: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const customerMapById = new Map<string, (typeof localCustomers)[0]>();
    for (const c of localCustomers) customerMapById.set(c.id, c);
    for (const c of liveCustomers) {
      // Guard against Nathan's LINE ID on non-Nathan customer records in live DB
      const safeLineId =
        c.lineId === 'U81d5e33ad54c67eaa7a761fdfa549c77' &&
        cleanNameForLineMatch(c.name) !== 'nathan'
          ? null
          : c.lineId;
      customerMapById.set(c.id, { ...c, lineId: safeLineId });
    }
    const allCustomers = Array.from(customerMapById.values());

    // Pull synced LINE OA contacts (merge local + live DB contacts read-only)
    const [lineContactsRow, liveLineContactsRow, liveSocialMsgsRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'lineOaContacts' } }),
      roLiveDb
        ? roLiveDb.setting.findUnique({ where: { key: 'lineOaContacts' } }).catch(() => null)
        : Promise.resolve(null),
      roLiveDb
        ? roLiveDb.setting.findUnique({ where: { key: SOCIAL_MESSAGES_KEY } }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const mergedContactsMap = new Map<string, LineContactRecord>();
    const ingestContactsJson = (raw?: string | null) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed as LineContactRecord[]) {
            if (!item?.userId) continue;
            const prev = mergedContactsMap.get(item.userId);
            if (!prev) {
              mergedContactsMap.set(item.userId, item);
            } else {
              mergedContactsMap.set(item.userId, {
                ...prev,
                ...item,
                lastMessageText: item.lastMessageText || prev.lastMessageText,
                lastInteractionAt:
                  item.lastInteractionAt && prev.lastInteractionAt
                    ? new Date(item.lastInteractionAt) > new Date(prev.lastInteractionAt)
                      ? item.lastInteractionAt
                      : prev.lastInteractionAt
                    : item.lastInteractionAt || prev.lastInteractionAt,
              });
            }
          }
        }
      } catch {}
    };
    ingestContactsJson(lineContactsRow?.value);
    ingestContactsJson(liveLineContactsRow?.value);
    const lineContacts = Array.from(mergedContactsMap.values());

    let didMutate = false;
    const nowIso = new Date().toISOString();

    // Merge any live webhook messages stored in production DB's TLS_SOCIAL_MESSAGES_V1
    if (liveSocialMsgsRow?.value) {
      try {
        const liveMsgs: SocialMessage[] = JSON.parse(liveSocialMsgsRow.value);
        if (Array.isArray(liveMsgs)) {
          const existingIds = new Set(messages.map((m) => m.id));
          for (const lm of liveMsgs) {
            if (lm?.id && !existingIds.has(lm.id)) {
              messages.push(lm);
              existingIds.add(lm.id);
              didMutate = true;
            }
          }
        }
      } catch {}
    }

    const customerByLineId = new Map<string, (typeof allCustomers)[0]>();
    for (const c of allCustomers) {
      if (c.lineId && /^U[0-9a-f]{32}$/i.test(c.lineId.trim())) {
        if (
          c.lineId.trim() === 'U81d5e33ad54c67eaa7a761fdfa549c77' &&
          cleanNameForLineMatch(c.name) !== 'nathan'
        ) {
          continue;
        }
        customerByLineId.set(c.lineId.trim(), c);
      }
    }
    const lineContactById = new Map(lineContacts.map((lc) => [lc.userId, lc]));

    // Build lookup indexes for smart LINE contact matching
    const contactsByExactName = new Map<string, LineContactRecord[]>();
    const contactsByCleanName = new Map<string, LineContactRecord[]>();
    for (const lc of lineContacts) {
      if (lc.displayName) {
        const ex = lc.displayName.trim().toLowerCase();
        if (ex) {
          const arr = contactsByExactName.get(ex) || [];
          arr.push(lc);
          contactsByExactName.set(ex, arr);
        }
        const cl = cleanNameForLineMatch(lc.displayName);
        if (cl.length >= 2) {
          const arr = contactsByCleanName.get(cl) || [];
          arr.push(lc);
          contactsByCleanName.set(cl, arr);
        }
      }
    }

    // Prioritize LINE contacts with actual messages or linked CRM customer first, then recent followers
    const prioritizedLineContacts = [...lineContacts].sort((a, b) => {
      const aHasMsg = Boolean(a.lastMessageText && a.lastMessageText !== '[Followed LINE OA]') ? 1 : 0;
      const bHasMsg = Boolean(b.lastMessageText && b.lastMessageText !== '[Followed LINE OA]') ? 1 : 0;
      if (aHasMsg !== bHasMsg) return bHasMsg - aHasMsg;
      const aHasCrm = Boolean(a.linkedCustomerId || customerByLineId.has(a.userId)) ? 1 : 0;
      const bHasCrm = Boolean(b.linkedCustomerId || customerByLineId.has(b.userId)) ? 1 : 0;
      if (aHasCrm !== bHasCrm) return bHasCrm - aHasCrm;
      return 0;
    });

    const existingLineIds = new Set(
      conversations.filter((c) => c.channel === 'line').map((c) => c.externalContactId)
    );

    for (const lc of prioritizedLineContacts.slice(0, 200)) {
      if (!lc.userId || existingLineIds.has(lc.userId)) continue;

      const matchedCust =
        allCustomers.find((c) => c.id === lc.linkedCustomerId || c.lineId === lc.userId) || null;

      const hasRealMsg = Boolean(lc.lastMessageText && lc.lastMessageText !== '[Followed LINE OA]');
      const convId = `conv_line_${lc.userId.slice(-10)}`;
      const initialText = hasRealMsg
        ? lc.lastMessageText!
        : 'Connected via LINE Official Account (@thatlaundryshop)';
      const ts = hasRealMsg ? (lc.lastInteractionAt || nowIso) : FOLLOWER_ONLY_FALLBACK_TS;

      const newConv: SocialConversation = {
        id: convId,
        channel: 'line',
        externalContactId: lc.userId,
        contactName: lc.displayName || matchedCust?.name || 'LINE User',
        contactPhone: matchedCust?.phone || lc.linkedCustomerPhone || '',
        contactAvatar: lc.pictureUrl,
        contactHandle: '@thatlaundryshop',
        customerId: matchedCust?.id || lc.linkedCustomerId || null,
        customerName: matchedCust?.name || lc.linkedCustomerName || null,
        customerMemberId: matchedCust?.memberId || null,
        customerWalletBalance: matchedCust?.creditBalance || 0,
        brand: (matchedCust?.brand as any) || 'that_laundry_shop',
        status: 'open',
        unreadCount: hasRealMsg ? 1 : 0,
        lastMessageText: initialText,
        lastMessageAt: ts,
        lastMessageDirection: 'inbound',
        createdAt: ts,
        updatedAt: ts,
      };

      conversations.push(newConv);
      existingLineIds.add(lc.userId);

      if (hasRealMsg && lc.lastMessageText) {
        messages.push({
          id: `msg_init_${lc.userId.slice(-8)}`,
          conversationId: convId,
          channel: 'line',
          direction: 'inbound',
          text: lc.lastMessageText,
          senderName: lc.displayName || 'LINE User',
          status: 'delivered',
          deliveryMethod: 'line_api',
          createdAt: ts,
        });
      }
      didMutate = true;
    }

    // Automatically sync Official LINE OA activity (Delivery notifications, Bill/Proforma messages, and active LINE OA orders)
    try {
      const jobSelect = {
        id: true,
        customerId: true,
        customerName: true,
        customerPhone: true,
        status: true,
        totalAmount: true,
        proformaNumber: true,
        dropoffLocation: true,
        deliveryProofImageUrl: true,
        proofImageUrl: true,
        billImageUrl: true,
        bagImageUrl: true,
        pickupProofImageUrl: true,
        adminNotesJson: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      };
      const jobWhere = {
        OR: [
          { adminNotesJson: { contains: '"contactChannel":"line"' } },
          { adminNotesJson: { contains: 'deliveryPhotoSentLineUserId' } },
          { adminNotesJson: { contains: '"deliveryPhotoSentChannel":"LINE OA"' } },
          { adminNotesJson: { contains: 'isDeliveryPhotoSent' } },
        ],
      };

      const [localJobs, liveJobs] = await Promise.all([
        prisma.job.findMany({
          where: jobWhere,
          orderBy: { updatedAt: 'desc' },
          take: 80,
          select: jobSelect,
        }),
        roLiveDb
          ? roLiveDb.job
              .findMany({
                where: jobWhere,
                orderBy: { updatedAt: 'desc' },
                take: 120,
                select: jobSelect,
              })
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      const jobMap = new Map<string, (typeof localJobs)[0]>();
      for (const j of [...liveJobs, ...localJobs]) {
        // Skip synthetic test jobs starting with T2026
        if (!j?.id || j.id.startsWith('T2026')) continue;
        if (!jobMap.has(j.id)) jobMap.set(j.id, j);
      }
      const allLineCandidateJobs = Array.from(jobMap.values()).sort(
        (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      );

      const validExistingConvIds = new Set(conversations.map((c) => c.id));
      messages = messages.filter((m) => validExistingConvIds.has(m.conversationId));
      const existingMsgIds = new Set(messages.map((m) => m.id));

      for (const sj of allLineCandidateJobs) {
        let meta: Record<string, any> = {};
        if (sj.adminNotesJson) {
          try {
            meta = JSON.parse(sj.adminNotesJson) || {};
          } catch {}
        }

        const isLineChannelJob =
          meta.contactChannel === 'line' ||
          meta.deliveryPhotoSentChannel === 'LINE OA' ||
          Boolean(meta.deliveryPhotoSentLineUserId);
        if (!isLineChannelJob) continue;

        const isNathanCust = cleanNameForLineMatch(sj.customerName) === 'nathan';
        const matchedCust =
          (sj.customerId ? customerMapById.get(sj.customerId) : null) ||
          allCustomers.find(
            (c) =>
              c.name &&
              sj.customerName &&
              c.name.trim().toLowerCase() === sj.customerName.trim().toLowerCase()
          ) ||
          null;

        // Resolve the customer's actual LINE profile in lineContacts
        let lcProfile: LineContactRecord | undefined;

        // 1) Check explicit U... IDs
        const rawSentUid = String(meta.deliveryPhotoSentLineUserId || '').trim();
        const rawNotesLineId = String(meta.customerLineId || '').trim();
        const rawCustLineId = String(matchedCust?.lineId || '').trim();

        if (
          isValidLineUserId(rawNotesLineId) &&
          (rawNotesLineId !== 'U81d5e33ad54c67eaa7a761fdfa549c77' || isNathanCust)
        ) {
          lcProfile = lineContactById.get(rawNotesLineId);
        }
        if (
          !lcProfile &&
          isValidLineUserId(rawCustLineId) &&
          (rawCustLineId !== 'U81d5e33ad54c67eaa7a761fdfa549c77' || isNathanCust)
        ) {
          lcProfile = lineContactById.get(rawCustLineId);
        }
        if (
          !lcProfile &&
          isValidLineUserId(rawSentUid) &&
          (rawSentUid !== 'U81d5e33ad54c67eaa7a761fdfa549c77' || isNathanCust)
        ) {
          lcProfile = lineContactById.get(rawSentUid);
        }

        // 2) Check linkedCustomerId in lineContacts
        if (!lcProfile && (sj.customerId || matchedCust?.id)) {
          const cid = sj.customerId || matchedCust?.id;
          const byCid = lineContacts.find(
            (lc) =>
              lc.linkedCustomerId === cid &&
              (!lc.linkedCustomerName ||
                cleanNameForLineMatch(lc.linkedCustomerName) ===
                  cleanNameForLineMatch(sj.customerName))
          );
          if (byCid) lcProfile = byCid;
        }

        // 3) Check exact & cleaned displayName match in lineContacts
        for (const candName of [rawNotesLineId, sj.customerName]) {
          if (lcProfile || !candName || isValidLineUserId(candName)) continue;
          const ex = candName.trim().toLowerCase();
          const exHits = contactsByExactName.get(ex);
          if (exHits && exHits.length === 1) {
            lcProfile = exHits[0];
            break;
          }
          const cl = cleanNameForLineMatch(candName);
          if (cl.length >= 2) {
            const clHits = contactsByCleanName.get(cl);
            if (clHits && clHits.length === 1) {
              lcProfile = clHits[0];
              break;
            }
            const parts = cl.split(' ');
            if (parts.length >= 2 && parts[0].length >= 4) {
              const firstPlusInit = `${parts[0]} ${parts[1][0]}`;
              const initHits = contactsByCleanName.get(firstPlusInit);
              if (initHits && initHits.length === 1) {
                lcProfile = initHits[0];
                break;
              }
              const firstHits = contactsByCleanName.get(parts[0]);
              if (firstHits && firstHits.length === 1) {
                lcProfile = firstHits[0];
                break;
              }
            }
          }
        }

        // Determine targetExternalId for this conversation
        let targetExternalId = lcProfile?.userId || '';
        if (!targetExternalId) {
          if (
            isValidLineUserId(rawSentUid) &&
            (rawSentUid !== 'U81d5e33ad54c67eaa7a761fdfa549c77' || isNathanCust)
          ) {
            targetExternalId = rawSentUid;
          } else if (
            isValidLineUserId(rawNotesLineId) &&
            (rawNotesLineId !== 'U81d5e33ad54c67eaa7a761fdfa549c77' || isNathanCust)
          ) {
            targetExternalId = rawNotesLineId;
          } else if (meta.contactChannel === 'line') {
            const rawHandle = (
              (!isValidLineUserId(rawNotesLineId) ? rawNotesLineId : '') ||
              sj.customerName ||
              sj.id
            ).trim();
            const handleKey =
              cleanNameForLineMatch(rawHandle)
                .replace(/[^a-z0-9\u0E00-\u0E7F\u4E00-\u9FFF]+/gi, '_')
                .replace(/^_+|_+$/g, '') || sj.id;
            targetExternalId = `line_oa_${handleKey}`;
          } else if (isValidLineUserId(rawSentUid)) {
            targetExternalId = rawSentUid;
            lcProfile = lineContactById.get(rawSentUid);
          }
        }

        if (!targetExternalId) continue;

        const isNathanThread = targetExternalId === 'U81d5e33ad54c67eaa7a761fdfa549c77';
        const displayContactName = isNathanThread
          ? 'Nathan'
          : lcProfile?.displayName ||
            (!isValidLineUserId(rawNotesLineId) && rawNotesLineId ? rawNotesLineId : '') ||
            matchedCust?.name ||
            sj.customerName ||
            'LINE User';

        const ensureConversation = (activityIso: string, previewText: string): string => {
          let convIdx = conversations.findIndex(
            (c) => c.channel === 'line' && c.externalContactId === targetExternalId
          );
          if (convIdx >= 0) {
            const prevConv = conversations[convIdx];
            const shouldUpdatePreview =
              prevConv.lastMessageText === 'Connected via LINE Official Account (@thatlaundryshop)' ||
              new Date(activityIso).getTime() >= new Date(prevConv.lastMessageAt).getTime();

            conversations[convIdx] = {
              ...prevConv,
              contactName: displayContactName || prevConv.contactName,
              contactAvatar: lcProfile?.pictureUrl || prevConv.contactAvatar,
              contactPhone:
                prevConv.contactPhone || matchedCust?.phone || sj.customerPhone || '',
              customerId: isNathanThread
                ? prevConv.customerId
                : matchedCust?.id || prevConv.customerId || sj.customerId || null,
              customerName: isNathanThread
                ? 'NATHAN'
                : matchedCust?.name || prevConv.customerName || sj.customerName || null,
              lastMessageText: shouldUpdatePreview ? previewText : prevConv.lastMessageText,
              lastMessageAt: shouldUpdatePreview ? activityIso : prevConv.lastMessageAt,
              lastMessageDirection: shouldUpdatePreview ? 'outbound' : prevConv.lastMessageDirection,
              updatedAt: shouldUpdatePreview ? activityIso : prevConv.updatedAt,
            };
            return prevConv.id;
          } else {
            const convId = isValidLineUserId(targetExternalId)
              ? `conv_line_${targetExternalId.slice(-10)}`
              : `conv_line_oa_${crypto.createHash('md5').update(targetExternalId).digest('hex').slice(0, 12)}`;
            const newConv: SocialConversation = {
              id: convId,
              channel: 'line',
              externalContactId: targetExternalId,
              contactName: displayContactName,
              contactPhone: isNathanThread ? '' : matchedCust?.phone || sj.customerPhone || '',
              contactAvatar: lcProfile?.pictureUrl,
              contactHandle:
                !isValidLineUserId(rawNotesLineId) && rawNotesLineId
                  ? rawNotesLineId
                  : '@thatlaundryshop',
              customerId: isNathanThread ? null : matchedCust?.id || sj.customerId || null,
              customerName: isNathanThread
                ? 'NATHAN'
                : matchedCust?.name || sj.customerName || null,
              customerMemberId: isNathanThread ? null : matchedCust?.memberId || null,
              customerWalletBalance: isNathanThread ? 0 : matchedCust?.creditBalance || 0,
              brand: (matchedCust?.brand as any) || 'that_laundry_shop',
              status: 'open',
              unreadCount: 0,
              lastMessageText: previewText,
              lastMessageAt: activityIso,
              lastMessageDirection: 'outbound',
              createdAt: activityIso,
              updatedAt: activityIso,
            };
            conversations.push(newConv);
            existingLineIds.add(targetExternalId);
            return convId;
          }
        };

        // 1. Bill / Proforma Sent on LINE OA (ONLY digital proforma/receipt, NEVER shop paper bill photos /bills/)
        if (meta.isBillSent && meta.billSentAt && meta.contactChannel === 'line') {
          const billMsgId = `msg_line_bill_${sj.id}`;
          if (!existingMsgIds.has(billMsgId)) {
            const billPhotos = parseJsonImageUrls(sj.billImageUrl).filter((u) => {
              const lower = u.toLowerCase();
              if (lower.includes('/bills/') || lower.includes('/bills-') || lower.includes('subtype=bills')) {
                return false;
              }
              return lower.includes('proforma-') || lower.includes('receipt-');
            });
            const billAttachments: SocialMessageAttachment[] = billPhotos
              .slice(0, 4)
              .map((u, idx) => ({
                id: `att_bill_${sj.id}_${idx}`,
                type: 'image' as const,
                url: u,
                name: `proforma_bill_${sj.id}_${idx + 1}.png`,
              }));
            const billText = `🧾 Laundry Bill / Proforma #${sj.proformaNumber || sj.id} sent to ${sj.customerName || 'Customer'}${sj.totalAmount ? ` (฿${Number(sj.totalAmount).toLocaleString()})` : ''}${sj.dropoffLocation ? `\n📍 ${sj.dropoffLocation}` : ''}`;
            const convId = ensureConversation(meta.billSentAt, billText);
            messages.push({
              id: billMsgId,
              conversationId: convId,
              channel: 'line',
              direction: 'outbound',
              text: billText,
              attachments: billAttachments.length > 0 ? billAttachments : undefined,
              senderName: meta.billSentBy || 'Staff (LINE OA)',
              status: 'delivered',
              deliveryMethod: 'line_api',
              createdAt: meta.billSentAt,
            });
            existingMsgIds.add(billMsgId);
            didMutate = true;
          } else {
            // Sanitize any previously synced bill message so shop paper bill photos (/bills/) are removed
            const existingBillMsg = messages.find((m) => m.id === billMsgId);
            if (existingBillMsg && Array.isArray(existingBillMsg.attachments)) {
              const cleanedAtt = existingBillMsg.attachments.filter((a) => {
                const lower = (a.url || '').toLowerCase();
                if (lower.includes('/bills/') || lower.includes('/bills-') || lower.includes('subtype=bills')) {
                  return false;
                }
                return lower.includes('proforma-') || lower.includes('receipt-');
              });
              if (cleanedAtt.length !== existingBillMsg.attachments.length) {
                existingBillMsg.attachments = cleanedAtt.length > 0 ? cleanedAtt : undefined;
                didMutate = true;
              }
            }
          }
        }

        // 2. Delivery Proof & Completion Message Sent on LINE OA (exclude any bill/proforma/receipt photos)
        if (
          meta.isDeliveryPhotoSent &&
          (!meta.deliveryPhotoSentChannel || meta.deliveryPhotoSentChannel === 'LINE OA')
        ) {
          const delivMsgId = `msg_line_job_${sj.id}`;
          const rawBillSet = new Set(parseJsonImageUrls(sj.billImageUrl));
          if (!existingMsgIds.has(delivMsgId)) {
            const delivPhotos = [
              ...parseJsonImageUrls(sj.deliveryProofImageUrl),
              ...parseJsonImageUrls(sj.proofImageUrl),
            ].filter((u) => {
              const lower = u.toLowerCase();
              if (
                lower.includes('/bills/') ||
                lower.includes('/bills-') ||
                lower.includes('subtype=bills') ||
                lower.includes('proforma-') ||
                lower.includes('receipt-') ||
                rawBillSet.has(u)
              ) {
                return false;
              }
              return true;
            });
            const uniqueDelivPhotos = Array.from(new Set(delivPhotos));
            const delivAttachments: SocialMessageAttachment[] = uniqueDelivPhotos
              .slice(0, 4)
              .map((u, idx) => ({
                id: `att_job_${sj.id}_${idx}`,
                type: 'image' as const,
                url: u,
                name: `delivery_proof_${sj.id}_${idx + 1}.jpg`,
              }));
            const sentAtIso =
              meta.deliveryPhotoSentAt || meta.deliveredAt || sj.updatedAt.toISOString();
            const dropoffText = sj.dropoffLocation ? `\n📍 Location: ${sj.dropoffLocation}` : '';
            const textBody =
              meta.deliveryPhotoSentMessageText ||
              `✨ Hello ${sj.customerName || matchedCust?.name || 'Valued Customer'},\nYour laundry order #${sj.id} has been delivered! 🧺🚚${dropoffText}\n\nThank you for choosing That Laundry Shop! 💚`;

            const convId = ensureConversation(sentAtIso, textBody);
            messages.push({
              id: delivMsgId,
              conversationId: convId,
              channel: 'line',
              direction: 'outbound',
              text: textBody,
              attachments: delivAttachments.length > 0 ? delivAttachments : undefined,
              senderName: meta.deliveryPhotoSentBy || 'LINE OA Bot',
              status: 'delivered',
              deliveryMethod: 'line_api',
              createdAt: sentAtIso,
            });
            existingMsgIds.add(delivMsgId);
            didMutate = true;
          }
        }

        // 3. Active LINE OA Order (neither bill nor delivery photo sent yet, e.g. newly booked via LINE OA today)
        if (meta.contactChannel === 'line' && !meta.isBillSent && !meta.isDeliveryPhotoSent) {
          const orderMsgId = `msg_line_order_${sj.id}`;
          if (!existingMsgIds.has(orderMsgId)) {
            const bagPhotos = [
              ...parseJsonImageUrls(sj.pickupProofImageUrl),
              ...parseJsonImageUrls(sj.bagImageUrl),
            ];
            const orderAttachments: SocialMessageAttachment[] = Array.from(new Set(bagPhotos))
              .slice(0, 3)
              .map((u, idx) => ({
                id: `att_order_${sj.id}_${idx}`,
                type: 'image' as const,
                url: u,
                name: `order_bag_${sj.id}_${idx + 1}.jpg`,
              }));
            const orderIso = sj.createdAt.toISOString();
            const orderText = `📦 Active LINE OA Order #${sj.id} (${String(sj.status || 'pending').toUpperCase()})${sj.dropoffLocation ? `\n📍 ${sj.dropoffLocation}` : ''}`;
            const convId = ensureConversation(orderIso, orderText);
            messages.push({
              id: orderMsgId,
              conversationId: convId,
              channel: 'line',
              direction: 'inbound',
              text: orderText,
              attachments: orderAttachments.length > 0 ? orderAttachments : undefined,
              senderName: displayContactName,
              status: 'delivered',
              deliveryMethod: 'line_api',
              createdAt: orderIso,
            });
            existingMsgIds.add(orderMsgId);
            didMutate = true;
          }
        }
      }
    } catch (backfillErr) {
      console.warn('[getSocialInboxDataAction] LINE job backfill non-fatal error:', backfillErr);
    }

    // Enrich conversations with latest customer data from DB
    const customerById = new Map(allCustomers.map((c) => [c.id, c]));
    const customerByPhoneKey = new Map<string, (typeof allCustomers)[0]>();
    for (const c of allCustomers) {
      const pk = normalizePhoneKey(c.phone);
      if (pk.length >= 8) customerByPhoneKey.set(pk, c);
    }

    conversations = conversations.map((conv) => {
      if (conv.externalContactId === 'U81d5e33ad54c67eaa7a761fdfa549c77') {
        return { ...conv, contactName: 'Nathan', customerName: 'NATHAN' };
      }
      let matched = conv.customerId ? customerById.get(conv.customerId) : undefined;
      if (!matched && conv.contactPhone) {
        const pk = normalizePhoneKey(conv.contactPhone);
        if (pk.length >= 8) matched = customerByPhoneKey.get(pk);
      }
      if (!matched && conv.channel === 'whatsapp' && conv.externalContactId) {
        const pk = normalizePhoneKey(conv.externalContactId);
        if (pk.length >= 8) matched = customerByPhoneKey.get(pk);
      }

      if (matched) {
        return {
          ...conv,
          customerId: matched.id,
          customerName: matched.name,
          customerMemberId: matched.memberId,
          customerWalletBalance: matched.creditBalance || 0,
          contactPhone: conv.contactPhone || matched.phone || '',
          brand: (matched.brand as any) || conv.brand || 'that_laundry_shop',
        };
      }
      return conv;
    });

    const normResult = normalizeAndSortConversations(conversations, messages);
    conversations = normResult.conversations;
    messages = normResult.messages;
    if (normResult.didClean) didMutate = true;

    if (didMutate) {
      await saveInboxStore(conversations, messages);
    }

    return {
      success: true,
      conversations,
      messages,
      config: maskSocialChannelConfigSecrets(config),
    };
  } catch (err: any) {
    console.error('[getSocialInboxDataAction] Error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to load social inbox data',
      conversations: [],
      messages: [],
      config: getDefaultChannelConfig(),
    };
  }
}

/**
 * Start a new WhatsApp Chat (or open existing WhatsApp thread for that number) directly from the platform.
 * Supports both existing CRM customers and brand-new phone numbers.
 */
export async function createWhatsAppChatAction(input: {
  phone: string;
  countryCode?: string;
  contactName?: string;
  customerId?: string | null;
  initialMessage?: string;
  branchId?: string | null;
  branchName?: string | null;
  createCrmCustomerIfNew?: boolean;
}) {
  try {
    const authUser = await assertServerActionAuthorized({
      requireWrite: true,
      forbidRoles: ['rider'],
    });

    const countryCode = input.countryCode || '66';
    const e164Phone = formatPhoneForWhatsApp(input.phone, countryCode);

    if (!e164Phone || e164Phone.length < 7) {
      return {
        success: false,
        error: 'Please enter a valid phone number for WhatsApp.',
      };
    }

    const displayPhone = formatDisplayPhone(e164Phone, countryCode);
    const config = await loadSocialChannelConfig();

    // Check if phone matches an existing CRM customer
    const phoneKey = normalizePhoneKey(e164Phone);
    const allCustomers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        nickName: true,
        phone: true,
        memberId: true,
        creditBalance: true,
        brand: true,
      },
    });

    let matchedCustomer = input.customerId
      ? allCustomers.find((c) => c.id === input.customerId)
      : allCustomers.find((c) => normalizePhoneKey(c.phone) === phoneKey);

    // Optionally create a new CRM customer if requested and not found
    if (!matchedCustomer && input.createCrmCustomerIfNew && input.contactName?.trim()) {
      const localPhone = e164Phone.startsWith('66') ? `0${e164Phone.slice(2)}` : `+${e164Phone}`;
      const createdCust = await prisma.customer.create({
        data: {
          name: input.contactName.trim(),
          phone: localPhone,
          branchId: input.branchId || authUser.branchId || 'ONLINE',
          brand: 'that_laundry_shop',
        },
      });
      matchedCustomer = {
        id: createdCust.id,
        name: createdCust.name,
        nickName: createdCust.nickName,
        phone: createdCust.phone,
        memberId: createdCust.memberId,
        creditBalance: createdCust.creditBalance,
        brand: createdCust.brand,
      };
    }

    const nowIso = new Date().toISOString();
    const resolvedName =
      input.contactName?.trim() ||
      matchedCustomer?.name ||
      displayPhone ||
      `WhatsApp +${e164Phone}`;

    // Check if a WhatsApp conversation already exists for this phone or customer
    const existingConv = await findSocialConversationForContact({
      channel: 'whatsapp',
      externalContactId: e164Phone,
      contactPhone: displayPhone,
      customerId: matchedCustomer?.id,
    });

    let conversation: SocialConversation;

    if (existingConv) {
      conversation = {
        ...existingConv,
        externalContactId: e164Phone,
        contactName: resolvedName || existingConv.contactName,
        contactPhone: displayPhone,
        contactHandle: `+${e164Phone}`,
        customerId: matchedCustomer?.id || existingConv.customerId || null,
        customerName: matchedCustomer?.name || existingConv.customerName || null,
        customerMemberId:
          matchedCustomer?.memberId || existingConv.customerMemberId || null,
        customerWalletBalance:
          matchedCustomer?.creditBalance ?? existingConv.customerWalletBalance ?? 0,
        status: 'open',
        updatedAt: nowIso,
      };
    } else {
      conversation = {
        id: `conv_wa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        channel: 'whatsapp',
        externalContactId: e164Phone,
        contactName: resolvedName,
        contactPhone: displayPhone,
        contactHandle: `+${e164Phone}`,
        customerId: matchedCustomer?.id || null,
        customerName: matchedCustomer?.name || null,
        customerMemberId: matchedCustomer?.memberId || null,
        customerWalletBalance: matchedCustomer?.creditBalance || 0,
        brand: (matchedCustomer?.brand as any) || 'that_laundry_shop',
        branchId: input.branchId || authUser.branchId || null,
        branchName: input.branchName || null,
        status: 'open',
        unreadCount: 0,
        tags: ['WhatsApp Direct'],
        lastMessageText: input.initialMessage?.trim() || 'Started new WhatsApp conversation',
        lastMessageAt: nowIso,
        lastMessageDirection: 'outbound',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    let createdMessage: SocialMessage | null = null;
    const msgText = (input.initialMessage || '').trim();

    if (msgText) {
      let deliveryMethod: SocialMessage['deliveryMethod'] = 'whatsapp_web_bridge';
      let status: SocialMessage['status'] = 'sent';
      let externalMessageId: string | undefined;
      let externalError: string | undefined;

      const waCreds = resolveWhatsAppCloudCredentials(config.whatsapp);
      const preferCloudApi = config.whatsapp.mode === 'cloud_api' && waCreds.isConfigured;

      // Priority 1: If Meta WhatsApp Business Cloud API is active and configured, dispatch via Official Graph API
      if (preferCloudApi) {
        const cloudSend = await sendWhatsAppCloudApiMessage({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          toPhoneE164: e164Phone,
          customerName: conversation.customerName || conversation.contactName,
          text: msgText,
        });
        if (cloudSend.delivered) {
          deliveryMethod = 'whatsapp_cloud_api';
          status = 'delivered';
          externalMessageId = cloudSend.externalMessageId;
        } else {
          externalError = cloudSend.error;
        }
      }

      // Priority 2: If Direct WhatsApp QR Link (Linked Devices) is connected and message not yet delivered, send directly!
      if (status !== 'delivered') {
        const waQr = await getWhatsAppQrStatusAsync();
        if (waQr.status === 'connected' || waQr.status === 'connecting') {
          const qrSendRes = await sendDirectWhatsAppQrMessage({
            phone: e164Phone,
            countryCode,
            text: msgText,
          });
          if (qrSendRes.ok) {
            deliveryMethod = 'whatsapp_gateway_api';
            status = 'delivered';
            externalError = undefined;
          }
        }
      }

      // Priority 3: Fallback to Cloud API if configured even if mode was not explicitly set to cloud_api
      if (status !== 'delivered' && !preferCloudApi && waCreds.isConfigured) {
        const cloudSend = await sendWhatsAppCloudApiMessage({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          toPhoneE164: e164Phone,
          customerName: conversation.customerName || conversation.contactName,
          text: msgText,
        });
        if (cloudSend.delivered) {
          deliveryMethod = 'whatsapp_cloud_api';
          status = 'delivered';
          externalMessageId = cloudSend.externalMessageId;
          externalError = undefined;
        }
      }

      createdMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: conversation.id,
        channel: 'whatsapp',
        direction: 'outbound',
        text: msgText,
        senderName: authUser.name || authUser.email?.split('@')[0] || 'Staff',
        senderId: authUser.id,
        senderRole: authUser.role,
        status,
        deliveryMethod,
        externalMessageId,
        externalError,
        createdAt: nowIso,
      };

      conversation.lastMessageText = msgText;
      conversation.lastMessageAt = nowIso;
      conversation.lastMessageDirection = 'outbound';
    }

    if (createdMessage) {
      const committed = await insertSocialMessageAndTouchConversation({
        message: createdMessage,
        conversation,
        incrementUnread: false,
      });
      conversation = committed.conversation;
      createdMessage = committed.message;
    } else {
      const upserted = await upsertSocialConversationRow(conversation, true);
      conversation = upserted.conversation;
    }

    const [conversations, messages] = await Promise.all([
      querySocialConversations(1000),
      queryConversationMessages(conversation.id, 500),
    ]);

    const whatsappUrl = buildWhatsAppUrl(e164Phone, msgText, countryCode);

    return {
      success: true,
      conversation,
      message: createdMessage,
      whatsappUrl,
      conversations,
      messages,
    };
  } catch (err: any) {
    console.error('[createWhatsAppChatAction] Error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to start WhatsApp chat',
    };
  }
}

/**
 * Start a new chat on any social channel (LINE OA, Facebook Messenger, Instagram, Telegram, WeChat, WhatsApp)
 */
export async function createMultiChannelChatAction(input: {
  channel: SocialChannel;
  externalContactId: string;
  contactName: string;
  contactPhone?: string;
  customerId?: string | null;
  initialMessage?: string;
  branchId?: string | null;
}) {
  try {
    const authUser = await assertServerActionAuthorized({
      requireWrite: true,
      forbidRoles: ['rider'],
    });

    if (input.channel === 'whatsapp') {
      return createWhatsAppChatAction({
        phone: input.externalContactId || input.contactPhone || '',
        contactName: input.contactName,
        customerId: input.customerId,
        initialMessage: input.initialMessage,
        branchId: input.branchId,
      });
    }

    const extId = (input.externalContactId || '').trim();
    const name = (input.contactName || '').trim() || extId;
    if (!extId && !name) {
      return { success: false, error: 'Please provide a contact handle/ID or customer name.' };
    }

    const nowIso = new Date().toISOString();

    let matchedCust = null;
    if (input.customerId) {
      matchedCust = await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          memberId: true,
          lineId: true,
          creditBalance: true,
          brand: true,
        },
      });
    }

    const resolvedExtId = extId || matchedCust?.lineId || `social_${Date.now()}`;
    const existingConv = await findSocialConversationForContact({
      channel: input.channel,
      externalContactId: resolvedExtId,
      customerId: matchedCust?.id,
    });

    let conversation: SocialConversation;
    if (existingConv) {
      conversation = {
        ...existingConv,
        contactName: name || existingConv.contactName,
        status: 'open',
        updatedAt: nowIso,
      };
    } else {
      conversation = {
        id: `conv_${input.channel}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        channel: input.channel,
        externalContactId: resolvedExtId,
        contactName: name || matchedCust?.name || 'Customer',
        contactPhone: input.contactPhone || matchedCust?.phone || '',
        contactHandle: resolvedExtId,
        customerId: matchedCust?.id || null,
        customerName: matchedCust?.name || null,
        customerMemberId: matchedCust?.memberId || null,
        customerWalletBalance: matchedCust?.creditBalance || 0,
        brand: (matchedCust?.brand as any) || 'that_laundry_shop',
        branchId: input.branchId || authUser.branchId || null,
        status: 'open',
        unreadCount: 0,
        lastMessageText: input.initialMessage?.trim() || `Started ${input.channel.toUpperCase()} chat`,
        lastMessageAt: nowIso,
        lastMessageDirection: 'outbound',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    const msgText = (input.initialMessage || '').trim();
    let createdMsg: SocialMessage | null = null;
    if (msgText) {
      let deliveryMethod: SocialMessage['deliveryMethod'] = 'social_api';
      let status: SocialMessage['status'] = 'sent';
      let externalError: string | undefined;

      // If LINE OA and valid U-userId / C-groupId / R-roomId, push message via real LINE Messaging API!
      if (input.channel === 'line' && isValidLineTargetId(conversation.externalContactId)) {
        const lineSettings = await getStoredLineOaSettings(conversation.brand);
        if (lineSettings.channelAccessToken) {
          const pushRes = await sendLinePushMessage(
            lineSettings.channelAccessToken,
            conversation.externalContactId,
            [{ type: 'text', text: msgText }]
          );
          deliveryMethod = 'line_api';
          if (pushRes.ok) {
            status = 'delivered';
          } else {
            externalError = pushRes.error;
          }
        }
      }

      createdMsg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: conversation.id,
        channel: input.channel,
        direction: 'outbound',
        text: msgText,
        senderName: authUser.name || authUser.email?.split('@')[0] || 'Staff',
        senderId: authUser.id,
        senderRole: authUser.role,
        status,
        deliveryMethod,
        externalError,
        createdAt: nowIso,
      };

      conversation.lastMessageText = msgText;
      conversation.lastMessageAt = nowIso;
    }

    if (createdMsg) {
      const committed = await insertSocialMessageAndTouchConversation({
        message: createdMsg,
        conversation,
        incrementUnread: false,
      });
      conversation = committed.conversation;
    } else {
      const upserted = await upsertSocialConversationRow(conversation, true);
      conversation = upserted.conversation;
    }

    const [conversations, messages] = await Promise.all([
      querySocialConversations(1000),
      queryConversationMessages(conversation.id, 500),
    ]);

    return {
      success: true,
      conversation,
      conversations,
      messages,
    };
  } catch (err: any) {
    console.error('[createMultiChannelChatAction] Error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to create conversation',
    };
  }
}

/**
 * Send a message in an active conversation across any channel (WhatsApp, LINE OA, Messenger, IG, Telegram)
 * Dispatches LIVE via each platform's real API or direct native/web bridge.
 */
export async function sendSocialMessageAction(input: {
  conversationId: string;
  text: string;
  attachments?: SocialMessageAttachment[];
  replyTo?: SocialMessageReplyRef;
  emailSubject?: string;
}) {
  try {
    const text = (input.text || '').trim();
    const attachments = input.attachments || [];
    if (!text && attachments.length === 0) {
      return { success: false, error: 'Message cannot be empty.' };
    }

    const [authUser, conv, config] = await Promise.all([
      assertServerActionAuthorized({
        requireWrite: true,
        forbidRoles: ['rider'],
      }),
      findSocialConversationById(input.conversationId),
      loadSocialChannelConfig(),
    ]);

    if (!conv) {
      return { success: false, error: 'Conversation not found.' };
    }

    const nowIso = new Date().toISOString();

    // Format text with reply quote if replying to a specific message
    const outboundTextWithQuote =
      input.replyTo && text
        ? `↩️ "${input.replyTo.text.slice(0, 80)}${input.replyTo.text.length > 80 ? '...' : ''}"\n${text}`
        : text;

    const waCreds = resolveWhatsAppCloudCredentials(config.whatsapp);
    // Always check QR Linked Device status even when Cloud API is active so Dual-Sync
    // (Cloud API + Linked WhatsApp QR Bridge) works seamlessly without disabling QR!
    const waQr =
      conv.channel === 'whatsapp'
        ? await getWhatsAppQrStatusAsync(true)
        : { status: 'disconnected' as const };
    const useWaCloudApi =
      conv.channel === 'whatsapp' &&
      waCreds.isConfigured &&
      (config.whatsapp.mode === 'cloud_api' ||
        !(waQr.status === 'connected' || waQr.status === 'connecting'));

    const hasQrLinked =
      conv.channel === 'whatsapp' &&
      !useWaCloudApi &&
      (waQr.status === 'connected' || waQr.status === 'connecting');

    // Resolve public HTTPS URLs for any image, video & file attachments when needed by external HTTP APIs
    const resolvedImageUrls: string[] = [];
    const resolvedVideoAttachments: Array<{ url: string; previewUrl?: string; name?: string }> = [];
    const resolvedFileAttachments: Array<{ url: string; name?: string }> = [];
    if ((!hasQrLinked || useWaCloudApi) && attachments.length > 0) {
      for (const att of attachments) {
        if (att.type === 'image' && att.url) {
          const httpsUrl = await resolvePublicHttpsImageUrl(att.url);
          if (httpsUrl) {
            resolvedImageUrls.push(httpsUrl);
          }
        } else if (att.type === 'video' && att.url) {
          const httpsUrl = await resolvePublicHttpsImageUrl(att.url);
          const httpsPreview = att.previewUrl
            ? await resolvePublicHttpsImageUrl(att.previewUrl)
            : undefined;
          if (httpsUrl) {
            resolvedVideoAttachments.push({
              url: httpsUrl,
              previewUrl: httpsPreview || undefined,
              name: att.name,
            });
          }
        } else if (att.type === 'file' && att.url) {
          const httpsUrl = await resolvePublicHttpsImageUrl(att.url);
          if (httpsUrl) {
            resolvedFileAttachments.push({ url: httpsUrl, name: att.name });
          }
        }
      }
    }

    let deliveryMethod: SocialMessage['deliveryMethod'] = 'platform_log';
    let status: SocialMessage['status'] = 'sent';
    let externalMessageId: string | undefined;
    let externalError: string | undefined;
    let whatsappUrl: string | undefined;
    let whatsappWebUrl: string | undefined;
    let whatsappProtocolUrl: string | undefined;
    let pendingWaQrPromise: Promise<{ ok: boolean; error?: string }> | null = null;

    // 1. Real LINE OA API Delivery (@thatlaundryshop & @050ehvzb)
    if (conv.channel === 'line') {
      deliveryMethod = 'line_api';
      if (isValidLineTargetId(conv.externalContactId)) {
        const lineSettings = await getStoredLineOaSettings(conv.brand);
        if (lineSettings.channelAccessToken) {
          const lineMsgs: LineMessageObject[] = [];
          const fallbackVideoLinks = resolvedVideoAttachments
            .filter((v) => !v.previewUrl)
            .map((v) => `🎥 ${v.name || 'Video'}: ${v.url}`);
          const fileLinksText = [
            ...fallbackVideoLinks,
            ...resolvedFileAttachments.map((f) => `📎 ${f.name || 'Document'}: ${f.url}`),
          ].join('\n');
          const combinedLineText = [outboundTextWithQuote, fileLinksText]
            .filter(Boolean)
            .join('\n\n');
          if (combinedLineText) {
            lineMsgs.push({ type: 'text', text: combinedLineText });
          }
          for (const httpsImg of resolvedImageUrls.slice(0, 4)) {
            lineMsgs.push({
              type: 'image',
              originalContentUrl: httpsImg,
              previewImageUrl: httpsImg,
            });
          }
          for (const vid of resolvedVideoAttachments.filter((v) => Boolean(v.previewUrl)).slice(0, 4)) {
            lineMsgs.push({
              type: 'video',
              originalContentUrl: vid.url,
              previewImageUrl: vid.previewUrl!,
            });
          }
          if (lineMsgs.length > 0) {
            const pushRes = await sendLinePushMessage(
              lineSettings.channelAccessToken,
              conv.externalContactId,
              lineMsgs
            );
            if (pushRes.ok) {
              status = 'delivered';
            } else {
              externalError = pushRes.error;
            }
          }
        }
      }
    }
    // 2. WhatsApp Live Delivery (Cloud API, Self-Hosted/QR Gateway API, or Live Web/App Bridge)
    else if (conv.channel === 'whatsapp') {
      const targetPhone = conv.externalContactId || conv.contactPhone || '';
      const cc = config.whatsapp.defaultCountryCode || '66';
      const e164 = formatPhoneForWhatsApp(targetPhone, cc);
      const waBody =
        resolvedImageUrls.length > 0 && outboundTextWithQuote
          ? `${outboundTextWithQuote}\n\n📷 Photo: ${resolvedImageUrls.join('\n')}`
          : resolvedImageUrls.length > 0
          ? `📷 Photo: ${resolvedImageUrls.join('\n')}`
          : outboundTextWithQuote;

      whatsappUrl = buildWhatsAppUrl(targetPhone, waBody, cc);
      whatsappWebUrl = buildWhatsAppWebUrl(targetPhone, waBody, cc);
      whatsappProtocolUrl = buildWhatsAppProtocolUrl(targetPhone, waBody, cc);

      // Mode A: Official Meta WhatsApp Business Cloud API (Priority when cloud_api is selected or configured)
      if (useWaCloudApi) {
        deliveryMethod = 'whatsapp_cloud_api';
        const targetReplyMsg = input.replyTo?.messageId
          ? await prisma.socialMessage.findUnique({
              where: { id: input.replyTo.messageId },
              select: { externalMessageId: true },
            })
          : null;
        const replyWamid = targetReplyMsg?.externalMessageId?.startsWith('wamid.')
          ? targetReplyMsg.externalMessageId
          : undefined;

        const cloudSend = await sendWhatsAppCloudApiMessage({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          toPhoneE164: e164,
          customerName: conv.customerName || conv.contactName,
          text: replyWamid ? text : outboundTextWithQuote,
          resolvedImageUrls,
          videoAttachments: resolvedVideoAttachments,
          fileAttachments: resolvedFileAttachments,
          replyToExternalMessageId: replyWamid,
        });

        if (cloudSend.delivered) {
          status = 'delivered';
          externalMessageId = cloudSend.externalMessageId;
        } else {
          externalError = cloudSend.error;
        }
      }

      // Mode 0: Built-in Direct WhatsApp QR Link (Linked Devices — 100% Free & 2-Way Sync)
      if (
        status !== 'delivered' &&
        (hasQrLinked || (waQr.status === 'connected' || waQr.status === 'connecting'))
      ) {
        deliveryMethod = 'whatsapp_gateway_api';
        status = 'delivered';
        externalError = undefined;
        // Launch WhatsApp socket send concurrently with DB save below for minimum latency
        pendingWaQrPromise = sendDirectWhatsAppQrMessage({
          phone: targetPhone,
          countryCode: cc,
          text: outboundTextWithQuote,
          attachments,
        });
      }

      // Fallback to Cloud API if QR was attempted first and Cloud API is available
      if (status !== 'delivered' && !useWaCloudApi && waCreds.isConfigured) {
        deliveryMethod = 'whatsapp_cloud_api';
        const cloudSend = await sendWhatsAppCloudApiMessage({
          phoneNumberId: waCreds.phoneNumberId,
          accessToken: waCreds.accessToken,
          toPhoneE164: e164,
          text: outboundTextWithQuote,
          resolvedImageUrls,
          videoAttachments: resolvedVideoAttachments,
          fileAttachments: resolvedFileAttachments,
        });
        if (cloudSend.delivered) {
          status = 'delivered';
          externalMessageId = cloudSend.externalMessageId;
        } else {
          externalError = cloudSend.error;
          deliveryMethod = 'whatsapp_web_bridge';
        }
      }
      // Mode B: Custom WhatsApp QR / REST Gateway API (WAHA / Evolution / Baileys / UltraMsg)
      else if (
        status !== 'delivered' &&
        config.whatsapp.mode === 'gateway_api' &&
        config.whatsapp.gatewayUrl?.trim() &&
        isSafeExternalHttpUrl(config.whatsapp.gatewayUrl)
      ) {
        deliveryMethod = 'whatsapp_gateway_api';
        try {
          const gwHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (config.whatsapp.gatewayApiKey?.trim()) {
            gwHeaders['Authorization'] = `Bearer ${config.whatsapp.gatewayApiKey.trim()}`;
            gwHeaders['X-Api-Key'] = config.whatsapp.gatewayApiKey.trim();
            gwHeaders['apikey'] = config.whatsapp.gatewayApiKey.trim();
          }
          const gwRes = await fetch(config.whatsapp.gatewayUrl.trim(), {
            method: 'POST',
            headers: gwHeaders,
            body: JSON.stringify({
              session: config.whatsapp.gatewayInstanceId || 'default',
              instanceId: config.whatsapp.gatewayInstanceId || 'default',
              phone: e164,
              chatId: `${e164}@c.us`,
              to: e164,
              text: outboundTextWithQuote || '[Image]',
              body: outboundTextWithQuote || '[Image]',
              imageUrl: resolvedImageUrls[0] || undefined,
            }),
          });
          if (gwRes.ok) {
            status = 'delivered';
          } else {
            deliveryMethod = 'whatsapp_web_bridge';
            status = 'delivered';
          }
        } catch {
          deliveryMethod = 'whatsapp_web_bridge';
          status = 'delivered';
        }
      }
      // Mode C: Live WhatsApp Web / Native App Bridge (only if QR is NOT linked and not already delivered)
      else if (status !== 'delivered' && !hasQrLinked) {
        deliveryMethod = 'whatsapp_web_bridge';
        status = 'delivered';
      }
    }
    // 3. Facebook Messenger & Instagram Direct Live Delivery via Meta Graph API
    else if (conv.channel === 'facebook' || conv.channel === 'instagram') {
      const token =
        conv.channel === 'facebook'
          ? config.facebook.pageAccessToken?.trim()
          : config.instagram.accessToken?.trim() || config.facebook.pageAccessToken?.trim();

      if (token && conv.externalContactId && !conv.externalContactId.startsWith('@')) {
        deliveryMethod = 'meta_graph_api';
        try {
          const endpoint = `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(
            token
          )}`;
          if (outboundTextWithQuote) {
            const fbRes = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: conv.externalContactId },
                messaging_type: 'RESPONSE',
                message: { text: outboundTextWithQuote },
              }),
            });
            if (fbRes.ok) {
              status = 'delivered';
            } else {
              const errData = await fbRes.json().catch(() => ({}));
              externalError = errData?.error?.message;
            }
          }
          for (const httpsImg of resolvedImageUrls) {
            const imgRes = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: conv.externalContactId },
                messaging_type: 'RESPONSE',
                message: {
                  attachment: {
                    type: 'image',
                    payload: { url: httpsImg, is_reusable: true },
                  },
                },
              }),
            });
            if (imgRes.ok) status = 'delivered';
          }
        } catch (err: any) {
          externalError = err?.message;
        }
      } else {
        deliveryMethod = 'social_api';
        status = 'delivered';
      }
    }
    // 5. Gmail / Email Live Delivery via SMTP
    else if (conv.channel === 'email') {
      deliveryMethod = 'gmail_smtp';
      const customSubj = (input.emailSubject || '').trim();
      const rawLastSubj = (conv.lastMessageText || '').match(/^📧\s+([^\n]+)/)?.[1]?.trim();
      const replySubject = customSubj
        ? customSubj
        : rawLastSubj
        ? rawLastSubj.toLowerCase().startsWith('re:')
          ? rawLastSubj
          : `Re: ${rawLastSubj}`
        : `Re: That Laundry Shop`;
      const allMailAttachments = [
        ...resolvedImageUrls.map((url, idx) => ({ url, name: `photo-${idx + 1}.jpg` })),
        ...resolvedVideoAttachments.map((v, idx) => ({ url: v.url, name: v.name || `video-${idx + 1}.mp4` })),
        ...resolvedFileAttachments.map((f, idx) => ({ url: f.url, name: f.name || `file-${idx + 1}` })),
      ];
      const mailRes = await sendGmailReply({
        emailCfg: config.email,
        toEmail: conv.externalContactId,
        subject: replySubject,
        text: outboundTextWithQuote || 'Please see attached.',
        attachments: allMailAttachments,
      });
      if (mailRes.ok) {
        status = 'delivered';
        externalMessageId = mailRes.externalMessageId;
      } else {
        status = 'failed';
        externalError = mailRes.error;
      }
    }
    // 4. Telegram Live Delivery via Telegram Bot API
    else if (conv.channel === 'telegram') {
      const botToken = config.telegram.botToken?.trim();
      if (botToken && conv.externalContactId) {
        deliveryMethod = 'telegram_bot_api';
        try {
          const chatId = conv.externalContactId;
          if (outboundTextWithQuote) {
            const tgRes = await fetch(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: outboundTextWithQuote,
                }),
              }
            );
            if (tgRes.ok) {
              status = 'delivered';
            } else {
              const errData = await tgRes.json().catch(() => ({}));
              externalError = errData?.description;
            }
          }
          for (const httpsImg of resolvedImageUrls) {
            const photoRes = await fetch(
              `https://api.telegram.org/bot${botToken}/sendPhoto`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  photo: httpsImg,
                }),
              }
            );
            if (photoRes.ok) status = 'delivered';
          }
        } catch (err: any) {
          externalError = err?.message;
        }
      } else {
        deliveryMethod = 'social_api';
        status = 'delivered';
      }
    }
    // 5. Other Social Channels
    else {
      deliveryMethod = 'social_api';
      status = 'delivered';
    }

    const newMsg: SocialMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conv.id,
      channel: conv.channel,
      direction: 'outbound',
      text: text || (attachments.length > 0 ? '📷 [Sent Photo / Attachment]' : ''),
      attachments: attachments.length > 0 ? attachments : undefined,
      replyTo: input.replyTo,
      senderName: authUser.name || authUser.email?.split('@')[0] || 'Staff',
      senderId: authUser.id,
      senderRole: authUser.role,
      status,
      deliveryMethod,
      externalMessageId,
      externalError,
      createdAt: nowIso,
    };

    const updatedConv: SocialConversation = {
      ...conv,
      lastMessageText: newMsg.text,
      lastMessageAt: nowIso,
      lastMessageDirection: 'outbound',
      unreadCount: 0,
      status: conv.status === 'resolved' ? 'open' : conv.status,
      updatedAt: nowIso,
    };

    let committed = await insertSocialMessageAndTouchConversation({
      message: newMsg,
      conversation: updatedConv,
      incrementUnread: false,
    });

    if (pendingWaQrPromise) {
      const qrRes = await pendingWaQrPromise;
      if (!qrRes.ok) {
        await prisma.socialMessage.update({
          where: { id: committed.message.id },
          data: { status: 'failed', externalError: qrRes.error || 'WhatsApp QR send failed' },
        });
        const v = await bumpSocialStoreVersion();
        committed = {
          ...committed,
          message: { ...committed.message, status: 'failed', externalError: qrRes.error },
          version: v,
        };
      }
    }

    try {
      const { publishOrderEvent } = await import('@/lib/realtime-bus');
      await publishOrderEvent({
        type: 'social.updated',
        jobId: `__SOCIAL_OUT_${committed.message.id}`,
        updatedAt: new Date(),
        socialPayload: {
          kind: 'message',
          conversation: committed.conversation,
          message: committed.message,
          version: committed.version,
        },
      });
    } catch {}

    return {
      success: true,
      message: committed.message,
      conversation: committed.conversation,
      whatsappUrl,
      whatsappWebUrl,
      whatsappProtocolUrl,
    };
  } catch (err: any) {
    console.error('[sendSocialMessageAction] Error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to send message',
    };
  }
}

/**
 * Record an incoming message from customer test simulation in Social Inbox UI (staff-only)
 */
export async function recordInboundSocialMessageAction(input: {
  channel: SocialChannel;
  externalContactId: string;
  contactName?: string;
  contactPhone?: string;
  contactAvatar?: string;
  text: string;
  attachments?: SocialMessageAttachment[];
  customerId?: string | null;
}) {
  try {
    await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });
    return await recordInboundSocialMessageInternal(input);
  } catch (err: any) {
    console.error('[recordInboundSocialMessageAction] Error:', err);
    return { success: false, error: err?.message || 'Unauthorized' };
  }
}

/**
 * Update conversation status (open/resolved/pending), mark as read, link CRM customer, or update tags
 */
export async function updateSocialConversationAction(input: {
  conversationId: string;
  status?: 'open' | 'pending' | 'resolved';
  markAsRead?: boolean;
  customerId?: string | null;
  contactPhone?: string;
  contactName?: string;
  tags?: string[];
  notes?: string;
}): Promise<{
  success: boolean;
  version?: string;
  conversation?: SocialConversation;
  conversations?: SocialConversation[];
  error?: string;
}> {
  try {
    const authUser = await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    const readerName = authUser.name || authUser.email || 'Staff';

    const existing = await findSocialConversationById(input.conversationId);
    if (!existing) {
      return { success: false, error: 'Conversation not found' };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const conv: SocialConversation = { ...existing };
    const wasUnread = (existing.unreadCount || 0) > 0;
    const shouldRecordFirstReader = Boolean(
      input.markAsRead && (wasUnread || !existing.lastReadByName)
    );
    const hasMetadataEdit =
      input.status !== undefined ||
      input.customerId !== undefined ||
      input.contactPhone !== undefined ||
      input.contactName !== undefined ||
      input.tags !== undefined ||
      input.notes !== undefined;

    if (input.status) conv.status = input.status;
    if (input.markAsRead) {
      conv.unreadCount = 0;
      if (shouldRecordFirstReader) {
        conv.lastReadAt = nowIso;
        conv.lastReadById = authUser.id;
        conv.lastReadByName = readerName;
      } else if (!conv.lastReadAt) {
        conv.lastReadAt = nowIso;
      }
      recordSocialReadWatermark(conv.id, conv.channel, conv.externalContactId, nowMs);
    }
    if (input.contactName !== undefined) conv.contactName = input.contactName;
    if (input.contactPhone !== undefined) conv.contactPhone = input.contactPhone;
    if (input.tags !== undefined) conv.tags = input.tags;
    if (input.notes !== undefined) conv.notes = input.notes;

    if (input.customerId !== undefined) {
      conv.customerId = input.customerId;
      if (input.customerId) {
        const cust = await prisma.customer.findUnique({
          where: { id: input.customerId },
          select: {
            id: true,
            name: true,
            phone: true,
            memberId: true,
            creditBalance: true,
            brand: true,
          },
        });
        if (cust) {
          conv.customerName = cust.name;
          conv.customerMemberId = cust.memberId;
          conv.customerWalletBalance = cust.creditBalance || 0;
          if (!conv.contactPhone && cust.phone) conv.contactPhone = cust.phone;
          if (conv.channel === 'line' && isValidLineUserId(conv.externalContactId)) {
            await prisma.customer.update({
              where: { id: cust.id },
              data: { lineId: conv.externalContactId },
            });
          }
        }
      } else {
        conv.customerName = null;
        conv.customerMemberId = null;
      }
    }

    conv.updatedAt = nowIso;

    if (input.markAsRead && conv.externalContactId) {
      await prisma.socialConversation.updateMany({
        where: {
          channel: conv.channel,
          externalContactId: conv.externalContactId,
          unreadCount: { gt: 0 },
        },
        data: {
          unreadCount: 0,
          lastReadAt: new Date(nowMs),
          lastReadById: authUser.id,
          lastReadByName: readerName,
          updatedAt: new Date(nowMs),
        },
      });
    }

    const upserted = await upsertSocialConversationRow(conv, true);
    const version = upserted.version || (await getSocialStoreVersion());

    if (wasUnread && input.markAsRead) {
      void prisma.activityLog
        .create({
          data: {
            entityId: conv.id,
            entityType: 'social_conversation',
            action: 'SOCIAL_CHAT_READ',
            userId: authUser.id,
            userName: readerName,
            details: JSON.stringify({
              channel: conv.channel,
              contactName: conv.contactName,
              contactPhone: conv.contactPhone || conv.externalContactId,
              previousUnreadCount: existing.unreadCount,
              lastMessageText: existing.lastMessageText,
              readAt: nowIso,
            }),
          },
        })
        .catch(() => {});
    }

    if (input.markAsRead && conv.channel === 'email') {
      loadSocialChannelConfig()
        .then((currentCfg) => {
          if (currentCfg?.email?.enabled) {
            return markGmailEmailsAsReadBySender(
              currentCfg.email,
              conv.externalContactId,
              conv.contactName
            );
          }
        })
        .catch(() => {});
    }

    if (input.markAsRead && conv.channel === 'whatsapp') {
      markWhatsAppChatReadOnDevice(conv.externalContactId || conv.contactPhone).catch(() => {});

      loadSocialChannelConfig()
        .then(async (currentCfg) => {
          const waCreds = resolveWhatsAppCloudCredentials(currentCfg?.whatsapp);
          if (!waCreds.isConfigured) return;
          const latestInbound = await prisma.socialMessage.findFirst({
            where: {
              conversationId: conv.id,
              direction: 'inbound',
              externalMessageId: { startsWith: 'wamid.' },
            },
            orderBy: { createdAt: 'desc' },
            select: { externalMessageId: true },
          });
          if (latestInbound?.externalMessageId) {
            markWhatsAppCloudMessageAsRead({
              phoneNumberId: waCreds.phoneNumberId,
              accessToken: waCreds.accessToken,
              externalMessageId: latestInbound.externalMessageId,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    try {
      const { publishOrderEvent } = await import('@/lib/realtime-bus');
      await publishOrderEvent({
        type: 'social.updated',
        jobId: `__SOCIAL_CONV_${conv.id}_${nowMs}`,
        updatedAt: new Date(nowMs),
        socialPayload: input.markAsRead && !hasMetadataEdit
          ? {
              kind: 'read',
              readConversationIds: [conv.id],
              readById: upserted.conversation.lastReadById,
              readByName: upserted.conversation.lastReadByName,
              readAt: upserted.conversation.lastReadAt,
              channel: conv.channel,
              version,
            }
          : { kind: 'message', conversation: upserted.conversation, version },
      });
    } catch {}

    const conversations = hasMetadataEdit ? await querySocialConversations(1000) : undefined;

    return {
      success: true,
      version,
      conversation: upserted.conversation,
      conversations,
    };
  } catch (err: any) {
    console.error('[updateSocialConversationAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to update conversation' };
  }
}

/**
 * Mark all unread conversations in the selected channel (or all channels) as read
 */
export async function markAllSocialConversationsAsReadAction(
  channel: SocialChannel | 'all' = 'all'
): Promise<{
  success: boolean;
  version?: string;
  clearedCount?: number;
  conversations?: SocialConversation[];
  error?: string;
}> {
  try {
    const authUser = await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    const readerName = authUser.name || authUser.email || 'Staff';

    const { clearedCount, version } = await markSocialConversationsReadInDb({
      channel,
      actorId: authUser.id,
      actorName: readerName,
    });
    const conversations = await querySocialConversations(1000);

    if (clearedCount > 0) {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      void prisma.activityLog
        .create({
          data: {
            entityId: `read_all_${channel}`,
            entityType: 'social_conversation',
            action: 'SOCIAL_CHAT_READ_ALL',
            userId: authUser.id,
            userName: readerName,
            details: JSON.stringify({
              channel,
              clearedCount,
              readAt: nowIso,
            }),
          },
        })
        .catch(() => {});
      try {
        const { publishOrderEvent } = await import('@/lib/realtime-bus');
        await publishOrderEvent({
          type: 'social.updated',
          jobId: `__SOCIAL_READALL_${channel}_${nowMs}`,
          updatedAt: new Date(nowMs),
          socialPayload: {
            kind: 'read_all',
            channel,
            readById: authUser.id,
            readByName: readerName,
            readAt: nowIso,
            version,
          },
        });
      } catch {}
    }

    return {
      success: true,
      version,
      clearedCount,
      conversations,
    };
  } catch (err: any) {
    console.error('[markAllSocialConversationsAsReadAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to mark all conversations as read' };
  }
}

/**
 * Delete a conversation thread and its messages
 */
export async function deleteSocialConversationAction(conversationId: string) {
  try {
    await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });

    await deleteSocialConversationAndMessages(conversationId);
    const [conversations, messages] = await Promise.all([
      querySocialConversations(1000),
      queryRecentSocialMessages(250),
    ]);
    return {
      success: true,
      conversations,
      messages,
    };
  } catch (err: any) {
    console.error('[deleteSocialConversationAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to delete conversation' };
  }
}

/**
 * Save Omnichannel Social Configuration (WhatsApp Cloud API / Bridge, LINE OA, Messenger, Instagram, Telegram)
 */
export async function saveSocialChannelConfigAction(newConfig: SocialChannelConfig) {
  try {
    await assertServerActionAuthorized({ requireWrite: true, requireAdmin: true });

    if (newConfig?.whatsapp?.gatewayUrl && !isSafeExternalHttpUrl(newConfig.whatsapp.gatewayUrl)) {
      return {
        success: false,
        error: 'Invalid gateway URL: private, loopback, or internal network addresses are not permitted.',
      };
    }

    const existingConfig = await loadSocialChannelConfig(true);
    const resolveSecret = (incoming?: string | null, current?: string | null): string => {
      const s = (incoming ?? '').trim();
      if (!s || s.includes('••••')) return current || '';
      return s;
    };

    const mergedConfig: SocialChannelConfig = {
      ...newConfig,
      whatsapp: {
        ...newConfig.whatsapp,
        accessToken: resolveSecret(newConfig.whatsapp?.accessToken, existingConfig.whatsapp?.accessToken),
        appSecret: resolveSecret(newConfig.whatsapp?.appSecret, existingConfig.whatsapp?.appSecret),
        gatewayApiKey: resolveSecret(newConfig.whatsapp?.gatewayApiKey, existingConfig.whatsapp?.gatewayApiKey),
      },
      facebook: {
        ...newConfig.facebook,
        pageAccessToken: resolveSecret(newConfig.facebook?.pageAccessToken, existingConfig.facebook?.pageAccessToken),
      },
      instagram: {
        ...newConfig.instagram,
        accessToken: resolveSecret(newConfig.instagram?.accessToken, existingConfig.instagram?.accessToken),
      },
      telegram: {
        ...newConfig.telegram,
        botToken: resolveSecret(newConfig.telegram?.botToken, existingConfig.telegram?.botToken),
      },
      email: {
        enabled: Boolean(newConfig.email?.enabled),
        emailAddress: (newConfig.email?.emailAddress || '').trim(),
        displayName: (newConfig.email?.displayName || 'That Laundry Shop').trim(),
        imapHost: (newConfig.email?.imapHost || 'imap.gmail.com').trim(),
        smtpHost: (newConfig.email?.smtpHost || 'smtp.gmail.com').trim(),
        filterAutomatedEmails: newConfig.email?.filterAutomatedEmails !== false,
        appPassword: resolveSecret(newConfig.email?.appPassword, existingConfig.email?.appPassword),
        lastSyncedAt: existingConfig.email?.lastSyncedAt,
      },
    };

    await prisma.setting.upsert({
      where: { key: SOCIAL_CONFIG_KEY },
      update: { value: JSON.stringify(mergedConfig) },
      create: { key: SOCIAL_CONFIG_KEY, value: JSON.stringify(mergedConfig) },
    });
    invalidateSocialStoreCache();
    globalForFastSnapshot.__tlsFastSocialSnapshot = undefined;
    await bumpSocialStoreVersion();

    const botToken = mergedConfig?.telegram?.botToken?.trim();
    if (mergedConfig?.telegram?.enabled && botToken) {
      fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
        method: 'POST',
      }).catch(() => {});
    }

    return {
      success: true,
      config: maskSocialChannelConfigSecrets(mergedConfig),
    };
  } catch (err: any) {
    console.error('[saveSocialChannelConfigAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to save channel settings' };
  }
}

const globalForExternalPoll = globalThis as unknown as {
  __tlsLastExternalSocialPollAt?: number;
};

/**
 * Ultra-fast live polling action:
 * - Checks a 20-byte version stamp first; if nothing changed, returns `{ unchanged: true }` in <20ms (zero 4MB blob download!).
 * - Throttles slow external Telegram/LINE-contact sync to once every 12s so live UI sync never stalls.
 * - Supports delta message delivery (`deltaMessages`) so the browser doesn't re-download 5,000 old messages.
 */
export async function pollLiveChannelUpdatesAction(opts?: {
  clientVersion?: string;
  lastMsgTimestamp?: string;
  forceFull?: boolean;
}) {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    return await pollLiveChannelUpdatesInternal(opts);
  } catch (err: any) {
    console.error('[pollLiveChannelUpdatesAction] Error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to poll live channels',
    };
  }
}

async function pollLiveChannelUpdatesInternal(opts?: {
  clientVersion?: string;
  lastMsgTimestamp?: string;
  forceFull?: boolean;
}) {
  try {
    const nowMs = Date.now();
    const lastExtPoll = globalForExternalPoll.__tlsLastExternalSocialPollAt || 0;
    const shouldRunExternalPoll = Boolean(opts?.forceFull) || nowMs - lastExtPoll >= 12_000;

    // Always force fresh DB version check on poll so multi-instance Cloud Run stays 100% in sync
    const dbVersion = await getSocialStoreVersion(true);
    if (
      !opts?.forceFull &&
      opts?.clientVersion &&
      dbVersion !== '0' &&
      opts.clientVersion === dbVersion
    ) {
      // If external poll (Telegram) is due, fire internal non-auth helper asynchronously in background
      // so this poll returns in ~1ms instead of blocking 500ms waiting on api.telegram.org!
      if (shouldRunExternalPoll) {
        globalForExternalPoll.__tlsLastExternalSocialPollAt = nowMs;
        void pollLiveChannelUpdatesInternal({ forceFull: true }).catch(() => {});
      }
      return {
        success: true,
        unchanged: true,
        version: dbVersion,
        serverTime: new Date().toISOString(),
      };
    }

    await ensureSocialInboxSchemaAndMigrate();
    const config = await loadSocialChannelConfig();
    let currentVersion = dbVersion;
    let didMutate = false;
    let configMutated = false;

    if (shouldRunExternalPoll) {
      globalForExternalPoll.__tlsLastExternalSocialPollAt = nowMs;
      void processPendingSocialMediaJobs().catch(() => {});
      const gmailCreds = resolveGmailCredentials(config.email);
      if (config.email?.enabled && gmailCreds.isConfigured) {
        void syncGmailInboxMessages(config.email, { force: false, limit: 20 }).catch(() => {});
      }
    }

    // 1. Live Telegram Bot API Polling (throttled every 12s so it never blocks 2s UI sync)
    const botToken = config.telegram.botToken?.trim();
    if (shouldRunExternalPoll && config.telegram.enabled && botToken) {
      try {
        const offset = (config.telegram.lastUpdateId || 0) + 1;
        const tgRes = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=20&timeout=0`,
          { method: 'GET', cache: 'no-store' }
        );
        if (tgRes.ok) {
          const tgData = await tgRes.json();
          const updates: any[] = Array.isArray(tgData?.result) ? tgData.result : [];
          let maxUpdateId = config.telegram.lastUpdateId || 0;

          for (const upd of updates) {
            if (typeof upd.update_id === 'number' && upd.update_id > maxUpdateId) {
              maxUpdateId = upd.update_id;
            }
            const msg = upd.message || upd.edited_message || upd.channel_post;
            const memberEvent = upd.my_chat_member;

            if (!msg && memberEvent?.chat?.id) {
              const mChatId = String(memberEvent.chat.id);
              const mTitle = memberEvent.chat.title ? String(memberEvent.chat.title).trim() : `Group #${mChatId}`;
              const mName = mTitle.startsWith('👥') ? mTitle : `👥 ${mTitle}`;
              const nowIso = new Date().toISOString();
              const existingGroup = await findSocialConversationForContact({
                channel: 'telegram',
                externalContactId: mChatId,
              });
              if (!existingGroup) {
                const upserted = await upsertSocialConversationRow(
                  {
                    id: `conv_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    channel: 'telegram',
                    externalContactId: mChatId,
                    contactName: mName,
                    contactHandle: `Group (${mChatId})`,
                    status: 'open',
                    unreadCount: 1,
                    lastMessageText: `Connected to Telegram Group "${mTitle}"`,
                    lastMessageAt: nowIso,
                    lastMessageDirection: 'inbound',
                    createdAt: nowIso,
                    updatedAt: nowIso,
                  },
                  true
                );
                if (upserted.version) currentVersion = upserted.version;
                didMutate = true;
              }
              continue;
            }

            if (!msg || !msg.chat?.id) continue;

            const chatId = String(msg.chat.id);
            const chatType = String(msg.chat.type || 'private');
            const isGroupChat = chatType === 'group' || chatType === 'supergroup' || chatId.startsWith('-');
            const groupTitle = msg.chat.title ? String(msg.chat.title).trim() : '';
            const from = msg.from || {};
            const senderName =
              [from.first_name, from.last_name].filter(Boolean).join(' ') ||
              from.username ||
              `Telegram #${chatId}`;
            const threadContactName =
              isGroupChat && groupTitle
                ? groupTitle.startsWith('👥')
                  ? groupTitle
                  : `👥 ${groupTitle}`
                : senderName;
            const isBotAddedEvent =
              Array.isArray(msg.new_chat_members) && msg.new_chat_members.length > 0;
            const text = String(
              msg.text ||
                msg.caption ||
                (isBotAddedEvent && groupTitle
                  ? `👋 Bot joined group "${groupTitle}"`
                  : '')
            ).trim();
            const nowIso = new Date().toISOString();

            const attachments: SocialMessageAttachment[] = [];
            if (Array.isArray(msg.photo) && msg.photo.length > 0) {
              const largestPhoto = msg.photo[msg.photo.length - 1];
              if (largestPhoto?.file_id) {
                try {
                  const fileRes = await fetch(
                    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(
                      largestPhoto.file_id
                    )}`
                  );
                  if (fileRes.ok) {
                    const fileJson = await fileRes.json();
                    const filePath = fileJson?.result?.file_path;
                    if (filePath) {
                      const tgFileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
                      let savedUrl: string | null = null;
                      try {
                        const binRes = await fetch(tgFileUrl);
                        if (binRes.ok) {
                          const rawBuffer = Buffer.from(await binRes.arrayBuffer());
                          savedUrl = await uploadBufferToGcs(rawBuffer, {
                            entityType: 'system',
                            entityId: `tg_${chatId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
                            subType: 'chat',
                            contentType: binRes.headers.get('content-type') || 'image/jpeg',
                            extension: 'jpg',
                            customFileName: `tg-${upd.update_id || Date.now()}.jpg`,
                          });
                        }
                      } catch {}
                      attachments.push({
                        type: 'image',
                        url: savedUrl || tgFileUrl,
                        name: 'Telegram Photo',
                      });
                    }
                  }
                } catch {}
              }
            }

            if (msg.document?.file_id) {
              try {
                const fileRes = await fetch(
                  `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(
                    msg.document.file_id
                  )}`
                );
                if (fileRes.ok) {
                  const fileJson = await fileRes.json();
                  const filePath = fileJson?.result?.file_path;
                  if (filePath) {
                    const tgFileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
                    const docMime = String(msg.document.mime_type || 'application/octet-stream');
                    const isImageDoc = docMime.startsWith('image/');
                    const ext = (msg.document.file_name?.split('.').pop() || (isImageDoc ? 'jpg' : 'pdf')).replace(/[^a-zA-Z0-9]/g, '');
                    let savedUrl: string | null = null;
                    try {
                      const binRes = await fetch(tgFileUrl);
                      if (binRes.ok) {
                        const rawBuffer = Buffer.from(await binRes.arrayBuffer());
                        savedUrl = await uploadBufferToGcs(rawBuffer, {
                          entityType: 'system',
                          entityId: `tg_${chatId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
                          subType: 'chat',
                          contentType: docMime,
                          extension: ext || 'bin',
                          customFileName: `tg-doc-${upd.update_id || Date.now()}.${ext || 'bin'}`,
                        });
                      }
                    } catch {}
                    attachments.push({
                      type: isImageDoc ? 'image' : 'file',
                      url: savedUrl || tgFileUrl,
                      name: msg.document.file_name || 'Telegram Document',
                    });
                  }
                }
              } catch {}
            }

            if (!text && attachments.length === 0) continue;

            const displayBody =
              text ||
              (attachments.some((a) => a.type === 'image')
                ? '📷 [Sent a photo via Telegram]'
                : `📎 [Sent a file: ${attachments[0]?.name || 'Document'}]`);
            const previewText = isGroupChat ? `${senderName}: ${displayBody}` : displayBody;

            const rec = await recordInboundSocialMessageInternal({
              channel: 'telegram',
              externalContactId: chatId,
              contactName: threadContactName,
              text: previewText,
              attachments: attachments.length > 0 ? attachments : undefined,
              messageId: `msg_tg_${upd.update_id}`,
              deliveryMethod: 'telegram_bot_api',
              createdAt: nowIso,
            });
            if (rec.success && !(rec as any).deduped) {
              didMutate = true;
            }
          }

          if (maxUpdateId > (config.telegram.lastUpdateId || 0)) {
            config.telegram.lastUpdateId = maxUpdateId;
            configMutated = true;
          }
        }
      } catch (e) {
        // Ignore transient Telegram polling errors
      }
    }

    if (configMutated) {
      await prisma.setting.upsert({
        where: { key: SOCIAL_CONFIG_KEY },
        update: { value: JSON.stringify(config) },
        create: { key: SOCIAL_CONFIG_KEY, value: JSON.stringify(config) },
      });
      invalidateSocialStoreCache();
    }

    // Sync any newly arrived LINE OA webhook messages from lineOaContacts (throttled every 12s)
    if (shouldRunExternalPoll) try {
      const roLiveDb = getReadOnlyLiveLineDb();
      const [localLineRow, liveLineRow] = await Promise.all([
        prisma.setting.findUnique({ where: { key: 'lineOaContacts' } }),
        roLiveDb
          ? roLiveDb.setting.findUnique({ where: { key: 'lineOaContacts' } }).catch(() => null)
          : Promise.resolve(null),
      ]);

      for (const raw of [localLineRow?.value, liveLineRow?.value]) {
        if (!raw) continue;
        const contacts: LineContactRecord[] = JSON.parse(raw);
        if (!Array.isArray(contacts)) continue;
        for (const lc of contacts.slice(0, 30)) {
          if (!lc?.userId || !lc.lastMessageText || lc.lastMessageText === '[Followed LINE OA]') {
            continue;
          }
          const ts = lc.lastInteractionAt || new Date().toISOString();
          const msgId = `msg_line_wh_${lc.userId.slice(-8)}_${new Date(ts).getTime()}`;
          const existingConv = await findSocialConversationForContact({
            channel: 'line',
            externalContactId: lc.userId,
          });
          if (existingConv && existingConv.lastMessageText !== lc.lastMessageText) {
            const hasSameText = await prisma.socialMessage.findFirst({
              where: {
                conversationId: existingConv.id,
                text: lc.lastMessageText,
              },
              select: { id: true },
            });
            if (!hasSameText) {
              const rec = await recordInboundSocialMessageInternal({
                channel: 'line',
                externalContactId: lc.userId,
                contactName: lc.displayName || existingConv.contactName,
                text: lc.lastMessageText,
                messageId: msgId,
                deliveryMethod: 'line_api',
                createdAt: ts,
              });
              if (rec.success && !(rec as any).deduped) {
                didMutate = true;
              }
            }
          }
        }
      }
    } catch {}

    currentVersion = await getSocialStoreVersion(true);

    if (
      !didMutate &&
      !opts?.forceFull &&
      opts?.clientVersion &&
      opts.clientVersion === currentVersion
    ) {
      return {
        success: true,
        unchanged: true,
        version: currentVersion,
        serverTime: new Date().toISOString(),
      };
    }

    const conversations = await querySocialConversations(1000);

    // Delta message delivery when client already has history loaded
    if (opts?.lastMsgTimestamp && !opts?.forceFull) {
      const cutoffMs = new Date(opts.lastMsgTimestamp).getTime() - 10_000;
      if (Number.isFinite(cutoffMs)) {
        const deltaMessages = await queryDeltaSocialMessages(new Date(cutoffMs), 500);
        return {
          success: true,
          unchanged: false,
          version: currentVersion,
          conversations,
          deltaMessages,
          serverTime: new Date().toISOString(),
        };
      }
    }

    const messages = await queryRecentSocialMessages(500);
    return {
      success: true,
      unchanged: false,
      version: currentVersion,
      conversations,
      messages,
      serverTime: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Poll failed',
      conversations: [],
      messages: [],
    };
  }
}

/**
 * Checks real-time live connectivity across all social channels (LINE OA API, WhatsApp, Messenger, Instagram, Telegram)
 */
export async function checkChannelsLiveStatusAction(): Promise<{
  success: boolean;
  statuses: Record<SocialChannel, SocialChannelLiveStatus>;
}> {
  await assertServerActionAuthorized({ forbidRoles: ['rider'] });
  const nowIso = new Date().toISOString();
  const config = await loadSocialChannelConfig();
  const lineSettings = await getStoredLineOaSettings('that_laundry_shop');

  const waQr = await getWhatsAppQrStatusAsync(true);
  const isWaQrConnected = waQr.status === 'connected';
  const waCreds = resolveWhatsAppCloudCredentials(config.whatsapp);
  const isWaCloudPreferred = config.whatsapp.mode === 'cloud_api' && waCreds.isConfigured;

  const statuses: Record<SocialChannel, SocialChannelLiveStatus> = {
    whatsapp: {
      channel: 'whatsapp',
      connected: true,
      modeLabel:
        isWaCloudPreferred && isWaQrConnected
          ? 'Dual-Sync: Cloud API + QR Live'
          : isWaCloudPreferred
          ? 'Live Cloud API'
          : isWaQrConnected
          ? 'Direct QR Connected'
          : waCreds.isConfigured
          ? 'Live Cloud API'
          : config.whatsapp.mode === 'gateway_api' && config.whatsapp.gatewayUrl
          ? 'Live QR Gateway API'
          : 'Live App & Web Bridge',
      accountName: isWaQrConnected && !isWaCloudPreferred
        ? `${waQr.connectedName || 'WhatsApp'} (${waQr.connectedPhone || ''})`
        : config.whatsapp.businessPhoneNumber || '+66 WhatsApp Direct',
      details:
        isWaCloudPreferred && isWaQrConnected
          ? 'Dual-Sync Active: Official Meta Cloud API + 2-Way Mobile/WhatsApp Web QR Sync'
          : isWaCloudPreferred
          ? 'Connected to Official Meta WhatsApp Business Cloud API'
          : isWaQrConnected
          ? 'Direct Linked Device Active (Free 100% • 2-Way Live Sync)'
          : waCreds.isConfigured
          ? 'Connected to Meta WhatsApp Cloud API'
          : config.whatsapp.mode === 'gateway_api' && config.whatsapp.gatewayUrl
          ? `Connected to Gateway (${config.whatsapp.gatewayUrl})`
          : 'Instant Click-to-Chat, Companion Window & Native WhatsApp App active',
      lastCheckedAt: nowIso,
    },
    line: {
      channel: 'line',
      connected: Boolean(lineSettings.channelAccessToken),
      modeLabel: 'Live Messaging API',
      accountName: config.line.basicId || '@thatlaundryshop',
      details: 'Connected to LINE Official Account Push & Webhook API',
      lastCheckedAt: nowIso,
    },
    facebook: {
      channel: 'facebook',
      connected: true,
      modeLabel: config.facebook.pageAccessToken ? 'Live Meta Graph API' : 'Live Webhook & Inbox',
      accountName: config.facebook.pageName || 'That Laundry Shop Bangkok',
      details: config.facebook.pageAccessToken
        ? 'Connected to Facebook Page Messaging API'
        : 'Webhook & Unified Inbox active (Add Page Token for direct API push)',
      lastCheckedAt: nowIso,
    },
    instagram: {
      channel: 'instagram',
      connected: true,
      modeLabel: config.instagram.accessToken ? 'Live IG Graph API' : 'Live Webhook & Inbox',
      accountName: config.instagram.accountHandle || '@thatlaundryshop',
      details: config.instagram.accessToken
        ? 'Connected to Instagram Direct Messaging API'
        : 'Webhook & Unified Inbox active (Add IG Token for direct API push)',
      lastCheckedAt: nowIso,
    },
    telegram: {
      channel: 'telegram',
      connected: true,
      modeLabel: config.telegram.botToken ? 'Live Bot API Polling' : 'Live Webhook & Inbox',
      accountName: config.telegram.botUsername || '@ThatLaundryShopBot',
      details: config.telegram.botToken
        ? 'Connected to Telegram Bot API (Live 3s Polling & Push)'
        : 'Unified Inbox active (Add BotFather Token for live polling)',
      lastCheckedAt: nowIso,
    },
    email: (() => {
      const gmailCreds = resolveGmailCredentials(config.email);
      return {
        channel: 'email' as const,
        connected: Boolean(config.email?.enabled && gmailCreds.isConfigured),
        modeLabel:
          config.email?.enabled && gmailCreds.isConfigured
            ? 'Live Gmail IMAP/SMTP'
            : 'Not Configured',
        accountName: gmailCreds.emailAddress || 'Gmail Inbox',
        details:
          config.email?.enabled && gmailCreds.isConfigured
            ? `2-Way Gmail Sync active (${gmailCreds.emailAddress})`
            : 'Add Gmail address & App Password in Settings to sync emails',
        lastCheckedAt: nowIso,
      };
    })(),
    wechat: {
      channel: 'wechat',
      connected: true,
      modeLabel: 'Unified Inbox',
      accountName: 'WeChat Official',
      lastCheckedAt: nowIso,
    },
  };

  // Ping LINE OA Bot Info API to verify live token & get official bot profile photo
  if (lineSettings.channelAccessToken) {
    try {
      const botInfo = await getLineBotInfo(lineSettings.channelAccessToken);
      if (botInfo && botInfo.userId) {
        statuses.line.connected = true;
        statuses.line.accountName = `${botInfo.displayName || 'ThatLaundryShop'} (${
          botInfo.basicId || '@thatlaundryshop'
        })`;
        statuses.line.avatarUrl = botInfo.pictureUrl;
        statuses.line.details = 'Verified Live LINE Messaging API (@thatlaundryshop + @050ehvzb)';
      }
    } catch {}
  }

  // Ping Telegram getMe if botToken is configured
  if (config.telegram.botToken?.trim()) {
    try {
      const tgMe = await fetch(
        `https://api.telegram.org/bot${config.telegram.botToken.trim()}/getMe`
      );
      if (tgMe.ok) {
        const tgData = await tgMe.json();
        if (tgData?.ok && tgData?.result?.username) {
          statuses.telegram.connected = true;
          statuses.telegram.accountName = `@${tgData.result.username}`;
          statuses.telegram.details = `Verified Live Telegram Bot (${tgData.result.first_name})`;
        }
      }
    } catch {}
  }

  // Ping Meta WhatsApp Business Cloud API if configured
  if (waCreds.isConfigured && (isWaCloudPreferred || !isWaQrConnected)) {
    try {
      const waVerify = await verifyWhatsAppCloudConnection({
        phoneNumberId: waCreds.phoneNumberId,
        accessToken: waCreds.accessToken,
      });
      if (waVerify.connected) {
        statuses.whatsapp.connected = true;
        statuses.whatsapp.modeLabel = isWaQrConnected
          ? 'Dual-Sync: Cloud API + QR Live'
          : 'Verified Meta Cloud API';
        statuses.whatsapp.accountName = `${waVerify.verifiedName || 'WhatsApp Business'} (${
          waVerify.displayPhoneNumber || config.whatsapp.businessPhoneNumber || waCreds.phoneNumberId
        })`;
        statuses.whatsapp.details = isWaQrConnected
          ? `Dual-Sync Active: Meta Cloud API + Mobile/Web QR (${waQr.connectedPhone || 'Linked'})`
          : `Verified Live Meta WhatsApp Cloud API${
              waVerify.qualityRating ? ` • Quality: ${waVerify.qualityRating}` : ''
            }`;
      }
    } catch {}
  }

  return {
    success: true,
    statuses,
  };
}

/**
 * Test & Verify Meta WhatsApp Business Cloud API connection (Phone Number ID & Access Token)
 */
export async function testWhatsAppCloudApiAction(input?: {
  phoneNumberId?: string;
  accessToken?: string;
}): Promise<WhatsAppCloudVerificationResult> {
  await assertServerActionAuthorized({ forbidRoles: ['rider'] });
  const config = await loadSocialChannelConfig();
  const savedCreds = resolveWhatsAppCloudCredentials(config.whatsapp);

  const incomingToken = (input?.accessToken || '').trim();
  const effectiveToken =
    incomingToken && !incomingToken.includes('••••') ? incomingToken : savedCreds.accessToken;
  const effectivePhoneId = (input?.phoneNumberId || '').trim() || savedCreds.phoneNumberId;

  return verifyWhatsAppCloudConnection({
    phoneNumberId: effectivePhoneId,
    accessToken: effectiveToken,
  });
}

/**
 * Start or refresh Direct WhatsApp QR Code pairing (Linked Devices — Free 100%)
 */
export async function startWhatsAppQrPairingAction(resetAuth = false): Promise<{
  success: boolean;
  state: WhatsAppQrState;
}> {
  await assertServerActionAuthorized({ forbidRoles: ['rider'] });
  const state = await startWhatsAppQrConnection(resetAuth);
  return { success: true, state };
}

/**
 * Get current Direct WhatsApp QR Code connection status
 */
export async function getWhatsAppQrStatusAction(): Promise<{
  success: boolean;
  state: WhatsAppQrState;
}> {
  await assertServerActionAuthorized({ forbidRoles: ['rider'] });
  const state = await getWhatsAppQrStatusAsync(true);
  return { success: true, state };
}

/**
 * Disconnect Direct WhatsApp QR session and clear saved credentials
 */
export async function disconnectWhatsAppQrAction(): Promise<{
  success: boolean;
  state: WhatsAppQrState;
}> {
  await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });
  const state = await disconnectWhatsAppQrSession(true);
  return { success: true, state };
}

export interface LineNewFollowerItem {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  followedAt: string;
  monthKey: string; // YYYY-MM
  hasChatted: boolean;
  lastMessageText: string;
  lastInteractionAt: string;
  linkedCustomerId?: string | null;
  linkedCustomerName?: string | null;
  linkedCustomerPhone?: string | null;
  customerMemberId?: string | null;
  leadType: 'new_lead' | 'existing_customer';
  existingSinceAt?: string | null;
  orderCount: number;
  paidRevenue: number;
}

export interface LineFollowersMonthlyBucket {
  monthKey: string; // YYYY-MM
  newFollowersCount: number;
  trueNewLeadsCount: number;
  existingCustomerCount: number;
  chattedCount: number;
  silentCount: number;
  linkedCrmCount: number;
}

export interface WhatsAppNewContactItem {
  id: string;
  externalContactId: string;
  displayName: string;
  contactPhone: string;
  pictureUrl?: string;
  firstContactAt: string;
  monthKey: string; // YYYY-MM
  lastMessageText: string;
  lastMessageAt: string;
  lastMessageDirection: 'inbound' | 'outbound';
  linkedCustomerId?: string | null;
  linkedCustomerName?: string | null;
  linkedCustomerPhone?: string | null;
  customerMemberId?: string | null;
  leadType: 'new_lead' | 'existing_customer';
  existingSinceAt?: string | null;
  orderCount: number;
  paidRevenue: number;
}

export interface WhatsAppMonthlyBucket {
  monthKey: string; // YYYY-MM
  newContactsCount: number;
  trueNewLeadsCount: number;
  existingCustomerCount: number;
  inboundActiveCount: number;
  linkedCrmCount: number;
}

/**
 * Returns verified new LINE OA followers and WhatsApp contacts grouped by month (YYYY-MM),
 * along with total pool sizes, True New Lead vs Existing Returning Customer classification,
 * and chat/CRM conversion status.
 */
export async function getLineFollowersMarketingReportAction(): Promise<{
  success: boolean;
  totalFollowerPoolCount: number;
  followers: LineNewFollowerItem[];
  monthlySummary: LineFollowersMonthlyBucket[];
  totalWhatsappPoolCount: number;
  whatsappContacts: WhatsAppNewContactItem[];
  whatsappMonthlySummary: WhatsAppMonthlyBucket[];
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    await ensureSocialInboxSchemaAndMigrate();

    const roLiveDb = getReadOnlyLiveLineDb();

    const normTail = (p?: string | null): string => {
      const d = String(p || '').replace(/\D/g, '');
      return d.length >= 8 ? d.slice(-9) : d;
    };

    const [
      localLineRow,
      liveLineRow,
      localFollowMsgs,
      liveFollowMsgs,
      localCustomers,
      liveCustomers,
      localJobs,
      liveJobs,
    ] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'lineOaContacts' } }),
      roLiveDb
        ? roLiveDb.setting.findUnique({ where: { key: 'lineOaContacts' } }).catch(() => null)
        : Promise.resolve(null),
      prisma.socialMessage.findMany({
        where: {
          channel: 'line',
          text: { in: ['[Followed LINE Official Account]', '[Followed LINE OA]'] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          conversationId: true,
          senderName: true,
          createdAt: true,
        },
      }),
      roLiveDb
        ? roLiveDb.socialMessage
            .findMany({
              where: {
                channel: 'line',
                text: { in: ['[Followed LINE Official Account]', '[Followed LINE OA]'] },
              },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                conversationId: true,
                senderName: true,
                createdAt: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
      prisma.customer.findMany({
        select: {
          id: true,
          name: true,
          phone: true,
          memberId: true,
          lineId: true,
          createdAt: true,
        },
      }),
      roLiveDb
        ? roLiveDb.customer
            .findMany({
              select: {
                id: true,
                name: true,
                phone: true,
                memberId: true,
                lineId: true,
                createdAt: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
      prisma.job.findMany({
        where: { status: { not: 'cancel' } },
        select: {
          id: true,
          customerId: true,
          customerPhone: true,
          totalAmount: true,
          isPaid: true,
          isShopPaid: true,
          createdAt: true,
        },
      }),
      roLiveDb
        ? roLiveDb.job
            .findMany({
              where: { status: { not: 'cancel' } },
              select: {
                id: true,
                customerId: true,
                customerPhone: true,
                totalAmount: true,
                isPaid: true,
                isShopPaid: true,
                createdAt: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    // Merge CRM Customers & Jobs from Local + Live Read-Only DB so history is 100% complete
    const custById = new Map<string, (typeof localCustomers)[number]>();
    const custByLineId = new Map<string, (typeof localCustomers)[number]>();
    const custByPhoneTail = new Map<string, (typeof localCustomers)[number]>();

    for (const c of [...liveCustomers, ...localCustomers]) {
      if (!c?.id) continue;
      const existing = custById.get(c.id);
      if (!existing || new Date(c.createdAt) < new Date(existing.createdAt)) {
        custById.set(c.id, c);
      }
      if (c.lineId && c.lineId.trim()) {
        const lid = c.lineId.trim();
        const prevLine = custByLineId.get(lid);
        if (!prevLine || new Date(c.createdAt) < new Date(prevLine.createdAt)) {
          custByLineId.set(lid, c);
        }
      }
      const tail = normTail(c.phone);
      if (tail.length >= 7) {
        const prevTail = custByPhoneTail.get(tail);
        if (!prevTail || new Date(c.createdAt) < new Date(prevTail.createdAt)) {
          custByPhoneTail.set(tail, c);
        }
      }
    }

    const dedupedJobs = new Map<string, (typeof localJobs)[number]>();
    for (const j of [...liveJobs, ...localJobs]) {
      if (!j?.id || j.id.startsWith('T2026')) continue;
      if (!dedupedJobs.has(j.id)) {
        dedupedJobs.set(j.id, j);
      }
    }

    const jobStatsByCustId = new Map<
      string,
      { earliestMs: number; count: number; paidRevenue: number }
    >();
    const jobStatsByPhoneTail = new Map<
      string,
      { earliestMs: number; count: number; paidRevenue: number }
    >();

    for (const j of dedupedJobs.values()) {
      const jMs = new Date(j.createdAt).getTime();
      const paidAmt = j.isPaid || j.isShopPaid ? Number(j.totalAmount) || 0 : 0;

      if (j.customerId) {
        const cur = jobStatsByCustId.get(j.customerId) || {
          earliestMs: jMs,
          count: 0,
          paidRevenue: 0,
        };
        if (jMs < cur.earliestMs) cur.earliestMs = jMs;
        cur.count += 1;
        cur.paidRevenue += paidAmt;
        jobStatsByCustId.set(j.customerId, cur);
      }

      const tail = normTail(j.customerPhone);
      if (tail.length >= 7) {
        const cur = jobStatsByPhoneTail.get(tail) || {
          earliestMs: jMs,
          count: 0,
          paidRevenue: 0,
        };
        if (jMs < cur.earliestMs) cur.earliestMs = jMs;
        cur.count += 1;
        cur.paidRevenue += paidAmt;
        jobStatsByPhoneTail.set(tail, cur);
      }
    }

    const contactByUid = new Map<string, LineContactRecord>();
    for (const raw of [liveLineRow?.value, localLineRow?.value]) {
      if (!raw) continue;
      try {
        const parsed: LineContactRecord[] = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;
        for (const c of parsed) {
          if (!c?.userId) continue;
          const existing = contactByUid.get(c.userId);
          if (!existing) {
            contactByUid.set(c.userId, c);
          } else {
            contactByUid.set(c.userId, {
              ...existing,
              ...c,
              followedAt: c.followedAt || existing.followedAt,
              linkedCustomerId: c.linkedCustomerId || existing.linkedCustomerId,
              linkedCustomerName: c.linkedCustomerName || existing.linkedCustomerName,
              linkedCustomerPhone: c.linkedCustomerPhone || existing.linkedCustomerPhone,
            });
          }
        }
      } catch {}
    }

    const allContacts = Array.from(contactByUid.values());
    const byMinuteCount: Record<string, number> = {};
    for (const c of allContacts) {
      const minKey = (c.lastInteractionAt || '').slice(0, 16);
      if (minKey) {
        byMinuteCount[minKey] = (byMinuteCount[minKey] || 0) + 1;
      }
    }

    const combinedFollowMsgs = [...localFollowMsgs, ...liveFollowMsgs];
    const convIds = Array.from(new Set(combinedFollowMsgs.map((m) => m.conversationId)));

    const [localConvs, liveConvs] = await Promise.all([
      convIds.length > 0
        ? prisma.socialConversation.findMany({
            where: { id: { in: convIds } },
            select: {
              id: true,
              externalContactId: true,
              contactName: true,
              contactAvatar: true,
              contactPhone: true,
              customerId: true,
              customerName: true,
              lastMessageText: true,
              lastMessageAt: true,
            },
          })
        : Promise.resolve([]),
      roLiveDb && convIds.length > 0
        ? roLiveDb.socialConversation
            .findMany({
              where: { id: { in: convIds } },
              select: {
                id: true,
                externalContactId: true,
                contactName: true,
                contactAvatar: true,
                contactPhone: true,
                customerId: true,
                customerName: true,
                lastMessageText: true,
                lastMessageAt: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const convById = new Map<string, (typeof localConvs)[number]>();
    for (const c of [...liveConvs, ...localConvs]) {
      convById.set(c.id, c);
    }

    const classifyLeadAndCrm = (params: {
      customerId?: string | null;
      lineId?: string | null;
      phone?: string | null;
      firstTouchMs: number;
    }) => {
      const tail = normTail(params.phone);
      const matchedCust =
        (params.customerId ? custById.get(params.customerId) : undefined) ||
        (params.lineId ? custByLineId.get(params.lineId.trim()) : undefined) ||
        (tail.length >= 7 ? custByPhoneTail.get(tail) : undefined) ||
        null;

      const effectiveCustId = matchedCust?.id || params.customerId || null;
      const jobStats =
        (effectiveCustId ? jobStatsByCustId.get(effectiveCustId) : undefined) ||
        (tail.length >= 7 ? jobStatsByPhoneTail.get(tail) : undefined) ||
        undefined;

      const custCreatedMs = matchedCust ? new Date(matchedCust.createdAt).getTime() : null;
      const earliestJobMs = jobStats?.earliestMs || null;
      const earliestKnownCustomerMs =
        custCreatedMs && earliestJobMs
          ? Math.min(custCreatedMs, earliestJobMs)
          : custCreatedMs || earliestJobMs || null;

      // Determine start of the month (Bangkok time UTC+7) of the first touch
      const bkkFirstTouch = new Date(params.firstTouchMs + 7 * 60 * 60 * 1000);
      const bkkMonthKey = bkkFirstTouch.toISOString().slice(0, 7);
      const monthStartMs = new Date(`${bkkMonthKey}-01T00:00:00+07:00`).getTime();

      // A contact is an EXISTING customer if they were already in CRM or had a job
      // BEFORE the start of the first-touch month, OR >24 hours before their first chat/follow in the inbox.
      const isExistingCustomer =
        earliestKnownCustomerMs !== null &&
        (earliestKnownCustomerMs < monthStartMs ||
          earliestKnownCustomerMs < params.firstTouchMs - 24 * 3600 * 1000);

      return {
        linkedCustomerId: effectiveCustId,
        linkedCustomerName: matchedCust?.name || null,
        linkedCustomerPhone: matchedCust?.phone || params.phone || null,
        customerMemberId: matchedCust?.memberId || null,
        leadType: (isExistingCustomer ? 'existing_customer' : 'new_lead') as
          | 'new_lead'
          | 'existing_customer',
        existingSinceAt: earliestKnownCustomerMs
          ? new Date(earliestKnownCustomerMs).toISOString()
          : null,
        orderCount: jobStats?.count || 0,
        paidRevenue: Math.round((jobStats?.paidRevenue || 0) * 100) / 100,
      };
    };

    const followerMap = new Map<string, LineNewFollowerItem>();

    // 1. Authoritative webhook follow messages from SocialMessage
    for (const m of combinedFollowMsgs) {
      const conv = convById.get(m.conversationId);
      const uid = conv?.externalContactId?.trim();
      if (!uid) continue;

      const contact = contactByUid.get(uid);
      const followedIso = m.createdAt.toISOString();
      const existing = followerMap.get(uid);
      if (existing && new Date(existing.followedAt).getTime() <= m.createdAt.getTime()) {
        continue;
      }

      const lastMsg =
        contact?.lastMessageText ||
        conv?.lastMessageText ||
        '[Followed LINE Official Account]';
      const isFollowPlaceholder =
        lastMsg === '[Followed LINE OA]' ||
        lastMsg === '[Followed LINE Official Account]' ||
        lastMsg === 'Connected via LINE Official Account (@thatlaundryshop)';

      const bkkDate = new Date(m.createdAt.getTime() + 7 * 60 * 60 * 1000);
      const monthKey = bkkDate.toISOString().slice(0, 7);

      const crmInfo = classifyLeadAndCrm({
        customerId: contact?.linkedCustomerId || conv?.customerId || null,
        lineId: uid,
        phone: contact?.linkedCustomerPhone || conv?.contactPhone || null,
        firstTouchMs: m.createdAt.getTime(),
      });

      followerMap.set(uid, {
        userId: uid,
        displayName: contact?.displayName || conv?.contactName || m.senderName || uid,
        pictureUrl: contact?.pictureUrl || conv?.contactAvatar || undefined,
        statusMessage: contact?.statusMessage,
        followedAt: followedIso,
        monthKey,
        hasChatted: !isFollowPlaceholder,
        lastMessageText: isFollowPlaceholder ? 'เพิ่งกดติดตาม (ยังไม่ได้ส่งข้อความ)' : lastMsg,
        lastInteractionAt:
          contact?.lastInteractionAt ||
          (conv?.lastMessageAt ? conv.lastMessageAt.toISOString() : followedIso),
        linkedCustomerId: crmInfo.linkedCustomerId,
        linkedCustomerName:
          crmInfo.linkedCustomerName || contact?.linkedCustomerName || conv?.customerName || null,
        linkedCustomerPhone: crmInfo.linkedCustomerPhone,
        customerMemberId: crmInfo.customerMemberId,
        leadType: crmInfo.leadType,
        existingSinceAt: crmInfo.existingSinceAt,
        orderCount: crmInfo.orderCount,
        paidRevenue: crmInfo.paidRevenue,
      });
    }

    // 2. Include contacts from lineOaContacts that have explicit followedAt or non-bulk-imported [Followed LINE OA]
    for (const c of allContacts) {
      if (!c?.userId || followerMap.has(c.userId)) continue;
      const minKey = (c.lastInteractionAt || '').slice(0, 16);
      const isBulkSyncBurst = (byMinuteCount[minKey] || 0) > 20;
      const hasRealFollowEvent =
        Boolean(c.followedAt) ||
        (c.lastMessageText === '[Followed LINE OA]' && !isBulkSyncBurst);

      if (!hasRealFollowEvent) continue;

      const followedIso = c.followedAt || c.lastInteractionAt;
      const followedDate = new Date(followedIso);
      if (isNaN(followedDate.getTime())) continue;

      const lastMsg = c.lastMessageText || '[Followed LINE OA]';
      const isFollowPlaceholder =
        lastMsg === '[Followed LINE OA]' ||
        lastMsg === '[Followed LINE Official Account]' ||
        lastMsg === 'Connected via LINE Official Account (@thatlaundryshop)';

      const bkkDate = new Date(followedDate.getTime() + 7 * 60 * 60 * 1000);
      const monthKey = bkkDate.toISOString().slice(0, 7);

      const crmInfo = classifyLeadAndCrm({
        customerId: c.linkedCustomerId || null,
        lineId: c.userId,
        phone: c.linkedCustomerPhone || null,
        firstTouchMs: followedDate.getTime(),
      });

      followerMap.set(c.userId, {
        userId: c.userId,
        displayName: c.displayName || c.userId,
        pictureUrl: c.pictureUrl,
        statusMessage: c.statusMessage,
        followedAt: followedDate.toISOString(),
        monthKey,
        hasChatted: !isFollowPlaceholder,
        lastMessageText: isFollowPlaceholder ? 'เพิ่งกดติดตาม (ยังไม่ได้ส่งข้อความ)' : lastMsg,
        lastInteractionAt: c.lastInteractionAt || followedDate.toISOString(),
        linkedCustomerId: crmInfo.linkedCustomerId,
        linkedCustomerName: crmInfo.linkedCustomerName || c.linkedCustomerName || null,
        linkedCustomerPhone: crmInfo.linkedCustomerPhone,
        customerMemberId: crmInfo.customerMemberId,
        leadType: crmInfo.leadType,
        existingSinceAt: crmInfo.existingSinceAt,
        orderCount: crmInfo.orderCount,
        paidRevenue: crmInfo.paidRevenue,
      });
    }

    const followers = Array.from(followerMap.values()).sort(
      (a, b) => new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime()
    );

    const monthMap = new Map<string, LineFollowersMonthlyBucket>();
    for (const f of followers) {
      const cur = monthMap.get(f.monthKey) || {
        monthKey: f.monthKey,
        newFollowersCount: 0,
        trueNewLeadsCount: 0,
        existingCustomerCount: 0,
        chattedCount: 0,
        silentCount: 0,
        linkedCrmCount: 0,
      };
      cur.newFollowersCount += 1;
      if (f.leadType === 'new_lead') cur.trueNewLeadsCount += 1;
      else cur.existingCustomerCount += 1;
      if (f.hasChatted) cur.chattedCount += 1;
      else cur.silentCount += 1;
      if (f.linkedCustomerId || f.orderCount > 0) cur.linkedCrmCount += 1;
      monthMap.set(f.monthKey, cur);
    }

    const monthlySummary = Array.from(monthMap.values()).sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );

    // 3. Load WhatsApp conversations & earliest message timestamp per conversation
    const [localWaConvs, liveWaConvs, localWaMinMsgs, liveWaMinMsgs] = await Promise.all([
      prisma.socialConversation.findMany({
        where: { channel: 'whatsapp' },
        orderBy: { lastMessageAt: 'desc' },
        select: {
          id: true,
          externalContactId: true,
          contactName: true,
          contactPhone: true,
          contactAvatar: true,
          customerId: true,
          customerName: true,
          customerMemberId: true,
          lastMessageText: true,
          lastMessageAt: true,
          lastMessageDirection: true,
          createdAt: true,
        },
      }),
      roLiveDb
        ? roLiveDb.socialConversation
            .findMany({
              where: { channel: 'whatsapp' },
              orderBy: { lastMessageAt: 'desc' },
              select: {
                id: true,
                externalContactId: true,
                contactName: true,
                contactPhone: true,
                contactAvatar: true,
                customerId: true,
                customerName: true,
                customerMemberId: true,
                lastMessageText: true,
                lastMessageAt: true,
                lastMessageDirection: true,
                createdAt: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
      prisma.socialMessage.groupBy({
        by: ['conversationId'],
        where: { channel: 'whatsapp' },
        _min: { createdAt: true },
      }),
      roLiveDb
        ? roLiveDb.socialMessage
            .groupBy({
              by: ['conversationId'],
              where: { channel: 'whatsapp' },
              _min: { createdAt: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const earliestWaMsgByConvId = new Map<string, Date>();
    for (const g of [...liveWaMinMsgs, ...localWaMinMsgs]) {
      if (!g.conversationId || !g._min?.createdAt) continue;
      const prev = earliestWaMsgByConvId.get(g.conversationId);
      if (!prev || g._min.createdAt.getTime() < prev.getTime()) {
        earliestWaMsgByConvId.set(g.conversationId, g._min.createdAt);
      }
    }

    const waContactByPhoneKey = new Map<string, WhatsAppNewContactItem>();
    for (const row of [...liveWaConvs, ...localWaConvs]) {
      const rawPhone = row.contactPhone || row.externalContactId || '';
      const digits = rawPhone.replace(/\D/g, '');
      const phoneKey = digits.length >= 8 ? digits.slice(-9) : (row.externalContactId || row.id);
      if (!phoneKey) continue;

      const earliestMsgDate = earliestWaMsgByConvId.get(row.id);
      const candidates = [
        earliestMsgDate?.getTime(),
        row.createdAt?.getTime(),
        row.lastMessageAt?.getTime(),
      ].filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms > 946684800000);

      const firstContactMs = candidates.length > 0 ? Math.min(...candidates) : Date.now();
      const firstContactDate = new Date(firstContactMs);
      const bkkDate = new Date(firstContactMs + 7 * 60 * 60 * 1000);
      const monthKey = bkkDate.toISOString().slice(0, 7);
      const displayPhone =
        row.contactPhone ||
        (digits ? formatDisplayPhone(digits, '66') : row.externalContactId);

      const existing = waContactByPhoneKey.get(phoneKey);
      const effectiveFirstMs = existing
        ? Math.min(firstContactMs, new Date(existing.firstContactAt).getTime())
        : firstContactMs;

      const crmInfo = classifyLeadAndCrm({
        customerId: existing?.linkedCustomerId || row.customerId || null,
        phone: displayPhone || rawPhone,
        firstTouchMs: effectiveFirstMs,
      });

      if (!existing) {
        waContactByPhoneKey.set(phoneKey, {
          id: row.id,
          externalContactId: row.externalContactId,
          displayName: row.contactName || displayPhone || row.externalContactId,
          contactPhone: displayPhone,
          pictureUrl: row.contactAvatar || undefined,
          firstContactAt: firstContactDate.toISOString(),
          monthKey,
          lastMessageText: row.lastMessageText || '-',
          lastMessageAt: row.lastMessageAt.toISOString(),
          lastMessageDirection: (row.lastMessageDirection as 'inbound' | 'outbound') || 'inbound',
          linkedCustomerId: crmInfo.linkedCustomerId,
          linkedCustomerName: crmInfo.linkedCustomerName || row.customerName || null,
          linkedCustomerPhone: crmInfo.linkedCustomerPhone || displayPhone || null,
          customerMemberId: crmInfo.customerMemberId || row.customerMemberId || null,
          leadType: crmInfo.leadType,
          existingSinceAt: crmInfo.existingSinceAt,
          orderCount: crmInfo.orderCount,
          paidRevenue: crmInfo.paidRevenue,
        });
      } else {
        const isEarlier = firstContactMs < new Date(existing.firstContactAt).getTime();
        const isNewerLast = row.lastMessageAt.getTime() > new Date(existing.lastMessageAt).getTime();
        waContactByPhoneKey.set(phoneKey, {
          ...existing,
          firstContactAt: isEarlier ? firstContactDate.toISOString() : existing.firstContactAt,
          monthKey: isEarlier ? monthKey : existing.monthKey,
          lastMessageText: isNewerLast ? row.lastMessageText || existing.lastMessageText : existing.lastMessageText,
          lastMessageAt: isNewerLast ? row.lastMessageAt.toISOString() : existing.lastMessageAt,
          lastMessageDirection: isNewerLast
            ? ((row.lastMessageDirection as 'inbound' | 'outbound') || existing.lastMessageDirection)
            : existing.lastMessageDirection,
          linkedCustomerId: crmInfo.linkedCustomerId,
          linkedCustomerName:
            crmInfo.linkedCustomerName || existing.linkedCustomerName || row.customerName || null,
          customerMemberId:
            crmInfo.customerMemberId || existing.customerMemberId || row.customerMemberId || null,
          leadType: crmInfo.leadType,
          existingSinceAt: crmInfo.existingSinceAt,
          orderCount: crmInfo.orderCount,
          paidRevenue: crmInfo.paidRevenue,
        });
      }
    }

    const whatsappContacts = Array.from(waContactByPhoneKey.values()).sort(
      (a, b) => new Date(b.firstContactAt).getTime() - new Date(a.firstContactAt).getTime()
    );

    const waMonthMap = new Map<string, WhatsAppMonthlyBucket>();
    for (const w of whatsappContacts) {
      const cur = waMonthMap.get(w.monthKey) || {
        monthKey: w.monthKey,
        newContactsCount: 0,
        trueNewLeadsCount: 0,
        existingCustomerCount: 0,
        inboundActiveCount: 0,
        linkedCrmCount: 0,
      };
      cur.newContactsCount += 1;
      if (w.leadType === 'new_lead') cur.trueNewLeadsCount += 1;
      else cur.existingCustomerCount += 1;
      if (w.lastMessageDirection === 'inbound' || Boolean(w.lastMessageText)) {
        cur.inboundActiveCount += 1;
      }
      if (w.linkedCustomerId || w.orderCount > 0) cur.linkedCrmCount += 1;
      waMonthMap.set(w.monthKey, cur);
    }

    const whatsappMonthlySummary = Array.from(waMonthMap.values()).sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );

    return {
      success: true,
      totalFollowerPoolCount: allContacts.length,
      followers,
      monthlySummary,
      totalWhatsappPoolCount: whatsappContacts.length,
      whatsappContacts,
      whatsappMonthlySummary,
    };
  } catch (err: any) {
    console.error('[getLineFollowersMarketingReportAction] Error:', err);
    return {
      success: false,
      totalFollowerPoolCount: 0,
      followers: [],
      monthlySummary: [],
      totalWhatsappPoolCount: 0,
      whatsappContacts: [],
      whatsappMonthlySummary: [],
      error: err?.message || 'Failed to load LINE & WhatsApp followers report',
    };
  }
}

export async function testGmailConnectionAction(input: {
  emailAddress?: string;
  appPassword?: string;
  imapHost?: string;
}): Promise<{ ok: boolean; mailboxCount?: number; error?: string }> {
  try {
    await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });
    const existing = await loadSocialChannelConfig();
    const rawPass = (input.appPassword || '').trim();
    const effectivePass =
      !rawPass || rawPass.includes('••••')
        ? existing.email?.appPassword || process.env.GMAIL_APP_PASSWORD || ''
        : rawPass;
    const effectiveEmail =
      (input.emailAddress || '').trim() ||
      existing.email?.emailAddress ||
      process.env.GMAIL_USER ||
      '';
    return await testGmailConnection(
      effectiveEmail,
      effectivePass,
      (input.imapHost || existing.email?.imapHost || 'imap.gmail.com').trim()
    );
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Gmail connection test failed' };
  }
}

export async function syncGmailInboxAction(opts?: {
  limit?: number;
  emailAddress?: string;
  appPassword?: string;
  displayName?: string;
  imapHost?: string;
}): Promise<{ ok: boolean; imported: number; error?: string }> {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });
    const config = await loadSocialChannelConfig(true);
    const rawPass = (opts?.appPassword || '').trim();
    const effectivePass =
      !rawPass || rawPass.includes('••••')
        ? config.email?.appPassword || process.env.GMAIL_APP_PASSWORD || ''
        : rawPass;
    const effectiveCfg = {
      enabled: true,
      emailAddress: (opts?.emailAddress || config.email?.emailAddress || process.env.GMAIL_USER || '').trim(),
      appPassword: effectivePass,
      displayName: (opts?.displayName || config.email?.displayName || 'That Laundry Shop').trim(),
      imapHost: (opts?.imapHost || config.email?.imapHost || 'imap.gmail.com').trim(),
      smtpHost: config.email?.smtpHost || 'smtp.gmail.com',
    };
    return await syncGmailInboxMessages(effectiveCfg, {
      force: true,
      limit: opts?.limit ?? 30,
    });
  } catch (err: any) {
    return { ok: false, imported: 0, error: err?.message || 'Failed to sync Gmail inbox' };
  }
}

/**
 * Finds an existing CRM Customer by phone or email, or creates a new CRM Customer
 * from a Web Booking email, links it to the conversation, and returns the customer record
 * ready to pre-fill the Create Laundry Job modal!
 */
export async function ensureCustomerForBookingAction(input: {
  conversationId?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  room?: string;
  branchId?: string | null;
}): Promise<{
  success: boolean;
  customer?: any;
  created?: boolean;
  error?: string;
}> {
  try {
    await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });

    const cleanName = (input.name || '').trim() || 'New Booking Customer';
    const cleanPhone = (input.phone || '').trim();
    const cleanEmail =
      input.email && input.email.includes('@') ? input.email.trim().toLowerCase() : '';
    const fullAddress = [
      (input.address || '').trim(),
      input.room ? `(Room ${input.room.trim()})` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const phoneKey = normalizePhoneKey(cleanPhone);
    let existing: any = null;

    if (phoneKey.length >= 7) {
      const candidates = await prisma.customer.findMany({
        where: {
          OR: [
            { phone: { contains: phoneKey.slice(-6) } },
            { secondaryPhone: { contains: phoneKey.slice(-6) } },
          ],
        },
        take: 20,
      });
      existing =
        candidates.find(
          (c) =>
            normalizePhoneKey(c.phone) === phoneKey ||
            normalizePhoneKey(c.secondaryPhone) === phoneKey
        ) || null;
    }

    if (!existing && cleanEmail) {
      existing = await prisma.customer.findFirst({
        where: { email: { equals: cleanEmail, mode: 'insensitive' } },
      });
    }

    let customer = existing;
    let created = false;

    if (!customer) {
      const { primeCustomerCache, invalidateDbCache } = await import('@/lib/db-cache');
      customer = await prisma.customer.create({
        data: {
          name: cleanName,
          phone: cleanPhone || cleanEmail || '-',
          email: cleanEmail || null,
          defaultAddress: fullAddress || null,
          isWhatsapp: Boolean(cleanPhone),
          whatsappId: cleanPhone || null,
          branchId: input.branchId || null,
          isNew: true,
        },
      });
      created = true;
      try {
        primeCustomerCache(customer);
        invalidateDbCache('customers');
      } catch {}
    }

    if (input.conversationId && customer?.id) {
      await prisma.socialConversation
        .update({
          where: { id: input.conversationId },
          data: {
            customerId: customer.id,
            customerName: customer.name,
            customerMemberId: customer.memberId || null,
            customerWalletBalance: customer.creditBalance || 0,
          },
        })
        .catch(() => {});
      invalidateSocialStoreCache();
    }

    return { success: true, customer, created };
  } catch (err: any) {
    console.error('[ensureCustomerForBookingAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to create or link CRM customer' };
  }
}
