import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { uploadBufferToGcs } from '@/lib/gcs';
import {
  recordInboundSocialMessageInternal,
  recordOutboundSocialMessageFromSystemInternal,
} from '@/lib/social-inbox-internal';
import type { SocialChannelConfig, SocialMessageAttachment } from '@/types/social-inbox';

export interface GmailCredentials {
  emailAddress: string;
  appPassword: string;
  displayName: string;
  imapHost: string;
  smtpHost: string;
  isConfigured: boolean;
}

export function resolveGmailCredentials(emailCfg?: SocialChannelConfig['email']): GmailCredentials {
  const emailAddress = (
    emailCfg?.emailAddress ||
    process.env.GMAIL_USER ||
    ''
  ).trim();
  const appPassword = (
    emailCfg?.appPassword ||
    process.env.GMAIL_APP_PASSWORD ||
    ''
  )
    .replace(/\s+/g, '')
    .trim();
  const displayName = (
    emailCfg?.displayName ||
    process.env.GMAIL_DISPLAY_NAME ||
    'That Laundry Shop'
  ).trim();
  const imapHost = (emailCfg?.imapHost || 'imap.gmail.com').trim();
  const smtpHost = (emailCfg?.smtpHost || 'smtp.gmail.com').trim();

  return {
    emailAddress,
    appPassword,
    displayName,
    imapHost,
    smtpHost,
    isConfigured: Boolean(emailAddress && appPassword),
  };
}

