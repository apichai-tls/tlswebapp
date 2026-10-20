import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveRequestUser, canUserAccessJob } from '@/lib/server-auth';
import { generateDownloadUrl } from '@/lib/gcs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { user } = await resolveRequestUser(request);
    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid staff session required to view order media' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const gcsPath = url.searchParams.get('gcsPath');
    const localPath = url.searchParams.get('localPath');

    // 1. Signed GCS media download URL (valid for 15 minutes)
    if (gcsPath) {
      const cleanPath = gcsPath.trim();
      if (cleanPath.includes('..')) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }
      try {
        const signedUrl = await generateDownloadUrl(cleanPath, 15);
        return NextResponse.redirect(signedUrl);
      } catch (err: any) {
        return NextResponse.json({ error: 'Failed to generate signed download URL', details: err?.message }, { status: 500 });
      }
    }

    // 2. Local uploads media streaming
    if (localPath) {
      const cleanPath = localPath.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
      const fullPath = path.join(process.cwd(), cleanPath);

      if (!fs.existsSync(fullPath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.pdf': 'application/pdf',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const fileBuffer = fs.readFileSync(fullPath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': contentType,
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
