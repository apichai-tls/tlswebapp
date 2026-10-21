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
  entityType: 'job' | 'rider' | 'system' | 'task' | 'customer',
  entityId: string,
  subType?: 'bags' | 'proofs' | 'bills' | 'avatars' | 'attachments' | 'notes' | 'slips',
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

  if (entityType === 'customer') {
    const folder = subType || 'slips';
    return `customers/${year}/${month}/${day}/${entityId}/${folder}/file-${timestamp}-${randomSuffix}.${extension}`;
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
 * Build candidate GCS prefixes for a given jobId and date hints so we never scan the entire bucket.
 * Structure: jobs/{YYYY}/{MM}/{DD}/{jobId}/...
 */
export function buildJobGcsPrefixes(jobId: string, dateHints?: Array<Date | string | null | undefined>): string[] {
  const cleanJobId = String(jobId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanJobId) return [];

  const validDates: Date[] = [];
  if (Array.isArray(dateHints)) {
    for (const d of dateHints) {
      if (!d) continue;
      const parsed = d instanceof Date ? d : new Date(d);
      if (!isNaN(parsed.getTime())) {
        validDates.push(parsed);
      }
    }
  }

  // Also parse YYMMDD from standard TLS job IDs like ORD-261020-001 or TLS-261020-001 if present
  const idDateMatch = cleanJobId.match(/(?:^|[-_])(\d{2})(\d{2})(\d{2})(?:[-_]|$)/);
  if (idDateMatch) {
    const yy = Number(idDateMatch[1]);
    const mm = Number(idDateMatch[2]);
    const dd = Number(idDateMatch[3]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const inferred = new Date(2000 + yy, mm - 1, dd);
      if (!isNaN(inferred.getTime())) {
        validDates.push(inferred);
      }
    }
  }

  if (validDates.length === 0) {
    validDates.push(new Date());
  }

  const dayPrefixes = new Set<string>();
  const monthPrefixes = new Set<string>();

  const minTime = Math.min(...validDates.map((d) => d.getTime())) - 24 * 60 * 60 * 1000;
  const maxTime = Math.max(...validDates.map((d) => d.getTime())) + 24 * 60 * 60 * 1000;
  const spanDays = Math.ceil((maxTime - minTime) / (24 * 60 * 60 * 1000));

  if (spanDays <= 14) {
    for (let t = minTime; t <= maxTime; t += 24 * 60 * 60 * 1000) {
      const dt = new Date(t);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      dayPrefixes.add(`jobs/${yyyy}/${mm}/${dd}/${cleanJobId}/`);
    }
    return Array.from(dayPrefixes);
  }

  for (const dt of validDates) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    monthPrefixes.add(`jobs/${yyyy}/${mm}/`);
  }
  return Array.from(monthPrefixes);
}

/**
 * List files in the bucket matching a specific job ID using narrow prefix queries instead of full-bucket scans.
 */
export async function listFilesForJob(
  jobId: string,
  dateHints?: Array<Date | string | null | undefined>
): Promise<Array<{ name: string; size?: string | number; created?: string; publicUrl: string }>> {
  try {
    const cleanJobId = String(jobId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanJobId) return [];

    const prefixes = buildJobGcsPrefixes(cleanJobId, dateHints);
    const seenNames = new Set<string>();
    const results: Array<{ name: string; size?: string | number; created?: string; publicUrl: string }> = [];

    const bucket = storage.bucket(bucketName);
    for (const prefix of prefixes) {
      const [files] = await bucket.getFiles({ prefix, maxResults: 500 });
      for (const file of files) {
        if (file.name.includes(`/${cleanJobId}/`) && !seenNames.has(file.name)) {
          seenNames.add(file.name);
          results.push({
            name: file.name,
            size: file.metadata.size,
            created: file.metadata.timeCreated ? String(file.metadata.timeCreated) : undefined,
            publicUrl: `https://storage.googleapis.com/${bucketName}/${file.name}`,
          });
        }
      }
    }

    return results;
  } catch (err: any) {
    console.error('Error listing GCS files for job:', err.message);
    return [];
  }
}
