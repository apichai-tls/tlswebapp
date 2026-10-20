import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JOB_SELECT_FIELDS, primeJobCache, sanitizeCustomerRecord } from '@/lib/db-cache';
import {
  resolveRequestUser,
  buildJobAuthWhereClause,
  canAccessCustomerRecords,
  canAccessShifts
} from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const inFlightDeltaQueries = new Map<string, Promise<any>>();

export async function GET(request: NextRequest) {
  try {
    const { user, explicitCredentialsProvided } = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json(
        { error: explicitCredentialsProvided ? 'Unauthorized: Invalid or expired staff session' : 'Unauthorized: Valid server-verified staff session required' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Forbidden: This account has been deactivated (Resigned)' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');
    const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit')) || 250));

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

    // Clamp lookback to max 24h
    const minAllowedMs = Date.now() - 24 * 60 * 60 * 1000;
    const effectiveSinceDate = new Date(Math.max(sinceMs, minAllowedMs));

    const authWhere = buildJobAuthWhereClause(user);
    const scopeKey = `${user.role}:${Array.isArray(user.allowedBranchIds) ? user.allowedBranchIds.join(',') : 'ALL'}:${limit}`;
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

      const customerWhere: any = {
        updatedAt: { gt: effectiveSinceDate },
      };
      if (user.allowedBranchIds !== 'ALL') {
        customerWhere.OR = [
          { branchId: { in: user.allowedBranchIds } },
          { branchId: null },
        ];
      }

      queryPromise = Promise.all([
        prisma.job.findMany({
          where: jobWhere,
          orderBy: { updatedAt: 'asc' },
          take: limit,
          select: JOB_SELECT_FIELDS,
        }),
        user.role === 'rider'
          ? Promise.resolve([])
          : prisma.customer.findMany({
              where: customerWhere,
              take: 100,
              include: {
                addresses: {
                  orderBy: { isPrimary: 'desc' },
                },
              },
            }),
        user.role === 'rider'
          ? Promise.resolve([])
          : prisma.cashierShift.findMany({
              where: {
                status: 'open',
                ...(user.allowedBranchIds !== 'ALL' ? { branchId: { in: user.allowedBranchIds } } : {}),
              },
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
    const customers = customersRaw.map((c: any) => sanitizeCustomerRecord(c));

    const maxRevision = jobs.reduce((max: number, j: any) => {
      const t = j?.updatedAt ? new Date(j.updatedAt).getTime() : 0;
      return t > max ? t : max;
    }, effectiveSinceDate.getTime());

    // Flag hasMore when the batch is full so the client fetches the next page
    // before advancing its local synchronization watermark
    const hasMore = jobsRaw.length >= limit;

    return NextResponse.json(
      {
        jobs,
        customers,
        openShifts,
        maxRevision,
        hasMore,
        limit,
        serverTime: Date.now(),
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
      { error: 'Delta fetch failed', details: error?.message },
      { status: 500 }
    );
  }
}
