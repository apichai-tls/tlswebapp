"use client";

import { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import { UploadCloud, Loader2, X, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  readOnly?: boolean;
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
  ({ entityType, entityId, subType, value = [], onValueChange, maxFiles = 5, className = "", readOnly = false }, ref) => {
    const [isDragging, setIsDragging] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const allImages = [...value, ...pendingFiles.map(pf => pf.previewUrl)];

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (previewIndex === null) return;
        if (e.key === "ArrowRight") {
          setPreviewIndex(prev => prev !== null && prev < allImages.length - 1 ? prev + 1 : prev);
        } else if (e.key === "ArrowLeft") {
          setPreviewIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev);
        } else if (e.key === "Escape") {
          setPreviewIndex(null);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [previewIndex, allImages.length]);

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

              // Compress the image before uploading (evidence grade: 1600px width/height max, 85% quality)
              const compressedFile = await compressImage(uploadData.file, 1600, 1600, 0.85);
              let finalUrl = "";

              try {
                // 1. Get Signed URL
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

                if (!response.ok) throw new Error("Failed to get upload authorization");

                const { uploadUrl, filePath, publicUrl } = await response.json();
                updateFileStatus(uploadData.id, { progress: 40 });

                // 2. Upload file directly to Cloud Storage
                const uploadResponse = await fetch(uploadUrl, {
                  method: "PUT",
                  headers: { "Content-Type": compressedFile.type },
                  body: compressedFile,
                });

                if (!uploadResponse.ok) throw new Error("Cloud storage upload failed");
                
                finalUrl = publicUrl || filePath;
              } catch (gcsError: any) {
                console.warn("GCS Upload failed, falling back to local filesystem upload:", gcsError.message);
                updateFileStatus(uploadData.id, { progress: 50 });

                // Fallback: POST file directly to Next.js API /api/upload-local
                const localFormData = new FormData();
                localFormData.append("file", compressedFile);
                localFormData.append("entityType", entityType);
                localFormData.append("entityId", entityId);
                if (subType) localFormData.append("subType", subType);

                const fallbackResponse = await fetch("/api/upload-local", {
                  method: "POST",
                  body: localFormData,
                });

                if (!fallbackResponse.ok) {
                  const errData = await fallbackResponse.json().catch(() => ({}));
                  throw new Error(errData.error || "Local upload fallback failed");
                }

                const fallbackData = await fallbackResponse.json();
                finalUrl = fallbackData.publicUrl;
              }
              
              updateFileStatus(uploadData.id, { progress: 100 });
              updateFileStatus(uploadData.id, { status: "success", finalUrl });
              uploadedUrls.push(finalUrl);
            } catch (error: any) {
              console.error("Upload process error:", error);
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
      if (imageFiles.length === 0) {
        toast.error("No valid image files found.");
        return;
      }
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
      if (window.confirm("คุณต้องการลบรูปภาพนี้ใช่หรือไม่? (Are you sure you want to delete this image?)")) {
        onValueChange?.(value.filter(url => url !== urlToRemove));
      }
    };

    const handleRemovePending = (id: string) => {
      if (window.confirm("คุณต้องการลบรูปภาพนี้ใช่หรือไม่? (Are you sure you want to delete this image?)")) {
        setPendingFiles(prev => prev.filter(f => f.id !== id));
      }
    };

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      if (readOnly) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      
      if (files.length > 0) {
        e.preventDefault(); // Prevent default paste behavior
        processFiles(files);
        toast.success(`Pasted ${files.length} image(s) from clipboard!`);
      }
    }, [readOnly, value, pendingFiles, maxFiles]);

    return (
      <div 
        className={`space-y-4 outline-none focus-within:ring-2 focus-within:ring-indigo-50/50 rounded-xl transition-all ${className}`}
        tabIndex={readOnly ? undefined : 0}
        onPaste={handlePaste}
      >
        {/* Drop Zone */}
        {(value.length + pendingFiles.length) < maxFiles && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative w-full py-2 px-3 flex items-center justify-between gap-2 rounded-xl border border-dashed transition-colors cursor-text
              ${isDragging 
                ? 'bg-indigo-50 border-indigo-400 text-indigo-600' 
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }
            `}
            title="Click here and press Ctrl+V to paste images"
          >
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <UploadCloud size={16} className={isDragging ? 'text-indigo-500' : 'text-slate-400 shrink-0'} />
              <div>
                <p className="text-[11px] font-medium hidden sm:block">Click to focus & paste (Ctrl+V)</p>
                <p className="text-[11px] font-medium sm:hidden">Paste images here</p>
              </div>
            </div>
            
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="h-6 text-[10px] px-2 rounded-lg bg-white shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Browse
            </Button>
          </div>
        )}

        {/* Image Grid */}
        {(value.length > 0 || pendingFiles.length > 0) && (
          <div className="flex flex-wrap gap-2">
            
            {/* Existing Uploads */}
            {value.map((url, index) => (
              <div 
                key={`val-${index}`} 
                className="relative group w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm cursor-pointer"
                onClick={() => setPreviewIndex(index)}
              >
                <img src={url} alt={`Upload ${index}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveExisting(url);
                    }}
                    className="absolute top-1 right-1 bg-white/90 text-slate-700 hover:text-red-600 hover:bg-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}

            {/* Pending Files */}
            {pendingFiles.map((pf, index) => (
              <div 
                key={pf.id} 
                className="relative group w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer"
                onClick={() => setPreviewIndex(value.length + index)}
              >
                <img src={pf.previewUrl} alt="Preview" className={`w-full h-full object-cover transition-all ${pf.status === 'uploading' ? 'opacity-40 blur-[2px]' : 'group-hover:scale-105'}`} />
                
                {pf.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/10 pointer-events-none">
                    <Loader2 className="animate-spin text-indigo-600 mb-1" size={20} />
                    <span className="text-[10px] font-bold text-slate-800 bg-white/80 px-1.5 py-0.5 rounded-full">
                      {pf.progress}%
                    </span>
                  </div>
                )}

                {pf.status === "error" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/10 pointer-events-none">
                    <div className="text-center p-2 bg-white/90 rounded-lg m-2">
                      <p className="text-[10px] text-red-600 font-semibold leading-tight">Failed</p>
                    </div>
                  </div>
                )}

                {/* Remove Button for pending/error files */}
                {(pf.status === "pending" || pf.status === "error") && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePending(pf.id);
                    }}
                    className="absolute top-1 right-1 bg-white/90 text-slate-700 hover:text-red-600 hover:bg-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Read-Only Empty State */}
        {readOnly && value.length === 0 && (
          <div className="flex gap-2">
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden border border-slate-200 border-dashed bg-slate-50 flex flex-col items-center justify-center text-slate-300">
              <ImageIcon size={16} className="mb-0.5" />
              <span className="text-[8px] font-medium uppercase">Empty</span>
            </div>
          </div>
        )}

        {/* Lightbox Modal */}
        {previewIndex !== null && (
          <div 
            className="fixed inset-0 z-[9999] bg-slate-900/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm cursor-pointer"
            onClick={() => setPreviewIndex(null)}
          >
            <button 
              className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white hover:text-red-400 bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors z-10"
              onClick={() => setPreviewIndex(null)}
            >
              <X size={24} />
            </button>
            
            {previewIndex > 0 && (
              <button 
                className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 text-white hover:text-indigo-400 bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors z-10"
                onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex - 1); }}
              >
                <ChevronLeft size={32} />
              </button>
            )}

            <img 
              src={allImages[previewIndex]} 
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border border-white/10" 
              alt={`Preview ${previewIndex + 1}`} 
              onClick={(e) => e.stopPropagation()} 
            />

            {previewIndex < allImages.length - 1 && (
              <button 
                className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 text-white hover:text-indigo-400 bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors z-10"
                onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex + 1); }}
              >
                <ChevronRight size={32} />
              </button>
            )}
            
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-4 py-1.5 rounded-full backdrop-blur-md pointer-events-none">
              {previewIndex + 1} / {allImages.length}
            </div>
          </div>
        )}
      </div>
    );
  }
);
MultiImageUploader.displayName = "MultiImageUploader";
