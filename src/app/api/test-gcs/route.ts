import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { resolveRequestUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const { user } = await resolveRequestUser(req);
    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: user && !user.isActive ? 403 : 401 });
    }
    const role = (user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const projectId = process.env.GCS_PROJECT_ID;
    const clientEmail = process.env.GCS_CLIENT_EMAIL;
    const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const bucketName = process.env.GCS_BUCKET_NAME || 'tls-images-test';

    if (!projectId || !clientEmail || !privateKey) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing GCS environment variables.',
        },
        { status: 400 }
      );
    }

    const storage = new Storage({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ maxResults: 1 });

    return NextResponse.json({
      success: true,
      message: 'Connection successful!',
      details: {
        filesFound: files.length,
      },
    });
  } catch (error: any) {
    console.error('GCS Connection Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Connection failed',
      },
      { status: 500 }
    );
  }
}
