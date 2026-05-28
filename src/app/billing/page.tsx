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
} from "lucide-react";

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

/** Compress image before upload (max 1600px, 85 % JPEG quality) */
function compressImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
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

function BillingJobCard({ job }: { job: Job }) {
  const [billUrls, setBillUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep bill URLs in sync with job data (updated via polling / store)
  useEffect(() => {
    setBillUrls(parseBillUrls(job.billImageUrl));
  }, [job.billImageUrl]);

  // ---- Camera capture → compress → upload → save ----
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file

    if (billUrls.length >= 3) {
      toast.error("สูงสุด 3 รูปต่อ Job");
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImage(file);

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
      });
      setBillUrls(newUrls);
      toast.success("อัปโหลด Bill สำเร็จ ✅");
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("อัปโหลดไม่สำเร็จ กรุณาลองใหม่");
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
      });
      setBillUrls(newUrls);
      toast.success("ลบรูปสำเร็จ");
    } catch {
      toast.error("ลบรูปไม่สำเร็จ");
    }
  };

  // ---- SubStatus badge config ----
  const subStatusMap: Record<string, { label: string; cls: string }> = {
    billing: { label: "รอดำเนินการ", cls: "bg-violet-100 text-violet-700 border-violet-200" },
    wash:    { label: "ซัก",         cls: "bg-blue-100 text-blue-700 border-blue-200" },
    dry:     { label: "อบ",          cls: "bg-orange-100 text-orange-700 border-orange-200" },
    iron:    { label: "รีด",         cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    ready:   { label: "พร้อมส่ง",    cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  };
  const sub = subStatusMap[job.subStatus || "billing"] || subStatusMap.billing;

  const displayDate = job.scheduledAt
    ? new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(job.scheduledAt))
    : "";

  // Truncate long IDs for display
  const shortId = job.id.length > 10 ? job.id.substring(0, 10) : job.id;

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
                {job.customerName || "ลูกค้าทั่วไป"}
              </h3>
            </div>
            <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${sub.cls}`}>
              {sub.label}
            </span>
          </div>

          {displayDate && (
            <p className="text-[11px] text-slate-400 mt-1">{displayDate}</p>
          )}

          {/* Remark (special instructions) */}
          {job.remark && (
            <div className="flex items-start gap-1.5 mt-2 bg-rose-50 text-rose-700 rounded-lg px-2.5 py-1.5 border border-rose-100">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span className="text-[11px] font-semibold leading-tight line-clamp-2">{job.remark}</span>
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

          {billUrls.length < 3 ? (
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
                  กำลังอัปโหลด...
                </>
              ) : (
                <>
                  <Camera size={18} />
                  ถ่ายรูป Bill ({billUrls.length}/3)
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 font-bold py-2">
              <CheckCircle2 size={14} />
              ครบ 3 รูปแล้ว
            </div>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const { user, logout } = useAuth();
  const jobs = useJobs();
  const [search, setSearch] = useState("");

  // Filter: billing status only, and match subStatus "billing" specifically
  const billingJobs = jobs
    .filter((j) => {
      // Must be overall status "billing" AND subStatus must be "billing" (or not set)
      return j.status === "billing" && (j.subStatus === "billing" || !j.subStatus)
        && !j.billImageUrl; // Hide jobs that already have bill uploaded
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

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <ProtectedRoute allowedRole={["manager", "admin"]}>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80">
        {/* ============ Header ============ */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo compact className="h-8" />
              <div className="flex items-center gap-1.5 bg-blue-50 text-blue-600 rounded-lg px-2.5 py-1">
                <Receipt size={15} />
                <span className="text-xs font-bold tracking-wide">BILL UPLOAD</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </header>

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
              placeholder="ค้นหา Job ID / ชื่อลูกค้า..."
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
            งานในร้าน{" "}
            <span className="text-blue-600 text-sm font-extrabold">{billingJobs.length}</span>{" "}
            รายการ
          </p>

          {/* Job Cards */}
          <div className="space-y-3">
            {billingJobs.length === 0 ? (
              <div className="text-center py-20">
                <Receipt size={48} className="mx-auto text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-400">
                  {search ? "ไม่พบ Job ที่ค้นหา" : "ไม่มีงานในร้านขณะนี้"}
                </p>
              </div>
            ) : (
              billingJobs.map((job) => <BillingJobCard key={job.id} job={job} />)
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
