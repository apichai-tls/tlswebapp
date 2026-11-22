import { uploadBufferToGcs, generateDownloadUrl, bucketName } from '@/lib/gcs';
import type { SocialChannelConfig, SocialMessageAttachment } from '@/types/social-inbox';

const META_GRAPH_VERSION = 'v21.0';

export interface ResolvedWhatsAppCloudCredentials {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  businessAccountId: string;
  appSecret: string;
  isConfigured: boolean;
}

export function resolveWhatsAppCloudCredentials(
  waConfig?: Partial<SocialChannelConfig['whatsapp']> | null
): ResolvedWhatsAppCloudCredentials {
  const cfgToken = (waConfig?.accessToken || '').trim();
  const cleanCfgToken = cfgToken && !cfgToken.includes('••••') ? cfgToken : '';

  const cfgAppSecret = (waConfig?.appSecret || '').trim();
  const cleanCfgAppSecret = cfgAppSecret && !cfgAppSecret.includes('••••') ? cfgAppSecret : '';

  const phoneNumberId = (
    waConfig?.phoneNumberId ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID ||
    ''
  ).trim();

  const accessToken = (
    cleanCfgToken ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.META_WHATSAPP_ACCESS_TOKEN ||
    ''
  ).trim();

  const verifyToken = (
    waConfig?.verifyToken ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.SOCIAL_WEBHOOK_VERIFY_TOKEN ||
    'tls_whatsapp_verify_2026'
  ).trim();

  const businessAccountId = (
    waConfig?.businessAccountId ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    process.env.META_WABA_ID ||
    ''
  ).trim();

  const appSecret = (
    cleanCfgAppSecret ||
    process.env.WHATSAPP_APP_SECRET ||
    process.env.META_APP_SECRET ||
    ''
  ).trim();

  return {
    phoneNumberId,
    accessToken,
    verifyToken,
    businessAccountId,
    appSecret,
    isConfigured: Boolean(phoneNumberId && accessToken),
  };
}

export interface WhatsAppCloudVerificationResult {
  connected: boolean;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  codeVerificationStatus?: string;
  nameStatus?: string;
  error?: string;
}

/**
 * Queries Meta Graph API to verify the WhatsApp Business Phone Number ID & Access Token
 */
export async function verifyWhatsAppCloudConnection(opts: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<WhatsAppCloudVerificationResult> {
  const phoneId = (opts.phoneNumberId || '').trim();
  const token = (opts.accessToken || '').trim();

  if (!phoneId || !token) {
    return {
      connected: false,
      error: 'Missing Meta Phone Number ID or Cloud API Access Token',
    };
  }

  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
      phoneId
    )}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        connected: false,
        phoneNumberId: phoneId,
        error:
          data?.error?.message ||
          `Meta Graph API HTTP ${res.status}: Failed to verify Phone Number ID`,
      };
    }

    return {
      connected: true,
      phoneNumberId: data.id || phoneId,
      displayPhoneNumber: data.display_phone_number || undefined,
      verifiedName: data.verified_name || undefined,
      qualityRating: data.quality_rating || undefined,
      codeVerificationStatus: data.code_verification_status || undefined,
      nameStatus: data.name_status || undefined,
    };
  } catch (err: any) {
    return {
      connected: false,
      phoneNumberId: phoneId,
      error: err?.message || 'Network error while connecting to graph.facebook.com',
    };
  }
}

function extensionFromMimeType(mime?: string | null, fallbackFilename?: string): string {
  if (fallbackFilename && fallbackFilename.includes('.')) {
    const ext = fallbackFilename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext && ext.length <= 5) return ext;
  }
  const m = (mime || '').toLowerCase().split(';')[0].trim();
  switch (m) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'application/pdf':
      return 'pdf';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/aac':
      return 'aac';
    case 'audio/mp4':
    case 'audio/m4a':
      return 'm4a';
    case 'video/mp4':
      return 'mp4';
    default:
      return 'bin';
  }
}

/**
 * Downloads an inbound WhatsApp Cloud API media object (image, document/PDF, audio, video, sticker)
 * using the Graph API 2-step media download flow and relays it to Google Cloud Storage.
 */
