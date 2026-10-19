import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dbCache, JOB_SELECT_FIELDS, formatJobRecord, seedJobsIntoRevisionCache } from '@/lib/db-cache';
import { resolveRequestUser, buildJobAuthWhereClause, canUserAccessJob } from '@/lib/server-auth';
import { getRealtimeBusStatus } from '@/lib/realtime-bus';

export const dynamic = 'force-dynamic';

interface SearchResultPayload {
  jobs: any[];
  totalCount: number;
  limit: number;
  offset: number;
  serverTime: number;
}

interface CachedSearchEntry {
  watermark: number;
  cachedAt: number;
  payload: SearchResultPayload;
}

const SEARCH_CACHE_TTL_MS = 20000;
const searchCache = new Map<string, CachedSearchEntry>();
const inFlightSearches = new Map<string, Promise<SearchResultPayload>>();

export async function GET(request: NextRequest) {
  try {
    const { user, explicitCredentialsProvided } = await resolveRequestUser(request);
    if (explicitCredentialsProvided && (!user || !user.isActive)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: user && !user.isActive ? 403 : 401 }
      );
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const status = url.searchParams.get('status');
    const branchId = url.searchParams.get('branchId');
    const brand = url.searchParams.get('brand');
    const isPaidParam = url.searchParams.get('isPaid');
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

    const authScopeKey = user
      ? `${user.role}:${user.allowedBranchIds === 'ALL' ? 'ALL' : user.allowedBranchIds.join(',')}:${user.role === 'rider' ? user.id : ''}`
      : 'ALL';
    const cacheKey = `${authScopeKey}|q=${q.toLowerCase()}|st=${status || ''}|br=${branchId || ''}|bd=${brand || ''}|paid=${isPaidParam || ''}|l=${limit}|o=${offset}`;

    const busWatermark = getRealtimeBusStatus().lastWatermarkMs;
    const now = Date.now();
    const cached = searchCache.get(cacheKey);
    if (
      cached &&
      cached.watermark === busWatermark &&
      now - cached.cachedAt < SEARCH_CACHE_TTL_MS
    ) {
      return NextResponse.json(cached.payload, {
        headers: { 'Cache-Control': 'no-cache, must-revalidate', 'X-Search-Cache': 'HIT' },
      });
    }

    let inFlight = inFlightSearches.get(cacheKey);
    if (!inFlight) {
      inFlight = (async (): Promise<SearchResultPayload> => {
        // Fast path: if dbCache.payload.jobs is loaded in server memory, filter in <1ms
        if (dbCache.payload && Array.isArray(dbCache.payload.jobs) && dbCache.payload.jobs.length > 0) {
          const qLower = q.toLowerCase();
          const cleanedId = qLower.replace(/^#/, '').trim();
          const digitsOnly = q.replace(/\D/g, '');

          const matched = dbCache.payload.jobs.filter((job: any) => {
            if (!canUserAccessJob(user, job)) return false;
            if (status && status !== 'all' && status !== 'ALL' && job.status !== status) return false;
            if (branchId && branchId !== 'all' && branchId !== 'ALL' && job.branchId !== branchId) return false;
            if (brand && brand !== 'all' && brand !== 'ALL' && job.brand !== brand) return false;
            if (isPaidParam === 'true' && !job.isPaid) return false;
            if (isPaidParam === 'false' && job.isPaid) return false;

            if (!qLower) return true;
            if (String(job.id || '').toLowerCase().includes(cleanedId)) return true;
            if (String(job.billNo || '').toLowerCase().includes(cleanedId)) return true;
            if (String(job.proformaNumber || '').toLowerCase().includes(cleanedId)) return true;
            if (String(job.customerName || '').toLowerCase().includes(qLower)) return true;
            if (String(job.customerPhone || '').toLowerCase().includes(qLower)) return true;
            if (digitsOnly.length >= 6 && String(job.customerPhone || '').includes(digitsOnly)) return true;
            if (String(job.pickupLocation || '').toLowerCase().includes(qLower)) return true;
            if (String(job.dropoffLocation || '').toLowerCase().includes(qLower)) return true;
            if (String(job.remark || '').toLowerCase().includes(qLower)) return true;
            return false;
          });

          if (matched.length > 0 || !q || q.length < 3) {
            const paged = matched.slice(offset, offset + limit);
            return {
              jobs: paged,
              totalCount: matched.length,
              limit,
              offset,
              serverTime: Date.now(),
            };
          }
        }

        // Targeted indexed SQL query (take: limit — never fetching 1,500 rows)
        const conditions: any[] = [];
        const authWhere = buildJobAuthWhereClause(user);
        if (authWhere) {
          conditions.push(authWhere);
        }

        if (status && status !== 'all' && status !== 'ALL') {
          conditions.push({ status });
        }
        if (branchId && branchId !== 'all' && branchId !== 'ALL') {
          conditions.push({ branchId });
        }
        if (brand && brand !== 'all' && brand !== 'ALL') {
          conditions.push({ brand });
        }
        if (isPaidParam === 'true') {
          conditions.push({ isPaid: true });
        } else if (isPaidParam === 'false') {
          conditions.push({ isPaid: false });
        }

        if (q) {
          const cleanedId = q.replace(/^#/, '').trim();
          const digitsOnly = q.replace(/\D/g, '');
          const searchOr: any[] = [
            { id: { contains: cleanedId, mode: 'insensitive' } },
            { billNo: { contains: cleanedId, mode: 'insensitive' } },
            { proformaNumber: { contains: cleanedId, mode: 'insensitive' } },
            { customerPhone: { contains: q, mode: 'insensitive' } },
            { customerName: { contains: q, mode: 'insensitive' } },
          ];
          if (digitsOnly.length >= 6 && digitsOnly !== q) {
            searchOr.push({ customerPhone: { contains: digitsOnly } });
          }
          conditions.push({ OR: searchOr });
        }

        const whereClause = conditions.length > 0 ? { AND: conditions } : {};

        const jobsRaw = await prisma.job.findMany({
          where: whereClause,
          orderBy: { updatedAt: 'desc' },
          skip: offset,
          take: limit,
          select: JOB_SELECT_FIELDS,
        });

        const jobs = jobsRaw.map((j) => formatJobRecord(j));
        seedJobsIntoRevisionCache(jobs);

        return {
          jobs,
          totalCount: offset + jobs.length,
          limit,
          offset,
          serverTime: Date.now(),
        };
      })().finally(() => {
        inFlightSearches.delete(cacheKey);
      });

      inFlightSearches.set(cacheKey, inFlight);
    }

    const resultPayload = await inFlight;
    searchCache.set(cacheKey, {
      watermark: getRealtimeBusStatus().lastWatermarkMs,
      cachedAt: Date.now(),
      payload: resultPayload,
    });
    if (searchCache.size > 300) {
      const firstKey = searchCache.keys().next().value;
      if (firstKey) searchCache.delete(firstKey);
    }

    return NextResponse.json(resultPayload, {
      headers: {
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('[GET /api/jobs/search] Error:', error);
    return NextResponse.json(
      { error: 'Search failed', details: error?.message },
      { status: 500 }
    );
  }
}
