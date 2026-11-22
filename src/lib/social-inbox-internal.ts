import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { uploadBufferToGcs, generateDownloadUrl, bucketName } from '@/lib/gcs';
import type {
  SocialChannel,
  SocialChannelConfig,
  SocialConversation,
  SocialMessage,
  SocialMessageAttachment,
} from '@/types/social-inbox';

export const SOCIAL_CONVERSATIONS_KEY = 'TLS_SOCIAL_CONVERSATIONS_V1';
export const SOCIAL_MESSAGES_KEY = 'TLS_SOCIAL_MESSAGES_V1';
export const SOCIAL_CONFIG_KEY = 'TLS_SOCIAL_CHANNEL_CONFIG_V1';
export const SOCIAL_VERSION_KEY = 'TLS_SOCIAL_VERSION_V1';

interface SocialStoreMemoryCache {
  version: string;
  conversations: SocialConversation[];
  messages: SocialMessage[];
  config: SocialChannelConfig;
  loadedAt: number;
}

const globalForSocialCache = globalThis as unknown as {
  __tlsSocialStoreCache?: SocialStoreMemoryCache | null;
  __tlsSocialReadWatermarks?: Map<string, number>;
  __tlsSocialLastVersionCheckAt?: number;
};

export async function getSocialStoreVersion(forceDb = false): Promise<string> {
  const cached = globalForSocialCache.__tlsSocialStoreCache;
  const lastCheck = globalForSocialCache.__tlsSocialLastVersionCheckAt || 0;
  if (!forceDb && cached && cached.version && Date.now() - lastCheck < 1500) {
    return cached.version;
  }
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SOCIAL_VERSION_KEY },
      select: { value: true },
    });
    globalForSocialCache.__tlsSocialLastVersionCheckAt = Date.now();
    return row?.value?.trim() || '0';
  } catch {
    return cached?.version || '0';
  }
}

export function invalidateSocialStoreCache(): void {
  globalForSocialCache.__tlsSocialStoreCache = null;
  globalForSocialCache.__tlsSocialLastVersionCheckAt = 0;
}

function getReadWatermarks(): Map<string, number> {
  if (!globalForSocialCache.__tlsSocialReadWatermarks) {
    globalForSocialCache.__tlsSocialReadWatermarks = new Map<string, number>();
  }
  return globalForSocialCache.__tlsSocialReadWatermarks;
}

export function recordSocialReadWatermark(convId: string, channel?: string, externalContactId?: string, atMs: number = Date.now()): void {
  const map = getReadWatermarks();
  if (convId) map.set(`id:${convId}`, Math.max(map.get(`id:${convId}`) || 0, atMs));
  if (channel && externalContactId) {
    const k = `ext:${channel}:${externalContactId.trim()}`;
    map.set(k, Math.max(map.get(k) || 0, atMs));
  }
  if (map.size > 2000) {
    // Trim oldest entries
    const keys = Array.from(map.keys()).slice(0, 500);
    for (const k of keys) map.delete(k);
  }
}

export function applyReadWatermarks(conversations: SocialConversation[]): SocialConversation[] {
  const map = getReadWatermarks();
  return conversations.map((c) => {
    const wmById = map.get(`id:${c.id}`) || 0;
    const wmByExt = c.externalContactId ? map.get(`ext:${c.channel}:${c.externalContactId.trim()}`) || 0 : 0;
    const convReadMs = c.lastReadAt ? new Date(c.lastReadAt).getTime() : 0;
    const bestReadMs = Math.max(wmById, wmByExt, Number.isFinite(convReadMs) ? convReadMs : 0);
    if (!bestReadMs) return c;

    const lastMsgMs = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
    const shouldBeRead = Number.isFinite(lastMsgMs) && lastMsgMs <= bestReadMs + 1500;
    const bestIso = new Date(bestReadMs).toISOString();

    if (shouldBeRead && ((c.unreadCount || 0) > 0 || c.lastReadAt !== bestIso)) {
      return { ...c, unreadCount: 0, lastReadAt: bestIso };
    }
    if (bestReadMs > convReadMs) {
      return { ...c, lastReadAt: bestIso };
    }
    return c;
  });
}

