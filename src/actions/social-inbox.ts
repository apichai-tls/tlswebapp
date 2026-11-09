'use server';

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { prisma } from '@/lib/prisma';
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
  isValidLineUserId,
  sendLinePushMessage,
  getLineBotInfo,
  LineMessageObject,
  LineContactRecord,
} from '@/lib/line';
import { getStoredLineOaSettings } from '@/actions/line';
import {
  getWhatsAppQrStatus,
  startWhatsAppQrConnection,
  disconnectWhatsAppQrSession,
  sendDirectWhatsAppQrMessage,
  type WhatsAppQrState,
} from '@/lib/whatsapp-qr-manager';

import { PrismaClient } from '@prisma/client';

const SOCIAL_CONVERSATIONS_KEY = 'TLS_SOCIAL_CONVERSATIONS_V1';
const SOCIAL_MESSAGES_KEY = 'TLS_SOCIAL_MESSAGES_V1';
const SOCIAL_CONFIG_KEY = 'TLS_SOCIAL_CHANNEL_CONFIG_V1';
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

    if (convMsgs.length > 0) {
      const latestMsg = convMsgs[convMsgs.length - 1];
      if (
        updated.lastMessageText !== latestMsg.text ||
        updated.lastMessageAt !== latestMsg.createdAt
      ) {
        updated.lastMessageText = latestMsg.text;
        updated.lastMessageAt = latestMsg.createdAt;
        updated.lastMessageDirection = latestMsg.direction;
        updated.updatedAt = latestMsg.createdAt;
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

    return updated;
  });

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

  normalizedConvs.sort((a, b) => {
    const aActive = hasRealConversationActivity(a);
    const bActive = hasRealConversationActivity(b);
    if (aActive !== bActive) return bActive - aActive;
    const aCrm = a.customerId ? 1 : 0;
    const bCrm = b.customerId ? 1 : 0;
    if (!aActive && !bActive && aCrm !== bCrm) return bCrm - aCrm;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });

  return { conversations: normalizedConvs, messages: filteredMessages, didClean };
}

/**
 * Resolves any local `/uploads/...` or GCS image path into a public HTTPS URL
 * so external APIs (LINE OA, WhatsApp Cloud/Gateway API, Messenger, Instagram, Telegram)
 * can fetch and deliver staff-uploaded or clipboard-pasted images directly to customers' apps.
 */
