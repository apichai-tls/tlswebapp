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

const SESSION_SECRET =
  process.env.TLS_SESSION_SECRET ||
  process.env.CRON_SECRET ||
  process.env.BEAM_WEBHOOK_SECRET ||
  'tls-operations-realtime-hmac-secret-2026';

const USER_CACHE_TTL_MS = 60000;
const BRANCH_CACHE_TTL_MS = 60000;

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
  const data = Buffer.from(
    JSON.stringify({
      id: payload.id,
      email: payload.email || '',
      role: payload.role,
      branchId: payload.branchId || null,
      area: payload.area || null,
      iat: Date.now(),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyStaffSessionToken(token: string): {
  id: string;
  email?: string;
  role: string;
  branchId?: string | null;
  area?: string | null;
  iat: number;
} | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed || !parsed.id) return null;
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

  // 1. Check AdminUser table first
  const adminUser = await prisma.adminUser.findUnique({
    where: { id: userId },
  });

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

  // 2. Check Rider table or built-in rider accounts
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

  if (/^RIDER-0[1-9]$/i.test(userId)) {
    const resolved: ServerAuthUser = {
      id: userId.toUpperCase(),
      email: `${userId.toLowerCase()}@tls.com`,
      name: userId.toUpperCase(),
      role: 'rider',
      branchId: null,
      area: null,
      permissions: [],
      isActive: true,
      allowedBranchIds: 'ALL',
    };
    userAuthCache.set(userId, { user: resolved, cachedAt: now });
    return resolved;
  }

  return null;
}

/**
 * Resolves the staff or rider user from request cookies, Authorization header,
 * X-TLS-User-Id header, or ?userId query parameter, and verifies their authoritative
 * role and branch permissions from the database.
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
    return { user: null, explicitCredentialsProvided: true };
  }

  const headerUserId =
    request.headers.get('x-tls-user-id') ||
    url.searchParams.get('userId') ||
    cookies['tls_user_id'];

  if (headerUserId) {
    const dbUser = await lookupAuthoritativeUser(headerUserId.trim());
    return { user: dbUser, explicitCredentialsProvided: true };
  }

  return { user: null, explicitCredentialsProvided: false };
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
  if (!user) return true;
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
    // Riders also need visibility if they are assigned to any leg or if allowedBranchIds === 'ALL'
    if (user.allowedBranchIds === 'ALL') return true;
    return !job.branchId || user.allowedBranchIds.includes(job.branchId);
  }

  if (user.allowedBranchIds === 'ALL') {
    return true;
  }

  // Branch/Area restricted staff can access jobs in their assigned branches or unassigned jobs
  if (!job.branchId) return true;
  return user.allowedBranchIds.includes(job.branchId);
}

/**
 * Builds a Prisma WHERE filter scoping Job queries to the user's authorized branches/role.
 */
export function buildJobAuthWhereClause(user: ServerAuthUser | null): Record<string, any> | null {
  if (!user) return null;
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
    return null;
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
