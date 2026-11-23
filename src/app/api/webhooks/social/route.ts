import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  loadSocialChannelConfig,
  PendingSocialMediaJobInput,
  recordInboundSocialMessageInternal,
  recordOutboundSocialMessageFromSystemInternal,
  updateOutboundSocialMessageStatusInternal,
} from '@/lib/social-inbox-internal';
import { resolveWhatsAppCloudCredentials } from '@/lib/whatsapp-cloud-api';
import { formatDisplayPhone } from '@/lib/social-helpers';
import { SocialMessageAttachment } from '@/types/social-inbox';
import { checkRateLimit, getRequestClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Non-blocking parser for Meta WhatsApp Cloud API message objects (inbound `messages`,
 * Coexistence outbound `message_echoes`, and Coexistence `history` thread items).
 * For Cloud API media (`mediaObj.id`), enqueues a durable `PendingSocialMediaJobInput` so the
 * message text/placeholder saves & displays in <100ms while GCS download/upload completes in background!
 */
function extractWhatsAppCloudMessageContent(
  msg: any,
  customerExtId: string,
  hasCloudAccessToken: boolean
): {
  textBody: string;
  attachments: SocialMessageAttachment[];
  pendingMediaJob?: PendingSocialMediaJobInput;
} {
  const attachments: SocialMessageAttachment[] = [];
  let pendingMediaJob: PendingSocialMediaJobInput | undefined;
  let textBody = '';
  const msgType = String(msg?.type || 'text').toLowerCase();

  if (msgType === 'text') {
    textBody = String(msg?.text?.body || '');
  } else if (msgType === 'image' || msgType === 'sticker') {
    const mediaObj = msgType === 'sticker' ? msg?.sticker : msg?.image;
    const attachmentName = msgType === 'sticker' ? 'WhatsApp Sticker' : 'WhatsApp Photo';
    textBody = String(mediaObj?.caption || '').trim();

    if (mediaObj?.id && hasCloudAccessToken) {
      pendingMediaJob = {
        mediaId: String(mediaObj.id),
        senderPhone: customerExtId,
        fallbackMimeType: mediaObj.mime_type || 'image/jpeg',
        attachmentType: 'image',
        attachmentName,
      };
    } else if (mediaObj?.url && !/lookaside\.fbsbx\.com/i.test(String(mediaObj.url))) {
      attachments.push({
        type: 'image',
        url: String(mediaObj.url),
        name: attachmentName,
      });
    }
    if (!textBody) {
      textBody =
        msgType === 'sticker' ? '🎨 [WhatsApp Sticker]' : '📷 [Sent a photo via WhatsApp]';
    }
  } else if (msgType === 'document') {
    const docObj = msg?.document;
    const docName = String(docObj?.filename || 'WhatsApp Document.pdf');
    textBody = String(docObj?.caption || '').trim();

    if (docObj?.id && hasCloudAccessToken) {
      pendingMediaJob = {
        mediaId: String(docObj.id),
        senderPhone: customerExtId,
        fallbackMimeType: docObj.mime_type || 'application/pdf',
        originalFilename: docName,
        attachmentType: String(docObj.mime_type || '').startsWith('image/') ? 'image' : 'file',
        attachmentName: docName,
      };
    } else if (docObj?.url && !/lookaside\.fbsbx\.com/i.test(String(docObj.url))) {
      attachments.push({
        type: 'file',
        url: String(docObj.url),
        name: docName,
      });
    }
    if (!textBody) {
      textBody = `📄 [Sent a document: ${docName}]`;
    }
  } else if (msgType === 'audio' || msgType === 'voice' || msgType === 'video') {
    const mediaObj = msg?.[msgType] || msg?.audio || msg?.video;
    const mediaLabel = msgType === 'video' ? 'WhatsApp Video' : 'WhatsApp Voice Note';
    textBody = String(mediaObj?.caption || '').trim();

    if (mediaObj?.id && hasCloudAccessToken) {
      pendingMediaJob = {
        mediaId: String(mediaObj.id),
        senderPhone: customerExtId,
        fallbackMimeType:
          mediaObj.mime_type || (msgType === 'video' ? 'video/mp4' : 'audio/ogg'),
        attachmentType: 'file',
        attachmentName: mediaLabel,
      };
    }
    if (!textBody) {
      textBody =
        msgType === 'video'
          ? '🎥 [Sent a video via WhatsApp]'
          : '🎤 [Sent a voice message via WhatsApp]';
    }
  } else if (msgType === 'location') {
    const loc = msg?.location || {};
    const lat = loc.latitude;
    const lng = loc.longitude;
    const locName = loc.name ? String(loc.name).trim() : '';
    const locAddr = loc.address ? String(loc.address).trim() : '';
    const labelParts = [locName, locAddr].filter(Boolean).join(' — ');
    const mapsUrl =
      lat !== undefined && lng !== undefined
        ? `https://www.google.com/maps?q=${lat},${lng}`
        : '';
    textBody = `📍 Shared Location${labelParts ? `: ${labelParts}` : ''}${
      mapsUrl ? `\n🗺️ Google Maps: ${mapsUrl}` : ''
    }`;
  } else if (msgType === 'interactive' || msgType === 'button') {
    const interactive = msg?.interactive;
    const replyText =
      interactive?.button_reply?.title ||
      interactive?.list_reply?.title ||
      msg?.button?.text ||
      msg?.button?.payload ||
      '';
    textBody = String(replyText || '🔘 [Interactive Button Reply]');
  } else if (msgType === 'reaction') {
    const emoji = msg?.reaction?.emoji || '👍';
    textBody = `Reacted ${emoji} to a message`;
  } else if (msgType === 'template') {
    textBody = String(
      msg?.template?.name ? `📋 [Template: ${msg.template.name}]` : '📋 [WhatsApp Template]'
    );
  } else {
    textBody = `📷 [WhatsApp ${msgType} message]`;
  }

  return { textBody, attachments, pendingMediaJob };
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
    const config = await loadSocialChannelConfig();
    const waCreds = resolveWhatsAppCloudCredentials(config?.whatsapp);
    const configuredTokens = Array.from(
      new Set(
        [
          process.env.WHATSAPP_VERIFY_TOKEN,
          process.env.SOCIAL_WEBHOOK_VERIFY_TOKEN,
          process.env.META_WEBHOOK_VERIFY_TOKEN,
          config?.whatsapp?.verifyToken,
          waCreds.verifyToken,
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
 * Handles live inbound & Coexistence outbound echo messages from:
 *  1) WhatsApp Business Cloud API (`messages`, `statuses`, `smb_message_echoes`, `history`)
 *  2) WhatsApp QR / REST Gateways (WAHA, Evolution API, Baileys, UltraMsg)
 *  3) Facebook Messenger & Instagram Direct (Meta Graph Webhook)
 *  4) Telegram Bot Webhook
 */
export async function POST(req: NextRequest) {
  const webhookReceivedAtMs = Date.now();
  try {
    const clientIp = getRequestClientIp(req);
    const rate = checkRateLimit(`social-webhook:${clientIp}`, 120, 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const rawBody = await req.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};

    let config;
    try {
      config = await loadSocialChannelConfig(false, true);
    } catch (cfgErr: any) {
      console.error('[SocialWebhook] Temporary storage failure loading channel config:', {
        reason: String(cfgErr?.message || 'db_error').slice(0, 160),
      });
      return NextResponse.json(
        { status: 'retry', error: 'Temporary storage failure' },
        { status: 503 }
      );
    }

    const waCreds = resolveWhatsAppCloudCredentials(config?.whatsapp);
    const hasCloudToken = Boolean(waCreds.accessToken);

    // Verify Meta X-Hub-Signature-256 when META_APP_SECRET or whatsapp.appSecret is configured
    const metaAppSecret = waCreds.appSecret || (process.env.META_APP_SECRET || '').trim();
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

    let storageFailureCount = 0;

    // 1. WhatsApp Business Cloud API Payload (`object === "whatsapp_business_account"`)
    if (payload?.object === 'whatsapp_business_account' && Array.isArray(payload?.entry)) {
      const defaultCc = config?.whatsapp?.defaultCountryCode || '66';

      for (const entry of payload.entry) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const val = change?.value;
          const businessDisplayDigits = String(val?.metadata?.display_phone_number || '').replace(
            /\D/g,
            ''
          );

          // 1A. Handle Outbound Message Delivery & Read Receipt Statuses (`sent` | `delivered` | `read` | `failed`)
          const statuses = Array.isArray(val?.statuses) ? val.statuses : [];
          for (const st of statuses) {
            const extId = String(st?.id || '').trim();
            const rawStatus = String(st?.status || '').toLowerCase();
            if (!extId) continue;

            if (
              rawStatus === 'sent' ||
              rawStatus === 'delivered' ||
              rawStatus === 'read' ||
              rawStatus === 'failed'
            ) {
              const errObj = Array.isArray(st?.errors) && st.errors[0] ? st.errors[0] : null;
              const errorText = errObj
                ? `${errObj.title || 'WhatsApp Delivery Error'}${
                    errObj.error_data?.details ? `: ${errObj.error_data.details}` : ''
                  }`
                : undefined;

              const stRes = await updateOutboundSocialMessageStatusInternal({
                externalMessageId: extId,
                status: rawStatus as 'sent' | 'delivered' | 'read' | 'failed',
                errorText,
              });
              if (stRes.error) {
                storageFailureCount++;
              }
            }
          }

          // 1B. Handle Inbound Customer Messages (`from` phone digits or `user_id` fallback)
          const contacts = Array.isArray(val?.contacts) ? val.contacts : [];
          const messages = Array.isArray(val?.messages) ? val.messages : [];

          for (const msg of messages) {
            const fromDigits = String(msg?.from || '').replace(/\D/g, '');
            const fromUserId = String(msg?.user_id || '').trim();
            const senderExtId = fromDigits || fromUserId;
            if (!senderExtId) continue;

            const wamid = String(msg?.id || '').trim() || undefined;
            const msgTimestampSec = Number(msg?.timestamp);
            const createdAtIso =
              Number.isFinite(msgTimestampSec) && msgTimestampSec > 1000000000
                ? new Date(msgTimestampSec * 1000).toISOString()
                : undefined;

            const contactProfile = contacts.find(
              (c: any) =>
                (fromDigits && String(c?.wa_id) === fromDigits) ||
                (fromUserId && String(c?.user_id) === fromUserId)
            );
            const displayPhone = fromDigits ? formatDisplayPhone(fromDigits, defaultCc) : '';
            const profileName =
              contactProfile?.profile?.name || displayPhone || senderExtId;

            const { textBody, attachments, pendingMediaJob } = extractWhatsAppCloudMessageContent(
              msg,
              senderExtId,
              hasCloudToken
            );

            if (textBody || attachments.length > 0 || pendingMediaJob) {
              const isReactionOnly = String(msg?.type || '').toLowerCase() === 'reaction';
              const inRes = await recordInboundSocialMessageInternal({
                channel: 'whatsapp',
                externalContactId: senderExtId,
                contactName: profileName,
                contactPhone: displayPhone || undefined,
                text: textBody,
                attachments: attachments.length > 0 ? attachments : undefined,
                pendingMediaJob,
                messageId: wamid ? `msg_wa_cloud_${wamid}` : undefined,
                externalMessageId: wamid,
                deliveryMethod: 'whatsapp_cloud_api',
                createdAt: createdAtIso,
                skipUnreadIncrement: isReactionOnly,
                webhookReceivedAtMs,
              });
              if (!inRes.success) {
                storageFailureCount++;
              }
            }
          }

          // 1C. Handle Meta Cloud API Coexistence Outbound Echoes (`smb_message_echoes` -> `val.message_echoes`)
          // Uses `to` phone digits when available and supports `to_user_id` when phone number is omitted.
          const messageEchoes = Array.isArray(val?.message_echoes) ? val.message_echoes : [];
          for (const echo of messageEchoes) {
            const toDigits = String(echo?.to || '').replace(/\D/g, '');
            const toUserId = String(echo?.to_user_id || '').trim();
            const recipientExtId = toDigits || toUserId;
            if (!recipientExtId) continue;

            const wamid = String(echo?.id || '').trim() || undefined;
            const echoTimestampSec = Number(echo?.timestamp);
            const createdAtIso =
              Number.isFinite(echoTimestampSec) && echoTimestampSec > 1000000000
                ? new Date(echoTimestampSec * 1000).toISOString()
                : undefined;

            const contactProfile = contacts.find(
              (c: any) =>
                (toDigits && String(c?.wa_id) === toDigits) ||
                (toUserId && String(c?.user_id) === toUserId)
            );
            const displayPhone = toDigits ? formatDisplayPhone(toDigits, defaultCc) : undefined;
            const contactName = contactProfile?.profile?.name || undefined;

            const { textBody, attachments, pendingMediaJob } = extractWhatsAppCloudMessageContent(
              echo,
              recipientExtId,
              hasCloudToken
            );

            if (textBody || attachments.length > 0 || pendingMediaJob) {
              const echoRes = await recordOutboundSocialMessageFromSystemInternal({
                channel: 'whatsapp',
                externalContactId: recipientExtId,
                contactName,
                contactPhone: displayPhone,
                text: textBody,
                attachments: attachments.length > 0 ? attachments : undefined,
                pendingMediaJob,
                senderName: 'Admin (WhatsApp App)',
                messageId: wamid ? `msg_wa_echo_${wamid}` : undefined,
                externalMessageId: wamid,
                deliveryMethod: 'whatsapp_cloud_api',
                createdAt: createdAtIso,
                webhookReceivedAtMs,
              });
              if (!echoRes.success) {
                storageFailureCount++;
              }
            }
          }

          // 1D. Handle Meta Cloud API Coexistence Thread History Sync (`history` -> `val.history`)
          const historyChunks = Array.isArray(val?.history) ? val.history : [];
          for (const chunk of historyChunks) {
            const threads = Array.isArray(chunk?.threads) ? chunk.threads : [];
            for (const thread of threads) {
              const threadDigits = String(thread?.id || '').replace(/\D/g, '');
              const threadExtId = threadDigits || String(thread?.id || '').trim();
              if (!threadExtId) continue;
              const threadDisplayPhone = threadDigits
                ? formatDisplayPhone(threadDigits, defaultCc)
                : undefined;
              const histMsgs = Array.isArray(thread?.messages) ? thread.messages : [];
              for (const hMsg of histMsgs) {
                const wamid = String(hMsg?.id || '').trim() || undefined;
                const tsSec = Number(hMsg?.timestamp);
                const createdAtIso =
                  Number.isFinite(tsSec) && tsSec > 1000000000
                    ? new Date(tsSec * 1000).toISOString()
                    : undefined;
                const fromDigits = String(hMsg?.from || '').replace(/\D/g, '');
                const isFromBusiness = Boolean(
                  (businessDisplayDigits && fromDigits === businessDisplayDigits) ||
                    (fromDigits && threadDigits && fromDigits !== threadDigits)
                );

                const { textBody, attachments, pendingMediaJob } =
                  extractWhatsAppCloudMessageContent(hMsg, threadExtId, hasCloudToken);
                if (!textBody && attachments.length === 0 && !pendingMediaJob) continue;

                if (isFromBusiness) {
                  const hRes = await recordOutboundSocialMessageFromSystemInternal({
                    channel: 'whatsapp',
                    externalContactId: threadExtId,
                    contactPhone: threadDisplayPhone,
                    text: textBody,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    pendingMediaJob,
                    senderName: 'Admin (WhatsApp App)',
                    messageId: wamid ? `msg_wa_echo_${wamid}` : undefined,
                    externalMessageId: wamid,
                    deliveryMethod: 'whatsapp_cloud_api',
                    createdAt: createdAtIso,
                    isHistorySync: true,
                  });
                  if (!hRes.success) storageFailureCount++;
                } else {
                  const hRes = await recordInboundSocialMessageInternal({
                    channel: 'whatsapp',
                    externalContactId: threadExtId,
                    contactPhone: threadDisplayPhone,
                    text: textBody,
                    attachments: attachments.length > 0 ? attachments : undefined,
                    pendingMediaJob,
                    messageId: wamid ? `msg_wa_cloud_${wamid}` : undefined,
                    externalMessageId: wamid,
                    deliveryMethod: 'whatsapp_cloud_api',
                    createdAt: createdAtIso,
                    isHistorySync: true,
                  });
                  if (!hRes.success) storageFailureCount++;
                }
              }
            }
          }
        }
      }

      if (storageFailureCount > 0) {
        return NextResponse.json(
          { status: 'retry', error: 'Temporary storage failure', failedCount: storageFailureCount },
          { status: 503 }
        );
      }

      return NextResponse.json({
        status: 'ok',
        channel: 'whatsapp',
        elapsedMs: Date.now() - webhookReceivedAtMs,
      });
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
      const rawTo = payload?.payload?.to || payload?.data?.to || '';
      const fromMe = Boolean(payload?.payload?.fromMe || payload?.data?.key?.fromMe);
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

      if (!fromMe && rawFrom) {
        const fromPhone = String(rawFrom).split('@')[0].replace(/\D/g, '');
        const senderName =
          payload?.payload?._data?.notifyName ||
          payload?.data?.pushName ||
          formatDisplayPhone(fromPhone, '66');

        if (fromPhone && (text || attachments.length > 0)) {
          const gwRes = await recordInboundSocialMessageInternal({
            channel: 'whatsapp',
            externalContactId: fromPhone,
            contactName: senderName,
            contactPhone: formatDisplayPhone(fromPhone, '66'),
            text: text || '📷 [WhatsApp Photo]',
            attachments: attachments.length > 0 ? attachments : undefined,
            webhookReceivedAtMs,
          });
          if (!gwRes.success) {
            return NextResponse.json(
              { status: 'retry', error: 'Temporary storage failure' },
              { status: 503 }
            );
          }
        }
      } else if (fromMe && (rawTo || rawFrom)) {
        const peerPhone = String(rawTo || rawFrom).split('@')[0].replace(/\D/g, '');
        if (peerPhone && (text || attachments.length > 0)) {
          const gwRes = await recordOutboundSocialMessageFromSystemInternal({
            channel: 'whatsapp',
            externalContactId: peerPhone,
            contactPhone: formatDisplayPhone(peerPhone, '66'),
            text: text || '📷 [Sent a photo via WhatsApp]',
            attachments: attachments.length > 0 ? attachments : undefined,
            senderName: 'Admin (WhatsApp App)',
            webhookReceivedAtMs,
          });
          if (!gwRes.success) {
            return NextResponse.json(
              { status: 'retry', error: 'Temporary storage failure' },
              { status: 503 }
            );
          }
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
            const fbRes = await recordInboundSocialMessageInternal({
              channel,
              externalContactId: senderId,
              contactName: `${channel === 'instagram' ? 'IG' : 'FB'} User #${senderId.slice(-5)}`,
              text: text || `📷 [Sent ${attachments.length} attachment(s)]`,
              attachments: attachments.length > 0 ? attachments : undefined,
              webhookReceivedAtMs,
            });
            if (!fbRes.success) storageFailureCount++;
          }
        }
      }
      if (storageFailureCount > 0) {
        return NextResponse.json(
          { status: 'retry', error: 'Temporary storage failure' },
          { status: 503 }
        );
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
        const tgRes = await recordInboundSocialMessageInternal({
          channel: 'telegram',
          externalContactId: senderId,
          contactName: name,
          text,
          webhookReceivedAtMs,
        });
        if (!tgRes.success) {
          return NextResponse.json(
            { status: 'retry', error: 'Temporary storage failure' },
            { status: 503 }
          );
        }
      }
      return NextResponse.json({ status: 'ok', channel: 'telegram' });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: any) {
    console.error('[Omnichannel Social Webhook Error]:', {
      reason: String(err?.message || 'unknown_error').slice(0, 160),
    });
    return NextResponse.json({ status: 'error', message: 'Webhook error' }, { status: 500 });
  }
}