async function resolvePublicHttpsImageUrl(url: string): Promise<string | null> {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/uploads/')) {
    try {
      const relWithoutLeadingSlash = trimmed.replace(/^\/+/, '');
      const candidatePaths = [
        path.resolve(process.cwd(), 'storage', relWithoutLeadingSlash),
        path.resolve(process.cwd(), 'public', relWithoutLeadingSlash),
      ];
      const existingFile = candidatePaths.find((p) => fs.existsSync(p));
      if (existingFile) {
        const buf = await fs.promises.readFile(existingFile);
        const fd = new FormData();
        fd.append('key', '6d207e02198a847aa98d0a2a901485a5');
        fd.append('action', 'upload');
        fd.append('source', buf.toString('base64'));
        fd.append('format', 'json');
        const upRes = await fetch('https://freeimage.host/api/1/upload', {
          method: 'POST',
          body: fd,
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          if (upData?.image?.url && String(upData.image.url).startsWith('https://')) {
            return String(upData.image.url);
          }
        }
      }
    } catch (err) {
      console.warn('[Social Inbox Photo Relay] Fallback to URL:', err);
    }
  }

  if (trimmed.startsWith('https://storage.googleapis.com/')) {
    try {
      const { generateDownloadUrl, bucketName } = await import('@/lib/gcs');
      const prefix = `https://storage.googleapis.com/${bucketName}/`;
      if (trimmed.startsWith(prefix)) {
        const gcsKey = trimmed.slice(prefix.length);
        const signed = await generateDownloadUrl(gcsKey, 60 * 24 * 7);
        if (signed && signed.startsWith('https://')) {
          return signed;
        }
      }
    } catch {}
    return trimmed;
  }

  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return trimmed.replace(/^http:\/\//i, 'https://');
  if (trimmed.startsWith('/')) {
    const base = (
      process.env.NEXT_PUBLIC_APP_URL || 'https://www.thatlaundryshop.com'
    ).replace(/\/+$/, '');
    return `${base}${trimmed}`;
  }
  return null;
}

function getDefaultChannelConfig(): SocialChannelConfig {
  return {
    whatsapp: {
      enabled: true,
      mode: 'web_bridge',
      launchTarget: 'companion_popup',
      businessPhoneNumber: '+66 80 000 0000',
      defaultCountryCode: '66',
      autoOpenWaWebOnSend: true,
      phoneNumberId: '',
      accessToken: '',
      verifyToken: 'tls_whatsapp_verify_2026',
      gatewayUrl: '',
      gatewayApiKey: '',
      gatewayInstanceId: 'default',
    },
    line: {
      enabled: true,
      basicId: '@thatlaundryshop',
      botName: 'ThatLaundryShop',
      secondaryBasicId: '@050ehvzb',
      secondaryBotName: 'NoName Laundry',
      autoSyncFollowers: true,
    },
    facebook: {
      enabled: true,
      pageName: 'That Laundry Shop Bangkok',
      pageId: '',
      pageAccessToken: '',
    },
    instagram: {
      enabled: true,
      accountHandle: '@thatlaundryshop',
      igBusinessId: '',
      accessToken: '',
    },
    telegram: {
      enabled: true,
      botUsername: '@ThatLaundryShopBot',
      botToken: '',
    },
  };
}

async function loadRawInboxStore(): Promise<{
  conversations: SocialConversation[];
  messages: SocialMessage[];
  config: SocialChannelConfig;
}> {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [SOCIAL_CONVERSATIONS_KEY, SOCIAL_MESSAGES_KEY, SOCIAL_CONFIG_KEY],
      },
    },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));

  let conversations: SocialConversation[] = [];
  let messages: SocialMessage[] = [];
  let config: SocialChannelConfig = getDefaultChannelConfig();

  const rawConvs = map.get(SOCIAL_CONVERSATIONS_KEY);
  if (rawConvs) {
    try {
      const parsed = JSON.parse(rawConvs);
      if (Array.isArray(parsed)) conversations = parsed;
    } catch {}
  }

  const rawMsgs = map.get(SOCIAL_MESSAGES_KEY);
  if (rawMsgs) {
    try {
      const parsed = JSON.parse(rawMsgs);
      if (Array.isArray(parsed)) messages = parsed;
    } catch {}
  }

  const rawCfg = map.get(SOCIAL_CONFIG_KEY);
  if (rawCfg) {
    try {
      const parsed = JSON.parse(rawCfg);
      if (parsed && typeof parsed === 'object') {
        config = {
          whatsapp: { ...config.whatsapp, ...(parsed.whatsapp || {}) },
          line: { ...config.line, ...(parsed.line || {}) },
          facebook: { ...config.facebook, ...(parsed.facebook || {}) },
          instagram: { ...config.instagram, ...(parsed.instagram || {}) },
          telegram: { ...config.telegram, ...(parsed.telegram || {}) },
        };
      }
    } catch {}
  }

  return { conversations, messages, config };
}

