import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import {
  resolveRequestUser,
  canUserAccessJob,
  canAccessCustomerRecords,
  isAdminOrSuperadmin,
  ServerAuthUser,
} from '@/lib/server-auth';
import { generateDownloadUrl } from '@/lib/gcs';
import { resolvePortalCustomer } from '@/lib/portal-auth';

export const dynamic = 'force-dynamic';

const ALLOWED_MEDIA_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

const ALLOWED_GCS_PREFIXES = ['jobs/', 'riders/', 'tasks/', 'system/', 'customers/', 'marketing/'];

type MediaEntityKind = 'job' | 'customer' | 'task' | 'rider' | 'other';

function normalizeJobIdRef(rawId: string | null | undefined): string {
  if (!rawId) return '';
  return rawId
    .trim()
    .replace(/^(?:proforma-|receipt-|PR-|RE-)+/i, '')
    .replace(/-rev\d+$/i, '')
    .replace(/-R\d+$/i, '');
}

function extractEntityIdFromFilename(filename: string): string | null {
  const base = path.basename(filename, path.extname(filename));
  if (!base) return null;

  // 1. proforma-PR-{jobId}-rev{N} or proforma-{jobId}
  const proformaMatch = base.match(/^proforma-(?:PR-)?(.+?)(?:-rev\d+)?$/i);
  if (proformaMatch?.[1]) return proformaMatch[1];

  // 2. receipt-{jobId}
  const receiptMatch = base.match(/^receipt-(?:RE-)?(.+)$/i);
  if (receiptMatch?.[1]) return receiptMatch[1];

  // 3. Standard local upload format: {entityId}-{10_to_15_digit_timestamp}
  const tsMatch = base.match(/^(.+)-\d{10,15}$/);
  if (tsMatch?.[1]) return tsMatch[1];

  return null;
}

