import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me/v2/bot";
const LINE_OAUTH_URL = "https://api.line.me/v2/oauth/accessToken";

export interface LineBotInfo {
  userId: string;
  basicId?: string;
  premiumId?: string;
  displayName: string;
  pictureUrl?: string;
  chatMode: "chat" | "bot";
  markAsReadMode: "auto" | "manual";
}

export interface LineUserProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  language?: string;
}

export interface LineContactRecord {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  lastInteractionAt: string;
  lastMessageText?: string;
  linkedCustomerId?: string | null;
  linkedCustomerName?: string | null;
  linkedCustomerPhone?: string | null;
}

export type LineMessageObject =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      originalContentUrl: string;
      previewImageUrl: string;
    };

let cachedOAuthToken: { token: string; expiresAt: number } | null = null;

/**
 * Generates a fresh Channel Access Token from Channel ID + Channel Secret
 * (used for ThatLaundryShop Channel 1657371072 so it never expires)
 */
export async function issueLineChannelAccessTokenFromCredentials(
  channelId: string,
  channelSecret: string
): Promise<string> {
  if (cachedOAuthToken && Date.now() < cachedOAuthToken.expiresAt - 60_000) {
    return cachedOAuthToken.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: channelId.trim(),
    client_secret: channelSecret.trim(),
  });

  const res = await fetch(LINE_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LINE OAuth Error (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const token = String(data.access_token || "");
  const expiresInSec = Number(data.expires_in) || 2592000;
  cachedOAuthToken = {
    token,
    expiresAt: Date.now() + expiresInSec * 1000,
  };
  return token;
}

export async function fetchLineFollowerIdsPage(
  channelAccessToken: string,
  startCursor?: string,
  limit = 300
): Promise<{ userIds: string[]; next?: string }> {
  const token = channelAccessToken.trim();
  const params = new URLSearchParams({ limit: String(limit) });
  if (startCursor) params.set("start", startCursor);

  const res = await fetch(`${LINE_API_BASE}/followers/ids?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LINE Followers API (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  return {
    userIds: Array.isArray(data.userIds) ? data.userIds : [],
    next: data.next || undefined,
  };
}

export function isValidLineUserId(val?: string | null): boolean {
  if (!val) return false;
  return /^U[0-9a-f]{32}$/i.test(val.trim());
}

export function verifyLineWebhookSignature(
  rawBody: string,
  signature: string | null,
  channelSecret?: string | null
): boolean {
  if (!channelSecret || !channelSecret.trim()) {
    return true;
  }
  if (!signature) return false;
  const hash = crypto
    .createHmac("SHA256", channelSecret.trim())
    .update(rawBody)
    .digest("base64");
  return hash === signature.trim();
}

export async function getLineBotInfo(channelAccessToken: string): Promise<LineBotInfo> {
  const token = channelAccessToken.trim();
  if (!token) {
    throw new Error("LINE Channel Access Token is required.");
  }
  const res = await fetch(`${LINE_API_BASE}/info`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LINE API Error (${res.status}): ${errText || res.statusText}`);
  }
  return res.json();
}

export async function getLineUserProfile(
  channelAccessToken: string,
  userId: string
): Promise<LineUserProfile | null> {
  const token = channelAccessToken.trim();
  if (!token || !userId) return null;
  try {
    const res = await fetch(`${LINE_API_BASE}/profile/${encodeURIComponent(userId.trim())}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function sendLinePushMessage(
  channelAccessToken: string,
  to: string,
  messages: LineMessageObject[]
): Promise<{ ok: boolean; error?: string }> {
  const token = channelAccessToken.trim();
  const recipient = to.trim();
  if (!token) {
    return { ok: false, error: "LINE Channel Access Token is not configured." };
  }
  if (!isValidLineUserId(recipient)) {
    return {
      ok: false,
      error: `Invalid LINE User ID "${recipient}". Must be a 33-character ID starting with 'U'.`,
    };
  }
  if (!messages.length) {
    return { ok: false, error: "No messages to send." };
  }

  const batch = messages.slice(0, 5);
  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: recipient,
      messages: batch,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return {
      ok: false,
      error: `LINE Push Failed (${res.status}): ${errBody || res.statusText}`,
    };
  }

  return { ok: true };
}

export async function sendLineReplyMessage(
  channelAccessToken: string,
  replyToken: string,
  messages: LineMessageObject[]
): Promise<{ ok: boolean; error?: string }> {
  const token = channelAccessToken.trim();
  if (!token || !replyToken) {
    return { ok: false, error: "Missing token or replyToken" };
  }
  const res = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: messages.slice(0, 5),
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return { ok: false, error: `LINE Reply Failed (${res.status}): ${errBody}` };
  }
  return { ok: true };
}