export function getDefaultSocialChannelConfig(): SocialChannelConfig {
  return {
    whatsapp: {
      enabled: true,
      mode: 'web_bridge',
      launchTarget: 'companion_popup',
      businessPhoneNumber: '+66 94 691 6668',
      defaultCountryCode: '66',
      autoOpenWaWebOnSend: true,
      phoneNumberId: '2388321071224396',
      accessToken: '',
      verifyToken: 'tls_whatsapp_verify_2026',
      businessAccountId: '425291338024231',
      appSecret: '',
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

function maskSecretValue(val?: string | null): string {
  if (!val) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (s.includes('••••')) return s;
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

export function maskSocialChannelConfigSecrets(config: SocialChannelConfig): SocialChannelConfig {
  return {
    ...config,
    whatsapp: {
      ...config.whatsapp,
      accessToken: maskSecretValue(config.whatsapp?.accessToken),
      appSecret: maskSecretValue(config.whatsapp?.appSecret),
      gatewayApiKey: maskSecretValue(config.whatsapp?.gatewayApiKey),
    },
    facebook: {
      ...config.facebook,
      pageAccessToken: maskSecretValue(config.facebook?.pageAccessToken),
    },
    instagram: {
      ...config.instagram,
      accessToken: maskSecretValue(config.instagram?.accessToken),
    },
    telegram: {
      ...config.telegram,
      botToken: maskSecretValue(config.telegram?.botToken),
    },
  };
}

export function isSafeExternalHttpUrl(rawUrl?: string | null): boolean {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    ) {
      return false;
    }
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function resolvePublicHttpsMediaUrl(url: string): Promise<string | null> {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/uploads/')) {
    try {
      const relWithoutLeadingSlash = trimmed.replace(/^\/+/, '');
      if (!relWithoutLeadingSlash.includes('..')) {
        const storageRoot = path.resolve(process.cwd(), 'storage');
        const publicRoot = path.resolve(process.cwd(), 'public');
        const candStorage = path.resolve(storageRoot, relWithoutLeadingSlash);
        const candPublic = path.resolve(publicRoot, relWithoutLeadingSlash);
        const existingFile =
          candStorage.startsWith(storageRoot) && fs.existsSync(candStorage)
            ? candStorage
            : candPublic.startsWith(publicRoot) && fs.existsSync(candPublic)
            ? candPublic
            : null;
        if (existingFile) {
          const buf = await fs.promises.readFile(existingFile);
          const ext = (path.extname(existingFile).replace(/^\./, '') || 'jpg').toLowerCase();
          const mime =
            ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          const gcsUrl = await uploadBufferToGcs(buf, {
            entityType: 'system',
            entityId: 'social_media',
            subType: 'relay',
            contentType: mime,
            extension: ext,
          }).catch(() => null);
          if (gcsUrl && gcsUrl.startsWith(`https://storage.googleapis.com/${bucketName}/`)) {
            const gcsKey = gcsUrl.slice(`https://storage.googleapis.com/${bucketName}/`.length);
            const signed = await generateDownloadUrl(gcsKey, 60 * 24 * 7).catch(() => null);
            if (signed && signed.startsWith('https://')) return signed;
            return gcsUrl;
          }
        }
      }
    } catch {}
  }

  if (trimmed.startsWith('https://storage.googleapis.com/')) {
    try {
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
      process.env.NEXT_PUBLIC_APP_URL || 'https://app.thatlaundryshop.com'
    ).replace(/\/+$/, '');
    return `${base}${trimmed}`;
  }
  return null;
}

export async function loadRawSocialInboxStore(knownVersion?: string): Promise<{
  conversations: SocialConversation[];
  messages: SocialMessage[];
  config: SocialChannelConfig;
  version: string;
}> {
  const cached = globalForSocialCache.__tlsSocialStoreCache;
  if (cached) {
    const dbVersion = knownVersion ?? (await getSocialStoreVersion());
    if (dbVersion !== '0' && dbVersion === cached.version) {
      return {
        conversations: cached.conversations.slice(),
        messages: cached.messages.slice(),
        config: {
          whatsapp: { ...cached.config.whatsapp },
          line: { ...cached.config.line },
          facebook: { ...cached.config.facebook },
          instagram: { ...cached.config.instagram },
          telegram: { ...cached.config.telegram },
        },
        version: cached.version,
      };
    }
  }

  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [SOCIAL_CONVERSATIONS_KEY, SOCIAL_MESSAGES_KEY, SOCIAL_CONFIG_KEY, SOCIAL_VERSION_KEY],
      },
    },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));

  let conversations: SocialConversation[] = [];
  let messages: SocialMessage[] = [];
  let config: SocialChannelConfig = getDefaultSocialChannelConfig();
  const version = (map.get(SOCIAL_VERSION_KEY) || '').trim() || String(Date.now());

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

  globalForSocialCache.__tlsSocialStoreCache = {
    version,
    conversations: conversations.slice(),
    messages: messages.slice(),
    config,
    loadedAt: Date.now(),
  };

  return { conversations, messages, config, version };
}

