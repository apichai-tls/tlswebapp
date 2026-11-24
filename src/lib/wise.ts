/**
 * Wise (TransferWise) Business API Client
 */

export interface WiseProfile {
  id: number;
  type: "PERSONAL" | "BUSINESS" | string;
  fullName?: string;
  businessName?: string;
  email?: string;
  registrationNumber?: string;
}

export interface WiseBalanceAmount {
  value: number;
  currency: string;
}

export interface WiseBalanceItem {
  id: number;
  currency: string;
  amount: WiseBalanceAmount;
  cashAmount: WiseBalanceAmount;
  reservedAmount: WiseBalanceAmount;
  totalWorth: WiseBalanceAmount;
  type: string;
}

export interface WiseActivityItem {
  id: string;
  type: string;
  senderName: string;
  amount: number;
  currency: string;
  rawAmount: string;
  status: string;
  createdOn: string;
  updatedOn?: string;
  resourceId?: string;
  isIncoming: boolean;
  reference?: string;
  sourceCurrency?: string;
  sourceValue?: number;
  rate?: number;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").trim();
}

function parseWiseAmount(raw: string): { amount: number; currency: string; isIncoming: boolean } {
  if (!raw) return { amount: 0, currency: "THB", isIncoming: false };
  const isIncoming = raw.includes("<positive>") || raw.includes("+");
  const clean = stripHtml(raw).replace("+", "").replace("-", "").trim();
  // e.g. "651 THB" or "1,014 THB"
  const parts = clean.split(" ");
  if (parts.length >= 2) {
    const num = parseFloat(parts[0].replace(/,/g, "")) || 0;
    const cur = parts[1].trim().toUpperCase();
    return { amount: num, currency: cur, isIncoming };
  }
  const num = parseFloat(clean.replace(/,/g, "")) || 0;
  return { amount: num, currency: "THB", isIncoming };
}

/**
 * Fetch all available profiles for this API token
 */
export async function fetchWiseProfiles(token: string): Promise<WiseProfile[]> {
  const res = await fetch("https://api.wise.com/v2/profiles", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "ThatLaundryShop/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Wise API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((p: any) => ({
    id: p.id,
    type: p.type || (p.businessName ? "BUSINESS" : "PERSONAL"),
    fullName: p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
    businessName: p.businessName || p.fullName || "",
    email: p.email || p.contactDetails?.email,
    registrationNumber: p.registrationNumber,
  }));
}

/**
 * Fetch standard balances for a given profile
 */
