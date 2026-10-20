import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  dbCache,
  invalidateDbCache,
  JOB_SELECT_FIELDS,
  formatJobRecord,
  sanitizeCustomerRecord,
  computeDeterministicEtag,
  seedJobsIntoRevisionCache,
} from '@/lib/db-cache';
import { ensurePgListenerStarted } from '@/lib/realtime-bus';
import { resolveRequestUser, canUserAccessJob, type ServerAuthUser } from '@/lib/server-auth';

export { invalidateDbCache };
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 45000;           // 45s overall payload cache (patched in-place across instances via PG LISTEN/NOTIFY)
const CUSTOMERS_TTL_MS = 45000;       // 45s customer master data cache (invalidated on customer mutations)
const MASTER_DATA_TTL_MS = 60000;     // 60s services, price lists, shop locations, settings cache
const RIDER_EARNINGS_TTL_MS = 60000;  // 60s rider earnings aggregations cache

function filterPayloadForUser(payload: any, user: ServerAuthUser | null) {
  if (!user || user.allowedBranchIds === 'ALL') {
    if (user?.role === 'rider') {
      const filteredJobs = (payload.jobs || []).filter((j: any) => canUserAccessJob(user, j));
      return { ...payload, jobs: filteredJobs };
    }
    return payload;
  }
  const filteredJobs = (payload.jobs || []).filter((j: any) => canUserAccessJob(user, j));
  return { ...payload, jobs: filteredJobs };
}

