import * as dbActions from '@/actions/db';
import { getServiceSKU, type Customer, type Job, type Rider, type ServiceItem, type PriceList, type PriceListItem, type ShopLocation } from './store';

const DB_KEY = 'that_laundry_shop_db';

// Simulate network delay
const delay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));

// Type for the entire database structure
interface Database {
  customers: Customer[];
  jobs: Job[];
  riders: Rider[];
  services: ServiceItem[];
  priceLists: PriceList[];
  shopLocations: ShopLocation[];
  pois: { id: string; name: string; address: string; coords: { lat: number; lng: number }; placeId?: string; closestShopId?: string; distanceKm?: number }[];
  settings: Record<string, string>;
}

// In-memory cache for fast sync reads, initialized lazily on client
let memoryDb: Database | null = null;
let isDbLoaded = false;
let lastEtag: string | null = null;
let inFlightDbPromise: Promise<void> | null = null;

export type DbChangeScope =
  | 'all'
  | 'jobs'
  | 'customers'
  | 'riders'
  | 'services'
  | 'priceLists'
  | 'shops'
  | 'settings'
  | 'pois';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'fallback_polling'
  | 'disconnected';

export type JobSaveStatus = 'saving' | 'saved' | 'failed' | 'conflict';

export interface JobSaveState {
  status: JobSaveStatus;
  message?: string;
  updatedAt: number;
}

export interface ExternalJobUpdateNotice {
  jobId: string;
  revision: number;
  updatedAt: string;
  action?: string;
  changedFields?: string[];
  actorId?: string | null;
  actorName?: string | null;
  receivedAt: number;
}

export interface RealtimeStateSnapshot {
  connectionStatus: ConnectionStatus;
  lastSyncAt: number | null;
  activeSavingCount: number;
  jobSaveStates: Record<string, JobSaveState>;
  externalJobUpdates: Record<string, ExternalJobUpdateNotice>;
}

// Track active in-flight saves per job, per-field pending edits, and pre-edit confirmed snapshots
const pendingJobSaves = new Map<string, number>();
const pendingFieldEdits = new Map<string, Set<string>>();
const confirmedJobSnapshots = new Map<string, Job>();
const lastSeenJobRevision = new Map<string, number>();
const inFlightClientJobFetches = new Map<string, Promise<Job | null>>();
let inFlightDeltaPromise: Promise<{ jobsUpdated: number; customersUpdated: number }> | null = null;
let lastServerSyncMs = 0;

export function getClientAuthUser(): {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  branchId?: string | null;
  sessionToken?: string;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('authUser');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const existingHeaders =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined);
  return fetch(input, {
    ...init,
    credentials: init?.credentials || 'same-origin',
    headers: getClientAuthHeaders(existingHeaders),
  });
}

export function getClientAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const user = getClientAuthUser();
  if (user?.sessionToken) {
    headers['Authorization'] = `Bearer ${user.sessionToken}`;
  }
  return headers;
}

// ─── Real-Time State & Listeners ────────────────────────────────────────────
type RealtimeListener = () => void;
const realtimeListeners = new Set<RealtimeListener>();

let realtimeState: RealtimeStateSnapshot = {
  connectionStatus: 'connecting',
  lastSyncAt: null,
  activeSavingCount: 0,
  jobSaveStates: {},
  externalJobUpdates: {},
};

function emitRealtimeChange() {
  realtimeState = {
    ...realtimeState,
    jobSaveStates: { ...realtimeState.jobSaveStates },
    externalJobUpdates: { ...realtimeState.externalJobUpdates },
  };
  realtimeListeners.forEach((l) => l());
}

export function subscribeRealtime(listener: RealtimeListener): () => void {
  realtimeListeners.add(listener);
  return () => {
    realtimeListeners.delete(listener);
  };
}

export function getRealtimeSnapshot(): RealtimeStateSnapshot {
  return realtimeState;
}

const saveStateCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function setJobSaveState(jobId: string, status: JobSaveStatus, message?: string) {
  const existingTimer = saveStateCleanupTimers.get(jobId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    saveStateCleanupTimers.delete(jobId);
  }

  realtimeState.jobSaveStates[jobId] = {
    status,
    message,
    updatedAt: Date.now(),
  };

  let savingCount = 0;
  for (const count of pendingJobSaves.values()) {
    if (count > 0) savingCount += count;
  }
  realtimeState.activeSavingCount = savingCount;
  emitRealtimeChange();

  if (status === 'saved') {
    const timer = setTimeout(() => {
      if (realtimeState.jobSaveStates[jobId]?.status === 'saved') {
        delete realtimeState.jobSaveStates[jobId];
        emitRealtimeChange();
      }
      saveStateCleanupTimers.delete(jobId);
    }, 3500);
    saveStateCleanupTimers.set(jobId, timer);
  }
}

export function clearExternalJobUpdate(jobId: string) {
  if (realtimeState.externalJobUpdates[jobId]) {
    delete realtimeState.externalJobUpdates[jobId];
    emitRealtimeChange();
  }
}

export function clearJobSaveState(jobId: string) {
  if (realtimeState.jobSaveStates[jobId]) {
    delete realtimeState.jobSaveStates[jobId];
    emitRealtimeChange();
  }
}

function setConnectionStatus(status: ConnectionStatus) {
  if (realtimeState.connectionStatus !== status) {
    realtimeState.connectionStatus = status;
    emitRealtimeChange();
  }
}

function isJobShopSettled(j?: { isShopPaid?: boolean; isPaid?: boolean; source?: string; type?: string } | null): boolean {
  if (!j) return false;
  const isPosJob = j.source === 'pos' || j.type === 'in_store';
  return Boolean(j.isShopPaid || (isPosJob && j.isPaid));
}

// Helper to normalize a server or Prisma job record into client Job structure
function normalizeServerJob(raw: any, existing?: Job): Job {
  const parsed = raw?.createdAt instanceof Date ? raw : JSON.parse(JSON.stringify(raw), dateReviver);
  const pickupCoords =
    parsed.pickupCoords ||
    (parsed.pickupLat !== undefined && parsed.pickupLng !== undefined
      ? { lat: Number(parsed.pickupLat) || 0, lng: Number(parsed.pickupLng) || 0 }
      : existing?.pickupCoords || { lat: 0, lng: 0 });
  const dropoffCoords =
    parsed.dropoffCoords ||
    (parsed.dropoffLat !== undefined && parsed.dropoffLng !== undefined
      ? { lat: Number(parsed.dropoffLat) || 0, lng: Number(parsed.dropoffLng) || 0 }
      : existing?.dropoffCoords || { lat: 0, lng: 0 });

  let items = parsed.items;
  if (!Array.isArray(items)) {
    if (typeof parsed.itemsJson === 'string' && parsed.itemsJson) {
      try {
        items = JSON.parse(parsed.itemsJson);
      } catch {
        items = existing?.items || [];
      }
    } else {
      items = existing?.items || [];
    }
  }

  let legs = parsed.legs;
  if (!legs) {
    if (typeof parsed.legsJson === 'string' && parsed.legsJson) {
      try {
        legs = JSON.parse(parsed.legsJson, dateReviver);
      } catch {
        legs = existing?.legs;
      }
    } else {
      legs = existing?.legs;
    }
  }

  let laundryTypes = parsed.laundryTypes;
  if (typeof laundryTypes === 'string') {
    try {
      laundryTypes = JSON.parse(laundryTypes);
    } catch {
      laundryTypes = existing?.laundryTypes;
    }
  }

  const merged: Job = {
    ...(existing || ({} as Job)),
    ...parsed,
    pickupCoords,
    dropoffCoords,
    items,
    legs,
    laundryTypes,
    isPaid: parsed.isPaid !== undefined ? Boolean(parsed.isPaid) : Boolean(existing?.isPaid),
    isShopPaid: parsed.isShopPaid !== undefined ? Boolean(parsed.isShopPaid) : Boolean(existing?.isShopPaid),
  };

  const jobId = merged.id || existing?.id || '';
  const hasPendingSave = Boolean(jobId && (pendingJobSaves.get(jobId) || 0) > 0);
  const dirtyFields = jobId ? pendingFieldEdits.get(jobId) : undefined;
  const incomingRev = parsed.updatedAt ? new Date(parsed.updatedAt).getTime() : 0;
  const existingRev = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

  // Preserve any unconfirmed dirty fields that are currently pending save/retry
  if (existing && dirtyFields && dirtyFields.size > 0) {
    for (const field of dirtyFields) {
      if (field in existing && (existing as any)[field] !== undefined) {
        (merged as any)[field] = (existing as any)[field];
      }
    }
  }

  if (existing?.billNo && (!merged.billNo || merged.billNo === '')) {
    const shouldProtectBillNo =
      hasPendingSave ||
      Boolean(dirtyFields?.has('billNo')) ||
      parsed.billNo === undefined ||
      (existingRev > 0 && incomingRev <= existingRev);
    if (shouldProtectBillNo) {
      merged.billNo = existing.billNo;
    }
  }
  if (
    existing?.billImageUrl &&
    existing.billImageUrl !== '[]' &&
    parsed.billImageUrl === undefined
  ) {
    merged.billImageUrl = existing.billImageUrl;
  }

  if (hasPendingSave) {
    (merged as any)._saveStatus = 'saving';
  } else if ((existing as any)?._saveStatus === 'failed' && dirtyFields && dirtyFields.size > 0) {
    (merged as any)._saveStatus = 'failed';
  }

  return merged;
}

// Callback registered by shiftStore to receive openShifts from poll — avoids circular import
let onOpenShiftsSyncCallback: ((shifts: any[]) => void) | null = null;
export function registerOpenShiftsSyncCallback(cb: (shifts: any[]) => void) {
  onOpenShiftsSyncCallback = cb;
}