export async function saveRawSocialInboxStore(
  conversations: SocialConversation[],
  messages: SocialMessage[]
): Promise<string> {
  const trimmedConvs = applyReadWatermarks(conversations.slice(0, 1000));
  // Deduplicate by message ID & sort chronologically ASC before slicing(-5000)
  // so the 5,000 NEWEST messages are ALWAYS kept and brand-new messages are never dropped!
  const msgById = new Map<string, SocialMessage>();
  for (const m of messages) {
    if (m?.id) msgById.set(m.id, m);
  }
  const sortedMsgs = Array.from(msgById.values()).sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
  const trimmedMsgs = sortedMsgs.slice(-5000);
  const nextVersion = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

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
    prisma.setting.upsert({
      where: { key: SOCIAL_VERSION_KEY },
      update: { value: nextVersion },
      create: { key: SOCIAL_VERSION_KEY, value: nextVersion },
    }),
  ]);

  if (globalForSocialCache.__tlsSocialStoreCache) {
    globalForSocialCache.__tlsSocialStoreCache = {
      ...globalForSocialCache.__tlsSocialStoreCache,
      version: nextVersion,
      conversations: trimmedConvs.slice(),
      messages: trimmedMsgs.slice(),
      loadedAt: Date.now(),
    };
  }

  return nextVersion;
}

/**
 * Fast conversations-only save (~10x faster than full save because it skips rewriting the 4MB messages blob).
 * Use when only conversation metadata (unreadCount, lastReadAt, status, customerId, notes) changed.
 */
export async function saveRawSocialConversationsOnly(
  conversations: SocialConversation[]
): Promise<string> {
  const trimmedConvs = applyReadWatermarks(conversations.slice(0, 1000));
  const nextVersion = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  await Promise.all([
    prisma.setting.upsert({
      where: { key: SOCIAL_CONVERSATIONS_KEY },
      update: { value: JSON.stringify(trimmedConvs) },
      create: { key: SOCIAL_CONVERSATIONS_KEY, value: JSON.stringify(trimmedConvs) },
    }),
    prisma.setting.upsert({
      where: { key: SOCIAL_VERSION_KEY },
      update: { value: nextVersion },
      create: { key: SOCIAL_VERSION_KEY, value: nextVersion },
    }),
  ]);

  if (globalForSocialCache.__tlsSocialStoreCache) {
    globalForSocialCache.__tlsSocialStoreCache = {
      ...globalForSocialCache.__tlsSocialStoreCache,
      version: nextVersion,
      conversations: trimmedConvs.slice(),
      loadedAt: Date.now(),
    };
  }

  return nextVersion;
}

// In-process write serialization queue so concurrent WhatsApp/LINE messages & read-syncs never clobber each other
let socialStoreLockChain: Promise<void> = Promise.resolve();

export async function withSocialStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = socialStoreLockChain;
  let release!: () => void;
  socialStoreLockChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function phoneDigitsTail(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7) return digits;
  return digits.slice(-9);
}

