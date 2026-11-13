import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  loadRawSocialInboxStore,
  recordInboundSocialMessageInternal,
} from '@/lib/social-inbox-internal';
import { formatDisplayPhone } from '@/lib/social-helpers';
import { SocialMessageAttachment } from '@/types/social-inbox';
import { checkRateLimit, getRequestClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * GET /api/webhooks/social
 * Supports Meta (WhatsApp Cloud API / Facebook Messenger / Instagram) hub.challenge verification
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = (searchParams.get('hub.verify_token') || '').trim();
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && challenge !== null) {
    const store = await loadRawSocialInboxStore();
    const configuredTokens = Array.from(
      new Set(
        [
          process.env.SOCIAL_WEBHOOK_VERIFY_TOKEN,
          process.env.META_WEBHOOK_VERIFY_TOKEN,
          store.config?.whatsapp?.verifyToken,
        ]
          .map((t) => (t || '').trim())
          .filter(Boolean)
      )
    );

    if (
      configuredTokens.length === 0 ||
      !token ||
      !configuredTokens.some((expected) => timingSafeCompare(token, expected))
    ) {
      return NextResponse.json({ error: 'Invalid verify_token' }, { status: 403 });
    }

    const safeChallenge = String(challenge).replace(/[^\w.\-~]/g, '');
    return new NextResponse(safeChallenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return NextResponse.json({
    ok: true,
    service: 'That Laundry Shop — Omnichannel Live Social Webhook',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/webhooks/social
 * Handles live inbound messages & media attachments from:
 *  1) WhatsApp Business Cloud API
 *  2) WhatsApp QR / REST Gateways (WAHA, Evolution API, Baileys, UltraMsg)
 *  3) Facebook Messenger & Instagram Direct (Meta Graph Webhook)
 *  4) Telegram Bot Webhook
 */
