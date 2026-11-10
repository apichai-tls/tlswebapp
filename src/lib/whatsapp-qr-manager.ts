import fs from 'fs';
import os from 'os';
import path from 'path';
import QRCode from 'qrcode';
import pino from 'pino';
import { prisma } from '@/lib/prisma';
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
  replacedByAnotherInstance: boolean;
  resolvedAuthDir: string | null;
  backupTimer: ReturnType<typeof setTimeout> | null;
  cachedWaVersion: [number, number, number] | null;
  cachedCredsMeta: {
    hasCreds: boolean;
    connectedPhone: string | null;
    connectedName: string | null;
    checkedAt: number;
  } | null;
}

const DB_AUTH_BACKUP_KEY = 'whatsapp_baileys_auth_backup';

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
      replacedByAnotherInstance: false,
      resolvedAuthDir: null,
      backupTimer: null,
      cachedWaVersion: null,
      cachedCredsMeta: null,
    };
  }
  return globalForWa.__tlsWhatsAppQrSingleton;
}

/**
 * Resolves a writable directory for Baileys multi-file auth state.
 * Tries `<cwd>/storage/whatsapp-auth` first; if the container filesystem
 * denies mkdir (e.g. EACCES in Docker/Cloud Run), falls back to `/tmp/tls-whatsapp-auth`.
 */
async function resolveWritableAuthDir(): Promise<string> {
  const s = getSingleton();
  if (s.resolvedAuthDir) {
    try {
      await fs.promises.mkdir(s.resolvedAuthDir, { recursive: true });
      return s.resolvedAuthDir;
    } catch {
      s.resolvedAuthDir = null;
    }
  }

  const primaryDir = path.resolve(process.cwd(), 'storage', 'whatsapp-auth');
  try {
    await fs.promises.mkdir(primaryDir, { recursive: true });
    s.resolvedAuthDir = primaryDir;
    return primaryDir;
  } catch {
    const tmpFallbackDir = path.join(os.tmpdir(), 'tls-whatsapp-auth');
    await fs.promises.mkdir(tmpFallbackDir, { recursive: true });
    s.resolvedAuthDir = tmpFallbackDir;
    return tmpFallbackDir;
  }
}

async function restoreAuthDirFromDbIfNeeded(authDir: string, forceFromDb = false): Promise<boolean> {
  try {
    const credsPath = path.join(authDir, 'creds.json');
    if (!forceFromDb && fs.existsSync(credsPath)) {
      return true;
    }
    const row = await prisma.setting.findUnique({ where: { key: DB_AUTH_BACKUP_KEY } });
    if (!row?.value) return fs.existsSync(credsPath);

    const filesMap = JSON.parse(row.value) as Record<string, string>;
    if (!filesMap || typeof filesMap !== 'object' || !filesMap['creds.json']) {
      return fs.existsSync(credsPath);
    }

    await fs.promises.mkdir(authDir, { recursive: true });
    for (const [fileName, fileContent] of Object.entries(filesMap)) {
      if (!fileName.endsWith('.json') || fileName.includes('/') || fileName.includes('\\')) continue;
      await fs.promises.writeFile(path.join(authDir, fileName), fileContent, 'utf8');
    }
    return fs.existsSync(credsPath);
  } catch (err) {
    console.warn('[WhatsApp QR Bridge] Failed to restore auth from DB:', err);
    return false;
  }
}

function scheduleBackupAuthDirToDb(authDir: string, delayMs = 45000): void {
  const s = getSingleton();
  if (s.backupTimer) {
    if (delayMs > 5000) {
      // Already scheduled; don't reset or spam DB writes on every message ratchet update
      return;
    }
    clearTimeout(s.backupTimer);
  }
  s.backupTimer = setTimeout(async () => {
    s.backupTimer = null;
    try {
      if (!fs.existsSync(path.join(authDir, 'creds.json'))) return;
      const entries = await fs.promises.readdir(authDir);
      const filesMap: Record<string, string> = {};
      for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        // Persist creds.json and essential app-state/pre-key files
        if (name === 'creds.json' || name.startsWith('app-state-sync-') || name.startsWith('session-')) {
          const content = await fs.promises.readFile(path.join(authDir, name), 'utf8');
          filesMap[name] = content;
        }
      }
      if (filesMap['creds.json']) {
        await prisma.setting.upsert({
          where: { key: DB_AUTH_BACKUP_KEY },
          update: { value: JSON.stringify(filesMap) },
          create: { key: DB_AUTH_BACKUP_KEY, value: JSON.stringify(filesMap) },
        });
      }
    } catch (err) {
      console.warn('[WhatsApp QR Bridge] Failed to backup auth to DB:', err);
    }
  }, delayMs);
}

