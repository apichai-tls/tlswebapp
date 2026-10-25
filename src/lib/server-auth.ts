import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { prisma } from '@/lib/prisma';
import { dbCache } from '@/lib/db-cache';

export interface ServerAuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  department?: string | null;
  isDepartmentHead?: boolean;
  area?: string | null;
  branchId?: string | null;
  permissions: string[];
  isActive: boolean;
  allowedBranchIds: string[] | 'ALL';
}

// ─── Cryptographic Session Secret Management ───────────────────────────────
// Requires a shared session secret (TLS_SESSION_SECRET, CRON_SECRET, or BEAM_WEBHOOK_SECRET >= 16 chars)
// across all instances. Random per-instance fallback is strictly prohibited so tokens
// issued by one instance always verify on all other instances, and missing secret fails startup clearly.
function loadDotEnvSecretOnceInDev(): void {
  if (process.env.NODE_ENV === 'production') return;
  if (
    'TLS_SESSION_SECRET' in process.env ||
    'CRON_SECRET' in process.env ||
    'BEAM_WEBHOOK_SECRET' in process.env
  ) {
    return;
  }
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      if (
        key === 'TLS_SESSION_SECRET' ||
        key === 'CRON_SECRET' ||
        key === 'BEAM_WEBHOOK_SECRET'
      ) {
        const val = line
          .slice(eqIdx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        if (val && !(key in process.env)) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Ignore file read errors; assertSessionSecretConfigured will enforce requirement
  }
}

loadDotEnvSecretOnceInDev();

export function assertSessionSecretConfigured(): string {
  const envSecret =
    process.env.TLS_SESSION_SECRET ||
    process.env.CRON_SECRET ||
    process.env.BEAM_WEBHOOK_SECRET;

  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }

  throw new Error(
    'CRITICAL: Shared session secret (TLS_SESSION_SECRET) is missing or too short (minimum 16 characters required). Configure TLS_SESSION_SECRET before starting the server.'
  );
}

function getSessionSecret(): string {
  return assertSessionSecretConfigured();
}

if (process.env.NEXT_PHASE !== 'phase-production-build') {
  assertSessionSecretConfigured();
}

export const SESSION_TTL_MS = 18 * 60 * 60 * 1000; // 18 hours max session expiry
const USER_CACHE_TTL_MS = 30000;             // 30s cache for authoritative DB user lookup
const BRANCH_CACHE_TTL_MS = 60000;           // 60s cache for branch locations

interface CachedUserEntry {
  user: ServerAuthUser;
  cachedAt: number;
}

const REVOCATION_SETTING_KEY = 'auth_session_revocations';

interface RevocationState {
  users: Record<string, number>;   // userId -> revokedBeforeMs
  tokens: Record<string, number>;  // tokenSha256 -> expMs
}

const globalForAuth = globalThis as unknown as {
  __tlsAuthUserCache?: Map<string, CachedUserEntry>;
  __tlsBranchesCache?: { branches: { id: string; name: string; area?: string | null }[]; cachedAt: number };
  __tlsRevokedTokens?: Map<string, number>;
  __tlsUserRevokedBefore?: Map<string, number>;
  __tlsRevocationSyncedAt?: number;
};

const userAuthCache = globalForAuth.__tlsAuthUserCache || new Map<string, CachedUserEntry>();
globalForAuth.__tlsAuthUserCache = userAuthCache;

const revokedTokensMap = globalForAuth.__tlsRevokedTokens || new Map<string, number>();
globalForAuth.__tlsRevokedTokens = revokedTokensMap;

const userRevokedBeforeMap = globalForAuth.__tlsUserRevokedBefore || new Map<string, number>();
globalForAuth.__tlsUserRevokedBefore = userRevokedBeforeMap;

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('base64url');
}

