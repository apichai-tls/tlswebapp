import { NextRequest, NextResponse } from 'next/server';
import { getOrFetchJobById } from '@/lib/db-cache';
import { resolveRequestUser, canUserAccessJob, runWithSessionToken } from '@/lib/server-auth';
import { updateJobAction } from '@/actions/db';

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

export async function PATCH(
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

    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken = request.cookies.get('tls_session')?.value || null;
    const sessionToken = bearerToken || cookieToken;

    const updates = await request.json();
    const result = await runWithSessionToken(sessionToken, () =>
      updateJobAction(id, { ...updates, __returnErrorObject: true })
    );

    if ((result as any)?.__actionError) {
      const status = (result as any).isConflict ? 409 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[PATCH /api/jobs/[id]] Error:', error);
    const msg = error?.message || 'Internal server error';
    const isConflict = String(msg).includes('409') || String(msg).toLowerCase().includes('conflict');
    return NextResponse.json(
      { __actionError: true, error: msg, isConflict },
      { status: isConflict ? 409 : 500 }
    );
  }
}
