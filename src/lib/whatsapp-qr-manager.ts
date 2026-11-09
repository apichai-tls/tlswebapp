import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import pino from 'pino';
import { formatDisplayPhone, formatPhoneForWhatsApp } from '@/lib/social-helpers';
import { SocialMessageAttachment } from '@/types/social-inbox';

export interface WhatsAppQrState {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  qrDataUrl: string | null;
  connectedPhone: string | null;
  connectedName: string | null;
  lastError: string | null;
  updatedAt: string;
}

interface GlobalWhatsAppSingleton {
  sock: any | null;
  state: WhatsAppQrState;
  startingPromise: Promise<WhatsAppQrState> | null;
  sentMessageIds: Set<string>;
  autoStartChecked: boolean;
}

const globalForWa = globalThis as unknown as {
  __tlsWhatsAppQrSingleton?: GlobalWhatsAppSingleton;
};

function getSingleton(): GlobalWhatsAppSingleton {
  if (!globalForWa.__tlsWhatsAppQrSingleton) {
    globalForWa.__tlsWhatsAppQrSingleton = {
      sock: null,
      state: {
        status: 'disconnected',
        qrDataUrl: null,
        connectedPhone: null,
        connectedName: null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      },
      startingPromise: null,
      sentMessageIds: new Set<string>(),
      autoStartChecked: false,
    };
  }
  return globalForWa.__tlsWhatsAppQrSingleton;
}

function getAuthDir(): string {
  return path.resolve(process.cwd(), 'storage', 'whatsapp-auth');
}

function hasSavedAuthCreds(): boolean {
  try {
    const credsPath = path.join(getAuthDir(), 'creds.json');
    return fs.existsSync(credsPath);
  } catch {
    return false;
  }
}