function matchesConversationContact(
  c: SocialConversation,
  channel: SocialChannel,
  externalContactId: string,
  contactPhone?: string,
  customerId?: string | null
): boolean {
  if (c.channel !== channel) return false;
  if (c.externalContactId && externalContactId && c.externalContactId === externalContactId) {
    return true;
  }
  if (customerId && c.customerId && c.customerId === customerId) {
    return true;
  }
  if (channel === 'whatsapp') {
    const targetTail = phoneDigitsTail(contactPhone || externalContactId);
    if (targetTail.length >= 7) {
      const cExtTail = phoneDigitsTail(c.externalContactId);
      const cPhoneTail = phoneDigitsTail(c.contactPhone);
      if (cExtTail === targetTail || cPhoneTail === targetTail) {
        return true;
      }
    }
  }
  return false;
}

export async function syncExternalReadStatesInternal(
  channel: SocialChannel,
  readExternalIds: string[]
): Promise<{ clearedCount: number }> {
  if (!readExternalIds || readExternalIds.length === 0) return { clearedCount: 0 };
  return withSocialStoreLock(async () => {
    try {
      const { conversations, messages } = await loadRawSocialInboxStore();
      const nowIso = new Date().toISOString();
      let clearedCount = 0;
      const clearedIds: string[] = [];

      const normalizedIds = new Set(readExternalIds.map((id) => String(id || '').trim()).filter(Boolean));
      const normalizedTails = new Set(
        readExternalIds.map((id) => phoneDigitsTail(id)).filter((t) => t.length >= 7)
      );

      for (let i = 0; i < conversations.length; i++) {
        const c = conversations[i];
        if (c.channel !== channel || !(c.unreadCount > 0)) continue;
        const extMatch = c.externalContactId && normalizedIds.has(c.externalContactId.trim());
        const tailMatch =
          channel === 'whatsapp' &&
          (normalizedTails.has(phoneDigitsTail(c.externalContactId)) ||
            normalizedTails.has(phoneDigitsTail(c.contactPhone)));
        if (extMatch || tailMatch) {
          recordSocialReadWatermark(c.id, c.channel, c.externalContactId, Date.now());
          conversations[i] = { ...c, unreadCount: 0, lastReadAt: nowIso, updatedAt: nowIso };
          clearedIds.push(c.id);
          clearedCount++;
        }
      }

      if (clearedCount > 0) {
        // Instant 0ms SSE push BEFORE waiting for DB write
        try {
          const { publishOrderEvent } = await import('@/lib/realtime-bus');
          await publishOrderEvent({
            type: 'social.updated',
            jobId: `__SOCIAL_READ_${Date.now()}`,
            updatedAt: new Date(),
            socialPayload: {
              kind: 'read',
              readConversationIds: clearedIds.slice(0, 50),
              channel,
            },
          });
        } catch {}
        await saveRawSocialConversationsOnly(conversations);
      }
      return { clearedCount };
    } catch (err) {
      console.warn('[syncExternalReadStatesInternal] Error:', err);
      return { clearedCount: 0 };
    }
  });
}