function parseGcsEntityPath(cleanPath: string): {
  entityKind: MediaEntityKind;
  entityId: string | null;
  hasConflictingIds: boolean;
} {
  const filenameEntityId = extractEntityIdFromFilename(cleanPath);

  if (cleanPath.startsWith('jobs/')) {
    const datedMatch = cleanPath.match(/^jobs\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\//);
    const directMatch = !datedMatch ? cleanPath.match(/^jobs\/([^/]+)\//) : null;
    const folderJobId =
      datedMatch?.[1] ||
      (directMatch?.[1] && !/^\d{4}$/.test(directMatch[1]) ? directMatch[1] : null);

    const hasConflict = Boolean(
      folderJobId &&
        filenameEntityId &&
        folderJobId !== filenameEntityId &&
        normalizeJobIdRef(folderJobId) !== normalizeJobIdRef(filenameEntityId)
    );
    return {
      entityKind: 'job',
      entityId: folderJobId || filenameEntityId,
      hasConflictingIds: hasConflict,
    };
  }

  if (cleanPath.startsWith('customers/')) {
    const datedMatch = cleanPath.match(/^customers\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\//);
    const directMatch = !datedMatch ? cleanPath.match(/^customers\/([^/]+)\//) : null;
    const folderCustomerId =
      datedMatch?.[1] ||
      (directMatch?.[1] && !/^\d{4}$/.test(directMatch[1]) ? directMatch[1] : null);

    return {
      entityKind: 'customer',
      entityId: folderCustomerId || filenameEntityId,
      hasConflictingIds: Boolean(
        folderCustomerId && filenameEntityId && folderCustomerId !== filenameEntityId
      ),
    };
  }

  if (cleanPath.startsWith('tasks/')) {
    const datedDayMatch = cleanPath.match(/^tasks\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\//);
    const datedMonthMatch = !datedDayMatch
      ? cleanPath.match(/^tasks\/\d{4}\/\d{2}\/([^/]+)\//)
      : null;
    const directMatch =
      !datedDayMatch && !datedMonthMatch ? cleanPath.match(/^tasks\/([^/]+)\//) : null;
    const folderTaskId =
      datedDayMatch?.[1] ||
      datedMonthMatch?.[1] ||
      (directMatch?.[1] && !/^\d{4}$/.test(directMatch[1]) ? directMatch[1] : null);

    return {
      entityKind: 'task',
      entityId: folderTaskId || filenameEntityId,
      hasConflictingIds: Boolean(
        folderTaskId && filenameEntityId && folderTaskId !== filenameEntityId
      ),
    };
  }

  if (cleanPath.startsWith('riders/')) {
    const avatarMatch = cleanPath.match(/^riders\/avatars\/([^/]+)\//);
    const datedMatch = !avatarMatch
      ? cleanPath.match(/^riders\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\//)
      : null;
    const directMatch = !avatarMatch && !datedMatch ? cleanPath.match(/^riders\/([^/]+)\//) : null;
    const folderRiderId =
      avatarMatch?.[1] ||
      datedMatch?.[1] ||
      (directMatch?.[1] && !/^\d{4}$/.test(directMatch[1]) ? directMatch[1] : null);

    return {
      entityKind: 'rider',
      entityId: folderRiderId || filenameEntityId,
      hasConflictingIds: false,
    };
  }

  const baseName = path.basename(cleanPath).toLowerCase();
  if (baseName.startsWith('proforma-') || baseName.startsWith('receipt-')) {
    return { entityKind: 'job', entityId: filenameEntityId, hasConflictingIds: false };
  }
  if (cleanPath.includes('/slips/')) {
    return { entityKind: 'customer', entityId: filenameEntityId, hasConflictingIds: false };
  }

  return { entityKind: 'other', entityId: filenameEntityId, hasConflictingIds: false };
}

function isTaskAssignee(assignedToId: string | null | undefined, userId: string): boolean {
  if (!assignedToId || !userId) return false;
  return assignedToId
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId.trim());
}

async function canUserAccessTaskRecord(
  user: ServerAuthUser,
  task: { id: string; createdById: string; assignedToId: string | null; jobId?: string | null }
): Promise<boolean> {
  const role = (user.role || '').toLowerCase();
  if (role === 'rider') return false;
  if (isAdminOrSuperadmin(user)) return true;
  if (task.createdById === user.id || isTaskAssignee(task.assignedToId, user.id)) {
    return true;
  }
  if (user.isDepartmentHead && user.department) {
    const deptStaff = await prisma.adminUser.findMany({
      where: { department: user.department, isActive: true },
      select: { id: true },
    });
    const deptStaffIds = new Set([user.id, ...deptStaff.map((u) => u.id)]);
    if (deptStaffIds.has(task.createdById)) return true;
    const assignees = (task.assignedToId || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (assignees.some((aid) => deptStaffIds.has(aid))) return true;
  }
  return false;
}

async function authorizeMediaEntityAccess(params: {
  user: ServerAuthUser;
  entityKind: MediaEntityKind;
  pathEntityId: string | null;
  fileSearchNeedle: string;
  explicitJobId?: string | null;
  explicitCustomerId?: string | null;
  explicitTaskId?: string | null;
  hasConflictingIds?: boolean;
}): Promise<{ allowed: boolean; status: number; error?: string }> {
  const {
    user,
    entityKind,
    pathEntityId,
    fileSearchNeedle,
    explicitJobId,
    explicitCustomerId,
    explicitTaskId,
    hasConflictingIds,
  } = params;

  if (hasConflictingIds) {
    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Attachment path contains conflicting entity identifiers',
    };
  }

  const role = (user.role || '').toLowerCase();

  // Never allow caller-supplied IDs for a different entity type or mismatched entity ID
  if (explicitJobId) {
    if (entityKind !== 'job') {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Supplied jobId cannot authorize non-job media',
      };
    }
    if (
      pathEntityId &&
      explicitJobId !== pathEntityId &&
      normalizeJobIdRef(explicitJobId) !== normalizeJobIdRef(pathEntityId)
    ) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Supplied jobId does not match the attachment owning order',
      };
    }
  }

  if (explicitCustomerId) {
    if (entityKind !== 'customer') {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Supplied customerId cannot authorize non-customer media',
      };
    }
    if (pathEntityId && explicitCustomerId !== pathEntityId) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Supplied customerId does not match the attachment owning customer',
      };
    }
  }

  if (explicitTaskId) {
    if (entityKind !== 'task') {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Supplied taskId cannot authorize non-task media',
      };
    }
    if (pathEntityId && explicitTaskId !== pathEntityId) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Supplied taskId does not match the attachment owning task',
      };
    }
  }

  // 1. JOB MEDIA AUTHORIZATION
  if (entityKind === 'job') {
    const jobSelect = {
      id: true,
      branchId: true,
      riderId: true,
      pickupRiderId: true,
      deliveryRiderId: true,
      status: true,
    };

    let jobById: any = null;
    if (pathEntityId && pathEntityId !== 'temp') {
      jobById = await prisma.job.findUnique({
        where: { id: pathEntityId },
        select: jobSelect,
      });
      if (!jobById) {
        const cleanCandidate = normalizeJobIdRef(pathEntityId);
        if (cleanCandidate && cleanCandidate !== pathEntityId) {
          jobById = await prisma.job.findUnique({
            where: { id: cleanCandidate },
            select: jobSelect,
          });
        }
        if (!jobById && cleanCandidate) {
          jobById = await prisma.job.findFirst({
            where: {
              OR: [
                { proformaNumber: `PR-${cleanCandidate}` },
                { proformaNumber: cleanCandidate },
              ],
            },
            select: jobSelect,
          });
        }
      }
    }

    let jobByRef: any = null;
    if (fileSearchNeedle && (!jobById || explicitJobId)) {
      jobByRef = await prisma.job.findFirst({
        where: {
          OR: [
            { proofImageUrl: { contains: fileSearchNeedle } },
            { pickupProofImageUrl: { contains: fileSearchNeedle } },
            { deliveryProofImageUrl: { contains: fileSearchNeedle } },
            { bagImageUrl: { contains: fileSearchNeedle } },
            { billImageUrl: { contains: fileSearchNeedle } },
            { adminNotesJson: { contains: fileSearchNeedle } },
          ],
        },
        select: jobSelect,
      });
    }

    if (jobById && jobByRef && jobById.id !== jobByRef.id) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Attachment ownership conflict between path and database record',
      };
    }

    const owningJob = jobByRef || jobById;
    if (owningJob) {
      if (
        explicitJobId &&
        explicitJobId !== owningJob.id &&
        normalizeJobIdRef(explicitJobId) !== normalizeJobIdRef(owningJob.id)
      ) {
        return {
          allowed: false,
          status: 403,
          error: 'Forbidden: Supplied jobId does not match the attachment owning order',
        };
      }
      if (!canUserAccessJob(user, owningJob)) {
        return {
          allowed: false,
          status: 403,
          error: 'Forbidden: You do not have access to this job media',
        };
      }
      return { allowed: true, status: 200 };
    }

    if (pathEntityId === 'temp' && !explicitJobId && role !== 'rider') {
      return { allowed: true, status: 200 };
    }

    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Unable to verify owning order for this job attachment',
    };
  }

  // 2. CUSTOMER MEDIA AUTHORIZATION
  if (entityKind === 'customer') {
    if (!canAccessCustomerRecords(user)) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: You do not have permission to view customer media',
      };
    }

    let custById: { id: string; branchId: string | null } | null = null;
    if (pathEntityId && pathEntityId !== 'temp') {
      custById = await prisma.customer.findUnique({
        where: { id: pathEntityId },
        select: { id: true, branchId: true },
      });
    }

    let custByRef: { id: string; branchId: string | null } | null = null;
    if (!custById && fileSearchNeedle) {
      const walletTx = await prisma.walletTransaction.findFirst({
        where: {
          OR: [
            ...(pathEntityId ? [{ id: pathEntityId }, { referenceId: pathEntityId }] : []),
            { slipImageUrl: { contains: fileSearchNeedle } },
          ],
        },
        select: { customerId: true },
      });
      if (walletTx?.customerId) {
        custByRef = await prisma.customer.findUnique({
          where: { id: walletTx.customerId },
          select: { id: true, branchId: true },
        });
      }
      if (!custByRef) {
        const topupTx = await prisma.transaction.findFirst({
          where: {
            OR: [
              ...(pathEntityId ? [{ id: pathEntityId }] : []),
              { description: { contains: fileSearchNeedle } },
            ],
          },
          select: { memberId: true },
        });
        if (topupTx?.memberId) {
          custByRef = await prisma.customer.findUnique({
            where: { id: topupTx.memberId },
            select: { id: true, branchId: true },
          });
        }
      }
    }

    if (custById && custByRef && custById.id !== custByRef.id) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Customer attachment ownership mismatch',
      };
    }

    const owningCustomer = custByRef || custById;
    if (owningCustomer) {
      if (explicitCustomerId && explicitCustomerId !== owningCustomer.id) {
        return {
          allowed: false,
          status: 403,
          error: 'Forbidden: Supplied customerId does not match the attachment owning customer',
        };
      }
      if (!canAccessCustomerRecords(user, owningCustomer.branchId)) {
        return {
          allowed: false,
          status: 403,
          error: 'Forbidden: You do not have access to customer media in this branch',
        };
      }
      return { allowed: true, status: 200 };
    }

    if (pathEntityId === 'temp' && !explicitCustomerId && role !== 'rider') {
      return { allowed: true, status: 200 };
    }

    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Unable to verify owning customer for this attachment',
    };
  }

  // 3. TASK MEDIA AUTHORIZATION
  if (entityKind === 'task') {
    if (role === 'rider') {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Riders are not permitted to access task attachments',
      };
    }

    let taskById: {
      id: string;
      createdById: string;
      assignedToId: string | null;
      jobId: string | null;
    } | null = null;

    if (pathEntityId && pathEntityId !== 'temp') {
      taskById = await prisma.task.findUnique({
        where: { id: pathEntityId },
        select: { id: true, createdById: true, assignedToId: true, jobId: true },
      });
    }

    let taskByRef: {
      id: string;
      createdById: string;
      assignedToId: string | null;
      jobId: string | null;
    } | null = null;

    if (fileSearchNeedle && (!taskById || explicitTaskId)) {
      taskByRef = await prisma.task.findFirst({
        where: {
          OR: [
            { attachmentsJson: { contains: fileSearchNeedle } },
            { notesJson: { contains: fileSearchNeedle } },
          ],
        },
        select: { id: true, createdById: true, assignedToId: true, jobId: true },
      });
    }

    if (taskById && taskByRef && taskById.id !== taskByRef.id) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Task attachment ownership mismatch',
      };
    }

    const owningTask = taskByRef || taskById;
    if (owningTask) {
      if (explicitTaskId && explicitTaskId !== owningTask.id) {
        return {
          allowed: false,
          status: 403,
          error: 'Forbidden: Supplied taskId does not match the attachment owning task',
        };
      }
      const canAccess = await canUserAccessTaskRecord(user, owningTask);
      if (!canAccess) {
        return {
          allowed: false,
          status: 403,
          error: 'Forbidden: You do not have permission to access this task attachment',
        };
      }
      return { allowed: true, status: 200 };
    }

    if (pathEntityId === 'temp' && !explicitTaskId) {
      return { allowed: true, status: 200 };
    }

    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Unable to verify owning task for this attachment',
    };
  }

  // 4. RIDER MEDIA AUTHORIZATION
  if (entityKind === 'rider') {
    if (role === 'rider' && pathEntityId && pathEntityId !== user.id) {
      return {
        allowed: false,
        status: 403,
        error: 'Forbidden: Riders can only access their own rider profile media',
      };
    }
    if (user.allowedBranchIds !== 'ALL' && pathEntityId && pathEntityId !== 'temp') {
      const rider = await prisma.rider.findUnique({
        where: { id: pathEntityId },
        select: { id: true, branchId: true },
      });
      if (rider?.branchId && !user.allowedBranchIds.includes(rider.branchId)) {
        return {
          allowed: false,
          status: 403,
          error: 'Forbidden: You do not have access to this branch rider media',
        };
      }
    }
    return { allowed: true, status: 200 };
  }

  return { allowed: true, status: 200 };
}