function pruneExpiredRevocations(now = Date.now()) {
  for (const [tokenHash, exp] of revokedTokensMap.entries()) {
    if (exp <= now) revokedTokensMap.delete(tokenHash);
  }
  for (const [uid, ts] of userRevokedBeforeMap.entries()) {
    if (now - ts > SESSION_TTL_MS) userRevokedBeforeMap.delete(uid);
  }
}

const REVOCATION_SYNC_TTL_MS = 10000;
let inFlightRevocationSync: Promise<void> | null = null;

export async function syncRevocationsFromDb(force = false): Promise<void> {
  const now = Date.now();
  if (
    !force &&
    globalForAuth.__tlsRevocationSyncedAt &&
    now - globalForAuth.__tlsRevocationSyncedAt < REVOCATION_SYNC_TTL_MS
  ) {
    return;
  }
  if (!force && inFlightRevocationSync) {
    return inFlightRevocationSync;
  }
  inFlightRevocationSync = (async () => {
    try {
      const syncNow = Date.now();
      globalForAuth.__tlsRevocationSyncedAt = syncNow;
      const row = await prisma.setting.findUnique({ where: { key: REVOCATION_SETTING_KEY } });
      if (row?.value) {
        const parsed = JSON.parse(row.value) as Partial<RevocationState>;
        if (parsed.tokens && typeof parsed.tokens === 'object') {
          for (const [hash, exp] of Object.entries(parsed.tokens)) {
            if (typeof exp === 'number' && exp > syncNow) {
              const existingExp = revokedTokensMap.get(hash) || 0;
              if (exp > existingExp) revokedTokensMap.set(hash, exp);
            }
          }
        }
        if (parsed.users && typeof parsed.users === 'object') {
          for (const [uid, ts] of Object.entries(parsed.users)) {
            if (typeof ts === 'number' && syncNow - ts <= SESSION_TTL_MS) {
              const existing = userRevokedBeforeMap.get(uid) || 0;
              if (ts > existing) userRevokedBeforeMap.set(uid, ts);
            }
          }
        }
      }
      pruneExpiredRevocations(syncNow);
    } finally {
      inFlightRevocationSync = null;
    }
  })();
  return inFlightRevocationSync;
}