async function performDbFetch(isInitial: boolean): Promise<void> {
  if (typeof window === 'undefined') return;

  const isTestEnv =
    typeof window !== 'undefined' &&
    (!!window.navigator.webdriver || !!(window as any).__playwright_test__);

  if (isInitial && !isDbLoaded && !isTestEnv) {
    try {
      const cache = await caches.open('tls-cache');
      const cachedRes = await cache.match('/api/db-cache');
      if (cachedRes) {
        const cached = await cachedRes.json();
        const parsed = JSON.parse(JSON.stringify(cached), dateReviver);
        memoryDb = parseMockDb(parsed);
        isDbLoaded = true;
        api.notify('all');
      }
    } catch (e) {
      console.error('Failed to load from Cache API', e);
    }
  }

  try {
    const headers = getClientAuthHeaders();
    if (lastEtag) headers['If-None-Match'] = lastEtag;
    const res = await fetch('/api/db', { headers });
    if (res.status === 304) {
      isDbLoaded = true;
      realtimeState.lastSyncAt = Date.now();
      return;
    }
    if (res.ok) {
      const etag = res.headers.get('ETag');
      if (etag) lastEtag = etag;
      const data = await res.json();

      if (isInitial && !isTestEnv) {
        try {
          const cache = await caches.open('tls-cache');
          await cache.put('/api/db-cache', new Response(JSON.stringify(data)));
        } catch (e) {
          console.error('Failed to save to Cache API', e);
        }
      }

      const parsed = JSON.parse(JSON.stringify(data), dateReviver);
      if (memoryDb && memoryDb.pois.length > 0) {
        parsed.pois = memoryDb.pois;
      }

      if (memoryDb && parsed.riders) {
        parsed.riders = parsed.riders.map((serverRider: any) => {
          const memRider = memoryDb!.riders.find((r) => r.id === serverRider.id);
          if (
            memRider &&
            memRider.currentLocation &&
            (serverRider.status === 'online' || serverRider.status === 'busy')
          ) {
            return { ...serverRider, currentLocation: memRider.currentLocation };
          }
          return serverRider;
        });
      }

      if (parsed.jobs && Array.isArray(parsed.jobs)) {
        for (const sj of parsed.jobs) {
          const rev = sj.updatedAt ? new Date(sj.updatedAt).getTime() : 0;
          if (rev > 0) {
            const prev = lastSeenJobRevision.get(sj.id) || 0;
            if (rev > prev) lastSeenJobRevision.set(sj.id, rev);
            if (rev > lastServerSyncMs) lastServerSyncMs = rev;
          }
        }
      }

      if (memoryDb && parsed.jobs) {
        parsed.jobs = parsed.jobs.map((serverJob: any) => {
          const memJob = memoryDb!.jobs.find((j) => j.id === serverJob.id);
          if (memJob) {
            const hasInFlightSave = (pendingJobSaves.get(serverJob.id) || 0) > 0;
            const hasDirtyEdits = (pendingFieldEdits.get(serverJob.id)?.size || 0) > 0;
            const isPaymentAdvance = isJobShopSettled(serverJob) && !isJobShopSettled(memJob);

            // If a save is in-flight or has unconfirmed draft edits, never let a refresh clobber pending fields.
            // Even when payment state advances on the server, normalizeServerJob preserves all dirty fields (including billNo).
            if ((hasInFlightSave || hasDirtyEdits) && !isPaymentAdvance) {
              return memJob;
            }

            return normalizeServerJob(serverJob, memJob);
          }
          return normalizeServerJob(serverJob);
        });

        const serverJobIds = new Set(parsed.jobs.map((j: any) => j.id));
        const extraMemJobs = memoryDb.jobs.filter((j) => {
          if (serverJobIds.has(j.id)) return false;
          if ((pendingJobSaves.get(j.id) || 0) > 0) return true;
          return j.status === 'completed' || j.status === 'cancel';
        });
        parsed.jobs = [...parsed.jobs, ...extraMemJobs];
      }

      memoryDb = parseMockDb(parsed);
      isDbLoaded = true;
      if (lastServerSyncMs === 0) lastServerSyncMs = Date.now();
      realtimeState.lastSyncAt = Date.now();
      api.notify('all');

      if (parsed.openShifts && onOpenShiftsSyncCallback) {
        onOpenShiftsSyncCallback(parsed.openShifts);
      }

      if (isInitial && (!memoryDb.pois || memoryDb.pois.length === 0)) {
        fetch('/api/pois', { headers: getClientAuthHeaders() })
          .then((r) => r.json())
          .then((poiData) => {
            if (memoryDb) {
              const parsedPois = JSON.parse(JSON.stringify(poiData), dateReviver);
              memoryDb.pois = parsedPois;
              api.notify('pois');
            }
          })
          .catch((err) => console.error('Failed to load POIs in background', err));
      }
    }
  } catch (error) {
    console.error('Failed to load/refresh DB from server', error);
  }
}

// Initialize the database from server (coalesced with refreshDb)
export const ensureDbLoaded = async () => {
  if (isDbLoaded) return;
  if (typeof window === 'undefined') return;
  if (!inFlightDbPromise) {
    inFlightDbPromise = performDbFetch(true).finally(() => {
      inFlightDbPromise = null;
    });
  }
  return inFlightDbPromise;
};

export const refreshDb = async () => {
  if (typeof window === 'undefined') return;
  if (!inFlightDbPromise) {
    inFlightDbPromise = performDbFetch(!isDbLoaded).finally(() => {
      inFlightDbPromise = null;
    });
  }
  return inFlightDbPromise;
};

// ─── Client SSE & Delta Reconciliation Engine ───────────────────────────────
let eventSourceInstance: EventSource | null = null;
let eventSourceUserId: string | null = null;
let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFallbackPolls = 0;
const seenSseEventIds = new Set<string>();

function startFallbackPolling() {
  if (fallbackPollTimer) return;
  consecutiveFallbackPolls = 0;
  fallbackPollTimer = setInterval(async () => {
    consecutiveFallbackPolls++;
    if (consecutiveFallbackPolls >= 2 && realtimeState.connectionStatus !== 'connected') {
      setConnectionStatus(navigator.onLine === false ? 'disconnected' : 'fallback_polling');
    }
    try {
      await api.reconcileDelta();
      if (
        !eventSourceInstance ||
        eventSourceInstance.readyState === EventSource.CLOSED ||
        consecutiveFallbackPolls % 3 === 0
      ) {
        startRealtimeConnection(true);
      }
    } catch {
      if (navigator.onLine === false) {
        setConnectionStatus('disconnected');
      }
    }
  }, 3000);
}

function stopFallbackPolling() {
  if (fallbackPollTimer) {
    clearInterval(fallbackPollTimer);
    fallbackPollTimer = null;
  }
  consecutiveFallbackPolls = 0;
}

export function startRealtimeConnection(forceReconnect = false) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

  const authUser = getClientAuthUser();
  const currentUid = authUser?.id || null;

  if (
    !forceReconnect &&
    eventSourceInstance &&
    eventSourceInstance.readyState !== EventSource.CLOSED &&
    eventSourceUserId === currentUid
  ) {
    return;
  }

  if (eventSourceInstance) {
    try {
      eventSourceInstance.close();
    } catch {}
    eventSourceInstance = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  eventSourceUserId = currentUid;
  const params = new URLSearchParams();
  if (lastServerSyncMs > 0) params.set('since', String(lastServerSyncMs - 2000));

  const streamUrl = `/api/events/stream${params.toString() ? `?${params.toString()}` : ''}`;
  setConnectionStatus(realtimeState.lastSyncAt ? 'reconnecting' : 'connecting');

  try {
    const es = new EventSource(streamUrl, { withCredentials: true });
    eventSourceInstance = es;

    es.onopen = () => {
      const wasReconnecting =
        realtimeState.connectionStatus === 'reconnecting' ||
        realtimeState.connectionStatus === 'fallback_polling' ||
        realtimeState.connectionStatus === 'disconnected';
      setConnectionStatus('connected');
      stopFallbackPolling();
      if (wasReconnecting) {
        // Reconcile any missed updates immediately upon reconnection
        api.reconcileDelta().catch(() => {});
      }
    };

    es.addEventListener('connected', () => {
      setConnectionStatus('connected');
      stopFallbackPolling();
    });

    es.addEventListener('order-update', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (!payload || !payload.jobId) return;

        if (payload.eventId) {
          if (seenSseEventIds.has(payload.eventId)) return;
          seenSseEventIds.add(payload.eventId);
          if (seenSseEventIds.size > 600) {
            const first = seenSseEventIds.values().next().value;
            if (first) seenSseEventIds.delete(first);
          }
        }

        if (payload.type === 'customer.updated') {
          api.reconcileDelta().catch(() => {});
          return;
        }

        const currentUser = getClientAuthUser();
        const isFromSelf = Boolean(
          currentUser?.id && payload.actorId && String(currentUser.id) === String(payload.actorId)
        );
        const incomingRev = Number(payload.revision) || 0;
        const knownRev = lastSeenJobRevision.get(payload.jobId) || 0;

        // Record external update notification if modified by another user or webhook
        if (!isFromSelf && payload.jobId !== '__CUSTOMER__') {
          realtimeState.externalJobUpdates[payload.jobId] = {
            jobId: payload.jobId,
            revision: incomingRev || Date.now(),
            updatedAt: payload.updatedAt || new Date().toISOString(),
            action: payload.action,
            changedFields: payload.changedFields,
            actorId: payload.actorId,
            actorName: payload.actorName,
            receivedAt: Date.now(),
          };
          emitRealtimeChange();
        }

        // If we already have this exact or newer revision in memory (e.g. from our own awaited save), skip redundant fetch
        if (incomingRev > 0 && knownRev >= incomingRev && isFromSelf) {
          return;
        }

        api.fetchAndApplyJob(payload.jobId, incomingRev || undefined).catch((err) => {
          console.warn('[SSE] Failed to fetch single job, falling back to delta:', err);
          api.reconcileDelta().catch(() => {});
        });
      } catch (err) {
        console.error('[SSE] Failed to handle order-update event:', err);
      }
    });

    es.onerror = () => {
      setConnectionStatus(navigator.onLine === false ? 'disconnected' : 'reconnecting');
      startFallbackPolling();
      if (es.readyState === EventSource.CLOSED) {
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startRealtimeConnection(true);
          }, 2500);
        }
      }
    };
  } catch (err) {
    console.error('[SSE] Failed to initialize EventSource:', err);
    setConnectionStatus('fallback_polling');
    startFallbackPolling();
  }
}