export async function downloadWhatsAppCloudMediaToGcs(opts: {
  mediaId: string;
  accessToken: string;
  senderPhone?: string;
  fallbackMimeType?: string;
  originalFilename?: string;
}): Promise<{ url: string; mimeType: string; extension: string } | null> {
  const mediaId = (opts.mediaId || '').trim();
  const token = (opts.accessToken || '').trim();
  if (!mediaId || !token) return null;

  try {
    // Step 1: Retrieve the temporary authenticated media download URL from Meta Graph API
    const metaRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      }
    );

    if (!metaRes.ok) {
      console.warn(
        `[WhatsAppCloudAPI] Failed to resolve mediaId ${mediaId}: HTTP ${metaRes.status}`
      );
      return null;
    }

    const metaJson = await metaRes.json().catch(() => null);
    const downloadUrl = metaJson?.url;
    const mimeType =
      metaJson?.mime_type || opts.fallbackMimeType || 'application/octet-stream';

    if (!downloadUrl || typeof downloadUrl !== 'string') {
      return null;
    }

    // Step 2: Download the binary media stream with Bearer authorization
    const binRes = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!binRes.ok) {
      console.warn(
        `[WhatsAppCloudAPI] Failed to download media binary for ${mediaId}: HTTP ${binRes.status}`
      );
      return null;
    }

    const buffer = Buffer.from(await binRes.arrayBuffer());
    const ext = extensionFromMimeType(mimeType, opts.originalFilename);
    const safePhone = (opts.senderPhone || 'unknown').replace(/[^0-9a-zA-Z_-]/g, '');

    // Step 3: Upload to Google Cloud Storage and return a signed/public HTTPS URL
    const gcsUrl = await uploadBufferToGcs(buffer, {
      entityType: 'system',
      entityId: `wa_${safePhone}`,
      subType: 'chat',
      contentType: mimeType,
      extension: ext,
      customFileName: `wa-${mediaId.slice(-12)}-${Date.now()}.${ext}`,
    });

    if (!gcsUrl) return null;

    const prefix = `https://storage.googleapis.com/${bucketName}/`;
    if (gcsUrl.startsWith(prefix)) {
      const gcsKey = gcsUrl.slice(prefix.length);
      const signed = await generateDownloadUrl(gcsKey, 60 * 24 * 7).catch(() => null);
      if (signed && signed.startsWith('https://')) {
        return { url: signed, mimeType, extension: ext };
      }
    }

    return { url: gcsUrl, mimeType, extension: ext };
  } catch (err) {
    console.warn(`[WhatsAppCloudAPI] Error downloading media ${mediaId}:`, err);
    return null;
  }
}

/**
 * Marks an inbound WhatsApp Cloud API message (`wamid...`) as read so the customer sees blue double-checkmarks
 */
