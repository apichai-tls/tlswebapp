import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dbCache, invalidateDbCache } from '@/lib/db-cache';

export { invalidateDbCache };
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 6000;            // 6s overall payload cache
const CUSTOMERS_TTL_MS = 30000;        // 30s customer master data cache
const MASTER_DATA_TTL_MS = 60000;      // 60s services, price lists, shop locations, settings cache
const RIDER_EARNINGS_TTL_MS = 60000;   // 60s rider earnings aggregations cache

export async function GET(request?: NextRequest) {
  try {
    const forceFresh = request ? new URL(request.url).searchParams.get('fresh') === 'true' : false;
    const ifNoneMatch = request?.headers.get('if-none-match');
    const now = Date.now();

    // 1. HTTP 304 Not Modified: If client sends current ETag and cache is warm, return 0 bytes in 0ms!
    if (!forceFresh && ifNoneMatch && dbCache.etag && ifNoneMatch === dbCache.etag && (now - dbCache.lastTime < CACHE_TTL_MS)) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': dbCache.etag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    // 2. Warm In-Memory Payload Cache: Shield DB from rapid polling spikes
    if (!forceFresh && dbCache.payload && (now - dbCache.lastTime < CACHE_TTL_MS)) {
      return NextResponse.json(dbCache.payload, {
        headers: {
          'ETag': dbCache.etag || `W/"v${dbCache.version}-${dbCache.lastTime}"`,
          'X-Cache': 'HIT',
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    // 3. Layered Data Fetching:
    // Execute dynamic queries (Jobs, Shifts, Riders) in parallel with conditional cached loaders
    const fetchCustomersPromise = (!forceFresh && dbCache.customers && (now - dbCache.lastCustomersTime < CUSTOMERS_TTL_MS))
      ? Promise.resolve(dbCache.customers)
      : prisma.customer.findMany({
          include: {
            addresses: {
              orderBy: { isPrimary: 'desc' }
            }
          }
        }).then(res => {
          dbCache.customers = res;
          dbCache.lastCustomersTime = now;
          return res;
        });

    const fetchMasterDataPromise = (!forceFresh && dbCache.masterData && (now - dbCache.lastMasterDataTime < MASTER_DATA_TTL_MS))
      ? Promise.resolve(dbCache.masterData)
      : Promise.all([
          prisma.serviceItem.findMany(),
          prisma.priceList.findMany(),
          prisma.shopLocation.findMany(),
          prisma.setting.findMany(),
        ]).then(([services, priceListsRaw, shopLocations, settingsRaw]) => {
          const res = { services, priceListsRaw, shopLocations, settingsRaw };
          dbCache.masterData = res;
          dbCache.lastMasterDataTime = now;
          return res;
        });

    const fetchRiderEarningsPromise = (!forceFresh && dbCache.riderEarnings && (now - dbCache.lastRiderEarningsTime < RIDER_EARNINGS_TTL_MS))
      ? Promise.resolve(dbCache.riderEarnings)
      : Promise.all([
          prisma.riderTransaction.groupBy({
            by: ['riderId'],
            where: {
              type: { in: ['commission_pickup', 'commission_delivery'] }
            },
            _sum: {
              amount: true
            }
          }),
          prisma.riderTransaction.groupBy({
            by: ['riderId'],
            where: {
              type: { in: ['commission_pickup', 'commission_delivery'] },
              createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
            },
            _sum: {
              amount: true
            }
          }),
          prisma.riderTransaction.groupBy({
            by: ['riderId'],
            where: {
              type: { in: ['commission_pickup', 'commission_delivery'] }
            },
            _count: {
              id: true
            }
          })
        ]).then(([lifetimeEarnings, monthEarnings, completedJobsCounts]) => {
          const res = { lifetimeEarnings, monthEarnings, completedJobsCounts };
          dbCache.riderEarnings = res;
          dbCache.lastRiderEarningsTime = now;
          return res;
        });

    const [
      customers,
      masterData,
      jobsRaw,
      riders,
      riderEarnings,
      openShifts
    ] = await Promise.all([
      fetchCustomersPromise,
      fetchMasterDataPromise,
      prisma.job.findMany({
        where: {
          OR: [
            { status: { notIn: ['completed', 'cancel'] } },
            { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
            // Include recently completed/cancelled jobs for Rider History & Admin (last 7 days)
            {
              status: { in: ['completed', 'cancel'] },
              OR: [
                { completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
                { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
              ]
            }
          ]
        },
        orderBy: { updatedAt: 'desc' },
        select: {
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
        }
      }),
      prisma.rider.findMany(),
      fetchRiderEarningsPromise,
      // All currently open cashier shifts — cheap single query
      prisma.cashierShift.findMany({
        where: { status: 'open' },
        select: { id: true, userId: true, branchId: true, userName: true, openedAt: true, startingCash: true, status: true }
      })
    ]);

    const { services, priceListsRaw, shopLocations, settingsRaw } = masterData;
    const { lifetimeEarnings, monthEarnings, completedJobsCounts } = riderEarnings;

    // Map Raw DB data back to the format expected by the frontend
    const jobs = jobsRaw.map(j => ({
      ...j,
      laundryTypes: j.laundryTypes ? j.laundryTypes.split(',') : [],
      items: j.itemsJson ? JSON.parse(j.itemsJson) : [],
      legs: j.legsJson ? JSON.parse(j.legsJson) : undefined,
      pickupCoords: { lat: j.pickupLat, lng: j.pickupLng },
      dropoffCoords: { lat: j.dropoffLat, lng: j.dropoffLng },
    }));

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
      const servicePrices = parsedJson.servicePrices && typeof parsedJson.servicePrices === 'object'
        ? parsedJson.servicePrices
        : (Array.isArray(parsedJson.customItems) ? {} : parsedJson);

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

    const formattedCustomers = customers.map(c => ({
      ...c,
      vatType: c.vatType || "default",
      defaultCoords: { lat: c.defaultLat, lng: c.defaultLng }
    }));

    const formattedShopLocations = shopLocations.map(s => ({
      ...s,
      coords: { lat: s.lat, lng: s.lng }
    }));

    const formattedRiders = riders.map(r => {
      const lifeSum = lifetimeEarnings.find(e => e.riderId === r.id)?._sum?.amount || 0;
      const monSum = monthEarnings.find(e => e.riderId === r.id)?._sum?.amount || 0;
      const jobCnt = completedJobsCounts.find(e => e.riderId === r.id)?._count?.id || 0;
      
      return {
        ...r,
        lifetimeEarnings: lifeSum,
        monthEarnings: monSum,
        completedJobsCount: jobCnt,
        currentLocation: r.currentLat && r.currentLng ? { lat: r.currentLat, lng: r.currentLng } : undefined
      };
    });

    // Derive revision hash for cache invalidation & conditional 304
    const maxJobUpdated = jobs.length > 0 ? (jobs[0].updatedAt ? new Date(jobs[0].updatedAt).getTime() : 0) : 0;
    const newEtag = `W/"v${dbCache.version}-${jobs.length}-${maxJobUpdated}"`;

    const payload = {
      customers: formattedCustomers,
      jobs,
      riders: formattedRiders,
      services,
      priceLists,
      shopLocations: formattedShopLocations,
      pois: [], // POIs are lazy-loaded via /api/pois
      settings,
      openShifts
    };

    dbCache.payload = payload;
    dbCache.lastTime = now;
    dbCache.etag = newEtag;

    // Check if client sent this exact ETag even when cache refreshed
    if (ifNoneMatch && ifNoneMatch === newEtag) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': newEtag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    return NextResponse.json(payload, {
      headers: {
        'ETag': newEtag,
        'X-Cache': 'MISS',
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to read from Prisma:', error);
    return NextResponse.json(
      { 
        error: 'Database connection failed', 
        details: error instanceof Error ? error.message : String(error) 
      }, 
      { status: 500 }
    );
  }
}
