import { Storage } from '@google-cloud/storage';

// Initialize storage
// It will automatically use credentials from GOOGLE_APPLICATION_CREDENTIALS environment variable
// Or you can pass credentials explicitly if provided in .env
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    // Fix for private key string formatting from .env
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export const bucketName = process.env.GCS_BUCKET_NAME || 'tls-images-test';

/**
 * Generate a GCS file path based on the entity type and date structure.
 * Structure: jobs/{YYYY}/{MM}/{DD}/{jobId}/{type}/filename-{timestamp}.jpg
 */
export function generateGcsPath(
  entityType: 'job' | 'rider' | 'system' | 'task',
  entityId: string,
  subType?: 'bags' | 'proofs' | 'bills' | 'avatars' | 'attachments' | 'notes',
  extension: string = 'jpg',
  customFileName?: string
): string {
  const now = new Date();
  const timestamp = now.getTime();
  const randomSuffix = Math.random().toString(36).slice(2, 7);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  if (entityType === 'rider') {
    return `riders/avatars/${entityId}/avatar-${timestamp}-${randomSuffix}.${extension}`;
  }

  if (entityType === 'job') {
    const typeFolder = subType || 'proofs';
    if (customFileName && (customFileName.startsWith('proforma-') || customFileName.startsWith('receipt-'))) {
      return `jobs/${year}/${month}/${day}/${entityId}/${typeFolder}/${customFileName}`;
    }
    return `jobs/${year}/${month}/${day}/${entityId}/${typeFolder}/img-${timestamp}-${randomSuffix}.${extension}`;
  }

  if (entityType === 'task') {
    const folder = subType || 'attachments';
    return `tasks/${year}/${month}/${entityId}/${folder}/file-${timestamp}-${randomSuffix}.${extension}`;
  }

  return `system/placeholders/file-${timestamp}-${randomSuffix}.${extension}`;
}

/**
 * Generate a V4 signed URL for uploading a file to GCS
 * @param filePath The destination path in GCS
 * @param contentType The MIME type of the file to be uploaded
 * @param expiresInMinutes Number of minutes before the URL expires
 */
export async function generateUploadUrl(filePath: string, contentType: string = 'image/jpeg', expiresInMinutes: number = 5): Promise<string> {
  const options = {
    version: 'v4' as const,
    action: 'write' as const,
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    contentType,
  };

  const [url] = await storage
    .bucket(bucketName)
    .file(filePath)
    .getSignedUrl(options);

  return url;
}

/**
 * Generate a V4 signed URL for downloading/viewing a file from GCS
 * @param filePath The path to the file in GCS
 * @param expiresInMinutes Number of minutes before the URL expires
 */
export async function generateDownloadUrl(filePath: string, expiresInMinutes: number = 30): Promise<string> {
  const options = {
    version: 'v4' as const,
    action: 'read' as const,
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  };

  const [url] = await storage
    .bucket(bucketName)
    .file(filePath)
    .getSignedUrl(options);

  return url;
}

/**
 * Helper to get public URL for files that are publicly readable (like avatars)
 */
export function getPublicUrl(filePath: string): string {
  return `https://storage.googleapis.com/${bucketName}/${filePath}`;
}

/**
 * List all files in the bucket matching a specific job ID.
 */
export async function listFilesForJob(jobId: string): Promise<Array<{ name: string; size?: string | number; created?: string; publicUrl: string }>> {
  try {
    const [files] = await storage.bucket(bucketName).getFiles();
    const matchingFiles = files.filter(f => f.name.includes(jobId));
    return matchingFiles.map(file => ({
      name: file.name,
      size: file.metadata.size,
      created: file.metadata.timeCreated ? String(file.metadata.timeCreated) : undefined,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${file.name}`
    }));
  } catch (err: any) {
    console.error('Error listing GCS files for job:', err.message);
    return [];
  }
}
