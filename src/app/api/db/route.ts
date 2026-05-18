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
      settingsRaw
    ] = await Promise.all([
      prisma.customer.findMany(),
      prisma.job.findMany({
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
          createdAt: true,
          scheduledAt: true,
          completedAt: true,
          riderId: true,
          serviceType: true,
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
          // Exclude: bagImageUrl, billImageUrl, proofImageUrl
        }
      }),
      prisma.rider.findMany(),
      prisma.serviceItem.findMany(),
      prisma.priceList.findMany(),
      prisma.shopLocation.findMany(),
      prisma.setting.findMany(),
    ]);

    // Map Raw DB data back to the format expected by the frontend
    const jobs = jobsRaw.map(j => ({
      ...j,
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


    
    const formattedRiders = riders.map(r => ({
      ...r,
      currentLocation: r.currentLat && r.currentLng ? { lat: r.currentLat, lng: r.currentLng } : undefined
    }));

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
    return NextResponse.json({
      customers: [],
      jobs: [],
      riders: [],
      services: [],
      priceLists: [],
      shopLocations: [],
      pois: [],
      settings: {}
    });
  }
}
