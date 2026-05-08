import { NextRequest, NextResponse } from 'next/server';
import { generateGcsPath, generateUploadUrl } from '@/lib/gcs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, entityId, subType, contentType } = body;

    // Validate request
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 });
    }

    if (!['job', 'rider', 'system'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }

    const type = contentType || 'image/jpeg';
    
    // Generate the path in GCS
    const filePath = generateGcsPath(entityType as 'job' | 'rider' | 'system', entityId, subType);

    // Generate the signed URL for upload
    // The URL will expire in 5 minutes
    const uploadUrl = await generateUploadUrl(filePath, type, 5);

    return NextResponse.json({
      uploadUrl,
      filePath,
      // Provide publicUrl if it's an avatar so the frontend can preview/save it easily
      publicUrl: entityType === 'rider' ? `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME || 'tls-images-test'}/${filePath}` : undefined
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
