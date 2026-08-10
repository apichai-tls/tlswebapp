import { NextRequest, NextResponse } from 'next/server';
import { generateGcsPath, generateUploadUrl, bucketName } from '@/lib/gcs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, entityId, subType, contentType, filename } = body;

    // Validate request
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 });
    }

    if (!['job', 'rider', 'system'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }

    const type = contentType || 'image/jpeg';

    // Generate the path in GCS — use custom filename if provided
    let filePath: string;
    if (filename) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const typeFolder = subType || 'proofs';
      const sanitized = (filename as string).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      filePath = `jobs/${year}/${month}/${day}/${entityId}/${typeFolder}/${sanitized}`;
    } else {
      filePath = generateGcsPath(entityType as 'job' | 'rider' | 'system', entityId, subType);
    }

    // Generate the signed URL for upload (expires in 5 minutes)
    const uploadUrl = await generateUploadUrl(filePath, type, 5);

    return NextResponse.json({
      uploadUrl,
      filePath,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${filePath}`
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