function extractPhoneDigitsFromJid(jid?: string | null, altJid?: string | null): string {
  for (const candidate of [altJid, jid]) {
    if (!candidate) continue;
    if (candidate.endsWith('@s.whatsapp.net') || candidate.endsWith('@c.us')) {
      const userPart = candidate.split('@')[0].split(':')[0].replace(/\D/g, '');
      if (userPart.length >= 7) return userPart;
    }
  }
  const fallback = (altJid || jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return fallback;
}

export function getWhatsAppQrStatus(): WhatsAppQrState {
  const s = getSingleton();
  // Auto-resume saved session on server boot if creds.json exists on disk
  if (!s.autoStartChecked) {
    s.autoStartChecked = true;
    if (s.state.status === 'disconnected' && hasSavedAuthCreds()) {
      startWhatsAppQrConnection(false).catch(() => {});
    }
  }
  return { ...s.state };
}

export async function startWhatsAppQrConnection(resetAuth = false): Promise<WhatsAppQrState> {
  const s = getSingleton();

  if (resetAuth) {
    await disconnectWhatsAppQrSession(true);
  }

  if (s.state.status === 'connected' && s.sock) {
    return { ...s.state };
  }

  if (s.startingPromise) {
    return s.startingPromise;
  }

  s.startingPromise = (async () => {
    try {
      const baileys: any = await import('@whiskeysockets/baileys');
      const makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket;
      const useMultiFileAuthState =
        baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState;
      const fetchLatestBaileysVersion =
        baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion;
      const DisconnectReason = baileys.DisconnectReason || baileys.default?.DisconnectReason || {};
      const downloadMediaMessage =
        baileys.downloadMediaMessage || baileys.default?.downloadMediaMessage;

      const authDir = getAuthDir();
      await fs.promises.mkdir(authDir, { recursive: true });

      const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);

      let version: [number, number, number] | undefined = undefined;
      if (typeof fetchLatestBaileysVersion === 'function') {
        try {
          const vRes = await fetchLatestBaileysVersion();
          if (vRes?.version) version = vRes.version;
        } catch {}
      }

      if (s.sock) {
        try {
          s.sock.end?.(undefined);
        } catch {}
        s.sock = null;
      }

      s.state = {
        ...s.state,
        status: 'connecting',
        lastError: null,
        updatedAt: new Date().toISOString(),
      };

      const logger = pino({ level: 'silent' });
      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: authState,
        logger,
        printQRInTerminal: false,
        browser: ['That Laundry Shop POS', 'Chrome', '122.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      s.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const dataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 280,
              color: {
                dark: '#0f172a',
                light: '#ffffff',
              },
            });
            s.state = {
              status: 'qr_ready',
              qrDataUrl: dataUrl,
              connectedPhone: null,
              connectedName: null,
              lastError: null,
              updatedAt: new Date().toISOString(),
            };
          } catch (qrErr: any) {
            s.state.lastError = qrErr?.message || 'Failed to generate QR image';
          }
        }

        if (connection === 'open') {
          const meId = sock.user?.id || '';
          const phoneDigits = extractPhoneDigitsFromJid(meId, sock.user?.lid);
          const displayPhone = phoneDigits ? `+${phoneDigits}` : meId;
          const displayName = sock.user?.name || sock.user?.verifiedName || 'That Laundry Shop';

          s.state = {
            status: 'connected',
            qrDataUrl: null,
            connectedPhone: displayPhone,
            connectedName: displayName,
            lastError: null,
            updatedAt: new Date().toISOString(),
          };
          console.log(`[WhatsApp QR Bridge] Connected as ${displayName} (${displayPhone})`);
        }

        if (connection === 'close') {
          const statusCode =
            (lastDisconnect?.error as any)?.output?.statusCode ||
            (lastDisconnect?.error as any)?.statusCode;
          const loggedOut = statusCode === (DisconnectReason?.loggedOut ?? 401);

          s.sock = null;
          if (loggedOut) {
            try {
              await fs.promises.rm(getAuthDir(), { recursive: true, force: true });
            } catch {}
            s.state = {
              status: 'disconnected',
              qrDataUrl: null,
              connectedPhone: null,
              connectedName: null,
              lastError: 'Session logged out from phone. Please scan QR again.',
              updatedAt: new Date().toISOString(),
            };
          } else {
            s.state = {
              ...s.state,
              status: 'connecting',
              qrDataUrl: null,
              updatedAt: new Date().toISOString(),
            };
            setTimeout(() => {
              startWhatsAppQrConnection(false).catch(() => {});
            }, 2500);
          }
        }
      });

      sock.ev.on('messages.upsert', async (event: any) => {
        try {
          if (event?.type !== 'notify' && event?.type !== 'append') return;
          const msgs: any[] = Array.isArray(event?.messages) ? event.messages : [];

          for (const m of msgs) {
            if (!m?.message || !m?.key) continue;
            const remoteJid = String(m.key.remoteJid || '');
            // Ignore group chats, status broadcasts, and newsletter channels
            if (
              !remoteJid ||
              remoteJid === 'status@broadcast' ||
              remoteJid.endsWith('@g.us') ||
              remoteJid.endsWith('@newsletter') ||
              remoteJid.endsWith('@broadcast')
            ) {
              continue;
            }

            const msgId = String(m.key.id || '');
            if (msgId && s.sentMessageIds.has(msgId)) {
              // Already recorded when sent from Omnichannel Live Chat Hub
              continue;
            }

            const phoneDigits = extractPhoneDigitsFromJid(remoteJid, m.key.remoteJidAlt);
            if (!phoneDigits || phoneDigits.length < 6) continue;

            const inner =
              m.message?.ephemeralMessage?.message ||
              m.message?.viewOnceMessage?.message ||
              m.message?.viewOnceMessageV2?.message ||
              m.message;

            const textBody = String(
              inner?.conversation ||
                inner?.extendedTextMessage?.text ||
                inner?.imageMessage?.caption ||
                inner?.videoMessage?.caption ||
                inner?.documentMessage?.caption ||
                ''
            ).trim();

            const attachments: SocialMessageAttachment[] = [];
            const imageUrls: string[] = [];

            if (inner?.imageMessage && typeof downloadMediaMessage === 'function') {
              try {
                const buffer = await downloadMediaMessage(
                  m,
                  'buffer',
                  {},
                  { logger, reuploadRequest: sock.updateMediaMessage }
                );
                if (buffer) {
                  const uploadDir = path.resolve(process.cwd(), 'storage', 'uploads', 'system', 'chat');
                  await fs.promises.mkdir(uploadDir, { recursive: true });
                  const safeId = (msgId || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
                  const filename = `wa-${safeId}.jpg`;
                  await fs.promises.writeFile(path.join(uploadDir, filename), Buffer.from(buffer));
                  const localUrl = `/uploads/system/chat/${filename}`;
                  imageUrls.push(localUrl);
                  attachments.push({
                    type: 'image',
                    url: localUrl,
                    name: 'WhatsApp Photo',
                  });
                }
              } catch (imgErr) {
                console.warn('[WhatsApp QR Bridge] Failed to download image:', imgErr);
              }
            }

            if (!textBody && attachments.length === 0) continue;

            const fromMe = Boolean(m.key.fromMe);
            const displayPhone = formatDisplayPhone(phoneDigits, '66');
            const pushName = !fromMe && m.pushName ? String(m.pushName).trim() : '';

            const {
              recordInboundSocialMessageAction,
              recordOutboundSocialMessageFromSystemAction,
            } = await import('@/actions/social-inbox');

            if (!fromMe) {
              await recordInboundSocialMessageAction({
                channel: 'whatsapp',
                externalContactId: phoneDigits,
                contactName: pushName || displayPhone,
                contactPhone: displayPhone,
                text: textBody || '📷 [Sent a photo via WhatsApp]',
                attachments: attachments.length > 0 ? attachments : undefined,
              });
            } else {
              // Sent by Admin from WhatsApp phone app or WhatsApp Web! Sync into Omnichannel Hub too!
              await recordOutboundSocialMessageFromSystemAction({
                channel: 'whatsapp',
                externalContactId: phoneDigits,
                contactPhone: displayPhone,
                text: textBody || '📷 [Sent a photo via WhatsApp]',
                imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
                senderName: 'Admin (WhatsApp App)',
                messageId: msgId ? `msg_wa_echo_${msgId}` : undefined,
              });
            }
          }
        } catch (err) {
          console.warn('[WhatsApp QR Bridge] messages.upsert handler error:', err);
        }
      });

      // Wait briefly up to 3.5s so if QR is generated immediately, the first call already returns it
      for (let i = 0; i < 14; i++) {
        if (s.state.status === 'qr_ready' || s.state.status === 'connected') {
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      return { ...s.state };
    } catch (err: any) {
      s.state = {
        status: 'disconnected',
        qrDataUrl: null,
        connectedPhone: null,
        connectedName: null,
        lastError: err?.message || 'Failed to start WhatsApp QR engine',
        updatedAt: new Date().toISOString(),
      };
      return { ...s.state };
    } finally {
      s.startingPromise = null;
    }
  })();

  return s.startingPromise;
}

