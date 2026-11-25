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
  SocialMessageReplyRef,
} from '@/types/social-inbox';

export const SOCIAL_CONVERSATIONS_KEY = 'TLS_SOCIAL_CONVERSATIONS_V1';
export const SOCIAL_MESSAGES_KEY = 'TLS_SOCIAL_MESSAGES_V1';
export const SOCIAL_CONFIG_KEY = 'TLS_SOCIAL_CHANNEL_CONFIG_V1';
export const SOCIAL_VERSION_KEY = 'TLS_SOCIAL_VERSION_V1';
export const SOCIAL_DB_MIGRATED_KEY = 'TLS_SOCIAL_DB_MIGRATED_V2';

interface SocialStoreMemoryCache {
  version: string;
  conversations: SocialConversation[];
  messages: SocialMessage[];
  config: SocialChannelConfig;
  loadedAt: number;
}

const globalForSocialCache = globalThis as unknown as {
  __tlsSocialStoreCache?: SocialStoreMemoryCache | null;
  __tlsSocialConfigCache?: { config: SocialChannelConfig; loadedAt: number } | null;
  __tlsSocialReadWatermarks?: Map<string, number>;
  __tlsSocialLastVersionCheckAt?: number;
  __tlsSocialSchemaEnsurePromise?: Promise<void> | null;
  __tlsSocialSchemaReady?: boolean;
};

