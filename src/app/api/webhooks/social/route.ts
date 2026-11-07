import { NextRequest, NextResponse } from 'next/server';
import { recordInboundSocialMessageAction } from '@/actions/social-inbox';
import { formatDisplayPhone } from '@/lib/social-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/webhooks/social
 * Supports Meta (WhatsApp Cloud API / Facebook Messenger / Instagram) hub.challenge verification
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json({
    ok: true,
    service: 'That Laundry Shop — Omnichannel Social Webhook (WhatsApp, Messenger, Instagram, Telegram)',
    verifyTokenReceived: Boolean(token),
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/webhooks/social
 * Handles inbound messages from WhatsApp Business Cloud API, Facebook Messenger, Instagram, and Telegram
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));

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
            const textBody =
              msg?.type === 'text'
                ? String(msg?.text?.body || '')
                : `[WhatsApp ${msg?.type || 'media'} message]`;

            if (textBody) {
              await recordInboundSocialMessageAction({
                channel: 'whatsapp',
                externalContactId: fromPhone,
                contactName: profileName,
                contactPhone: formatDisplayPhone(fromPhone, '66'),
                text: textBody,
              });
            }
          }
        }
      }
      return NextResponse.json({ status: 'ok', channel: 'whatsapp' });
    }

    // 2. Facebook Messenger / Instagram Payload (`object === "page"` or `"instagram"`)
    if (
      (payload?.object === 'page' || payload?.object === 'instagram') &&
      Array.isArray(payload?.entry)
    ) {
      const channel = payload.object === 'instagram' ? 'instagram' : 'facebook';
      for (const entry of payload.entry) {
        const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
        for (const event of messaging) {
          const senderId = String(event?.sender?.id || '');
          const text = String(event?.message?.text || '').trim();
          if (senderId && text) {
            await recordInboundSocialMessageAction({
              channel,
              externalContactId: senderId,
              contactName: `${channel === 'instagram' ? 'IG' : 'FB'} User #${senderId.slice(-5)}`,
              text,
            });
          }
        }
      }
      return NextResponse.json({ status: 'ok', channel });
    }

    // 3. Telegram Bot Webhook Payload (`message.chat.id`)
    if (payload?.message?.chat?.id) {
      const chat = payload.message.chat;
      const from = payload.message.from || {};
      const senderId = String(chat.id);
      const name =
        [from.first_name, from.last_name].filter(Boolean).join(' ') ||
        from.username ||
        `Telegram #${senderId}`;
      const text = String(payload.message.text || payload.message.caption || '').trim();

      if (text) {
        await recordInboundSocialMessageAction({
          channel: 'telegram',
          externalContactId: from.username ? `@${from.username}` : senderId,
          contactName: name,
          text,
        });
      }
      return NextResponse.json({ status: 'ok', channel: 'telegram' });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    console.error('[Omnichannel Social Webhook Error]:', err);
    return NextResponse.json({ status: 'error', message: err?.message }, { status: 200 });
  }
}