export async function fetchWiseBalances(token: string, profileId: string | number): Promise<WiseBalanceItem[]> {
  const res = await fetch(`https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "ThatLaundryShop/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch Wise balances (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data;
}

export interface WiseTransferDetail {
  reference?: string;
  sourceCurrency?: string;
  sourceValue?: number;
  targetCurrency?: string;
  targetValue?: number;
  rate?: number;
}

interface WiseApiCacheState {
  activitiesCache: Map<string, { items: WiseActivityItem[]; limit: number; fetchedAt: number }>;
  activitiesInFlight: Map<string, { limit: number; promise: Promise<WiseActivityItem[]> }>;
  transferDetailCache: Map<string, { detail: WiseTransferDetail | null; expiresAt: number }>;
  transferDetailInFlight: Map<string, Promise<WiseTransferDetail | null>>;
  rateLimitedUntil: number;
  consecutive429Count: number;
}

const ACTIVITIES_CACHE_TTL_MS = 20_000; // 20s shared server cache across all clients/tabs
const ACTIVITIES_FORCE_MIN_INTERVAL_MS = 6_000; // 6s floor even on manual clicks
const TRANSFER_DETAIL_TTL_MS = 24 * 60 * 60 * 1000; // 24h cache for immutable transfer details
const TRANSFER_DETAIL_MISS_TTL_MS = 5 * 60 * 1000; // 5m cache for missing/non-429 detail lookups
const TRANSFER_DETAIL_MAX_ENTRIES = 500;
const BASE_429_COOLDOWN_MS = 60_000; // 60s -> 120s -> 240s -> max 300s
const MAX_429_COOLDOWN_MS = 300_000;

const globalForWise = globalThis as typeof globalThis & {
  __tlsWiseApiState?: WiseApiCacheState;
};

function getWiseApiState(): WiseApiCacheState {
  if (!globalForWise.__tlsWiseApiState) {
    globalForWise.__tlsWiseApiState = {
      activitiesCache: new Map(),
      activitiesInFlight: new Map(),
      transferDetailCache: new Map(),
      transferDetailInFlight: new Map(),
      rateLimitedUntil: 0,
      consecutive429Count: 0,
    };
  }
  return globalForWise.__tlsWiseApiState;
}

function recordWiseRateLimit(res?: Response): number {
  const state = getWiseApiState();
  const retryAfterRaw = res?.headers?.get("retry-after");
  let retryAfterMs = 0;
  if (retryAfterRaw) {
    const parsedSec = Number(retryAfterRaw);
    if (Number.isFinite(parsedSec) && parsedSec > 0) {
      retryAfterMs = parsedSec * 1000;
    } else {
      const parsedDate = Date.parse(retryAfterRaw);
      if (!Number.isNaN(parsedDate) && parsedDate > Date.now()) {
        retryAfterMs = parsedDate - Date.now();
      }
    }
  }

  const backoffMs = Math.min(
    MAX_429_COOLDOWN_MS,
    BASE_429_COOLDOWN_MS * Math.pow(2, state.consecutive429Count)
  );
  const cooldownMs = Math.min(MAX_429_COOLDOWN_MS, Math.max(backoffMs, retryAfterMs));
  state.consecutive429Count = Math.min(state.consecutive429Count + 1, 5);
  state.rateLimitedUntil = Date.now() + cooldownMs;
  return Math.max(1, Math.ceil(cooldownMs / 1000));
}

export function getWiseRateLimitRemainingSeconds(): number {
  const state = getWiseApiState();
  if (state.rateLimitedUntil <= Date.now()) return 0;
  return Math.max(1, Math.ceil((state.rateLimitedUntil - Date.now()) / 1000));
}

/**
 * Fetch transfer detail (reference, sourceCurrency, sourceValue, rate) for a specific transfer ID.
 * Cached in-memory by transferId to avoid repeating the same lookup on every poll.
 */
export async function fetchWiseTransferDetail(
  token: string,
  transferId: string | number
): Promise<WiseTransferDetail | null> {
  const state = getWiseApiState();
  const key = String(transferId);
  const now = Date.now();

  const cached = state.transferDetailCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.detail;
  }

  // Never hit Wise while in 429 cooldown
  if (state.rateLimitedUntil > now) {
    return cached?.detail ?? null;
  }

  const inFlight = state.transferDetailInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async (): Promise<WiseTransferDetail | null> => {
    try {
      const res = await fetch(`https://api.wise.com/v1/transfers/${transferId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "ThatLaundryShop/1.0",
        },
        cache: "no-store",
      });

      if (res.status === 429) {
        recordWiseRateLimit(res);
        return null;
      }

      if (!res.ok) {
        state.transferDetailCache.set(key, {
          detail: null,
          expiresAt: Date.now() + TRANSFER_DETAIL_MISS_TTL_MS,
        });
        return null;
      }

      const data = await res.json();
      const detail: WiseTransferDetail = {
        reference: (data?.details?.reference || data?.reference || "").trim() || undefined,
        sourceCurrency: data?.sourceCurrency || undefined,
        sourceValue: typeof data?.sourceValue === "number" ? data.sourceValue : undefined,
        targetCurrency: data?.targetCurrency || undefined,
        targetValue: typeof data?.targetValue === "number" ? data.targetValue : undefined,
        rate: typeof data?.rate === "number" ? data.rate : undefined,
      };

      if (state.transferDetailCache.size >= TRANSFER_DETAIL_MAX_ENTRIES) {
        const oldestKey = state.transferDetailCache.keys().next().value;
        if (oldestKey) state.transferDetailCache.delete(oldestKey);
      }
      state.transferDetailCache.set(key, {
        detail,
        expiresAt: Date.now() + TRANSFER_DETAIL_TTL_MS,
      });
      return detail;
    } catch {
      return null;
    } finally {
      state.transferDetailInFlight.delete(key);
    }
  })();

  state.transferDetailInFlight.set(key, promise);
  return promise;
}

