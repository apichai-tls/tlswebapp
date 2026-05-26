"use client";

import { useState, useRef } from "react";
import { UploadCloud, CheckCircle2, Loader2, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function compressImage(file: File, maxWidth = 1600, maxHeight = 1600, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return resolve(file);
    }
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return resolve(file);
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return resolve(file);
          }
          const compressedFile = new File([blob], file.name, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      resolve(file);
    };
  });
}

interface ImageUploaderProps {
  entityType: "job" | "rider" | "system";
  entityId: string;
  subType?: "bags" | "proofs" | "bills" | "avatars";
  currentImageUrl?: string;
  onUploadSuccess: (url: string, path: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function ImageUploader({ 
  entityType, 
  entityId, 
  subType, 
  currentImageUrl, 
  onUploadSuccess, 
  onError,
  className = ""
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      onError?.("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB Limit
      onError?.("File size must be less than 5MB");
      return;
    }

    // Set local preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Compress the image before uploading (evidence grade: 1600px width/height max, 85% quality)
      const compressedFile = await compressImage(file, 1600, 1600, 0.85);

      // 1. Get Signed URL from our Next.js backend
      const response = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          subType,
          contentType: compressedFile.type,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get upload authorization");
      }

      const { uploadUrl, filePath, publicUrl } = await response.json();
      setUploadProgress(50);

      // 2. Upload file directly to Google Cloud Storage
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": compressedFile.type,
        },
        body: compressedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file to Cloud Storage");
      }

      setUploadProgress(100);
      
      // 3. Construct final URL and notify parent
      // If publicUrl is provided (like for avatars), use it. 
      // Otherwise, just return the path (for private files like bills).
      const finalUrl = publicUrl || filePath; 
      onUploadSuccess(finalUrl, filePath);

      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);

    } catch (error: any) {
      console.error("Upload error:", error);
      onError?.(error.message || "An error occurred during upload");
      setIsUploading(false);
      setPreviewUrl(currentImageUrl || null);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
      />
      
      {previewUrl ? (
        <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={previewUrl} 
            alt="Preview" 
            className={`w-full h-full object-cover transition-opacity ${isUploading ? 'opacity-50 blur-sm' : ''}`}
          />
          
          {isUploading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 text-white">
              <Loader2 className="animate-spin mb-2" size={24} />
              <span className="text-xs font-bold">{uploadProgress}%</span>
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button 
                type="button"
                variant="secondary" 
                size="sm" 
                onClick={() => fileInputRef.current?.click()}
                className="h-8 text-xs bg-white text-slate-800 hover:bg-slate-100"
              >
                Change
              </Button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full aspect-square flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-500 transition-colors cursor-pointer"
        >
          <UploadCloud size={24} />
          <span className="text-xs font-semibold px-4 text-center">Click to upload photo</span>
        </button>
      )}
    </div>
  );
}
