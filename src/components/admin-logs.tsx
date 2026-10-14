"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { format } from "date-fns";
import {
  Loader2,
  Search,
  ChevronDown,
  Wrench,
  AlertTriangle,
  Check,
  RefreshCw,
  ExternalLink,
  Eye,
  X,
  Copy,
  CheckCheck,
  Truck,
  Camera,
  Receipt,
  Banknote,
  FileText,
  User,
  Filter,
  Maximize2,
  Calendar,
  MapPin,
  Package,
  Layers,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { diagnoseJobAction, resolveJobDiscrepancyAction } from "@/actions/db";
import { toast } from "sonner";
import { formatBaht } from "@/lib/utils";

// --- TYPES ---
interface ActivityLog {
  id: string;
  entityId: string;
  entityType: string;
  action: string;
  details: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  customerName?: string | null;
}

interface PhotoItem {
  url: string;
  label: string;
  category: 'pickup' | 'delivery' | 'bill' | 'slip' | 'bag' | 'general';
}

interface ParsedActionBadge {
  label: string;
  category: 'status' | 'photo' | 'finance' | 'rider' | 'note' | 'general';
  variantClass: string;
  icon?: any;
}

type FilterCategory = 'all' | 'status' | 'photo' | 'finance' | 'rider' | 'note';

// --- UTILITY: Extract all valid image URLs from any string / array / JSON ---
function extractImageUrls(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.flatMap(item => extractImageUrls(item));
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.flatMap(item => extractImageUrls(item));
        }
      } catch {}
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(s => s.startsWith('http'));
    }
  }
  return [];
}

// --- UTILITY: Extract all photos categorized from parsed details ---
function extractPhotosFromDetails(parsed: Record<string, any>): PhotoItem[] {
  const photos: PhotoItem[] = [];

  const addUrls = (val: any, label: string, category: PhotoItem['category']) => {
    const urls = extractImageUrls(val);
    urls.forEach(url => {
      if (!photos.some(p => p.url === url)) {
        photos.push({ url, label, category });
      }
    });
  };

  if (parsed.deliveryProofImageUrl) addUrls(parsed.deliveryProofImageUrl, "Delivery Proof", "delivery");
  if (parsed.pickupProofImageUrl) addUrls(parsed.pickupProofImageUrl, "Pickup Proof", "pickup");
  if (parsed.proofImageUrl) addUrls(parsed.proofImageUrl, "Proof Photo", "general");
  if (parsed.billImageUrl) addUrls(parsed.billImageUrl, "Bill / Receipt", "bill");
  if (parsed.slipImageUrl) addUrls(parsed.slipImageUrl, "Payment Slip", "slip");
  if (parsed.bagImageUrl) addUrls(parsed.bagImageUrl, "Laundry Bag", "bag");

  return photos;
}

// --- UTILITY: Status styling helper ---
function extractScalarString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && !Array.isArray(val)) {
    if ('to' in val && val.to !== undefined && val.to !== null) return String(val.to);
    if ('from' in val && val.from !== undefined && val.from !== null) return String(val.from);
    return JSON.stringify(val);
  }
  return String(val);
}

