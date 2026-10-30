import { prisma } from '@/lib/prisma';
import { invalidateDbCache } from '@/lib/db-cache';

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAILY_RESET_SETTING_KEY = 'rider_daily_reset_date';
const GPS_SETTING_PREFIX = 'rider_gps_at:';

let lastVerifiedBangkokDate: string | null = null;
let inFlightResetPromise: Promise<boolean> | null = null;

let gpsTimestampsCache: Map<string, string> | null = null;
let gpsTimestampsLoadedAt = 0;
const GPS_CACHE_TTL_MS = 30000;

/**
 * Returns the current date string ("YYYY-MM-DD") in Asia/Bangkok (UTC+7).
 */
export function getBangkokDateKey(now: Date = new Date()): string {
  const bkk = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const yyyy = bkk.getUTCFullYear();
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(bkk.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Ensures all riders are automatically set to "offline" once a new calendar day
 * begins at 00:00 Bangkok time (UTC+7), while preserving their last known coordinates
 * (currentLat / currentLng).
 *
 * Uses an in-memory date check so subsequent calls within the same day take 0ms.
 */
export async function ensureDailyRiderOfflineReset(now: Date = new Date()): Promise<boolean> {
  const todayKey = getBangkokDateKey(now);

  if (lastVerifiedBangkokDate === todayKey) {
    return false;
  }

  if (inFlightResetPromise) {
    return inFlightResetPromise;
  }

  inFlightResetPromise = (async () => {
    try {
      const existingSetting = await prisma.setting.findUnique({
        where: { key: DAILY_RESET_SETTING_KEY },
      });

      if (existingSetting?.value === todayKey) {
        lastVerifiedBangkokDate = todayKey;
        return false;
      }

      // New day detected (>= 00:00 Bangkok time): reset all non-offline riders to 'offline'
      // while keeping their last known currentLat and currentLng untouched.
      const updateResult = await prisma.rider.updateMany({
        where: {
          status: { not: 'offline' },
        },
        data: {
          status: 'offline',
        },
      });

      await prisma.setting.upsert({
        where: { key: DAILY_RESET_SETTING_KEY },
        create: { key: DAILY_RESET_SETTING_KEY, value: todayKey },
        update: { value: todayKey },
      });

      lastVerifiedBangkokDate = todayKey;
      invalidateDbCache('riders');

      if (updateResult.count > 0) {
        console.log(
          `[RiderDailyReset] Reset ${updateResult.count} rider(s) to offline for new day ${todayKey} (Bangkok 00:00)`
        );
      }
      return updateResult.count > 0;
    } catch (err) {
      console.error('[RiderDailyReset] Failed to run daily rider offline reset:', err);
      return false;
    } finally {
      inFlightResetPromise = null;
    }
  })();

  return inFlightResetPromise;
}

/**
 * Records the latest GPS update timestamp for a rider in the Setting table
 * and updates the in-memory map immediately.
 */
export async function recordRiderGpsTimestamp(
  riderId: string,
  now: Date = new Date()
): Promise<string> {
  const iso = now.toISOString();
  const key = `${GPS_SETTING_PREFIX}${riderId}`;

  if (gpsTimestampsCache) {
    gpsTimestampsCache.set(riderId, iso);
  }

  try {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: iso },
      update: { value: iso },
    });
  } catch (err) {
    console.error(`[RiderPresence] Failed to persist GPS timestamp for ${riderId}:`, err);
  }

  return iso;
}

/**
 * Retrieves the map of riderId -> ISO timestamp of their last GPS update.
 */
export async function getRiderGpsTimestampsMap(): Promise<Map<string, string>> {
  const nowMs = Date.now();
  if (gpsTimestampsCache && nowMs - gpsTimestampsLoadedAt < GPS_CACHE_TTL_MS) {
    return gpsTimestampsCache;
  }

  try {
    const rows = await prisma.setting.findMany({
      where: {
        key: { startsWith: GPS_SETTING_PREFIX },
      },
    });
    const nextMap = new Map<string, string>();
    for (const row of rows) {
      const riderId = row.key.slice(GPS_SETTING_PREFIX.length);
      if (riderId && row.value) {
        nextMap.set(riderId, row.value);
      }
    }
    gpsTimestampsCache = nextMap;
    gpsTimestampsLoadedAt = nowMs;
    return nextMap;
  } catch (err) {
    console.error('[RiderPresence] Failed to load GPS timestamps:', err);
    return gpsTimestampsCache || new Map<string, string>();
  }
}