/**
 * Fetch recent activities (incoming transfers and transactions)
 * Protected by server-side TTL cache, in-flight deduplication, and 429 circuit-breaker cooldown.
 */
export async function fetchWiseActivities(
  token: string,
  profileId: string | number,
  limit: number = 20,
  options?: { forceRefresh?: boolean }
): Promise<WiseActivityItem[]> {
  const state = getWiseApiState();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const fetchLimit = Math.max(safeLimit, 20);
  const cacheKey = String(profileId);
  const now = Date.now();

  const ttlMs = options?.forceRefresh ? ACTIVITIES_FORCE_MIN_INTERVAL_MS : ACTIVITIES_CACHE_TTL_MS;
  const cached = state.activitiesCache.get(cacheKey);
  if (cached && cached.limit >= safeLimit && now - cached.fetchedAt < ttlMs) {
    return cached.items.slice(0, safeLimit);
  }

  // Respect 429 cooldown without hitting api.wise.com again
  const remainingCooldown = getWiseRateLimitRemainingSeconds();
  if (remainingCooldown > 0) {
    throw new Error(
      `Wise API rate-limited (429). Cooling down for ${remainingCooldown}s before next retry.`
    );
  }

  // Deduplicate concurrent requests across all tabs/clients
  const existingInFlight = state.activitiesInFlight.get(cacheKey);
  if (existingInFlight && existingInFlight.limit >= safeLimit) {
    const items = await existingInFlight.promise;
    return items.slice(0, safeLimit);
  }

  const promise = (async (): Promise<WiseActivityItem[]> => {
    try {
      const res = await fetch(`https://api.wise.com/v1/profiles/${profileId}/activities?size=${fetchLimit}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "ThatLaundryShop/1.0",
        },
        cache: "no-store",
      });

      if (res.status === 429) {
        const waitSec = recordWiseRateLimit(res);
        const errText = await res.text().catch(() => "");
        throw new Error(
          `Failed to fetch Wise activities (429): ${errText || '{"response":"block"}'} (cooling down ${waitSec}s)`
        );
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to fetch Wise activities (${res.status}): ${errText}`);
      }

      // Reset 429 circuit breaker on success
      state.consecutive429Count = 0;
      state.rateLimitedUntil = 0;

      const data = await res.json();
      const rawList: any[] = data?.activities || (Array.isArray(data) ? data : []);

      const mapped: WiseActivityItem[] = rawList.map((item: any) => {
        const parsed = parseWiseAmount(item.primaryAmount || "");
        return {
          id: item.id,
          type: item.type,
          senderName: stripHtml(item.title || "Wise Transfer"),
          amount: parsed.amount,
          currency: parsed.currency,
          rawAmount: stripHtml(item.primaryAmount || ""),
          status: item.status || "UNKNOWN",
          createdOn: item.createdOn,
          updatedOn: item.updatedOn || item.createdOn,
          resourceId: item.resource?.id ? String(item.resource.id) : undefined,
          isIncoming: parsed.isIncoming,
        };
      });

      // Enrich top 5 recent incoming TRANSFER items sequentially using cached transfer details
      // (already-seen transfers cost 0 Wise API requests)
      const enrichTargets = mapped.filter((m) => m.isIncoming && m.type === "TRANSFER" && m.resourceId).slice(0, 5);
      for (const item of enrichTargets) {
        if (!item.resourceId) continue;
        const detail = await fetchWiseTransferDetail(token, item.resourceId);
        if (detail) {
          item.reference = detail.reference;
          item.sourceCurrency = detail.sourceCurrency;
          item.sourceValue = detail.sourceValue;
          item.rate = detail.rate;
        }
        // Stop enriching remaining items if a 429 occurred
        if (getWiseRateLimitRemainingSeconds() > 0) break;
      }

      state.activitiesCache.set(cacheKey, {
        items: mapped,
        limit: fetchLimit,
        fetchedAt: Date.now(),
      });

      return mapped;
    } finally {
      state.activitiesInFlight.delete(cacheKey);
    }
  })();

  state.activitiesInFlight.set(cacheKey, { limit: fetchLimit, promise });
  const items = await promise;
  return items.slice(0, safeLimit);
}
