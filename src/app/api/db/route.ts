import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      customers,
      jobsRaw,
      riders,
      services,
      priceListsRaw,
      shopLocations,
      settingsRaw,
      lifetimeEarnings,
      monthEarnings,
      completedJobsCounts
    ] = await Promise.all([
      prisma.customer.findMany(),
      prisma.job.findMany({
        where: {
          OR: [
            { status: { notIn: ['completed', 'cancel'] } },
            { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
            // Include recently completed/cancelled jobs for Rider History (last 7 days)
            {
              status: { in: ['completed', 'cancel'] },
              completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }
          ]
        },
        orderBy: { id: 'desc' },
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
          scheduledAt: true,
          completedAt: true,
          riderId: true,
          serviceType: true,
          laundryTypes: true,
          source: true,
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
          bagImageUrl: true,
          billImageUrl: true,
          paymentChannel: true,  // ✅ was missing — caused payment channel to not persist on reload
          isPaid: true,          // ✅ was missing — caused payment status to not persist on reload
          // Exclude: proofImageUrl (deprecated)
        }
      }),
      prisma.rider.findMany(),
      prisma.serviceItem.findMany(),
      prisma.priceList.findMany(),
      prisma.shopLocation.findMany(),
      prisma.setting.findMany(),
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
    ]);

    // Map Raw DB data back to the format expected by the frontend
    const jobs = jobsRaw.map(j => ({
      ...j,
      laundryTypes: j.laundryTypes ? j.laundryTypes.split(',') : [],
      items: j.itemsJson ? JSON.parse(j.itemsJson) : [],
      legs: j.legsJson ? JSON.parse(j.legsJson) : undefined,
      pickupCoords: { lat: j.pickupLat, lng: j.pickupLng },
      dropoffCoords: { lat: j.dropoffLat, lng: j.dropoffLng },
    }));

    const priceLists = priceListsRaw.map(pl => ({
      ...pl,
      servicePrices: JSON.parse(pl.servicePrices || '{}'),
    }));

    const settings: Record<string, string> = {};
    settingsRaw.forEach(s => {
      settings[s.key] = s.value;
    });

    const formattedCustomers = customers.map(c => ({
      ...c,
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

    return NextResponse.json({
      customers: formattedCustomers,
      jobs,
      riders: formattedRiders,
      services,
      priceLists,
      shopLocations: formattedShopLocations,
      pois: [], // POIs are now lazy-loaded via /api/pois
      settings
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
