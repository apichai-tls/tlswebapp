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

export function getDefaultSocialChannelConfig(): SocialChannelConfig {
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
      process.env.NEXT_PUBLIC_APP_URL || 'https://www.thatlaundryshop.com'
    ).replace(/\/+$/, '');
    return `${base}${trimmed}`;
  }
  return null;
}

export async function loadRawSocialInboxStore(): Promise<{
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
  let config: SocialChannelConfig = getDefaultSocialChannelConfig();

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

export async function saveRawSocialInboxStore(
  conversations: SocialConversation[],
  messages: SocialMessage[]
): Promise<void> {
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

export async function recordInboundSocialMessageInternal(input: {
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
    const { conversations, messages } = await loadRawSocialInboxStore();
    const nowIso = new Date().toISOString();

    const convIdx = conversations.findIndex(
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

    await saveRawSocialInboxStore(conversations, messages);

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
}) {
  try {
    const { conversations, messages } = await loadRawSocialInboxStore();
    const nowIso = new Date().toISOString();

    const convIdx = conversations.findIndex(
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
        unreadCount: 0,
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

    await saveRawSocialInboxStore(conversations, messages);
    return { success: true, conversation: conv, message: outboundMsg };
  } catch (err: any) {
    console.warn('[recordOutboundSocialMessageFromSystemInternal] Non-fatal error:', err);
    return { success: false, error: err?.message };
  }
}