function getStatusBadgeStyle(status: any) {
  const s = extractScalarString(status).toLowerCase();
  if (s === 'completed' || s === 'done') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (s === 'billing' || s === 'in_progress') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (s === 'delivery' || s === 'pickup' || s === 'todo') return 'bg-sky-100 text-sky-800 border-sky-300';
  if (s === 'processing' || s === 'wash' || s === 'dry' || s === 'iron') return 'bg-purple-100 text-purple-800 border-purple-300';
  if (s === 'cancel' || s === 'cancelled' || s === 'stuck') return 'bg-rose-100 text-rose-800 border-rose-300';
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

const DEFAULT_RIDERS: Record<string, string> = {
  'RIDER-01': 'Pai Lampai (Pai)',
  'RIDER-02': 'Jub Vitoon (Jub)',
  '2c8e8f14-5ab0-43cd-90ea-8297c1e38801': 'Zack Jeerawut (Jeerawut)',
  'fd2c2f01-999d-4604-9c62-1300b4f70723': 'Ball Chanthat (Ball)',
  'RIDER-03': 'Ko Nawat (Ko)',
  'RIDER-04': 'Billy Sitthikorn (Billy)',
  'RIDER-005': 'Man Nawat (Man)',
  'aed029b5-cedc-4f5d-92af-d7bde96eddb6': 'Gus Kritsada (Gus)',
  'RIDER-006': 'Q Apinun (Q)',
};

// --- UTILITY: Detect high-level smart badges for table row ---
function detectActionBadges(log: ActivityLog, parsed: Record<string, any> | null, riderMap: Record<string, string> = DEFAULT_RIDERS): ParsedActionBadge[] {
  const badges: ParsedActionBadge[] = [];

  if (log.action === 'TOPUP') {
    badges.push({
      label: "Wallet Top-Up",
      category: "finance",
      variantClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      icon: Banknote,
    });
    return badges;
  }

  if (log.action === 'ADJUST') {
    badges.push({
      label: "Wallet Adjustment",
      category: "finance",
      variantClass: "bg-amber-100 text-amber-800 border-amber-300",
      icon: Banknote,
    });
    return badges;
  }

  if (log.action === 'WALLET_APPROVED') {
    badges.push({
      label: "Wallet Approved",
      category: "finance",
      variantClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      icon: Check,
    });
    return badges;
  }

  if (log.action === 'WALLET_REJECTED') {
    badges.push({
      label: "Wallet Rejected",
      category: "finance",
      variantClass: "bg-rose-100 text-rose-800 border-rose-300",
      icon: X,
    });
    return badges;
  }

  if (log.action === 'create') {
    const createLabel =
      log.entityType === 'task'
        ? "Task Created"
        : log.entityType === 'customer'
        ? "Customer Created"
        : "Job Created";
    badges.push({
      label: createLabel,
      category: "status",
      variantClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      icon: Sparkles,
    });
    return badges;
  }

  if (log.action === 'delete') {
    badges.push({
      label: "Deleted",
      category: "general",
      variantClass: "bg-rose-100 text-rose-800 border-rose-300",
    });
    return badges;
  }

  // UPDATE action analysis
  if (log.action === 'update' && parsed) {
    // 1. Status change (supports both scalar string and { from, to } diff object)
    if (parsed.status) {
      const isDiffObj = typeof parsed.status === 'object' && parsed.status !== null && ('to' in parsed.status || 'from' in parsed.status);
      const targetStatus = extractScalarString(parsed.status);
      const statusTitle = isDiffObj
        ? `${parsed.status.from || '-'} → ${parsed.status.to || '-'}`
        : targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1);
      badges.push({
        label: `Status: ${statusTitle}`,
        category: "status",
        variantClass: getStatusBadgeStyle(targetStatus),
        icon: RefreshCw,
      });
    }

    // 2. Photos uploaded
    const photoCount = extractPhotosFromDetails(parsed).length;
    if (photoCount > 0) {
      badges.push({
        label: `Proof Photos (${photoCount})`,
        category: "photo",
        variantClass: "bg-cyan-100 text-cyan-800 border-cyan-300",
        icon: Camera,
      });
    }

    // 3. Bill / Receipt
    if (parsed.billNo || (parsed.billImageUrl && !parsed.deliveryProofImageUrl && !parsed.pickupProofImageUrl)) {
      badges.push({
        label: "Bill / Receipt",
        category: "photo",
        variantClass: "bg-blue-100 text-blue-800 border-blue-300",
        icon: Receipt,
      });
    }

    // 4. Rider assigned/changed
    if (parsed.pickupRiderId || parsed.deliveryRiderId || parsed.riderId) {
      const rawRiderVal = parsed.deliveryRiderId || parsed.pickupRiderId || parsed.riderId;
      const rawRiderId = extractScalarString(rawRiderVal);
      const riderName = riderMap[rawRiderId] || DEFAULT_RIDERS[rawRiderId] || rawRiderId;
      badges.push({
        label: `Rider Assigned: ${riderName}`,
        category: "rider",
        variantClass: "bg-violet-100 text-violet-800 border-violet-300",
        icon: Truck,
      });
    }

    // 5. Total amount / price update
    if (parsed.totalAmount !== undefined && !parsed.status) {
      const rawTotal = typeof parsed.totalAmount === 'object' && parsed.totalAmount !== null && 'to' in parsed.totalAmount
        ? parsed.totalAmount.to
        : parsed.totalAmount;
      badges.push({
        label: `Total: ${formatBaht(Number(rawTotal) || 0)}`,
        category: "finance",
        variantClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
        icon: Banknote,
      });
    }

    // 6. Admin Note
    if (parsed.adminNotesJson) {
      badges.push({
        label: "Admin Note",
        category: "note",
        variantClass: "bg-slate-100 text-slate-700 border-slate-300",
        icon: FileText,
      });
    }

    // 7. Items updated
    if (parsed.itemsJson) {
      badges.push({
        label: "Items Updated",
        category: "general",
        variantClass: "bg-indigo-100 text-indigo-800 border-indigo-300",
        icon: Package,
      });
    }
  }

  // Fallback if no specific badges detected
  if (badges.length === 0) {
    badges.push({
      label: String(log.action || 'LOG').toUpperCase(),
      category: "general",
      variantClass: "bg-slate-100 text-slate-700 border-slate-300",
    });
  }

  return badges;
}