export async function GET(request?: NextRequest) {
  try {
    ensurePgListenerStarted().catch(() => {});

    const { user, explicitCredentialsProvided } = await resolveRequestUser(request);
    if (explicitCredentialsProvided && (!user || !user.isActive)) {
      return NextResponse.json(
        { error: 'Unauthorized or inactive account' },
        { status: user && !user.isActive ? 403 : 401 }
      );
    }

    const forceFresh = request ? new URL(request.url).searchParams.get('fresh') === 'true' : false;
    const ifNoneMatch = request?.headers.get('if-none-match');
    const now = Date.now();
    const userScopeSuffix =
      user && (user.allowedBranchIds !== 'ALL' || user.role === 'rider')
        ? `-${user.id}`
        : '';

    // 1. HTTP 304 Not Modified: If client sends current ETag and cache is warm, return 0 bytes in 0ms!
    const currentScopedEtag = dbCache.etag
      ? userScopeSuffix
        ? dbCache.etag.replace(/"$/, `${userScopeSuffix}"`)
        : dbCache.etag
      : null;

    if (
      !forceFresh &&
      ifNoneMatch &&
      currentScopedEtag &&
      ifNoneMatch === currentScopedEtag &&
      now - dbCache.lastTime < CACHE_TTL_MS
    ) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': currentScopedEtag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    // 2. Warm In-Memory Payload Cache: Shield DB from rapid polling spikes
    if (!forceFresh && dbCache.payload && now - dbCache.lastTime < CACHE_TTL_MS) {
      const scopedPayload = filterPayloadForUser(dbCache.payload, user);
      return NextResponse.json(scopedPayload, {
        headers: {
          'ETag': currentScopedEtag || `W/"v${dbCache.version}-${dbCache.lastTime}"`,
          'X-Cache': 'HIT',
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    // 3. Singleflight Coalescer: If multiple staff clients hit /api/db simultaneously on cold cache,
    // share a single DB load promise so PostgreSQL only executes the queries once.
    if (!forceFresh && dbCache.inFlightDbLoad) {
      const basePayload = await dbCache.inFlightDbLoad;
      const scopedPayload = filterPayloadForUser(basePayload, user);
      const scopedEtag = dbCache.etag
        ? userScopeSuffix
          ? dbCache.etag.replace(/"$/, `${userScopeSuffix}"`)
          : dbCache.etag
        : `W/"v${dbCache.version}-${Date.now()}"`;

      if (ifNoneMatch && ifNoneMatch === scopedEtag) {
        return new Response(null, {
          status: 304,
          headers: {
            'ETag': scopedEtag,
            'Cache-Control': 'no-cache, must-revalidate',
          },
        });
      }

      return NextResponse.json(scopedPayload, {
        headers: {
          'ETag': scopedEtag,
          'X-Cache': 'COALESCED',
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    const loadDbPromise = (async () => {
      const fetchCustomersPromise =
        !forceFresh && dbCache.customers && now - dbCache.lastCustomersTime < CUSTOMERS_TTL_MS
          ? Promise.resolve(dbCache.customers)
          : prisma.customer
              .findMany({
                include: {
                  addresses: {
                    orderBy: { isPrimary: 'desc' },
                  },
                },
              })
              .then((res) => {
                dbCache.customers = res;
                dbCache.lastCustomersTime = Date.now();
                return res;
              });

      const fetchMasterDataPromise =
        !forceFresh && dbCache.masterData && now - dbCache.lastMasterDataTime < MASTER_DATA_TTL_MS
          ? Promise.resolve(dbCache.masterData)
          : Promise.all([
              prisma.serviceItem.findMany(),
              prisma.priceList.findMany(),
              prisma.shopLocation.findMany(),
              prisma.setting.findMany(),
            ]).then(([services, priceListsRaw, shopLocations, settingsRaw]) => {
              const res = { services, priceListsRaw, shopLocations, settingsRaw };
              dbCache.masterData = res;
              dbCache.lastMasterDataTime = Date.now();
              return res;
            });

      const fetchRiderEarningsPromise =
        !forceFresh &&
        dbCache.riderEarnings &&
        now - dbCache.lastRiderEarningsTime < RIDER_EARNINGS_TTL_MS
          ? Promise.resolve(dbCache.riderEarnings)
          : Promise.all([
              prisma.riderTransaction.groupBy({
                by: ['riderId'],
                where: {
                  type: { in: ['commission_pickup', 'commission_delivery'] },
                },
                _sum: {
                  amount: true,
                },
              }),
              prisma.riderTransaction.groupBy({
                by: ['riderId'],
                where: {
                  type: { in: ['commission_pickup', 'commission_delivery'] },
                  createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
                },
                _sum: {
                  amount: true,
                },
              }),
              prisma.riderTransaction.groupBy({
                by: ['riderId'],
                where: {
                  type: { in: ['commission_pickup', 'commission_delivery'] },
                },
                _count: {
                  id: true,
                },
              }),
            ]).then(([lifetimeEarnings, monthEarnings, completedJobsCounts]) => {
              const res = { lifetimeEarnings, monthEarnings, completedJobsCounts };
              dbCache.riderEarnings = res;
              dbCache.lastRiderEarningsTime = Date.now();
              return res;
            });

      const [customers, masterData, jobsRaw, riders, riderEarnings, openShifts] = await Promise.all([
        fetchCustomersPromise,
        fetchMasterDataPromise,
        prisma.job.findMany({
          where: {
            OR: [
              { status: { notIn: ['completed', 'cancel'] } },
              { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
              {
                status: { in: ['completed', 'cancel'] },
                OR: [
                  { completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
                  { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
                ],
              },
            ],
          },
          orderBy: { updatedAt: 'desc' },
          select: JOB_SELECT_FIELDS,
        }),
        prisma.rider.findMany(),
        fetchRiderEarningsPromise,
        prisma.cashierShift.findMany({
          where: { status: 'open' },
          select: {
            id: true,
            userId: true,
            branchId: true,
            userName: true,
            openedAt: true,
            startingCash: true,
            status: true,
          },
        }),
      ]);

      const { services, priceListsRaw, shopLocations, settingsRaw } = masterData;
      const { lifetimeEarnings, monthEarnings, completedJobsCounts } = riderEarnings;

      const jobs = jobsRaw.map((j) => formatJobRecord(j));

      const priceLists = priceListsRaw.map((pl: any) => {
        let parsedJson: any = {};
        try {
          parsedJson = JSON.parse(pl.servicePrices || '{}');
        } catch {
          parsedJson = {};
        }

        const isCorporate = Boolean(
          parsedJson.isCorporateCatalog ||
            (Array.isArray(parsedJson.customItems) && parsedJson.customItems.length > 0)
        );
        const customItems = Array.isArray(parsedJson.customItems) ? parsedJson.customItems : undefined;
        const servicePrices =
          parsedJson.servicePrices && typeof parsedJson.servicePrices === 'object'
            ? parsedJson.servicePrices
            : Array.isArray(parsedJson.customItems)
              ? {}
              : parsedJson;

        return {
          ...pl,
          isCorporate,
          customItems,
          servicePrices,
        };
      });

      const settings: Record<string, string> = {};
      settingsRaw.forEach((s: any) => {
        settings[s.key] = s.value;
      });

      const formattedCustomers = customers.map((c: any) => sanitizeCustomerRecord(c));

      const formattedShopLocations = shopLocations.map((s: any) => ({
        ...s,
        coords: { lat: s.lat, lng: s.lng },
      }));

      const formattedRiders = riders.map((r: any) => {
        const lifeSum = lifetimeEarnings.find((e: any) => e.riderId === r.id)?._sum?.amount || 0;
        const monSum = monthEarnings.find((e: any) => e.riderId === r.id)?._sum?.amount || 0;
        const jobCnt = completedJobsCounts.find((e: any) => e.riderId === r.id)?._count?.id || 0;

        return {
          ...r,
          lifetimeEarnings: lifeSum,
          monthEarnings: monSum,
          completedJobsCount: jobCnt,
          currentLocation:
            r.currentLat && r.currentLng ? { lat: r.currentLat, lng: r.currentLng } : undefined,
        };
      });

      const maxJobUpdated =
        jobs.length > 0 ? (jobs[0].updatedAt ? new Date(jobs[0].updatedAt).getTime() : 0) : 0;
      const maxCustUpdated = formattedCustomers.reduce((max: number, c: any) => {
        const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
        return t > max ? t : max;
      }, 0);

      const newEtag = computeDeterministicEtag({
        jobsCount: jobs.length,
        maxJobUpdated,
        customersCount: formattedCustomers.length,
        maxCustomerUpdated: maxCustUpdated,
        openShiftsCount: openShifts.length,
      });

      const payload = {
        customers: formattedCustomers,
        jobs,
        riders: formattedRiders,
        services,
        priceLists,
        shopLocations: formattedShopLocations,
        pois: [],
        settings,
        openShifts,
      };

      dbCache.payload = payload;
      dbCache.lastTime = Date.now();
      dbCache.etag = newEtag;
      seedJobsIntoRevisionCache(jobs);

      return payload;
    })().finally(() => {
      dbCache.inFlightDbLoad = null;
    });

    if (!forceFresh) {
      dbCache.inFlightDbLoad = loadDbPromise;
    }

    const basePayload = await loadDbPromise;
    const scopedPayload = filterPayloadForUser(basePayload, user);
    const scopedEtag = dbCache.etag
      ? userScopeSuffix
        ? dbCache.etag.replace(/"$/, `${userScopeSuffix}"`)
        : dbCache.etag
      : `W/"v${dbCache.version}-${Date.now()}"`;

    if (ifNoneMatch && ifNoneMatch === scopedEtag) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': scopedEtag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    return NextResponse.json(scopedPayload, {
      headers: {
        'ETag': scopedEtag,
        'X-Cache': 'MISS',
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to read from Prisma:', error);
    return NextResponse.json(
      {
        error: 'Database connection failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