export async function serveSecureLocalUpload(
  request: NextRequest,
  rawLocalPath: string
): Promise<Response> {
  const { user } = await resolveRequestUser(request);
  const portalCustomer = !user ? resolvePortalCustomer(request) : null;
  if (!user && !portalCustomer) {
    return NextResponse.json(
      { error: 'Unauthorized: Valid staff or customer session required to view media' },
      { status: 401 }
    );
  }
  if (user && !user.isActive) {
    return NextResponse.json(
      { error: 'Forbidden: This account has been deactivated' },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const explicitJobId = url.searchParams.get('jobId');
  const explicitCustomerId = url.searchParams.get('customerId');
  const explicitTaskId = url.searchParams.get('taskId');

  const rawNormalized = rawLocalPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rawNormalized || rawNormalized.includes('..') || rawNormalized.includes('\0')) {
    return NextResponse.json({ error: 'Forbidden: path traversal is prohibited' }, { status: 403 });
  }

  const relativeFromRoot = rawNormalized.startsWith('public/')
    ? rawNormalized.slice('public/'.length)
    : rawNormalized.startsWith('storage/')
      ? rawNormalized.slice('storage/'.length)
      : rawNormalized;

  if (!relativeFromRoot.startsWith('uploads/')) {
    return NextResponse.json({ error: 'Forbidden: localPath must reside within /uploads/' }, { status: 403 });
  }

  const privateUploadsRoot = path.resolve(process.cwd(), 'storage', 'uploads');
  const subPathWithinUploads = relativeFromRoot.slice('uploads/'.length);
  const resolvedPath = path.resolve(privateUploadsRoot, subPathWithinUploads);

  if (!resolvedPath.startsWith(privateUploadsRoot + path.sep)) {
    return NextResponse.json({ error: 'Forbidden: path escapes uploads directory' }, { status: 403 });
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const contentType = ALLOWED_MEDIA_MIME_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: 'Forbidden: unsupported media file extension' }, { status: 403 });
  }

  const segments = subPathWithinUploads.split('/').filter(Boolean);
  const entitySegment = (segments[0] || '').toLowerCase();
  const subTypeSegment = (segments[1] || '').toLowerCase();
  const fileBaseName = path.basename(resolvedPath);

  let entityKind: MediaEntityKind = 'other';
  if (entitySegment === 'job' || entitySegment === 'jobs') {
    entityKind = 'job';
  } else if (entitySegment === 'customer' || entitySegment === 'customers') {
    entityKind = 'customer';
  } else if (entitySegment === 'task' || entitySegment === 'tasks') {
    entityKind = 'task';
  } else if (entitySegment === 'rider' || entitySegment === 'riders') {
    entityKind = 'rider';
  } else if (
    subTypeSegment.startsWith('bills') ||
    subTypeSegment.startsWith('receipts') ||
    subTypeSegment.startsWith('proformas') ||
    subTypeSegment.startsWith('proofs') ||
    subTypeSegment.startsWith('bags') ||
    fileBaseName.toLowerCase().startsWith('receipt-') ||
    fileBaseName.toLowerCase().startsWith('proforma-')
  ) {
    entityKind = 'job';
  } else if (subTypeSegment.startsWith('slips')) {
    entityKind = 'customer';
  } else if (subTypeSegment.startsWith('attachments') || subTypeSegment.startsWith('notes')) {
    entityKind = 'task';
  }

  const pathEntityId = extractEntityIdFromFilename(resolvedPath);

  if (user) {
    const authCheck = await authorizeMediaEntityAccess({
      user,
      entityKind,
      pathEntityId,
      fileSearchNeedle: fileBaseName,
      explicitJobId,
      explicitCustomerId,
      explicitTaskId,
    });

    if (!authCheck.allowed) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
  } else if (portalCustomer) {
    if (entityKind === 'rider' || entityKind === 'task') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const realBase = fs.realpathSync(privateUploadsRoot);
  const realTarget = fs.realpathSync(resolvedPath);
  if (!realTarget.startsWith(realBase + path.sep)) {
    return NextResponse.json({ error: 'Forbidden: symlink escape detected' }, { status: 403 });
  }

  const fileBuffer = fs.readFileSync(realTarget);
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await resolveRequestUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid staff session required to view order media' },
        { status: 401 }
      );
    }
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Forbidden: This account has been deactivated' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const rawFallbackPath = url.searchParams.get('path') || url.searchParams.get('url');
    const isFallbackLocal =
      rawFallbackPath &&
      (rawFallbackPath.startsWith('/uploads/') || rawFallbackPath.startsWith('uploads/'));
    const gcsPath = url.searchParams.get('gcsPath') || (!isFallbackLocal ? rawFallbackPath : null);
    const localPath = url.searchParams.get('localPath') || (isFallbackLocal ? rawFallbackPath : null);
    const explicitJobId = url.searchParams.get('jobId');
    const explicitCustomerId = url.searchParams.get('customerId');
    const explicitTaskId = url.searchParams.get('taskId');

    // 1. Signed GCS media download URL (valid for 15 minutes)
    if (gcsPath) {
      const cleanPath = gcsPath.trim().replace(/^\/+/, '');
      if (
        !cleanPath ||
        cleanPath.includes('..') ||
        cleanPath.includes('\\') ||
        !ALLOWED_GCS_PREFIXES.some((prefix) => cleanPath.startsWith(prefix))
      ) {
        return NextResponse.json({ error: 'Invalid or disallowed gcsPath' }, { status: 400 });
      }

      const parsedGcs = parseGcsEntityPath(cleanPath);
      const authCheck = await authorizeMediaEntityAccess({
        user,
        entityKind: parsedGcs.entityKind,
        pathEntityId: parsedGcs.entityId,
        fileSearchNeedle: cleanPath,
        explicitJobId,
        explicitCustomerId,
        explicitTaskId,
        hasConflictingIds: parsedGcs.hasConflictingIds,
      });

      if (!authCheck.allowed) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
      }

      try {
        const signedUrl = await generateDownloadUrl(cleanPath, 15);
        return NextResponse.redirect(signedUrl);
      } catch (err: any) {
        return NextResponse.json(
          { error: 'Failed to generate signed download URL', details: err?.message },
          { status: 500 }
        );
      }
    }

    // 2. Local uploads media streaming (strictly confined to private storage/uploads)
    if (localPath) {
      return await serveSecureLocalUpload(request, localPath);
    }

    return NextResponse.json({ error: 'gcsPath or localPath parameter is required' }, { status: 400 });
  } catch (error: any) {
    console.error('[GET /api/media/secure] Error:', error);
    return NextResponse.json({ error: 'Media retrieval error', details: error?.message }, { status: 500 });
  }
}