// Start loading the DB and real-time stream immediately if we're on the client
if (typeof window !== 'undefined') {
  setTimeout(() => {
    const path = window.location.pathname;
    if (path === '/' || path.startsWith('/login')) return;
    if (!getClientAuthUser()) return;
    ensureDbLoaded();
  }, 0);
  setTimeout(() => {
    const path = window.location.pathname;
    if (path === '/' || path.startsWith('/login')) return;
    if (!getClientAuthUser()) return;
    startRealtimeConnection(false);
  }, 0);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      api.reconcileDelta().catch(() => {});
      if (!eventSourceInstance || eventSourceInstance.readyState === EventSource.CLOSED) {
        startRealtimeConnection(true);
      }
    }
  });

  window.addEventListener('online', () => {
    startRealtimeConnection(true);
    api.reconcileDelta().catch(() => {});
  });

  window.addEventListener('offline', () => {
    setConnectionStatus('disconnected');
  });
}

const emptyDb: Database = {
  customers: [],
  jobs: [],
  riders: [],
  services: [],
  priceLists: [],
  shopLocations: [],
  pois: [],
  settings: {},
};

let fallbackDb: Database | null = null;
const initDb = (): Database => {
  if (!memoryDb) {
    // Return a stable reference to empty db as a fallback until the server data loads
    // This fixes the "getServerSnapshot should be cached" SSR infinite loop warning
    if (!fallbackDb) fallbackDb = parseMockDb(emptyDb);
    return fallbackDb;
  }
  return memoryDb;
};

// JSON Reviver to convert ISO string dates back to Date objects
const dateReviver = (key: string, value: unknown) => {
  const isDateKey = key.includes('At') || key === 'date';
  if (typeof value === 'string' && isDateKey && !isNaN(Date.parse(value))) {
    return new Date(value);
  }
  return value;
};

// Parse initial db and ensure required database array fields without redundant stringify
const parseMockDb = (data: unknown): Database => {
  if (!data) return emptyDb;
  const db = (typeof data === 'object' ? data : JSON.parse(String(data), dateReviver)) as Database;
  if (!db.priceLists) db.priceLists = [];
  if (!db.shopLocations) db.shopLocations = [];
  if (!db.customers) db.customers = [];
  if (!db.jobs) db.jobs = [];
  if (!db.riders) db.riders = [];
  if (!db.services) db.services = [];
  if (!db.settings) db.settings = {};
  if (!db.pois) db.pois = [];
  return db;
};

type DbChangeListener = (scope: DbChangeScope) => void;
const dbChangeListeners = new Set<DbChangeListener>();

// --- API METHODS ---