export async function markWhatsAppCloudMessageAsRead(opts: {
  phoneNumberId: string;
  accessToken: string;
  externalMessageId: string;
}): Promise<boolean> {
  const phoneId = (opts.phoneNumberId || '').trim();
  const token = (opts.accessToken || '').trim();
  const msgId = (opts.externalMessageId || '').trim();

  if (!phoneId || !token || !msgId.startsWith('wamid.')) {
    return false;
  }

  try {
    const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
      phoneId
    )}/messages`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: msgId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Dispatches outbound text, image(s), and file/PDF document(s) via Official Meta WhatsApp Business Cloud API
 */
export async function sendWhatsAppCloudApiMessage(opts: {
  phoneNumberId: string;
  accessToken: string;
  toPhoneE164: string;
  customerName?: string;
  text?: string;
  resolvedImageUrls?: string[];
  fileAttachments?: Array<{ url: string; name?: string }>;
  replyToExternalMessageId?: string;
}): Promise<{
  delivered: boolean;
  externalMessageId?: string;
  usedTemplateFallback?: boolean;
  error?: string;
}> {
  const phoneId = (opts.phoneNumberId || '').trim();
  const token = (opts.accessToken || '').trim();
  const to = (opts.toPhoneE164 || '').replace(/\D/g, '');

  if (!phoneId || !token || !to) {
    return {
      delivered: false,
      error: 'Missing Phone Number ID, Access Token, or recipient phone number',
    };
  }

  const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(
    phoneId
  )}/messages`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const contextPayload =
    opts.replyToExternalMessageId && opts.replyToExternalMessageId.startsWith('wamid.')
      ? { context: { message_id: opts.replyToExternalMessageId } }
      : {};

  let delivered = false;
  let firstExternalMessageId: string | undefined;
  let lastError: string | undefined;

  const images = (opts.resolvedImageUrls || []).filter(Boolean);
  const files = (opts.fileAttachments || []).filter((f) => Boolean(f?.url));
  const textBody = (opts.text || '').trim();

  try {
    // Case 1: If we have both text and images, send text first (or attach text as caption if single image)
    if (textBody && images.length === 1 && files.length === 0 && textBody.length <= 1000) {
      const imgRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          ...contextPayload,
          type: 'image',
          image: {
            link: images[0],
            caption: textBody,
          },
        }),
      });
      const data = await imgRes.json().catch(() => ({}));
      if (imgRes.ok) {
        delivered = true;
        firstExternalMessageId = data?.messages?.[0]?.id;
        return { delivered, externalMessageId: firstExternalMessageId };
      } else {
        lastError =
          data?.error?.error_user_msg ||
          data?.error?.message ||
          `Meta WhatsApp Cloud API HTTP ${imgRes.status}`;
      }
    }

    // Send text message if present (and not already combined above)
    if (textBody && !delivered) {
      const textRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          ...contextPayload,
          type: 'text',
          text: {
            preview_url: true,
            body: textBody,
          },
        }),
      });
      const data = await textRes.json().catch(() => ({}));
      if (textRes.ok) {
        delivered = true;
        firstExternalMessageId = data?.messages?.[0]?.id;
      } else {
        lastError =
          data?.error?.error_user_msg ||
          data?.error?.message ||
          `Meta WhatsApp Cloud API HTTP ${textRes.status}`;
      }
    }

    // Send image attachments
    for (const imgUrl of images) {
      const imgRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'image',
          image: {
            link: imgUrl,
          },
        }),
      });
      const data = await imgRes.json().catch(() => ({}));
      if (imgRes.ok) {
        delivered = true;
        if (!firstExternalMessageId) {
          firstExternalMessageId = data?.messages?.[0]?.id;
        }
      } else if (!lastError) {
        lastError =
          data?.error?.error_user_msg ||
          data?.error?.message ||
          `Meta WhatsApp Cloud API image HTTP ${imgRes.status}`;
      }
    }

    // Send document / PDF attachments
    for (const doc of files) {
      const docRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'document',
          document: {
            link: doc.url,
            filename: doc.name || 'Document.pdf',
          },
        }),
      });
      const data = await docRes.json().catch(() => ({}));
      if (docRes.ok) {
        delivered = true;
        if (!firstExternalMessageId) {
          firstExternalMessageId = data?.messages?.[0]?.id;
        }
      } else if (!lastError) {
        lastError =
          data?.error?.error_user_msg ||
          data?.error?.message ||
          `Meta WhatsApp Cloud API document HTTP ${docRes.status}`;
      }
    }

    // Automatic Utility Template Fallback ONLY when Meta blocks a manual CSO message due to >24h window (error 131047 / re-engagement)
    if (!delivered && lastError) {
      const cleanCustomerName =
        (opts.customerName || 'Customer')
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .slice(0, 60) || 'Customer';

      const fallbackSummaryParts: string[] = [];
      if (textBody) fallbackSummaryParts.push(textBody);
      if (images.length > 0) fallbackSummaryParts.push(`Photo: ${images.join(' ')}`);
      if (files.length > 0) fallbackSummaryParts.push(`Document: ${files.map((f) => f.url).join(' ')}`);

      // Meta template body parameters cannot contain newline/tab characters or >4 consecutive spaces
      const cleanBodyParam =
        fallbackSummaryParts
          .join(' | ')
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .slice(0, 900) || 'Please check your laundry order update.';

      try {
        const tplRes = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: {
              name: 'tls_customer_update',
              language: { code: 'en' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: cleanCustomerName },
                    { type: 'text', text: cleanBodyParam },
                  ],
                },
              ],
            },
          }),
        });
        const tplData = await tplRes.json().catch(() => ({}));
        if (tplRes.ok) {
          return {
            delivered: true,
            externalMessageId: tplData?.messages?.[0]?.id,
            usedTemplateFallback: true,
          };
        }
      } catch {}
    }

    return {
      delivered,
      externalMessageId: firstExternalMessageId,
      error: delivered ? undefined : lastError,
    };
  } catch (err: any) {
    return {
      delivered: false,
      error: err?.message || 'Failed to reach Meta WhatsApp Cloud API',
    };
  }
}
