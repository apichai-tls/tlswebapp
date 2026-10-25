import crypto from 'crypto';
import { Client } from 'pg';
import { prisma } from '@/lib/prisma';
import { dbCache, invalidateDbCache, primeJobCache, getOrFetchJobById } from '@/lib/db-cache';

export interface RealtimeOrderEvent {
  eventId: string;
  type: 'job.created' | 'job.updated' | 'customer.updated' | 'shift.updated';
  jobId?: string;
  customerId?: string;
  revision: number; // epoch ms of updatedAt
  updatedAt: string; // ISO string
  branchId?: string | null;
  brand?: string | null;
  status?: string | null;
  subStatus?: string | null;
  isPaid?: boolean;
  isShopPaid?: boolean;
  riderId?: string | null;
  pickupRiderId?: string | null;
  deliveryRiderId?: string | null;
  previousRiderIds?: string[];
  action?: string;
  changedFields?: string[];
  actorId?: string | null;
  actorName?: string | null;
  instanceId: string;
}

type EventSubscriber = (event: RealtimeOrderEvent) => void;

interface RealtimeBusState {
  instanceId: string;
  subscribers: Set<EventSubscriber>;
  recentEvents: RealtimeOrderEvent[];
  seenEventKeys: Map<string, number>;
  pgClient: Client | null;
  isConnectingPg: boolean;
  pgConnected: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  keepaliveTimer: ReturnType<typeof setInterval> | null;
  watermarkTimer: ReturnType<typeof setInterval> | null;
  lastWatermarkMs: number;
}

const PG_CHANNEL = 'tls_realtime_events';
const MAX_RECENT_EVENTS = 500;

const globalForRealtime = globalThis as unknown as {
  __tlsRealtimeBus?: RealtimeBusState;
};

const bus: RealtimeBusState = globalForRealtime.__tlsRealtimeBus || {
  instanceId: crypto.randomUUID().slice(0, 8),
  subscribers: new Set(),
  recentEvents: [],
  seenEventKeys: new Map(),
  pgClient: null,
  isConnectingPg: false,
  pgConnected: false,
  reconnectTimer: null,
  keepaliveTimer: null,
  watermarkTimer: null,
  lastWatermarkMs: Date.now() - 5000,
};

globalForRealtime.__tlsRealtimeBus = bus;

function recordAndDispatchLocal(event: RealtimeOrderEvent, fromRemoteInstance: boolean) {
  const dedupKey = event.jobId
    ? `job:${event.jobId}:${event.revision}`
    : `${event.type}:${event.customerId || ''}:${event.revision}`;

  const now = Date.now();
  if (bus.seenEventKeys.has(dedupKey)) {
    return;
  }
  bus.seenEventKeys.set(dedupKey, now);

  if (bus.seenEventKeys.size > 1000) {
    const cutoff = now - 120000;
    for (const [k, ts] of bus.seenEventKeys.entries()) {
      if (ts < cutoff) bus.seenEventKeys.delete(k);
    }
  }

  if (event.revision > bus.lastWatermarkMs) {
    bus.lastWatermarkMs = event.revision;
  }

  // If received from another Cloud Run instance via PG LISTEN/NOTIFY,
  // evict stale single-job micro-cache entry and warm/patch only that single job in dbCache.payload
  if (fromRemoteInstance) {
    if (event.jobId) {
      const existingMicro = dbCache.jobRevisionCache.get(event.jobId);
      if (existingMicro && existingMicro.revision < event.revision) {
        dbCache.jobRevisionCache.delete(event.jobId);
      }
      getOrFetchJobById(event.jobId, event.revision).catch(() => {});
    } else if (event.type === 'customer.updated') {
      invalidateDbCache('customers');
    } else {
      dbCache.lastTime = 0;
      dbCache.etag = null;
    }
  }

  bus.recentEvents.push(event);
  if (bus.recentEvents.length > MAX_RECENT_EVENTS) {
    bus.recentEvents.splice(0, bus.recentEvents.length - MAX_RECENT_EVENTS);
  }

  for (const sub of bus.subscribers) {
    try {
      sub(event);
    } catch (err) {
      console.error('[RealtimeBus] Subscriber error:', err);
    }
  }
}

function getPgClientConfig() {
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  const isLocalOrSocket =
    connStr.includes('localhost') ||
    connStr.includes('127.0.0.1') ||
    connStr.includes('/cloudsql/');
  return {
    connectionString: connStr,
    ssl: isLocalOrSocket ? false : { rejectUnauthorized: false },
    keepAlive: true,
    connectionTimeoutMillis: 10000,
  };
}

let pgConnectPromise: Promise<void> | null = null;

