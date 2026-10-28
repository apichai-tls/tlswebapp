import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUser } from '@/lib/server-auth';

let riderLocationCache: { data: any[]; cachedAt: number } | null = null;
const RIDER_LOC_CACHE_TTL_MS = 5000;

/**
 * PATCH /api/rider-location
 * Lightweight GPS-only update for Rider APK.
 * Only updates currentLat/currentLng — skips full rider update logic.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await resolveRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Valid session required' }, { status: 401 });
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'Forbidden: Account is deactivated' }, { status: 403 });
    }

    const body = await req.json();
    const riderId = body.riderId || body.id;
    const { lat, lng } = body;

    if (!riderId || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'Missing riderId, lat, or lng' }, { status: 400 });
    }

    const role = (user.role || '').toLowerCase();
    if (role === 'rider' && riderId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Cannot update another rider location' }, { status: 403 });
    }

    await prisma.rider.update({
      where: { id: riderId },
      data: {
        currentLat: lat,
        currentLng: lng,
      },
    });
    riderLocationCache = null;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[rider-location] Failed to update GPS:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/rider-location
 * Lightweight endpoint for Admin Live Map real-time GPS polling.
 * Returns only active riders with their current coordinates and status.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await resolveRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Valid session required' }, { status: 401 });
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'Forbidden: Account is deactivated' }, { status: 403 });
    }

    if (riderLocationCache && Date.now() - riderLocationCache.cachedAt < RIDER_LOC_CACHE_TTL_MS) {
      return NextResponse.json(riderLocationCache.data);
    }

    const riders = await prisma.rider.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        nickname: true,
        status: true,
        currentLat: true,
        currentLng: true,
        branchId: true,
        avatarUrl: true,
        rating: true,
        completedJobs: true,
        vehicleType: true,
        vehiclePlate: true,
      },
    });

    riderLocationCache = { data: riders, cachedAt: Date.now() };
    return NextResponse.json(riders);
  } catch (err) {
    console.error('[rider-location] Failed to fetch locations:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
