import { prisma } from '@/lib/prisma';

export interface DbCacheState {
  payload: any | null;
  lastTime: number;
  etag: string | null;
  version: number;
  riderEarnings: {
    lifetimeEarnings: any[];
    monthEarnings: any[];
    completedJobsCounts: any[];
  } | null;
  lastRiderEarningsTime: number;
  masterData: {
    services: any[];
    priceListsRaw: any[];
    shopLocations: any[];
    settingsRaw: any[];
  } | null;
  lastMasterDataTime: number;
  customers: any[] | null;
  lastCustomersTime: number;
  jobRevisionCache: Map<string, { revision: number; job: any; cachedAt: number }>;
  inFlightJobFetches: Map<string, Promise<any>>;
  inFlightDbLoad: Promise<any> | null;
}

const globalForCache = globalThis as unknown as {
  __tlsDbCache?: DbCacheState;
};

export const dbCache: DbCacheState = globalForCache.__tlsDbCache || {
  payload: null,
  lastTime: 0,
  etag: null,
  version: 1,
  riderEarnings: null,
  lastRiderEarningsTime: 0,
  masterData: null,
  lastMasterDataTime: 0,
  customers: null,
  lastCustomersTime: 0,
  jobRevisionCache: new Map(),
  inFlightJobFetches: new Map(),
  inFlightDbLoad: null,
};

// Ensure singleton across module reloads in both dev and production
globalForCache.__tlsDbCache = dbCache;
if (!dbCache.jobRevisionCache) dbCache.jobRevisionCache = new Map();
if (!dbCache.inFlightJobFetches) dbCache.inFlightJobFetches = new Map();

export const JOB_SELECT_FIELDS = {
  id: true,
  type: true,
  customerId: true,
  customerName: true,
  customerPhone: true,
  pickupLocation: true,
  dropoffLocation: true,
  pickupLat: true,
  pickupLng: true,
  dropoffLat: true,
  dropoffLng: true,
  distance: true,
  fee: true,
  status: true,
  subStatus: true,
  createdAt: true,
  updatedAt: true,
  scheduledAt: true,
  completedAt: true,
  riderId: true,
  serviceType: true,
  laundryTypes: true,
  source: true,
  brand: true,
  totalAmount: true,
  paymentMethod: true,
  discount: true,
  discountPercent: true,
  pickupDistance: true,
  deliveryDistance: true,
  pickupCommission: true,
  deliveryCommission: true,
  pickupScheduledAt: true,
  pickupScheduledEndAt: true,
  deliveryScheduledAt: true,
  deliveryScheduledEndAt: true,
  pickupRiderId: true,
  deliveryRiderId: true,
  remark: true,
  itemsJson: true,
  legsJson: true,
  adminNotesJson: true,
  branchId: true,
  pickupProofImageUrl: true,
  deliveryProofImageUrl: true,
  proofImageUrl: true,
  bagImageUrl: true,
  billImageUrl: true,
  paymentChannel: true,
  isPaid: true,
  createdBy: true,
  cashPlaced: true,
  isStuck: true,
  shiftId: true,
  billNo: true,
  isShopPaid: true,
  csoPaidAt: true,
  shopPaidAt: true,
  proformaNumber: true,
  proformaRevision: true,
  proformaCartHash: true,
  refundId: true,
  refundedFromId: true,
  walletBalanceAfter: true,
} as const;

export function formatJobRecord(j: any) {
  if (!j) return null;
  let items: any[] = [];
  if (Array.isArray(j.items)) {
    items = j.items;
  } else if (typeof j.itemsJson === 'string' && j.itemsJson) {
    try {
      items = JSON.parse(j.itemsJson);
    } catch {
      items = [];
    }
  }

  let legs: any = undefined;
  if (j.legs && typeof j.legs === 'object') {
    legs = j.legs;
  } else if (typeof j.legsJson === 'string' && j.legsJson) {
    try {
      legs = JSON.parse(j.legsJson);
    } catch {
      legs = undefined;
    }
  }

  const laundryTypes = Array.isArray(j.laundryTypes)
    ? j.laundryTypes
    : typeof j.laundryTypes === 'string' && j.laundryTypes
      ? j.laundryTypes.split(',')
      : [];

  return {
    ...j,
    laundryTypes,
    items,
    legs,
    pickupCoords: j.pickupCoords || { lat: j.pickupLat ?? 0, lng: j.pickupLng ?? 0 },
    dropoffCoords: j.dropoffCoords || { lat: j.dropoffLat ?? 0, lng: j.dropoffLng ?? 0 },
  };
}

export function sanitizeCustomerRecord(c: any) {
  if (!c) return null;
  const { passwordHash: _passwordHash, forcePasswordReset: _forcePasswordReset, ...safe } = c;
  return {
    ...safe,
    vatType: safe.vatType || 'default',
    defaultCoords: safe.defaultCoords || { lat: safe.defaultLat, lng: safe.defaultLng },
  };
}

export function computeDeterministicEtag(params: {
  jobsCount: number;
  maxJobUpdated: number;
  customersCount?: number;
  maxCustomerUpdated?: number;
  openShiftsCount?: number;
}) {
  const {
    jobsCount,
    maxJobUpdated,
    customersCount = 0,
    maxCustomerUpdated = 0,
    openShiftsCount = 0,
  } = params;
  return `W/"j${jobsCount}-${maxJobUpdated}-c${customersCount}-${maxCustomerUpdated}-s${openShiftsCount}"`;
}

/**
 * Prime the revision micro-cache and patch the in-memory payload jobs list
 * when a job is created or updated on this instance (or received via LISTEN/NOTIFY).
 */
