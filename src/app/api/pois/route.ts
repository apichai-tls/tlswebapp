import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pois = await prisma.pOI.findMany();

    const formattedPois = pois.map(p => ({
      ...p,
      coords: { lat: p.lat, lng: p.lng }
    }));

    return NextResponse.json(formattedPois);
  } catch (error) {
    console.error('Failed to read POIs from Prisma:', error);
    return NextResponse.json([]);
  }
}