export async function disconnectWhatsAppQrSession(clearFiles = true): Promise<WhatsAppQrState> {
  const s = getSingleton();
  if (s.sock) {
    try {
      await s.sock.logout?.();
    } catch {}
    try {
      s.sock.end?.(undefined);
    } catch {}
    s.sock = null;
  }
  if (clearFiles) {
    try {
      await fs.promises.rm(getAuthDir(), { recursive: true, force: true });
    } catch {}
  }
  s.state = {
    status: 'disconnected',
    qrDataUrl: null,
    connectedPhone: null,
    connectedName: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
  return { ...s.state };
}

export async function sendDirectWhatsAppQrMessage(params: {
  phone: string;
  countryCode?: string;
  text?: string;
  attachments?: SocialMessageAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const s = getSingleton();
  if (s.state.status !== 'connected' || !s.sock) {
    return { ok: false, error: 'WhatsApp QR session is not connected' };
  }

  try {
    const e164 = formatPhoneForWhatsApp(params.phone, params.countryCode || '66');
    if (!e164 || e164.length < 7) {
      return { ok: false, error: 'Invalid WhatsApp phone number' };
    }
    const jid = `${e164}@s.whatsapp.net`;
    const text = (params.text || '').trim();
    const imageAtts = (params.attachments || []).filter((a) => a.type === 'image' && a.url);

    if (imageAtts.length > 0) {
      for (let i = 0; i < imageAtts.length; i++) {
        const att = imageAtts[i];
        const urlStr = (att.url || '').trim();
        let imgBuffer: Buffer | null = null;

        if (urlStr.startsWith('/uploads/')) {
          const rel = urlStr.replace(/^\/+/, '');
          const candidates = [
            path.resolve(process.cwd(), 'storage', rel),
            path.resolve(process.cwd(), 'public', rel),
          ];
          const found = candidates.find((p) => fs.existsSync(p));
          if (found) {
            imgBuffer = await fs.promises.readFile(found);
          }
        } else if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
          const res = await fetch(urlStr);
          if (res.ok) {
            imgBuffer = Buffer.from(await res.arrayBuffer());
          }
        }

        if (imgBuffer) {
          const caption = i === 0 && text ? text : undefined;
          const sent = await s.sock.sendMessage(jid, {
            image: imgBuffer,
            ...(caption ? { caption } : {}),
          });
          if (sent?.key?.id) {
            s.sentMessageIds.add(String(sent.key.id));
          }
        }
      }
      return { ok: true };
    }

    if (text) {
      const sent = await s.sock.sendMessage(jid, { text });
      if (sent?.key?.id) {
        s.sentMessageIds.add(String(sent.key.id));
      }
      return { ok: true };
    }

    return { ok: false, error: 'Nothing to send' };
  } catch (err: any) {
    console.warn('[WhatsApp QR Bridge] Send error:', err);
    return { ok: false, error: err?.message || 'WhatsApp direct send failed' };
  }
}