function safeDate(val?: string | Date | null, fallback: Date = new Date()): Date {
  if (!val) return fallback;
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

function parseJsonSafe<T>(raw?: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function mapDbRowToConversation(row: {
  id: string;
  channel: string;
  externalContactId: string;
  contactName: string;
  contactPhone: string | null;
  contactAvatar: string | null;
  contactHandle: string | null;
  customerId: string | null;
  customerName: string | null;
  customerMemberId: string | null;
  customerWalletBalance: number | null;
  brand: string | null;
  branchId: string | null;
  branchName: string | null;
  status: string;
  unreadCount: number;
  lastReadAt: Date | null;
  lastReadById?: string | null;
  lastReadByName?: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  tagsJson: string | null;
  notes: string | null;
  lastMessageText: string;
  lastMessageAt: Date;
  lastMessageDirection: string;
  createdAt: Date;
  updatedAt: Date;
}): SocialConversation {
  const tags = parseJsonSafe<string[]>(row.tagsJson);
  return {
    id: row.id,
    channel: row.channel as SocialChannel,
    externalContactId: row.externalContactId,
    contactName: row.contactName,
    contactPhone: row.contactPhone ?? undefined,
    contactAvatar: row.contactAvatar ?? undefined,
    contactHandle: row.contactHandle ?? undefined,
    customerId: row.customerId,
    customerName: row.customerName,
    customerMemberId: row.customerMemberId,
    customerWalletBalance: row.customerWalletBalance ?? 0,
    brand: (row.brand as SocialConversation['brand']) || 'that_laundry_shop',
    branchId: row.branchId,
    branchName: row.branchName,
    status: (row.status as SocialConversation['status']) || 'open',
    unreadCount: row.unreadCount || 0,
    lastReadAt: row.lastReadAt ? row.lastReadAt.toISOString() : undefined,
    lastReadById: row.lastReadById ?? undefined,
    lastReadByName: row.lastReadByName ?? undefined,
    assignedStaffId: row.assignedStaffId,
    assignedStaffName: row.assignedStaffName,
    tags: Array.isArray(tags) ? tags : undefined,
    notes: row.notes ?? undefined,
    lastMessageText: row.lastMessageText || '',
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessageDirection: (row.lastMessageDirection as SocialMessage['direction']) || 'inbound',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapConversationToDbData(c: SocialConversation) {
  const now = new Date();
  return {
    id: c.id,
    channel: c.channel,
    externalContactId: c.externalContactId || '',
    contactName: c.contactName || c.externalContactId || 'Customer',
    contactPhone: c.contactPhone ?? null,
    contactAvatar: c.contactAvatar ?? null,
    contactHandle: c.contactHandle ?? null,
    customerId: c.customerId ?? null,
    customerName: c.customerName ?? null,
    customerMemberId: c.customerMemberId ?? null,
    customerWalletBalance: c.customerWalletBalance ?? 0,
    brand: c.brand || 'that_laundry_shop',
    branchId: c.branchId ?? null,
    branchName: c.branchName ?? null,
    status: c.status || 'open',
    unreadCount: Math.max(0, Number(c.unreadCount) || 0),
    lastReadAt: c.lastReadAt ? safeDate(c.lastReadAt, now) : null,
    lastReadById: c.lastReadById ?? null,
    lastReadByName: c.lastReadByName ?? null,
    assignedStaffId: c.assignedStaffId ?? null,
    assignedStaffName: c.assignedStaffName ?? null,
    tagsJson: Array.isArray(c.tags) && c.tags.length > 0 ? JSON.stringify(c.tags) : null,
    notes: c.notes ?? null,
    lastMessageText: c.lastMessageText || '',
    lastMessageAt: safeDate(c.lastMessageAt, now),
    lastMessageDirection: c.lastMessageDirection || 'inbound',
    createdAt: safeDate(c.createdAt, now),
    updatedAt: safeDate(c.updatedAt, now),
  };
}

export function mapDbRowToMessage(row: {
  id: string;
  conversationId: string;
  channel: string;
  direction: string;
  text: string;
  attachmentsJson: string | null;
  replyToJson: string | null;
  senderName: string;
  senderId: string | null;
  senderRole: string | null;
  status: string;
  deliveryMethod: string | null;
  externalMessageId: string | null;
  externalError: string | null;
  createdAt: Date;
}): SocialMessage {
  const attachments = parseJsonSafe<SocialMessageAttachment[]>(row.attachmentsJson);
  const replyTo = parseJsonSafe<SocialMessageReplyRef>(row.replyToJson);
  return {
    id: row.id,
    conversationId: row.conversationId,
    channel: row.channel as SocialChannel,
    direction: (row.direction as SocialMessage['direction']) || 'inbound',
    text: row.text || '',
    attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined,
    replyTo: replyTo && typeof replyTo === 'object' ? replyTo : undefined,
    senderName: row.senderName || '',
    senderId: row.senderId ?? undefined,
    senderRole: row.senderRole ?? undefined,
    status: (row.status as SocialMessage['status']) || 'delivered',
    deliveryMethod: (row.deliveryMethod as SocialMessage['deliveryMethod']) ?? undefined,
    externalMessageId: row.externalMessageId ?? undefined,
    externalError: row.externalError ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapMessageToDbData(m: SocialMessage) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    channel: m.channel,
    direction: m.direction || 'inbound',
    text: m.text || '',
    attachmentsJson:
      Array.isArray(m.attachments) && m.attachments.length > 0
        ? JSON.stringify(m.attachments)
        : null,
    replyToJson: m.replyTo ? JSON.stringify(m.replyTo) : null,
    senderName: m.senderName || '',
    senderId: m.senderId ?? null,
    senderRole: m.senderRole ?? null,
    status: m.status || 'delivered',
    deliveryMethod: m.deliveryMethod ?? null,
    externalMessageId: m.externalMessageId ?? null,
    externalError: m.externalError ?? null,
    createdAt: safeDate(m.createdAt),
  };
}

/**
 * Self-bootstrapping additive SQL schema + zero-downtime migration from legacy Setting JSON blobs
 * (`TLS_SOCIAL_CONVERSATIONS_V1` & `TLS_SOCIAL_MESSAGES_V1`) into dedicated indexed PostgreSQL tables.
 * Leaves legacy Setting rows untouched as a read-only backup.
 */
export async function ensureSocialInboxSchemaAndMigrate(): Promise<void> {
  if (globalForSocialCache.__tlsSocialSchemaReady) return;
  if (globalForSocialCache.__tlsSocialSchemaEnsurePromise) {
    return globalForSocialCache.__tlsSocialSchemaEnsurePromise;
  }

  globalForSocialCache.__tlsSocialSchemaEnsurePromise = (async () => {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SocialConversation" (
          "id" TEXT NOT NULL,
          "channel" TEXT NOT NULL,
          "externalContactId" TEXT NOT NULL,
          "contactName" TEXT NOT NULL,
          "contactPhone" TEXT,
          "contactAvatar" TEXT,
          "contactHandle" TEXT,
          "customerId" TEXT,
          "customerName" TEXT,
          "customerMemberId" TEXT,
          "customerWalletBalance" DOUBLE PRECISION DEFAULT 0,
          "brand" TEXT DEFAULT 'that_laundry_shop',
          "branchId" TEXT,
          "branchName" TEXT,
          "status" TEXT NOT NULL DEFAULT 'open',
          "unreadCount" INTEGER NOT NULL DEFAULT 0,
          "lastReadAt" TIMESTAMP(3),
          "lastReadById" TEXT,
          "lastReadByName" TEXT,
          "assignedStaffId" TEXT,
          "assignedStaffName" TEXT,
          "tagsJson" TEXT,
          "notes" TEXT,
          "lastMessageText" TEXT NOT NULL DEFAULT '',
          "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastMessageDirection" TEXT NOT NULL DEFAULT 'inbound',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SocialConversation_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "SocialConversation" ADD COLUMN IF NOT EXISTS "lastReadById" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "SocialConversation" ADD COLUMN IF NOT EXISTS "lastReadByName" TEXT;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialConversation_channel_externalContactId_idx"
        ON "SocialConversation"("channel", "externalContactId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialConversation_customerId_idx"
        ON "SocialConversation"("customerId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialConversation_lastMessageAt_idx"
        ON "SocialConversation"("lastMessageAt" DESC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialConversation_updatedAt_idx"
        ON "SocialConversation"("updatedAt" DESC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialConversation_channel_unreadCount_idx"
        ON "SocialConversation"("channel", "unreadCount");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SocialMessage" (
          "id" TEXT NOT NULL,
          "conversationId" TEXT NOT NULL,
          "channel" TEXT NOT NULL,
          "direction" TEXT NOT NULL,
          "text" TEXT NOT NULL DEFAULT '',
          "attachmentsJson" TEXT,
          "replyToJson" TEXT,
          "senderName" TEXT NOT NULL DEFAULT '',
          "senderId" TEXT,
          "senderRole" TEXT,
          "status" TEXT NOT NULL DEFAULT 'delivered',
          "deliveryMethod" TEXT,
          "externalMessageId" TEXT,
          "externalError" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SocialMessage_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialMessage_conversationId_createdAt_idx"
        ON "SocialMessage"("conversationId", "createdAt" ASC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialMessage_createdAt_idx"
        ON "SocialMessage"("createdAt" DESC);
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialMessage_externalMessageId_idx"
        ON "SocialMessage"("externalMessageId");
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SocialMediaJob" (
          "id" TEXT NOT NULL,
          "messageId" TEXT NOT NULL,
          "conversationId" TEXT NOT NULL,
          "mediaId" TEXT NOT NULL,
          "senderPhone" TEXT,
          "fallbackMimeType" TEXT,
          "originalFilename" TEXT,
          "attachmentType" TEXT NOT NULL DEFAULT 'image',
          "attachmentName" TEXT NOT NULL DEFAULT 'WhatsApp Attachment',
          "status" TEXT NOT NULL DEFAULT 'pending',
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastError" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SocialMediaJob_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialMediaJob_status_nextRetryAt_idx"
        ON "SocialMediaJob"("status", "nextRetryAt");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "SocialMediaJob_messageId_idx"
        ON "SocialMediaJob"("messageId");
      `);

      // One-time automatic data migration from Setting JSON blobs
      const migRow = await prisma.setting.findUnique({
        where: { key: SOCIAL_DB_MIGRATED_KEY },
        select: { value: true },
      });

      if (migRow?.value !== 'true') {
        const legacyRows = await prisma.setting.findMany({
          where: { key: { in: [SOCIAL_CONVERSATIONS_KEY, SOCIAL_MESSAGES_KEY] } },
        });
        const legacyMap = new Map(legacyRows.map((r) => [r.key, r.value]));

        const rawConvs = parseJsonSafe<SocialConversation[]>(
          legacyMap.get(SOCIAL_CONVERSATIONS_KEY)
        );
        const rawMsgs = parseJsonSafe<SocialMessage[]>(legacyMap.get(SOCIAL_MESSAGES_KEY));

        if (Array.isArray(rawConvs) && rawConvs.length > 0) {
          const seenConvIds = new Set<string>();
          const convDataList = [];
          for (const c of rawConvs) {
            if (!c?.id || seenConvIds.has(c.id)) continue;
            seenConvIds.add(c.id);
            convDataList.push(mapConversationToDbData(c));
          }
          for (let i = 0; i < convDataList.length; i += 250) {
            await prisma.socialConversation.createMany({
              data: convDataList.slice(i, i + 250),
              skipDuplicates: true,
            });
          }
        }

        if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
          const seenMsgIds = new Set<string>();
          const msgDataList = [];
          for (const m of rawMsgs) {
            if (!m?.id || !m?.conversationId || seenMsgIds.has(m.id)) continue;
            seenMsgIds.add(m.id);
            msgDataList.push(mapMessageToDbData(m));
          }
          for (let i = 0; i < msgDataList.length; i += 500) {
            await prisma.socialMessage.createMany({
              data: msgDataList.slice(i, i + 500),
              skipDuplicates: true,
            });
          }
        }

        await prisma.setting.upsert({
          where: { key: SOCIAL_DB_MIGRATED_KEY },
          update: { value: 'true' },
          create: { key: SOCIAL_DB_MIGRATED_KEY, value: 'true' },
        });
      }

      globalForSocialCache.__tlsSocialSchemaReady = true;
    } catch (err) {
      globalForSocialCache.__tlsSocialSchemaEnsurePromise = null;
      throw err;
    }
  })();

  return globalForSocialCache.__tlsSocialSchemaEnsurePromise;
}

export async function getSocialStoreVersion(forceDb = false): Promise<string> {
  const cached = globalForSocialCache.__tlsSocialStoreCache;
  const lastCheck = globalForSocialCache.__tlsSocialLastVersionCheckAt || 0;
  if (!forceDb && cached && cached.version && Date.now() - lastCheck < 400) {
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
  globalForSocialCache.__tlsSocialConfigCache = null;
  globalForSocialCache.__tlsSocialLastVersionCheckAt = 0;
}

export async function bumpSocialStoreVersion(): Promise<string> {
  const nextVersion = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await prisma.setting.upsert({
    where: { key: SOCIAL_VERSION_KEY },
    update: { value: nextVersion },
    create: { key: SOCIAL_VERSION_KEY, value: nextVersion },
  });
  invalidateSocialStoreCache();
  return nextVersion;
}

function getReadWatermarks(): Map<string, number> {
  if (!globalForSocialCache.__tlsSocialReadWatermarks) {
    globalForSocialCache.__tlsSocialReadWatermarks = new Map<string, number>();
  }
  return globalForSocialCache.__tlsSocialReadWatermarks;
}

export function recordSocialReadWatermark(
  convId: string,
  channel?: string,
  externalContactId?: string,
  atMs: number = Date.now()
): void {
  const map = getReadWatermarks();
  if (convId) map.set(`id:${convId}`, Math.max(map.get(`id:${convId}`) || 0, atMs));
  if (channel && externalContactId) {
    const k = `ext:${channel}:${externalContactId.trim()}`;
    map.set(k, Math.max(map.get(k) || 0, atMs));
  }
  if (map.size > 2000) {
    const keys = Array.from(map.keys()).slice(0, 500);
    for (const k of keys) map.delete(k);
  }
}

export function applyReadWatermarks(conversations: SocialConversation[]): SocialConversation[] {
  const map = getReadWatermarks();
  return conversations.map((c) => {
    const wmById = map.get(`id:${c.id}`) || 0;
    const wmByExt = c.externalContactId
      ? map.get(`ext:${c.channel}:${c.externalContactId.trim()}`) || 0
      : 0;
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

export async function loadSocialChannelConfig(
  forceDb = false,
  throwOnDbError = false
): Promise<SocialChannelConfig> {
  const cached = globalForSocialCache.__tlsSocialConfigCache;
  if (!forceDb && cached && Date.now() - cached.loadedAt < 5000) {
    return {
      whatsapp: { ...cached.config.whatsapp },
      line: { ...cached.config.line },
      facebook: { ...cached.config.facebook },
      instagram: { ...cached.config.instagram },
      telegram: { ...cached.config.telegram },
      ...(cached.config.email ? { email: { ...cached.config.email } } : {}),
    };
  }
  let config = getDefaultSocialChannelConfig();
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SOCIAL_CONFIG_KEY },
      select: { value: true },
    });
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === 'object') {
        config = {
          whatsapp: { ...config.whatsapp, ...(parsed.whatsapp || {}) },
          line: { ...config.line, ...(parsed.line || {}) },
          facebook: { ...config.facebook, ...(parsed.facebook || {}) },
          instagram: { ...config.instagram, ...(parsed.instagram || {}) },
          telegram: { ...config.telegram, ...(parsed.telegram || {}) },
          ...(parsed.email ? { email: { ...parsed.email } } : {}),
        };
      }
    }
  } catch (err) {
    if (throwOnDbError && !cached) {
      throw err;
    }
    if (cached) {
      return {
        whatsapp: { ...cached.config.whatsapp },
        line: { ...cached.config.line },
        facebook: { ...cached.config.facebook },
        instagram: { ...cached.config.instagram },
        telegram: { ...cached.config.telegram },
      };
    }
  }
  globalForSocialCache.__tlsSocialConfigCache = {
    config,
    loadedAt: Date.now(),
  };
  return config;
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
    ...(config.email
      ? {
          email: {
            ...config.email,
            appPassword: maskSecretValue(config.email?.appPassword),
          },
        }
      : {}),
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

// ============================================================================
// ROW-LEVEL POSTGRESQL QUERIES & ATOMIC MUTATIONS
// ============================================================================

export async function querySocialConversations(limit = 1000): Promise<SocialConversation[]> {
  await ensureSocialInboxSchemaAndMigrate();
  const [unreadRows, recentRows] = await Promise.all([
    prisma.socialConversation.findMany({
      where: { unreadCount: { gt: 0 } },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
    }),
    prisma.socialConversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
    }),
  ]);

  const byId = new Map<string, SocialConversation>();
  for (const r of [...unreadRows, ...recentRows]) {
    if (!byId.has(r.id)) {
      byId.set(r.id, mapDbRowToConversation(r));
    }
  }

  const watered = applyReadWatermarks(Array.from(byId.values()));
  const isActiveConv = (c: SocialConversation): number =>
    c.lastMessageText &&
    c.lastMessageText !== 'Connected via LINE Official Account (@thatlaundryshop)' &&
    c.lastMessageText !== '[Followed LINE OA]'
      ? 1
      : 0;

  watered.sort((a, b) => {
    const aUnread = (a.unreadCount || 0) > 0 ? 1 : 0;
    const bUnread = (b.unreadCount || 0) > 0 ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    const aActive = isActiveConv(a);
    const bActive = isActiveConv(b);
    if (aActive !== bActive) return bActive - aActive;
    const aCrm = a.customerId ? 1 : 0;
    const bCrm = b.customerId ? 1 : 0;
    if (!aActive && !bActive && aCrm !== bCrm) return bCrm - aCrm;
    return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
  });

  return watered.slice(0, limit);
}

export async function queryConversationMessages(
  conversationId: string,
  limit = 1000
): Promise<SocialMessage[]> {
  await ensureSocialInboxSchemaAndMigrate();
  const rows = await prisma.socialMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  return rows.map(mapDbRowToMessage);
}

export async function queryRecentSocialMessages(limit = 250): Promise<SocialMessage[]> {
  await ensureSocialInboxSchemaAndMigrate();
  const rows = await prisma.socialMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.reverse().map(mapDbRowToMessage);
}

export async function queryDeltaSocialMessages(
  sinceDate: Date,
  limit = 500
): Promise<SocialMessage[]> {
  await ensureSocialInboxSchemaAndMigrate();
  const recentMediaJobs = await prisma.socialMediaJob.findMany({
    where: {
      status: 'completed',
      updatedAt: { gte: sinceDate },
    },
    select: { messageId: true },
    take: 100,
  });
  const mediaMsgIds = recentMediaJobs.map((j) => j.messageId);
  const rows = await prisma.socialMessage.findMany({
    where:
      mediaMsgIds.length > 0
        ? { OR: [{ createdAt: { gte: sinceDate } }, { id: { in: mediaMsgIds } }] }
        : { createdAt: { gte: sinceDate } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  return rows.map(mapDbRowToMessage);
}

export async function findSocialConversationById(id: string): Promise<SocialConversation | null> {
  if (!id) return null;
  await ensureSocialInboxSchemaAndMigrate();
  const row = await prisma.socialConversation.findUnique({ where: { id } });
  return row ? applyReadWatermarks([mapDbRowToConversation(row)])[0] : null;
}

function phoneDigitsTail(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7) return digits;
  return digits.slice(-9);
}

export async function findSocialConversationForContact(opts: {
  channel: SocialChannel;
  externalContactId: string;
  contactPhone?: string;
  customerId?: string | null;
}): Promise<SocialConversation | null> {
  await ensureSocialInboxSchemaAndMigrate();
  const ext = (opts.externalContactId || '').trim();

  // 1. ALWAYS match exact (channel + externalContactId) FIRST so distinct LINE UIDs / Group IDs
  //    or distinct WhatsApp phones NEVER collide or hijack another contact's conversation!
  if (ext) {
    const exactMatch = await prisma.socialConversation.findFirst({
      where: { channel: opts.channel, externalContactId: ext },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (exactMatch) return mapDbRowToConversation(exactMatch);
  }

  // 2. For LINE, if ext is a valid LINE Target ID (U... / C... / R...), do NOT fall back to customerId
  //    because two different LINE accounts or a Group ID must NEVER be merged into another UID's thread!
  const isDistinctLineTarget =
    opts.channel === 'line' && /^[UCR][0-9a-f]{32}$/i.test(ext);

  if (opts.customerId && !isDistinctLineTarget) {
    const byCustomer = await prisma.socialConversation.findFirst({
      where: { channel: opts.channel, customerId: opts.customerId },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (byCustomer) return mapDbRowToConversation(byCustomer);
  }

  if (opts.channel === 'whatsapp') {
    const tail = phoneDigitsTail(opts.contactPhone || ext);
    if (tail.length >= 7) {
      const waRows = await prisma.socialConversation.findMany({
        where: {
          channel: 'whatsapp',
          OR: [
            { externalContactId: { endsWith: tail } },
            { contactPhone: { contains: tail.slice(-4) } },
          ],
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 25,
      });
      for (const r of waRows) {
        if (
          phoneDigitsTail(r.externalContactId) === tail ||
          phoneDigitsTail(r.contactPhone) === tail
        ) {
          return mapDbRowToConversation(r);
        }
      }
    }
  }

  return null;
}

export async function upsertSocialConversationRow(
  conv: SocialConversation,
  shouldBumpVersion = true
): Promise<{ conversation: SocialConversation; version?: string }> {
  await ensureSocialInboxSchemaAndMigrate();
  const data = mapConversationToDbData(conv);
  const saved = await prisma.socialConversation.upsert({
    where: { id: conv.id },
    create: data,
    update: {
      channel: data.channel,
      externalContactId: data.externalContactId,
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      contactAvatar: data.contactAvatar,
      contactHandle: data.contactHandle,
      customerId: data.customerId,
      customerName: data.customerName,
      customerMemberId: data.customerMemberId,
      customerWalletBalance: data.customerWalletBalance,
      brand: data.brand,
      branchId: data.branchId,
      branchName: data.branchName,
      status: data.status,
      unreadCount: data.unreadCount,
      lastReadAt: data.lastReadAt,
      lastReadById: data.lastReadById,
      lastReadByName: data.lastReadByName,
      assignedStaffId: data.assignedStaffId,
      assignedStaffName: data.assignedStaffName,
      tagsJson: data.tagsJson,
      notes: data.notes,
      lastMessageText: data.lastMessageText,
      lastMessageAt: data.lastMessageAt,
      lastMessageDirection: data.lastMessageDirection,
      updatedAt: data.updatedAt,
    },
  });
  const version = shouldBumpVersion ? await bumpSocialStoreVersion() : undefined;
  return { conversation: mapDbRowToConversation(saved), version };
}

export interface PendingSocialMediaJobInput {
  mediaId: string;
  senderPhone?: string;
  fallbackMimeType?: string;
  originalFilename?: string;
  attachmentType: 'image' | 'file';
  attachmentName: string;
}

/**
 * Atomically inserts a single `SocialMessage` row and updates/creates ONLY its parent
 * `SocialConversation` row inside one PostgreSQL transaction — zero cross-chat overwrites!
 * Uses `pg_advisory_xact_lock` on the message/external ID so concurrent retries produce strictly ONE message.
 */
export async function insertSocialMessageAndTouchConversation(opts: {
  message: SocialMessage;
  conversation: SocialConversation;
  incrementUnread?: boolean;
  clearUnreadOnOutbound?: boolean;
  pendingMediaJob?: PendingSocialMediaJobInput;
}): Promise<{
  conversation: SocialConversation;
  message: SocialMessage;
  version: string;
  deduped?: boolean;
  mutated?: boolean;
}> {
  await ensureSocialInboxSchemaAndMigrate();
  const msgData = mapMessageToDbData(opts.message);
  const convData = mapConversationToDbData(opts.conversation);
  const nextVersion = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const lockKey = `social_msg:${msgData.externalMessageId || msgData.id}`;
  const contactKeyTail =
    convData.channel === 'whatsapp'
      ? phoneDigitsTail(convData.externalContactId) || convData.externalContactId
      : convData.externalContactId;
  const contactLockKey = `social_contact:${convData.channel}:${contactKeyTail}`;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${contactLockKey}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const dedupConds: any[] = [{ id: msgData.id }];
    if (msgData.externalMessageId) {
      dedupConds.push({ externalMessageId: msgData.externalMessageId });
    }
    let existingMsg = await tx.socialMessage.findFirst({
      where: { OR: dedupConds },
    });

    if (existingMsg) {
      const existingConvRow = await tx.socialConversation.findUnique({
        where: { id: existingMsg.conversationId },
      });
      if (existingConvRow) {
        return { savedConv: existingConvRow, savedMsg: existingMsg, deduped: true, mutated: false };
      }
    }

    // Check by convData.id first; if not found, check if a concurrent request just created a conversation for the same contact
    let existingConv = await tx.socialConversation.findUnique({
      where: { id: convData.id },
    });
    if (!existingConv && convData.externalContactId) {
      existingConv = await tx.socialConversation.findFirst({
        where: {
          channel: convData.channel,
          externalContactId: convData.externalContactId,
        },
        orderBy: { lastMessageAt: 'desc' },
      });
      if (existingConv) {
        convData.id = existingConv.id;
        msgData.conversationId = existingConv.id;
      }
    }

    // Dual-Sync Cross-Source Deduplication for WhatsApp (Cloud API + Baileys QR Bridge):
    // When both Meta Cloud API Webhook (`wamid.HBg...`) and Linked WhatsApp QR Bridge (`3EB0...` / `A5...`)
    // deliver the exact same inbound or outbound message within ±15 seconds, deduplicate by
    // (conversationId + direction + normalized text + timestamp window) so they NEVER collide or create duplicate bubbles!
    if (!existingMsg && existingConv && msgData.channel === 'whatsapp' && msgData.text) {
      const windowStart = new Date(msgData.createdAt.getTime() - 15_000);
      const windowEnd = new Date(msgData.createdAt.getTime() + 15_000);
      const isPhotoPlaceholder =
        msgData.text.startsWith('📷 [') ||
        msgData.text.startsWith('🎨 [') ||
        msgData.text.startsWith('🎥 [') ||
        msgData.text.startsWith('🎤 [');

      const candidates = await tx.socialMessage.findMany({
        where: {
          conversationId: existingConv.id,
          direction: msgData.direction,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const normalizeWaText = (t: string | null | undefined) =>
        (t || '').replace(/\r\n/g, '\n').trim();
      const normText = normalizeWaText(msgData.text);
      const matchedDup = candidates.find((c) => {
        if (normalizeWaText(c.text) === normText) return true;
        if (
          isPhotoPlaceholder &&
          ((c.text || '').startsWith('📷 [') ||
            (c.text || '').startsWith('🎨 [') ||
            (c.text || '').startsWith('🎥 [') ||
            (c.text || '').startsWith('🎤 [')) &&
          Math.abs(c.createdAt.getTime() - msgData.createdAt.getTime()) <= 15_000
        ) {
          return true;
        }
        return false;
      });

      if (matchedDup) {
        // Enrich the existing row if the newly arrived source carries wamid or resolved attachments
        const needsEnrich =
          (!matchedDup.externalMessageId && Boolean(msgData.externalMessageId)) ||
          (!matchedDup.attachmentsJson && Boolean(msgData.attachmentsJson));
        const enrichedMsg = needsEnrich
          ? await tx.socialMessage.update({
              where: { id: matchedDup.id },
              data: {
                externalMessageId: matchedDup.externalMessageId || msgData.externalMessageId,
                attachmentsJson: matchedDup.attachmentsJson || msgData.attachmentsJson,
              },
            })
          : matchedDup;

        // If this is an outbound reply echo arriving on a conversation that still had unreadCount > 0, clear it
        let finalConvRow = existingConv;
        let didClearUnread = false;
        if (
          msgData.direction === 'outbound' &&
          opts.clearUnreadOnOutbound &&
          existingConv.unreadCount > 0
        ) {
          didClearUnread = true;
          const readNowDate = new Date(Math.max(Date.now(), msgData.createdAt.getTime()));
          finalConvRow = await tx.socialConversation.update({
            where: { id: existingConv.id },
            data: {
              unreadCount: 0,
              lastReadAt: readNowDate,
              lastReadById: existingConv.lastReadById || msgData.senderId || null,
              lastReadByName:
                existingConv.lastReadByName || msgData.senderName || 'Admin (WhatsApp App)',
            },
          });
        }

        const didMutate = needsEnrich || didClearUnread;
        if (didMutate) {
          await tx.setting.upsert({
            where: { key: SOCIAL_VERSION_KEY },
            update: { value: nextVersion },
            create: { key: SOCIAL_VERSION_KEY, value: nextVersion },
          });
        }

        return { savedConv: finalConvRow, savedMsg: enrichedMsg, deduped: true, mutated: didMutate };
      }
    }

    const savedMsg = await tx.socialMessage.upsert({
      where: { id: msgData.id },
      create: msgData,
      update: {
        text: msgData.text,
        attachmentsJson: msgData.attachmentsJson,
        replyToJson: msgData.replyToJson,
        status: msgData.status,
        deliveryMethod: msgData.deliveryMethod,
        externalMessageId: msgData.externalMessageId,
        externalError: msgData.externalError,
      },
    });

    if (opts.pendingMediaJob?.mediaId) {
      const jobId = `mediajob_${savedMsg.id}`;
      await tx.socialMediaJob.upsert({
        where: { id: jobId },
        create: {
          id: jobId,
          messageId: savedMsg.id,
          conversationId: convData.id,
          mediaId: opts.pendingMediaJob.mediaId,
          senderPhone: opts.pendingMediaJob.senderPhone ?? null,
          fallbackMimeType: opts.pendingMediaJob.fallbackMimeType ?? null,
          originalFilename: opts.pendingMediaJob.originalFilename ?? null,
          attachmentType: opts.pendingMediaJob.attachmentType,
          attachmentName: opts.pendingMediaJob.attachmentName,
          status: 'pending',
          attempts: 0,
          nextRetryAt: new Date(),
        },
        update: {},
      });
    }

    let savedConv;
    if (existingConv) {
      // Allow 2s tolerance because Meta webhook timestamps are in whole seconds (.000Z) while DB timestamps have ms
      const isNewerOrEqual =
        msgData.createdAt.getTime() >= existingConv.lastMessageAt.getTime() - 2000;
      const isOutbound = msgData.direction === 'outbound';
      const shouldClearUnread = isOutbound && (isNewerOrEqual || Boolean(opts.clearUnreadOnOutbound));
      const readNowDate = new Date(Math.max(Date.now(), msgData.createdAt.getTime()));

      savedConv = await tx.socialConversation.update({
        where: { id: existingConv.id },
        data: {
          externalContactId: convData.externalContactId || existingConv.externalContactId,
          contactName: convData.contactName || existingConv.contactName,
          contactPhone: convData.contactPhone || existingConv.contactPhone,
          contactAvatar: convData.contactAvatar || existingConv.contactAvatar,
          contactHandle: convData.contactHandle || existingConv.contactHandle,
          customerId: convData.customerId ?? existingConv.customerId,
          customerName: convData.customerName ?? existingConv.customerName,
          customerMemberId: convData.customerMemberId ?? existingConv.customerMemberId,
          customerWalletBalance:
            convData.customerWalletBalance ?? existingConv.customerWalletBalance,
          brand: convData.brand || existingConv.brand,
          branchId: convData.branchId ?? existingConv.branchId,
          branchName: convData.branchName ?? existingConv.branchName,
          lastMessageText: isNewerOrEqual
            ? msgData.text
            : existingConv.lastMessageText,
          lastMessageAt: isNewerOrEqual
            ? msgData.createdAt
            : existingConv.lastMessageAt,
          lastMessageDirection: isNewerOrEqual
            ? msgData.direction
            : existingConv.lastMessageDirection,
          unreadCount: opts.incrementUnread
            ? { increment: 1 }
            : shouldClearUnread
            ? 0
            : existingConv.unreadCount,
          ...(opts.incrementUnread
            ? {
                lastReadById: null,
                lastReadByName: null,
              }
            : shouldClearUnread
            ? {
                lastReadAt: readNowDate,
                lastReadById: msgData.senderId ?? convData.lastReadById ?? existingConv.lastReadById,
                lastReadByName:
                  msgData.senderName || convData.lastReadByName || existingConv.lastReadByName,
              }
            : {}),
          status: 'open',
          updatedAt: isNewerOrEqual ? msgData.createdAt : new Date(),
        },
      });

      // If any duplicate conversation rows exist for the same externalContactId, clear their unreadCount too
      if (shouldClearUnread && existingConv.externalContactId) {
        await tx.socialConversation.updateMany({
          where: {
            channel: existingConv.channel,
            externalContactId: existingConv.externalContactId,
            unreadCount: { gt: 0 },
          },
          data: {
            unreadCount: 0,
            lastReadAt: readNowDate,
            lastReadById: msgData.senderId ?? convData.lastReadById ?? existingConv.lastReadById,
            lastReadByName:
              msgData.senderName || convData.lastReadByName || existingConv.lastReadByName,
          },
        });
      }
    } else {
      const isOutbound = msgData.direction === 'outbound';
      savedConv = await tx.socialConversation.create({
        data: {
          ...convData,
          unreadCount: opts.incrementUnread ? Math.max(1, convData.unreadCount) : 0,
          ...(isOutbound ? { lastReadAt: new Date() } : {}),
        },
      });
    }

    await tx.setting.upsert({
      where: { key: SOCIAL_VERSION_KEY },
      update: { value: nextVersion },
      create: { key: SOCIAL_VERSION_KEY, value: nextVersion },
    });

    return { savedConv, savedMsg, deduped: false, mutated: true };
  });

  if (opts.message.direction === 'outbound' && (!opts.incrementUnread)) {
    const readWatermarkMs = Math.max(Date.now(), new Date(opts.message.createdAt).getTime());
    recordSocialReadWatermark(
      result.savedConv.id,
      result.savedConv.channel,
      result.savedConv.externalContactId,
      readWatermarkMs
    );
  }

  const shouldBumpState = !result.deduped || Boolean(result.mutated);
  if (shouldBumpState) {
    invalidateSocialStoreCache();
  }
  const curVersion = shouldBumpState ? nextVersion : await getSocialStoreVersion();
  return {
    conversation: applyReadWatermarks([mapDbRowToConversation(result.savedConv)])[0],
    message: mapDbRowToMessage(result.savedMsg),
    version: curVersion,
    deduped: result.deduped,
    mutated: result.mutated,
  };
}

let isProcessingMediaJobs = false;

/**
 * Durable, retryable background worker for WhatsApp Cloud API media attachments.
 * Reclaims pending or stale (>60s) processing jobs, downloads from Meta Graph API, uploads to GCS,
 * updates the saved `SocialMessage` in-place, and broadcasts a live `social.updated` event!
 */
export async function processPendingSocialMediaJobs(): Promise<{ processed: number }> {
  if (isProcessingMediaJobs) return { processed: 0 };
  isProcessingMediaJobs = true;
  let processed = 0;

  try {
    await ensureSocialInboxSchemaAndMigrate();
    const now = new Date();
    const staleProcessingCutoff = new Date(now.getTime() - 60_000);

    const dueJobs = await prisma.socialMediaJob.findMany({
      where: {
        attempts: { lt: 5 },
        OR: [
          { status: 'pending', nextRetryAt: { lte: now } },
          { status: 'processing', updatedAt: { lte: staleProcessingCutoff } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    if (dueJobs.length === 0) return { processed: 0 };

    const config = await loadSocialChannelConfig();
    const { resolveWhatsAppCloudCredentials, downloadWhatsAppCloudMediaToGcs } = await import(
      '@/lib/whatsapp-cloud-api'
    );
    const waCreds = resolveWhatsAppCloudCredentials(config?.whatsapp);
    if (!waCreds.accessToken) return { processed: 0 };

    for (const job of dueJobs) {
      const claim = await prisma.socialMediaJob.updateMany({
        where: { id: job.id, status: job.status, attempts: job.attempts },
        data: {
          status: 'processing',
          attempts: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (claim.count === 0) continue;

      const attemptNum = job.attempts + 1;
      try {
        const downloaded = await downloadWhatsAppCloudMediaToGcs({
          mediaId: job.mediaId,
          accessToken: waCreds.accessToken,
          senderPhone: job.senderPhone || undefined,
          fallbackMimeType: job.fallbackMimeType || undefined,
          originalFilename: job.originalFilename || undefined,
        });

        if (!downloaded?.url) {
          throw new Error('Media download or GCS upload returned empty URL');
        }

        const resolvedType: 'image' | 'file' =
          job.attachmentType === 'image' || downloaded.mimeType.startsWith('image/')
            ? 'image'
            : 'file';
        const resolvedName =
          job.attachmentName.includes('.') || resolvedType === 'image'
            ? job.attachmentName
            : `${job.attachmentName}.${downloaded.extension}`;

        const newAttachment: SocialMessageAttachment = {
          type: resolvedType,
          url: downloaded.url,
          name: resolvedName,
        };

        const msgRow = await prisma.socialMessage.findUnique({ where: { id: job.messageId } });
        if (msgRow) {
          const updatedMsgRow = await prisma.socialMessage.update({
            where: { id: job.messageId },
            data: { attachmentsJson: JSON.stringify([newAttachment]) },
          });
          await prisma.socialMediaJob.update({
            where: { id: job.id },
            data: { status: 'completed', lastError: null, updatedAt: new Date() },
          });
          const version = await bumpSocialStoreVersion();
          const updatedMsg = mapDbRowToMessage(updatedMsgRow);
          const conv = await findSocialConversationById(job.conversationId);

          try {
            const { publishOrderEvent } = await import('@/lib/realtime-bus');
            await publishOrderEvent({
              type: 'social.updated',
              jobId: `__SOCIAL_MEDIA_READY_${updatedMsg.id}`,
              updatedAt: new Date(),
              socialPayload: {
                kind: 'message',
                conversation: conv ?? undefined,
                message: updatedMsg,
                version,
              },
            });
          } catch {}
          processed++;
        } else {
          await prisma.socialMediaJob.update({
            where: { id: job.id },
            data: { status: 'completed', updatedAt: new Date() },
          });
        }
      } catch (err: any) {
        const backoffMs = Math.min(120_000, 5_000 * Math.pow(3, attemptNum - 1));
        await prisma.socialMediaJob.update({
          where: { id: job.id },
          data: {
            status: attemptNum >= 5 ? 'failed' : 'pending',
            nextRetryAt: new Date(Date.now() + backoffMs),
            lastError: String(err?.message || 'media_job_failed').slice(0, 240),
            updatedAt: new Date(),
          },
        });
        console.warn('[SocialMediaJob] Attachment retry scheduled:', {
          jobId: job.id,
          messageId: job.messageId,
          attempt: attemptNum,
          nextRetryInMs: backoffMs,
        });
      }
    }
    return { processed };
  } catch (err: any) {
    console.warn('[SocialMediaJob] Worker error:', String(err?.message || err).slice(0, 160));
    return { processed };
  } finally {
    isProcessingMediaJobs = false;
  }
}

export async function deleteSocialConversationAndMessages(
  conversationId: string
): Promise<string> {
  await ensureSocialInboxSchemaAndMigrate();
  const nextVersion = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await prisma.$transaction([
    prisma.socialMessage.deleteMany({ where: { conversationId } }),
    prisma.socialConversation.deleteMany({ where: { id: conversationId } }),
    prisma.setting.upsert({
      where: { key: SOCIAL_VERSION_KEY },
      update: { value: nextVersion },
      create: { key: SOCIAL_VERSION_KEY, value: nextVersion },
    }),
  ]);
  invalidateSocialStoreCache();
  return nextVersion;
}

export async function markSocialConversationsReadInDb(opts: {
  conversationIds?: string[];
  channel?: SocialChannel | 'all';
  actorId?: string | null;
  actorName?: string | null;
}): Promise<{ clearedCount: number; version: string }> {
  await ensureSocialInboxSchemaAndMigrate();
  const now = new Date();
  const nowMs = now.getTime();
  const where: any = { unreadCount: { gt: 0 } };
  if (opts.conversationIds && opts.conversationIds.length > 0) {
    where.id = { in: opts.conversationIds };
  } else if (opts.channel && opts.channel !== 'all') {
    where.channel = opts.channel;
  }

  const targets = await prisma.socialConversation.findMany({
    where,
    select: { id: true, channel: true, externalContactId: true },
  });

  if (targets.length === 0) {
    const curVer = await getSocialStoreVersion();
    return { clearedCount: 0, version: curVer };
  }

  for (const t of targets) {
    recordSocialReadWatermark(t.id, t.channel, t.externalContactId, nowMs);
  }

  const res = await prisma.socialConversation.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      unreadCount: 0,
      lastReadAt: now,
      ...(opts.actorId !== undefined ? { lastReadById: opts.actorId } : {}),
      ...(opts.actorName !== undefined ? { lastReadByName: opts.actorName } : {}),
      updatedAt: now,
    },
  });

  const version = await bumpSocialStoreVersion();
  return { clearedCount: res.count, version };
}

// ============================================================================
// COMPATIBILITY STORE HELPERS (Now backed 100% by SocialConversation & SocialMessage tables!)
// ============================================================================

export async function loadRawSocialInboxStore(knownVersion?: string): Promise<{
  conversations: SocialConversation[];
  messages: SocialMessage[];
  config: SocialChannelConfig;
  version: string;
}> {
  await ensureSocialInboxSchemaAndMigrate();

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

  const [conversations, msgRowsDesc, config, verRow] = await Promise.all([
    querySocialConversations(1000),
    prisma.socialMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1500,
    }),
    loadSocialChannelConfig(true),
    prisma.setting.findUnique({
      where: { key: SOCIAL_VERSION_KEY },
      select: { value: true },
    }),
  ]);

  const messages = msgRowsDesc.reverse().map(mapDbRowToMessage);
  const version = verRow?.value?.trim() || String(Date.now());

  globalForSocialCache.__tlsSocialStoreCache = {
    version,
    conversations: conversations.slice(),
    messages: messages.slice(),
    config,
    loadedAt: Date.now(),
  };

  return { conversations, messages, config, version };
}

/**
 * Additive row-sync fallback (NEVER deletes existing DB rows that weren't in memory!).
 */
export async function saveRawSocialInboxStore(
  conversations: SocialConversation[],
  messages: SocialMessage[]
): Promise<string> {
  await ensureSocialInboxSchemaAndMigrate();
  const trimmedConvs = applyReadWatermarks(conversations.slice(0, 1000));

  if (trimmedConvs.length > 0) {
    const existingIds = new Set(
      (
        await prisma.socialConversation.findMany({
          where: { id: { in: trimmedConvs.map((c) => c.id) } },
          select: { id: true },
        })
      ).map((r) => r.id)
    );
    const toCreate = trimmedConvs.filter((c) => !existingIds.has(c.id)).map(mapConversationToDbData);
    if (toCreate.length > 0) {
      await prisma.socialConversation.createMany({ data: toCreate, skipDuplicates: true });
    }
  }

  if (messages.length > 0) {
    const recentSlice = messages.slice(-500);
    await prisma.socialMessage.createMany({
      data: recentSlice.map(mapMessageToDbData),
      skipDuplicates: true,
    });
  }

  return bumpSocialStoreVersion();
}

export async function saveRawSocialConversationsOnly(
  conversations: SocialConversation[]
): Promise<string> {
  await ensureSocialInboxSchemaAndMigrate();
  const trimmedConvs = applyReadWatermarks(conversations.slice(0, 1000));
  if (trimmedConvs.length > 0) {
    await prisma.socialConversation.createMany({
      data: trimmedConvs.map(mapConversationToDbData),
      skipDuplicates: true,
    });
  }
  return bumpSocialStoreVersion();
}

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

export async function syncExternalReadStatesInternal(
  channel: SocialChannel,
  readExternalIds: string[]
): Promise<{ clearedCount: number }> {
  if (!readExternalIds || readExternalIds.length === 0) return { clearedCount: 0 };
  try {
    await ensureSocialInboxSchemaAndMigrate();
    const unreadRows = await prisma.socialConversation.findMany({
      where: { channel, unreadCount: { gt: 0 } },
      select: { id: true, externalContactId: true, contactPhone: true },
    });
    if (unreadRows.length === 0) return { clearedCount: 0 };

    const normalizedIds = new Set(
      readExternalIds.map((id) => String(id || '').trim()).filter(Boolean)
    );
    const normalizedTails = new Set(
      readExternalIds.map((id) => phoneDigitsTail(id)).filter((t) => t.length >= 7)
    );

    const matchedIds: string[] = [];
    const nowMs = Date.now();
    for (const r of unreadRows) {
      const extMatch = r.externalContactId && normalizedIds.has(r.externalContactId.trim());
      const tailMatch =
        channel === 'whatsapp' &&
        (normalizedTails.has(phoneDigitsTail(r.externalContactId)) ||
          normalizedTails.has(phoneDigitsTail(r.contactPhone)));
      if (extMatch || tailMatch) {
        recordSocialReadWatermark(r.id, channel, r.externalContactId, nowMs);
        matchedIds.push(r.id);
      }
    }

    if (matchedIds.length === 0) return { clearedCount: 0 };

    const now = new Date(nowMs);
    await prisma.socialConversation.updateMany({
      where: { id: { in: matchedIds } },
      data: { unreadCount: 0, lastReadAt: now, updatedAt: now },
    });
    const version = await bumpSocialStoreVersion();

    try {
      const { publishOrderEvent } = await import('@/lib/realtime-bus');
      await publishOrderEvent({
        type: 'social.updated',
        jobId: `__SOCIAL_READ_${nowMs}`,
        updatedAt: now,
        socialPayload: {
          kind: 'read',
          readConversationIds: matchedIds.slice(0, 50),
          channel,
          version,
        },
      });
    } catch {}

    return { clearedCount: matchedIds.length };
  } catch (err) {
    console.warn('[syncExternalReadStatesInternal] Error:', err);
    return { clearedCount: 0 };
  }
}

export async function recordInboundSocialMessageInternal(input: {
  channel: SocialChannel;
  externalContactId: string;
  contactName?: string;
  contactPhone?: string;
  contactAvatar?: string;
  senderName?: string;
  text: string;
  attachments?: SocialMessageAttachment[];
  pendingMediaJob?: PendingSocialMediaJobInput;
  customerId?: string | null;
  messageId?: string;
  externalMessageId?: string;
  deliveryMethod?: SocialMessage['deliveryMethod'];
  createdAt?: string;
  isHistorySync?: boolean;
  skipUnreadIncrement?: boolean;
  webhookReceivedAtMs?: number;
}) {
  try {
    await ensureSocialInboxSchemaAndMigrate();

    // Fast indexed O(log N) pre-check before conversation lookup
    const dedupOr: any[] = [];
    if (input.messageId) dedupOr.push({ id: input.messageId });
    if (input.externalMessageId) dedupOr.push({ externalMessageId: input.externalMessageId });
    if (dedupOr.length > 0) {
      const dup = await prisma.socialMessage.findFirst({
        where: { OR: dedupOr },
        select: { id: true },
      });
      if (dup) {
        return { success: true, deduped: true };
      }
    }

    const nowIso = new Date().toISOString();
    const msgIso =
      input.createdAt && !isNaN(new Date(input.createdAt).getTime())
        ? new Date(input.createdAt).toISOString()
        : nowIso;
    const msgMs = new Date(msgIso).getTime();

    const existing = await findSocialConversationForContact({
      channel: input.channel,
      externalContactId: input.externalContactId,
      contactPhone: input.contactPhone,
      customerId: input.customerId,
    });

    let conv: SocialConversation;
    let shouldBumpUnread = false;

    if (existing) {
      const existingLastMs = existing.lastMessageAt
        ? new Date(existing.lastMessageAt).getTime()
        : 0;
      const isNewerOrEqual = msgMs >= existingLastMs;
      const lastReadMs = existing.lastReadAt ? new Date(existing.lastReadAt).getTime() : 0;
      const alreadyReadByWatermark = Boolean(lastReadMs && msgMs <= lastReadMs + 1500);
      shouldBumpUnread =
        !input.skipUnreadIncrement &&
        !alreadyReadByWatermark &&
        (!input.isHistorySync || isNewerOrEqual);

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
    } else {
      shouldBumpUnread = !input.isHistorySync;
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
        unreadCount: shouldBumpUnread ? 1 : 0,
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
      senderName: input.senderName || conv.contactName,
      status: 'delivered',
      deliveryMethod: input.deliveryMethod,
      externalMessageId: input.externalMessageId,
      createdAt: msgIso,
    };

    const committed = await insertSocialMessageAndTouchConversation({
      message: inboundMsg,
      conversation: conv,
      incrementUnread: shouldBumpUnread,
      pendingMediaJob: input.pendingMediaJob,
    });

    if (committed.deduped && !committed.mutated) {
      return { success: true, deduped: true };
    }

    const dbSavedAtMs = Date.now();
    if (committed.deduped && committed.mutated) {
      if (!input.isHistorySync) {
        try {
          const { publishOrderEvent } = await import('@/lib/realtime-bus');
          await publishOrderEvent({
            type: 'social.updated',
            jobId: `__SOCIAL_MSG_${committed.message.id}`,
            updatedAt: new Date(dbSavedAtMs),
            socialPayload: {
              kind: 'message',
              conversation: committed.conversation,
              message: committed.message,
              version: committed.version,
            },
          });
        } catch {}
      }
      return {
        success: true,
        deduped: true,
        conversation: committed.conversation,
        message: committed.message,
      };
    }
    if (input.webhookReceivedAtMs) {
      console.info(
        '[SocialInboxTiming]',
        JSON.stringify({
          stage: 'db_saved',
          msgId: committed.message.id,
          channel: input.channel,
          direction: 'inbound',
          hasMediaJob: Boolean(input.pendingMediaJob),
          webhookToDbMs: dbSavedAtMs - input.webhookReceivedAtMs,
        })
      );
    }

    if (!input.isHistorySync) {
      try {
        const { publishOrderEvent } = await import('@/lib/realtime-bus');
        await publishOrderEvent({
          type: 'social.updated',
          jobId: `__SOCIAL_MSG_${committed.message.id}`,
          updatedAt: new Date(dbSavedAtMs),
          socialPayload: {
            kind: 'message',
            conversation: committed.conversation,
            message: committed.message,
            version: committed.version,
            timing: {
              webhookReceivedAtMs: input.webhookReceivedAtMs,
              dbSavedAtMs,
            },
          },
        });
      } catch {}
    }

    if (input.pendingMediaJob) {
      void processPendingSocialMediaJobs().catch(() => {});
    }

    return {
      success: true,
      conversation: committed.conversation,
      message: committed.message,
      dbSavedAtMs,
    };
  } catch (err: any) {
    console.error('[recordInboundSocialMessageInternal] Error:', {
      channel: input.channel,
      reason: String(err?.message || 'unknown_error').slice(0, 160),
    });
    return { success: false, error: err?.message || 'Failed to record inbound message' };
  }
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
  attachments?: SocialMessageAttachment[];
  pendingMediaJob?: PendingSocialMediaJobInput;
  senderName?: string;
  messageId?: string;
  externalMessageId?: string;
  deliveryMethod?: SocialMessage['deliveryMethod'];
  createdAt?: string;
  isHistorySync?: boolean;
  webhookReceivedAtMs?: number;
}) {
  try {
    await ensureSocialInboxSchemaAndMigrate();

    // Always deduplicate by messageId or externalMessageId (e.g. wamid...) so Cloud API sends
    // echoed back via `smb_message_echoes` or webhook retries NEVER create duplicate bubbles!
    const dedupOr: any[] = [];
    if (input.messageId) dedupOr.push({ id: input.messageId });
    if (input.externalMessageId) dedupOr.push({ externalMessageId: input.externalMessageId });
    if (dedupOr.length > 0) {
      const dup = await prisma.socialMessage.findFirst({
        where: { OR: dedupOr },
        select: { id: true },
      });
      if (dup) {
        if (!input.isHistorySync && input.externalContactId) {
          await syncExternalReadStatesInternal(input.channel, [input.externalContactId]);
        }
        return { success: true, deduped: true };
      }
    }

    const nowIso = new Date().toISOString();
    const msgIso =
      input.createdAt && !isNaN(new Date(input.createdAt).getTime())
        ? new Date(input.createdAt).toISOString()
        : nowIso;
    const msgMs = new Date(msgIso).getTime();

    const existing = await findSocialConversationForContact({
      channel: input.channel,
      externalContactId: input.externalContactId,
      contactPhone: input.contactPhone,
      customerId: input.customerId,
    });

    let conv: SocialConversation;
    if (existing) {
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

    const combinedAttachments: SocialMessageAttachment[] = [
      ...(input.attachments || []),
      ...(input.imageUrls || []).map((url) => ({
        type: 'image' as const,
        url,
        name: 'WhatsApp Photo',
      })),
    ];

    const msgId =
      input.messageId || `msg_sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const outboundMsg: SocialMessage = {
      id: msgId,
      conversationId: conv.id,
      channel: input.channel,
      direction: 'outbound',
      text: input.text,
      attachments: combinedAttachments.length > 0 ? combinedAttachments : undefined,
      senderName: input.senderName || 'LINE OA Bot',
      status: 'delivered',
      deliveryMethod:
        input.deliveryMethod || (input.channel === 'line' ? 'line_api' : 'social_api'),
      externalMessageId: input.externalMessageId,
      createdAt: msgIso,
    };

    const committed = await insertSocialMessageAndTouchConversation({
      message: outboundMsg,
      conversation: conv,
      incrementUnread: false,
      clearUnreadOnOutbound: !input.isHistorySync,
      pendingMediaJob: input.pendingMediaJob,
    });

    if (committed.deduped && !committed.mutated) {
      return { success: true, deduped: true };
    }

    const dbSavedAtMs = Date.now();
    if (committed.deduped && committed.mutated) {
      if (!input.isHistorySync) {
        try {
          const { publishOrderEvent } = await import('@/lib/realtime-bus');
          await publishOrderEvent({
            type: 'social.updated',
            jobId: `__SOCIAL_MSG_${committed.message.id}`,
            updatedAt: new Date(dbSavedAtMs),
            socialPayload: {
              kind: 'message',
              conversation: committed.conversation,
              message: committed.message,
              version: committed.version,
            },
          });
        } catch {}
      }
      return {
        success: true,
        deduped: true,
        conversation: committed.conversation,
        message: committed.message,
      };
    }
    if (input.webhookReceivedAtMs) {
      console.info(
        '[SocialInboxTiming]',
        JSON.stringify({
          stage: 'db_saved',
          msgId: committed.message.id,
          channel: input.channel,
          direction: 'outbound',
          hasMediaJob: Boolean(input.pendingMediaJob),
          webhookToDbMs: dbSavedAtMs - input.webhookReceivedAtMs,
        })
      );
    }

    if (!input.isHistorySync) {
      try {
        const { publishOrderEvent } = await import('@/lib/realtime-bus');
        await publishOrderEvent({
          type: 'social.updated',
          jobId: `__SOCIAL_MSG_${committed.message.id}`,
          updatedAt: new Date(dbSavedAtMs),
          socialPayload: {
            kind: 'message',
            conversation: committed.conversation,
            message: committed.message,
            version: committed.version,
            timing: {
              webhookReceivedAtMs: input.webhookReceivedAtMs,
              dbSavedAtMs,
            },
          },
        });
      } catch {}
    }

    if (input.pendingMediaJob) {
      void processPendingSocialMediaJobs().catch(() => {});
    }

    return {
      success: true,
      conversation: committed.conversation,
      message: committed.message,
      dbSavedAtMs,
    };
  } catch (err: any) {
    console.error('[recordOutboundSocialMessageFromSystemInternal] Error:', {
      channel: input.channel,
      reason: String(err?.message || 'unknown_error').slice(0, 160),
    });
    return { success: false, error: err?.message || 'Failed to record outbound message' };
  }
}

const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export async function updateOutboundSocialMessageStatusInternal(input: {
  externalMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorText?: string;
}): Promise<{
  updated: boolean;
  message?: SocialMessage;
  conversation?: SocialConversation | null;
  alreadyQrFailover?: boolean;
  error?: string;
}> {
  const extId = (input.externalMessageId || '').trim();
  if (!extId) return { updated: false };

  try {
    await ensureSocialInboxSchemaAndMigrate();
    const existing = await prisma.socialMessage.findFirst({
      where: { externalMessageId: extId },
    });
    if (!existing) return { updated: false };

    // Never let a late Meta Cloud API `failed` webhook overwrite a message already rescued via QR Bridge!
    if (input.status === 'failed' && existing.deliveryMethod === 'whatsapp_gateway_api') {
      return { updated: false, alreadyQrFailover: true };
    }

    const currentRank = STATUS_RANK[existing.status] || 0;
    const incomingRank = STATUS_RANK[input.status] || 0;
    if (existing.status !== 'failed' && input.status !== 'failed' && incomingRank <= currentRank) {
      return { updated: false };
    }

    const updatedRow = await prisma.socialMessage.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        ...(input.errorText ? { externalError: input.errorText } : {}),
      },
    });
    const updatedMsg = mapDbRowToMessage(updatedRow);
    const conv = await findSocialConversationById(updatedMsg.conversationId);
    const version = await bumpSocialStoreVersion();

    try {
      const { publishOrderEvent } = await import('@/lib/realtime-bus');
      await publishOrderEvent({
        type: 'social.updated',
        jobId: `__SOCIAL_STATUS_${updatedMsg.id}_${input.status}`,
        updatedAt: new Date(),
        socialPayload: {
          kind: 'message',
          conversation: conv ?? undefined,
          message: updatedMsg,
          version,
        },
      });
    } catch {}

    return { updated: true, message: updatedMsg, conversation: conv };
  } catch (err: any) {
    console.error('[updateOutboundSocialMessageStatusInternal] Error:', {
      reason: String(err?.message || 'unknown_error').slice(0, 160),
    });
    return { updated: false, error: err?.message || 'Failed to update message status' };
  }
}

const globalForQrFailover = globalThis as unknown as {
  __tlsWaQrFailoverAttemptedIds?: Set<string>;
};

/**
 * Automatic Dual-Sync Failover:
 * When Meta WhatsApp Cloud API asynchronously rejects an outbound message via webhook
 * (e.g. >24h customer service window `131047` or restricted country `130497`/`131049`),
 * automatically re-deliver the exact message + attachments via Linked WhatsApp QR Bridge
 * (only once, and only for fresh messages sent within the last 5 minutes).
 */
export async function failoverFailedCloudApiMessageToQrInternal(input: {
  messageId: string;
  defaultCountryCode?: string;
}): Promise<{ rescued: boolean; reason?: string }> {
  const attempted =
    globalForQrFailover.__tlsWaQrFailoverAttemptedIds ||
    (globalForQrFailover.__tlsWaQrFailoverAttemptedIds = new Set<string>());

  if (attempted.has(input.messageId)) {
    return { rescued: false, reason: 'already_attempted' };
  }
  attempted.add(input.messageId);
  if (attempted.size > 500) {
    const first = attempted.values().next().value;
    if (first) attempted.delete(first);
  }

  try {
    const row = await prisma.socialMessage.findUnique({
      where: { id: input.messageId },
    });
    if (!row) return { rescued: false, reason: 'not_found' };
    if (
      row.channel !== 'whatsapp' ||
      row.direction !== 'outbound' ||
      row.deliveryMethod !== 'whatsapp_cloud_api'
    ) {
      return { rescued: false, reason: 'not_cloud_api_outbound' };
    }
    // Safety guard: only auto-failover messages created within the last 5 minutes
    if (Date.now() - row.createdAt.getTime() > 5 * 60 * 1000) {
      return { rescued: false, reason: 'too_old' };
    }

    const { getWhatsAppQrStatusAsync, sendDirectWhatsAppQrMessage } = await import(
      '@/lib/whatsapp-qr-manager'
    );
    const qrStatus = await getWhatsAppQrStatusAsync(true);
    if (qrStatus.status !== 'connected' && qrStatus.status !== 'connecting') {
      return { rescued: false, reason: 'qr_not_connected' };
    }

    const conv = await findSocialConversationById(row.conversationId);
    const targetPhone = conv?.externalContactId || conv?.contactPhone || '';
    if (!targetPhone) return { rescued: false, reason: 'no_phone' };

    const msgObj = mapDbRowToMessage(row);
    const isSyntheticPlaceholder =
      (msgObj.text === '📷 [Sent Photo / Attachment]' ||
        msgObj.text === '📷 [Sent a photo via WhatsApp]') &&
      Boolean(msgObj.attachments && msgObj.attachments.length > 0);

    const qrRes = await sendDirectWhatsAppQrMessage({
      phone: targetPhone,
      countryCode: input.defaultCountryCode || '66',
      text: isSyntheticPlaceholder ? '' : msgObj.text,
      attachments: msgObj.attachments,
    });

    if (!qrRes.ok) {
      console.warn('[WA QR Failover] Resend via QR failed:', qrRes.error);
      return { rescued: false, reason: qrRes.error };
    }

    const rescuedRow = await prisma.socialMessage.update({
      where: { id: row.id },
      data: {
        status: 'delivered',
        deliveryMethod: 'whatsapp_gateway_api',
        externalError: null,
      },
    });
    const rescuedMsg = mapDbRowToMessage(rescuedRow);
    const version = await bumpSocialStoreVersion();

    try {
      const { publishOrderEvent } = await import('@/lib/realtime-bus');
      await publishOrderEvent({
        type: 'social.updated',
        jobId: `__SOCIAL_QR_RESCUE_${rescuedMsg.id}`,
        updatedAt: new Date(),
        socialPayload: {
          kind: 'message',
          conversation: conv ?? undefined,
          message: rescuedMsg,
          version,
        },
      });
    } catch {}

    console.info('[WA QR Failover] Successfully rescued failed Cloud API message via QR Bridge:', {
      messageId: rescuedMsg.id,
      phone: targetPhone,
    });
    return { rescued: true };
  } catch (err: any) {
    console.warn('[WA QR Failover] Unexpected error:', err?.message || err);
    return { rescued: false, reason: err?.message || 'error' };
  }
}
