"use client";

import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { UploadCloud, Loader2, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface MultiImageUploaderRef {
  startUpload: () => Promise<string[]>;
}

interface MultiImageUploaderProps {
  entityType: "job" | "rider" | "system";
  entityId: string;
  subType?: "bags" | "proofs" | "bills" | "avatars";
  value?: string[]; // Array of pre-existing URLs
  onValueChange?: (urls: string[]) => void; // Called when existing URLs are removed
  maxFiles?: number;
  className?: string;
}

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  finalUrl?: string;
  errorMsg?: string;
}

export const MultiImageUploader = forwardRef<MultiImageUploaderRef, MultiImageUploaderProps>(
  ({ entityType, entityId, subType, value = [], onValueChange, maxFiles = 5, className = "" }, ref) => {
    const [isDragging, setIsDragging] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      startUpload: async () => {
        const filesToUpload = pendingFiles.filter((pf) => pf.status === "pending" || pf.status === "error");
        
        if (filesToUpload.length === 0) {
          return [...value, ...pendingFiles.filter(pf => pf.status === "success").map(pf => pf.finalUrl as string)];
        }

        const uploadedUrls: string[] = [];

        // We use Promise.all to upload concurrently
        await Promise.all(
          filesToUpload.map(async (uploadData) => {
            try {
              updateFileStatus(uploadData.id, { status: "uploading", progress: 10 });

              // 1. Get Signed URL
              const response = await fetch("/api/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  entityType,
                  entityId,
                  subType,
                  contentType: uploadData.file.type,
                }),
              });

              if (!response.ok) throw new Error("Failed to get upload authorization");

              const { uploadUrl, filePath, publicUrl } = await response.json();
              updateFileStatus(uploadData.id, { progress: 40 });

              // 2. Upload file
              const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": uploadData.file.type },
                body: uploadData.file,
              });

              if (!uploadResponse.ok) throw new Error("Upload failed");
              
              updateFileStatus(uploadData.id, { progress: 100 });
              const finalUrl = publicUrl || filePath;

              updateFileStatus(uploadData.id, { status: "success", finalUrl });
              uploadedUrls.push(finalUrl);
            } catch (error: any) {
              console.error(error);
              updateFileStatus(uploadData.id, { status: "error", errorMsg: error.message });
              toast.error(`Failed to upload ${uploadData.file.name}: ${error.message}`);
              throw error; // Rethrow to stop the overarching process if needed
            }
          })
        );

        // After all successful uploads, return combined array
        return [...value, ...uploadedUrls];
      }
    }));

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(Array.from(e.dataTransfer.files));
      }
    }, [value, pendingFiles]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(Array.from(e.target.files));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    const processFiles = (files: File[]) => {
      const totalFiles = value.length + pendingFiles.length + files.length;
      if (totalFiles > maxFiles) {
        toast.error(`You can only select up to ${maxFiles} images.`);
        return;
      }

      const imageFiles = files.filter(f => f.type.startsWith("image/"));
      if (imageFiles.length !== files.length) {
        toast.error("Only image files are allowed.");
      }

      const newPending: PendingFile[] = imageFiles.map(file => ({
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "pending"
      }));

      setPendingFiles(prev => [...prev, ...newPending]);
    };

    const updateFileStatus = (id: string, updates: Partial<PendingFile>) => {
      setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const handleRemoveExisting = (urlToRemove: string) => {
      onValueChange?.(value.filter(url => url !== urlToRemove));
    };

    const handleRemovePending = (id: string) => {
      setPendingFiles(prev => prev.filter(f => f.id !== id));
    };

    return (
      <div className={`space-y-4 ${className}`}>
        {/* Drop Zone */}
        {(value.length + pendingFiles.length) < maxFiles && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative w-full py-8 px-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors cursor-pointer
              ${isDragging 
                ? 'bg-indigo-50 border-indigo-400 text-indigo-600' 
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }
            `}
          >
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
            />
            <UploadCloud size={28} className={isDragging ? 'text-indigo-500' : 'text-slate-400'} />
            <div className="text-center">
              <p className="text-sm font-semibold">Click or drag images here</p>
              <p className="text-xs text-slate-400 mt-1">Up to {maxFiles} images (Max 5MB each)</p>
            </div>
          </div>
        )}

        {/* Image Grid */}
        {(value.length > 0 || pendingFiles.length > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            
            {/* Existing Uploads */}
            {value.map((url, index) => (
              <div key={`val-${index}`} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                <img src={url} alt={`Upload ${index}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveExisting(url)}
                  className="absolute top-1 right-1 bg-white/90 text-slate-700 hover:text-red-600 hover:bg-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Pending Files */}
            {pendingFiles.map((pf) => (
              <div key={pf.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                <img src={pf.previewUrl} alt="Preview" className={`w-full h-full object-cover transition-opacity ${pf.status === 'uploading' ? 'opacity-40 blur-[2px]' : ''}`} />
                
                {pf.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/10">
                    <Loader2 className="animate-spin text-indigo-600 mb-1" size={20} />
                    <span className="text-[10px] font-bold text-slate-800 bg-white/80 px-1.5 py-0.5 rounded-full">
                      {pf.progress}%
                    </span>
                  </div>
                )}

                {pf.status === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/10">
                    <div className="text-center p-2 bg-white/90 rounded-lg m-2">
                      <p className="text-[10px] text-red-600 font-semibold leading-tight">Failed</p>
                    </div>
                  </div>
                )}

                {/* Remove Button for pending/error files */}
                {(pf.status === "pending" || pf.status === "error") && (
                  <button
                    type="button"
                    onClick={() => handleRemovePending(pf.id)}
                    className="absolute top-1 right-1 bg-white/90 text-slate-700 hover:text-red-600 hover:bg-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);
MultiImageUploader.displayName = "MultiImageUploader";
