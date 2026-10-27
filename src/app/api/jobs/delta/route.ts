import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { JOB_SELECT_FIELDS, primeJobCache, sanitizeCustomerRecord } from '@/lib/db-cache';
import {
  resolveRequestUser,
  buildJobAuthWhereClause,
  canUserAccessJob,
  canAccessCustomerRecords,
  canAccessShifts
} from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const inFlightDeltaQueries = new Map<string, Promise<any>>();

function parseTimestampParam(raw: string | null): number | null {
  if (!raw) return null;
  const asNum = Number(raw);
  if (!isNaN(asNum) && asNum > 0) return asNum;
  const asDate = Date.parse(raw);
  if (!isNaN(asDate)) return asDate;
  return null;
}

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
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 250));
    const custLimit = Math.min(500, Math.max(1, Number(url.searchParams.get('custLimit')) || 100));

    const cursorUpdatedAtMs = parseTimestampParam(url.searchParams.get('cursorUpdatedAt'));
    const cursorId = url.searchParams.get('cursorId')?.trim() || null;

    const custCursorUpdatedAtMs = parseTimestampParam(url.searchParams.get('custCursorUpdatedAt'));
    const custCursorId = url.searchParams.get('custCursorId')?.trim() || null;

    const skipJobs = url.searchParams.get('skipJobs') === '1' || url.searchParams.get('skipJobs') === 'true';
    const skipCustomers = url.searchParams.get('skipCustomers') === '1' || url.searchParams.get('skipCustomers') === 'true';

    const parsedSince = parseTimestampParam(sinceParam);
    const sinceMs = parsedSince !== null ? parsedSince : Date.now() - 60000;

    // Clamp lookback to max 24h
    const minAllowedMs = Date.now() - 24 * 60 * 60 * 1000;
    const effectiveSinceDate = new Date(Math.max(sinceMs, minAllowedMs));

    const authWhere = buildJobAuthWhereClause(user);
    const isInitialPage = !cursorUpdatedAtMs && !cursorId && !custCursorUpdatedAtMs && !custCursorId && !skipJobs && !skipCustomers;
    const scopeKey = `${user.id}:${user.role}:${Array.isArray(user.allowedBranchIds) ? user.allowedBranchIds.join(',') : 'ALL'}:${limit}:${custLimit}`;
    const bucketKey = isInitialPage
      ? `${scopeKey}:init:${Math.floor(effectiveSinceDate.getTime() / 250)}`
      : `${scopeKey}:cursor:${cursorUpdatedAtMs || 0}:${cursorId || ''}:${custCursorUpdatedAtMs || 0}:${custCursorId || ''}:${skipJobs}:${skipCustomers}`;

    let queryPromise = inFlightDeltaQueries.get(bucketKey);
    if (!queryPromise) {
      // 1. Build stable composite cursor condition for Jobs: (updatedAt, id)
      let jobCursorCondition: any;
      if (cursorUpdatedAtMs !== null && cursorId) {
        const cursorDate = new Date(cursorUpdatedAtMs);
        jobCursorCondition = {
          OR: [
            { updatedAt: { gt: cursorDate } },
            { updatedAt: cursorDate, id: { gt: cursorId } },
          ],
        };
      } else if (cursorId) {
        jobCursorCondition = {
          OR: [
            { updatedAt: { gt: effectiveSinceDate } },
            { updatedAt: effectiveSinceDate, id: { gt: cursorId } },
          ],
        };
      } else {
        jobCursorCondition = { updatedAt: { gte: effectiveSinceDate } };
      }

      const jobWhere: any = authWhere
        ? { AND: [jobCursorCondition, authWhere] }
        : jobCursorCondition;

      // 2. Build stable composite cursor condition for Customers: (updatedAt, id)
      let custCursorCondition: any;
      if (custCursorUpdatedAtMs !== null && custCursorId) {
        const custCursorDate = new Date(custCursorUpdatedAtMs);
        custCursorCondition = {
          OR: [
            { updatedAt: { gt: custCursorDate } },
            { updatedAt: custCursorDate, id: { gt: custCursorId } },
          ],
        };
      } else if (custCursorId) {
        custCursorCondition = {
          OR: [
            { updatedAt: { gt: effectiveSinceDate } },
            { updatedAt: effectiveSinceDate, id: { gt: custCursorId } },
          ],
        };
      } else {
        custCursorCondition = { updatedAt: { gte: effectiveSinceDate } };
      }

      const customerWhere: any =
        user.allowedBranchIds !== 'ALL'
          ? {
              AND: [
                custCursorCondition,
                {
                  OR: [
                    { branchId: { in: [...user.allowedBranchIds, 'ONLINE', 'online'] } },
                    { branchId: null },
                    { jobs: { some: { branchId: { in: user.allowedBranchIds } } } },
                    { branchId: null },
                  ],
                },
              ],
            }
          : custCursorCondition;

      queryPromise = Promise.all([
        skipJobs
          ? Promise.resolve([])
          : prisma.job.findMany({
              where: jobWhere,
              orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
              take: limit + 1,
              select: JOB_SELECT_FIELDS,
            }),
        skipCustomers || !canAccessCustomerRecords(user)
          ? Promise.resolve([])
          : prisma.customer.findMany({
              where: customerWhere,
              orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
              take: custLimit + 1,
              include: {
                addresses: {
                  orderBy: { isPrimary: 'desc' },
                },
              },
            }),
        !isInitialPage || !canAccessShifts(user)
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
        !isInitialPage || (user.role || '').toLowerCase() !== 'rider'
          ? Promise.resolve(null)
          : prisma.job
              .findMany({
                where: {
                  status: { notIn: ['completed', 'cancel'] },
                  OR: [
                    { riderId: user.id },
                    { pickupRiderId: user.id },
                    { deliveryRiderId: user.id },
                  ],
                },
                select: { id: true },
              })
              .then((rows) => rows.map((r) => r.id)),
      ]).finally(() => {
        inFlightDeltaQueries.delete(bucketKey);
      });

      inFlightDeltaQueries.set(bucketKey, queryPromise);
    }

    const [jobsRaw, customersRaw, openShiftsRaw, activeRiderJobIds] = await queryPromise;

    const hasMoreJobs = !skipJobs && jobsRaw.length > limit;
    const pageJobsRaw = (hasMoreJobs ? jobsRaw.slice(0, limit) : jobsRaw).filter((j: any) =>
      canUserAccessJob(user, j)
    );

    const hasMoreCustomers = !skipCustomers && customersRaw.length > custLimit;
    const pageCustomersRaw = (hasMoreCustomers ? customersRaw.slice(0, custLimit) : customersRaw).filter(
      (c: any) => canAccessCustomerRecords(user, c.branchId) || (user.role || '').toLowerCase() !== 'rider'
    );

    const jobs = pageJobsRaw.map((j: any) => primeJobCache(j));
    const customers = pageCustomersRaw.map((c: any) => sanitizeCustomerRecord(c));
    const openShifts = (openShiftsRaw || []).filter((s: any) => canAccessShifts(user, s.branchId));

    const lastJob = pageJobsRaw.length > 0 ? pageJobsRaw[pageJobsRaw.length - 1] : null;
    const nextJobCursor =
      hasMoreJobs && lastJob
        ? {
            updatedAt: new Date(lastJob.updatedAt).getTime(),
            id: lastJob.id,
          }
        : null;

    const lastCustomer = pageCustomersRaw.length > 0 ? pageCustomersRaw[pageCustomersRaw.length - 1] : null;
    const nextCustomerCursor =
      hasMoreCustomers && lastCustomer
        ? {
            updatedAt: new Date(lastCustomer.updatedAt).getTime(),
            id: lastCustomer.id,
          }
        : null;

    let maxRevision = effectiveSinceDate.getTime();
    for (const j of pageJobsRaw) {
      const t = j?.updatedAt ? new Date(j.updatedAt).getTime() : 0;
      if (t > maxRevision) maxRevision = t;
    }
    for (const c of pageCustomersRaw) {
      const t = c?.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      if (t > maxRevision) maxRevision = t;
    }

    const hasMore = hasMoreJobs || hasMoreCustomers;

    return NextResponse.json(
      {
        jobs,
        customers,
        openShifts,
        ...(Array.isArray(activeRiderJobIds) ? { activeRiderJobIds } : {}),
        maxRevision,
        hasMore,
        hasMoreJobs,
        nextJobCursor,
        hasMoreCustomers,
        nextCustomerCursor,
        limit,
        custLimit,
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
