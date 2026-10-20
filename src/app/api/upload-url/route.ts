import { NextRequest, NextResponse } from 'next/server';
import { generateGcsPath, generateUploadUrl, bucketName } from '@/lib/gcs';
import { resolveRequestUser } from '@/lib/server-auth';
import { verifyCustomerToken, verifyServiceApiKey } from '@/lib/external-api-auth';

const ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'pdf',
  'heic',
  'heif',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'zip',
  'mp4',
  'mov',
]);

const ALLOWED_ENTITY_TYPES = new Set([
  'job',
  'jobs',
  'rider',
  'riders',
  'system',
  'task',
  'tasks',
  'marketing',
  'customer',
  'customers',
]);

const SAFE_SUBTYPE_REGEX =
  /^(bags|proofs|bills|avatars|attachments|notes|slips|marketing|banners|qr|chat|logos|receipts|proformas)([_-][a-zA-Z0-9_-]{1,48})?$/;

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce staff/rider session or external API/customer authentication
    const { user } = await resolveRequestUser(request);
    const authHeader = request.headers.get('authorization');
    const hasApiKeyHeader = Boolean(request.headers.get('x-api-key') || request.headers.get('X-API-KEY'));
    const isExternalAuthorized =
      (!user || !user.isActive) &&
      ((hasApiKeyHeader && verifyServiceApiKey(request)) ||
        (authHeader ? Boolean(verifyCustomerToken(authHeader)) : false));

    if ((!user || !user.isActive) && !isExternalAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid staff or rider session required for upload' },
        { status: user && !user.isActive ? 403 : 401 }
      );
    }

    const body = await request.json();
    const { entityType, entityId, subType, contentType, fileName, filename } = body;
    const actualFileName = fileName || filename;

    // 2. Validate entityType & entityId
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 });
    }

    if (!ALLOWED_ENTITY_TYPES.has(String(entityType).trim())) {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }
    const normalizedGcsEntityType = (
      entityType === 'jobs'
        ? 'job'
        : entityType === 'riders'
          ? 'rider'
          : entityType === 'tasks'
            ? 'task'
            : ['job', 'rider', 'system', 'task'].includes(entityType)
              ? entityType
              : 'system'
    ) as 'job' | 'rider' | 'system' | 'task';

    const cleanEntityId = String(entityId).trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanEntityId)) {
      return NextResponse.json({ error: 'Invalid entityId format' }, { status: 400 });
    }

    const cleanSubType = subType ? String(subType).trim() : undefined;
    if (cleanSubType && (!SAFE_SUBTYPE_REGEX.test(cleanSubType) || cleanSubType.includes('..'))) {
      return NextResponse.json({ error: 'Invalid subType' }, { status: 400 });
    }

    const type = String(contentType || 'image/jpeg').trim().toLowerCase();
    let ext = 'jpg';
    if (actualFileName && String(actualFileName).includes('.')) {
      ext = String(actualFileName).split('.').pop()?.toLowerCase() || 'jpg';
    } else if (type.includes('/')) {
      const sub = type.split('/')[1]?.split(';')[0]?.trim() || 'jpg';
      ext = sub === 'jpeg' ? 'jpg' : sub;
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Disallowed file extension: .${ext}` },
        { status: 400 }
      );
    }

    let safeCustomFileName: string | undefined = undefined;
    if (actualFileName) {
      const base = String(actualFileName).split(/[\\/]/).pop() || '';
      if (/^(proforma|receipt)-[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp|pdf)$/i.test(base) && !base.includes('..')) {
        safeCustomFileName = base;
      }
    }

    // 3. Generate the path in GCS
    const filePath = generateGcsPath(
      normalizedGcsEntityType,
      cleanEntityId,
      cleanSubType as any,
      ext === 'jpeg' ? 'jpg' : ext,
      safeCustomFileName
    );

    // 4. Generate the signed URL for upload (expires in 5 minutes)
    const uploadUrl = await generateUploadUrl(filePath, type, 5);

    return NextResponse.json({
      uploadUrl,
      filePath,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${filePath}`,
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