export async function POST(req: NextRequest) {
  try {
    const clientIp = getRequestClientIp(req);
    const rate = checkRateLimit(`social-webhook:${clientIp}`, 120, 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const rawBody = await req.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};

    // Verify Meta X-Hub-Signature-256 when META_APP_SECRET is configured
    const metaAppSecret = (process.env.META_APP_SECRET || '').trim();
    if (
      metaAppSecret &&
      (payload?.object === 'whatsapp_business_account' ||
        payload?.object === 'page' ||
        payload?.object === 'instagram')
    ) {
      const sigHeader = (req.headers.get('x-hub-signature-256') || '').trim();
      const expected = `sha256=${crypto.createHmac('sha256', metaAppSecret).update(rawBody).digest('hex')}`;
      if (!timingSafeCompare(sigHeader, expected)) {
        return NextResponse.json({ error: 'Invalid Meta webhook signature' }, { status: 401 });
      }
    }

    // Verify gateway / webhook secret when configured on channel or env
    const store = await loadRawSocialInboxStore();

    // 1. WhatsApp Business Cloud API Payload (`object === "whatsapp_business_account"`)
    if (payload?.object === 'whatsapp_business_account' && Array.isArray(payload?.entry)) {
      for (const entry of payload.entry) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const val = change?.value;
          const contacts = Array.isArray(val?.contacts) ? val.contacts : [];
          const messages = Array.isArray(val?.messages) ? val.messages : [];

          for (const msg of messages) {
            const fromPhone = String(msg?.from || '').replace(/\D/g, '');
            if (!fromPhone) continue;

            const contactProfile = contacts.find((c: any) => String(c?.wa_id) === fromPhone);
            const profileName =
              contactProfile?.profile?.name || formatDisplayPhone(fromPhone, '66');

            const attachments: SocialMessageAttachment[] = [];
            if (msg?.type === 'image' && msg?.image?.url) {
              attachments.push({
                type: 'image',
                url: String(msg.image.url),
                name: 'WhatsApp Image',
              });
            }

            const textBody =
              msg?.type === 'text'
                ? String(msg?.text?.body || '')
                : msg?.image?.caption
                ? String(msg.image.caption)
                : `📷 [WhatsApp ${msg?.type || 'media'} message]`;

            if (textBody || attachments.length > 0) {
              await recordInboundSocialMessageInternal({
                channel: 'whatsapp',
                externalContactId: fromPhone,
                contactName: profileName,
                contactPhone: formatDisplayPhone(fromPhone, '66'),
                text: textBody,
                attachments: attachments.length > 0 ? attachments : undefined,
              });
            }
          }
        }
      }
      return NextResponse.json({ status: 'ok', channel: 'whatsapp' });
    }

    // 2. WhatsApp Self-Hosted / QR Gateway Payload (WAHA / Evolution API / UltraMsg)
    if (
      (payload?.event === 'message' || payload?.event === 'messages.upsert' || payload?.data?.from) &&
      (payload?.payload?.from || payload?.data?.from || payload?.data?.key?.remoteJid)
    ) {
      const expectedGwSecret = (process.env.WHATSAPP_WEBHOOK_SECRET || '').trim();
      if (expectedGwSecret) {
        const suppliedSecret = (
          req.headers.get('x-webhook-secret') ||
          req.headers.get('x-api-key') ||
          req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
          ''
        ).trim();
        if (!timingSafeCompare(suppliedSecret, expectedGwSecret)) {
          return NextResponse.json({ error: 'Invalid WhatsApp gateway secret' }, { status: 401 });
        }
      }

      const rawFrom =
        payload?.payload?.from ||
        payload?.data?.from ||
        payload?.data?.key?.remoteJid ||
        '';
      const fromMe = Boolean(payload?.payload?.fromMe || payload?.data?.key?.fromMe);
      if (!fromMe && rawFrom) {
        const fromPhone = String(rawFrom).split('@')[0].replace(/\D/g, '');
        const senderName =
          payload?.payload?._data?.notifyName ||
          payload?.data?.pushName ||
          formatDisplayPhone(fromPhone, '66');
        const text =
          payload?.payload?.body ||
          payload?.data?.body ||
          payload?.data?.message?.conversation ||
          payload?.data?.message?.extendedTextMessage?.text ||
          '';
        const mediaUrl = payload?.payload?.mediaUrl || payload?.data?.mediaUrl;
        const attachments: SocialMessageAttachment[] = mediaUrl
          ? [{ type: 'image', url: String(mediaUrl), name: 'WhatsApp Media' }]
          : [];

        if (fromPhone && (text || attachments.length > 0)) {
          await recordInboundSocialMessageInternal({
            channel: 'whatsapp',
            externalContactId: fromPhone,
            contactName: senderName,
            contactPhone: formatDisplayPhone(fromPhone, '66'),
            text: text || '📷 [WhatsApp Photo]',
            attachments: attachments.length > 0 ? attachments : undefined,
          });
        }
      }
      return NextResponse.json({ status: 'ok', channel: 'whatsapp_gateway' });
    }

    // 3. Facebook Messenger / Instagram Payload (`object === "page"` or `"instagram"`)
    if (
      (payload?.object === 'page' || payload?.object === 'instagram') &&
      Array.isArray(payload?.entry)
    ) {
      const channel = payload.object === 'instagram' ? 'instagram' : 'facebook';
      for (const entry of payload.entry) {
        const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
        for (const event of messaging) {
          if (event?.message?.is_echo) continue;
          const senderId = String(event?.sender?.id || '');
          const text = String(event?.message?.text || '').trim();
          const rawAttachments = Array.isArray(event?.message?.attachments)
            ? event.message.attachments
            : [];
          const attachments: SocialMessageAttachment[] = [];

          for (const att of rawAttachments) {
            if (att?.payload?.url) {
              attachments.push({
                type: att.type === 'image' ? 'image' : 'file',
                url: String(att.payload.url),
                name: `${channel.toUpperCase()} ${att.type || 'Attachment'}`,
              });
            }
          }

          if (senderId && (text || attachments.length > 0)) {
            await recordInboundSocialMessageInternal({
              channel,
              externalContactId: senderId,
              contactName: `${channel === 'instagram' ? 'IG' : 'FB'} User #${senderId.slice(-5)}`,
              text: text || `📷 [Sent ${attachments.length} attachment(s)]`,
              attachments: attachments.length > 0 ? attachments : undefined,
            });
          }
        }
      }
      return NextResponse.json({ status: 'ok', channel });
    }

    // 4. Telegram Bot Webhook Payload (`message.chat.id`)
    if (payload?.message?.chat?.id) {
      const expectedTgSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
      if (expectedTgSecret) {
        const tgHeader = (req.headers.get('x-telegram-bot-api-secret-token') || '').trim();
        if (!timingSafeCompare(tgHeader, expectedTgSecret)) {
          return NextResponse.json({ error: 'Invalid Telegram webhook secret' }, { status: 401 });
        }
      }

      const chat = payload.message.chat;
      const from = payload.message.from || {};
      const senderId = String(chat.id);
      const name =
        [from.first_name, from.last_name].filter(Boolean).join(' ') ||
        from.username ||
        `Telegram #${senderId}`;
      const text = String(payload.message.text || payload.message.caption || '').trim();

      if (text) {
        await recordInboundSocialMessageInternal({
          channel: 'telegram',
          externalContactId: senderId,
          contactName: name,
          text,
        });
      }
      return NextResponse.json({ status: 'ok', channel: 'telegram' });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    console.error('[Omnichannel Social Webhook Error]:', err);
    return NextResponse.json({ status: 'error', message: 'Webhook error' }, { status: 500 });
  }
}
