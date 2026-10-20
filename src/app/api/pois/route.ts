import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { user } = await resolveRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Valid session required' }, { status: 401 });
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'Forbidden: Account is deactivated' }, { status: 403 });
    }

    const pois = await prisma.pOI.findMany();

    const formattedPois = pois.map((p) => ({
      ...p,
      coords: { lat: p.lat, lng: p.lng },
    }));

    return NextResponse.json(formattedPois);
  } catch (error) {
    console.error('Failed to read POIs from Prisma:', error);
    return NextResponse.json([]);
  }
}
