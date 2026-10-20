import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { resolveRequestUser, canUserAccessJob, canAccessCustomerRecords, ServerAuthUser } from '@/lib/server-auth';
import { generateDownloadUrl } from '@/lib/gcs';

export const dynamic = 'force-dynamic';

const ALLOWED_MEDIA_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

const ALLOWED_GCS_PREFIXES = ['jobs/', 'riders/', 'tasks/', 'system/', 'customers/', 'marketing/'];

function extractJobIdFromGcsPath(cleanPath: string): string | null {
  // Match jobs/{YYYY}/{MM}/{DD}/{jobId}/...
  const datedMatch = cleanPath.match(/^jobs\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\//);
  if (datedMatch?.[1]) return datedMatch[1];
  // Match jobs/{jobId}/...
  const directMatch = cleanPath.match(/^jobs\/([^/]+)\//);
  if (directMatch?.[1] && !/^\d{4}$/.test(directMatch[1])) return directMatch[1];
  return null;
}

function extractJobIdFromLocalFilename(filename: string): string | null {
  const base = path.basename(filename, path.extname(filename));
  // Standard local upload format: {entityId}-{13_digit_timestamp}
  const tsMatch = base.match(/^(.+)-\d{10,15}$/);
  if (tsMatch?.[1]) return tsMatch[1];
  const docMatch = base.match(/^(?:proforma|receipt)-(.+)$/i);
  if (docMatch?.[1]) return docMatch[1];
  return null;
}

async function authorizeMediaEntityAccess(
  user: ServerAuthUser,
  entityKind: 'job' | 'customer' | 'other',
  jobIdCandidate: string | null
): Promise<{ allowed: boolean; status: number; error?: string }> {
  const role = (user.role || '').toLowerCase();

  if (entityKind === 'customer') {
    if (!canAccessCustomerRecords(user)) {
      return { allowed: false, status: 403, error: 'Forbidden: You do not have permission to view customer media' };
    }
    return { allowed: true, status: 200 };
  }

  if (entityKind === 'job') {
    if (jobIdCandidate && jobIdCandidate !== 'temp') {
      const job = await prisma.job.findUnique({
        where: { id: jobIdCandidate },
        select: {
          id: true,
          branchId: true,
          riderId: true,
          pickupRiderId: true,
          deliveryRiderId: true,
          status: true,
        },
      });
      if (job) {
        if (!canUserAccessJob(user, job)) {
          return { allowed: false, status: 403, error: 'Forbidden: You do not have access to this job media' };
        }
        return { allowed: true, status: 200 };
      }
    }

    // If rider requests job media without a verifiable job assignment, deny access
    if (role === 'rider') {
      return { allowed: false, status: 403, error: 'Forbidden: Riders can only access media for their assigned jobs' };
    }
  }

  return { allowed: true, status: 200 };
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
    const gcsPath = url.searchParams.get('gcsPath');
    const localPath = url.searchParams.get('localPath');
    const explicitJobId = url.searchParams.get('jobId');

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

      const entityKind: 'job' | 'customer' | 'other' = cleanPath.startsWith('jobs/')
        ? 'job'
        : cleanPath.startsWith('customers/')
          ? 'customer'
          : 'other';
      const jobIdCandidate = explicitJobId || extractJobIdFromGcsPath(cleanPath);

      const authCheck = await authorizeMediaEntityAccess(user, entityKind, jobIdCandidate);
      if (!authCheck.allowed) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
      }

      try {
        const signedUrl = await generateDownloadUrl(cleanPath, 15);
        return NextResponse.redirect(signedUrl);
      } catch (err: any) {
        return NextResponse.json({ error: 'Failed to generate signed download URL', details: err?.message }, { status: 500 });
      }
    }

    // 2. Local uploads media streaming (strictly confined to public/uploads)
    if (localPath) {
      const rawNormalized = localPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
      if (!rawNormalized || rawNormalized.includes('..') || rawNormalized.includes('\0')) {
        return NextResponse.json({ error: 'Forbidden: path traversal is prohibited' }, { status: 403 });
      }

      // Strip optional leading "public/" so both "/uploads/..." and "public/uploads/..." map inside public/uploads
      const relativeFromPublic = rawNormalized.startsWith('public/')
        ? rawNormalized.slice('public/'.length)
        : rawNormalized;

      if (!relativeFromPublic.startsWith('uploads/')) {
        return NextResponse.json({ error: 'Forbidden: localPath must reside within /uploads/' }, { status: 403 });
      }

      const baseUploadsRoot = path.resolve(process.cwd(), 'public', 'uploads');
      const subPathWithinUploads = relativeFromPublic.slice('uploads/'.length);
      const resolvedPath = path.resolve(baseUploadsRoot, subPathWithinUploads);

      if (!resolvedPath.startsWith(baseUploadsRoot + path.sep)) {
        return NextResponse.json({ error: 'Forbidden: path escapes uploads directory' }, { status: 403 });
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = ALLOWED_MEDIA_MIME_TYPES[ext];
      if (!contentType) {
        return NextResponse.json({ error: 'Forbidden: unsupported media file extension' }, { status: 403 });
      }

      const segments = subPathWithinUploads.split('/').filter(Boolean);
      const entitySegment = (segments[0] || '').toLowerCase();
      const entityKind: 'job' | 'customer' | 'other' =
        entitySegment === 'job' || entitySegment === 'jobs'
          ? 'job'
          : entitySegment === 'customer' || entitySegment === 'customers'
            ? 'customer'
            : 'other';

      const jobIdCandidate = explicitJobId || extractJobIdFromLocalFilename(resolvedPath);
      const authCheck = await authorizeMediaEntityAccess(user, entityKind, jobIdCandidate);
      if (!authCheck.allowed) {
        return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
      }

      if (!fs.existsSync(resolvedPath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const realBase = fs.realpathSync(baseUploadsRoot);
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

    return NextResponse.json({ error: 'gcsPath or localPath parameter is required' }, { status: 400 });
  } catch (error: any) {
    console.error('[GET /api/media/secure] Error:', error);
    return NextResponse.json({ error: 'Media retrieval error', details: error?.message }, { status: 500 });
  }
}
