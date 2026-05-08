import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

export async function GET() {
  try {
    const projectId = process.env.GCS_PROJECT_ID;
    const clientEmail = process.env.GCS_CLIENT_EMAIL;
    const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const bucketName = process.env.GCS_BUCKET_NAME || 'tls-images-test';

    if (!projectId || !clientEmail || !privateKey) {
      return NextResponse.json({
        success: false,
        message: 'Missing environment variables. Please check GCS_PROJECT_ID, GCS_CLIENT_EMAIL, and GCS_PRIVATE_KEY in .env.local',
      }, { status: 400 });
    }

    const storage = new Storage({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    const bucket = storage.bucket(bucketName);

    // Try to list files to verify permissions (max 1 file just to test access)
    const [files] = await bucket.getFiles({ maxResults: 1 });

    return NextResponse.json({
      success: true,
      message: 'Connection successful!',
      details: {
        bucket: bucketName,
        filesFound: files.length,
        projectId: projectId,
        serviceAccount: clientEmail
      }
    });

  } catch (error: any) {
    console.error('GCS Connection Error:', error);
    return NextResponse.json({
      success: false,
      message: 'Connection failed',
      error: error.message,
    }, { status: 500 });
  }
}