function stripQuotedReplyChain(rawText: string): string {
  const normalized = (rawText || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  const lines = normalized.split('\n');
  const cleaned: string[] = [];
  for (const line of lines) {
    // Stop at standard Gmail / Outlook quoted reply headers
    if (
      /^On .+ wrote:$/i.test(line.trim()) ||
      /^เมื่อ .+ เขียนว่า:$/i.test(line.trim()) ||
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(line.trim()) ||
      /^From:\s.+@/i.test(line.trim())
    ) {
      break;
    }
    if (line.trim().startsWith('>')) continue;
    cleaned.push(line);
  }
  const result = cleaned.join('\n').trim();
  return result || normalized.slice(0, 2000);
}

function htmlToPlainText(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function testGmailConnection(
  emailAddress: string,
  appPassword: string,
  imapHost = 'imap.gmail.com'
): Promise<{ ok: boolean; error?: string; mailboxCount?: number }> {
  const user = (emailAddress || '').trim();
  const pass = (appPassword || '').replace(/\s+/g, '').trim();
  if (!user || !pass) {
    return { ok: false, error: 'Please enter both Gmail address and App Password.' };
  }

  const client = new ImapFlow({
    host: imapHost,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const exists = typeof client.mailbox === 'object' && client.mailbox ? client.mailbox.exists : 0;
    lock.release();
    await client.logout();
    return { ok: true, mailboxCount: exists };
  } catch (err: any) {
    try {
      client.close();
    } catch {}
    return {
      ok: false,
      error: err?.responseText || err?.message || 'Failed to connect to Gmail IMAP.',
    };
  }
}

function isAutomatedMarketingOrNoReplyEmail(
  rawFromEmail: string,
  parsed: any,
  isWebBookingRelay: boolean
): boolean {
  if (isWebBookingRelay) return false;
  const email = (rawFromEmail || '').toLowerCase();
  if (
    /^(?:no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|notifications?|newsletter|marketing|promo|promotions|ads-noreply|updates?|automated|news|digest|info@news|hello@news)@/i.test(
      email
    )
  ) {
    return true;
  }
  const domain = email.split('@')[1] || '';
  if (
    /(?:^|\.)(?:tiktok\.com|facebookmail\.com|instagram\.com|woocommerce\.com|woo\.com|wordpress\.com|googleads\.com|ads\.google\.com|mailchimp\.com|sendgrid\.net|hubspotemail\.net|canva\.com|linkedin\.com|twitter\.com|x\.com)$/i.test(
      domain
    )
  ) {
    return true;
  }
  try {
    const headers = parsed?.headers;
    if (headers && typeof headers.get === 'function') {
      if (headers.get('list-unsubscribe')) return true;
      const prec = String(headers.get('precedence') || '').toLowerCase();
      if (prec === 'bulk' || prec === 'list' || prec === 'junk') return true;
      const autoSub = String(headers.get('auto-submitted') || '').toLowerCase();
      if (autoSub && autoSub !== 'no') return true;
    }
  } catch {}
  return false;
}

let isSyncingGmail = false;
let lastGmailSyncAtMs = 0;

/**
 * Pulls recent inbound emails from Gmail INBOX (and outbound replies from Sent Mail)
 * into Omnichannel Live Chat with full messageId deduplication.
 */
export async function syncGmailInboxMessages(
  emailCfg?: SocialChannelConfig['email'],
  opts?: { force?: boolean; limit?: number }
): Promise<{ ok: boolean; imported: number; error?: string; skipped?: boolean }> {
  const creds = resolveGmailCredentials(emailCfg);
  if (!creds.isConfigured) {
    return { ok: false, imported: 0, error: 'Gmail is not configured.' };
  }
  if (isSyncingGmail) {
    return { ok: true, imported: 0, skipped: true };
  }
  const now = Date.now();
  if (!opts?.force && now - lastGmailSyncAtMs < 25_000) {
    return { ok: true, imported: 0, skipped: true };
  }

  isSyncingGmail = true;
  lastGmailSyncAtMs = now;
  const maxFetch = opts?.limit ?? 25;
  let imported = 0;

  const client = new ImapFlow({
    host: creds.imapHost,
    port: 993,
    secure: true,
    auth: { user: creds.emailAddress, pass: creds.appPassword },
    logger: false,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
  });

  try {
    await client.connect();

    // 1. Pull latest INBOX messages
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = typeof client.mailbox === 'object' && client.mailbox ? client.mailbox.exists : 0;
      if (total > 0) {
        const startSeq = Math.max(1, total - maxFetch + 1);
        const range = `${startSeq}:${total}`;

        for await (const msg of client.fetch(range, {
          uid: true,
          envelope: true,
          source: true,
          flags: true,
          internalDate: true,
        })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const fromObj = parsed.from?.value?.[0];
          const rawFromEmail = (fromObj?.address || '').trim().toLowerCase();
          if (!rawFromEmail) continue;
          // Skip self-sent emails in INBOX
          if (rawFromEmail === creds.emailAddress.toLowerCase()) continue;

          const subject = (parsed.subject || '').trim();
          const rawBody =
            parsed.text?.trim() ||
            (typeof parsed.html === 'string' ? htmlToPlainText(parsed.html) : '');
          const cleanBody = stripQuotedReplyChain(rawBody);

          // Split automated Web Booking emails (from thatlaundryshopbooking@gmail.com) into individual
          // per-customer threads instead of lumping every customer into one "That Laundry Shop" thread!
          let targetEmail = rawFromEmail;
          let targetName = (fromObj?.name || rawFromEmail.split('@')[0] || rawFromEmail).trim();
          let targetPhone: string | undefined;

          const isWebBookingRelay =
            rawFromEmail === 'thatlaundryshopbooking@gmail.com' ||
            rawFromEmail === 'thatlaundryshopcso@gmail.com' ||
            /\[new booking\]/i.test(subject);

          // Skip automated ads / newsletters / no-reply notifications unless explicitly disabled
          if (
            emailCfg?.filterAutomatedEmails !== false &&
            isAutomatedMarketingOrNoReplyEmail(rawFromEmail, parsed, isWebBookingRelay)
          ) {
            continue;
          }

          if (isWebBookingRelay) {
            const ownEmails = new Set([
              creds.emailAddress.toLowerCase(),
              'thatlaundryshopbooking@gmail.com',
              'thatlaundryshopcso@gmail.com',
              'sales@thatlaundryshop.com',
              'info@thatlaundryshop.com',
            ]);
            const isOwnShopEmail = (addr: string) =>
              ownEmails.has(addr) ||
              addr.endsWith('@thatlaundryshop.com') ||
              /^thatlaundryshop[a-z0-9._-]*@gmail\.com$/i.test(addr);
            const collectAddrs = (field: any): Array<{ address: string; name?: string }> => {
              if (!field) return [];
              const arr = Array.isArray(field) ? field : [field];
              const out: Array<{ address: string; name?: string }> = [];
              for (const item of arr) {
                for (const v of item?.value || []) {
                  if (v?.address) out.push({ address: String(v.address).trim().toLowerCase(), name: v.name });
                }
              }
              return out;
            };

            const candidateAddrs = [
              ...collectAddrs(parsed.replyTo),
              ...collectAddrs(parsed.to),
              ...collectAddrs(parsed.cc),
            ].filter((a) => a.address && !isOwnShopEmail(a.address));

            // Extract customer name from subject `[New Booking] Jennifer Griffin - That Laundry Shop` or body `Hi <Name>,`
            const subjNameMatch =
              subject.match(/\[New Booking\]\s+(.+?)\s*(?:-\s*That Laundry Shop|$)/i) ||
              cleanBody.match(/^Hi\s+([^,\n]{2,60}),/im);
            const extractedName = subjNameMatch?.[1]?.trim();

            // Extract customer phone from `Contact: +1 3233098747`
            const phoneMatch = cleanBody.match(/Contact:\s*([+\d][\d\s-]{6,20})/i);
            if (phoneMatch?.[1]) {
              targetPhone = phoneMatch[1].trim();
            }

            // Also check for an email address mentioned inside the booking body
            const bodyEmailMatch = cleanBody.match(/(?:Email|E-mail)\s*[:\-]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
            const customerEmail =
              candidateAddrs[0]?.address ||
              (bodyEmailMatch?.[1] && !ownEmails.has(bodyEmailMatch[1].toLowerCase())
                ? bodyEmailMatch[1].toLowerCase()
                : '');

            if (customerEmail) {
              targetEmail = customerEmail;
              targetName = extractedName || candidateAddrs[0]?.name || customerEmail.split('@')[0];
            } else {
              const phoneKey = targetPhone ? targetPhone.replace(/\D/g, '') : '';
              const nameSlug = (extractedName || `booking_${msg.uid}`)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '');
              targetEmail = phoneKey ? `booking:${phoneKey}` : `booking:${nameSlug}`;
              targetName = extractedName ? `📋 ${extractedName}` : `📋 Web Booking #${msg.uid}`;
            }
          }

          const combinedText = subject
            ? `📧 ${subject}${cleanBody ? `\n\n${cleanBody}` : ''}`
            : cleanBody || '📧 [Empty Email]';

          const msgIdKey = parsed.messageId
            ? `gmail_${parsed.messageId.replace(/[^a-zA-Z0-9._@-]/g, '').slice(0, 120)}`
            : `gmail_uid_${msg.uid}`;
          const msgDateIso = (parsed.date || (msg.internalDate instanceof Date ? msg.internalDate : new Date())).toISOString();
          const isSeenInGmail = Boolean(msg.flags && msg.flags.has('\\Seen'));

          // Upload up to 3 attachments (images / PDFs / videos <= 12MB)
          const attachments: SocialMessageAttachment[] = [];
          if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
            for (const att of parsed.attachments.slice(0, 3)) {
              if (!att.content || att.content.length > 12 * 1024 * 1024) continue;
              const ctype = (att.contentType || 'application/octet-stream').toLowerCase();
              const isImg = ctype.startsWith('image/');
              const isVid = ctype.startsWith('video/');
              const ext = (att.filename?.split('.').pop() || (isImg ? 'jpg' : isVid ? 'mp4' : 'bin'))
                .replace(/[^a-zA-Z0-9]/g, '')
                .toLowerCase() || 'bin';
              const safeName = (att.filename || `email-att-${Date.now()}.${ext}`).slice(0, 120);

              const url = await uploadBufferToGcs(att.content, {
                entityType: 'system',
                entityId: `gmail_${targetEmail.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`,
                subType: 'chat',
                contentType: ctype,
                extension: ext,
                customFileName: `gmail-${msg.uid}-${safeName}`,
              }).catch(() => null);

              if (url) {
                attachments.push({
                  type: isImg ? 'image' : isVid ? 'video' : 'file',
                  url,
                  name: safeName,
                });
              }
            }
          }

          const res = await recordInboundSocialMessageInternal({
            channel: 'email',
            externalContactId: targetEmail,
            contactName: targetName,
            contactPhone: targetPhone,
            senderName: targetName,
            text: combinedText.slice(0, 4000),
            attachments: attachments.length > 0 ? attachments : undefined,
            externalMessageId: msgIdKey,
            createdAt: msgDateIso,
            skipUnreadIncrement: isSeenInGmail,
          });
          if (res.success && !(res as any).deduped) {
            imported++;
          }
        }
      }
    } finally {
      lock.release();
    }

    // 2. Also sync recent outbound replies from "[Gmail]/Sent Mail" (best-effort)
    try {
      const sentLock = await client.getMailboxLock('[Gmail]/Sent Mail');
      try {
        const sentTotal = typeof client.mailbox === 'object' && client.mailbox ? client.mailbox.exists : 0;
        if (sentTotal > 0) {
          const startSeq = Math.max(1, sentTotal - Math.min(15, maxFetch) + 1);
          for await (const msg of client.fetch(`${startSeq}:${sentTotal}`, {
            uid: true,
            source: true,
            internalDate: true,
          })) {
            if (!msg.source) continue;
            const parsed = await simpleParser(msg.source);
            const toAddrObj = Array.isArray(parsed.to)
              ? parsed.to[0]?.value?.[0]
              : parsed.to?.value?.[0];
            const toEmail = (toAddrObj?.address || '').trim().toLowerCase();
            if (!toEmail || toEmail === creds.emailAddress.toLowerCase()) continue;

            const toName = (toAddrObj?.name || toEmail.split('@')[0] || toEmail).trim();
            const subject = (parsed.subject || '').trim();
            const rawBody =
              parsed.text?.trim() ||
              (typeof parsed.html === 'string' ? htmlToPlainText(parsed.html) : '');
            const cleanBody = stripQuotedReplyChain(rawBody);
            const combinedText = subject
              ? `📧 ${subject}${cleanBody ? `\n\n${cleanBody}` : ''}`
              : cleanBody || '📧 [Sent Email]';

            const msgIdKey = parsed.messageId
              ? `gmail_${parsed.messageId.replace(/[^a-zA-Z0-9._@-]/g, '').slice(0, 120)}`
              : `gmail_sent_uid_${msg.uid}`;
            const msgDateIso = (parsed.date || (msg.internalDate instanceof Date ? msg.internalDate : new Date())).toISOString();

            const res = await recordOutboundSocialMessageFromSystemInternal({
              channel: 'email',
              externalContactId: toEmail,
              contactName: toName,
              text: combinedText.slice(0, 4000),
              senderName: creds.displayName || 'Gmail',
              deliveryMethod: 'gmail_smtp',
              externalMessageId: msgIdKey,
              createdAt: msgDateIso,
              isHistorySync: true,
            });
            if (res.success && !(res as any).deduped) {
              imported++;
            }
          }
        }
      } finally {
        sentLock.release();
      }
    } catch {
      // Non-fatal if Sent Mail mailbox has a localized name
    }

    await client.logout();
    return { ok: true, imported };
  } catch (err: any) {
    try {
      client.close();
    } catch {}
    console.warn('[GmailInbox] Sync failed:', err?.message || err);
    return {
      ok: false,
      imported,
      error: err?.responseText || err?.message || 'Gmail sync failed',
    };
  } finally {
    isSyncingGmail = false;
  }
}

export async function sendGmailReply(opts: {
  emailCfg?: SocialChannelConfig['email'];
  toEmail: string;
  subject?: string;
  text: string;
  attachments?: Array<{ url: string; name?: string }>;
}): Promise<{ ok: boolean; externalMessageId?: string; error?: string }> {
  const creds = resolveGmailCredentials(opts.emailCfg);
  if (!creds.isConfigured) {
    return { ok: false, error: 'Gmail address or App Password is not configured.' };
  }
  const to = (opts.toEmail || '').trim();
  if (!to || !to.includes('@')) {
    return { ok: false, error: `Invalid recipient email address: "${to}"` };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: 465,
      secure: true,
      auth: {
        user: creds.emailAddress,
        pass: creds.appPassword,
      },
    });

    const mailAttachments = (opts.attachments || [])
      .filter((a) => Boolean(a.url))
      .map((a) => ({
        filename: a.name || a.url.split('/').pop() || 'attachment',
        path: a.url,
      }));

    const cleanSubject = (opts.subject || 'Re: That Laundry Shop').trim();
    const info = await transporter.sendMail({
      from: `"${creds.displayName}" <${creds.emailAddress}>`,
      to,
      subject: cleanSubject,
      text: opts.text || 'Please see attached.',
      attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
    });

    const extId = info.messageId
      ? `gmail_${String(info.messageId).replace(/[^a-zA-Z0-9._@-]/g, '').slice(0, 120)}`
      : undefined;

    return { ok: true, externalMessageId: extId };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.response || err?.message || 'Failed to send Gmail reply',
    };
  }
}