export const api = {
  subscribe(listener: DbChangeListener) {
    dbChangeListeners.add(listener);
    return () => {
      dbChangeListeners.delete(listener);
    };
  },
  notify(scope: DbChangeScope = 'all') {
    dbChangeListeners.forEach((l) => l(scope));
  },

  /**
   * Applies a single authoritative server job into memoryDb with monotonic revision ordering.
   */
  applyServerJob(rawJob: any, revisionMs?: number): { changed: boolean; job: Job } {
    const db = initDb();
    const existingIdx = db.jobs.findIndex((j) => j.id === rawJob.id);
    const existingJob = existingIdx >= 0 ? db.jobs[existingIdx] : undefined;

    const incomingRev =
      revisionMs ||
      (rawJob.updatedAt ? new Date(rawJob.updatedAt).getTime() : Date.now());
    const prevRev = lastSeenJobRevision.get(rawJob.id) || 0;

    // Ignore out-of-order older events unless Shop Paid settlement state advanced
    const isPaymentAdvance =
      Boolean(existingJob && isJobShopSettled(rawJob) && !isJobShopSettled(existingJob));

    if (prevRev > 0 && incomingRev < prevRev && !isPaymentAdvance) {
      return { changed: false, job: existingJob || normalizeServerJob(rawJob) };
    }

    // Do not clobber an active in-flight save or dirty edits unless Shop Paid state advanced
    const hasDirtyEdits = (pendingFieldEdits.get(rawJob.id)?.size || 0) > 0;
    if (((pendingJobSaves.get(rawJob.id) || 0) > 0 || hasDirtyEdits) && !isPaymentAdvance) {
      return { changed: false, job: existingJob || normalizeServerJob(rawJob) };
    }

    if (incomingRev > prevRev) {
      lastSeenJobRevision.set(rawJob.id, incomingRev);
    }
    if (incomingRev > lastServerSyncMs) {
      lastServerSyncMs = incomingRev;
    }

    const normalized = normalizeServerJob(rawJob, existingJob);
    if (!(normalized as any)._saveStatus) {
      (normalized as any)._saveStatus = 'saved';
    }

    if (!memoryDb) {
      memoryDb = db;
    }
    if (existingIdx >= 0) {
      const nextJobs = [...memoryDb.jobs];
      nextJobs[existingIdx] = normalized;
      memoryDb.jobs = nextJobs;
    } else {
      memoryDb.jobs = [normalized, ...memoryDb.jobs];
    }
    realtimeState.lastSyncAt = Date.now();
    api.notify('jobs');

    return { changed: true, job: normalized };
  },

  /**
   * Fetches a single job by ID from `/api/jobs/[id]` (coalesced on client + server) and updates memoryDb.
   */
  async fetchAndApplyJob(jobId: string, revisionMs?: number): Promise<Job | null> {
    if (typeof window === 'undefined' || !jobId || jobId === '__CUSTOMER__') return null;

    const flightKey = `${jobId}:${revisionMs || 0}`;
    const existingFlight = inFlightClientJobFetches.get(flightKey);
    if (existingFlight) return existingFlight;

    const promise = (async (): Promise<Job | null> => {
      try {
        const url = `/api/jobs/${encodeURIComponent(jobId)}${
          revisionMs ? `?rev=${encodeURIComponent(String(revisionMs))}` : ''
        }`;
        const res = await fetch(url, { headers: getClientAuthHeaders() });
        if (res.status === 403 || res.status === 404) {
          // If job moved out of user's authorized branch/rider scope, remove from local view
          if (res.status === 403 && memoryDb) {
            const beforeLen = memoryDb.jobs.length;
            memoryDb.jobs = memoryDb.jobs.filter((j) => j.id !== jobId);
            if (memoryDb.jobs.length !== beforeLen) {
              api.notify('jobs');
            }
          }
          return null;
        }
        if (!res.ok) return null;
        const data = await res.json();
        const { job } = api.applyServerJob(data, revisionMs);
        return job;
      } catch (err) {
        console.error(`[api.fetchAndApplyJob] Failed for ${jobId}:`, err);
        return null;
      } finally {
        inFlightClientJobFetches.delete(flightKey);
      }
    })();

    inFlightClientJobFetches.set(flightKey, promise);
    return promise;
  },

  /**
   * Reconciles local memoryDb against `/api/jobs/delta?since=...` after reconnect, tab focus, or fallback poll.
   */
  async reconcileDelta(sinceMs?: number): Promise<{ jobsUpdated: number; customersUpdated: number }> {
    if (typeof window === 'undefined') return { jobsUpdated: 0, customersUpdated: 0 };
    if (!memoryDb) {
      await ensureDbLoaded();
      return { jobsUpdated: 0, customersUpdated: 0 };
    }
    if (inFlightDeltaPromise) return inFlightDeltaPromise;

    inFlightDeltaPromise = (async () => {
      try {
        const baseSince =
          sinceMs ?? (lastServerSyncMs > 0 ? Math.max(0, lastServerSyncMs - 3000) : Date.now() - 60_000);
        let totalJobsUpdated = 0;
        let totalCustomersUpdated = 0;
        let hasMoreJobs = true;
        let hasMoreCustomers = true;
        let jobCursor: { updatedAt: number; id: string } | null = null;
        let custCursor: { updatedAt: number; id: string } | null = null;
        let pageCount = 0;
        let highestServerTime = lastServerSyncMs;
        let completedCleanly = false;

        // Multi-page delta recovery loop using stable composite cursors (updatedAt, id)
        // Paginates jobs and customers independently and only advances the checkpoint when BOTH complete
        while ((hasMoreJobs || hasMoreCustomers) && pageCount < 50) {
          pageCount++;
          const qs = new URLSearchParams();
          qs.set('since', String(baseSince));
          qs.set('limit', '250');
          qs.set('custLimit', '100');

          if (!hasMoreJobs) {
            qs.set('skipJobs', '1');
          } else if (jobCursor) {
            qs.set('cursorUpdatedAt', String(jobCursor.updatedAt));
            qs.set('cursorId', jobCursor.id);
          }

          if (!hasMoreCustomers) {
            qs.set('skipCustomers', '1');
          } else if (custCursor) {
            qs.set('custCursorUpdatedAt', String(custCursor.updatedAt));
            qs.set('custCursorId', custCursor.id);
          }

          const res = await fetch(`/api/jobs/delta?${qs.toString()}`, {
          headers: getClientAuthHeaders(),
        });
          if (!res.ok) {
            completedCleanly = false;
            break;
          }

        const data = await res.json();
          let pageJobsUpdated = 0;
          let pageCustomersUpdated = 0;

          // 1. Order merging strictly by record ID (Map-based, preserving existing order)
        if (Array.isArray(data.jobs) && data.jobs.length > 0 && memoryDb) {
            const jobMap = new Map<string, Job>();
            for (const j of memoryDb.jobs) {
              jobMap.set(j.id, j);
            }

          for (const rawJob of data.jobs) {
            const incomingRev = rawJob.updatedAt ? new Date(rawJob.updatedAt).getTime() : Date.now();
            const prevRev = lastSeenJobRevision.get(rawJob.id) || 0;
              const existingJob = jobMap.get(rawJob.id);

            const isPaymentAdvance =
              Boolean(existingJob && isJobShopSettled(rawJob) && !isJobShopSettled(existingJob));
            const hasDirtyEdits = (pendingFieldEdits.get(rawJob.id)?.size || 0) > 0;

            if (((pendingJobSaves.get(rawJob.id) || 0) > 0 || hasDirtyEdits) && !isPaymentAdvance) {
              continue;
            }
            if (prevRev > 0 && incomingRev < prevRev && !isPaymentAdvance) {
              continue;
            }

            if (incomingRev > prevRev) lastSeenJobRevision.set(rawJob.id, incomingRev);
            const normalized = normalizeServerJob(rawJob, existingJob);
            if (!(normalized as any)._saveStatus) {
              (normalized as any)._saveStatus = 'saved';
            }

              jobMap.set(normalized.id, normalized);
              pageJobsUpdated++;
          }

            if (pageJobsUpdated > 0) {
              memoryDb.jobs = Array.from(jobMap.values());
              totalJobsUpdated += pageJobsUpdated;
          }
        }

          // 1b. For Rider clients: prune any active job in memory that was reassigned away from this rider
          if (Array.isArray(data.activeRiderJobIds) && memoryDb) {
            const currentUser = getClientAuthUser();
            const riderId = currentUser?.id;
            if (riderId && (currentUser?.role || '').toLowerCase() === 'rider') {
              const activeSet = new Set<string>(data.activeRiderJobIds);
              const beforeLen = memoryDb.jobs.length;
              memoryDb.jobs = memoryDb.jobs.filter((j) => {
                if (j.status === 'completed' || j.status === 'cancel') return true;
                if ((pendingJobSaves.get(j.id) || 0) > 0) return true;
                const isAssignedLocally =
                  j.pickupRiderId === riderId ||
                  j.deliveryRiderId === riderId ||
                  j.riderId === riderId;
                if (isAssignedLocally && !activeSet.has(j.id)) {
                  return false;
                }
                return true;
              });
              if (memoryDb.jobs.length !== beforeLen) {
                totalJobsUpdated += beforeLen - memoryDb.jobs.length;
              }
            }
          }

          // 2. Customer merging strictly by record ID
        if (Array.isArray(data.customers) && data.customers.length > 0 && memoryDb) {
          const parsedCustomers = JSON.parse(JSON.stringify(data.customers), dateReviver) as Customer[];
            const custMap = new Map<string, Customer>();
            for (const c of memoryDb.customers) {
              custMap.set(c.id, c);
            }

          for (const sc of parsedCustomers) {
              const existing = custMap.get(sc.id);
              if (existing) {
                custMap.set(sc.id, { ...existing, ...sc });
            } else {
                custMap.set(sc.id, sc);
            }
              pageCustomersUpdated++;
          }

            if (pageCustomersUpdated > 0) {
              memoryDb.customers = Array.from(custMap.values());
              totalCustomersUpdated += pageCustomersUpdated;
          }
        }

          if (typeof data.serverTime === 'number' && data.serverTime > highestServerTime) {
            highestServerTime = data.serverTime;
        }

        if (data.openShifts && onOpenShiftsSyncCallback) {
          onOpenShiftsSyncCallback(data.openShifts);
        }

          const nextHasMoreJobs =
            data.hasMoreJobs !== undefined ? Boolean(data.hasMoreJobs) : Boolean(data.hasMore && Array.isArray(data.jobs) && data.jobs.length > 0);
          const nextHasMoreCustomers =
            data.hasMoreCustomers !== undefined ? Boolean(data.hasMoreCustomers) : false;

          if (nextHasMoreJobs) {
            if (data.nextJobCursor && data.nextJobCursor.id) {
              jobCursor = {
                updatedAt: Number(data.nextJobCursor.updatedAt) || baseSince,
                id: String(data.nextJobCursor.id),
              };
            } else if (Array.isArray(data.jobs) && data.jobs.length > 0) {
              const lastJ = data.jobs[data.jobs.length - 1];
              jobCursor = {
                updatedAt: lastJ.updatedAt ? new Date(lastJ.updatedAt).getTime() : baseSince,
                id: String(lastJ.id),
              };
            } else {
              hasMoreJobs = false;
            }
          }
          hasMoreJobs = nextHasMoreJobs && Boolean(jobCursor);

          if (nextHasMoreCustomers) {
            if (data.nextCustomerCursor && data.nextCustomerCursor.id) {
              custCursor = {
                updatedAt: Number(data.nextCustomerCursor.updatedAt) || baseSince,
                id: String(data.nextCustomerCursor.id),
              };
            } else if (Array.isArray(data.customers) && data.customers.length > 0) {
              const lastC = data.customers[data.customers.length - 1];
              custCursor = {
                updatedAt: lastC.updatedAt ? new Date(lastC.updatedAt).getTime() : baseSince,
                id: String(lastC.id),
              };
            } else {
              hasMoreCustomers = false;
            }
          }
          hasMoreCustomers = nextHasMoreCustomers && Boolean(custCursor);

          if (!hasMoreJobs && !hasMoreCustomers) {
            completedCleanly = true;
            break;
          }
        }

        // Do NOT advance synchronization checkpoint if recovery stopped before completion
        if (completedCleanly) {
          if (highestServerTime > lastServerSyncMs) {
            lastServerSyncMs = highestServerTime;
          }
          realtimeState.lastSyncAt = Date.now();
        }

        if (totalJobsUpdated > 0) api.notify('jobs');
        if (totalCustomersUpdated > 0) api.notify('customers');

        return { jobsUpdated: totalJobsUpdated, customersUpdated: totalCustomersUpdated };
      } catch (err) {
        console.error('[api.reconcileDelta] Error:', err);
        return { jobsUpdated: 0, customersUpdated: 0 };
      } finally {
        inFlightDeltaPromise = null;
      }
    })();

    return inFlightDeltaPromise;
  },

  /**
   * Targeted server-side search for jobs (merges results into memoryDb so opening any result works immediately).
   */
  async searchJobs(params: {
    q?: string;
    status?: string;
    branchId?: string;
    brand?: string;
    isPaid?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: Job[]; total: number; hasMore: boolean }> {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.branchId) qs.set('branchId', params.branchId);
    if (params.brand) qs.set('brand', params.brand);
    if (params.isPaid !== undefined) qs.set('isPaid', String(params.isPaid));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));

    const res = await fetch(`/api/jobs/search?${qs.toString()}`, {
      headers: getClientAuthHeaders(),
    });
    if (!res.ok) {
      return { jobs: [], total: 0, hasMore: false };
    }
    const data = await res.json();
    const jobs = (Array.isArray(data.jobs) ? data.jobs : []).map((raw: any) =>
      normalizeServerJob(raw)
    );

    if (memoryDb && jobs.length > 0) {
      const existingIds = new Set(memoryDb.jobs.map((j) => j.id));
      const newJobs = jobs.filter((j: Job) => !existingIds.has(j.id));
      if (newJobs.length > 0) {
        memoryDb.jobs = [...memoryDb.jobs, ...newJobs];
        api.notify('jobs');
      }
    }

    return {
      jobs,
      total: Number(data.total) || jobs.length,
      hasMore: Boolean(data.hasMore),
    };
  },

  // --- CUSTOMERS ---
  async getCustomers(): Promise<Customer[]> {
    return initDb().customers;
  },

  async fetchHistoricalJobs(startDate: Date, endDate: Date, riderId?: string) {
    if (typeof window === 'undefined' || !memoryDb) return [];
    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn('Invalid start/end date passed to fetchHistoricalJobs', startDate, endDate);
      return [];
    }
    try {
      let url = `/api/jobs/history?start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
      if (riderId) {
        url += `&riderId=${encodeURIComponent(riderId)}`;
      }
      const res = await fetch(url, { headers: getClientAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const parsedJobs = JSON.parse(JSON.stringify(data), dateReviver) as Job[];

        const existingIds = new Set(memoryDb.jobs.map((j) => j.id));
        const historyMap = new Map(parsedJobs.map((j) => [j.id, j]));

        const updatedJobs = memoryDb.jobs.map((j) => {
          if (historyMap.has(j.id)) {
            return { ...j, ...historyMap.get(j.id)! };
          }
          return j;
        });

        const newJobs = parsedJobs.filter((j) => !existingIds.has(j.id));

        memoryDb.jobs = [...updatedJobs, ...newJobs];
        api.notify('jobs');
        return parsedJobs;
      }
    } catch (error) {
      console.error('Failed to fetch historical jobs', error);
    }
    return [];
  },
  
  async addCustomer(customer: Omit<Customer, 'id'> & Record<string, any>): Promise<Customer> {
    const db = initDb();
    // Let PostgreSQL generate the UUID; do NOT pass a pre-generated id
    const res = await dbActions.addCustomerAction(customer);
    if (res && typeof res === 'object' && 'success' in res) {
      if (!res.success) {
        throw new Error((res as any).error || "เกิดข้อผิดพลาดในการสร้างลูกค้าใหม่");
      }
    }
    const savedCustomer = (res && typeof res === 'object' && 'customer' in res) ? (res as any).customer : res;
    const newCustomer: Customer = {
      ...customer,
      id: savedCustomer.id,
      name: savedCustomer.name,
      memberId: savedCustomer.memberId,
      tier: (savedCustomer.tier as any) || customer.tier,
      isCorporate: savedCustomer.isCorporate ?? customer.isCorporate,
      branchId: savedCustomer.branchId ?? customer.branchId,
    };
    db.customers = [newCustomer, ...db.customers];
    return newCustomer;
  },

  async updateCustomer(id: string, updates: Partial<Customer> & Record<string, any>): Promise<Customer> {
    const db = initDb();
    const currentCustomer = db.customers.find(c => c.id === id);
    if (!currentCustomer) throw new Error("Customer not found");

    const res = await dbActions.updateCustomerAction(id, updates);
    if (res && typeof res === 'object' && 'success' in res) {
      if (!res.success) {
        const err: any = new Error((res as any).error || "เกิดข้อผิดพลาดในการบันทึกข้อมูลลูกค้า");
        if ((res as any).isConflict) {
          err.isConflict = true;
          err.conflictFields = (res as any).conflictFields || [];
        }
        if ((res as any).latestCustomer) {
          const latest = (res as any).latestCustomer;
          let syncedLatest: Customer | null = null;
          db.customers = db.customers.map(c => {
            if (c.id === id) {
              const merged: Customer = {
                ...c,
                ...latest,
                defaultCoords:
                  latest.defaultLat != null && latest.defaultLng != null
                    ? { lat: latest.defaultLat, lng: latest.defaultLng }
                    : c.defaultCoords,
              };
              syncedLatest = merged;
              return merged;
            }
            return c;
          });
          err.latestCustomer = syncedLatest || latest;
          api.notify('customers');
        }
        throw err;
      }
    }
    const savedCustomer = (res && typeof res === 'object' && 'customer' in res) ? (res as any).customer : res;

    let updatedCustomer: Customer | null = null;
    db.customers = db.customers.map(c => {
      if (c.id === id) {
        const u: Customer = { 
          ...c, 
          ...updates,
          ...savedCustomer,
          defaultCoords:
            savedCustomer?.defaultLat != null && savedCustomer?.defaultLng != null
              ? { lat: savedCustomer.defaultLat, lng: savedCustomer.defaultLng }
              : updates.defaultCoords ?? c.defaultCoords,
          tier: (savedCustomer.tier as any) || updates.tier || c.tier,
          corporateCommissionType: (savedCustomer as any).corporateCommissionType ?? updates.corporateCommissionType ?? c.corporateCommissionType,
          corporatePickupCommission: (savedCustomer as any).corporatePickupCommission ?? updates.corporatePickupCommission ?? c.corporatePickupCommission,
          corporateDeliveryCommission: (savedCustomer as any).corporateDeliveryCommission ?? updates.corporateDeliveryCommission ?? c.corporateDeliveryCommission,
          corporateCommissionRatePerKm: (savedCustomer as any).corporateCommissionRatePerKm ?? updates.corporateCommissionRatePerKm ?? c.corporateCommissionRatePerKm,
          memberStartDate: savedCustomer.memberStartDate,
          memberExpiryDate: savedCustomer.memberExpiryDate,
          priceListId: savedCustomer.priceListId || c.priceListId,
          branchId: savedCustomer.branchId ?? updates.branchId ?? c.branchId,
          updatedAt: savedCustomer.updatedAt,
        };
        updatedCustomer = u;
        return u;
      }
      return c;
    });
    if (!updatedCustomer) throw new Error("Customer not found");
    return updatedCustomer;
  },

  optimisticUpdateCustomer(id: string, updates: Partial<Customer>) {
    const db = initDb();
    db.customers = db.customers.map(c => {
      if (c.id === id) {
        return { ...c, ...updates, updatedAt: new Date() };
      }
      return c;
    });
  },

  async topUpCustomer(data: Parameters<typeof dbActions.processTopUpAction>[0]) {
    const result = await dbActions.processTopUpAction(data);
    if (result.updatedCustomer) {
      const db = initDb();
      const saved = result.updatedCustomer;
      db.customers = db.customers.map(c => {
        if (c.id === data.customerId) {
          return {
            ...c,
            creditBalance: saved.creditBalance,
            isMember: saved.isMember,
            memberStartDate: saved.memberStartDate,
            memberExpiryDate: saved.memberExpiryDate,
            priceListId: saved.priceListId || c.priceListId,
            updatedAt: saved.updatedAt,
          };
        }
        return c;
      });
    }
    return result;
  },

  async deleteCustomer(id: string, actor?: { id?: string; name?: string }): Promise<void> {
    const db = initDb();
    db.customers = db.customers.filter(c => c.id !== id);
    await dbActions.deleteCustomerAction(id, actor?.id, actor?.name);
  },

  async mergeCustomer(
    primaryId: string,
    duplicateId: string,
    actor?: { id?: string; name?: string; role?: string }
  ) {
    const res = await dbActions.mergeCustomerAction({
      primaryCustomerId: primaryId,
      duplicateCustomerId: duplicateId,
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
    });
    if (res.success) {
      const db = initDb();
      db.customers = db.customers.filter(c => c.id !== duplicateId);
      if (res.updatedCustomer) {
        const idx = db.customers.findIndex(c => c.id === primaryId);
        if (idx >= 0) db.customers[idx] = res.updatedCustomer;
        else db.customers.push(res.updatedCustomer);
      }
      db.jobs.forEach(j => {
        if (j.customerId === duplicateId) {
          j.customerId = primaryId;
        }
      });
    }
    return res;
  },

  async batchMergeObviousDuplicates(actor?: { id?: string; name?: string; role?: string }) {
    const res = await dbActions.batchMergeObviousDuplicatesAction({
      actorId: actor?.id,
      actorName: actor?.name,
      actorRole: actor?.role,
    });
    if (res.success && res.mergedCount > 0) {
      await refreshDb();
    }
    return res;
  },

  // --- JOBS ---
  async getJobs(): Promise<Job[]> {
    
    return initDb().jobs;
  },

  async addJob(jobDetails: Partial<Job> & Record<string, unknown>): Promise<Job> {
     // Simulate network
    const db = initDb();
    
    // Copy the exact logic from store.ts for creating a new job
    const pDate = jobDetails.pickupScheduledAt || jobDetails.scheduledAt || new Date();
    const dDate = jobDetails.deliveryScheduledAt || new Date(pDate.getTime() + 86400000); // +1 day default
    const pRider = jobDetails.pickupRiderId;
    const dRider = jobDetails.deliveryRiderId;

    const isPOS = (jobDetails.source || jobDetails.source) === "pos";
    // CSO creates as TBA (hidden from Manager). All other roles create as Pending.
    // If a rider is already assigned during creation, always initialize as Pending.
    const creatorRole = (jobDetails as any).creatorRole;
    const creatorPermissions = (jobDetails as any).creatorPermissions;
    const isCsoCreator = creatorRole === 'cso' || (Array.isArray(creatorPermissions) && creatorPermissions.includes('cso'));
    const initialStatus = jobDetails.status || (
      jobDetails.type === "delivery" ? "billing" : (
        isPOS ? "billing" : (
          (isCsoCreator && !jobDetails.pickupRiderId && !jobDetails.deliveryRiderId)
            ? 'tba'
            : 'pending'
        )
      )
    );
    const legStatus = (leg: "pickup" | "delivery") => {
      if (isPOS && leg === "pickup" && initialStatus !== "pending") return "completed";
      return "pending";
    };

    const newJob: Job = {
      id: `JOB-${String(db.jobs.length + 1).padStart(3, "0")}`,
      type: jobDetails.type as any || "full_service",
      customerId: jobDetails.customerId,
      customerName: jobDetails.customerName,
      customerPhone: jobDetails.customerPhone,
      pickupLocation: jobDetails.pickupLocation || "",
      dropoffLocation: jobDetails.dropoffLocation || "",
      pickupCoords: jobDetails.pickupCoords || { lat: 0, lng: 0 },
      dropoffCoords: jobDetails.dropoffCoords || { lat: 0, lng: 0 },
      distance: jobDetails.distance || 0,
      fee: jobDetails.fee || 0,
      status: initialStatus,
      subStatus: jobDetails.subStatus as any,
      createdAt: new Date(),
      scheduledAt: pDate,
      pickupRiderId: pRider,
      deliveryRiderId: dRider,
      pickupScheduledAt: pDate,
      pickupScheduledEndAt: jobDetails.pickupScheduledEndAt as Date | undefined,
      deliveryScheduledAt: dDate,
      deliveryScheduledEndAt: jobDetails.deliveryScheduledEndAt as Date | undefined,
      bagImageUrl: jobDetails.bagImageUrl,
      billImageUrl: jobDetails.billImageUrl as string | undefined,
      serviceType: jobDetails.serviceType || "wash_fold",
      laundryTypes: jobDetails.laundryTypes as string[] | undefined,
      source: jobDetails.source || "app",
      totalAmount: jobDetails.totalAmount || ((jobDetails.fee || 0) * 2.5),
      discount: jobDetails.discount || 0,
      discountPercent: jobDetails.discountPercent || 0,
      paymentMethod: jobDetails.paymentMethod as any,
      isPaid: jobDetails.isPaid as boolean | false,
      isShopPaid: jobDetails.isShopPaid as boolean | false,
      shopPaidAt: jobDetails.shopPaidAt as Date | undefined,
      csoPaidAt: jobDetails.csoPaidAt as Date | undefined,
      pickupDistance: jobDetails.pickupDistance,
      deliveryDistance: jobDetails.deliveryDistance,
      pickupCommission: jobDetails.pickupCommission,
      deliveryCommission: jobDetails.deliveryCommission,
      items: jobDetails.items || [],
      riderId: pRider,
      remark: jobDetails.remark as string,
      adminNotesJson: jobDetails.adminNotesJson as string,
      branchId: jobDetails.branchId as string,
      paymentChannel: jobDetails.paymentChannel as string,
      createdBy: jobDetails.createdBy as string | null || null,
      cashPlaced: jobDetails.cashPlaced as boolean || false,
      shiftId: jobDetails.shiftId as string | null || null,
      walletBalanceAfter: jobDetails.walletBalanceAfter as number | null || null,
      legs: {
        pickupOutbound: { scheduledAt: pDate, status: legStatus("pickup"), riderId: pRider, completedAt: (isPOS && initialStatus !== "pending") ? new Date() : undefined },
        pickupInbound: { scheduledAt: pDate, status: legStatus("pickup"), riderId: pRider, completedAt: (isPOS && initialStatus !== "pending") ? new Date() : undefined },
        deliveryOutbound: { scheduledAt: dDate, status: legStatus("delivery"), riderId: dRider },
        deliveryInbound: { scheduledAt: dDate, status: legStatus("delivery"), riderId: dRider },
      }
    };

    const savedJobInDb = await dbActions.addJobAction({
      ...newJob,
      actorId: jobDetails.actorId,
      actorName: jobDetails.actorName,
    });

    const finalJob = normalizeServerJob(savedJobInDb, { ...newJob, id: savedJobInDb.id });
    (finalJob as any)._saveStatus = 'saved';

    const rev = finalJob.updatedAt ? new Date(finalJob.updatedAt).getTime() : Date.now();
    lastSeenJobRevision.set(finalJob.id, rev);
    if (rev > lastServerSyncMs) lastServerSyncMs = rev;

    // Avoid duplicate if SSE already inserted it milliseconds earlier
    const existingIdx = db.jobs.findIndex((j) => j.id === finalJob.id);
    if (existingIdx >= 0) {
      const next = [...db.jobs];
      next[existingIdx] = finalJob;
      db.jobs = next;
    } else {
      db.jobs = [finalJob, ...db.jobs];
    }
    setJobSaveState(finalJob.id, 'saved');
    return finalJob as Job;
  },

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const db = initDb();
    const jobIndex = db.jobs.findIndex((j) => j.id === id);

    const cleanUpdates: Partial<Job> = {};
    for (const key of Object.keys(updates) as (keyof Job)[]) {
      if (updates[key] !== undefined) {
        cleanUpdates[key] = updates[key] as any;
      }
    }

    // Ensure actor details are attached so ActivityLog never records "System" for actions taken by logged-in users
    if (!(cleanUpdates as any).actorId && !(cleanUpdates as any).actorName && typeof window !== 'undefined') {
      const parsed = getClientAuthUser();
      if (parsed?.id) (cleanUpdates as any).actorId = parsed.id;
      if (parsed?.name || parsed?.email) (cleanUpdates as any).actorName = parsed.name || parsed.email;
      if (parsed?.role) (cleanUpdates as any).actorRole = parsed.role;
    }

    if (jobIndex === -1) {
      pendingJobSaves.set(id, (pendingJobSaves.get(id) || 0) + 1);
      setJobSaveState(id, 'saving');
      try {
        const savedInDb = await dbActions.updateJobAction(id, { ...cleanUpdates, __returnErrorObject: true });
        if ((savedInDb as any)?.__actionError) {
          const actionErr: any = new Error((savedInDb as any).error || 'Save failed');
          actionErr.isConflict = Boolean((savedInDb as any).isConflict);
          throw actionErr;
        }
        pendingJobSaves.set(id, Math.max(0, (pendingJobSaves.get(id) || 1) - 1));
        const normalized = normalizeServerJob(savedInDb, { id, ...cleanUpdates } as Job);
        const rev = normalized.updatedAt ? new Date(normalized.updatedAt).getTime() : Date.now();
        lastSeenJobRevision.set(id, rev);
        setJobSaveState(id, 'saved');
        return normalized;
      } catch (err: any) {
        pendingJobSaves.set(id, Math.max(0, (pendingJobSaves.get(id) || 1) - 1));
        const isConflict =
          String(err?.message || '').includes('409') ||
          String(err?.message || '').toLowerCase().includes('conflict');
        setJobSaveState(id, isConflict ? 'conflict' : 'failed', err?.message || 'Save failed');
        throw err;
      }
    }

    const existingJob = db.jobs[jobIndex];

    // Snapshot last confirmed state if not already captured by an earlier optimisticUpdate
    if (!confirmedJobSnapshots.has(id) && (pendingJobSaves.get(id) || 0) === 0) {
      confirmedJobSnapshots.set(id, { ...existingJob });
    }

    // Prevent accidental in-memory erasure of billNo by empty/undefined values if existingJob already has billNo,
    // unless caller explicitly passed allowClearBillNo: true for an intentional authorized correction.
    if (
      !(cleanUpdates as any).allowClearBillNo &&
      cleanUpdates.billNo !== undefined &&
      (!cleanUpdates.billNo || String(cleanUpdates.billNo).trim() === '') &&
      existingJob.billNo &&
      String(existingJob.billNo).trim() !== ''
    ) {
      delete cleanUpdates.billNo;
    }

    // Safely merge billImageUrl arrays so concurrent uploads do not overwrite each other in memory
    if (cleanUpdates.billImageUrl !== undefined && cleanUpdates.billImageUrl && existingJob.billImageUrl) {
      try {
        const incomingUrls = JSON.parse(cleanUpdates.billImageUrl);
        const existingUrls = JSON.parse(existingJob.billImageUrl);
        if (Array.isArray(incomingUrls) && Array.isArray(existingUrls)) {
          const isMediaOnly = Object.keys(cleanUpdates).every(k => ['billImageUrl', 'actorId', 'actorName', 'actorRole'].includes(k));
          const incomingHasReceipt = incomingUrls.some((u: string) => typeof u === 'string' && (u.includes('/receipt-') || u.includes('receipt-')));
          const isRebillingOrPaying = Boolean(cleanUpdates.isShopPaid === true || cleanUpdates.items !== undefined || cleanUpdates.totalAmount !== undefined);
          let baseExisting = (incomingHasReceipt || isRebillingOrPaying)
            ? existingUrls.filter((u: string) => typeof u === 'string' && !u.includes('/receipt-') && !u.includes('receipt-'))
            : existingUrls;
          if (!isMediaOnly) {
            baseExisting = baseExisting.filter((u: string) => typeof u === 'string' && (u.includes('proforma-') || u.includes('receipt-')));
          }
          const merged = Array.from(new Set([...baseExisting, ...incomingUrls]));
          merged.sort((a, b) => {
            const aIsPf = a.includes('proforma-');
            const bIsPf = b.includes('proforma-');
            if (aIsPf && !bIsPf) return -1;
            if (!aIsPf && bIsPf) return 1;
            if (aIsPf && bIsPf) {
              const aRev = parseInt((a.match(/-rev(\d+)\.png/i) || [])[1] || '0', 10);
              const bRev = parseInt((b.match(/-rev(\d+)\.png/i) || [])[1] || '0', 10);
              return bRev - aRev;
            }
            const aIsRc = a.includes('receipt-');
            const bIsRc = b.includes('receipt-');
            if (aIsRc && !bIsRc) return 1;
            if (!aIsRc && bIsRc) return -1;
            return 0;
          });
          cleanUpdates.billImageUrl = JSON.stringify(merged);
        }
      } catch {}
    }

    if (
      cleanUpdates.status === undefined &&
      existingJob.status === 'tba' &&
      (cleanUpdates.pickupRiderId || cleanUpdates.deliveryRiderId)
    ) {
      cleanUpdates.status = 'pending';
    }

    // Attach base expectedUpdatedAt from the confirmed snapshot (or existingJob) so field-level concurrency check is active by default
    const baseConfirmedSnapshot = confirmedJobSnapshots.get(id) || existingJob;
    if (!(cleanUpdates as any).expectedUpdatedAt && !(cleanUpdates as any).checkConflict && baseConfirmedSnapshot?.updatedAt) {
      (cleanUpdates as any).expectedUpdatedAt = baseConfirmedSnapshot.updatedAt;
    }
    if (!(cleanUpdates as any).checkConflict) {
      delete cleanUpdates.updatedAt;
    }

    // Track pending field keys so concurrent refreshes (including paid-state transitions) do not overwrite unconfirmed drafts
    const dirtySet = pendingFieldEdits.get(id) || new Set<string>();
    for (const k of Object.keys(cleanUpdates)) {
      if (!['actorId', 'actorName', 'actorRole', 'expectedUpdatedAt', 'checkConflict', 'throwOnError', 'allowClearBillNo'].includes(k)) {
        dirtySet.add(k);
      }
    }
    pendingFieldEdits.set(id, dirtySet);

    // Mark local state as saving (unconfirmed) until server responds
    const optimisticJob: Job = {
      ...existingJob,
      ...cleanUpdates,
      updatedAt: new Date(),
    };
    (optimisticJob as any)._saveStatus = 'saving';

    const newJobs = [...db.jobs];
    newJobs[jobIndex] = optimisticJob;
    db.jobs = newJobs;

    pendingJobSaves.set(id, (pendingJobSaves.get(id) || 0) + 1);
    setJobSaveState(id, 'saving');

    try {
      const savedInDb = await dbActions.updateJobAction(id, { ...cleanUpdates, __returnErrorObject: true });
      if ((savedInDb as any)?.__actionError) {
        const actionErr: any = new Error((savedInDb as any).error || 'Save failed');
        actionErr.isConflict = Boolean((savedInDb as any).isConflict);
        throw actionErr;
      }
      const remainingSaves = Math.max(0, (pendingJobSaves.get(id) || 1) - 1);
      pendingJobSaves.set(id, remainingSaves);

      if (remainingSaves === 0) {
        pendingFieldEdits.delete(id);
        confirmedJobSnapshots.delete(id);
      }

      const currentIdx = db.jobs.findIndex((j) => j.id === id);
      const baseJob = currentIdx >= 0 ? db.jobs[currentIdx] : optimisticJob;
      const confirmedJob = normalizeServerJob(savedInDb, baseJob);
      (confirmedJob as any)._saveStatus = remainingSaves === 0 ? 'saved' : 'saving';
      if ((savedInDb as any)?.issuedCoupons) {
        (confirmedJob as any).issuedCoupons = (savedInDb as any).issuedCoupons;
      }

      const rev = confirmedJob.updatedAt ? new Date(confirmedJob.updatedAt).getTime() : Date.now();
      lastSeenJobRevision.set(id, rev);
      if (rev > lastServerSyncMs) lastServerSyncMs = rev;

      if (currentIdx >= 0) {
        const nextJobs = [...db.jobs];
        nextJobs[currentIdx] = confirmedJob;
        db.jobs = nextJobs;
      }

      if (remainingSaves === 0) {
        setJobSaveState(id, 'saved');
      }
      api.notify('jobs');
      return confirmedJob;
    } catch (err: any) {
      const remainingSaves = Math.max(0, (pendingJobSaves.get(id) || 1) - 1);
      pendingJobSaves.set(id, remainingSaves);

      const isConflict =
        String(err?.message || '').includes('409') ||
        String(err?.message || '').toLowerCase().includes('conflict');

      const currentIdx = db.jobs.findIndex((j) => j.id === id);
      if (currentIdx >= 0 && remainingSaves === 0) {
        const nextJobs = [...db.jobs];
        // Retain the user's draft on failure (marked 'failed' or 'conflict') so entered values like billNo are not lost!
        nextJobs[currentIdx] = {
          ...nextJobs[currentIdx],
          _saveStatus: isConflict ? 'conflict' : 'failed',
        } as any;
        db.jobs = nextJobs;
      }

      setJobSaveState(id, isConflict ? 'conflict' : 'failed', err?.message || 'Save failed');

      if (isConflict) {
        pendingFieldEdits.delete(id);
        confirmedJobSnapshots.delete(id);
        // Immediately fetch the latest server version so UI displays the authoritative state
        api.fetchAndApplyJob(id).catch(() => {});
      } else {
        api.notify('jobs');
      }

      throw err;
    }
  },

  /**
   * Update in-memory job state immediately (optimistic update) while marking it as 'saving'
   * and preserving the confirmed snapshot in case the subsequent server save fails.
   */
  optimisticUpdate(id: string, updates: Partial<Job>) {
    const db = initDb();
    const jobIndex = db.jobs.findIndex((j) => j.id === id);
    if (jobIndex === -1) return;

    const existingJob = db.jobs[jobIndex];
    if (!confirmedJobSnapshots.has(id) && (pendingJobSaves.get(id) || 0) === 0) {
      confirmedJobSnapshots.set(id, { ...existingJob });
    }

    const cleanUpdates: Partial<Job> = {};
    for (const key of Object.keys(updates) as (keyof Job)[]) {
      if (updates[key] !== undefined) {
        cleanUpdates[key] = updates[key] as any;
      }
    }

    if (
      !(cleanUpdates as any).allowClearBillNo &&
      cleanUpdates.billNo !== undefined &&
      (!cleanUpdates.billNo || String(cleanUpdates.billNo).trim() === '') &&
      existingJob.billNo &&
      String(existingJob.billNo).trim() !== ''
    ) {
      delete cleanUpdates.billNo;
    }

    const dirtySet = pendingFieldEdits.get(id) || new Set<string>();
    for (const k of Object.keys(cleanUpdates)) {
      if (!['actorId', 'actorName', 'actorRole', 'expectedUpdatedAt', 'checkConflict', 'throwOnError', 'allowClearBillNo'].includes(k)) {
        dirtySet.add(k);
      }
    }
    pendingFieldEdits.set(id, dirtySet);

    if (cleanUpdates.billImageUrl !== undefined && cleanUpdates.billImageUrl && existingJob.billImageUrl) {
      try {
        const incomingUrls = JSON.parse(cleanUpdates.billImageUrl);
        const existingUrls = JSON.parse(existingJob.billImageUrl);
        if (Array.isArray(incomingUrls) && Array.isArray(existingUrls)) {
          const isMediaOnly = Object.keys(cleanUpdates).every(k => ['billImageUrl', 'actorId', 'actorName', 'actorRole'].includes(k));
          const incomingHasReceipt = incomingUrls.some((u: string) => typeof u === 'string' && (u.includes('/receipt-') || u.includes('receipt-')));
          const isRebillingOrPaying = Boolean(cleanUpdates.isShopPaid === true || cleanUpdates.items !== undefined || cleanUpdates.totalAmount !== undefined);
          let baseExisting = (incomingHasReceipt || isRebillingOrPaying)
            ? existingUrls.filter((u: string) => typeof u === 'string' && !u.includes('/receipt-') && !u.includes('receipt-'))
            : existingUrls;
          if (!isMediaOnly) {
            baseExisting = baseExisting.filter((u: string) => typeof u === 'string' && (u.includes('proforma-') || u.includes('receipt-')));
          }
          const merged = Array.from(new Set([...baseExisting, ...incomingUrls]));
          merged.sort((a, b) => {
            const aIsPf = a.includes('proforma-');
            const bIsPf = b.includes('proforma-');
            if (aIsPf && !bIsPf) return -1;
            if (!aIsPf && bIsPf) return 1;
            if (aIsPf && bIsPf) {
              const aRev = parseInt((a.match(/-rev(\d+)\.png/i) || [])[1] || '0', 10);
              const bRev = parseInt((b.match(/-rev(\d+)\.png/i) || [])[1] || '0', 10);
              return bRev - aRev;
            }
            const aIsRc = a.includes('receipt-');
            const bIsRc = b.includes('receipt-');
            if (aIsRc && !bIsRc) return 1;
            if (!aIsRc && bIsRc) return -1;
            return 0;
          });
          cleanUpdates.billImageUrl = JSON.stringify(merged);
        }
      } catch {}
    }

    if (
      cleanUpdates.status === undefined &&
      existingJob.status === 'tba' &&
      (cleanUpdates.pickupRiderId || cleanUpdates.deliveryRiderId)
    ) {
      cleanUpdates.status = 'pending';
    }

    const updatedJob: Job = {
      ...existingJob,
      ...cleanUpdates,
      updatedAt: new Date(),
    };
    (updatedJob as any)._saveStatus = 'saving';
    const newJobs = [...db.jobs];
    newJobs[jobIndex] = updatedJob;
    db.jobs = newJobs;
    setJobSaveState(id, 'saving');
  },

  // --- SERVICES ---
  async getServices(): Promise<ServiceItem[]> {
    
    return initDb().services;
  },

  async addService(service: Omit<ServiceItem, 'id'>): Promise<ServiceItem> {
    
    const db = initDb();
    const newService = {
      ...service,
      id: getServiceSKU({ ...service, id: "" } as ServiceItem, db.services),
    };
    db.services = [newService, ...db.services];
    await dbActions.addServiceAction(newService);
    return newService;
  },

  async updateService(id: string, updates: Partial<ServiceItem>): Promise<ServiceItem> {
    
    const db = initDb();
    let updatedService: ServiceItem | null = null;
    db.services = db.services.map(s => {
      if (s.id === id) {
        updatedService = { ...s, ...updates };
        return updatedService;
      }
      return s;
    });
    if (!updatedService) throw new Error("Service not found");
    await dbActions.updateServiceAction(id, updates);
    return updatedService;
  },

  async deleteService(id: string): Promise<void> {
    
    const db = initDb();
    db.services = db.services.filter(s => s.id !== id);
    await dbActions.deleteServiceAction(id);
  },

  // --- RIDERS ---
  async getRiders(): Promise<Rider[]> {
    
    return initDb().riders;
  },

  async updateRider(id: string, updates: Partial<Rider>): Promise<Rider> {
    
    const db = initDb();
    let updatedRider: Rider | null = null;
    db.riders = db.riders.map(r => {
      if (r.id === id) {
        updatedRider = { ...r, ...updates };
        return updatedRider;
      }
      return r;
    });
    if (!updatedRider) throw new Error("Rider not found");
    await dbActions.updateRiderAction(id, updates);
    return updatedRider;
  },

  async addRider(rider: Omit<Rider, 'id'> & { id?: string }): Promise<Rider> {
    
    const db = initDb();
    const newRider = {
      ...rider,
      id: rider.id || `RIDER-${String(db.riders.length + 1).padStart(3, "0")}`,
    } as Rider;
    db.riders = [newRider, ...db.riders];
    await dbActions.addRiderAction(newRider);
    return newRider;
  },

  async deleteRider(id: string): Promise<void> {
    
    const db = initDb();
    db.riders = db.riders.filter(r => r.id !== id);
    await dbActions.deleteRiderAction(id);
  },

  // --- PRICE LISTS ---
  async getPriceLists(): Promise<PriceList[]> {
    
    return initDb().priceLists;
  },

  async addPriceList(list: Omit<PriceList, 'id'>): Promise<PriceList> {
    
    const db = initDb();
    const newList = {
      ...list,
      id: `PL-${Date.now().toString(36).toUpperCase()}`,
    };
    db.priceLists = [...db.priceLists, newList];
    await dbActions.addPriceListAction(newList);
    return newList;
  },

  async updatePriceList(
    id: string,
    updates: Partial<PriceList> & {
      baseName?: string;
      baseServicePrices?: Record<string, number>;
      baseCustomItems?: PriceListItem[];
    }
  ): Promise<PriceList & { isConflict?: boolean; conflictFields?: string[]; latestPriceList?: PriceList }> {
    const db = initDb();
    const existing = db.priceLists.find((p) => p.id === id);
    if (!existing) throw new Error("Price list not found");

    // Optimistic update on local cache
    const optimistic: PriceList = {
      ...existing,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.isDefault !== undefined ? { isDefault: updates.isDefault } : {}),
      ...(updates.isCorporate !== undefined ? { isCorporate: updates.isCorporate } : {}),
      ...(updates.customItems !== undefined ? { customItems: updates.customItems } : {}),
      ...(updates.servicePrices !== undefined ? { servicePrices: updates.servicePrices } : {}),
    };
    db.priceLists = db.priceLists.map((p) => (p.id === id ? optimistic : p));

    const res: any = await dbActions.updatePriceListAction(id, updates);
    if (res?.isConflict && res?.latestPriceList) {
      const latest: PriceList = {
        ...existing,
        ...res.latestPriceList,
      };
      db.priceLists = db.priceLists.map((p) => (p.id === id ? latest : p));
      api.notify('priceLists');
      return {
        ...latest,
        isConflict: true,
        conflictFields: res.conflictFields || [],
        latestPriceList: latest,
      };
    }

    if (res && res.id) {
      const authoritative: PriceList = {
        ...optimistic,
        id: res.id,
        name: res.name ?? optimistic.name,
        isDefault: res.isDefault ?? optimistic.isDefault,
        isCorporate: res.isCorporate ?? optimistic.isCorporate,
        customItems: res.customItems !== undefined ? res.customItems : optimistic.customItems,
        servicePrices:
          res.servicePrices && typeof res.servicePrices === "object"
            ? res.servicePrices
            : optimistic.servicePrices,
      };
      db.priceLists = db.priceLists.map((p) => (p.id === id ? authoritative : p));
      api.notify('priceLists');
      return { ...authoritative, isConflict: false };
    }

    return { ...optimistic, isConflict: false };
  },

  async deletePriceList(id: string): Promise<void> {
    
    const db = initDb();
    db.priceLists = db.priceLists.filter(p => p.id !== id);
    // Reset customers using this price list to regular
    db.customers = db.customers.map(c => c.priceListId === id ? { ...c, priceListId: "regular" } : c);
    await dbActions.deletePriceListAction(id);
  },

  // --- AUTH/STORE SYNC UTILS ---
  // These synchronous methods let our useSyncExternalStore wrapper fetch the current local DB state
  // without promises, so the UI can hydrate instantly if data is in localStorage.
  sync: {
    getCustomers: () => initDb().customers,
    getJobs: () => initDb().jobs,
    getServices: () => initDb().services,
    getRiders: () => initDb().riders,
    getPriceLists: () => initDb().priceLists,
    getShopLocations: () => initDb().shopLocations,
    getPOIs: () => initDb().pois,
    getSettings: () => initDb().settings,
    updateRiderLocal: (id: string, updates: Partial<Rider>) => {
      const db = initDb();
      db.riders = db.riders.map(r => r.id === id ? { ...r, ...updates } : r);
      api.notify('riders');
    },
  },

  // --- SHOP LOCATIONS ---
  async getShopLocations() {
    
    return initDb().shopLocations;
  },
  async addShopLocation(shop: Omit<ShopLocation, 'id'>) {
    const db = initDb();
    const newShop = {
      ...shop,
      id: `SHOP-${Date.now().toString(36).toUpperCase()}`,
    } as ShopLocation;
    db.shopLocations = [...db.shopLocations, newShop];
    await dbActions.addShopLocationAction(newShop);
    return newShop;
  },
  async updateShopLocation(id: string, updates: Partial<ShopLocation>) {
    const db = initDb();
    let updatedShop = null;
    db.shopLocations = db.shopLocations.map(s => {
      if (s.id === id) {
        updatedShop = { ...s, ...updates } as ShopLocation;
        return updatedShop;
      }
      return s;
    });
    if (!updatedShop) throw new Error("Shop not found");
    await dbActions.updateShopLocationAction(id, updates);
    return updatedShop;
  },
  async deleteShopLocation(id: string) {
    
    const db = initDb();
    db.shopLocations = db.shopLocations.filter(s => s.id !== id);
    await dbActions.deleteShopLocationAction(id);
  },

  // --- SETTINGS ---
  async getSettings(): Promise<Record<string, string>> {
    
    return initDb().settings;
  },

  async updateSetting(key: string, value: string, options?: { baseValue?: string }): Promise<Record<string, string>> {
    const db = initDb();
    const prevValue = options?.baseValue !== undefined ? options.baseValue : db.settings[key];
    db.settings = { ...db.settings, [key]: value };
    const res = await dbActions.updateSettingAction(key, value, prevValue !== undefined ? { baseValue: prevValue } : undefined);
    if (res && typeof res.value === "string") {
      db.settings = { ...db.settings, [key]: res.value };
    }
    return db.settings;
  },

  // --- POIS ---
  async getPOIs() {
    
    return initDb().pois;
  },
  async addPOI(poi: Omit<{ id: string; name: string; address: string; coords: { lat: number; lng: number }, placeId?: string }, 'id'>) {
    const db = initDb();
    const newPoi = { ...poi, id: `POI-${Date.now().toString(36).toUpperCase()}` };
    db.pois = [...db.pois, newPoi];
    await dbActions.addPOIAction(newPoi);
    return newPoi;
  },
  async updatePOI(id: string, updates: Partial<{ id: string; name: string; address: string; coords: { lat: number; lng: number }, placeId?: string }>) {
    const db = initDb();
    let updatedPoi = null;
    db.pois = db.pois.map(p => {
      if (p.id === id) {
        updatedPoi = { ...p, ...updates };
        return updatedPoi;
      }
      return p;
    });
    if (!updatedPoi) throw new Error("POI not found");
    await dbActions.updatePOIAction(id, updates);
    return updatedPoi;
  },
  async deletePOI(id: string) {
    const db = initDb();
    db.pois = db.pois.filter(p => p.id !== id);
    await dbActions.deletePOIAction(id);
  },
  async deletePOIs(ids: string[]) {
    const db = initDb();
    const idSet = new Set(ids);
    db.pois = db.pois.filter(p => !idSet.has(p.id));
    await dbActions.deletePOIsAction(ids);
  },
  async getActiveCashierShift(userId: string) {
    return dbActions.getOpenShiftAction(userId);
  },
  async getBranchActiveCashierShift(branchId: string) {
    return dbActions.getBranchOpenShiftAction(branchId);
  },
  async getShiftStatus(userId: string, branchId?: string) {
    return dbActions.getShiftStatusAction(userId, branchId);
  },
  async openCashierShift(userId: string, userName: string, branchId: string, startingCash: number, notes?: string) {
    const res = await dbActions.openShiftAction({
      userId,
      userName,
      branchId,
      startingCash,
      notes
    });
    if (!res.success) throw new Error(res.error || "Failed to open shift");
    return res.shift;
  },
  async closeCashierShift(id: string, actualCash: number, notes?: string) {
    const res = await dbActions.closeShiftAction({
      shiftId: id,
      actualCash,
      notes
    });
    if (!res.success) throw new Error(res.error || "Failed to close shift");
    return res.shift;
  },
  async getClosedCashierShifts(branchId?: string) {
    return dbActions.getClosedShiftsAction(branchId);
  },
  async getOpenCashierShifts() {
    return dbActions.getOpenShiftsAction();
  },

  // --- WALLET APPROVALS & TRANSACTIONS ---
  async createWalletTransaction(data: Parameters<typeof dbActions.createWalletTransactionAction>[0]) {
    return dbActions.createWalletTransactionAction(data);
  },
  async getWalletTransactions(filters?: Parameters<typeof dbActions.getWalletTransactionsAction>[0]) {
    return dbActions.getWalletTransactionsAction(filters);
  },
  async getPendingWalletCount(customerId?: string) {
    return dbActions.getPendingWalletCountAction(customerId);
  },
  async getPendingWalletMap() {
    return dbActions.getPendingWalletMapAction();
  },
  async approveWalletTransaction(data: Parameters<typeof dbActions.approveWalletTransactionAction>[0]) {
    return dbActions.approveWalletTransactionAction(data);
  },
  async rejectWalletTransaction(data: Parameters<typeof dbActions.rejectWalletTransactionAction>[0]) {
    const res = await dbActions.rejectWalletTransactionAction(data);
    if (res.updatedCustomer) {
      const db = initDb();
      const saved = res.updatedCustomer;
      db.customers = db.customers.map(c => {
        if (c.id === saved.id) {
          return {
            ...c,
            creditBalance: saved.creditBalance,
            updatedAt: saved.updatedAt,
          };
        }
        return c;
      });
      api.notify('customers');
    }
    return res;
  },
  async bulkApproveWallet(data: Parameters<typeof dbActions.bulkApproveWalletAction>[0]) {
    return dbActions.bulkApproveWalletAction(data);
  },

  // --- REFUND & CORRECT ---
  async processRefundAndCorrect(data: Parameters<typeof dbActions.processRefundAndCorrectAction>[0]) {
    return dbActions.processRefundAndCorrectAction(data);
  },
  async getJobRefunds(filters?: Parameters<typeof dbActions.getJobRefundsAction>[0]) {
    return dbActions.getJobRefundsAction(filters);
  }
};

