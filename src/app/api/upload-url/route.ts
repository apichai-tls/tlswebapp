import { NextRequest, NextResponse } from 'next/server';
import { generateGcsPath, generateUploadUrl, bucketName } from '@/lib/gcs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, entityId, subType, contentType, fileName } = body;

    // Validate request
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 });
    }

    if (!['job', 'rider', 'system', 'task'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }

    const type = contentType || 'application/octet-stream';
    let ext = 'jpg';
    if (fileName && fileName.includes('.')) {
      ext = fileName.split('.').pop() || 'bin';
    } else if (type.includes('/')) {
      const sub = type.split('/')[1];
      ext = sub === 'jpeg' ? 'jpg' : sub;
    }
    
    // Generate the path in GCS
    const filePath = generateGcsPath(entityType as 'job' | 'rider' | 'system' | 'task', entityId, subType, ext);

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
