import { getClientAuthHeaders } from "@/lib/client-auth";

export interface CompressedPhotoResult {
  file: File;
  previewUrl: string;
  originalBytes: number;
  compressedBytes: number;
  compressMs: number;
  width?: number;
  height?: number;
}

export interface CapturedPhotoEntry {
  id: string;
  previewUrl: string;
  file: File;
  subType: string;
  jobId: string;
  originalBytes: number;
  compressedBytes: number;
  compressMs: number;
  status: "uploading" | "uploaded" | "pending_retry";
  uploadedUrl?: string;
  uploadMs?: number;
  viaFallback?: boolean;
  uploadPromise?: Promise<string>;
}

export interface RiderUploadBatchMetrics {
  flow: "complete_pickup" | "complete_delivery" | "vehicle_load" | "job_chat";
  photoCount: number;
  preUploadedCount: number;
  fallbackCount: number;
  originalKB: number;
  compressedKB: number;
  compressMs: number;
  confirmUploadWaitMs: number;
}

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_JPEG_QUALITY = 0.78;
const SKIP_COMPRESSION_MAX_BYTES = 320 * 1024; // Already <= 320 KB

function loadHtmlImage(blobUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = blobUrl;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas JPEG encoding returned null"));
      },
      "image/jpeg",
      quality
    );
  });
}

/**
 * Resizes and compresses a camera photo on-device before upload.
 * Keeps full readability for room numbers / laundry bag tags (1600px max edge, 0.78 JPEG)
 * while reducing typical 2-4 MB mobile photos down to ~180-250 KB.
 * Uses Object URLs instead of multi-MB Base64 strings to keep mobile WebView memory low.
 */
export async function compressRiderImage(
  input: File | Blob,
  options?: {
    maxDimension?: number;
    quality?: number;
    fileName?: string;
  }
): Promise<CompressedPhotoResult> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const originalBytes = input.size || 0;
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;
  const baseName = (options?.fileName || (input instanceof File ? input.name : "rider-photo"))
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
  const targetFileName = `${baseName || "rider-photo"}.jpg`;

  try {
    let srcWidth = 0;
    let srcHeight = 0;
    let bitmap: ImageBitmap | null = null;
    let imgEl: HTMLImageElement | null = null;
    let tempDecodeUrl: string | null = null;

    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(input);
        srcWidth = bitmap.width;
        srcHeight = bitmap.height;
      } catch {
        bitmap = null;
      }
    }

    if (!bitmap) {
      tempDecodeUrl = URL.createObjectURL(input);
      try {
        imgEl = await loadHtmlImage(tempDecodeUrl);
        srcWidth = imgEl.naturalWidth || imgEl.width;
        srcHeight = imgEl.naturalHeight || imgEl.height;
      } finally {
        if (tempDecodeUrl) {
          URL.revokeObjectURL(tempDecodeUrl);
          tempDecodeUrl = null;
        }
      }
    }

    if (!srcWidth || !srcHeight) {
      if (bitmap) bitmap.close();
      throw new Error("Invalid image dimensions");
    }

    const longestEdge = Math.max(srcWidth, srcHeight);
    const isAlreadySmallJpeg =
      longestEdge <= maxDimension &&
      originalBytes > 0 &&
      originalBytes <= SKIP_COMPRESSION_MAX_BYTES &&
      (input.type === "image/jpeg" || input.type === "image/jpg");

    if (isAlreadySmallJpeg) {
      if (bitmap) bitmap.close();
      const passthroughFile =
        input instanceof File
          ? input
          : new File([input], targetFileName, { type: "image/jpeg" });
      const elapsed = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
      );
      return {
        file: passthroughFile,
        previewUrl: URL.createObjectURL(passthroughFile),
        originalBytes,
        compressedBytes: passthroughFile.size,
        compressMs: elapsed,
        width: srcWidth,
        height: srcHeight,
      };
    }

    const scale = longestEdge > maxDimension ? maxDimension / longestEdge : 1;
    const targetWidth = Math.max(1, Math.round(srcWidth * scale));
    const targetHeight = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      if (bitmap) bitmap.close();
      throw new Error("2D canvas context unavailable");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();
      bitmap = null;
    } else if (imgEl) {
      ctx.drawImage(imgEl, 0, 0, targetWidth, targetHeight);
      imgEl = null;
    }

    const compressedBlob = await canvasToJpegBlob(canvas, quality);
    // Release backing store immediately on mobile WebView
    canvas.width = 0;
    canvas.height = 0;

    // Only keep compressed output if it is actually smaller or dimensions were scaled down
    const finalBlob =
      compressedBlob.size < originalBytes || scale < 1 ? compressedBlob : input;
    const finalType = finalBlob === compressedBlob ? "image/jpeg" : input.type || "image/jpeg";
    const finalFile =
      finalBlob instanceof File && finalBlob.name === targetFileName
        ? finalBlob
        : new File([finalBlob], targetFileName, { type: finalType });

    const elapsed = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    );

    return {
      file: finalFile,
      previewUrl: URL.createObjectURL(finalFile),
      originalBytes,
      compressedBytes: finalFile.size,
      compressMs: elapsed,
      width: targetWidth,
      height: targetHeight,
    };
  } catch (err) {
    console.warn("[RiderImage] Compression fallback to original file:", err);
    const fallbackFile =
      input instanceof File
        ? input
        : new File([input], targetFileName, { type: input.type || "image/jpeg" });
    const elapsed = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    );
    return {
      file: fallbackFile,
      previewUrl: URL.createObjectURL(fallbackFile),
      originalBytes,
      compressedBytes: fallbackFile.size,
      compressMs: elapsed,
    };
  }
}