async function persistRevocationsToDb(delta?: {
  users?: Record<string, number>;
  tokens?: Record<string, number>;
}): Promise<void> {
  const now = Date.now();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REVOCATION_SETTING_KEY}))`;

    const existingRow = await tx.setting.findUnique({
      where: { key: REVOCATION_SETTING_KEY },
    });

    const mergedUsers: Record<string, number> = {};
    const mergedTokens: Record<string, number> = {};

    if (existingRow?.value) {
      try {
        const parsed = JSON.parse(existingRow.value) as Partial<RevocationState>;
        if (parsed.users && typeof parsed.users === 'object') {
          for (const [uid, ts] of Object.entries(parsed.users)) {
            if (typeof ts === 'number' && Number.isFinite(ts) && now - ts <= SESSION_TTL_MS) {
              mergedUsers[uid] = Math.max(mergedUsers[uid] || 0, ts);
            }
          }
        }
        if (parsed.tokens && typeof parsed.tokens === 'object') {
          for (const [hash, exp] of Object.entries(parsed.tokens)) {
            if (typeof exp === 'number' && Number.isFinite(exp) && exp > now) {
              mergedTokens[hash] = Math.max(mergedTokens[hash] || 0, exp);
            }
          }
        }
      } catch {
        // Recover cleanly if stored JSON was malformed
      }
    }

    if (delta?.users) {
      for (const [uid, ts] of Object.entries(delta.users)) {
        if (typeof ts === 'number' && Number.isFinite(ts) && now - ts <= SESSION_TTL_MS) {
          mergedUsers[uid] = Math.max(mergedUsers[uid] || 0, ts);
        }
      }
    }

    if (delta?.tokens) {
      for (const [hash, exp] of Object.entries(delta.tokens)) {
        if (typeof exp === 'number' && Number.isFinite(exp) && exp > now) {
          mergedTokens[hash] = Math.max(mergedTokens[hash] || 0, exp);
        }
      }
    }

    const state: RevocationState = {
      users: mergedUsers,
      tokens: mergedTokens,
    };

    await tx.setting.upsert({
      where: { key: REVOCATION_SETTING_KEY },
      update: { value: JSON.stringify(state) },
      create: { key: REVOCATION_SETTING_KEY, value: JSON.stringify(state) },
    });

    for (const [uid, ts] of Object.entries(mergedUsers)) {
      const existing = userRevokedBeforeMap.get(uid) || 0;
      if (ts > existing) userRevokedBeforeMap.set(uid, ts);
    }
    for (const [hash, exp] of Object.entries(mergedTokens)) {
      const existing = revokedTokensMap.get(hash) || 0;
      if (exp > existing) revokedTokensMap.set(hash, exp);
    }
    pruneExpiredRevocations(now);
    globalForAuth.__tlsRevocationSyncedAt = now;
  });
}

export async function revokeSessionToken(token?: string | null, userId?: string | null): Promise<void> {
  const now = Date.now();
  const deltaTokens: Record<string, number> = {};
  if (token) {
    const verified = verifyStaffSessionToken(token);
    const exp = verified?.exp || now + SESSION_TTL_MS;
    const tokenHash = hashSessionToken(token);
    revokedTokensMap.set(tokenHash, exp);
    deltaTokens[tokenHash] = exp;
    if (!userId && verified?.id) {
      userId = verified.id;
    }
  }
  if (userId) {
    invalidateServerAuthCache(userId);
  }
  await persistRevocationsToDb({ tokens: deltaTokens });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  if (!userId) return;
  const now = Date.now();
  userRevokedBeforeMap.set(userId, now);
  invalidateServerAuthCache(userId);
  await persistRevocationsToDb({ users: { [userId]: now } });
}

function isTokenRevoked(token: string, verified: { id: string; iat?: number }): boolean {
  const tokenHash = hashSessionToken(token);
  const revokedExp = revokedTokensMap.get(tokenHash);
  if (revokedExp && revokedExp > Date.now()) {
    return true;
  }
  const revokedBefore = userRevokedBeforeMap.get(verified.id);
  if (revokedBefore && typeof verified.iat === 'number' && verified.iat <= revokedBefore) {
    return true;
  }
  return false;
}

export function invalidateServerAuthCache(userId?: string) {
  if (userId) {
    userAuthCache.delete(userId);
  } else {
    userAuthCache.clear();
  }
}

async function getBranchesForAuth(): Promise<{ id: string; name: string; area?: string | null }[]> {
  if (dbCache.masterData?.shopLocations && Array.isArray(dbCache.masterData.shopLocations)) {
    return dbCache.masterData.shopLocations;
  }
  const now = Date.now();
  if (globalForAuth.__tlsBranchesCache && now - globalForAuth.__tlsBranchesCache.cachedAt < BRANCH_CACHE_TTL_MS) {
    return globalForAuth.__tlsBranchesCache.branches;
  }
  const branches = await prisma.shopLocation.findMany({
    select: { id: true, name: true, area: true },
  });
  globalForAuth.__tlsBranchesCache = { branches, cachedAt: now };
  return branches;
}

export function resolveAllowedBranchIds(
  user: { role?: string | null; area?: string | null; branchId?: string | null },
  branches: { id: string; name: string; area?: string | null }[]
): string[] | 'ALL' {
  const role = (user.role || '').toLowerCase();
  if (
    role === 'admin' ||
    role === 'superadmin' ||
    (!user.area && !user.branchId) ||
    user.area === 'ALL'
  ) {
    return 'ALL';
  }

  const ids = new Set<string>();
  if (user.branchId && branches.some((b) => b.id === user.branchId)) {
    ids.add(user.branchId);
  }

  if (user.area) {
    const parts = user.area.split(',').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.toUpperCase() === 'ALL') {
        return 'ALL';
      }
      const matchedById = branches.find((b) => b.id === part || b.id.toLowerCase() === part.toLowerCase());
      if (matchedById) {
        ids.add(matchedById.id);
      } else {
        branches
          .filter((b) => (b.area || 'BKK').toUpperCase() === part.toUpperCase())
          .forEach((b) => ids.add(b.id));
      }
      if (false) {
      if (part.toUpperCase() === 'ALL') {
        return 'ALL';
      }
      if (branches.some((b) => b.id === part)) {
        ids.add(part);
      } else if (part.toUpperCase() === 'BKK') {
        branches
          .filter((b) => (b.area || 'BKK').toUpperCase() === 'BKK')
          .forEach((b) => ids.add(b.id));
      } else if (part.toUpperCase() === 'PTY') {
        branches
          .filter((b) => (b.area || '').toUpperCase() === 'PTY')
          .forEach((b) => ids.add(b.id));
      }
    }
  }

      }
  return Array.from(ids);
}

export function signStaffSessionToken(payload: {
  id: string;
  email?: string;
  role: string;
  branchId?: string | null;
  area?: string | null;
}): string {
  const now = Date.now();
  const secret = getSessionSecret();
  const data = Buffer.from(
    JSON.stringify({
      id: payload.id,
      email: payload.email || '',
      role: payload.role,
      branchId: payload.branchId || null,
      area: payload.area || null,
      iat: now,
      exp: now + SESSION_TTL_MS,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyStaffSessionToken(token: string): {
  id: string;
  email?: string;
  role: string;
  branchId?: string | null;
  area?: string | null;
  iat: number;
  exp: number;
} | null {
  const secret = getSessionSecret();
  try {
    if (!token || typeof token !== 'string') return null;
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id.trim()) return null;

    const now = Date.now();
    // Require valid numeric iat and exp and enforce maximum session lifetime
    if (
      typeof parsed.iat !== 'number' ||
      !Number.isFinite(parsed.iat) ||
      parsed.iat <= 0 ||
      parsed.iat > now + 60_000
    ) {
      return null;
    }
    if (
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= parsed.iat ||
      parsed.exp - parsed.iat > SESSION_TTL_MS ||
      now > parsed.exp
    ) {
      return null;
    }

    // Enforce immediate in-memory revocation check
    if (isTokenRevoked(token, parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export async function lookupAuthoritativeUser(userId: string): Promise<ServerAuthUser | null> {
  if (!userId) return null;
  const now = Date.now();
  const cached = userAuthCache.get(userId);
  if (cached && now - cached.cachedAt < USER_CACHE_TTL_MS) {
    return cached.user;
  }

  const branches = await getBranchesForAuth();

  // 1. Check AdminUser table first (by id, or fallback to email if userId looks like an email)
  let adminUser = await prisma.adminUser.findUnique({
    where: { id: userId },
  });
  if (!adminUser && userId.includes('@')) {
    adminUser = await prisma.adminUser.findUnique({
      where: { email: userId.toLowerCase().trim() },
    });
  }

  if (adminUser) {
    let permissions: string[] = [];
    try {
      permissions = JSON.parse(adminUser.permissions || '[]');
    } catch {
      permissions = [];
    }
    const allowedBranchIds = resolveAllowedBranchIds(adminUser, branches);
    const resolved: ServerAuthUser = {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
      department: adminUser.department,
      isDepartmentHead: adminUser.isDepartmentHead ?? false,
      area: adminUser.area,
      branchId: adminUser.branchId,
      permissions,
      isActive: adminUser.isActive !== false,
      allowedBranchIds,
    };
    userAuthCache.set(userId, { user: resolved, cachedAt: now });
    return resolved;
  }

  // 2. Check Rider table
  const rider = await prisma.rider.findUnique({
    where: { id: userId },
  });

  if (rider) {
    const resolved: ServerAuthUser = {
      id: rider.id,
      email: `${rider.id.toLowerCase()}@tls.com`,
      name: rider.name,
      role: 'rider',
      branchId: rider.branchId,
      area: null,
      permissions: [],
      isActive: rider.isActive !== false,
      allowedBranchIds: rider.branchId ? [rider.branchId] : 'ALL',
    };
    userAuthCache.set(userId, { user: resolved, cachedAt: now });
    return resolved;
  }

  return null;
}

/**
 * Resolves the staff or rider user from request cookies or Authorization header.
 * Strictly requires a cryptographically verified HMAC session token.
 * Unauthenticated user ID headers, query parameters, or unverified cookies are rejected.
 */
export async function resolveRequestUser(request?: Request | null): Promise<{
  user: ServerAuthUser | null;
  explicitCredentialsProvided: boolean;
}> {
  if (!request) {
    return { user: null, explicitCredentialsProvided: false };
  }

  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get('cookie'));
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const sessionToken = bearerToken || cookies['tls_session'] || url.searchParams.get('token');

  if (sessionToken) {
    await syncRevocationsFromDb();
    const verified = verifyStaffSessionToken(sessionToken);
    if (verified?.id && !isTokenRevoked(sessionToken, verified)) {
      const dbUser = await lookupAuthoritativeUser(verified.id);
      if (dbUser) {
        return { user: dbUser, explicitCredentialsProvided: true };
      }
    }
    // Invalid, expired, or revoked session token provided
    return { user: null, explicitCredentialsProvided: true };
  }

  // No verified session token provided
  return { user: null, explicitCredentialsProvided: false };
}

interface ServerActionContextStore {
  sessionToken?: string | null;
  internalSystemUser?: ServerAuthUser | null;
}

const serverActionAuthContext =
  (globalForAuth as any).__tlsServerActionAuthContext ||
  new AsyncLocalStorage<ServerActionContextStore>();
(globalForAuth as any).__tlsServerActionAuthContext = serverActionAuthContext;

/**
 * Runs a function within an explicit session token context (used by server-side test suites
 * or internal callers where Next.js request cookies are not active).
 * The token still undergoes full HMAC verification, revocation check, and DB user lookup.
 */
export function runWithSessionToken<T>(sessionToken: string | null, fn: () => Promise<T>): Promise<T> {
  return serverActionAuthContext.run({ sessionToken }, fn);
}

/**
 * Runs a function within an unforgeable internal system context (e.g. HMAC-verified Beam webhook).
 */
export function runWithInternalSystemAuth<T>(
  actorOrFn: { id: string; name?: string; email?: string } | (() => Promise<T>),
  maybeFn?: () => Promise<T>
): Promise<T> {
  const fn = typeof actorOrFn === 'function' ? actorOrFn : maybeFn!;
  const systemActor = typeof actorOrFn === 'function' ? { id: '__internal_system__', name: 'System Internal' } : actorOrFn;
  const internalSystemUser: ServerAuthUser = {
    id: systemActor.id,
    email: systemActor.email || 'system@tls.internal',
    name: systemActor.name || 'System Internal',
    role: 'admin',
    permissions: ['users', 'accounting', 'reports'],
    isActive: true,
    allowedBranchIds: 'ALL',
  };
  return serverActionAuthContext.run({ internalSystemUser }, fn);
}

/**
 * Resolves the authoritative user inside a Next.js Server Action by checking
 * Next.js request cookies/headers for a valid cryptographic HMAC session token.
 * Insecure client-supplied actorId strings are strictly rejected without a valid session.
 */
export async function resolveServerActionUser(): Promise<{
  user: ServerAuthUser | null;
  explicitCredentialsProvided: boolean;
}> {
  const localCtx = serverActionAuthContext.getStore();
  if (localCtx?.internalSystemUser) {
    return { user: localCtx.internalSystemUser, explicitCredentialsProvided: true };
  }
  if (localCtx && 'sessionToken' in localCtx) {
    const token = localCtx.sessionToken;
    if (!token) {
      return { user: null, explicitCredentialsProvided: false };
    }
    await syncRevocationsFromDb();
    const verified = verifyStaffSessionToken(token);
    if (verified?.id && !isTokenRevoked(token, verified)) {
      const dbUser = await lookupAuthoritativeUser(verified.id);
      return { user: dbUser, explicitCredentialsProvided: true };
    }
    return { user: null, explicitCredentialsProvided: true };
  }

  try {
    const { cookies, headers } = await import('next/headers');
    const cookieStore = await cookies();
    const headerStore = await headers();

    const authHeader = headerStore.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const sessionCookie = cookieStore.get('tls_session')?.value;
    const sessionToken = bearerToken || sessionCookie;

    if (sessionToken) {
      await syncRevocationsFromDb();
      const verified = verifyStaffSessionToken(sessionToken);
      if (verified?.id && !isTokenRevoked(sessionToken, verified)) {
        const dbUser = await lookupAuthoritativeUser(verified.id);
        return { user: dbUser, explicitCredentialsProvided: true };
      }
      return { user: null, explicitCredentialsProvided: true };
    }
  } catch {
    // Outside Next.js request context
  }

  return { user: null, explicitCredentialsProvided: false };
}

/**
 * Enforces server-side authorization for Server Actions.
 * Throws an Error if unauthenticated, deactivated, or missing required permissions.
 */
export async function assertServerActionAuthorized(options?: {
  requireWrite?: boolean;
  requireAdmin?: boolean;
  requiredPermission?: string;
  targetBranchId?: string | null;
  forbidRoles?: string[];
  allowedRoles?: string[];
}): Promise<ServerAuthUser> {
  const { user, explicitCredentialsProvided } = await resolveServerActionUser();

  if (!user) {
    if (explicitCredentialsProvided) {
      throw new Error('Unauthorized: Invalid or expired staff session');
    }
    throw new Error('Unauthorized: Valid server-verified staff session required');
  }

  if (!user.isActive) {
    throw new Error('Forbidden: This account has been deactivated (Resigned)');
  }

  const role = (user.role || '').toLowerCase();

  if (options?.forbidRoles && options.forbidRoles.some((r) => r.toLowerCase() === role)) {
    throw new Error(`Forbidden: Role '${role}' is not permitted to perform this operation`);
  }

  if (
    options?.allowedRoles &&
    options.allowedRoles.length > 0 &&
    !options.allowedRoles.some((r) => r.toLowerCase() === role) &&
    role !== 'admin' &&
    role !== 'superadmin'
  ) {
    throw new Error(`Forbidden: Role '${role}' does not have access to this operation`);
  }

  if (options?.requireWrite && role === 'spectator') {
    throw new Error('Forbidden: Spectator role has read-only access and cannot modify data');
  }

  if (options?.requireAdmin) {
    const isAdmin = role === 'admin' || role === 'superadmin' || user.permissions.includes('users');
    if (!isAdmin) {
      throw new Error('Forbidden: Admin permission is required for this operation');
    }
  }

  if (options?.requiredPermission) {
    const hasPerm =
      role === 'admin' ||
      role === 'superadmin' ||
      user.permissions.includes(options.requiredPermission);
    if (!hasPerm) {
      throw new Error(`Forbidden: Missing required permission (${options.requiredPermission})`);
    }
  }

  if (
    options?.targetBranchId &&
    user.allowedBranchIds !== 'ALL' &&
    !user.allowedBranchIds.includes(options.targetBranchId)
  ) {
    throw new Error('Forbidden: You do not have access to records in this branch');
  }

  return user;
}

// ─── Granular Role-Based Permission Gates ───────────────────────────────────

export function isAdminOrSuperadmin(user: { role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'admin' || role === 'superadmin';
}

export function canAccessCustomerRecords(
  user: ServerAuthUser | null,
  customerBranchId?: string | null
): boolean {
  if (!user || !user.isActive) return false;
  const role = (user.role || '').toLowerCase();

  // Riders do not have access to the full customer database (only their assigned jobs)
  if (role === 'rider') return false;

  // Full administrative, customer service, or accounting access
  if (
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'manager' ||
    role === 'cso' ||
    role === 'accounting' ||
    role === 'marketing'
  ) {
    if (user.allowedBranchIds === 'ALL') return true;
    if (!customerBranchId) return true;
    return user.allowedBranchIds.includes(customerBranchId);
  }

  // Branch staff / cashiers can only access customers of their branch or unassigned
  if (user.allowedBranchIds === 'ALL') return true;
  if (!customerBranchId) return true;
  return user.allowedBranchIds.includes(customerBranchId);
}

export function canAccessFinancialData(user: ServerAuthUser | null): boolean {
  if (!user || !user.isActive) return false;
  const role = (user.role || '').toLowerCase();
  return (
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'manager' ||
    role === 'accounting' ||
    user.permissions.includes('accounting') ||
    user.permissions.includes('reports')
  );
}

export function canAccessShifts(user: ServerAuthUser | null, branchId?: string | null): boolean {
  if (!user || !user.isActive) return false;
  const role = (user.role || '').toLowerCase();
  if (role === 'rider') return false;

  if (role === 'admin' || role === 'superadmin' || role === 'accounting') {
    return true;
  }

  if (user.allowedBranchIds === 'ALL') return true;
  if (!branchId) return true;
  return user.allowedBranchIds.includes(branchId);
}

/**
 * Checks whether the resolved user is authorized to view/receive a specific job or job event.
 */
export function canUserAccessJob(
  user: ServerAuthUser | null,
  job: {
    id?: string;
    branchId?: string | null;
    riderId?: string | null;
    pickupRiderId?: string | null;
    deliveryRiderId?: string | null;
    previousRiderIds?: string[] | null;
    status?: string | null;
  }
): boolean {
  if (!user) return false;
  if (!user.isActive) return false;

  const role = (user.role || '').toLowerCase();
  if (role === 'rider') {
    const isAssignedToRider =
      job.riderId === user.id ||
      job.pickupRiderId === user.id ||
      job.deliveryRiderId === user.id ||
      (Array.isArray(job.previousRiderIds) && job.previousRiderIds.includes(user.id));
    if (isAssignedToRider) return true;

    const isUnassignedPending =
      (job.status === 'pending' || job.status === 'tba') &&
      !job.riderId &&
      !job.pickupRiderId;
    if (isUnassignedPending) {
      if (user.allowedBranchIds === 'ALL' || !job.branchId) return true;
      return user.allowedBranchIds.includes(job.branchId);
    }
    return false;
  }

  if (user.allowedBranchIds === 'ALL') {
    return true;
  }

  if (!job.branchId) return true;
  return user.allowedBranchIds.includes(job.branchId);
}

/**
 * Builds a Prisma WHERE filter scoping Job queries to the user's authorized branches/role.
 */
export function buildJobAuthWhereClause(user: ServerAuthUser | null): Record<string, any> | null {
  if (!user) {
    return { id: '__UNAUTHORIZED_ANONYMOUS_USER__' };
  }
  if (!user.isActive) {
    return { id: '__UNAUTHORIZED_INACTIVE_USER__' };
  }

  const role = (user.role || '').toLowerCase();
  if (role === 'rider') {
    const unassignedFilter: Record<string, any> = {
      status: { in: ['pending', 'tba'] },
      riderId: null,
      pickupRiderId: null,
    };
    if (user.allowedBranchIds !== 'ALL') {
      unassignedFilter.OR = [
        { branchId: { in: user.allowedBranchIds } },
        { branchId: null },
      ];
    }
    return {
      OR: [
        { riderId: user.id },
        { pickupRiderId: user.id },
        { deliveryRiderId: user.id },
        unassignedFilter,
      ],
    };
  }

  if (user.allowedBranchIds === 'ALL') {
    return null;
  }

  return {
    OR: [
      { branchId: { in: user.allowedBranchIds } },
      { branchId: null },
    ],
  };
}