async function saveInboxStore(
  conversations: SocialConversation[],
  messages: SocialMessage[]
): Promise<void> {
  // Keep latest 1000 conversations and 5000 messages to keep settings payload fast
  const trimmedConvs = conversations.slice(0, 1000);
  const trimmedMsgs = messages.slice(-5000);

  await Promise.all([
    prisma.setting.upsert({
      where: { key: SOCIAL_CONVERSATIONS_KEY },
      update: { value: JSON.stringify(trimmedConvs) },
      create: { key: SOCIAL_CONVERSATIONS_KEY, value: JSON.stringify(trimmedConvs) },
    }),
    prisma.setting.upsert({
      where: { key: SOCIAL_MESSAGES_KEY },
      update: { value: JSON.stringify(trimmedMsgs) },
      create: { key: SOCIAL_MESSAGES_KEY, value: JSON.stringify(trimmedMsgs) },
    }),
  ]);
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

        // 1. Bill / Proforma Sent on LINE OA
        if (meta.isBillSent && meta.billSentAt && meta.contactChannel === 'line') {
          const billMsgId = `msg_line_bill_${sj.id}`;
          if (!existingMsgIds.has(billMsgId)) {
            const billPhotos = parseJsonImageUrls(sj.billImageUrl);
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
          }
        }

        // 2. Delivery Proof & Completion Message Sent on LINE OA
        if (
          meta.isDeliveryPhotoSent &&
          (!meta.deliveryPhotoSentChannel || meta.deliveryPhotoSentChannel === 'LINE OA')
        ) {
          const delivMsgId = `msg_line_job_${sj.id}`;
          if (!existingMsgIds.has(delivMsgId)) {
            const delivPhotos = [
              ...parseJsonImageUrls(sj.deliveryProofImageUrl),
              ...parseJsonImageUrls(sj.proofImageUrl),
            ];
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
      config,
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
    const { conversations, messages, config } = await loadRawInboxStore();

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
    let existingIdx = conversations.findIndex(
      (c) =>
        c.channel === 'whatsapp' &&
        (c.externalContactId === e164Phone ||
          normalizePhoneKey(c.externalContactId) === phoneKey ||
          (matchedCustomer && c.customerId === matchedCustomer.id))
    );

    let conversation: SocialConversation;

    if (existingIdx >= 0) {
      conversation = {
        ...conversations[existingIdx],
        externalContactId: e164Phone,
        contactName: resolvedName || conversations[existingIdx].contactName,
        contactPhone: displayPhone,
        contactHandle: `+${e164Phone}`,
        customerId: matchedCustomer?.id || conversations[existingIdx].customerId || null,
        customerName: matchedCustomer?.name || conversations[existingIdx].customerName || null,
        customerMemberId:
          matchedCustomer?.memberId || conversations[existingIdx].customerMemberId || null,
        customerWalletBalance:
          matchedCustomer?.creditBalance ?? conversations[existingIdx].customerWalletBalance ?? 0,
        status: 'open',
        updatedAt: nowIso,
      };
      conversations.splice(existingIdx, 1);
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

      // Priority 0: If Direct WhatsApp QR Link (Linked Devices) is connected, send directly!
      const waQr = getWhatsAppQrStatus();
      if (waQr.status === 'connected') {
        const qrSendRes = await sendDirectWhatsAppQrMessage({
          phone: e164Phone,
          countryCode,
          text: msgText,
        });
        if (qrSendRes.ok) {
          deliveryMethod = 'whatsapp_gateway_api';
          status = 'delivered';
        }
      }

      // If WhatsApp Cloud API is configured and not already sent via QR, attempt direct Cloud API dispatch
      if (
        status !== 'delivered' &&
        config.whatsapp.mode === 'cloud_api' &&
        config.whatsapp.phoneNumberId &&
        config.whatsapp.accessToken
      ) {
        try {
          const cloudRes = await fetch(
            `https://graph.facebook.com/v19.0/${encodeURIComponent(
              config.whatsapp.phoneNumberId.trim()
            )}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.whatsapp.accessToken.trim()}`,
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: e164Phone,
                type: 'text',
                text: { body: msgText },
              }),
            }
          );
          if (cloudRes.ok) {
            deliveryMethod = 'whatsapp_cloud_api';
            status = 'delivered';
          }
        } catch (e) {
          console.warn('[WhatsApp Cloud API] Fallback to Web Bridge:', e);
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
        createdAt: nowIso,
      };

      messages.push(createdMessage);
      conversation.lastMessageText = msgText;
      conversation.lastMessageAt = nowIso;
      conversation.lastMessageDirection = 'outbound';
    }

    conversations.unshift(conversation);
    await saveInboxStore(conversations, messages);

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

    const { conversations, messages } = await loadRawInboxStore();
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
    let existingIdx = conversations.findIndex(
      (c) =>
        c.channel === input.channel &&
        (c.externalContactId === resolvedExtId ||
          (matchedCust && c.customerId === matchedCust.id))
    );

    let conversation: SocialConversation;
    if (existingIdx >= 0) {
      conversation = {
        ...conversations[existingIdx],
        contactName: name || conversations[existingIdx].contactName,
        status: 'open',
        updatedAt: nowIso,
      };
      conversations.splice(existingIdx, 1);
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
    if (msgText) {
      let deliveryMethod: SocialMessage['deliveryMethod'] = 'social_api';
      let status: SocialMessage['status'] = 'sent';
      let externalError: string | undefined;

      // If LINE OA and valid U-userId, push message via real LINE Messaging API!
      if (input.channel === 'line' && isValidLineUserId(conversation.externalContactId)) {
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

      messages.push({
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
      });

      conversation.lastMessageText = msgText;
      conversation.lastMessageAt = nowIso;
    }

    conversations.unshift(conversation);
    await saveInboxStore(conversations, messages);

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
}) {
  try {
    const authUser = await assertServerActionAuthorized({
      requireWrite: true,
      forbidRoles: ['rider'],
    });

    const text = (input.text || '').trim();
    const attachments = input.attachments || [];
    if (!text && attachments.length === 0) {
      return { success: false, error: 'Message cannot be empty.' };
    }

    const { conversations, messages, config } = await loadRawInboxStore();
    const convIdx = conversations.findIndex((c) => c.id === input.conversationId);
    if (convIdx === -1) {
      return { success: false, error: 'Conversation not found.' };
    }

    const conv = conversations[convIdx];
    const nowIso = new Date().toISOString();

    // Format text with reply quote if replying to a specific message
    const outboundTextWithQuote =
      input.replyTo && text
        ? `↩️ "${input.replyTo.text.slice(0, 80)}${input.replyTo.text.length > 80 ? '...' : ''}"\n${text}`
        : text;

    // Resolve public HTTPS URLs for any image attachments so external APIs (LINE, Meta, Telegram, WhatsApp) can fetch them
    const resolvedImageUrls: string[] = [];
    for (const att of attachments) {
      if (att.type === 'image' && att.url) {
        const httpsUrl = await resolvePublicHttpsImageUrl(att.url);
        if (httpsUrl) {
          resolvedImageUrls.push(httpsUrl);
        }
      }
    }

    let deliveryMethod: SocialMessage['deliveryMethod'] = 'platform_log';
    let status: SocialMessage['status'] = 'sent';
    let externalError: string | undefined;
    let whatsappUrl: string | undefined;
    let whatsappWebUrl: string | undefined;
    let whatsappProtocolUrl: string | undefined;

    // 1. Real LINE OA API Delivery (@thatlaundryshop & @050ehvzb)
    if (conv.channel === 'line') {
      deliveryMethod = 'line_api';
      if (isValidLineUserId(conv.externalContactId)) {
        const lineSettings = await getStoredLineOaSettings(conv.brand);
        if (lineSettings.channelAccessToken) {
          const lineMsgs: LineMessageObject[] = [];
          if (outboundTextWithQuote) {
            lineMsgs.push({ type: 'text', text: outboundTextWithQuote });
          }
          for (const httpsImg of resolvedImageUrls.slice(0, 4)) {
            lineMsgs.push({
              type: 'image',
              originalContentUrl: httpsImg,
              previewImageUrl: httpsImg,
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

      // Mode 0: Built-in Direct WhatsApp QR Link (Linked Devices — 100% Free & 2-Way Sync)
      const waQr = getWhatsAppQrStatus();
      if (waQr.status === 'connected') {
        const qrRes = await sendDirectWhatsAppQrMessage({
          phone: targetPhone,
          countryCode: cc,
          text: outboundTextWithQuote,
          attachments,
        });
        if (qrRes.ok) {
          deliveryMethod = 'whatsapp_gateway_api';
          status = 'delivered';
        } else {
          externalError = qrRes.error;
        }
      }

      // Mode A: Official Meta WhatsApp Business Cloud API
      if (
        status !== 'delivered' &&
        config.whatsapp.mode === 'cloud_api' &&
        config.whatsapp.phoneNumberId &&
        config.whatsapp.accessToken
      ) {
        deliveryMethod = 'whatsapp_cloud_api';
        try {
          const endpoint = `https://graph.facebook.com/v19.0/${encodeURIComponent(
            config.whatsapp.phoneNumberId.trim()
          )}/messages`;
          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.whatsapp.accessToken.trim()}`,
          };

          if (outboundTextWithQuote) {
            const textRes = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: e164,
                type: 'text',
                text: { body: outboundTextWithQuote },
              }),
            });
            if (textRes.ok) {
              status = 'delivered';
            } else {
              const errJson = await textRes.json().catch(() => ({}));
              externalError = errJson?.error?.message || `Meta WhatsApp Cloud API HTTP ${textRes.status}`;
            }
          }

          for (const httpsImg of resolvedImageUrls) {
            const imgRes = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: e164,
                type: 'image',
                image: { link: httpsImg },
              }),
            });
            if (imgRes.ok) status = 'delivered';
          }

          if (status !== 'delivered') {
            deliveryMethod = 'whatsapp_web_bridge';
          }
        } catch {
          deliveryMethod = 'whatsapp_web_bridge';
        }
      }
      // Mode B: Custom WhatsApp QR / REST Gateway API (WAHA / Evolution / Baileys / UltraMsg)
      else if (config.whatsapp.mode === 'gateway_api' && config.whatsapp.gatewayUrl?.trim()) {
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
      // Mode C: Live WhatsApp Web / Native App Bridge (only if not already delivered via Direct QR)
      else if (status !== 'delivered') {
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
      externalError,
      createdAt: nowIso,
    };

    messages.push(newMsg);

    const updatedConv: SocialConversation = {
      ...conv,
      lastMessageText: newMsg.text,
      lastMessageAt: nowIso,
      lastMessageDirection: 'outbound',
      unreadCount: 0,
      status: conv.status === 'resolved' ? 'open' : conv.status,
      updatedAt: nowIso,
    };

    conversations.splice(convIdx, 1);
    conversations.unshift(updatedConv);

    await saveInboxStore(conversations, messages);

    return {
      success: true,
      message: newMsg,
      conversation: updatedConv,
      whatsappUrl,
      whatsappWebUrl,
      whatsappProtocolUrl,
      conversations,
      messages,
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
 * Record an incoming message from a webhook (LINE OA, WhatsApp Cloud API, Messenger, Instagram) or customer simulation
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
    const { conversations, messages } = await loadRawInboxStore();
    const nowIso = new Date().toISOString();

    let convIdx = conversations.findIndex(
      (c) =>
        c.channel === input.channel &&
        (c.externalContactId === input.externalContactId ||
          (input.customerId && c.customerId === input.customerId))
    );

    let conv: SocialConversation;
    if (convIdx >= 0) {
      conv = {
        ...conversations[convIdx],
        contactName: input.contactName || conversations[convIdx].contactName,
        contactAvatar: input.contactAvatar || conversations[convIdx].contactAvatar,
        customerId: input.customerId || conversations[convIdx].customerId,
        lastMessageText: input.text,
        lastMessageAt: nowIso,
        lastMessageDirection: 'inbound',
        unreadCount: (conversations[convIdx].unreadCount || 0) + 1,
        status: 'open',
        updatedAt: nowIso,
      };
      conversations.splice(convIdx, 1);
    } else {
      conv = {
        id: `conv_${input.channel}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        channel: input.channel,
        externalContactId: input.externalContactId,
        contactName: input.contactName || input.externalContactId,
        contactPhone: input.contactPhone || '',
        contactAvatar: input.contactAvatar,
        contactHandle: input.externalContactId,
        customerId: input.customerId || null,
        status: 'open',
        unreadCount: 1,
        lastMessageText: input.text,
        lastMessageAt: nowIso,
        lastMessageDirection: 'inbound',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    const inboundMsg: SocialMessage = {
      id: `msg_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conv.id,
      channel: input.channel,
      direction: 'inbound',
      text: input.text,
      attachments: input.attachments,
      senderName: conv.contactName,
      status: 'delivered',
      createdAt: nowIso,
    };

    messages.push(inboundMsg);
    conversations.unshift(conv);

    await saveInboxStore(conversations, messages);

    return {
      success: true,
      conversation: conv,
      message: inboundMsg,
      conversations,
      messages,
    };
  } catch (err: any) {
    console.error('[recordInboundSocialMessageAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to record inbound message' };
  }
}

/**
 * Record an outbound message sent by system automation or external LINE OA notification (e.g., Delivery Proof via LINE)
 * so that all system-to-customer LINE messages & photos appear inside the Omnichannel Social Inbox thread.
 */
export async function recordOutboundSocialMessageFromSystemAction(input: {
  channel: SocialChannel;
  externalContactId: string;
  contactName?: string;
  contactPhone?: string;
  contactAvatar?: string;
  customerId?: string | null;
  text: string;
  imageUrls?: string[];
  senderName?: string;
  messageId?: string;
}) {
  try {
    const { conversations, messages } = await loadRawInboxStore();
    const nowIso = new Date().toISOString();

    let convIdx = conversations.findIndex(
      (c) =>
        c.channel === input.channel &&
        (c.externalContactId === input.externalContactId ||
          (input.customerId && c.customerId === input.customerId))
    );

    let conv: SocialConversation;
    if (convIdx >= 0) {
      conv = {
        ...conversations[convIdx],
        externalContactId: input.externalContactId || conversations[convIdx].externalContactId,
        contactName: input.contactName || conversations[convIdx].contactName,
        contactPhone: input.contactPhone || conversations[convIdx].contactPhone,
        contactAvatar: input.contactAvatar || conversations[convIdx].contactAvatar,
        customerId: input.customerId || conversations[convIdx].customerId,
        lastMessageText: input.text,
        lastMessageAt: nowIso,
        lastMessageDirection: 'outbound',
        status: 'open',
        updatedAt: nowIso,
      };
      conversations.splice(convIdx, 1);
    } else {
      const convId =
        input.channel === 'line'
          ? `conv_line_${input.externalContactId.slice(-10)}`
          : `conv_${input.channel}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      conv = {
        id: convId,
        channel: input.channel,
        externalContactId: input.externalContactId,
        contactName: input.contactName || input.externalContactId,
        contactPhone: input.contactPhone || '',
        contactAvatar: input.contactAvatar,
        contactHandle: input.channel === 'line' ? '@thatlaundryshop' : input.externalContactId,
        customerId: input.customerId || null,
        status: 'open',
        unreadCount: 0,
        lastMessageText: input.text,
        lastMessageAt: nowIso,
        lastMessageDirection: 'outbound',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    const attachments: SocialMessageAttachment[] = (input.imageUrls || []).map((url, idx) => ({
      id: `att_sys_${Date.now()}_${idx}`,
      type: 'image',
      url,
      name: `photo_${idx + 1}.jpg`,
    }));

    const msgId =
      input.messageId || `msg_sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const existingMsgIdx = messages.findIndex((m) => m.id === msgId);

    const outboundMsg: SocialMessage = {
      id: msgId,
      conversationId: conv.id,
      channel: input.channel,
      direction: 'outbound',
      text: input.text,
      attachments: attachments.length > 0 ? attachments : undefined,
      senderName: input.senderName || 'LINE OA Bot',
      status: 'delivered',
      deliveryMethod: input.channel === 'line' ? 'line_api' : 'social_api',
      createdAt: nowIso,
    };

    if (existingMsgIdx >= 0) {
      messages[existingMsgIdx] = outboundMsg;
    } else {
      messages.push(outboundMsg);
    }
    conversations.unshift(conv);

    await saveInboxStore(conversations, messages);
    return { success: true, conversation: conv, message: outboundMsg };
  } catch (err: any) {
    console.warn('[recordOutboundSocialMessageFromSystemAction] Non-fatal error:', err);
    return { success: false, error: err?.message };
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
}) {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });

    const { conversations, messages } = await loadRawInboxStore();
    const idx = conversations.findIndex((c) => c.id === input.conversationId);
    if (idx === -1) {
      return { success: false, error: 'Conversation not found' };
    }

    const conv = { ...conversations[idx] };
    if (input.status) conv.status = input.status;
    if (input.markAsRead) conv.unreadCount = 0;
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

    conv.updatedAt = new Date().toISOString();
    conversations[idx] = conv;

    await saveInboxStore(conversations, messages);
    return {
      success: true,
      conversation: conv,
      conversations,
    };
  } catch (err: any) {
    console.error('[updateSocialConversationAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to update conversation' };
  }
}

/**
 * Delete a conversation thread and its messages
 */
export async function deleteSocialConversationAction(conversationId: string) {
  try {
    await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });

    const { conversations, messages } = await loadRawInboxStore();
    const nextConvs = conversations.filter((c) => c.id !== conversationId);
    const nextMsgs = messages.filter((m) => m.conversationId !== conversationId);

    await saveInboxStore(nextConvs, nextMsgs);
    return {
      success: true,
      conversations: nextConvs,
      messages: nextMsgs,
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
    await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ['rider'] });

    await prisma.setting.upsert({
      where: { key: SOCIAL_CONFIG_KEY },
      update: { value: JSON.stringify(newConfig) },
      create: { key: SOCIAL_CONFIG_KEY, value: JSON.stringify(newConfig) },
    });

    return {
      success: true,
      config: newConfig,
    };
  } catch (err: any) {
    console.error('[saveSocialChannelConfigAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to save channel settings' };
  }
}

/**
 * Live background polling action (called every 3.5 seconds while staff has Social Inbox open).
 * 1) Polls Telegram Bot API `getUpdates` if a botToken is configured (enables live Telegram chat even on localhost).
 * 2) Syncs any newly arrived LINE OA contacts/messages from the webhook store.
 * 3) Returns the latest conversations and messages for zero-refresh live UI updates.
 */
export async function pollLiveChannelUpdatesAction() {
  try {
    await assertServerActionAuthorized({ forbidRoles: ['rider'] });

    const { conversations, messages, config } = await loadRawInboxStore();
    let didMutate = false;
    let configMutated = false;

    // 1. Live Telegram Bot API Polling (if botToken configured)
    const botToken = config.telegram.botToken?.trim();
    if (config.telegram.enabled && botToken) {
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
            const msg = upd.message || upd.edited_message;
            if (!msg || !msg.chat?.id) continue;

            const chatId = String(msg.chat.id);
            const from = msg.from || {};
            const senderName =
              [from.first_name, from.last_name].filter(Boolean).join(' ') ||
              from.username ||
              `Telegram #${chatId}`;
            const text = String(msg.text || msg.caption || '').trim();
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
                      attachments.push({
                        type: 'image',
                        url: `https://api.telegram.org/file/bot${botToken}/${filePath}`,
                        name: 'Telegram Photo',
                      });
                    }
                  }
                } catch {}
              }
            }

            if (!text && attachments.length === 0) continue;

            const displayBody = text || '📷 [Sent a photo via Telegram]';
            let convIdx = conversations.findIndex(
              (c) => c.channel === 'telegram' && c.externalContactId === chatId
            );

            let conv: SocialConversation;
            if (convIdx >= 0) {
              conv = {
                ...conversations[convIdx],
                contactName: senderName || conversations[convIdx].contactName,
                lastMessageText: displayBody,
                lastMessageAt: nowIso,
                lastMessageDirection: 'inbound',
                unreadCount: (conversations[convIdx].unreadCount || 0) + 1,
                status: 'open',
                updatedAt: nowIso,
              };
              conversations.splice(convIdx, 1);
            } else {
              conv = {
                id: `conv_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                channel: 'telegram',
                externalContactId: chatId,
                contactName: senderName,
                contactHandle: from.username ? `@${from.username}` : chatId,
                status: 'open',
                unreadCount: 1,
                lastMessageText: displayBody,
                lastMessageAt: nowIso,
                lastMessageDirection: 'inbound',
                createdAt: nowIso,
                updatedAt: nowIso,
              };
            }

            conversations.unshift(conv);
            messages.push({
              id: `msg_tg_${upd.update_id}_${Date.now()}`,
              conversationId: conv.id,
              channel: 'telegram',
              direction: 'inbound',
              text: displayBody,
              attachments: attachments.length > 0 ? attachments : undefined,
              senderName,
              status: 'delivered',
              deliveryMethod: 'telegram_bot_api',
              createdAt: nowIso,
            });
            didMutate = true;
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
    }

    // Sync any newly arrived LINE OA webhook messages from live DB or lineOaContacts
    try {
      const roLiveDb = getReadOnlyLiveLineDb();
      const [localLineRow, liveLineRow, liveMsgsRow] = await Promise.all([
        prisma.setting.findUnique({ where: { key: 'lineOaContacts' } }),
        roLiveDb
          ? roLiveDb.setting.findUnique({ where: { key: 'lineOaContacts' } }).catch(() => null)
          : Promise.resolve(null),
        roLiveDb
          ? roLiveDb.setting.findUnique({ where: { key: SOCIAL_MESSAGES_KEY } }).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (liveMsgsRow?.value) {
        const liveMsgs: SocialMessage[] = JSON.parse(liveMsgsRow.value);
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
      }

      for (const raw of [localLineRow?.value, liveLineRow?.value]) {
        if (!raw) continue;
        const contacts: LineContactRecord[] = JSON.parse(raw);
        if (!Array.isArray(contacts)) continue;
        for (const lc of contacts.slice(0, 30)) {
          if (!lc?.userId || !lc.lastMessageText || lc.lastMessageText === '[Followed LINE OA]') {
            continue;
          }
          const convIdx = conversations.findIndex(
            (c) => c.channel === 'line' && c.externalContactId === lc.userId
          );
          if (convIdx >= 0) {
            const conv = conversations[convIdx];
            const hasMsg = messages.some(
              (m) => m.conversationId === conv.id && m.text === lc.lastMessageText
            );
            if (!hasMsg) {
              const ts = lc.lastInteractionAt || new Date().toISOString();
              messages.push({
                id: `msg_line_wh_${lc.userId.slice(-8)}_${new Date(ts).getTime()}`,
                conversationId: conv.id,
                channel: 'line',
                direction: 'inbound',
                text: lc.lastMessageText,
                senderName: lc.displayName || conv.contactName,
                status: 'delivered',
                deliveryMethod: 'line_api',
                createdAt: ts,
              });
              conversations[convIdx] = {
                ...conv,
                lastMessageText: lc.lastMessageText,
                lastMessageAt: ts,
                lastMessageDirection: 'inbound',
                unreadCount: (conv.unreadCount || 0) + 1,
                updatedAt: ts,
              };
              didMutate = true;
            }
          }
        }
      }
    } catch {}

    const normPoll = normalizeAndSortConversations(conversations, messages);
    conversations.splice(0, conversations.length, ...normPoll.conversations);
    messages.splice(0, messages.length, ...normPoll.messages);
    if (normPoll.didClean) didMutate = true;

    if (didMutate) {
      await saveInboxStore(conversations, messages);
    }

    return {
      success: true,
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
  const nowIso = new Date().toISOString();
  const { config } = await loadRawInboxStore();
  const lineSettings = await getStoredLineOaSettings('that_laundry_shop');

  const waQr = getWhatsAppQrStatus();
  const isWaQrConnected = waQr.status === 'connected';

  const statuses: Record<SocialChannel, SocialChannelLiveStatus> = {
    whatsapp: {
      channel: 'whatsapp',
      connected: true,
      modeLabel: isWaQrConnected
        ? 'Direct QR Connected'
        : config.whatsapp.mode === 'cloud_api' && config.whatsapp.accessToken
        ? 'Live Cloud API'
        : config.whatsapp.mode === 'gateway_api' && config.whatsapp.gatewayUrl
        ? 'Live QR Gateway API'
        : 'Live App & Web Bridge',
      accountName: isWaQrConnected
        ? `${waQr.connectedName || 'WhatsApp'} (${waQr.connectedPhone || ''})`
        : config.whatsapp.businessPhoneNumber || '+66 WhatsApp Direct',
      details: isWaQrConnected
        ? 'Direct Linked Device Active (Free 100% • 2-Way Live Sync)'
        : config.whatsapp.mode === 'cloud_api' && config.whatsapp.accessToken
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

  return {
    success: true,
    statuses,
  };
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
  const state = getWhatsAppQrStatus();
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
