"use client";

import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { Logo } from "@/components/logo";
import { useJobs } from "@/lib/use-jobs";
import { jobStore, shopStore, type Job } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { getUserAssignedBranchIds } from "@/components/branch-filter-dropdown";
import { formatJobDisplayId, getJobPackingCounts } from "@/lib/utils";
import { toast } from "sonner";
import {
  Camera,
  Search,
  LogOut,
  X,
  Loader2,
  CheckCircle2,
  Receipt,
  AlertCircle,
  LayoutDashboard,
  Tag,
  CreditCard,
  Package,
  Users,
  CalendarClock,
  Truck,
  Map as MapIcon,
  Calculator,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  RotateCw,
  RotateCcw,
  ClipboardCheck,
  ClipboardList,
  Menu,
  Droplets,
  ExternalLink,
  ImagePlus,
  ArrowUpDown,
  Store,
  Smartphone,
  Sparkles,
  FileText,
  Clock,
  ShoppingBag,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { NotificationBell } from "@/components/notification-bell";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GCS_BASE = "https://storage.googleapis.com/tls-images-test";

/** Parse billImageUrl (JSON array / single URL / relative path) → string[] */
function parseBillUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    let parsed = JSON.parse(raw);
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { /* ignore */ }
    }
    const urls: string[] = Array.isArray(parsed) ? parsed : [parsed];
    return urls
      .filter((u): u is string => typeof u === "string" && !u.includes("proforma-") && !u.includes("receipt-"))
      .map((u) => {
        if (!u.startsWith("http") && !u.startsWith("/")) {
          return `${GCS_BASE}/${u.replace(/^["'\\]+|["'\\]+$/g, "")}`;
        }
        return u;
      })
      .filter(Boolean);
  } catch {
    if (typeof raw === "string" && (raw.includes("proforma-") || raw.includes("receipt-"))) return [];
    if (!raw.startsWith("http") && !raw.startsWith("/")) return [`${GCS_BASE}/${raw}`];
    return [raw];
  }
}

