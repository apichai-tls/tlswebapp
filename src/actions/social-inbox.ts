'use server';

import { prisma } from '@/lib/prisma';
import { assertServerActionAuthorized } from '@/lib/server-auth';
import {
  SocialChannel,
  SocialChannelConfig,
  SocialConversation,
  SocialMessage,
  SocialMessageAttachment,
} from '@/types/social-inbox';
import {
  formatPhoneForWhatsApp,
  formatDisplayPhone,
  buildWhatsAppUrl,
  normalizePhoneKey,
} from '@/lib/social-helpers';
import { isValidLineUserId, sendLinePushMessage, LineMessageObject, LineContactRecord } from '@/lib/line';
import { getStoredLineOaSettings } from '@/actions/line';

const SOCIAL_CONVERSATIONS_KEY = 'TLS_SOCIAL_CONVERSATIONS_V1';
const SOCIAL_MESSAGES_KEY = 'TLS_SOCIAL_MESSAGES_V1';
const SOCIAL_CONFIG_KEY = 'TLS_SOCIAL_CHANNEL_CONFIG_V1';

function getDefaultChannelConfig(): SocialChannelConfig {
  return {
    whatsapp: {
      enabled: true,
      mode: 'web_bridge',
      businessPhoneNumber: '+66 80 000 0000',
      defaultCountryCode: '66',
      autoOpenWaWebOnSend: true,
      phoneNumberId: '',
      accessToken: '',
      verifyToken: 'tls_whatsapp_verify_2026',
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

    // Fetch customers for automatic enrichment & matching
    const allCustomers = await prisma.customer.findMany({
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
    });

    // Also pull synced LINE OA contacts so they appear in the unified inbox
    const lineContactsRow = await prisma.setting.findUnique({
      where: { key: 'lineOaContacts' },
    });
    let lineContacts: LineContactRecord[] = [];
    if (lineContactsRow?.value) {
      try {
        const parsed = JSON.parse(lineContactsRow.value);
        if (Array.isArray(parsed)) lineContacts = parsed;
      } catch {}
    }

    let didMutate = false;
    const nowIso = new Date().toISOString();

    // Merge top 40 recent LINE OA contacts into conversations if not already present
    const existingLineIds = new Set(
      conversations.filter((c) => c.channel === 'line').map((c) => c.externalContactId)
    );

    for (const lc of lineContacts.slice(0, 40)) {
      if (!lc.userId || existingLineIds.has(lc.userId)) continue;

      const matchedCust =
        allCustomers.find((c) => c.id === lc.linkedCustomerId || c.lineId === lc.userId) || null;

      const convId = `conv_line_${lc.userId.slice(-10)}`;
      const initialText = lc.lastMessageText || 'Connected via LINE Official Account (@thatlaundryshop)';
      const ts = lc.lastInteractionAt || nowIso;

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
        unreadCount: lc.lastMessageText && lc.lastMessageText !== '[Followed LINE OA]' ? 1 : 0,
        lastMessageText: initialText,
        lastMessageAt: ts,
        lastMessageDirection: 'inbound',
        createdAt: ts,
        updatedAt: ts,
      };

      conversations.push(newConv);
      existingLineIds.add(lc.userId);

      if (lc.lastMessageText) {
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

    // Seed starter multi-channel conversations if completely empty
    if (conversations.length === 0) {
      const sampleCust1 = allCustomers[0];
      const sampleCust2 = allCustomers[1] || allCustomers[0];
      const t1 = new Date(Date.now() - 1000 * 60 * 18).toISOString();
      const t2 = new Date(Date.now() - 1000 * 60 * 45).toISOString();
      const t3 = new Date(Date.now() - 1000 * 60 * 120).toISOString();

      const waPhone = sampleCust1?.phone
        ? formatPhoneForWhatsApp(sampleCust1.phone, '66')
        : '66812345678';

      const seedConvs: SocialConversation[] = [
        {
          id: 'conv_wa_seed_1',
          channel: 'whatsapp',
          externalContactId: waPhone,
          contactName: sampleCust1?.name || 'Khun Ploy (Sukhumvit 39)',
          contactPhone: formatDisplayPhone(waPhone, '66'),
          contactHandle: `+${waPhone}`,
          customerId: sampleCust1?.id || null,
          customerName: sampleCust1?.name || null,
          customerMemberId: sampleCust1?.memberId || null,
          customerWalletBalance: sampleCust1?.creditBalance || 0,
          brand: 'that_laundry_shop',
          status: 'open',
          unreadCount: 1,
          tags: ['VIP', 'Pickup Request'],
          lastMessageText: 'Hi! Can the rider pick up 2 bags of wash & fold from my lobby at 2 PM today?',
          lastMessageAt: t1,
          lastMessageDirection: 'inbound',
          createdAt: t2,
          updatedAt: t1,
        },
        {
          id: 'conv_fb_seed_2',
          channel: 'facebook',
          externalContactId: 'fb_user_10928',
          contactName: sampleCust2?.name || 'David Miller (Thonglor)',
          contactPhone: sampleCust2?.phone || '+66 89 555 4321',
          contactHandle: 'Facebook Messenger',
          customerId: sampleCust2?.id || null,
          customerName: sampleCust2?.name || null,
          customerMemberId: sampleCust2?.memberId || null,
          customerWalletBalance: sampleCust2?.creditBalance || 0,
          brand: 'that_laundry_shop',
          status: 'open',
          unreadCount: 0,
          tags: ['Dry Clean Inquiry'],
          lastMessageText: 'Yes, we offer express 24-hour dry cleaning for suits! Our rider can collect today.',
          lastMessageAt: t2,
          lastMessageDirection: 'outbound',
          createdAt: t3,
          updatedAt: t2,
        },
        {
          id: 'conv_ig_seed_3',
          channel: 'instagram',
          externalContactId: '@sara.bkk.life',
          contactName: 'Sara W. (@sara.bkk.life)',
          contactPhone: '',
          contactHandle: '@sara.bkk.life',
          customerId: null,
          customerName: null,
          brand: 'that_laundry_shop',
          status: 'open',
          unreadCount: 1,
          tags: ['Shoes & Bags'],
          lastMessageText: 'Hello! Do you clean white leather sneakers and suede bags? How much per pair?',
          lastMessageAt: t3,
          lastMessageDirection: 'inbound',
          createdAt: t3,
          updatedAt: t3,
        },
      ];

      const seedMsgs: SocialMessage[] = [
        {
          id: 'msg_seed_1a',
          conversationId: 'conv_wa_seed_1',
          channel: 'whatsapp',
          direction: 'outbound',
          text: 'Hello! 👋 Welcome to That Laundry Shop. How can we assist you with your laundry today?',
          senderName: 'Admin Dispatch',
          status: 'read',
          deliveryMethod: 'whatsapp_web_bridge',
          createdAt: t2,
        },
        {
          id: 'msg_seed_1b',
          conversationId: 'conv_wa_seed_1',
          channel: 'whatsapp',
          direction: 'inbound',
          text: 'Hi! Can the rider pick up 2 bags of wash & fold from my lobby at 2 PM today?',
          senderName: sampleCust1?.name || 'Khun Ploy',
          status: 'read',
          deliveryMethod: 'whatsapp_web_bridge',
          createdAt: t1,
        },
        {
          id: 'msg_seed_2a',
          conversationId: 'conv_fb_seed_2',
          channel: 'facebook',
          direction: 'inbound',
          text: 'Hi team, do you have express dry cleaning for 3 business suits?',
          senderName: sampleCust2?.name || 'David Miller',
          status: 'read',
          deliveryMethod: 'social_api',
          createdAt: t3,
        },
        {
          id: 'msg_seed_2b',
          conversationId: 'conv_fb_seed_2',
          channel: 'facebook',
          direction: 'outbound',
          text: 'Yes, we offer express 24-hour dry cleaning for suits! Our rider can collect today.',
          senderName: 'Admin Support',
          status: 'delivered',
          deliveryMethod: 'social_api',
          createdAt: t2,
        },
        {
          id: 'msg_seed_3a',
          conversationId: 'conv_ig_seed_3',
          channel: 'instagram',
          direction: 'inbound',
          text: 'Hello! Do you clean white leather sneakers and suede bags? How much per pair?',
          senderName: 'Sara W. (@sara.bkk.life)',
          status: 'delivered',
          deliveryMethod: 'social_api',
          createdAt: t3,
        },
      ];

      conversations.push(...seedConvs);
      messages.push(...seedMsgs);
      didMutate = true;
    }

    // Enrich conversations with latest customer data from DB
    const customerById = new Map(allCustomers.map((c) => [c.id, c]));
    const customerByPhoneKey = new Map<string, (typeof allCustomers)[0]>();
    for (const c of allCustomers) {
      const pk = normalizePhoneKey(c.phone);
      if (pk.length >= 8) customerByPhoneKey.set(pk, c);
    }

    conversations = conversations.map((conv) => {
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

    // Sort conversations by lastMessageAt descending
    conversations.sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

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

      // If WhatsApp Cloud API is configured, attempt direct Cloud API dispatch
      if (
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
 */
export async function sendSocialMessageAction(input: {
  conversationId: string;
  text: string;
  attachments?: SocialMessageAttachment[];
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

    let deliveryMethod: SocialMessage['deliveryMethod'] = 'platform_log';
    let status: SocialMessage['status'] = 'sent';
    let externalError: string | undefined;
    let whatsappUrl: string | undefined;

    // 1. Real LINE OA API Delivery
    if (conv.channel === 'line') {
      deliveryMethod = 'line_api';
      if (isValidLineUserId(conv.externalContactId)) {
        const lineSettings = await getStoredLineOaSettings(conv.brand);
        if (lineSettings.channelAccessToken) {
          const lineMsgs: LineMessageObject[] = [];
          if (text) {
            lineMsgs.push({ type: 'text', text });
          }
          for (const att of attachments) {
            if (att.type === 'image' && att.url && att.url.startsWith('https://')) {
              lineMsgs.push({
                type: 'image',
                originalContentUrl: att.url,
                previewImageUrl: att.url,
              });
            }
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
    // 2. WhatsApp Delivery (Cloud API or Web Bridge)
    else if (conv.channel === 'whatsapp') {
      const targetPhone = conv.externalContactId || conv.contactPhone || '';
      whatsappUrl = buildWhatsAppUrl(
        targetPhone,
        text,
        config.whatsapp.defaultCountryCode || '66'
      );

      if (
        config.whatsapp.mode === 'cloud_api' &&
        config.whatsapp.phoneNumberId &&
        config.whatsapp.accessToken
      ) {
        deliveryMethod = 'whatsapp_cloud_api';
        try {
          const e164 = formatPhoneForWhatsApp(
            targetPhone,
            config.whatsapp.defaultCountryCode || '66'
          );
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
                to: e164,
                type: 'text',
                text: { body: text },
              }),
            }
          );
          if (cloudRes.ok) {
            status = 'delivered';
          } else {
            deliveryMethod = 'whatsapp_web_bridge';
          }
        } catch {
          deliveryMethod = 'whatsapp_web_bridge';
        }
      } else {
        deliveryMethod = 'whatsapp_web_bridge';
        status = 'delivered';
      }
    }
    // 3. Other Social Channels (Messenger, Instagram, Telegram)
    else {
      deliveryMethod = 'social_api';
      status = 'delivered';
    }

    const newMsg: SocialMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: conv.id,
      channel: conv.channel,
      direction: 'outbound',
      text: text || (attachments.length > 0 ? '[Sent Attachment]' : ''),
      attachments: attachments.length > 0 ? attachments : undefined,
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
