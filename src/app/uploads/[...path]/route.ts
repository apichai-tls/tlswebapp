import { NextRequest } from 'next/server';
import { serveSecureLocalUpload } from '@/app/api/media/secure/route';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  const resolvedParams = await Promise.resolve(context.params);
  const segments = Array.isArray(resolvedParams?.path) ? resolvedParams.path : [];
  const localPath = `/uploads/${segments.join('/')}`;
  return serveSecureLocalUpload(request, localPath);
}
