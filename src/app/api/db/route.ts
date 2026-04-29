import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const customers = await prisma.customer.findMany();
    const jobsRaw = await prisma.job.findMany();
    const riders = await prisma.rider.findMany();
    const services = await prisma.serviceItem.findMany();
    const priceListsRaw = await prisma.priceList.findMany();
    const shopLocations = await prisma.shopLocation.findMany();
    const pois = await prisma.pOI.findMany();
    const settingsRaw = await prisma.setting.findMany();

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

    const formattedPois = pois.map(p => ({
      ...p,
      coords: { lat: p.lat, lng: p.lng }
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
      pois: formattedPois,
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