// --- COMPONENT: Fullscreen Image Lightbox Modal ---
function ImageLightboxModal({
  photo,
  onClose,
}: {
  photo: { url: string; label: string } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 text-white z-10">
          <div className="flex items-center gap-2.5">
            <Camera size={18} className="text-indigo-400" />
            <span className="font-semibold text-sm">{photo.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs px-2.5"
              title="Open full image in new tab"
            >
              <ExternalLink size={14} />
              <span>Open Original</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Image Display */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black/60">
          <img
            src={photo.url}
            alt={photo.label}
            className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-md"
          />
        </div>
      </div>
    </div>
  );
}

// --- MAIN COMPONENT ---
export function AdminLogs({ jobId }: { jobId?: string }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.email === "admin@tls.com";

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [riderMap, setRiderMap] = useState<Record<string, string>>(DEFAULT_RIDERS);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("all");
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [rawJsonOpen, setRawJsonOpen] = useState<Record<string, boolean>>({});
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const formatRiderName = (id?: string | null): string => {
    if (!id) return '-';
    return riderMap[id] || DEFAULT_RIDERS[id] || id;
  };

  // Lightbox state
  const [activePhoto, setActivePhoto] = useState<{ url: string; label: string } | null>(null);

  // Diagnostics state (Super Admin)
  const [diagJobId, setDiagJobId] = useState("");
  const [diagResult, setDiagResult] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const fetchLogs = async (searchVal?: string) => {
    setIsLoading(true);
    try {
      const currentQuery = searchVal !== undefined ? searchVal : searchTerm;
      let url = jobId ? `/api/logs?entityId=${jobId}&limit=200` : "/api/logs?limit=200";
      if (!jobId && currentQuery.trim()) {
        url = `/api/logs?q=${encodeURIComponent(currentQuery.trim())}&limit=500`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
        } else if (data && Array.isArray(data.logs)) {
          setLogs(data.logs);
          if (data.riders) {
            setRiderMap(prev => ({ ...prev, ...data.riders }));
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
      toast.error("Failed to load activity logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      fetchLogs();
      return;
    }

    // Debounce search input
    const delayDebounceFn = setTimeout(() => {
      fetchLogs();
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [jobId, searchTerm]);

  const toggleRow = (logId: string) => {
    setExpandedLogIds(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  const toggleRawJson = (logId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRawJsonOpen(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  const copyRawJson = (logId: string, details: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!details) return;
    navigator.clipboard.writeText(details);
    setCopiedLogId(logId);
    toast.success("Raw JSON copied to clipboard");
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const handleDiagnose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagJobId.trim()) return;
    setIsDiagnosing(true);
    setDiagResult(null);
    try {
      const res = await diagnoseJobAction(diagJobId.trim());
      setDiagResult(res);
      if (!res.success) {
        toast.error(res.error || "Failed to diagnose job");
      } else {
        toast.success("Job diagnostic complete!");
      }
    } catch (err: any) {
      toast.error(err.message || "Diagnostic failed");
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleResolve = async (legType: 'pickup' | 'delivery', fileUrls: string[]) => {
    if (!diagResult?.job?.id) return;
    setIsResolving(true);
    try {
      const res = await resolveJobDiscrepancyAction(
        diagResult.job.id,
        legType,
        fileUrls,
        user?.id,
        (user as any)?.name || user?.email || "Super Admin"
      );
      if (res.success) {
        toast.success(`Successfully linked GCS files and completed ${legType} leg!`);
        const updatedDiag = await diagnoseJobAction(diagResult.job.id);
        setDiagResult(updatedDiag);
        fetchLogs();
      } else {
        toast.error(res.error || "Failed to resolve discrepancy");
      }
    } catch (err: any) {
      toast.error(err.message || "Resolution failed");
    } finally {
      setIsResolving(false);
    }
  };

  // Pre-parse details & compute smart badges for all logs
  const parsedLogs = useMemo(() => {
    return logs.map(log => {
      let parsed: Record<string, any> | null = null;
      try {
        if (log.details) parsed = JSON.parse(log.details);
      } catch {}

      const badges = detectActionBadges(log, parsed, riderMap);
      const photos = parsed ? extractPhotosFromDetails(parsed) : [];

      return {
        ...log,
        parsedDetails: parsed,
        actionBadges: badges,
        photos,
      };
    });
  }, [logs, riderMap]);

  // Client-side category filtering
  const filteredLogs = useMemo(() => {
    if (selectedFilter === 'all') return parsedLogs;
    return parsedLogs.filter(log => {
      return log.actionBadges.some(b => b.category === selectedFilter);
    });
  }, [parsedLogs, selectedFilter]);

  // Field label mapping for human-readable changes
  const mapKeyToLabel = (key: string): string => {
    const labels: Record<string, string> = {
      status: "Order Status",
      subStatus: "Laundry Process Stage",
      isPaid: "Payment Status",
      isShopPaid: "Shop Paid Confirmation",
      paymentMethod: "Payment Method",
      paymentChannel: "Payment Channel",
      totalAmount: "Total Amount",
      fee: "Delivery Fee",
      discount: "Discount",
      remark: "Customer / Order Remark",
      customerName: "Customer Name",
      customerPhone: "Customer Phone",
      branchId: "Branch Location",
      deliveryLocation: "Delivery Address",
      pickupLocation: "Pickup Address",
      pickupDistance: "Pickup Distance (km)",
      deliveryDistance: "Delivery Distance (km)",
      pickupCommission: "Pickup Commission (฿)",
      deliveryCommission: "Delivery Commission (฿)",
      pickupRiderId: "Pickup Rider",
      deliveryRiderId: "Delivery Rider",
      riderId: "Assigned Rider",
      pickupScheduledAt: "Pickup Scheduled Time",
      deliveryScheduledAt: "Delivery Scheduled Time",
      csoPaidAt: "CSO Paid Timestamp",
      shopPaidAt: "Shop Paid Timestamp",
      isStuck: "Flagged Stuck",
      cashPlaced: "Cash Placed at Shop",
      serviceType: "Service Code",
      type: "Order Type",
      billNo: "Bill Number",
      laundryTypes: "Laundry Categories",
    };
    return labels[key] || key;
  };

  // Human-readable value formatter
  const formatFieldValue = (key: string, val: any): React.ReactNode => {
    if (val === null || val === undefined || val === '') return <span className="text-slate-400 italic">None</span>;

    // Handle { from, to } diff objects (from Task or Customer field updates)
    if (typeof val === 'object' && !Array.isArray(val) && ('from' in val || 'to' in val)) {
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="opacity-75">{formatFieldValue(key, val.from)}</span>
          <span className="text-slate-400 font-bold">→</span>
          <span>{formatFieldValue(key, val.to)}</span>
        </span>
      );
    }

    if (key === 'pickupRiderId' || key === 'deliveryRiderId' || key === 'riderId') {
      const riderIdStr = String(val);
      const riderName = formatRiderName(riderIdStr);
      return (
        <div className="flex items-center gap-1.5 font-bold text-violet-700">
          <Truck size={14} className="shrink-0 text-violet-500" />
          <span>{riderName}</span>
          {val !== riderName && (
            <span className="font-mono text-[10px] text-slate-400 font-normal">({riderIdStr.split('-')[0]})</span>
          )}
        </div>
      );
    }
    if (key === 'branchId') {
      const branchNames: Record<string, string> = {
        'shop-head': '⭐ That Laundry Shop (Sukhumvit 15)',
        'shop-pty': '🌊 That Laundry Shop (Pattaya)',
      };
      return <span className="font-bold text-slate-800">{branchNames[String(val)] || String(val)}</span>;
    }
    if (key === 'isPaid' || key === 'isShopPaid') {
      return val ? (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-bold">
          Paid / Confirmed
        </Badge>
      ) : (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[11px] font-bold">
          Unpaid
        </Badge>
      );
    }
    if (key === 'status') {
      return (
        <Badge variant="outline" className={`text-[11px] font-bold capitalize ${getStatusBadgeStyle(val)}`}>
          {extractScalarString(val)}
        </Badge>
      );
    }
    if (key === 'subStatus') {
      return (
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[11px] font-bold capitalize">
          {extractScalarString(val)}
        </Badge>
      );
    }
    if (key === 'totalAmount' || key === 'fee' || key === 'discount' || key === 'pickupCommission' || key === 'deliveryCommission') {
      return <span className="font-mono font-bold text-slate-900">{formatBaht(Number(val) || 0)}</span>;
    }
    if (key === 'pickupScheduledAt' || key === 'deliveryScheduledAt' || key === 'csoPaidAt' || key === 'shopPaidAt') {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return <span className="font-medium text-slate-800">{format(d, "dd MMM yyyy, HH:mm")}</span>;
        }
      } catch {}
    }
    if (typeof val === 'boolean') {
      return val ? "Yes" : "No";
    }
    if (typeof val === 'object') {
      return <span className="font-mono text-xs">{JSON.stringify(val)}</span>;
    }
    return String(val);
  };

  // Render expanded row details
  const renderDetails = (log: typeof parsedLogs[0]) => {
    const parsed = log.parsedDetails;
    if (!parsed) {
      return <div className="text-xs text-slate-500 italic p-3">{log.details || "No details available"}</div>;
    }

    // 1. TOPUP Action Card
    if (log.action === 'TOPUP') {
      const balBefore = parsed.balanceBefore !== undefined ? Number(parsed.balanceBefore) : undefined;
      const balAfter = parsed.balanceAfter !== undefined ? Number(parsed.balanceAfter) : undefined;

      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Member Wallet Top-Up Successful
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 bg-emerald-50/50 p-4 rounded-xl border border-emerald-200/70 text-xs">
            <div>
              <span className="text-slate-400 font-medium">Customer:</span>{" "}
              <span className="font-bold text-slate-900">{parsed.customerName || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Receipt No:</span>{" "}
              <span className="font-mono font-bold text-emerald-800">{parsed.receiptNo || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Package:</span>{" "}
              <span className="font-bold text-slate-900">{parsed.packageName || 'Standard Top-Up'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Paid Amount:</span>{" "}
              <span className="font-black text-slate-900">{formatBaht(parsed.amount || 0)}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Bonus Added:</span>{" "}
              <span className="font-bold text-emerald-600">+{formatBaht(parsed.bonusAmount || 0)}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Total Credit Added:</span>{" "}
              <span className="font-black text-emerald-700">{formatBaht(parsed.totalCredit || parsed.amount || 0)}</span>
            </div>
            {balBefore !== undefined && balAfter !== undefined && (
              <div className="col-span-full pt-2.5 mt-1 border-t border-emerald-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  Previous Balance: <strong className="font-mono text-slate-700">{formatBaht(balBefore)}</strong> →{" "}
                  <strong className="font-mono font-black text-emerald-800">New Balance: {formatBaht(balAfter)}</strong>
                </span>
                <span className="text-slate-500 font-medium">Channel: {parsed.paymentChannel || 'Transfer'}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 2. ADJUST Action Card
    if (log.action === 'ADJUST' || (log.action === 'update' && parsed.creditBalance)) {
      const balBefore = parsed.balanceBefore !== undefined ? Number(parsed.balanceBefore) : (parsed.creditBalance?.from !== undefined ? Number(parsed.creditBalance.from) : 0);
      const balAfter = parsed.balanceAfter !== undefined ? Number(parsed.balanceAfter) : (parsed.creditBalance?.to !== undefined ? Number(parsed.creditBalance.to) : 0);
      const diff = balAfter - balBefore;
      const isAdd = diff >= 0;
      const absAmount = parsed.adjustAmount !== undefined ? Number(parsed.adjustAmount) : Math.abs(diff);

      return (
        <div className="space-y-4">
          <div className={`flex items-center gap-2 font-bold text-sm ${isAdd ? 'text-emerald-700' : 'text-rose-700'}`}>
            <span className={`flex h-2.5 w-2.5 rounded-full ${isAdd ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {isAdd ? 'Wallet Credit Adjusted (+ Added)' : 'Wallet Credit Adjusted (- Deducted)'}
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 p-4 rounded-xl border text-xs ${isAdd ? 'bg-emerald-50/50 border-emerald-200/70' : 'bg-rose-50/50 border-rose-200/70'}`}>
            <div>
              <span className="text-slate-400 font-medium">Customer:</span>{" "}
              <span className="font-bold text-slate-900">{parsed.customerName || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Adjustment:</span>{" "}
              <span className={`font-black ${isAdd ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isAdd ? `+${formatBaht(absAmount)}` : `-${formatBaht(absAmount)}`}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">New Balance:</span>{" "}
              <span className="font-black font-mono text-slate-900">{formatBaht(balAfter)}</span>
            </div>
            <div className="col-span-full pt-2.5 mt-1 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
              <span>
                Previous: <strong className="font-mono text-slate-600">{formatBaht(balBefore)}</strong> →{" "}
                <strong className="font-mono font-bold text-slate-900">New: {formatBaht(balAfter)}</strong>
              </span>
              {parsed.reason && (
                <div className="bg-white/90 border border-slate-300 px-2.5 py-0.5 rounded text-[11px] text-slate-800">
                  <span className="text-slate-500 font-medium">Reason: </span>
                  <span className="font-bold">{parsed.reason}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 3. CREATE Action Card (Job)
    if (log.action === 'create' && log.entityType === 'job') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
            <Sparkles size={16} className="text-emerald-600" />
            New Job Created Successfully
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Customer:</span>
              <span className="font-bold text-slate-900">{extractScalarString(parsed.customerName) || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Total Amount:</span>
              <span className="font-mono font-bold text-slate-900">{formatBaht(Number(parsed.totalAmount) || 0)}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Initial Status:</span>
              <Badge variant="outline" className={`font-bold capitalize ${getStatusBadgeStyle(parsed.status || 'pending')}`}>
                {extractScalarString(parsed.status) || 'Pending'}
              </Badge>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Process Stage:</span>
              <span className="font-semibold text-slate-800 capitalize">{extractScalarString(parsed.subStatus) || 'None'}</span>
            </div>
          </div>
        </div>
      );
    }

    // 4. Photos Gallery (if any photo URLs exist)
    const photos = log.photos;

    // 5. Laundry Items (if itemsJson exists)
    let laundryItems: any[] = [];
    if (parsed.itemsJson) {
      try {
        const itemParsed = typeof parsed.itemsJson === 'string' ? JSON.parse(parsed.itemsJson) : parsed.itemsJson;
        if (Array.isArray(itemParsed)) laundryItems = itemParsed;
      } catch {}
    }

    // 6. Admin Notes (if adminNotesJson exists)
    let adminNotes: any[] = [];
    if (parsed.adminNotesJson) {
      try {
        const notesParsed = typeof parsed.adminNotesJson === 'string' ? JSON.parse(parsed.adminNotesJson) : parsed.adminNotesJson;
        if (Array.isArray(notesParsed)) {
          adminNotes = notesParsed;
        } else if (notesParsed && Array.isArray(notesParsed.notes)) {
          adminNotes = notesParsed.notes;
        }
      } catch {}
    }

    // 7. Filter other modified keys
    const ignoredKeys = new Set([
      'updatedAt', 'actorId', 'actorName', 'actorRole', 'createdAt', 'completedAt', 'id',
      'deliveryProofImageUrl', 'pickupProofImageUrl', 'proofImageUrl', 'billImageUrl', 'slipImageUrl', 'bagImageUrl',
      'itemsJson', 'adminNotesJson',
      'pickupRiderName', 'deliveryRiderName', 'riderName'
    ]);

    const remainingKeys = Object.entries(parsed).filter(([k]) => !ignoredKeys.has(k));

    return (
      <div className="space-y-4">
        {/* Photos Grid */}
        {photos.length > 0 && (
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Camera size={15} className="text-cyan-600" />
              <span>Attached Proof Photos & Receipts ({photos.length})</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {photos.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => setActivePhoto({ url: p.url, label: `${p.label} • Order #${log.entityId}` })}
                  className="group relative w-18 h-18 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center"
                >
                  <img src={p.url} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Maximize2 size={16} />
                  </div>
                  <span className="absolute bottom-0 inset-x-0 bg-slate-900/75 text-[9px] text-white font-medium text-center truncate px-1 py-0.5">
                    {p.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Laundry Items Grid */}
        {laundryItems.length > 0 && (
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Package size={15} className="text-indigo-600" />
              <span>Laundry Items List ({laundryItems.length} items)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {laundryItems.map((item, idx) => (
                <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200/70 text-xs flex justify-between items-center shadow-xs">
                  <div>
                    <span className="font-bold text-slate-800">{item.nameEn || item.name}</span>
                    <span className="text-[10px] text-slate-400 block">{item.category || 'Standard'}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-800">{formatBaht(item.price || 0)}</span>
                    <span className="text-[10px] text-slate-400 block">Qty: {item.quantity || 1}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin Notes */}
        {adminNotes.length > 0 && (
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <FileText size={15} className="text-slate-600" />
              <span>Internal Admin Notes</span>
            </div>
            <div className="space-y-1.5">
              {adminNotes.map((note, idx) => (
                <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200/70 text-xs shadow-xs flex flex-col gap-1">
                  <p className="text-slate-800 font-medium">{typeof note === 'string' ? note : (note.text || note.note || JSON.stringify(note))}</p>
                  {note.author && (
                    <span className="text-[10px] text-slate-400 font-medium">By {note.author} {note.createdAt ? `• ${format(new Date(note.createdAt), "dd MMM, HH:mm")}` : ''}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modified Fields */}
        {remainingKeys.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Modified Field Values:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {remainingKeys.map(([k, v]) => (
                <div key={k} className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/60 flex flex-col gap-1 text-xs">
                  <span className="text-slate-400 text-[11px] font-medium">{mapKeyToLabel(k)}</span>
                  <div className="font-semibold text-slate-800 break-words">{formatFieldValue(k, v)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full w-full flex flex-col min-h-0 bg-slate-50 overflow-hidden">
      {/* Lightbox Modal */}
      <ImageLightboxModal photo={activePhoto} onClose={() => setActivePhoto(null)} />

      {/* Header, Search & Filter Controls (Fixed at Top) */}
      <div className="shrink-0 p-4 sm:p-6 pb-3 space-y-3.5 max-w-7xl w-full mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Activity Logs</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Audit trail of job state changes, proof photo uploads, price edits, and wallet transactions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search order ID, customer, rider, or action..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 w-[260px] sm:w-[320px] bg-white h-9.5 text-xs rounded-xl border-slate-200 shadow-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs()}
              disabled={isLoading}
              className="h-9.5 px-3 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs cursor-pointer"
              title="Refresh logs"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-slate-400 font-semibold flex items-center gap-1 mr-1 text-[11px] shrink-0">
            <Filter size={12} /> Filter:
          </span>
          {[
            { id: 'all', label: 'All Activities' },
            { id: 'status', label: '🔄 Status Changes' },
            { id: 'photo', label: '📸 Proof Photos' },
            { id: 'finance', label: '💰 Financial & Top-Up' },
            { id: 'rider', label: '🚚 Riders' },
            { id: 'note', label: '📝 Admin Notes' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilter(tab.id as FilterCategory)}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs whitespace-nowrap transition cursor-pointer ${
                selectedFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Super Admin Diagnostics Tool */}
        {isSuperAdmin && !jobId && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Wrench size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Job Image Diagnostic & Sync Tool</h3>
                <p className="text-xs text-slate-500">Verify Cloud Storage files against database records and resolve sync gaps (Super Admin Only).</p>
              </div>
            </div>

            <form onSubmit={handleDiagnose} className="flex gap-2.5 max-w-md">
              <Input
                placeholder="Enter Job ID (e.g. 2026005423)..."
                value={diagJobId}
                onChange={e => setDiagJobId(e.target.value)}
                className="h-9 border-slate-200 bg-slate-50/50 rounded-xl text-xs font-semibold"
              />
              <Button 
                type="submit" 
                disabled={isDiagnosing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 px-4 rounded-xl shadow-xs flex items-center gap-1.5 shrink-0 text-xs cursor-pointer"
              >
                {isDiagnosing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {isDiagnosing ? "Diagnosing..." : "Run Diagnostic"}
              </Button>
            </form>

            {diagResult && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
                <div className="lg:col-span-5 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Database Record</span>
                    <Badge variant="outline" className={`text-[10px] font-bold capitalize ${getStatusBadgeStyle(diagResult.job?.status || '')}`}>
                      {diagResult.job?.status || 'N/A'}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Order ID:</span>
                      <span className="font-bold text-slate-800">{diagResult.job?.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Customer:</span>
                      <span className="font-bold text-slate-800">{diagResult.job?.customerName || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Cloud Storage Files</span>
                    <span className="text-xs font-bold text-slate-500">Found {diagResult.gcsFiles?.length || 0} file(s)</span>
                  </div>
                  <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
                    {diagResult.gcsFiles && diagResult.gcsFiles.length > 0 ? (
                      diagResult.gcsFiles.map((file: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-slate-200/70 text-xs">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-7 h-7 rounded bg-slate-100 overflow-hidden shrink-0">
                              <img src={file.publicUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                            </div>
                            <span className="font-medium text-slate-700 truncate max-w-[200px]" title={file.name}>
                              {file.name.split('/').pop()}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-bold shrink-0">
                            {file.size ? `${(Number(file.size) / 1024 / 1024).toFixed(2)} MB` : ''}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-slate-400 italic text-xs">No files in GCS bucket for this Job ID.</div>
                    )}
                  </div>
                </div>

                {/* Discrepancy Action */}
                <div className="lg:col-span-12">
                  {(() => {
                    if (!diagResult.job) return null;
                    const status = diagResult.job.status;
                    const gcsFiles = diagResult.gcsFiles || [];
                    const pickupFiles = gcsFiles.filter((f: any) => f.name.includes('/proofs-') || f.name.includes('/proofs/'));
                    const hasUnlinkedPickupProof = status === 'pickup' && pickupFiles.length > 0 && !diagResult.job.pickupProofImageUrl;
                    const hasUnlinkedDeliveryProof = status === 'delivery' && pickupFiles.length > 0 && !diagResult.job.deliveryProofImageUrl;

                    if (hasUnlinkedPickupProof) {
                      return (
                        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <AlertTriangle className="text-amber-600 shrink-0" size={16} />
                            <p className="text-xs text-amber-800 font-medium">Pickup photos exist in GCS but order is still in Pickup status.</p>
                          </div>
                          <Button
                            size="sm"
                            disabled={isResolving}
                            onClick={() => handleResolve('pickup', pickupFiles.map((f: any) => f.publicUrl))}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-8 px-3 rounded-lg text-xs shrink-0 cursor-pointer"
                          >
                            {isResolving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Sync GCS & Complete Pickup
                          </Button>
                        </div>
                      );
                    }

                    if (hasUnlinkedDeliveryProof) {
                      return (
                        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <AlertTriangle className="text-amber-600 shrink-0" size={16} />
                            <p className="text-xs text-amber-800 font-medium">Delivery photos exist in GCS but order is still in Delivery status.</p>
                          </div>
                          <Button
                            size="sm"
                            disabled={isResolving}
                            onClick={() => handleResolve('delivery', pickupFiles.map((f: any) => f.publicUrl))}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-8 px-3 rounded-lg text-xs shrink-0 cursor-pointer"
                          >
                            {isResolving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Sync GCS & Complete Delivery
                          </Button>
                        </div>
                      );
                    }

                    return (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
                        <Check className="text-emerald-600 shrink-0" size={16} />
                        <span>Database and Cloud Storage are in sync. No discrepancies found.</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Table Area with Visible Custom Scrollbar */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6 max-w-7xl w-full mx-auto custom-scrollbar">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50/95 sticky top-0 z-10 backdrop-blur-xs border-b border-slate-200 shadow-2xs">
              <TableRow className="border-slate-100">
                <TableHead className="w-[170px] text-xs font-bold text-slate-500">Timestamp</TableHead>
                <TableHead className="w-[140px] text-xs font-bold text-slate-500">Target / ID</TableHead>
                <TableHead className="w-[200px] text-xs font-bold text-slate-500">Customer</TableHead>
                <TableHead className="text-xs font-bold text-slate-500">Action & Key Changes</TableHead>
                <TableHead className="w-[160px] text-xs font-bold text-slate-500">Actor</TableHead>
                <TableHead className="w-[45px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Loading activity logs...</p>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center text-slate-500 text-xs">
                    No activity logs match your filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map(log => {
                  const isExpanded = !!expandedLogIds[log.id];
                  const isRawOpen = !!rawJsonOpen[log.id];
                  const isCopied = copiedLogId === log.id;

                  const displayCustomer = extractScalarString(log.customerName || log.parsedDetails?.customerName || log.parsedDetails?.name || log.parsedDetails?.title) || '-';

                  const entityPrefix =
                    log.entityType === 'customer'
                      ? '👤 Customer'
                      : log.entityType === 'wallet' || log.entityType === 'transaction'
                      ? '💳 Wallet'
                      : log.entityType === 'task'
                      ? '📋 Task'
                      : '#';

                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className={`cursor-pointer transition-colors border-slate-100 select-none ${
                          isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/60'
                        }`}
                        onClick={() => toggleRow(log.id)}
                      >
                        {/* Timestamp */}
                        <TableCell className="text-xs font-medium text-slate-700 whitespace-nowrap">
                          {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss")}
                        </TableCell>

                        {/* Target ID */}
                        <TableCell className="font-mono text-xs font-bold text-indigo-600 whitespace-nowrap">
                          <span className="text-slate-400 font-normal mr-1">{entityPrefix}</span>
                          {log.entityId.split('-')[0].toUpperCase()}
                        </TableCell>

                        {/* Customer */}
                        <TableCell className="text-xs font-semibold text-slate-800 truncate max-w-[200px]" title={displayCustomer}>
                          {displayCustomer}
                        </TableCell>

                        {/* Smart Action Badges */}
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                            {log.actionBadges.map((badge, bIdx) => {
                              const IconComponent = badge.icon;
                              return (
                                <span
                                  key={bIdx}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border shadow-2xs ${badge.variantClass}`}
                                >
                                  {IconComponent && <IconComponent size={12} className="shrink-0" />}
                                  {badge.label}
                                </span>
                              );
                            })}
                          </div>
                        </TableCell>

                        {/* Actor */}
                        <TableCell className="text-xs text-slate-600">
                          <div className="flex items-center gap-1.5 truncate max-w-[150px]" title={log.userName || 'System'}>
                            <User size={13} className="text-slate-400 shrink-0" />
                            <span className="font-medium truncate">{log.userName || 'System (Automated)'}</span>
                          </div>
                        </TableCell>

                        {/* Expand Chevron */}
                        <TableCell>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180 text-indigo-600' : ''
                            }`}
                          />
                        </TableCell>
                      </TableRow>

                      {/* Expanded Details Card */}
                      {isExpanded && (
                        <TableRow key={`${log.id}-details`} className="bg-slate-50/40 hover:bg-slate-50/40 border-slate-100">
                          <TableCell colSpan={6} className="p-4 sm:p-5">
                            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 ml-2 sm:ml-4">
                              {/* Summary Header */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 text-xs text-slate-500">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">Target ID:</span>
                                  <span className="font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                    {log.entityId}
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="font-bold text-slate-800">Entity:</span>
                                  <span className="capitalize">{log.entityType}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span>Logged by: <strong className="text-slate-700">{log.userName || 'System'}</strong></span>
                                  <span>At: <strong className="text-slate-700">{format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss")}</strong></span>
                                </div>
                              </div>

                              {/* Main Parsed Details Section */}
                              {renderDetails(log)}

                              {/* Collapsible Raw JSON Data */}
                              <div className="pt-2 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={e => toggleRawJson(log.id, e)}
                                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <span>{isRawOpen ? "Hide Raw JSON Payload" : "View Raw JSON Payload"}</span>
                                    <ChevronDown size={12} className={`transition-transform ${isRawOpen ? 'rotate-180' : ''}`} />
                                  </button>

                                  {isRawOpen && (
                                    <button
                                      onClick={e => copyRawJson(log.id, log.details, e)}
                                      className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition cursor-pointer"
                                    >
                                      {isCopied ? <CheckCheck size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                      <span>{isCopied ? "Copied" : "Copy JSON"}</span>
                                    </button>
                                  )}
                                </div>

                                {isRawOpen && (
                                  <pre className="mt-2.5 p-3.5 bg-slate-900 text-slate-200 text-[11px] font-mono rounded-xl overflow-x-auto max-h-[300px] border border-slate-800 shadow-inner">
                                    {log.details ? (() => {
                                      try {
                                        return JSON.stringify(JSON.parse(log.details), null, 2);
                                      } catch {
                                        return log.details;
                                      }
                                    })() : "null"}
                                  </pre>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
