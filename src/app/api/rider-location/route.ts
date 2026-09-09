import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * PATCH /api/rider-location
 * Lightweight GPS-only update for Rider APK.
 * Only updates currentLat/currentLng — skips full rider update logic.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { riderId, lat, lng } = await req.json();

    if (!riderId || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'Missing riderId, lat, or lng' }, { status: 400 });
    }

    await prisma.rider.update({
      where: { id: riderId },
      data: {
        currentLat: lat,
        currentLng:  lng,
      },
    });

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
export async function GET() {
  try {
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

    return NextResponse.json(riders);
  } catch (err) {
    console.error('[rider-location] Failed to fetch locations:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