/**
 * 2-Way Read Sync back to Gmail:
 * When staff mark an Email conversation as read in Omni Live Chat,
 * also mark matching UNSEEN emails in Gmail INBOX with `\Seen` so Gmail stays in sync!
 */
export async function markGmailEmailsAsReadBySender(
  emailCfg: SocialChannelConfig['email'] | undefined,
  externalContactId: string,
  contactName?: string
): Promise<{ ok: boolean; markedCount: number }> {
  const creds = resolveGmailCredentials(emailCfg);
  if (!creds.isConfigured || !externalContactId) {
    return { ok: false, markedCount: 0 };
  }

  const client = new ImapFlow({
    host: creds.imapHost,
    port: 993,
    secure: true,
    auth: { user: creds.emailAddress, pass: creds.appPassword },
    logger: false,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let markedCount = 0;
    try {
      let uids: number[] = [];
      if (externalContactId.includes('@')) {
        const found = await client.search({ seen: false, from: externalContactId }, { uid: true });
        if (Array.isArray(found)) uids = found;
      } else if (externalContactId.startsWith('booking:') && contactName) {
        const cleanName = contactName.replace(/^📋\s*/, '').trim();
        if (cleanName.length >= 2) {
          const found = await client.search({ seen: false, subject: cleanName }, { uid: true });
          if (Array.isArray(found)) uids = found;
        }
      }
      if (uids.length > 0) {
        await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
        markedCount = uids.length;
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { ok: true, markedCount };
  } catch {
    try {
      client.close();
    } catch {}
    return { ok: false, markedCount: 0 };
  }
}