async function clearAuthFromDiskAndDb(): Promise<void> {
  const s = getSingleton();
  s.cachedCredsMeta = null;
  const candidates = [
    s.resolvedAuthDir,
    path.resolve(process.cwd(), 'storage', 'whatsapp-auth'),
    path.join(os.tmpdir(), 'tls-whatsapp-auth'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
    } catch {}
  }

  try {
    await prisma.setting.deleteMany({ where: { key: DB_AUTH_BACKUP_KEY } });
  } catch {}
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
  // Auto-resume saved session on server boot if creds exist on disk or in DB
  if (!s.autoStartChecked) {
    s.autoStartChecked = true;
    if (s.state.status === 'disconnected' && !s.replacedByAnotherInstance) {
      (async () => {
        try {
          const authDir = await resolveWritableAuthDir();
          const hasCreds = await restoreAuthDirFromDbIfNeeded(authDir);
          if (hasCreds && s.state.status === 'disconnected' && !s.replacedByAnotherInstance) {
            await startWhatsAppQrConnection(false);
          }
        } catch {}
      })();
    }
  }
  return { ...s.state };
}

async function readSavedCredsMetadata(): Promise<{
  hasCreds: boolean;
  connectedPhone: string | null;
  connectedName: string | null;
}> {
  const s = getSingleton();
  if (s.cachedCredsMeta && Date.now() - s.cachedCredsMeta.checkedAt < 300_000) {
    return s.cachedCredsMeta;
  }
  try {
    const authDir = await resolveWritableAuthDir();
    await restoreAuthDirFromDbIfNeeded(authDir, false);
    const credsPath = path.join(authDir, 'creds.json');
    if (!fs.existsSync(credsPath)) {
      s.cachedCredsMeta = {
        hasCreds: false,
        connectedPhone: null,
        connectedName: null,
        checkedAt: Date.now(),
      };
      return s.cachedCredsMeta;
    }
    const raw = await fs.promises.readFile(credsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const meId = parsed?.me?.id || '';
    const meLid = parsed?.me?.lid || '';
    if (!meId && !parsed?.registered) {
      s.cachedCredsMeta = {
        hasCreds: false,
        connectedPhone: null,
        connectedName: null,
        checkedAt: Date.now(),
      };
      return s.cachedCredsMeta;
    }
    const phoneDigits = extractPhoneDigitsFromJid(meId, meLid);
    const connectedPhone = phoneDigits ? `+${phoneDigits}` : meId || null;
    const connectedName = parsed?.me?.name || parsed?.me?.verifiedName || 'That Laundry Shop';
    s.cachedCredsMeta = {
      hasCreds: true,
      connectedPhone,
      connectedName,
      checkedAt: Date.now(),
    };
    return s.cachedCredsMeta;
  } catch {
    return { hasCreds: false, connectedPhone: null, connectedName: null };
  }
}

export async function getWhatsAppQrStatusAsync(allowAutoStart = false): Promise<WhatsAppQrState> {
  const s = getSingleton();
  if (s.state.status === 'connected' && s.sock) {
    return { ...s.state };
  }
  if (s.state.status === 'qr_ready' && s.state.qrDataUrl) {
    return { ...s.state };
  }

  const meta = await readSavedCredsMetadata();
  if (meta.hasCreds) {
    if (
      allowAutoStart &&
      !s.autoStartChecked &&
      !s.replacedByAnotherInstance &&
      s.state.status === 'disconnected' &&
      !s.startingPromise
    ) {
      s.autoStartChecked = true;
      startWhatsAppQrConnection(false).catch(() => {});
    }
    return {
      status: 'connected',
      qrDataUrl: null,
      connectedPhone: s.state.connectedPhone || meta.connectedPhone,
      connectedName: s.state.connectedName || meta.connectedName || 'That Laundry Shop',
      lastError: null,
      updatedAt: s.state.updatedAt || new Date().toISOString(),
    };
  }

  return { ...s.state };
}

export async function startWhatsAppQrConnection(
  resetAuth = false,
  forceRefreshFromDb = false
): Promise<WhatsAppQrState> {
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

      const authDir = await resolveWritableAuthDir();
      if (!resetAuth) {
        await restoreAuthDirFromDbIfNeeded(authDir, forceRefreshFromDb);
      }

      const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);

      let version: [number, number, number] | undefined = s.cachedWaVersion || undefined;
      if (!version && typeof fetchLatestBaileysVersion === 'function') {
        try {
          const vRes = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise<null>((r) => setTimeout(() => r(null), 1200)),
          ]);
          if (vRes?.version) {
            version = vRes.version;
            s.cachedWaVersion = vRes.version;
          }
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

      sock.ev.on('creds.update', async () => {
        await saveCreds();
        scheduleBackupAuthDirToDb(authDir);
      });

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

          s.replacedByAnotherInstance = false;
          s.cachedCredsMeta = {
            hasCreds: true,
            connectedPhone: displayPhone,
            connectedName: displayName,
            checkedAt: Date.now(),
          };
          s.state = {
            status: 'connected',
            qrDataUrl: null,
            connectedPhone: displayPhone,
            connectedName: displayName,
            lastError: null,
            updatedAt: new Date().toISOString(),
          };
          scheduleBackupAuthDirToDb(authDir, 2000);
          console.log(`[WhatsApp QR Bridge] Connected as ${displayName} (${displayPhone})`);
        }

        if (connection === 'close') {
          const statusCode =
            (lastDisconnect?.error as any)?.output?.statusCode ||
            (lastDisconnect?.error as any)?.statusCode;
          const loggedOut = statusCode === (DisconnectReason?.loggedOut ?? 401);
          const connectionReplaced = statusCode === (DisconnectReason?.connectionReplaced ?? 440);

          s.sock = null;
          if (loggedOut) {
            s.replacedByAnotherInstance = false;
            await clearAuthFromDiskAndDb();
            s.state = {
              status: 'disconnected',
              qrDataUrl: null,
              connectedPhone: null,
              connectedName: null,
              lastError: 'Session logged out from phone. Please scan QR again.',
              updatedAt: new Date().toISOString(),
            };
          } else if (connectionReplaced) {
            // Another Cloud Run instance took over the WhatsApp socket — do NOT ping-pong in a 2.5s loop!
            // Keep status as 'connected' and only reconnect on-demand if this instance must send an outbound message.
            s.replacedByAnotherInstance = true;
            s.state = {
              ...s.state,
              status: 'connected',
              qrDataUrl: null,
              lastError: null,
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
              if (!s.replacedByAnotherInstance) {
                startWhatsAppQrConnection(false).catch(() => {});
              }
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
                  let imageUrl: string | null = null;
                  try {
                    const uploadDir = path.resolve(process.cwd(), 'storage', 'uploads', 'system', 'chat');
                    await fs.promises.mkdir(uploadDir, { recursive: true });
                    const safeId = (msgId || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
                    const filename = `wa-${safeId}.jpg`;
                    await fs.promises.writeFile(path.join(uploadDir, filename), Buffer.from(buffer));
                    imageUrl = `/uploads/system/chat/${filename}`;
                  } catch {
                    // Fallback to inline base64 data URL if container storage is read-only
                    const mime = inner.imageMessage.mimetype || 'image/jpeg';
                    imageUrl = `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
                  }
                  if (imageUrl) {
                    imageUrls.push(imageUrl);
                    attachments.push({
                      type: 'image',
                      url: imageUrl,
                      name: 'WhatsApp Photo',
                    });
                  }
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
    await clearAuthFromDiskAndDb();
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

async function ensureWhatsAppQrReadyForSend(timeoutMs = 12000): Promise<boolean> {
  const s = getSingleton();
  if (s.state.status === 'connected' && s.sock) {
    return true;
  }

  const meta = await readSavedCredsMetadata();
  if (!meta.hasCreds && s.state.status !== 'connecting') {
    return false;
  }

  const wasReplaced = s.replacedByAnotherInstance;
  s.replacedByAnotherInstance = false;
  if (!s.startingPromise && (!s.sock || s.state.status !== 'connected')) {
    startWhatsAppQrConnection(false, wasReplaced).catch(() => {});
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (s.state.status === 'connected' && s.sock) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  return Boolean(s.state.status === 'connected' && s.sock);
}

export async function sendDirectWhatsAppQrMessage(params: {
  phone: string;
  countryCode?: string;
  text?: string;
  attachments?: SocialMessageAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const s = getSingleton();
  const ready = await ensureWhatsAppQrReadyForSend(12000);
  if (!ready || !s.sock) {
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

        if (urlStr.startsWith('data:image/')) {
          const commaIdx = urlStr.indexOf(',');
          if (commaIdx > -1) {
            imgBuffer = Buffer.from(urlStr.slice(commaIdx + 1), 'base64');
          }
        } else if (urlStr.startsWith('/uploads/')) {
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
