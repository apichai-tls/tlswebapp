import { NextRequest, NextResponse } from 'next/server';
import { getOrFetchJobById } from '@/lib/db-cache';
import { resolveRequestUser, canUserAccessJob } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

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
    const revParam = url.searchParams.get('rev');
    const minRevision = revParam ? Number(revParam) || undefined : undefined;

    const job = await getOrFetchJobById(id, minRevision);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!canUserAccessJob(user, job)) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient branch or role permissions for this order' },
        { status: 403 }
      );
    }

    const rev = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
    const etag = `W/"job-${job.id}-${rev}"`;
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    return NextResponse.json(job, {
      headers: {
        'ETag': etag,
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('[GET /api/jobs/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