export async function recordInboundSocialMessageInternal(input: {
  channel: SocialChannel;
  externalContactId: string;
  contactName?: string;
  contactPhone?: string;
  contactAvatar?: string;
  text: string;
  attachments?: SocialMessageAttachment[];
  customerId?: string | null;
  messageId?: string;
  externalMessageId?: string;
  deliveryMethod?: SocialMessage['deliveryMethod'];
  createdAt?: string;
  isHistorySync?: boolean;
}) {
  return withSocialStoreLock(async () => {
    try {
      const { conversations, messages } = await loadRawSocialInboxStore();

      // Deduplicate by deterministic external messageId (e.g. msg_wa_in_<key.id> or wamid)
      // so reconnect history syncs or Meta webhook retries NEVER duplicate bubbles or re-increment unreadCount!
      if (
        (input.messageId && messages.some((m) => m.id === input.messageId)) ||
        (input.externalMessageId &&
          messages.some((m) => m.externalMessageId === input.externalMessageId))
      ) {
        return { success: true, deduped: true };
      }

      const nowIso = new Date().toISOString();
      const msgIso =
        input.createdAt && !isNaN(new Date(input.createdAt).getTime())
          ? new Date(input.createdAt).toISOString()
          : nowIso;
      const msgMs = new Date(msgIso).getTime();

      const convIdx = conversations.findIndex((c) =>
        matchesConversationContact(
          c,
          input.channel,
          input.externalContactId,
          input.contactPhone,
          input.customerId
        )
      );

      let conv: SocialConversation;
      if (convIdx >= 0) {
        const existing = conversations[convIdx];
        const existingLastMs = existing.lastMessageAt
          ? new Date(existing.lastMessageAt).getTime()
          : 0;
        const isNewerOrEqual = msgMs >= existingLastMs;
        const lastReadMs = existing.lastReadAt ? new Date(existing.lastReadAt).getTime() : 0;
        const alreadyReadByWatermark = Boolean(lastReadMs && msgMs <= lastReadMs + 1500);
        const shouldBumpUnread = !alreadyReadByWatermark && (!input.isHistorySync || isNewerOrEqual);

        conv = {
          ...existing,
          contactName: input.contactName || existing.contactName,
          contactAvatar: input.contactAvatar || existing.contactAvatar,
          customerId: input.customerId || existing.customerId,
          lastMessageText: isNewerOrEqual ? input.text : existing.lastMessageText,
          lastMessageAt: isNewerOrEqual ? msgIso : existing.lastMessageAt,
          lastMessageDirection: isNewerOrEqual ? 'inbound' : existing.lastMessageDirection,
          unreadCount: shouldBumpUnread
            ? (existing.unreadCount || 0) + 1
            : existing.unreadCount || 0,
          status: 'open',
          updatedAt: isNewerOrEqual ? msgIso : existing.updatedAt,
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
          unreadCount: input.isHistorySync ? 0 : 1,
          lastMessageText: input.text,
          lastMessageAt: msgIso,
          lastMessageDirection: 'inbound',
          createdAt: msgIso,
          updatedAt: msgIso,
        };
      }

      const inboundMsg: SocialMessage = {
        id:
          input.messageId ||
          `msg_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: conv.id,
        channel: input.channel,
        direction: 'inbound',
        text: input.text,
        attachments: input.attachments,
        senderName: conv.contactName,
        status: 'delivered',
        deliveryMethod: input.deliveryMethod,
        externalMessageId: input.externalMessageId,
        createdAt: msgIso,
      };

      messages.push(inboundMsg);
      conversations.unshift(conv);

      const savedVersion = await saveRawSocialInboxStore(conversations, messages);

      // Push live message + conversation + committed version directly over SSE & PG NOTIFY!
      if (!input.isHistorySync) {
        try {
          const { publishOrderEvent } = await import('@/lib/realtime-bus');
          await publishOrderEvent({
            type: 'social.updated',
            jobId: `__SOCIAL_MSG_${inboundMsg.id}`,
            updatedAt: new Date(),
            socialPayload: {
              kind: 'message',
              conversation: conv,
              message: inboundMsg,
              version: savedVersion,
            },
          });
        } catch {}
      }

      return {
        success: true,
        conversation: conv,
        message: inboundMsg,
        conversations,
        messages,
      };
    } catch (err: any) {
      console.error('[recordInboundSocialMessageInternal] Error:', err);
      return { success: false, error: err?.message || 'Failed to record inbound message' };
    }
  });
}

export async function recordOutboundSocialMessageFromSystemInternal(input: {
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
  createdAt?: string;
  isHistorySync?: boolean;
}) {
  return withSocialStoreLock(async () => {
  try {
    const { conversations, messages } = await loadRawSocialInboxStore();

    if (input.isHistorySync && input.messageId && messages.some((m) => m.id === input.messageId)) {
      return { success: true, deduped: true };
    }

    const nowIso = new Date().toISOString();
    const msgIso =
      input.createdAt && !isNaN(new Date(input.createdAt).getTime())
        ? new Date(input.createdAt).toISOString()
        : nowIso;
    const msgMs = new Date(msgIso).getTime();

    const convIdx = conversations.findIndex((c) =>
      matchesConversationContact(
        c,
        input.channel,
        input.externalContactId,
        input.contactPhone,
        input.customerId
      )
    );

    let conv: SocialConversation;
    if (convIdx >= 0) {
      const existing = conversations[convIdx];
      const existingLastMs = existing.lastMessageAt
        ? new Date(existing.lastMessageAt).getTime()
        : 0;
      const isNewerOrEqual = msgMs >= existingLastMs;
      conv = {
        ...existing,
        externalContactId: input.externalContactId || existing.externalContactId,
        contactName: input.contactName || existing.contactName,
        contactPhone: input.contactPhone || existing.contactPhone,
        contactAvatar: input.contactAvatar || existing.contactAvatar,
        customerId: input.customerId || existing.customerId,
        lastMessageText: isNewerOrEqual ? input.text : existing.lastMessageText,
        lastMessageAt: isNewerOrEqual ? msgIso : existing.lastMessageAt,
        lastMessageDirection: isNewerOrEqual ? 'outbound' : existing.lastMessageDirection,
        unreadCount: isNewerOrEqual ? 0 : existing.unreadCount || 0,
        status: 'open',
        updatedAt: isNewerOrEqual ? msgIso : existing.updatedAt,
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
        lastMessageAt: msgIso,
        lastMessageDirection: 'outbound',
        createdAt: msgIso,
        updatedAt: msgIso,
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
      createdAt: msgIso,
    };

    if (existingMsgIdx >= 0) {
      messages[existingMsgIdx] = outboundMsg;
    } else {
      messages.push(outboundMsg);
    }
    conversations.unshift(conv);

    // Push live outbound message + conversation directly over SSE in <50ms BEFORE waiting for 4MB DB write!
    if (!input.isHistorySync) {
      try {
        const { publishOrderEvent } = await import('@/lib/realtime-bus');
        await publishOrderEvent({
          type: 'social.updated',
          jobId: `__SOCIAL_MSG_${outboundMsg.id}`,
          updatedAt: new Date(),
          socialPayload: {
            kind: 'message',
            conversation: conv,
            message: outboundMsg,
          },
        });
      } catch {}
    }

    await saveRawSocialInboxStore(conversations, messages);
    return { success: true, conversation: conv, message: outboundMsg };
  } catch (err: any) {
    console.warn('[recordOutboundSocialMessageFromSystemInternal] Non-fatal error:', err);
    return { success: false, error: err?.message };
  }
  });
}

const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

/**
 * Updates an outbound message's delivery/read receipt status (sent -> delivered -> read / failed)
 * when Meta WhatsApp Cloud API sends a `statuses` webhook event.
 */
export async function updateOutboundSocialMessageStatusInternal(input: {
  externalMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorText?: string;
}): Promise<{ updated: boolean }> {
  const extId = (input.externalMessageId || '').trim();
  if (!extId) return { updated: false };

  return withSocialStoreLock(async () => {
    try {
      const { conversations, messages } = await loadRawSocialInboxStore();
      const idx = messages.findIndex((m) => m.externalMessageId === extId);
      if (idx < 0) return { updated: false };

      const existing = messages[idx];
      const currentRank = STATUS_RANK[existing.status] || 0;
      const incomingRank = STATUS_RANK[input.status] || 0;

      // Never downgrade 'read' back to 'delivered' or 'sent' due to out-of-order webhook arrivals
      if (existing.status !== 'failed' && input.status !== 'failed' && incomingRank <= currentRank) {
        return { updated: false };
      }

      const updatedMsg: SocialMessage = {
        ...existing,
        status: input.status,
        ...(input.errorText ? { externalError: input.errorText } : {}),
      };
      messages[idx] = updatedMsg;

      const conv = conversations.find((c) => c.id === updatedMsg.conversationId);
      try {
        const { publishOrderEvent } = await import('@/lib/realtime-bus');
        await publishOrderEvent({
          type: 'social.updated',
          jobId: `__SOCIAL_STATUS_${updatedMsg.id}_${input.status}`,
          updatedAt: new Date(),
          socialPayload: {
            kind: 'message',
            conversation: conv,
            message: updatedMsg,
          },
        });
      } catch {}

      await saveRawSocialInboxStore(conversations, messages);
      return { updated: true };
    } catch (err) {
      console.warn('[updateOutboundSocialMessageStatusInternal] Error:', err);
      return { updated: false };
    }
  });
}