/** Compress and optionally rotate image before upload (max 1600px, 85 % JPEG quality) */
function compressImage(file: File, maxDim = 1280, quality = 0.82, rotation = 0): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const { width, height } = img;
      
      const isSwapped = rotation === 90 || rotation === 270;
      const canvasWidth = isSwapped ? height : width;
      const canvasHeight = isSwapped ? width : height;

      let finalWidth = canvasWidth;
      let finalHeight = canvasHeight;

      if (canvasWidth > maxDim || canvasHeight > maxDim) {
        if (canvasWidth > canvasHeight) {
          finalHeight = Math.round((canvasHeight * maxDim) / canvasWidth);
          finalWidth = maxDim;
        } else {
          finalWidth = Math.round((canvasWidth * maxDim) / canvasHeight);
          finalHeight = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext("2d")!;

      if (rotation !== 0) {
        ctx.translate(finalWidth / 2, finalHeight / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        const drawWidth = isSwapped ? finalHeight : finalWidth;
        const drawHeight = isSwapped ? finalWidth : finalHeight;
        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      } else {
        ctx.drawImage(img, 0, 0, finalWidth, finalHeight);
      }

      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

function getBranchShortLabel(name?: string | null): string {
  if (!name) return "";
  return name
    .replace(/^That Laundry Shop\s*[-–—]?\s*/i, "")
    .replace(/^TLS\s*[-–—]?\s*/i, "")
    .trim();
}

// ---------------------------------------------------------------------------
// BillingJobCard
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { label: string; className: string; accentBar: string; dot: string }> = {
  tba: { label: "TBA", className: "bg-slate-100 text-slate-600 border-slate-300", accentBar: "bg-slate-400", dot: "bg-slate-400" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200", accentBar: "bg-amber-500", dot: "bg-amber-500" },
  pickup: { label: "Pickup", className: "bg-amber-50 text-amber-700 border-amber-200", accentBar: "bg-amber-500", dot: "bg-amber-500" },
  billing: { label: "In Process", className: "bg-indigo-50 text-indigo-700 border-indigo-200", accentBar: "bg-indigo-600", dot: "bg-indigo-600" },
  delivery: { label: "Delivery", className: "bg-sky-50 text-sky-700 border-sky-200", accentBar: "bg-sky-500", dot: "bg-sky-500" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200", accentBar: "bg-emerald-500", dot: "bg-emerald-500" },
  cancel: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200", accentBar: "bg-red-500", dot: "bg-red-500" },
  return: { label: "Return", className: "bg-rose-50 text-rose-700 border-rose-200", accentBar: "bg-rose-500", dot: "bg-rose-500" },
};

function BillingJobCard({
  job,
  branchName,
  onUpload,
  onFinish,
}: {
  job: Job;
  branchName?: string;
  onUpload?: () => void;
  onFinish?: () => void;
}) {
  const { user } = useAuth();
  const canDeletePhoto = user?.role === "admin";
  const [billUrls, setBillUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{
    file: File;
    rotation: number;
    previewUrl: string;
    preCompressedPromise?: Promise<File>;
    preSignedUrlPromise?: Promise<{ uploadUrl: string; publicUrl: string } | null>;
  } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Keep bill URLs in sync with job data (updated via polling / store), preserving any in-flight blob: optimistic previews
  useEffect(() => {
    const serverUrls = parseBillUrls(job.billImageUrl);
    setBillUrls((prev) => {
      const optimisticBlobs = prev.filter((u) => u.startsWith("blob:"));
      if (optimisticBlobs.length === 0) return serverUrls;
      return [...serverUrls, ...optimisticBlobs].slice(0, 4);
    });
  }, [job.billImageUrl]);

  const requestSignedBillUrl = async (): Promise<{ uploadUrl: string; publicUrl: string } | null> => {
    try {
      const { getClientAuthHeaders } = await import("@/lib/api");
      const res = await fetch("/api/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          entityType: "job",
          entityId: job.id,
          subType: "bills",
          contentType: "image/jpeg",
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // ---- Camera selection → pre-warm compression & signed URL immediately while user previews ----
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = ""; // allow re-selecting same file

    const remainingSlots = 4 - billUrls.length;
    if (remainingSlots <= 0) {
      toast.error("Maximum 4 photos per job");
      return;
    }

    // If user selected multiple photos from Gallery at once, upload them all in parallel immediately!
    if (files.length > 1) {
      const batch = files.slice(0, remainingSlots);
      await uploadMultipleFilesFast(batch);
      return;
    }

    const file = files[0];
    const previewUrl = URL.createObjectURL(file);
    // Start compressing 0-deg image AND fetching signed GCS URL in the background right now!
    const preCompressedPromise = compressImage(file, 1280, 0.82, 0);
    const preSignedUrlPromise = requestSignedBillUrl();

    setPendingPhoto({
      file,
      rotation: 0,
      previewUrl,
      preCompressedPromise,
      preSignedUrlPromise,
    });
  };

  // ---- Fast parallel batch upload for multi-file Gallery selection ----
  const uploadMultipleFilesFast = async (files: File[]) => {
    if (files.length === 0) return;
    if (onUpload) onUpload();
    const tempBlobUrls = files.map((f) => URL.createObjectURL(f));
    const baseUrls = parseBillUrls(job.billImageUrl);
    setBillUrls([...baseUrls, ...tempBlobUrls].slice(0, 4));
    setUploading(true);

    try {
      const uploadedPublicUrls = await Promise.all(
        files.map(async (file) => {
          const [compressed, signed] = await Promise.all([
            compressImage(file, 1280, 0.82, 0),
            requestSignedBillUrl(),
          ]);
          if (!signed?.uploadUrl || !signed?.publicUrl) {
            throw new Error("Failed to get upload URL");
          }
          const put = await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: compressed,
          });
          if (!put.ok) throw new Error("Upload to storage failed");
          return signed.publicUrl;
        })
      );

      const finalUrls = [...baseUrls, ...uploadedPublicUrls].slice(0, 4);
      setBillUrls(finalUrls);
      const savedJob = await jobStore.updateJobDetails(job.id, {
        billImageUrl: JSON.stringify(finalUrls),
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role,
      } as any);
      if ((savedJob as any)?._saveStatus === "failed") {
        throw new Error("Failed to save bill photos to database");
      }
      toast.success(`Uploaded ${uploadedPublicUrls.length} bill photos ✅`);
    } catch (err) {
      console.error("Batch upload error:", err);
      setBillUrls(parseBillUrls(job.billImageUrl));
      toast.error("Upload failed. Please try again.");
    } finally {
      tempBlobUrls.forEach((u) => URL.revokeObjectURL(u));
      setUploading(false);
    }
  };

  // ---- Execute upload with instant modal dismissal & pre-warmed compression/signed URL ----
  const executeUpload = async () => {
    if (!pendingPhoto) return;
    if (billUrls.length >= 4) {
      toast.error("Maximum 4 photos per job");
      return;
    }

    const snapshot = pendingPhoto;
    // Close the modal IMMEDIATELY so staff can keep working with zero lag!
    setPendingPhoto(null);
    if (onUpload) onUpload();

    const baseUrls = parseBillUrls(job.billImageUrl);
    // Show optimistic thumbnail in the card slot right away
    setBillUrls([...baseUrls, snapshot.previewUrl].slice(0, 4));
    setUploading(true);

    try {
      // Reuse pre-compressed 0° file and pre-fetched signed URL (already running while user was previewing!)
      const [compressed, signed] = await Promise.all([
        snapshot.rotation === 0 && snapshot.preCompressedPromise
          ? snapshot.preCompressedPromise
          : compressImage(snapshot.file, 1280, 0.82, snapshot.rotation),
        snapshot.preSignedUrlPromise
          ? snapshot.preSignedUrlPromise.then((res) => res || requestSignedBillUrl())
          : requestSignedBillUrl(),
      ]);

      if (!signed?.uploadUrl || !signed?.publicUrl) {
        throw new Error("Failed to get upload URL");
      }

      // PUT file to GCS
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": compressed.type || "image/jpeg" },
        body: compressed,
      });
      if (!put.ok) throw new Error("Upload failed");

      const latestServerUrls = parseBillUrls(job.billImageUrl);
      const newUrls = [...latestServerUrls, signed.publicUrl].slice(0, 4);
      setBillUrls(newUrls);

      const savedJob = await jobStore.updateJobDetails(job.id, {
        billImageUrl: JSON.stringify(newUrls),
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role,
      } as any);
      if ((savedJob as any)?._saveStatus === "failed") {
        throw new Error("Failed to save bill photo to database");
      }
      toast.success("Bill uploaded successfully ✅");
    } catch (err) {
      console.error("Upload error:", err);
      setBillUrls(parseBillUrls(job.billImageUrl));
      toast.error("Upload failed. Please try again.");
    } finally {
      URL.revokeObjectURL(snapshot.previewUrl);
      setUploading(false);
    }
  };

  // ---- Delete a bill image ----
  const handleDelete = async (index: number) => {
    if (!canDeletePhoto) {
      toast.error("เฉพาะ Admin เท่านั้นที่สามารถลบรูปภาพได้");
      return;
    }
    const newUrls = billUrls.filter((_, i) => i !== index);
    try {
      await jobStore.updateJobDetails(job.id, {
        billImageUrl: newUrls.length > 0 ? JSON.stringify(newUrls) : (null as any),
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role,
      } as any);
      setBillUrls(newUrls);
      toast.success("Photo deleted successfully");
    } catch {
      toast.error("Failed to delete photo");
    }
  };

  const status = statusConfig[job.status] || statusConfig.billing;

  const rawDate = job.scheduledAt || job.deliveryScheduledAt || job.createdAt;
  const displayDate = rawDate
    ? new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(rawDate))
    : "";

  const isWalkIn = job.source === "pos" || (job.type as string) === "in_store";
  const displayId = formatJobDisplayId(job.id);
  const packing = getJobPackingCounts(job);
  const itemCount = Array.isArray(job.items)
    ? job.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
    : 0;

  // Filter out system tags and keep only actual customer/staff remark
  const cleanRemark = job.remark
    ? job.remark
        .split(" | ")
        .map((part) => part.trim())
        .filter((part) => {
          if (!part) return false;
          const lower = part.toLowerCase();
          if (lower.startsWith("proforma:")) return false;
          if (lower.startsWith("discount:")) return false;
          if (lower.startsWith("vat:")) return false;
          if (lower.startsWith("promo:")) return false;
          if (lower.startsWith("revision:")) return false;
          if (lower.startsWith("express")) return false;
          if (lower.startsWith("pickup:")) return false;
          if (lower.startsWith("delivery:")) return false;
          if (lower === "free delivery") return false;
          if (lower === "req tax inv") return false;
          if (lower.startsWith("tax inv")) return false;
          return true;
        })
        .map((part) => part.replace(/^crm\s*remark:\s*/i, "").trim())
        .filter(Boolean)
        .join(" | ")
        .trim()
    : "";

  const hasPhotos = billUrls.length > 0;

  return (
    <>
      <div
        className={`group relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
          hasPhotos
            ? "border-emerald-300 ring-2 ring-emerald-500/15 shadow-md"
            : "border-slate-200/90 hover:border-indigo-300 hover:shadow-md shadow-xs"
        }`}
      >
        {/* Top Color Accent Bar */}
        <div className={`h-1.5 w-full ${hasPhotos ? "bg-emerald-500" : status.accentBar}`} />

        {/* ---- Card Top & Metadata ---- */}
        <div className="p-4 pb-3 space-y-2.5">
          {/* Row 1: Order ID + Badges + Status Pill */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-slate-900 text-white tracking-tight">
                #{displayId}
              </span>
              {branchName && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80 truncate max-w-[120px]">
                  {branchName}
                </span>
              )}
              {isWalkIn ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                  Walk-In
                </span>
              ) : (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                  Delivery
                </span>
              )}
            </div>

            <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${status.className}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>

          {/* Row 2: Customer Name & Amount/Items Info */}
          <div className="flex items-baseline justify-between gap-2 pt-0.5">
            <h3 className="text-base font-black text-slate-900 tracking-tight truncate leading-snug">
              {job.customerName || "General Customer"}
            </h3>
            {typeof job.totalAmount === "number" && job.totalAmount > 0 && (
              <span className="shrink-0 text-sm font-black text-slate-900 tabular-nums">
                ฿{job.totalAmount.toLocaleString()}
              </span>
            )}
          </div>

          {/* Row 3: Date, Bill No, Item Count, Hanger/Folded */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-500 font-semibold">
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Clock size={12} className="shrink-0" />
              {displayDate}
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              {job.billNo && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                  <FileText size={10} />
                  {job.billNo}
                </span>
              )}
              {itemCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                  {itemCount} pcs
                </span>
              )}
              {(packing.hangerCount > 0 || packing.foldedCount > 0) && (
                <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-extrabold">
                  {packing.hangerCount > 0 ? `H:${packing.hangerCount}` : ""}
                  {packing.hangerCount > 0 && packing.foldedCount > 0 ? " " : ""}
                  {packing.foldedCount > 0 ? `F:${packing.foldedCount}` : ""}
                </span>
              )}
            </div>
          </div>

          {/* Cleaned Remark */}
          {cleanRemark && (
            <div className="flex items-start gap-1.5 bg-rose-50/90 text-rose-700 rounded-xl px-2.5 py-1.5 border border-rose-200/70">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span className="text-[11px] font-bold leading-tight line-clamp-2">{cleanRemark}</span>
            </div>
          )}
        </div>

        {/* ---- 4-Slot Photo Strip & Upload Controls ---- */}
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-2.5">
          {/* 4 Visual Photo Slots */}
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((slotIdx) => {
              const url = billUrls[slotIdx];
              if (url) {
                return (
                  <div
                    key={slotIdx}
                    className="relative aspect-square rounded-xl border-2 border-emerald-300 overflow-hidden bg-white shadow-xs group/slot"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Bill ${slotIdx + 1}`}
                      className="w-full h-full object-cover cursor-pointer transition-transform group-hover/slot:scale-105"
                      onClick={() => setPreviewUrl(url)}
                    />
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.2 bg-black/65 text-white text-[9px] font-black rounded">
                      #{slotIdx + 1}
                    </span>
                    {canDeletePhoto && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(slotIdx);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-600/90 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-colors cursor-pointer"
                        title="ลบรูปภาพ (Admin only)"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={slotIdx}
                  type="button"
                  disabled={uploading}
                  onClick={() => cameraInputRef.current?.click()}
                  className="aspect-square rounded-xl border border-dashed border-slate-300 bg-white/80 hover:bg-indigo-50/50 hover:border-indigo-300 flex flex-col items-center justify-center gap-0.5 text-slate-300 hover:text-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
                  title={`Slot ${slotIdx + 1} — Tap to take photo`}
                >
                  <Camera size={14} />
                  <span className="text-[9px] font-bold">{slotIdx + 1}/4</span>
                </button>
              );
            })}
          </div>

          {/* Hidden Inputs: Camera (mobile APK rear camera) & Gallery/File picker */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleCapture}
            className="hidden"
          />

          {/* Action Buttons */}
          {billUrls.length < 4 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm transition-all active:scale-[0.98] cursor-pointer shadow-xs ${
                  uploading
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : billUrls.length > 0
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Camera size={16} />
                    <span>{billUrls.length > 0 ? `Add Photo (${billUrls.length}/4)` : `Take Photo (0/4)`}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2.5 rounded-xl font-bold text-xs bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
                title="Choose image from Gallery or Computer"
              >
                <ImagePlus size={15} className="text-indigo-600" />
                <span>Gallery</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl font-extrabold py-2">
              <CheckCircle2 size={15} />
              <span>All 4 Bill Photos Uploaded</span>
            </div>
          )}

          {/* Finish Button - shown once at least 1 photo is uploaded */}
          {billUrls.length > 0 && onFinish && (
            <button
              type="button"
              onClick={onFinish}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Finish & Mark Done ({billUrls.length}/4)</span>
            </button>
          )}
        </div>
      </div>

      {/* ---- Image Preview Lightbox ---- */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-sm cursor-pointer"
            onClick={() => setPreviewUrl(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* ---- Image Preview & Rotate Modal ---- */}
      {pendingPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 pb-8 safe-bottom">
          {/* Header */}
          <div className="flex justify-between items-center text-white shrink-0 pt-2">
            <div>
              <h4 className="text-sm font-extrabold tracking-wide">
                Order #{displayId} — {job.customerName || "Customer"}
              </h4>
              <p className="text-[11px] text-slate-400">พรีวิวและจัดหมุนรูปภาพบิลก่อนอัปโหลด (Preview & Rotate)</p>
            </div>
            <button
              onClick={() => {
                URL.revokeObjectURL(pendingPhoto.previewUrl);
                setPendingPhoto(null);
              }}
              className="w-9 h-9 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Image display */}
          <div className="flex-1 flex items-center justify-center overflow-hidden my-4">
            <div className="relative max-w-full max-h-[60vh] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingPhoto.previewUrl}
                alt="To upload"
                style={{ transform: `rotate(${pendingPhoto.rotation}deg)` }}
                className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-2xl border border-white/10 transition-transform duration-200"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4 shrink-0 px-2 w-full max-w-md mx-auto">
            {/* Rotation Control Buttons */}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setPendingPhoto((prev) => (prev ? { ...prev, rotation: (prev.rotation - 90 + 360) % 360 } : null))}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs active:scale-95 transition-all border border-white/10 cursor-pointer"
              >
                <RotateCcw size={14} />
                หมุนซ้าย (90° Left)
              </button>
              <button
                onClick={() => setPendingPhoto((prev) => (prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null))}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs active:scale-95 transition-all border border-white/10 cursor-pointer"
              >
                <RotateCw size={14} />
                หมุนขวา (90° Right)
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  URL.revokeObjectURL(pendingPhoto.previewUrl);
                  setPendingPhoto(null);
                }}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-sm border border-white/10 active:scale-95 transition-all cursor-pointer"
              >
                ยกเลิก (Cancel)
              </button>
              <button
                onClick={executeUpload}
                disabled={uploading}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    กำลังอัปโหลด...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    บันทึกรูปภาพ (Upload)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type StageFilter = "all" | "billing" | "delivery" | "completed" | "walk_in" | "uploaded";

export default function BillingPage() {
  const { user, logout } = useAuth();
  const jobs = useJobs();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [visibleLimit, setVisibleLimit] = useState<number>(48);
  const [isSyncingManual, setIsSyncingManual] = useState(false);

  // Track jobs that were uploaded in this session, to keep them visible until finished
  const [sessionUploadedJobIds, setSessionUploadedJobIds] = useState<Set<string>>(new Set());
  // Track jobs that the user clicked "Finish" on, to hide them immediately
  const [hiddenJobIds, setHiddenJobIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("billing_finished_job_ids");
      if (saved) {
        setHiddenJobIds(JSON.parse(saved));
      }
    } catch {}
  }, []);

  useEffect(() => {
    setVisibleLimit(48);
  }, [search, stageFilter, selectedBranch, sortOrder]);

  const handleFinish = (jobId: string) => {
    setHiddenJobIds((prev) => {
      const next = Array.from(new Set([...prev, jobId]));
      try {
        localStorage.setItem("billing_finished_job_ids", JSON.stringify(next.slice(-500)));
      } catch {}
      return next;
    });
    setSessionUploadedJobIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
    toast.success("Saved & removed from queue ✅");
  };

  const handleManualSync = async () => {
    if (isSyncingManual) return;
    setIsSyncingManual(true);
    try {
      const m = await import("@/lib/api");
      await m.api.reconcileDelta();
      toast.success("Synced latest orders ✅");
    } catch {
      toast.error("Sync failed");
    } finally {
      setIsSyncingManual(false);
    }
  };

  // Check billing permission
  const hasAccess = (key: string) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (key === "dashboard" || key === "tasks" || key === "calculator") return true;
    return user.permissions?.includes(key);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const [isMounted, setIsMounted] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Pull-to-refresh state and touch event handling
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);

  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    isRefreshingRef.current = isPullRefreshing;
  }, [isPullRefreshing]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const isAtTop = window.scrollY <= 5;
      if (isAtTop && !isRefreshingRef.current) {
        touchStartY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshingRef.current) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;

      if (diff > 0) {
        const distance = Math.min(100, Math.pow(diff, 0.85));
        pullDistanceRef.current = distance;
        setPullDistance(distance);

        if (diff > 10) {
          if (e.cancelable) e.preventDefault();
        }
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;

      const currentDistance = pullDistanceRef.current;

      if (currentDistance >= 60 && !isRefreshingRef.current) {
        setIsPullRefreshing(true);
        isRefreshingRef.current = true;
        setPullDistance(60);
        pullDistanceRef.current = 60;

        toast.promise(
          import("@/lib/api").then(async (m) => {
            await m.api.reconcileDelta();
            await new Promise((r) => setTimeout(r, 400));
          }),
          {
            loading: "Syncing latest bills...",
            success: "Updated successfully ✅",
            error: "Sync failed ❌",
          }
        );

        setTimeout(() => {
          setIsPullRefreshing(false);
          isRefreshingRef.current = false;
          setPullDistance(0);
          pullDistanceRef.current = 0;
        }, 600);
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    setIsMounted(true);
    import("@capacitor/core").then(({ Capacitor }) => {
      setIsNative(Capacitor.isNativePlatform());
    });
  }, []);

  const branchMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of shopLocations) {
      map[s.id] = getBranchShortLabel(s.name) || s.name;
    }
    return map;
  }, [shopLocations]);

  const availableBranches = useMemo(() => {
    if (!user || user.role === "admin") return shopLocations;
    if ((user.area && user.area !== "ALL") || (user.branchId && user.branchId !== "all" && user.branchId !== "ALL")) {
      const allowedIds = new Set(getUserAssignedBranchIds(user, shopLocations));
      return shopLocations.filter((s) => allowedIds.has(s.id));
    }
    return shopLocations;
  }, [user, shopLocations]);

  // Base eligible jobs (before stage/search filters) so stage pill counts stay accurate
  const baseEligibleJobs = useMemo(() => {
    const cutOffDate = new Date("2026-05-28T00:00:00.000Z");
    const allowedStatuses = ["billing", "delivery", "completed"];

    return jobs.filter((j) => {
      if (!allowedStatuses.includes(j.status)) return false;
      if (hiddenJobIds.includes(j.id)) return false;

      const hasUploadedBills = parseBillUrls(j.billImageUrl).length > 0;
      if (hasUploadedBills && !sessionUploadedJobIds.has(j.id)) {
        return false;
      }

      if (new Date(j.createdAt) < cutOffDate) return false;

      if (
        user &&
        user.role !== "admin" &&
        ((user.area && user.area !== "ALL") || (user.branchId && user.branchId !== "all" && user.branchId !== "ALL")) &&
        shopLocations.length > 0
      ) {
        const allowedIds = getUserAssignedBranchIds(user, shopLocations);
        if (!j.branchId || !allowedIds.includes(j.branchId)) return false;
      }

      if (selectedBranch !== "all" && j.branchId !== selectedBranch) {
        return false;
      }

      return true;
    });
  }, [jobs, hiddenJobIds, sessionUploadedJobIds, user, shopLocations, selectedBranch]);

  const stageCounts = useMemo(() => {
    let process = 0;
    let delivery = 0;
    let completed = 0;
    let walkIn = 0;
    let uploaded = 0;

    for (const j of baseEligibleJobs) {
      if (j.status === "billing") process++;
      else if (j.status === "delivery") delivery++;
      else if (j.status === "completed") completed++;

      if (j.source === "pos" || (j.type as string) === "in_store") walkIn++;
      if (sessionUploadedJobIds.has(j.id) || parseBillUrls(j.billImageUrl).length > 0) uploaded++;
    }

    return {
      all: baseEligibleJobs.length,
      billing: process,
      delivery,
      completed,
      walk_in: walkIn,
      uploaded,
    };
  }, [baseEligibleJobs, sessionUploadedJobIds]);

  const billingJobs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return baseEligibleJobs
      .filter((j) => {
        if (stageFilter === "billing" && j.status !== "billing") return false;
        if (stageFilter === "delivery" && j.status !== "delivery") return false;
        if (stageFilter === "completed" && j.status !== "completed") return false;
        if (stageFilter === "walk_in" && !(j.source === "pos" || (j.type as string) === "in_store")) return false;
        if (stageFilter === "uploaded" && !sessionUploadedJobIds.has(j.id) && parseBillUrls(j.billImageUrl).length === 0) return false;

        if (!q) return true;
        const displayId = formatJobDisplayId(j.id).toLowerCase();
        return (
          j.id.toLowerCase().includes(q) ||
          displayId.includes(q) ||
          (j.customerName || "").toLowerCase().includes(q) ||
          (j.customerPhone || "").toLowerCase().includes(q) ||
          (j.billNo || "").toLowerCase().includes(q) ||
          ((j as any).proformaNumber || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Keep session-uploaded items pinned near top if user is actively working on them
        const aUploaded = sessionUploadedJobIds.has(a.id) ? 1 : 0;
        const bUploaded = sessionUploadedJobIds.has(b.id) ? 1 : 0;
        if (aUploaded !== bUploaded) return bUploaded - aUploaded;

        const timeA = new Date(a.scheduledAt || a.deliveryScheduledAt || a.createdAt).getTime();
        const timeB = new Date(b.scheduledAt || b.deliveryScheduledAt || b.createdAt).getTime();
        return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
      });
  }, [baseEligibleJobs, stageFilter, search, sortOrder, sessionUploadedJobIds]);

  const visibleJobs = useMemo(() => billingJobs.slice(0, visibleLimit), [billingJobs, visibleLimit]);

  // Lightweight delta reconciliation every 30s (skip when tab hidden; SSE handles live updates)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      import("@/lib/api").then((m) => m.api.reconcileDelta().catch(() => {}));
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-slate-300" size={32} />
      </div>
    );
  }

  if (user && !hasAccess("billing")) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900">Access Denied</h2>
            <p className="text-sm font-medium text-slate-500">
              Your account is not authorized to access the Billing page. Please contact your system administrator.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                window.location.href = user.role === "rider" ? "/rider" : "/admin";
              }}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all active:scale-[0.97] cursor-pointer"
            >
              Back to Main
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-3 rounded-xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-[0.97] cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filterPills: Array<{ id: StageFilter; label: string; count: number; badgeClass: string; activeClass: string }> = [
    {
      id: "all",
      label: "All Queue",
      count: stageCounts.all,
      badgeClass: "bg-slate-100 text-slate-700",
      activeClass: "bg-slate-900 text-white border-slate-900 shadow-xs",
    },
    {
      id: "billing",
      label: "In Process",
      count: stageCounts.billing,
      badgeClass: "bg-indigo-50 text-indigo-700",
      activeClass: "bg-indigo-600 text-white border-indigo-600 shadow-xs",
    },
    {
      id: "delivery",
      label: "Delivery",
      count: stageCounts.delivery,
      badgeClass: "bg-sky-50 text-sky-700",
      activeClass: "bg-sky-600 text-white border-sky-600 shadow-xs",
    },
    {
      id: "completed",
      label: "Completed",
      count: stageCounts.completed,
      badgeClass: "bg-emerald-50 text-emerald-700",
      activeClass: "bg-emerald-600 text-white border-emerald-600 shadow-xs",
    },
    {
      id: "walk_in",
      label: "Walk-In",
      count: stageCounts.walk_in,
      badgeClass: "bg-amber-50 text-amber-800",
      activeClass: "bg-amber-500 text-white border-amber-500 shadow-xs",
    },
    ...(stageCounts.uploaded > 0
      ? [
          {
            id: "uploaded" as StageFilter,
            label: "Uploading Now",
            count: stageCounts.uploaded,
            badgeClass: "bg-emerald-100 text-emerald-800",
            activeClass: "bg-emerald-700 text-white border-emerald-700 shadow-xs",
          },
        ]
      : []),
  ];

  const renderFilterAndControls = (compact = false) => (
    <div className="space-y-3">
      {/* Search + Branch + Sort Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search #Job ID, Customer name, Phone, Bill No..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50/80 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {availableBranches.length > 1 && (
            <div className="relative flex-1 sm:flex-initial">
              <Store size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full sm:w-auto pl-8 pr-7 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">All Branches</option>
                {availableBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {getBranchShortLabel(b.name) || b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"))}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            title="Toggle sort order by date"
          >
            <ArrowUpDown size={14} className="text-indigo-600" />
            <span>{sortOrder === "newest" ? "Newest First" : "Oldest First"}</span>
          </button>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncingManual}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-indigo-600 cursor-pointer transition-colors"
            title="Sync latest orders"
          >
            <RefreshCw size={15} className={isSyncingManual ? "animate-spin text-indigo-600" : ""} />
          </button>
        </div>
      </div>

      {/* Stage Filter Pills (Horizontal Scrollable on Mobile APK, Wrap on Desktop) */}
      <div className={`flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar ${compact ? "" : "sm:flex-wrap"}`}>
        {filterPills.map((pill) => {
          const active = stageFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStageFilter(pill.id)}
              className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer active:scale-95 ${
                active
                  ? pill.activeClass
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{pill.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  active ? "bg-white/20 text-white" : pill.badgeClass
                }`}
              >
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const mobileLayout = (
    <div className="min-h-screen bg-slate-100/80 animate-in fade-in duration-200">
      {/* ============ Sticky Mobile APK Header ============ */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Open Menu"
            >
              <Menu size={20} />
            </button>
            <Logo compact className="h-8" />
            <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-lg px-2.5 py-1">
              <Camera size={14} />
              <span className="text-xs font-black tracking-wide">BILL APK</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell
              onSelectTask={() => {
                window.location.href = `/admin#tasks`;
              }}
            />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ============ Pull to Refresh Indicator ============ */}
      <div
        className="flex justify-center transition-all duration-150 overflow-hidden bg-white/50 backdrop-blur-sm border-b border-slate-100/50 sticky top-[57px] z-20"
        style={{
          height: pullDistance > 0 || isPullRefreshing ? `${pullDistance}px` : "0px",
          opacity: pullDistance > 0 || isPullRefreshing ? 1 : 0,
        }}
      >
        <div className="flex items-center justify-center gap-2 py-2">
          {isPullRefreshing ? (
            <Loader2 className="animate-spin text-indigo-600" size={16} />
          ) : (
            <RefreshCw
              style={{ transform: `rotate(${pullDistance * 4}deg)` }}
              className="text-indigo-500 transition-transform"
              size={16}
            />
          )}
          <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
            {isPullRefreshing ? "Syncing..." : pullDistance >= 60 ? "Release to sync" : "Pull to sync"}
          </span>
        </div>
      </div>

      {/* ============ Mobile Content ============ */}
      <main className="max-w-lg mx-auto px-3.5 py-3.5 pb-24 space-y-3.5">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-xs">
          {renderFilterAndControls(true)}
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold text-slate-500">
            Showing <span className="text-indigo-600 font-black">{billingJobs.length}</span> orders waiting for bill photo
          </p>
        </div>

        {/* Job Cards */}
        <div className="space-y-3">
          {billingJobs.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
              <Receipt size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-700">
                {search ? "No matching orders found" : "No bills waiting for upload"}
              </p>
              <p className="text-xs text-slate-400 mt-1">All bills in this filter have been uploaded.</p>
            </div>
          ) : (
            <>
              {visibleJobs.map((job) => (
                <BillingJobCard
                  key={job.id}
                  job={job}
                  branchName={job.branchId ? branchMap[job.branchId] : undefined}
                  onUpload={() => {
                    setSessionUploadedJobIds((prev) => {
                      const next = new Set(prev);
                      next.add(job.id);
                      return next;
                    });
                  }}
                  onFinish={() => handleFinish(job.id)}
                />
              ))}
              {billingJobs.length > visibleLimit && (
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + 48)}
                  className="w-full py-3 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-extrabold text-xs shadow-xs hover:bg-indigo-50 transition-colors cursor-pointer"
                >
                  Show More Orders ({billingJobs.length - visibleLimit} remaining)
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );

  const desktopLayout = (
    <div className="flex min-h-screen bg-slate-50 animate-in fade-in duration-200">
      {/* Sidebar */}
      <aside className={`hidden lg:flex flex-col border-r border-slate-200 bg-white transition-all duration-300 sticky top-0 h-screen z-20 ${isSidebarCollapsed ? "w-[72px]" : "w-64"}`}>
        <div className="flex h-20 items-center justify-center border-b border-slate-100 px-4 overflow-hidden">
          {isSidebarCollapsed ? (
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white text-xl">T</div>
          ) : (
            <Logo />
          )}
        </div>

        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-4 top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-1.5 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 shadow-md z-10 transition-transform cursor-pointer"
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
          {hasAccess("dashboard") && (
            <motion.a
              href="/admin#dashboard"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Dashboard"
            >
              <LayoutDashboard size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Dashboard</span>}
            </motion.a>
          )}

          {hasAccess("services") && (
            <motion.a
              href="/admin#services"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Service Menu"
            >
              <Tag size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Service Menu</span>}
            </motion.a>
          )}

          {hasAccess("pos") && (
            <motion.a
              href="/admin#pos"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="POS"
            >
              <CreditCard size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">POS</span>}
            </motion.a>
          )}

          {hasAccess("jobs") && (
            <motion.a
              href="/admin#jobs"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="All Jobs"
            >
              <Package size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">All Jobs</span>}
            </motion.a>
          )}

          {hasAccess("customers") && (
            <motion.a
              href="/admin#customers"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Customers (CRM)"
            >
              <Users size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Customers (CRM)</span>}
            </motion.a>
          )}

          {hasAccess("dispatch") && (
            <motion.a
              href="/admin#dispatch"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Dispatch Schedule"
            >
              <CalendarClock size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Dispatch Schedule</span>}
            </motion.a>
          )}

          {hasAccess("billing") && (
            <motion.a
              href="/billing"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors cursor-pointer bg-indigo-50 text-indigo-700`}
              title="Billing"
            >
              <Camera size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Billing</span>}
            </motion.a>
          )}

          {hasAccess("riders") && (
            <motion.a
              href="/admin#riders"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Riders"
            >
              <Truck size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Riders</span>}
            </motion.a>
          )}

          {hasAccess("map") && (
            <motion.a
              href="/admin#map"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Live Map"
            >
              <MapIcon size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Live Map</span>}
            </motion.a>
          )}

          {hasAccess("calculator") && (
            <motion.a
              href="/admin#calculator"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Distance Calculator"
            >
              <Calculator size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Distance Calculator</span>}
            </motion.a>
          )}

          {hasAccess("settings") && (
            <motion.a
              href="/admin#settings"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Settings"
            >
              <Settings size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Settings</span>}
            </motion.a>
          )}

          {hasAccess("activity-logs") && (
            <motion.a
              href="/admin#activity-logs"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Activity Logs"
            >
              <ClipboardList size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Activity Logs</span>}
            </motion.a>
          )}

          <motion.a
            href="/admin#tasks"
            whileHover={{ x: 2 }}
            className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
            title="Tasks"
          >
            <ClipboardCheck size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Tasks</span>}
          </motion.a>

          <motion.a
            href="https://thelaunderingcompany.com/"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ x: 2 }}
            className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors cursor-pointer text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
            title="Order Detergent"
          >
            <Droplets size={isSidebarCollapsed ? 22 : 18} className="shrink-0 text-sky-500" />
            {!isSidebarCollapsed && (
              <span className="truncate flex items-center justify-between flex-1">
                <span>Order Detergent</span>
                <ExternalLink size={13} className="text-slate-400 ml-1.5 shrink-0" />
              </span>
            )}
          </motion.a>

          {hasAccess("users") && (
            <motion.a
              href="/admin#users"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Manage Users"
            >
              <ShieldCheck size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Manage Users</span>}
            </motion.a>
          )}
        </nav>

        <div className="border-t border-slate-200 px-3 py-4 space-y-2">
          <Link
            href="/privacy"
            className={`flex items-center gap-2 rounded-lg py-2.5 text-sm font-medium text-slate-500 hover:text-slate-900 cursor-pointer ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"}`}
            title="Privacy Policy"
          >
            <ShieldCheck size={isSidebarCollapsed ? 20 : 16} className="shrink-0" />
            {!isSidebarCollapsed && <span>Privacy Policy</span>}
          </Link>

          <button
            className={`w-full flex items-center gap-2 rounded-lg py-2.5 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer ${isSidebarCollapsed ? "px-0 justify-center" : "px-3"}`}
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut size={isSidebarCollapsed ? 20 : 16} className="shrink-0" />
            {!isSidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto h-screen">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 shadow-2xs shrink-0">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Open Menu"
            >
              <Menu size={20} />
            </button>
            <Logo compact className="h-8" />
          </div>
          <div className="hidden lg:flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Camera size={18} />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">
                Billing & Photo Capture Hub
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {user?.name || user?.email || ""} • Synced with Mobile APK & POS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell
              onSelectTask={() => {
                window.location.href = `/admin#tasks`;
              }}
            />
            <button
              onClick={() => (window.location.href = "/admin?create=true#jobs")}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-xs cursor-pointer border-none rounded-xl px-4 py-2 flex items-center text-xs sm:text-sm transition-all active:scale-[0.98]"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Create New Job</span>
              <span className="sm:hidden">New Job</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1480px] w-full mx-auto space-y-5">
          {/* Top KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div
              onClick={() => setStageFilter("all")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                stageFilter === "all"
                  ? "bg-slate-900 text-white border-slate-900 shadow-md"
                  : "bg-white text-slate-900 border-slate-200/90 hover:border-slate-300 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-extrabold uppercase tracking-wider ${stageFilter === "all" ? "text-slate-300" : "text-slate-400"}`}>
                  Total Queue
                </span>
                <Receipt size={16} className={stageFilter === "all" ? "text-indigo-400" : "text-slate-400"} />
              </div>
              <div className="text-2xl font-black mt-1 tabular-nums">{stageCounts.all}</div>
              <p className={`text-[11px] mt-0.5 ${stageFilter === "all" ? "text-slate-300" : "text-slate-400"}`}>
                Orders awaiting bill photo
              </p>
            </div>

            <div
              onClick={() => setStageFilter("billing")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                stageFilter === "billing"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                  : "bg-white text-slate-900 border-slate-200/90 hover:border-indigo-200 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-extrabold uppercase tracking-wider ${stageFilter === "billing" ? "text-indigo-100" : "text-indigo-600"}`}>
                  In Process
                </span>
                <Sparkles size={16} className={stageFilter === "billing" ? "text-white" : "text-indigo-500"} />
              </div>
              <div className="text-2xl font-black mt-1 tabular-nums">{stageCounts.billing}</div>
              <p className={`text-[11px] mt-0.5 ${stageFilter === "billing" ? "text-indigo-100" : "text-slate-400"}`}>
                Active in shop right now
              </p>
            </div>

            <div
              onClick={() => setStageFilter("delivery")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                stageFilter === "delivery"
                  ? "bg-sky-600 text-white border-sky-600 shadow-md"
                  : "bg-white text-slate-900 border-slate-200/90 hover:border-sky-200 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-extrabold uppercase tracking-wider ${stageFilter === "delivery" ? "text-sky-100" : "text-sky-600"}`}>
                  Out for Delivery
                </span>
                <Truck size={16} className={stageFilter === "delivery" ? "text-white" : "text-sky-500"} />
              </div>
              <div className="text-2xl font-black mt-1 tabular-nums">{stageCounts.delivery}</div>
              <p className={`text-[11px] mt-0.5 ${stageFilter === "delivery" ? "text-sky-100" : "text-slate-400"}`}>
                Ready / with rider
              </p>
            </div>

            <div
              onClick={() => setStageFilter("completed")}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                stageFilter === "completed"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                  : "bg-white text-slate-900 border-slate-200/90 hover:border-emerald-200 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-extrabold uppercase tracking-wider ${stageFilter === "completed" ? "text-emerald-100" : "text-emerald-600"}`}>
                  Completed (Missing Bill)
                </span>
                <CheckCircle2 size={16} className={stageFilter === "completed" ? "text-white" : "text-emerald-500"} />
              </div>
              <div className="text-2xl font-black mt-1 tabular-nums">{stageCounts.completed}</div>
              <p className={`text-[11px] mt-0.5 ${stageFilter === "completed" ? "text-emerald-100" : "text-slate-400"}`}>
                Past orders needing photo
              </p>
            </div>
          </div>

          {/* Main Workspace Card */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Billing List</h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    <Smartphone size={12} />
                    Mobile APK Ready
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                  Snap up to 4 bill/receipt photos per order via Mobile APK Camera or upload directly from Gallery.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start md:self-auto">
                <div className="bg-indigo-50 text-indigo-700 px-3.5 py-2 rounded-xl text-xs font-black border border-indigo-100 whitespace-nowrap">
                  Showing {billingJobs.length} of {stageCounts.all} jobs
                </div>
              </div>
            </div>

            {renderFilterAndControls(false)}

            {/* Responsive Card Grid */}
            {billingJobs.length === 0 ? (
              <div className="text-center py-20 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                <Receipt size={56} className="mx-auto text-slate-300 mb-3" />
                <h3 className="text-base font-bold text-slate-800">
                  {search ? "No search results found" : "No bills waiting for upload in this category"}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Try switching the stage filter above or clearing your search query.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
                  {visibleJobs.map((job) => (
                    <BillingJobCard
                      key={job.id}
                      job={job}
                      branchName={job.branchId ? branchMap[job.branchId] : undefined}
                      onUpload={() => {
                        setSessionUploadedJobIds((prev) => {
                          const next = new Set(prev);
                          next.add(job.id);
                          return next;
                        });
                      }}
                      onFinish={() => handleFinish(job.id)}
                    />
                  ))}
                </div>
                {billingJobs.length > visibleLimit && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((prev) => prev + 48)}
                      className="px-6 py-2.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-extrabold text-xs shadow-xs hover:bg-indigo-50 transition-colors cursor-pointer"
                    >
                      Show More Orders ({billingJobs.length - visibleLimit} remaining of {billingJobs.length})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );

  return (
    <ProtectedRoute allowedRole="non-rider">
      {isNative ? mobileLayout : desktopLayout}

      {/* Mobile Drawer Menu for Mobile Web & Native */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 flex flex-col h-full border-r border-slate-200"
            >
              <div className="flex h-20 items-center justify-between border-b border-slate-100 px-6">
                <Logo />
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto hide-scrollbar">
                {hasAccess("dashboard") && (
                  <Link
                    href="/admin#dashboard"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                  </Link>
                )}

                {hasAccess("services") && (
                  <Link
                    href="/admin#services"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <Tag size={18} />
                    <span>Service Menu</span>
                  </Link>
                )}

                {hasAccess("pos") && (
                  <Link
                    href="/admin#pos"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <CreditCard size={18} />
                    <span>POS</span>
                  </Link>
                )}

                {hasAccess("jobs") && (
                  <Link
                    href="/admin#jobs"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <Package size={18} />
                    <span>All Jobs</span>
                  </Link>
                )}

                {hasAccess("customers") && (
                  <Link
                    href="/admin#customers"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <Users size={18} />
                    <span>Customers (CRM)</span>
                  </Link>
                )}

                {hasAccess("dispatch") && (
                  <Link
                    href="/admin#dispatch"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <CalendarClock size={18} />
                    <span>Dispatch Schedule</span>
                  </Link>
                )}

                {hasAccess("billing") && (
                  <Link
                    href="/billing"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors bg-indigo-50 text-indigo-700"
                  >
                    <Camera size={18} />
                    <span>Billing</span>
                  </Link>
                )}

                {hasAccess("riders") && (
                  <Link
                    href="/admin#riders"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <Truck size={18} />
                    <span>Riders</span>
                  </Link>
                )}

                {hasAccess("map") && (
                  <Link
                    href="/admin#map"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <MapIcon size={18} />
                    <span>Live Map</span>
                  </Link>
                )}

                <Link
                  href="/admin#tasks"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                >
                  <ClipboardCheck size={18} />
                  <span>Tasks</span>
                </Link>

                <a
                  href="https://thelaunderingcompany.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Droplets size={18} className="text-sky-500" />
                    <span>Order Detergent</span>
                  </div>
                  <ExternalLink size={14} className="text-slate-400" />
                </a>

                {hasAccess("calculator") && (
                  <Link
                    href="/admin#calculator"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <Calculator size={18} />
                    <span>Distance Calculator</span>
                  </Link>
                )}

                {hasAccess("settings") && (
                  <Link
                    href="/admin#settings"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <Settings size={18} />
                    <span>Settings</span>
                  </Link>
                )}

                {hasAccess("activity-logs") && (
                  <Link
                    href="/admin#activity-logs"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <ClipboardList size={18} />
                    <span>Activity Logs</span>
                  </Link>
                )}

                {hasAccess("users") && (
                  <Link
                    href="/admin#users"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                  >
                    <ShieldCheck size={18} />
                    <span>Manage Users</span>
                  </Link>
                )}
              </nav>

              <div className="border-t border-slate-100 p-4 space-y-2">
                <Link
                  href="/privacy"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-50"
                >
                  <ShieldCheck size={16} />
                  <span>Privacy Policy</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </ProtectedRoute>
  );
}
