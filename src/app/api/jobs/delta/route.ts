import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JOB_SELECT_FIELDS, primeJobCache } from '@/lib/db-cache';
import { resolveRequestUser, buildJobAuthWhereClause } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const inFlightDeltaQueries = new Map<string, Promise<any>>();

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
    const sinceParam = url.searchParams.get('since');
    let sinceMs = Date.now() - 60000;
    if (sinceParam) {
      const asNum = Number(sinceParam);
      if (!isNaN(asNum) && asNum > 0) {
        sinceMs = asNum;
      } else {
        const asDate = Date.parse(sinceParam);
        if (!isNaN(asDate)) sinceMs = asDate;
      }
    }

    // Clamp lookback to max 24h so delta stays fast and lightweight
    const minAllowedMs = Date.now() - 24 * 60 * 60 * 1000;
    const effectiveSinceDate = new Date(Math.max(sinceMs, minAllowedMs));

    const authWhere = buildJobAuthWhereClause(user);
    const scopeKey = user
      ? `${user.role}:${Array.isArray(user.allowedBranchIds) ? user.allowedBranchIds.join(',') : 'ALL'}`
      : 'PUBLIC';
    const bucketKey = `${scopeKey}:${Math.floor(effectiveSinceDate.getTime() / 250)}`;

    let queryPromise = inFlightDeltaQueries.get(bucketKey);
    if (!queryPromise) {
      const jobWhere: any = authWhere
        ? {
            AND: [
              { updatedAt: { gt: effectiveSinceDate } },
              authWhere,
            ],
          }
        : { updatedAt: { gt: effectiveSinceDate } };

      queryPromise = Promise.all([
        prisma.job.findMany({
          where: jobWhere,
          orderBy: { updatedAt: 'asc' },
          take: 250,
          select: JOB_SELECT_FIELDS,
        }),
        prisma.customer.findMany({
          where: { updatedAt: { gt: effectiveSinceDate } },
          take: 100,
          include: {
            addresses: {
              orderBy: { isPrimary: 'desc' },
            },
          },
        }),
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
      ]).finally(() => {
        inFlightDeltaQueries.delete(bucketKey);
      });

      inFlightDeltaQueries.set(bucketKey, queryPromise);
    }

    const [jobsRaw, customersRaw, openShifts] = await queryPromise;
    const jobs = jobsRaw.map((j: any) => primeJobCache(j));
    const customers = customersRaw.map((c: any) => ({
      ...c,
      vatType: c.vatType || 'default',
      defaultCoords: { lat: c.defaultLat, lng: c.defaultLng },
    }));

    const maxRevision = jobs.reduce((max: number, j: any) => {
      const t = j?.updatedAt ? new Date(j.updatedAt).getTime() : 0;
      return t > max ? t : max;
    }, effectiveSinceDate.getTime());

    return NextResponse.json(
      {
        jobs,
        customers,
        openShifts,
        serverTime: Date.now(),
        maxRevision,
      },
      {
        headers: {
          'Cache-Control': 'no-cache, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('[GET /api/jobs/delta] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch delta updates', details: error?.message },
      { status: 500 }
    );
  }
}
