"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { Logo } from "@/components/logo";
import { useJobs } from "@/lib/use-jobs";
import { jobStore, shopStore, type Job } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
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
  Map,
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
      .map((u) => {
        if (typeof u === "string" && !u.startsWith("http") && !u.startsWith("/")) {
          return `${GCS_BASE}/${u.replace(/^["'\\]+|["'\\]+$/g, "")}`;
        }
        return u;
      })
      .filter(Boolean);
  } catch {
    if (!raw.startsWith("http") && !raw.startsWith("/")) return [`${GCS_BASE}/${raw}`];
    return [raw];
  }
}

/** Compress and optionally rotate image before upload (max 1600px, 85 % JPEG quality) */
function compressImage(file: File, maxDim = 1600, quality = 0.85, rotation = 0): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      
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

// ---------------------------------------------------------------------------
// BillingJobCard
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { label: string; className: string }> = {
  tba: { label: "TBA", className: "bg-slate-100 text-slate-500 border-slate-300" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  pickup: { label: "Pickup", className: "bg-amber-50 text-amber-700 border-amber-200" },
  billing: { label: "Process", className: "bg-blue-50 text-blue-700 border-blue-200" },
  delivery: { label: "Delivery", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancel: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200" },
  return: { label: "Return", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

function BillingJobCard({
  job,
  onUpload,
  onFinish,
}: {
  job: Job;
  onUpload?: () => void;
  onFinish?: () => void;
}) {
  const { user } = useAuth();
  const [billUrls, setBillUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; rotation: number; previewUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep bill URLs in sync with job data (updated via polling / store)
  useEffect(() => {
    setBillUrls(parseBillUrls(job.billImageUrl));
  }, [job.billImageUrl]);

  // ---- Camera capture → set pending for preview/rotation ----
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file

    if (billUrls.length >= 4) {
      toast.error("Maximum 4 photos per job");
      return;
    }

    setPendingPhoto({
      file,
      rotation: 0,
      previewUrl: URL.createObjectURL(file),
    });
  };

  // ---- Execute upload with selected rotation ----
  const executeUpload = async () => {
    if (!pendingPhoto) return;
    if (billUrls.length >= 4) {
      toast.error("Maximum 4 photos per job");
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImage(pendingPhoto.file, 1600, 0.85, pendingPhoto.rotation);

      // 1) Get signed upload URL
      const res = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "job",
          entityId: job.id,
          subType: "bills",
          contentType: compressed.type || "image/jpeg",
        }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, publicUrl } = await res.json();

      // 2) PUT file to GCS
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": compressed.type || "image/jpeg" },
        body: compressed,
      });
      if (!put.ok) throw new Error("Upload failed");

      // 3) Save to Job immediately
      const newUrls = [...billUrls, publicUrl];
      await jobStore.updateJobDetails(job.id, {
        billImageUrl: JSON.stringify(newUrls),
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role
      } as any);
      setBillUrls(newUrls);
      toast.success("Bill uploaded successfully ✅");
      
      // Cleanup
      URL.revokeObjectURL(pendingPhoto.previewUrl);
      setPendingPhoto(null);
      
      if (onUpload) onUpload();
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ---- Delete a bill image ----
  const handleDelete = async (index: number) => {
    const newUrls = billUrls.filter((_, i) => i !== index);
    try {
      await jobStore.updateJobDetails(job.id, {
        billImageUrl: newUrls.length > 0 ? JSON.stringify(newUrls) : (null as any),
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role
      } as any);
      setBillUrls(newUrls);
      toast.success("Photo deleted successfully");
    } catch {
      toast.error("Failed to delete photo");
    }
  };

  const status = statusConfig[job.status] || statusConfig.billing;

  const displayDate = job.scheduledAt
    ? new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(job.scheduledAt))
    : "";

  // Truncate long IDs for display
  const shortId = job.id.length > 10 ? job.id.substring(0, 10) : job.id;

  // Filter out Pickup/Delivery instructions from remarks
  const cleanRemark = job.remark
    ? job.remark
        .split(" | ")
        .filter((part) => !part.trim().startsWith("Pickup:") && !part.trim().startsWith("Delivery:"))
        .join(" | ")
    : "";

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all">
        {/* ---- Header ---- */}
        <div className="px-4 pt-3.5 pb-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[11px] font-mono font-bold text-slate-400 tracking-wide">
                #{shortId}
              </span>
              <h3 className="text-[15px] font-extrabold text-slate-900 mt-0.5 truncate">
                {job.customerName || "General Customer"}
              </h3>
            </div>
            <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${status.className}`}>
              {status.label}
            </span>
          </div>

          {displayDate && (
            <p className="text-[11px] text-slate-400 mt-1">{displayDate}</p>
          )}

          {/* Cleaned Remark */}
          {cleanRemark && (
            <div className="flex items-start gap-1.5 mt-2 bg-rose-50 text-rose-700 rounded-lg px-2.5 py-1.5 border border-rose-100">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span className="text-[11px] font-semibold leading-tight line-clamp-2">{cleanRemark}</span>
            </div>
          )}
        </div>

        {/* ---- Bill section ---- */}
        <div className="px-4 pb-3.5">
          {/* Existing bill thumbnails */}
          {billUrls.length > 0 && (
            <div className="flex gap-2 mb-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
              {billUrls.map((url, i) => (
                <div
                  key={i}
                  className="relative shrink-0 w-[72px] h-[72px] rounded-xl border border-slate-200 overflow-hidden bg-slate-100 shadow-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Bill ${i + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewUrl(url)}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(i);
                    }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500/90 text-white rounded-full flex items-center justify-center shadow-md backdrop-blur-sm"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Camera button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
          />

          {billUrls.length < 4 ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97] ${
                uploading
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : billUrls.length > 0
                    ? "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                    : "bg-blue-50 text-blue-600 border-2 border-dashed border-blue-200 hover:bg-blue-100 hover:border-blue-300"
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Camera size={18} />
                  Upload Bill ({billUrls.length}/4)
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 font-bold py-2">
              <CheckCircle2 size={14} />
              4 photos uploaded
            </div>
          )}

          {/* Finish Button - only shown if they have uploaded at least one photo */}
          {billUrls.length > 0 && onFinish && (
            <button
              onClick={onFinish}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all active:scale-[0.97]"
            >
              <CheckCircle2 size={16} />
              Finish Upload
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
            className="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-sm"
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
            <h4 className="text-xs font-extrabold tracking-wide uppercase">พรีวิวและจัดหมุนรูปภาพบิล (Preview & Rotate)</h4>
            <button 
              onClick={() => {
                URL.revokeObjectURL(pendingPhoto.previewUrl);
                setPendingPhoto(null);
              }}
              className="w-8 h-8 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all"
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
                onClick={() => setPendingPhoto(prev => prev ? { ...prev, rotation: (prev.rotation - 90 + 360) % 360 } : null)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs active:scale-95 transition-all border border-white/10"
              >
                <RotateCcw size={14} />
                หมุนซ้าย (90° Left)
              </button>
              <button
                onClick={() => setPendingPhoto(prev => prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs active:scale-95 transition-all border border-white/10"
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
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-sm border border-white/10 active:scale-95 transition-all"
              >
                ยกเลิก (Cancel)
              </button>
              <button
                onClick={executeUpload}
                disabled={uploading}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
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

export default function BillingPage() {
  const { user, logout } = useAuth();
  const jobs = useJobs();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const [search, setSearch] = useState("");
  
  // Track jobs that were uploaded in this session, to keep them visible
  const [sessionUploadedJobIds, setSessionUploadedJobIds] = useState<Set<string>>(new Set());
  // Track jobs that the user clicked "Finish" on, to hide them immediately
  const [hiddenJobIds, setHiddenJobIds] = useState<string[]>([]);

  // Check billing permission
  const hasAccess = (key: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (key === 'dashboard' || key === 'tasks' || key === 'calculator') return true;
    return user.permissions?.includes(key);
  };

  const handleLogout = () => {
    logout();
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

  // Synchronize state values with refs for touch event handlers
  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    isRefreshingRef.current = isPullRefreshing;
  }, [isPullRefreshing]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Trigger pulling only if we are at the top of the window scroll
      // Using <= 5 to safely account for sub-pixel rendering on high-DPI mobile screens
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
        // Resistance: logarithmic feel
        const distance = Math.min(100, Math.pow(diff, 0.85));
        pullDistanceRef.current = distance;
        setPullDistance(distance);
        
        // Prevent WebView's default overscroll reload gesture
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
        setPullDistance(60); // Stay at active spin position
        pullDistanceRef.current = 60;

        toast.promise(
          import("@/lib/api").then(async (m) => {
            await m.refreshDb();
            // Aesthetic delay for smooth transition feel
            await new Promise((r) => setTimeout(r, 600));
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
        }, 800);
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

  // Filter: show all jobs that do not have a bill image uploaded (only in billing, delivery, or completed status)
  const billingJobs = jobs
    .filter((j) => {
      // Only allow billing, delivery, and completed statuses
      const allowedStatuses = ["billing", "delivery", "completed"];
      if (!allowedStatuses.includes(j.status)) return false;

      // Hide if the user manually finished it in this session
      if (hiddenJobIds.includes(j.id)) return false;

      // Hide jobs that already have bill uploaded (unless uploaded in this session)
      if (j.billImageUrl && !sessionUploadedJobIds.has(j.id)) {
        return false;
      }

      // Cut-off: Only show orders created on or after May 28, 2026
      const cutOffDate = new Date("2026-05-28T00:00:00.000Z");
      if (new Date(j.createdAt) < cutOffDate) return false;

      // Filter by user's Area if they have a restricted area (e.g. BKK, PTY)
      if (user?.area && user.area !== 'ALL') {
        const branch = shopLocations.find(s => s.id === j.branchId);
        if (branch?.area !== user.area) return false;
      }

      // Hide if Walk-In (source is 'pos' or type is 'in_store')
      if (j.source === 'pos' || (j.type as string) === 'in_store') {
        return false;
      }

      return true;
    })
    .filter((j) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        j.id.toLowerCase().includes(q) ||
        (j.customerName || "").toLowerCase().includes(q) ||
        (j.customerPhone || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Polling — refresh every 10 s (skip when tab hidden)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      import("@/lib/api").then((m) => m.refreshDb());
    }, 10_000);
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

  const mobileLayout = (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80 animate-in fade-in duration-200">
      {/* ============ Header ============ */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
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
            <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 rounded-lg px-2.5 py-1">
              <Receipt size={15} />
              <span className="text-xs font-bold tracking-wide">BILL UPLOAD</span>
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
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ============ Pull to Refresh Indicator ============ */}
      <div 
        className="flex justify-center transition-all duration-150 overflow-hidden bg-white/50 backdrop-blur-sm border-b border-slate-100/50 sticky top-[57px] z-20"
        style={{ 
          height: pullDistance > 0 || isPullRefreshing ? `${pullDistance}px` : "0px",
          opacity: pullDistance > 0 || isPullRefreshing ? 1 : 0
        }}
      >
        <div className="flex items-center justify-center gap-2 py-2">
          {isPullRefreshing ? (
            <Loader2 className="animate-spin text-blue-600" size={16} />
          ) : (
            <RefreshCw 
              style={{ transform: `rotate(${pullDistance * 4}deg)` }} 
              className="text-blue-500 transition-transform" 
              size={16} 
            />
          )}
          <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
            {isPullRefreshing ? "Syncing..." : pullDistance >= 60 ? "Release to sync" : "Pull to sync"}
          </span>
        </div>
      </div>

      {/* ============ Content ============ */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search Job ID / Customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-300"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Count */}
        <p className="text-[11px] font-semibold text-slate-400 mb-3 px-1">
          Jobs in store:{" "}
          <span className="text-blue-600 text-sm font-extrabold">{billingJobs.length}</span>{" "}
          items
        </p>

        {/* Job Cards */}
        <div className="space-y-3">
          {billingJobs.length === 0 ? (
            <div className="text-center py-20">
              <Receipt size={48} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-400">
                {search ? "No jobs found" : "No active jobs in store"}
              </p>
            </div>
          ) : (
            billingJobs.map((job) => (
              <BillingJobCard
                key={job.id}
                job={job}
                onUpload={() => {
                  setSessionUploadedJobIds((prev) => {
                    const next = new Set(prev);
                    next.add(job.id);
                    return next;
                  });
                }}
                onFinish={() => {
                  setHiddenJobIds((prev) => [...prev, job.id]);
                  toast.success("Saved successfully ✅");
                }}
              />
            ))
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer bg-indigo-50 text-indigo-700`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Live Map"
            >
              <Map size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Live Map</span>}
            </motion.a>
          )}
          
          {hasAccess("calculator") && (
            <motion.a
              href="/admin#calculator"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
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
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Activity Logs"
            >
              <ClipboardList size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Activity Logs</span>}
            </motion.a>
          )}

          {/* Tasks — available to all logged in users */}
          <motion.a
            href="/admin#tasks"
            whileHover={{ x: 2 }}
            className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
            title="Tasks"
          >
            <ClipboardCheck size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Tasks</span>}
          </motion.a>
          
          {hasAccess("users") && (
            <motion.a
              href="/admin#users"
              whileHover={{ x: 2 }}
              className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
              title="Manage Users"
            >
              <ShieldCheck size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Manage Users</span>}
            </motion.a>
          )}
        </nav>
        
        <div className={`border-t border-slate-200 px-3 py-4 space-y-2`}>

          <Link href="/privacy" className={`flex items-center gap-2 rounded-lg py-2.5 text-sm font-medium text-slate-500 hover:text-slate-900 cursor-pointer ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'}`} title="Privacy Policy">
            <ShieldCheck size={isSidebarCollapsed ? 20 : 16} className="shrink-0" />
            {!isSidebarCollapsed && <span>Privacy Policy</span>}
          </Link>

          <button className={`w-full flex items-center gap-2 rounded-lg py-2.5 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'}`} onClick={handleLogout} title="Logout">
            <LogOut size={isSidebarCollapsed ? 20 : 16} className="shrink-0" />
            {!isSidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto h-screen">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8 shadow-sm shrink-0">
          <div className="flex items-center gap-3 lg:hidden px-2 py-2">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer mr-1"
              title="Open Menu"
            >
              <Menu size={20} />
            </button>
            <Logo />
          </div>
          <h1 className="hidden lg:block text-lg font-semibold text-slate-900">
            Dashboard - {user?.name || user?.email || ""}
          </h1>
          
          <div className="flex items-center gap-3">
            <NotificationBell
              onSelectTask={() => {
                window.location.href = `/admin#tasks`;
              }}
            />
            <button 
              onClick={() => window.location.href = "/admin?create=true#jobs"}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm cursor-pointer border-none rounded-lg px-4 py-2 flex items-center text-sm transition-all active:scale-[0.98]"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Create New Job</span>
              <span className="sm:hidden">New Job</span>
            </button>
          </div>
        </header>

        {/* Billing Panel Sub-Header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8 shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <Logo compact className="h-8 lg:hidden" />
            <h1 className="text-lg font-bold text-slate-950 flex items-center gap-2">
              <Receipt size={20} className="text-indigo-600" />
              Billing Panel
            </h1>
          </div>
        </header>


        {/* Spacious Desktop Content Area */}
        <div className="flex-1 p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Billing List</h2>
                <p className="text-sm text-slate-500 font-medium">Manage billing photo uploads and receipts for shop orders.</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative w-72">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Job ID / Customer name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-black border border-indigo-100 whitespace-nowrap">
                  Total {billingJobs.length} active jobs
                </div>
              </div>
            </div>

            {/* Premium Responsive Card Grid */}
            {billingJobs.length === 0 ? (
              <div className="text-center py-24 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Receipt size={64} className="mx-auto text-slate-300 mb-4 animate-bounce" />
                <h3 className="text-base font-bold text-slate-800">{search ? "No search results found" : "No bills waiting for upload"}</h3>
                <p className="text-xs text-slate-400 font-medium mt-1">Congratulations! All bills have been successfully uploaded.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {billingJobs.map((job) => (
                  <BillingJobCard
                    key={job.id}
                    job={job}
                    onUpload={() => {
                      setSessionUploadedJobIds((prev) => {
                        const next = new Set(prev);
                        next.add(job.id);
                        return next;
                      });
                    }}
                    onFinish={() => {
                      setHiddenJobIds((prev) => [...prev, job.id]);
                      toast.success("Saved successfully ✅");
                    }}
                  />
                ))}
              </div>
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
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />
            {/* Sidebar Drawer */}
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
                    <Map size={18} />
                    <span>Live Map</span>
                  </Link>
                )}

                {/* Tasks — available to all logged in users */}
                <Link
                  href="/admin#tasks"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-slate-500 hover:bg-slate-50"
                >
                  <ClipboardCheck size={18} />
                  <span>Tasks</span>
                </Link>

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
                <Link href="/privacy" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-50">
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
