import crypto from 'crypto';
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
// Uses TLS_SESSION_SECRET or CRON_SECRET or BEAM_WEBHOOK_SECRET if configured.
// If none is provided in the environment, generates a cryptographically strong
// random secret per process instance so an attacker can NEVER guess a hardcoded secret.
const globalForSecret = globalThis as unknown as {
  __tlsDynamicSessionSecret?: string;
};

function getSessionSecret(): string {
  const envSecret =
    process.env.TLS_SESSION_SECRET ||
    process.env.CRON_SECRET ||
    process.env.BEAM_WEBHOOK_SECRET;

  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }

  if (!globalForSecret.__tlsDynamicSessionSecret) {
    globalForSecret.__tlsDynamicSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalForSecret.__tlsDynamicSessionSecret;
}

const SESSION_TTL_MS = 18 * 60 * 60 * 1000; // 18 hours max session expiry
const USER_CACHE_TTL_MS = 30000;             // 30s cache for authoritative DB user lookup
const BRANCH_CACHE_TTL_MS = 60000;           // 60s cache for branch locations

interface CachedUserEntry {
  user: ServerAuthUser;
  cachedAt: number;
}

const globalForAuth = globalThis as unknown as {
  __tlsAuthUserCache?: Map<string, CachedUserEntry>;
  __tlsBranchesCache?: { branches: { id: string; name: string; area?: string | null }[]; cachedAt: number };
};

const userAuthCache = globalForAuth.__tlsAuthUserCache || new Map<string, CachedUserEntry>();
globalForAuth.__tlsAuthUserCache = userAuthCache;

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
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const secret = getSessionSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed || !parsed.id) return null;

    // Enforce cryptographic session expiration
    if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) {
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
    const verified = verifyStaffSessionToken(sessionToken);
    if (verified?.id) {
      const dbUser = await lookupAuthoritativeUser(verified.id);
      if (dbUser) {
        return { user: dbUser, explicitCredentialsProvided: true };
      }
    }
    // Invalid or expired session token provided
    return { user: null, explicitCredentialsProvided: true };
  }

  // No verified session token provided
  return { user: null, explicitCredentialsProvided: false };
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
  try {
    const { cookies, headers } = await import('next/headers');
    const cookieStore = await cookies();
    const headerStore = await headers();

    const authHeader = headerStore.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const sessionCookie = cookieStore.get('tls_session')?.value;
    const sessionToken = bearerToken || sessionCookie;

    if (sessionToken) {
      const verified = verifyStaffSessionToken(sessionToken);
      if (verified?.id) {
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
      job.deliveryRiderId === user.id;
    if (isAssignedToRider) return true;

    const isUnassignedPending =
      (job.status === 'pending' || job.status === 'tba') &&
      !job.riderId &&
      !job.pickupRiderId;
    if (isUnassignedPending) {
      if (user.allowedBranchIds === 'ALL' || !job.branchId) return true;
      return user.allowedBranchIds.includes(job.branchId);
    }
    if (user.allowedBranchIds === 'ALL') return true;
    return !job.branchId || user.allowedBranchIds.includes(job.branchId);
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
    if (user.allowedBranchIds !== 'ALL') {
      return {
        OR: [
          { riderId: user.id },
          { pickupRiderId: user.id },
          { deliveryRiderId: user.id },
          { branchId: { in: user.allowedBranchIds } },
          { branchId: null },
        ],
      };
    }
    return {
      OR: [
        { riderId: user.id },
        { pickupRiderId: user.id },
        { deliveryRiderId: user.id },
        { status: { in: ['pending', 'tba'] } },
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