/**
 * Uploads a single photo directly to GCS via signed URL with automatic fallback to /api/upload-local.
 */
export async function uploadRiderPhotoWithFallback(params: {
  file: File;
  jobId: string;
  subType: string;
}): Promise<{ url: string; uploadMs: number; viaFallback: boolean }> {
  const { file, jobId, subType } = params;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const actualContentType = file.type || "image/jpeg";

  try {
    const response = await fetch("/api/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getClientAuthHeaders(),
      },
      body: JSON.stringify({
        entityType: "job",
        entityId: jobId,
        subType,
        contentType: actualContentType,
      }),
    });

    if (!response.ok) {
      throw new Error(`Upload auth HTTP ${response.status}`);
    }

    const { uploadUrl, publicUrl, filePath } = await response.json();
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": actualContentType },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`GCS PUT HTTP ${uploadResponse.status}`);
    }

    const elapsed = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    );
    return {
      url: publicUrl || filePath,
      uploadMs: elapsed,
      viaFallback: false,
    };
  } catch (gcsErr: any) {
    console.warn(
      "[RiderImage] Direct GCS upload failed, falling back to /api/upload-local:",
      gcsErr?.message || gcsErr
    );
    const localFormData = new FormData();
    localFormData.append("file", file);
    localFormData.append("entityType", "job");
    localFormData.append("entityId", jobId);
    localFormData.append("subType", subType);

    const fallbackRes = await fetch("/api/upload-local", {
      method: "POST",
      headers: { ...getClientAuthHeaders() },
      body: localFormData,
    });
    if (!fallbackRes.ok) {
      const errData = await fallbackRes.json().catch(() => ({}));
      throw new Error(errData.error || "Upload fallback failed");
    }
    const fallbackData = await fallbackRes.json();
    const elapsed = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    );
    return {
      url: fallbackData.publicUrl,
      uploadMs: elapsed,
      viaFallback: true,
    };
  }
}

export function revokePhotoEntries(entries?: CapturedPhotoEntry[] | null) {
  if (!entries || entries.length === 0) return;
  for (const entry of entries) {
    if (entry?.previewUrl && entry.previewUrl.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(entry.previewUrl);
      } catch {}
    }
  }
}