export function primeJobCache(rawOrFormattedJob: any) {
  if (!rawOrFormattedJob || !rawOrFormattedJob.id) return null;
  const formatted = formatJobRecord(rawOrFormattedJob);
  const revision = formatted.updatedAt ? new Date(formatted.updatedAt).getTime() : Date.now();

  // Prune stale entries (> 60s) if map grows large
  if (dbCache.jobRevisionCache.size > 500) {
    const cutoff = Date.now() - 60000;
    for (const [k, v] of dbCache.jobRevisionCache.entries()) {
      if (v.cachedAt < cutoff) dbCache.jobRevisionCache.delete(k);
    }
  }

  const existingCached = dbCache.jobRevisionCache.get(formatted.id);
  if (!existingCached || revision >= existingCached.revision) {
    dbCache.jobRevisionCache.set(formatted.id, {
      revision,
      job: formatted,
      cachedAt: Date.now(),
    });
  }

  // Patch dbCache.payload.jobs in-place if warm so we don't have to discard the entire payload
  if (dbCache.payload && Array.isArray(dbCache.payload.jobs)) {
    const idx = dbCache.payload.jobs.findIndex((item: any) => item.id === formatted.id);
    if (idx >= 0) {
      const currentRev = dbCache.payload.jobs[idx].updatedAt
        ? new Date(dbCache.payload.jobs[idx].updatedAt).getTime()
        : 0;
      if (revision >= currentRev) {
        const nextJobs = [...dbCache.payload.jobs];
        nextJobs[idx] = formatted;
        dbCache.payload = { ...dbCache.payload, jobs: nextJobs };
      }
    } else {
      dbCache.payload = {
        ...dbCache.payload,
        jobs: [formatted, ...dbCache.payload.jobs],
      };
    }
    const maxJobUpdated = dbCache.payload.jobs.reduce((max: number, item: any) => {
      const t = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    const maxCustUpdated = (dbCache.payload.customers || []).reduce((max: number, c: any) => {
      const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    dbCache.etag = computeDeterministicEtag({
      jobsCount: dbCache.payload.jobs.length,
      maxJobUpdated,
      customersCount: dbCache.payload.customers?.length || 0,
      maxCustomerUpdated: maxCustUpdated,
      openShiftsCount: dbCache.payload.openShifts?.length || 0,
    });
  }

  return formatted;
}

const JOB_MICRO_CACHE_TTL_MS = 120000;

export function seedJobsIntoRevisionCache(formattedJobs: any[]) {
  if (!Array.isArray(formattedJobs)) return;
  const now = Date.now();
  for (const job of formattedJobs) {
    if (!job || !job.id) continue;
    const rev = job.updatedAt ? new Date(job.updatedAt).getTime() : now;
    const existing = dbCache.jobRevisionCache.get(job.id);
    if (!existing || rev >= existing.revision) {
      dbCache.jobRevisionCache.set(job.id, {
        revision: rev,
        job,
        cachedAt: now,
      });
    }
  }
}

/**
 * Singleflight + Revision-aware single job fetcher.
 * If 30 concurrent staff browsers request the same jobId after an SSE notification,
 * they share 1 in-flight Prisma query or hit the revision micro-cache in 0ms.
 */
export async function getOrFetchJobById(jobId: string, minRevision?: number): Promise<any | null> {
  if (!jobId) return null;
  const now = Date.now();
  const cached = dbCache.jobRevisionCache.get(jobId);
  if (
    cached &&
    now - cached.cachedAt < JOB_MICRO_CACHE_TTL_MS &&
    (!minRevision || cached.revision >= minRevision)
  ) {
    return cached.job;
  }

  // Also check dbCache.payload.jobs if loaded and its revision satisfies minRevision
  if (dbCache.payload && Array.isArray(dbCache.payload.jobs)) {
    const foundInPayload = dbCache.payload.jobs.find((j: any) => j.id === jobId);
    if (foundInPayload) {
      const payloadRev = foundInPayload.updatedAt
        ? new Date(foundInPayload.updatedAt).getTime()
        : 0;
      if (!minRevision || payloadRev >= minRevision) {
        dbCache.jobRevisionCache.set(jobId, {
          revision: payloadRev,
          job: foundInPayload,
          cachedAt: now,
        });
        return foundInPayload;
      }
    }
  }

  const inflightKey = `${jobId}:${minRevision || 0}`;
  const existingPromise = dbCache.inFlightJobFetches.get(inflightKey);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = prisma.job
    .findUnique({
      where: { id: jobId },
      select: JOB_SELECT_FIELDS,
    })
    .then((raw) => {
      if (!raw) return null;
      return primeJobCache(raw);
    })
    .finally(() => {
      dbCache.inFlightJobFetches.delete(inflightKey);
    });

  dbCache.inFlightJobFetches.set(inflightKey, fetchPromise);
  return fetchPromise;
}

export type CacheInvalidateScope = 'jobs' | 'customers' | 'master' | 'riders' | 'all';

export function invalidateDbCache(scope: CacheInvalidateScope = 'jobs') {
  dbCache.payload = null;
  dbCache.lastTime = 0;
  dbCache.version++;

  if (scope === 'customers' || scope === 'all') {
    dbCache.customers = null;
    dbCache.lastCustomersTime = 0;
  }
  if (scope === 'master' || scope === 'all') {
    dbCache.masterData = null;
    dbCache.lastMasterDataTime = 0;
  }
  if (scope === 'riders' || scope === 'all') {
    dbCache.riderEarnings = null;
    dbCache.lastRiderEarningsTime = 0;
  }
  dbCache.etag = null;
}