export async function ensurePgListenerStarted(): Promise<void> {
  if (bus.pgConnected) return;
  if (pgConnectPromise) return pgConnectPromise;
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connStr) return;

  bus.isConnectingPg = true;
  pgConnectPromise = (async () => {
    try {
      const client = new Client(getPgClientConfig());

      client.on('notification', (msg) => {
        if (msg.channel !== PG_CHANNEL || !msg.payload) return;
        try {
          const parsed = JSON.parse(msg.payload) as RealtimeOrderEvent;
          if (!parsed || !parsed.revision) return;
          const isRemote = parsed.instanceId !== bus.instanceId;
          recordAndDispatchLocal(parsed, isRemote);
        } catch (err) {
          console.warn('[RealtimeBus] Failed to parse PG notification payload:', err);
        }
      });

      client.on('error', (err) => {
        console.warn('[RealtimeBus] PG listener connection error, scheduling reconnect:', err.message);
        cleanupPgClient();
        schedulePgReconnect(2000);
      });

      client.on('end', () => {
        cleanupPgClient();
        if (bus.subscribers.size > 0) {
          schedulePgReconnect(2000);
        }
      });

      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);

      bus.pgClient = client;
      bus.pgConnected = true;
      bus.isConnectingPg = false;

      if (bus.keepaliveTimer) clearInterval(bus.keepaliveTimer);
      bus.keepaliveTimer = setInterval(() => {
        if (bus.pgClient && bus.pgConnected) {
          bus.pgClient.query('SELECT 1').catch(() => {
            cleanupPgClient();
            schedulePgReconnect(1500);
          });
        }
      }, 25000);

      ensureWatermarkLoop();
    } catch (err: any) {
      bus.isConnectingPg = false;
      cleanupPgClient();
      console.warn('[RealtimeBus] Initial PG LISTEN failed, using DB watermark fallback & retrying:', err?.message);
      ensureWatermarkLoop();
      schedulePgReconnect(3000);
    } finally {
      pgConnectPromise = null;
    }
  })();

  return pgConnectPromise;
}

function cleanupPgClient() {
  bus.pgConnected = false;
  bus.isConnectingPg = false;
  if (bus.keepaliveTimer) {
    clearInterval(bus.keepaliveTimer);
    bus.keepaliveTimer = null;
  }
  const c = bus.pgClient;
  bus.pgClient = null;
  if (c) {
    c.removeAllListeners();
    c.end().catch(() => {});
  }
}

function schedulePgReconnect(delayMs: number) {
  if (bus.reconnectTimer) return;
  bus.reconnectTimer = setTimeout(() => {
    bus.reconnectTimer = null;
    if (bus.subscribers.size > 0) {
      ensurePgListenerStarted().catch(() => {});
    }
  }, delayMs);
}

let isPollingWatermark = false;
let lastWatermarkPollAt = 0;
function ensureWatermarkLoop() {
  if (bus.watermarkTimer) return;
  bus.watermarkTimer = setInterval(async () => {
    if (bus.subscribers.size === 0 || isPollingWatermark) return;
    // When PG LISTEN/NOTIFY is active, only run watermark reconciliation every 12s instead of every 1.5s
    const minInterval = bus.pgConnected ? 12000 : 3500;
    if (Date.now() - lastWatermarkPollAt < minInterval) return;
    lastWatermarkPollAt = Date.now();
    isPollingWatermark = true;
    try {
      const sinceDate = new Date(bus.lastWatermarkMs);
      const recentJobs = await prisma.job.findMany({
        where: {
          updatedAt: { gt: sinceDate },
        },
        orderBy: { updatedAt: 'asc' },
        take: 30,
        select: {
          id: true,
          updatedAt: true,
          branchId: true,
          brand: true,
          status: true,
          subStatus: true,
          isPaid: true,
          isShopPaid: true,
          riderId: true,
          pickupRiderId: true,
          deliveryRiderId: true,
        },
      });

      for (const j of recentJobs) {
        const rev = j.updatedAt.getTime();
        if (rev > bus.lastWatermarkMs) {
          bus.lastWatermarkMs = rev;
        }
        const ev: RealtimeOrderEvent = {
          eventId: `wm-${j.id}-${rev}`,
          type: 'job.updated',
          jobId: j.id,
          revision: rev,
          updatedAt: j.updatedAt.toISOString(),
          branchId: j.branchId,
          brand: j.brand,
          status: j.status,
          subStatus: j.subStatus,
          isPaid: j.isPaid,
          isShopPaid: j.isShopPaid,
          riderId: j.riderId,
          pickupRiderId: j.pickupRiderId,
          deliveryRiderId: j.deliveryRiderId,
          action: 'watermark_sync',
          instanceId: bus.instanceId,
        };
        recordAndDispatchLocal(ev, true);
      }
    } catch {
      // Ignore transient query errors
    } finally {
      isPollingWatermark = false;
    }
  }, 2000);
}

/**
 * Subscribe to cross-instance order events on this server instance.
 */
