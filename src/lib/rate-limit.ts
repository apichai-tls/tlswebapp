import type { NextRequest } from 'next/server';

interface RateLimitBucket {
  timestamps: number[];
  blockedUntil: number;
}

const globalForRateLimit = globalThis as unknown as {
  __tlsRateLimitStore?: Map<string, RateLimitBucket>;
  __tlsRateLimitLastSweep?: number;
};

const rateLimitStore =
  globalForRateLimit.__tlsRateLimitStore || new Map<string, RateLimitBucket>();
globalForRateLimit.__tlsRateLimitStore = rateLimitStore;

const SWEEP_INTERVAL_MS = 60_000;
const MAX_STORE_ENTRIES = 10_000;

function maybeSweepRateLimitStore(now: number) {
  const lastSweep = globalForRateLimit.__tlsRateLimitLastSweep || 0;
  if (now - lastSweep < SWEEP_INTERVAL_MS && rateLimitStore.size < MAX_STORE_ENTRIES) {
    return;
  }
  globalForRateLimit.__tlsRateLimitLastSweep = now;
  const maxAge = 30 * 60_000;
  for (const [key, bucket] of rateLimitStore.entries()) {
    const latest = bucket.timestamps[bucket.timestamps.length - 1] || 0;
    if (bucket.blockedUntil < now && now - latest > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

export function getRequestClientIp(request?: NextRequest | Request | null): string {
  if (!request) return 'unknown';
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) return first;
    }
    const realIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-client-ip');
    if (realIp?.trim()) return realIp.trim();
  } catch {
    // ignore header access errors
  }
  return 'unknown';
}

export interface RateLimitOptions {
  namespace: string;
  key: string;
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult;
export function checkRateLimit(
  compositeKey: string,
  maxRequests: number,
  windowMs: number,
  blockDurationMs?: number
): RateLimitResult;
export function checkRateLimit(
  optionsOrKey: RateLimitOptions | string,
  maxRequestsArg?: number,
  windowMsArg?: number,
  blockDurationMsArg?: number
): RateLimitResult {
  const now = Date.now();
  maybeSweepRateLimitStore(now);

  const normalizedOptions: RateLimitOptions =
    typeof optionsOrKey === 'string'
      ? {
          namespace: 'rl',
          key: optionsOrKey,
          maxRequests: maxRequestsArg ?? 30,
          windowMs: windowMsArg ?? 60_000,
          blockDurationMs: blockDurationMsArg,
        }
      : optionsOrKey;

  const compositeKey = `${normalizedOptions.namespace}:${normalizedOptions.key.toLowerCase().trim() || 'anon'}`;
  let bucket = rateLimitStore.get(compositeKey);
  if (!bucket) {
    bucket = { timestamps: [], blockedUntil: 0 };
    rateLimitStore.set(compositeKey, bucket);
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
    };
  }

  const windowStart = now - normalizedOptions.windowMs;
  if (bucket.timestamps.length > 0 && bucket.timestamps[0] <= windowStart) {
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);
  }

  if (bucket.timestamps.length >= normalizedOptions.maxRequests) {
    const blockMs = normalizedOptions.blockDurationMs ?? normalizedOptions.windowMs;
    bucket.blockedUntil = now + blockMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(blockMs / 1000)),
    };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, normalizedOptions.maxRequests - bucket.timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimit(namespaceOrCompositeKey: string, key?: string): void {
  if (typeof key === 'string') {
    const compositeKey = `${namespaceOrCompositeKey}:${key.toLowerCase().trim() || 'anon'}`;
    rateLimitStore.delete(compositeKey);
  } else {
    const compositeKey = `rl:${namespaceOrCompositeKey.toLowerCase().trim() || 'anon'}`;
    rateLimitStore.delete(compositeKey);
  }
}
