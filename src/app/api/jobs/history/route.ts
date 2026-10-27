import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestUser, buildJobAuthWhereClause } from "@/lib/server-auth";
import { JOB_SELECT_FIELDS, formatJobRecord, dbCache } from "@/lib/db-cache";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

interface HistoryCacheEntry {
  jobs: any[];
  cachedAt: number;
  dbVersion: number;
}

const globalForHistoryCache = globalThis as unknown as {
  __tlsHistoryCache?: Map<string, HistoryCacheEntry>;
  __tlsInFlightHistory?: Map<string, Promise<any[]>>;
};

const historyCache =
  globalForHistoryCache.__tlsHistoryCache ||
  (globalForHistoryCache.__tlsHistoryCache = new Map<string, HistoryCacheEntry>());
const inFlightHistory =
  globalForHistoryCache.__tlsInFlightHistory ||
  (globalForHistoryCache.__tlsInFlightHistory = new Map<string, Promise<any[]>>());

/**
 * Normalizes a start or end date parameter into full-day Bangkok (+07:00) boundaries
 * so that both `new Date("YYYY-MM-DD")` (UTC midnight) and `new Date(y, m, d, 0, 0, 0)`
 * (Bangkok local midnight) resolve to the exact intended Bangkok calendar day.
 */
function parseBangkokDayBound(raw: string, isEnd: boolean): Date {
  const trimmed = raw.trim();
  // Case 1: "YYYY-MM-DD" or "YYYY-MM-DDT00:00:00.000Z" (produced by new Date("YYYY-MM-DD").toISOString())
  const utcMidnightMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/i);
  if (utcMidnightMatch) {
    const ymd = utcMidnightMatch[1];
    return new Date(`${ymd}T${isEnd ? "23:59:59.999" : "00:00:00.000"}+07:00`);
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return parsed;
  }

  // Convert timestamp to Bangkok (+07:00) calendar date and clamp to 00:00:00.000 .. 23:59:59.999 +07:00
  const bkkTime = new Date(parsed.getTime() + BANGKOK_OFFSET_MS);
  const yyyy = bkkTime.getUTCFullYear();
  const mm = String(bkkTime.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bkkTime.getUTCDate()).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T${isEnd ? "23:59:59.999" : "00:00:00.000"}+07:00`);
}

export async function GET(req: NextRequest) {
  const { user } = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Valid staff session required" }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Forbidden: Account is deactivated" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const requestedRiderId = searchParams.get("riderId");
  const role = (user.role || "").toLowerCase();

  // Riders can only query their own historical jobs
  if (role === "rider" && requestedRiderId && requestedRiderId !== user.id) {
    return NextResponse.json({ error: "Forbidden: Riders can only view their own job history" }, { status: 403 });
  }
  const riderId = role === "rider" ? user.id : requestedRiderId;

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
  }

  const startDate = parseBangkokDayBound(start, false);
  const endDate = parseBangkokDayBound(end, true);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
  }

  try {
    const authWhere = buildJobAuthWhereClause(user);
    const cacheKey = `${startDate.toISOString()}|${endDate.toISOString()}|${riderId || ""}|${role}|${JSON.stringify(authWhere || {})}`;
    const now = Date.now();
    const cached = historyCache.get(cacheKey);
    if (cached && now - cached.cachedAt < 15000 && cached.dbVersion === dbCache.version) {
      return NextResponse.json(cached.jobs);
    }

    let inFlight = inFlightHistory.get(cacheKey);
    if (!inFlight) {
      inFlight = (async () => {
        const dateRangeCondition = {
          OR: [
            { createdAt: { gte: startDate, lte: endDate } },
            { completedAt: { gte: startDate, lte: endDate } },
            { scheduledAt: { gte: startDate, lte: endDate } },
            { pickupScheduledAt: { gte: startDate, lte: endDate } },
            { deliveryScheduledAt: { gte: startDate, lte: endDate } },
            { shopPaidAt: { gte: startDate, lte: endDate } },
            { csoPaidAt: { gte: startDate, lte: endDate } },
          ],
        };

        const andConditions: any[] = [dateRangeCondition];

        if (riderId) {
          andConditions.push({
            OR: [
              { pickupRiderId: riderId },
              { deliveryRiderId: riderId },
              { riderId: riderId },
            ],
          });
        }

        if (authWhere) {
          andConditions.push(authWhere);
        }

        const whereClause: any = andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

        const selectFields = {
          ...JOB_SELECT_FIELDS,
          adminNotesJson: role === "rider" ? false : true,
        };

        const jobs = await prisma.job.findMany({
          where: whereClause,
          orderBy: { updatedAt: "desc" },
          select: selectFields,
        });

        const mappedJobs = jobs.map((j) => formatJobRecord(j)).filter(Boolean);

        if (historyCache.size > 100) {
          for (const [k, v] of historyCache.entries()) {
            if (Date.now() - v.cachedAt > 30000) historyCache.delete(k);
          }
        }
        historyCache.set(cacheKey, {
          jobs: mappedJobs,
          cachedAt: Date.now(),
          dbVersion: dbCache.version,
        });

        return mappedJobs;
      })().finally(() => {
        inFlightHistory.delete(cacheKey);
      });
      inFlightHistory.set(cacheKey, inFlight);
    }

    const resultJobs = await inFlight;
    return NextResponse.json(resultJobs);
  } catch (error) {
    console.error("Failed to fetch historical jobs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