export function subscribeToOrderEvents(listener: EventSubscriber): () => void {
  bus.subscribers.add(listener);
  ensurePgListenerStarted().catch(() => {});
  ensureWatermarkLoop();
  return () => {
    bus.subscribers.delete(listener);
  };
}

/**
 * Retrieve buffered events strictly newer than `sinceRevisionMs` for fast SSE reconnect catch-up.
 */
export function getBufferedOrderEventsSince(sinceRevisionMs: number): RealtimeOrderEvent[] {
  if (!sinceRevisionMs || sinceRevisionMs <= 0) return [];
  return bus.recentEvents.filter((e) => e.revision > sinceRevisionMs);
}

/**
 * Publish an order change event strictly AFTER the database commit has succeeded.
 * Automatically updates local revision micro-cache and broadcasts across all Cloud Run instances via PostgreSQL NOTIFY.
 */
export async function publishOrderEvent(params: {
  type?: 'job.created' | 'job.updated' | 'customer.updated' | 'shift.updated';
  job?: any;
  jobId?: string;
  customerId?: string;
  updatedAt?: Date | string | number;
  branchId?: string | null;
  brand?: string | null;
  status?: string | null;
  subStatus?: string | null;
  isPaid?: boolean;
  isShopPaid?: boolean;
  riderId?: string | null;
  pickupRiderId?: string | null;
  deliveryRiderId?: string | null;
  previousRiderIds?: string[];
  action?: string;
  changedFields?: string[];
  actorId?: string | null;
  actorName?: string | null;
}) {
  try {
    const rawJob = params.job;
    if (rawJob && rawJob.id) {
      primeJobCache(rawJob);
    } else if (params.type === 'customer.updated') {
      invalidateDbCache('customers');
    } else {
      invalidateDbCache('jobs');
    }

    const jobId = params.jobId || rawJob?.id;
    const rawUpdated = params.updatedAt || rawJob?.updatedAt || new Date();
    const updatedDate = rawUpdated instanceof Date ? rawUpdated : new Date(rawUpdated);
    const revision = !isNaN(updatedDate.getTime()) ? updatedDate.getTime() : Date.now();

    const event: RealtimeOrderEvent = {
      eventId: `${jobId || params.customerId || 'evt'}-${revision}`,
      type: params.type || 'job.updated',
      jobId,
      customerId: params.customerId || rawJob?.customerId || undefined,
      revision,
      updatedAt: new Date(revision).toISOString(),
      branchId: params.branchId !== undefined ? params.branchId : rawJob?.branchId ?? null,
      brand: params.brand !== undefined ? params.brand : rawJob?.brand ?? null,
      status: params.status !== undefined ? params.status : rawJob?.status ?? null,
      subStatus: params.subStatus !== undefined ? params.subStatus : rawJob?.subStatus ?? null,
      isPaid: params.isPaid !== undefined ? params.isPaid : rawJob?.isPaid,
      isShopPaid: params.isShopPaid !== undefined ? params.isShopPaid : rawJob?.isShopPaid,
      riderId: params.riderId !== undefined ? params.riderId : rawJob?.riderId ?? null,
      pickupRiderId:
        params.pickupRiderId !== undefined ? params.pickupRiderId : rawJob?.pickupRiderId ?? null,
      deliveryRiderId:
        params.deliveryRiderId !== undefined
          ? params.deliveryRiderId
          : rawJob?.deliveryRiderId ?? null,
      previousRiderIds: params.previousRiderIds,
      action: params.action || 'update',
      changedFields: params.changedFields,
      actorId: params.actorId || null,
      actorName: params.actorName || null,
      instanceId: bus.instanceId,
    };

    // 1. Dispatch immediately to local SSE clients on this instance (0ms synchronous)
    recordAndDispatchLocal(event, false);

    // 2. Broadcast to all other Cloud Run instances via PostgreSQL NOTIFY (non-blocking)
    const payloadStr = JSON.stringify(event);
    if (bus.pgClient && bus.pgConnected) {
      bus.pgClient.query('SELECT pg_notify($1, $2)', [PG_CHANNEL, payloadStr]).catch(() => {
        prisma.$executeRaw`SELECT pg_notify(${PG_CHANNEL}, ${payloadStr})`.catch(() => {});
      });
    } else {
      prisma.$executeRaw`SELECT pg_notify(${PG_CHANNEL}, ${payloadStr})`.catch((err) => {
        console.warn('[RealtimeBus] Failed to pg_notify order event:', err);
      });
    }
  } catch (err) {
    console.warn('[RealtimeBus] Failed to publish order event:', err);
  }
}

export function getRealtimeBusStatus() {
  return {
    instanceId: bus.instanceId,
    pgConnected: bus.pgConnected,
    subscriberCount: bus.subscribers.size,
    bufferedEventsCount: bus.recentEvents.length,
    lastWatermarkMs: bus.lastWatermarkMs,
  };
}
