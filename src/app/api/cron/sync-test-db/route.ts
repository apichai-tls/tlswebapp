import { NextRequest, NextResponse } from 'next/server';
import { performProdToTestSync } from '@/lib/sync-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes max execution for Cloud Run / Vercel

function verifyCronSecret(req: NextRequest): boolean {
  const configuredSecret = process.env.CRON_SECRET || 'tls-cron-sync-secret-2026';
  
  // 1. Check Authorization: Bearer <secret>
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === configuredSecret) return true;
  }

  // 2. Check x-cron-secret header
  const customHeader = req.headers.get('x-cron-secret');
  if (customHeader && customHeader.trim() === configuredSecret) return true;

  // 3. Check query param: ?secret=<secret>
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (querySecret && querySecret.trim() === configuredSecret) return true;

  return false;
}

async function handleSync(req: NextRequest) {
  // 1. Authenticate request
  if (!verifyCronSecret(req)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Invalid or missing cron secret' },
      { status: 401 }
    );
  }

  // 2. Strict safety check: Must be targeting Test database
  const targetDb = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  const isTestDb = targetDb.includes('/tls_test') || process.env.APP_ENV === 'test';

  if (!isTestDb) {
    return NextResponse.json(
      {
        success: false,
        error: 'Forbidden: Incremental sync is strictly prohibited on Production environments.',
      },
      { status: 403 }
    );
  }

  // 3. Execute synchronization
  try {
    console.log('[Cron Sync] Starting Prod -> Test sync via API Route...');
    const summary = await performProdToTestSync();
    console.log(`[Cron Sync] Completed successfully in ${(summary.durationMs / 1000).toFixed(1)}s`);

    return NextResponse.json({
      success: true,
      message: 'Database synchronization completed successfully.',
      timestamp: new Date().toISOString(),
      summary: {
        totalJobsInTest: summary.totalJobsInTest,
        testJobsPreserved: summary.testJobsPreserved,
        durationSeconds: Number((summary.durationMs / 1000).toFixed(1)),
        syncedTables: summary.syncedTables,
      },
    });
  } catch (err: any) {
    console.error('[Cron Sync] Sync failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Internal error during database synchronization',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}
