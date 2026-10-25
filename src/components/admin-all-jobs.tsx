"use client";

import React, { useState, useMemo, useEffect, useRef, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Navigation, Truck, Package, CheckCircle2, Search, Filter, User, Zap, XCircle, Edit2, MoreHorizontal, LayoutList, LayoutGrid, Receipt, Droplets, Wind, Shirt, Banknote, Download, Printer, ArrowUpDown, RefreshCw, Wallet, RotateCcw, CreditCard, Send, AlertCircle, ArrowRight, FileCheck2, FileWarning, Maximize2, Minimize2, Monitor, SlidersHorizontal, ZoomIn, ZoomOut, Columns } from "lucide-react";
import Papa from "papaparse";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, differenceInMinutes, isSameDay, subDays } from "date-fns";

import { useRiders } from "@/lib/use-riders";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { jobStore, shopStore, customerStore, settingsStore, realtimeStore, type Job, type JobStatus } from "@/lib/store";
import { isJobFullyPaid, findMatchingCustomer, formatJobDisplayId, getJobPaymentBreakdown, formatLocationWithRoom } from "@/lib/utils";
import { getPaymentChannels } from "@/lib/payment-channels";
import { BranchFilterDropdown, getUserAssignedBranchIds, getCleanBranchName } from "@/components/branch-filter-dropdown";
import { OnlinePaymentDialog } from "@/components/online-payment-dialog";
import { ThermalReceiptDialog, formatJobToReceiptData } from "@/components/thermal-receipt-dialog";
import { A5ReceiptDialog } from "@/components/a5-receipt-dialog";
import { DailySaleDialog } from "@/components/daily-sale-dialog";

export type KanbanColumnId = "tba" | "pending" | "pickup" | "billing" | "process" | "delivery" | "completed" | "cancel" | "return" | "topup";

const statusConfig: Record<KanbanColumnId, { label: string; className: string; topBorder: string; headerBadge: string }> = {
  tba: { label: "TBA", className: "bg-slate-100 text-slate-600 border-slate-300", topBorder: "border-t-slate-400", headerBadge: "bg-slate-100 text-slate-700" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200", topBorder: "border-t-amber-400", headerBadge: "bg-amber-100/80 text-amber-800" },
  pickup: { label: "Pickup", className: "bg-orange-50 text-orange-700 border-orange-200", topBorder: "border-t-orange-500", headerBadge: "bg-orange-100/80 text-orange-800" },
  billing: { label: "Billing", className: "bg-violet-50 text-violet-700 border-violet-200", topBorder: "border-t-violet-500", headerBadge: "bg-violet-100/80 text-violet-800" },
  process: { label: "Process", className: "bg-blue-50 text-blue-700 border-blue-200", topBorder: "border-t-blue-500", headerBadge: "bg-blue-100/80 text-blue-800" },
  delivery: { label: "Delivery", className: "bg-teal-50 text-teal-700 border-teal-200", topBorder: "border-t-teal-500", headerBadge: "bg-teal-100/80 text-teal-800" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200", topBorder: "border-t-emerald-500", headerBadge: "bg-emerald-100/80 text-emerald-800" },
  cancel: { label: "Cancel", className: "bg-slate-100 text-slate-500 border-slate-300", topBorder: "border-t-slate-400", headerBadge: "bg-slate-200/80 text-slate-600" },
  return: { label: "Return", className: "bg-red-50 text-red-700 border-red-200", topBorder: "border-t-red-500", headerBadge: "bg-red-100 text-red-700" },
  topup: { label: "Top-up", className: "bg-blue-50 text-blue-700 border-blue-200", topBorder: "border-t-blue-400", headerBadge: "bg-blue-100 text-blue-700" },
};

const statusIcon: Record<KanbanColumnId, React.ReactNode> = {
  tba: <Clock size={13} />,
  pending: <Clock size={13} />,
  pickup: <Package size={13} />,
  billing: <Receipt size={13} />,
  process: <Droplets size={13} />,
  delivery: <Truck size={13} />,
  completed: <CheckCircle2 size={13} />,
  cancel: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  return: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>,
  topup: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
};

type FilterDate = "today" | "yesterday" | "custom";
type BillingFilterMode = "ALL" | "NO_BILL" | "UNSENT_BILL";

const KANBAN_COLUMNS: KanbanColumnId[] = ['tba', 'pending', 'pickup', 'billing', 'process', 'delivery', 'completed', 'cancel'];

function parseUploadedBillPhotoUrls(raw: string | null | undefined): string[] {
  if (!raw || raw === "[]") return [];
  try {
    let parsed = JSON.parse(raw);
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { /* ignore */ }
    }
    const urls: string[] = Array.isArray(parsed) ? parsed : [parsed];
    return urls.filter((u): u is string => typeof u === "string" && Boolean(u.trim()) && !u.includes("proforma-") && !u.includes("receipt-"));
  } catch {
    if (typeof raw === "string" && !raw.includes("proforma-") && !raw.includes("receipt-")) return [raw];
    return [];
  }
}

export interface JobBillingMeta {
  hasBillNo: boolean;
  billNoText: string;
  hasBillPhoto: boolean;
  billPhotoCount: number;
  hasProforma: boolean;
  proformaText: string;
  hasPricedItems: boolean;
  isBillIssued: boolean;
  billIssuedLabel: string;
  isBillSent: boolean;
  billSentAt: string | null;
  billSentBy: string | null;
  kanbanStage: "billing" | "process" | null;
}

export function getJobBillingMeta(job: Job): JobBillingMeta {
  const billNoText = (job.billNo || "").trim();
  const hasBillNo = billNoText.length > 0;
  const billPhotos = parseUploadedBillPhotoUrls(job.billImageUrl);
  const hasBillPhoto = billPhotos.length > 0;
  const proformaMatch = job.remark?.match(/Proforma:\s*(PR-[^\s|]+)/i);
  const proformaText = ((job as any).proformaNumber || (proformaMatch ? proformaMatch[1] : "") || "").trim();
  const hasProforma = proformaText.length > 0;
  const netLaundryTotal = (job.totalAmount || 0) - (job.fee || 0);
  const hasPricedItems = Boolean(Array.isArray(job.items) && job.items.length > 0 && netLaundryTotal > 0);

  const isBillIssued = hasBillNo || hasBillPhoto || hasProforma || hasPricedItems;

  let billIssuedLabel = "No Bill";
  if (hasBillNo) {
    billIssuedLabel = `Bill #${billNoText}`;
  } else if (hasProforma) {
    billIssuedLabel = proformaText;
  } else if (hasBillPhoto) {
    billIssuedLabel = `Bill Photo (${billPhotos.length})`;
  } else if (hasPricedItems) {
    billIssuedLabel = "Bill Priced";
  }

  let isBillSent = false;
  let billSentAt: string | null = null;
  let billSentBy: string | null = null;
  let kanbanStage: "billing" | "process" | null = null;

  if (job.adminNotesJson) {
    try {
      const parsed = JSON.parse(job.adminNotesJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (typeof parsed.isBillSent === "boolean") {
          isBillSent = parsed.isBillSent;
          billSentAt = parsed.billSentAt || null;
          billSentBy = parsed.billSentBy || null;
        }
        if (parsed.kanbanStage === "billing" || parsed.kanbanStage === "process") {
          kanbanStage = parsed.kanbanStage;
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return {
    hasBillNo,
    billNoText,
    hasBillPhoto,
    billPhotoCount: billPhotos.length,
    hasProforma,
    proformaText,
    hasPricedItems,
    isBillIssued,
    billIssuedLabel,
    isBillSent,
    billSentAt,
    billSentBy,
    kanbanStage,
  };
}

export function getJobKanbanColumn(job: Job): KanbanColumnId {
  if (job.status !== "billing") {
    return job.status as KanbanColumnId;
  }
  const meta = getJobBillingMeta(job);
  if (meta.kanbanStage === "process") return "process";
  if (meta.kanbanStage === "billing") return "billing";
  if (job.subStatus && ["wash", "dry", "iron", "ready", "process"].includes(job.subStatus)) {
    return "process";
  }
  return "billing";
}

export function getBranchShortName(nameOrShop?: string | { name?: string } | null): string {
  if (!nameOrShop) return "";
  const name = typeof nameOrShop === "string" ? nameOrShop : (nameOrShop.name || "");
  if (!name) return "";

  const lower = name.toLowerCase();
  if (lower.includes("15 sukhumvit") || lower.includes("sukhumvit 15")) {
    return "15 Sukhumvit";
  }
  if (lower.includes("phattanakarn") || lower.includes("pattanakarn")) {
    return "Phattanakarn";
  }
  if (lower.includes("pattaya")) {
    return "Pattaya";
  }

  // If inside parentheses e.g. "That Laundry Shop (Asoke)"
  const match = name.match(/\((.*?)\)/);
  if (match && match[1]?.trim()) {
    return match[1].trim();
  }

  // Fallback: strip common prefix
  const cleaned = name.replace(/^(That Laundry Shop|TLS)\s*[-:—–]?\s*/i, '').trim();
  return cleaned || name;
}

export function isRiderCashDeliveryJob(job: Job): boolean {
  if (job.status === "cancel" || job.status === "topup") return false;
  // 1. Must have a rider assigned for delivery
  const hasDeliveryRider = Boolean(job.deliveryRiderId || (!job.pickupRiderId && job.riderId));
  if (!hasDeliveryRider) return false;

  // 2. Must be Cash / COD payment channel
  const breakdown = getJobPaymentBreakdown(job);
  const isCash = job.paymentChannel === "Cash / COD" || 
                 (job.paymentMethod || "").toLowerCase() === "cash" ||
                 breakdown.channels.some(c => c.toUpperCase() === "CASH" || c.toUpperCase() === "CASH / COD");
  if (!isCash) return false;

  return true;
}

export const AdminAllJobs = React.memo(function AdminAllJobs({ 
  jobs, 
  onEditJob, 
  onCreateJob,
  onTopUp,
  savingJobIds,
}: { 
  jobs: Job[], 
  onEditJob?: (job: Job) => void, 
  onCreateJob?: () => void,
  onTopUp?: () => void,
  savingJobIds?: Set<string>,
}) {
  const riders = useRiders();
  const systemSettings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot, settingsStore.getSnapshot);
  const realtimeState = useSyncExternalStore(realtimeStore.subscribe, realtimeStore.getSnapshot, realtimeStore.getSnapshot);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  // Screen Layout Fit & Zoom scaling for different device screens
  const [screenFit, setScreenFit] = useState<"fit" | "standard">("fit");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showScreenSettings, setShowScreenSettings] = useState<boolean>(false);
  const screenSettingsRef = useRef<HTMLDivElement>(null);

  // Initialize and persist screen layout preferences from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedFit = localStorage.getItem("tls_kanban_screen_fit");
      if (savedFit === "fit" || savedFit === "standard") {
        setScreenFit(savedFit);
      } else {
        // Auto-detect screen: if < 1920px width, default to "fit" so all columns fit without scrolling
        setScreenFit(window.innerWidth < 1920 ? "fit" : "standard");
      }
      const savedZoom = localStorage.getItem("tls_kanban_zoom");
      if (savedZoom) {
        const parsed = parseInt(savedZoom, 10);
        if (!isNaN(parsed) && parsed >= 70 && parsed <= 125) {
          setZoomLevel(parsed);
        }
      }
    }
  }, []);

  // Close screen settings popover on click outside
  useEffect(() => {
    if (!showScreenSettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (screenSettingsRef.current && !screenSettingsRef.current.contains(e.target as Node)) {
        setShowScreenSettings(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showScreenSettings]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<FilterDate>("today");
  const [statusFilter, setStatusFilter] = useState<KanbanColumnId | "all">("all");
  const [billingFilterMode, setBillingFilterMode] = useState<BillingFilterMode>("ALL");
  const [selectedBrand, setSelectedBrand] = useState<"ALL" | "that_laundry_shop" | "noname_laundry">("ALL");
  const [paymentChannelFilter, setPaymentChannelFilter] = useState<string>("ALL");
  const [csoPaidFilter, setCsoPaidFilter] = useState<"ALL" | "PAID" | "UNPAID" | "SHOP_UNPAID" | "CSO_PAID_SHOP_UNPAID" | "RIDER_CASH">("ALL");
  const [selectedRiderId, setSelectedRiderId] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  
  const [cancellingJob, setCancellingJob] = useState<Job | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [onlinePaymentJob, setOnlinePaymentJob] = useState<Job | null>(null);
  const [receiptJob, setReceiptJob] = useState<Job | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showDailySale, setShowDailySale] = useState(false);
  
  const [reopenDialog, setReopenDialog] = useState<{
    isOpen: boolean;
    jobId: string;
    targetStatus: string;
    reason: string;
  }>({
    isOpen: false,
    jobId: "",
    targetStatus: "",
    reason: "",
  });
  
  const [jobSourceFilter, setJobSourceFilter] = useState<"ALL" | "ONLINE" | "POS">("ALL");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCancelled, setShowCancelled] = useState(true);
  const [stuckOnly, setStuckOnly] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [paymentSort, setPaymentSort] = useState<'asc' | 'desc' | null>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const isInitialBranchSetRef = useRef(false);
  const prevUserIdRef = useRef<string | undefined>(undefined);
  const [activeKanbanColumn, setActiveKanbanColumn] = useState<KanbanColumnId>("billing");
  
  const { user, isLoading: isAuthLoading } = useAuth();
  const isCSO = user?.role === 'cso' || Boolean(user?.permissions?.includes('cso'));
  const isAdmin = user?.role === 'admin' || Boolean(user?.permissions?.includes('admin'));
  const isBranchManager = user?.role === 'manager' || Boolean(user?.permissions?.includes('manager') || user?.permissions?.includes('branch_manager'));
  const isCsoOrAdmin = isCSO || isAdmin;
  const canAdvanceBilling = isAdmin || isCSO || isBranchManager;
  const canManageJobs = Boolean(
    user?.role === 'admin' ||
    isCSO ||
    user?.permissions?.includes('jobs') ||
    user?.permissions?.includes('dashboard')
  );
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const customers = useSyncExternalStore(customerStore.subscribe, customerStore.getSnapshot, customerStore.getSnapshot);

  const buildUpdatedAdminNotesJson = (
    job: Job,
    patch: Record<string, any>,
    logText?: string
  ): string => {
    let baseObj: Record<string, any> = {};
    let notes: any[] = [];
    let payments: any[] = [];

    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          baseObj = { ...parsed };
          notes = Array.isArray(parsed.notes) ? [...parsed.notes] : [];
          payments = Array.isArray(parsed.payments) ? [...parsed.payments] : [];
        } else if (Array.isArray(parsed)) {
          notes = [...parsed];
        }
      } catch {
        notes = [];
      }
    }

    if (logText) {
      notes.push({
        id: Math.random().toString(36).substring(2, 9),
        userId: user?.id || "unknown",
        userName: (user as any)?.name || user?.email || "Staff",
        text: logText,
        imageUrls: [],
        timestamp: new Date().toISOString(),
      });
    }

    const finalObj: Record<string, any> = {
      ...baseObj,
      ...patch,
      notes,
    };
    if (payments.length > 0 || Array.isArray(baseObj.payments)) {
      finalObj.payments = payments;
    }
    return JSON.stringify(finalObj);
  };

  const handleToggleBillSent = async (job: Job, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isCsoOrAdmin) {
      toast.error("Only CSO and Admin positions can update Bill Sent status");
      return;
    }
    const meta = getJobBillingMeta(job);
    const nextSent = !meta.isBillSent;
    const staffName = (user as any)?.name || user?.email || "Staff";
    const nowIso = new Date().toISOString();

    try {
      const updatedAdminNotesJson = buildUpdatedAdminNotesJson(
        job,
        {
          isBillSent: nextSent,
          billSentAt: nextSent ? nowIso : null,
          billSentBy: nextSent ? staffName : null,
        },
        nextSent
          ? `Bill sent to customer by ${staffName}`
          : `Bill sent status unmarked by ${staffName}`
      );
      const actorDetails = user ? { actorId: user.id, actorName: staffName, actorRole: user.role } : undefined;
      await jobStore.updateJobDetails(
        job.id,
        { adminNotesJson: updatedAdminNotesJson },
        actorDetails
      );
      toast.success(
        nextSent
          ? `Order #${formatJobDisplayId(job.id)}: Marked as Bill Sent to Customer`
          : `Order #${formatJobDisplayId(job.id)}: Marked as Bill Not Sent`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update bill sent status");
    }
  };

  const handleMoveJobToColumn = async (job: Job, targetCol: KanbanColumnId) => {
    const currentCol = getJobKanbanColumn(job);
    if (currentCol === targetCol) return;

    // Billing stage transition guard:
    // Orders in Billing stage can ONLY be moved to the next stage (process, delivery, completed, etc.)
    // by employees in CSO, ADMIN, or Branch Manager positions, AND ONLY IF the bill has been marked as Sent to Customer.
    const isAdvancingFromBilling = currentCol === "billing" && !["cancel", "tba", "pending", "pickup"].includes(targetCol);
    if (isAdvancingFromBilling) {
      if (!canAdvanceBilling) {
        toast.error("Orders in Billing stage can only be moved to the next stage by CSO, Admin, or Branch Managers");
        return;
      }
      const bMeta = getJobBillingMeta(job);
      if (!bMeta.isBillSent) {
        toast.error("Cannot move to next stage: Bill must be marked as Sent to Customer first (Bill Sent ✓)");
        return;
      }
    }

    if (targetCol === "cancel") {
      setCancellingJob(job);
      setCancelReason("");
      return;
    }

    if (job.status === "completed") {
      setReopenDialog({
        isOpen: true,
        jobId: job.id,
        targetStatus: targetCol,
        reason: "",
      });
      return;
    }

    const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
    const updates: any = {};

    if (targetCol === "billing") {
      updates.status = "billing";
      updates.subStatus = "billing";
      updates.adminNotesJson = buildUpdatedAdminNotesJson(job, { kanbanStage: "billing" });
    } else if (targetCol === "process") {
      updates.status = "billing";
      updates.subStatus = (job.subStatus && ["wash", "dry", "iron", "ready"].includes(job.subStatus))
        ? job.subStatus
        : "wash";
      updates.adminNotesJson = buildUpdatedAdminNotesJson(job, { kanbanStage: "process" });
    } else {
      updates.status = targetCol as JobStatus;
      if (targetCol === "completed") {
        updates.completedAt = new Date().toISOString();
      }
      if (["tba", "pending", "pickup"].includes(targetCol)) {
        updates.subStatus = null;
        updates.adminNotesJson = buildUpdatedAdminNotesJson(job, { kanbanStage: null });
      }
    }

    await jobStore.updateJobDetails(job.id, updates, actorDetails);
    toast.success(`Order #${formatJobDisplayId(job.id)} moved to ${statusConfig[targetCol]?.label || targetCol}`);
  };

  const handleCollectRiderCash = async (job: Job, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!canManageJobs) return;
    const staffName = (user as any)?.name || user?.email || "Staff";
    const actorDetails = user ? { actorId: user.id, actorName: staffName, actorRole: user.role } : undefined;
    const deliveryRider = riders.find(r => r.id === (job.deliveryRiderId || job.riderId));
    const riderLabel = deliveryRider?.nickname || deliveryRider?.name || "Rider";
    const amountFmt = (job.totalAmount || 0).toLocaleString();

    try {
      const updatedAdminNotesJson = buildUpdatedAdminNotesJson(
        job,
        {
          isShopPaid: true,
          cashPlaced: true,
          cashCollectedFromRiderAt: new Date().toISOString(),
          cashCollectedBy: staffName,
          cashCollectedFromRider: riderLabel,
        },
        `Cash ฿${amountFmt} collected from rider ${riderLabel} by ${staffName}`
      );
      await jobStore.updateJobDetails(
        job.id,
        {
          isShopPaid: true,
          shopPaidAt: new Date().toISOString(),
          cashPlaced: true,
          adminNotesJson: updatedAdminNotesJson,
        },
        actorDetails
      );
      toast.success(`Order #${formatJobDisplayId(job.id)}: Cash ฿${amountFmt} collected from ${riderLabel}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to record cash collection");
    }
  };

  // Area restriction check: true if user is not global admin and has area or branch assignment
  const isAreaRestricted = useMemo(() => {
    if (!user || user.role === 'admin') return false;
    return Boolean((user.area && user.area !== 'ALL') || user.branchId);
  }, [user]);

  // Compute allowed branches strictly for current user
  const allowedBranches = useMemo(() => {
    if (!isAreaRestricted) return shopLocations;
    const assignedIds = getUserAssignedBranchIds(user, shopLocations);
    return shopLocations.filter((s) => assignedIds.includes(s.id));
  }, [isAreaRestricted, user, shopLocations]);

  const allowedBranchIdSet = useMemo(() => {
    return new Set(allowedBranches.map((s) => s.id));
  }, [allowedBranches]);

  const effectiveSelectedBranchIds = useMemo(() => {
    if (!isAreaRestricted) return selectedBranchIds;
    return selectedBranchIds.filter((id) => allowedBranchIdSet.has(id));
  }, [isAreaRestricted, selectedBranchIds, allowedBranchIdSet]);

  const handleConfirmCancel = async () => {
    if (!cancellingJob || !cancelReason.trim()) return;
    try {
      const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
      await jobStore.updateJobDetails(cancellingJob.id, { 
        status: "cancel", 
        remark: `${cancellingJob.remark || ''} | Cancelled Reason: ${cancelReason.trim()}`.trim() 
      }, actorDetails);
      toast.success(`Job #${formatJobDisplayId(cancellingJob.id)} has been cancelled.`);
      setCancellingJob(null);
      setCancelReason("");
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    }
  };

  const today = new Date();
  const yesterday = subDays(today, 1);

  const checkIsPinned = (j: Job, u: any) => {
    if (j.status !== 'completed') return false;
    const isAdmin = u?.role === 'admin' || u?.role === 'superadmin';
    const isCSOUser = u?.role === 'cso' || Boolean(u?.permissions?.includes('cso'));
    const walkIn = j.source === 'pos' || (j.type as string) === 'in_store';
    const missingBill = !j.billNo || j.billNo.trim() === '';
    
    const isPaid = isJobFullyPaid(j);
    
    if (isAdmin) {
      if (walkIn) return !isPaid || missingBill;
      else return !j.isPaid || !isPaid || missingBill;
    }
    if (isCSOUser) {
      if (walkIn) return !isPaid || missingBill;
      else return !j.isPaid || missingBill;
    }
    if (u?.role === 'manager') {
      if (walkIn) return !isPaid || missingBill;
      else return !isPaid;
    }
    return false;
  };

  const visibleKanbanColumns = KANBAN_COLUMNS.filter(
    status => {
      if (user?.role === 'manager' && !isCSO && status === 'tba') return false;
      if (status === 'completed' && !showCompleted) return false;
      if (status === 'cancel' && !showCancelled) return false;
      return true;
    }
  );

  useEffect(() => {
    if (visibleKanbanColumns.length > 0 && !visibleKanbanColumns.includes(activeKanbanColumn)) {
      setActiveKanbanColumn(visibleKanbanColumns[0]);
    }
  }, [visibleKanbanColumns, activeKanbanColumn]);

  useEffect(() => {
    let start: Date;
    let end: Date;
    
    if (dateFilter === "today") {
      start = today;
      end = today;
      // Today focuses on active work — hide completed/cancelled by default
      setShowCompleted(false);
      setShowCancelled(false);
    } else if (dateFilter === "yesterday") {
      start = yesterday;
      end = yesterday;
      // Historical view — show all statuses
      setShowCompleted(true);
      setShowCancelled(true);
    } else if (dateFilter === "custom") {
      start = new Date(startDate);
      end = new Date(endDate);
      // Historical view — show all statuses
      setShowCompleted(true);
      setShowCancelled(true);
    } else {
      return; 
    }
    
    setIsLoadingHistory(true);
    jobStore.fetchHistoricalJobs(start, end).finally(() => setIsLoadingHistory(false));
  }, [dateFilter, startDate, endDate]);

  useEffect(() => {
    if (isAuthLoading || shopLocations.length === 0) return;

    if (prevUserIdRef.current !== user?.id) {
      prevUserIdRef.current = user?.id;
      isInitialBranchSetRef.current = false;
    }

    if (isInitialBranchSetRef.current) return;

    if (isAreaRestricted) {
      const initialIds = allowedBranches.map((s) => s.id);
      setSelectedBranchIds(initialIds);
      isInitialBranchSetRef.current = true;
      return;
    }

    if (user?.role === 'manager') {
      const userBranches = getUserAssignedBranchIds(user, shopLocations);
      if (userBranches.length > 0 && userBranches.length < shopLocations.length) {
        setSelectedBranchIds(userBranches);
        isInitialBranchSetRef.current = true;
        return;
      }
    }

    setSelectedBranchIds(shopLocations.map((s) => s.id));
    isInitialBranchSetRef.current = true;
  }, [isAuthLoading, user, shopLocations, isAreaRestricted, allowedBranches]);

  const availablePaymentChannels = useMemo(() => {
    const configured = getPaymentChannels(systemSettings).map((c) => c.name);
    const fromJobs = jobs
      .map((j) => j.paymentChannel?.trim())
      .filter((pc): pc is string => Boolean(pc));
    return Array.from(new Set([...configured, ...fromJobs]));
  }, [systemSettings, jobs]);

  // Filter Logic (Memoized & High Performance with Early Exits)
  const filteredJobs = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();

    return jobs.filter((job) => {
      // 0. Hard Area / Assigned Branches Boundary (Prevents cross-branch/area viewing)
      if (isAreaRestricted) {
        if (!job.branchId || !allowedBranchIdSet.has(job.branchId)) return false;
      }

      // 0.1 Manager Role Filter
      if (user?.role === 'manager' && !isCSO) {
        if (job.status === 'tba') return false;
      }

      // 0.2 Brand Filter
      if (selectedBrand !== "ALL") {
        const jobBrand = job.brand || "that_laundry_shop";
        if (jobBrand !== selectedBrand) return false;
      }

      // Job Source Filter: ALL | ONLINE | POS
      if (jobSourceFilter === "ONLINE") {
        const isPos = job.source === 'pos' || (job.type as string) === 'in_store';
        if (isPos) return false;
      } else if (jobSourceFilter === "POS") {
        const isPos = job.source === 'pos' || (job.type as string) === 'in_store';
        if (!isPos) return false;
      }

      // Branch Filter (Excel-style Multi-Select)
      const currentSelectedBranchIds = isAreaRestricted ? effectiveSelectedBranchIds : selectedBranchIds;
      const totalBranchCount = isAreaRestricted ? allowedBranches.length : shopLocations.length;
      const isAllBranchesSelected = currentSelectedBranchIds.length >= totalBranchCount;
      if (!isAllBranchesSelected && currentSelectedBranchIds.length > 0) {
        if (!job.branchId || !currentSelectedBranchIds.includes(job.branchId)) return false;
      } else if (currentSelectedBranchIds.length === 0) {
        return false;
      }

      if (job.status === 'topup') return false;

      // Stuck Filter: when checked, show ONLY stuck jobs
      if (stuckOnly && !job.isStuck) return false;

      // CSO, Shop & Rider Payment Quick Filter
      if (csoPaidFilter === "PAID" && !job.isPaid) return false;
      if (csoPaidFilter === "UNPAID" && job.isPaid) return false;
      if (csoPaidFilter === "SHOP_UNPAID") {
        const breakdown = getJobPaymentBreakdown(job);
        if (breakdown.isFullyPaid || job.isShopPaid) return false;
      }
      if (csoPaidFilter === "CSO_PAID_SHOP_UNPAID") {
        const breakdown = getJobPaymentBreakdown(job);
        if (!job.isPaid || breakdown.isFullyPaid || job.isShopPaid) return false;
      }
      if (csoPaidFilter === "RIDER_CASH" && !isRiderCashDeliveryJob(job)) return false;

      // Specific Rider Filter
      if (selectedRiderId !== "ALL") {
        const matchesRider = job.deliveryRiderId === selectedRiderId || 
                             job.pickupRiderId === selectedRiderId || 
                             job.riderId === selectedRiderId;
        if (!matchesRider) return false;
      }

      // Billing Quick Filter (No Bill Issued / Bill Not Sent to Customer)
      if (billingFilterMode !== "ALL") {
        // Focus on active in-shop / delivery / completed jobs after pickup
        if (["tba", "pending", "pickup", "cancel", "return"].includes(job.status)) return false;
        const bMeta = getJobBillingMeta(job);
        if (billingFilterMode === "NO_BILL" && bMeta.isBillIssued) return false;
        if (billingFilterMode === "UNSENT_BILL" && bMeta.isBillSent) return false;
      }

      // Status Filter (supports both 'billing' and 'process' virtual Kanban columns)
      const jobCol = getJobKanbanColumn(job);
      if (statusFilter !== "all") {
        if (jobCol !== statusFilter) return false;
      } else {
        if (job.status === 'completed' && !showCompleted && viewMode === "list" && !stuckOnly) return false;
        if (job.status === 'cancel' && !showCancelled && viewMode === "list" && !stuckOnly) return false;
      }

      // Payment Channel & CSO / Shop Status Filter
      if (paymentChannelFilter === "STATUS_CSO_PAID") {
        if (!job.isPaid) return false;
      } else if (paymentChannelFilter === "STATUS_CSO_UNPAID") {
        if (job.isPaid) return false;
      } else if (paymentChannelFilter === "STATUS_SHOP_UNPAID") {
        const breakdown = getJobPaymentBreakdown(job);
        if (breakdown.isFullyPaid || job.isShopPaid) return false;
      } else if (paymentChannelFilter === "STATUS_CSO_PAID_SHOP_UNPAID") {
        const breakdown = getJobPaymentBreakdown(job);
        if (!job.isPaid || breakdown.isFullyPaid || job.isShopPaid) return false;
      } else if (paymentChannelFilter === "STATUS_RIDER_CASH") {
        if (!isRiderCashDeliveryJob(job)) return false;
      } else if (paymentChannelFilter !== "ALL") {
        const breakdown = getJobPaymentBreakdown(job);
        const allChannels = [job.paymentChannel, ...breakdown.channels].filter(Boolean).map(c => c!.toUpperCase());
        
        if (paymentChannelFilter === "Cash / COD") {
          if (!allChannels.some(c => c === "CASH / COD" || c === "CASH")) return false;
        } else if (paymentChannelFilter === "Transfer") {
          if (!allChannels.some(c => c === "TRANSFER" || c === "BANK TRANSFER")) return false;
        } else if (paymentChannelFilter === "Credit Card") {
          if (!allChannels.some(c => c === "CREDIT CARD" || c === "CREDIT")) return false;
        } else if (paymentChannelFilter === "Split / Mixed" || paymentChannelFilter === "Split Payment") {
          if (!breakdown.isSplit && job.paymentChannel !== "Split Payment") return false;
        } else {
          if (!allChannels.includes(paymentChannelFilter.toUpperCase())) return false;
        }
      }

      // Date Filter
      let matchesDate = true;
      const isActive = !['completed', 'cancel', 'return'].includes(job.status);
      if (dateFilter === "today") {
        matchesDate = isSameDay(new Date(job.createdAt), today) || 
                      isActive || 
                      (job.completedAt ? isSameDay(new Date(job.completedAt), today) : false) ||
                      (job.scheduledAt ? isSameDay(new Date(job.scheduledAt), today) : false) ||
                      (job.deliveryScheduledAt ? isSameDay(new Date(job.deliveryScheduledAt), today) : false) ||
                      (!job.completedAt && job.status === 'completed' && job.updatedAt ? isSameDay(new Date(job.updatedAt), today) : false);
      } else if (dateFilter === "yesterday") {
        matchesDate = isSameDay(new Date(job.createdAt), yesterday) || 
                      (job.completedAt ? isSameDay(new Date(job.completedAt), yesterday) : false) ||
                      (job.scheduledAt ? isSameDay(new Date(job.scheduledAt), yesterday) : false) ||
                      (job.deliveryScheduledAt ? isSameDay(new Date(job.deliveryScheduledAt), yesterday) : false) ||
                      (!job.completedAt && job.status === 'completed' && job.updatedAt ? isSameDay(new Date(job.updatedAt), yesterday) : false);
      } else if (dateFilter === "custom") {
        const jobDate = new Date(job.createdAt);
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = (jobDate >= start && jobDate <= end) || 
                      (job.completedAt ? (new Date(job.completedAt) >= start && new Date(job.completedAt) <= end) : false) ||
                      (job.scheduledAt ? (new Date(job.scheduledAt) >= start && new Date(job.scheduledAt) <= end) : false) ||
                      (job.deliveryScheduledAt ? (new Date(job.deliveryScheduledAt) >= start && new Date(job.deliveryScheduledAt) <= end) : false);
      }
      if (!matchesDate) return false;

      // Search Filter: only evaluate heavy lookups if search query is NOT empty!
      if (!searchLower) return true;

      const statusLabel = statusConfig[jobCol]?.label || "";
      const pickupRiderObj = riders.find(r => r.id === job.pickupRiderId);
      const deliveryRiderObj = riders.find(r => r.id === job.deliveryRiderId);
      const shopObj = shopLocations.find(s => s.id === job.branchId);

      const itemsMatch = Array.isArray(job.items) && job.items.some((item: any) => 
        item && item.name && typeof item.name === 'string' && item.name.toLowerCase().includes(searchLower)
      );

      const adminLogsMatch = Array.isArray(job.adminLogs) && job.adminLogs.some((log: any) => 
        (log && log.text && typeof log.text === 'string' && log.text.toLowerCase().includes(searchLower)) ||
        (log && log.userName && typeof log.userName === 'string' && log.userName.toLowerCase().includes(searchLower))
      );

      const basicMatch = 
        job.id.toLowerCase().includes(searchLower) ||
        (job.billNo && job.billNo.toLowerCase().includes(searchLower)) ||
        (job.customerName && job.customerName.toLowerCase().includes(searchLower)) ||
        (job.customerPhone && job.customerPhone.includes(searchLower)) ||
        (job.pickupLocation && job.pickupLocation.toLowerCase().includes(searchLower)) ||
        (job.pickupRoom && job.pickupRoom.toLowerCase().includes(searchLower)) ||
        (job.dropoffLocation && job.dropoffLocation.toLowerCase().includes(searchLower)) ||
        (job.dropoffRoom && job.dropoffRoom.toLowerCase().includes(searchLower)) ||
        (job.remark && job.remark.toLowerCase().includes(searchLower)) ||
        (job.adminNote && job.adminNote.toLowerCase().includes(searchLower)) ||
        (job.adminNotesJson && job.adminNotesJson.toLowerCase().includes(searchLower)) ||
        adminLogsMatch ||
        itemsMatch ||
        (pickupRiderObj && pickupRiderObj.name && pickupRiderObj.name.toLowerCase().includes(searchLower)) ||
        (deliveryRiderObj && deliveryRiderObj.name && deliveryRiderObj.name.toLowerCase().includes(searchLower)) ||
        statusLabel.toLowerCase().includes(searchLower) ||
        job.status.toLowerCase().includes(searchLower) ||
        (job.serviceType && job.serviceType.toLowerCase().includes(searchLower)) ||
        (job.serviceSpeed && job.serviceSpeed.toLowerCase().includes(searchLower)) ||
        (job.paymentChannel && job.paymentChannel.toLowerCase().includes(searchLower)) ||
        (job.paymentMethod && job.paymentMethod.toLowerCase().includes(searchLower)) ||
        (shopObj && (
          (shopObj.name && shopObj.name.toLowerCase().includes(searchLower)) ||
          getBranchShortName(shopObj.name).toLowerCase().includes(searchLower)
        ));

      if (basicMatch) return true;

      // Only search customer DB if not matched above
      const customer = findMatchingCustomer(customers, {
        customerId: job.customerId,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
      });

      return Boolean(customer && (
        (customer.name && customer.name.toLowerCase().includes(searchLower)) ||
        (customer.phone && customer.phone.includes(searchLower)) ||
        (customer.memberId && customer.memberId.toLowerCase().includes(searchLower)) ||
        (customer.lineId && customer.lineId.toLowerCase().includes(searchLower)) ||
        (customer.email && customer.email.toLowerCase().includes(searchLower)) ||
        (customer.defaultAddress && customer.defaultAddress.toLowerCase().includes(searchLower)) ||
        (customer.secondaryAddress && customer.secondaryAddress.toLowerCase().includes(searchLower)) ||
        (customer.roomNo && customer.roomNo.toLowerCase().includes(searchLower)) ||
        (customer.companyName && customer.companyName.toLowerCase().includes(searchLower)) ||
        (customer.taxId && customer.taxId.toLowerCase().includes(searchLower)) ||
        (customer.remark && customer.remark.toLowerCase().includes(searchLower))
      ));
    });
  }, [
    jobs, user?.role, isCSO, isAreaRestricted, allowedBranchIdSet, effectiveSelectedBranchIds, allowedBranches,
    selectedBrand, jobSourceFilter, stuckOnly, csoPaidFilter, billingFilterMode, selectedBranchIds, shopLocations,
    statusFilter, showCompleted, showCancelled, viewMode, paymentChannelFilter, selectedRiderId,
    dateFilter, today, yesterday, startDate, endDate, searchTerm, riders, customers
  ]);

  // Quick summary counts for Billing, Stuck, CSO Paid, and Shop Unpaid
  const billingOverview = useMemo(() => {
    let noBillCount = 0;
    let unsentBillCount = 0;
    let stuckCount = 0;
    let csoPaidCount = 0;
    let shopUnpaidCount = 0;
    let csoPaidShopUnpaidCount = 0;
    let riderCashCount = 0;
    for (const j of filteredJobs) {
      if (j.isStuck) stuckCount++;
      const breakdown = getJobPaymentBreakdown(j);
      const isShopPaid = breakdown.isFullyPaid || Boolean(j.isShopPaid);

      if (j.isPaid) {
        csoPaidCount++;
        if (!isShopPaid) {
          csoPaidShopUnpaidCount++;
        }
      }

      if (!isShopPaid) {
        shopUnpaidCount++;
      }

      if (isRiderCashDeliveryJob(j)) {
        riderCashCount++;
      }

      if (!["tba", "pending", "pickup", "cancel", "return"].includes(j.status)) {
        const bm = getJobBillingMeta(j);
        if (!bm.isBillIssued) noBillCount++;
        if (!bm.isBillSent) unsentBillCount++;
      }
    }
    return { noBillCount, unsentBillCount, stuckCount, csoPaidCount, shopUnpaidCount, csoPaidShopUnpaidCount, riderCashCount };
  }, [filteredJobs]);

  // Total payment counts across all branch jobs for quick filter pill badges
  const csoOverviewCounts = useMemo(() => {
    let csoPaidTotal = 0;
    let shopUnpaidTotal = 0;
    let csoPaidShopUnpaidTotal = 0;
    let riderCashTotal = 0;
    let riderCashPendingTotal = 0;
    let riderCashPendingAmount = 0;
    for (const j of jobs) {
      if (isAreaRestricted && (!j.branchId || !allowedBranchIdSet.has(j.branchId))) continue;
      if (j.status === 'topup' || j.status === 'cancel') continue;
      
      const breakdown = getJobPaymentBreakdown(j);
      const isShopPaid = breakdown.isFullyPaid || Boolean(j.isShopPaid);

      if (j.isPaid) {
        csoPaidTotal++;
        if (!isShopPaid) {
          csoPaidShopUnpaidTotal++;
        }
      }

      if (!isShopPaid) {
        shopUnpaidTotal++;
      }

      if (isRiderCashDeliveryJob(j)) {
        riderCashTotal++;
        if (!isShopPaid && !j.cashPlaced) {
          riderCashPendingTotal++;
          riderCashPendingAmount += (j.totalAmount || 0);
        }
      }
    }
    return { 
      csoPaidTotal, 
      shopUnpaidTotal, 
      csoPaidShopUnpaidTotal,
      riderCashTotal,
      riderCashPendingTotal,
      riderCashPendingAmount,
    };
  }, [jobs, isAreaRestricted, allowedBranchIdSet]);

  const sortedJobs = useMemo(() => {
    const list = [...filteredJobs];
    if (paymentSort === 'asc') {
      list.sort((a, b) => (a.isPaid === b.isPaid ? 0 : a.isPaid ? -1 : 1));
    } else if (paymentSort === 'desc') {
      list.sort((a, b) => (a.isPaid === b.isPaid ? 0 : a.isPaid ? 1 : -1));
    }
    return list;
  }, [filteredJobs, paymentSort]);

  const getTotalDuration = (start: Date, end: Date) => {
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours >= 24) {
      const days = Math.floor(diffHours / 24);
      const hours = diffHours % 24;
      return `${days} วัน ${hours} ชั่วโมง`;
    }
    return `${diffHours} ชั่วโมง ${diffMinutes} นาที`;
  };

  const exportToCSV = () => {
    const csvData = filteredJobs.map(job => {
      const customer = findMatchingCustomer(customers, {
        customerId: job.customerId,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
      });
      const branch = shopLocations.find(s => s.id === job.branchId);
      const bMeta = getJobBillingMeta(job);
      const col = getJobKanbanColumn(job);
      return {
        "Job ID": formatJobDisplayId(job.id),
        "Bill No": job.billNo || "-",
        "Bill Issued": bMeta.isBillIssued ? "YES" : "NO",
        "Bill Sent to Customer": bMeta.isBillSent ? "SENT" : "NOT SENT",
        "Date": format(new Date(job.createdAt), "dd MMM yyyy, HH:mm"),
        "Month": format(new Date(job.createdAt), "MM"),
        "Branch": branch?.name || "-",
        "Customer Name": job.customerName || "Walk-in Guest",
        "Customer Phone": job.customerPhone || "-",
        "Pickup Location": formatLocationWithRoom(job.pickupLocation, customer, shopLocations),
        "Dropoff Location": formatLocationWithRoom(job.dropoffLocation, customer, shopLocations),
        "Total Amount (THB)": job.totalAmount || 0,
        "Delivery Fee (THB)": job.fee || 0,
        "Pickup Rider": job.pickupRiderId ? (riders.find(r => r.id === job.pickupRiderId)?.name || job.pickupRiderId) : "-",
        "Delivery Rider": job.deliveryRiderId ? (riders.find(r => r.id === job.deliveryRiderId)?.name || job.deliveryRiderId) : "-",
        "Assigned Rider": (!job.pickupRiderId && !job.deliveryRiderId && job.riderId) ? (riders.find(r => r.id === job.riderId)?.name || job.riderId) : "-",
        "Payment Channel": job.paymentChannel || "-",
        "CSO Pay Status": job.isPaid ? "PAID" : "UNPAID",
        "CSO Paid At": job.csoPaidAt ? format(new Date(job.csoPaidAt), "dd/MM/yyyy HH:mm") : "-",
        "SHOP Pay Status": isJobFullyPaid(job) ? "PAID" : "UNPAID",
        "SHOP Paid At": job.shopPaidAt ? format(new Date(job.shopPaidAt), "dd/MM/yyyy HH:mm") : "-",
        "Total Duration": job.completedAt ? getTotalDuration(new Date(job.createdAt), new Date(job.completedAt)) : "-",
        "Status": statusConfig[col]?.label || job.status
      };
    });
    const csv = Papa.unparse(csvData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `jobs_report_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported to CSV successfully");
  };

  const printToPDF = () => {
    window.print();
  };

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-4">
        {/* Top Page Header & View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">All Jobs</h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                  {filteredJobs.length} {filteredJobs.length === 1 ? "Order" : "Orders"}
                </span>
                {isLoadingHistory && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 font-semibold animate-pulse">
                    <RefreshCw size={11} className="animate-spin" /> Syncing...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Track pickups, billing status, customer bill notifications, and laundry workflow in real time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {viewMode === "list" && (
              <div className="flex gap-1.5 shrink-0 print:hidden">
                <button
                  onClick={() => setShowDailySale(true)}
                  className="flex items-center gap-1.5 px-3 h-9 text-xs font-bold rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/80 transition-colors shadow-2xs cursor-pointer"
                  title="Daily Sale Summary (Shop Paid & Top-up)"
                >
                  <Banknote size={14} className="text-indigo-600" />
                  <span>Daily Sale</span>
                </button>
                {systemSettings?.cashDrawerShowManualButton !== "false" && (
                  <button
                    onClick={async () => {
                      const { kickCashDrawer } = await import("@/lib/cash-drawer");
                      const res = await kickCashDrawer();
                      if (res.success) {
                        toast.success("Cash drawer opened");
                      } else {
                        toast.error(res.error || "Failed to open cash drawer. Please check device pairing.");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 h-9 text-xs font-semibold rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/80 transition-colors shadow-2xs cursor-pointer"
                    title="Open Cash Drawer"
                  >
                    <Banknote size={14} />
                    <span className="hidden sm:inline">Open Drawer</span>
                  </button>
                )}
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-1.5 px-3 h-9 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 transition-colors shadow-2xs cursor-pointer"
                  title="Export as CSV"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button
                  onClick={printToPDF}
                  className="flex items-center gap-1.5 px-3 h-9 text-xs font-semibold rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 transition-colors shadow-2xs cursor-pointer"
                  title="Print to PDF"
                >
                  <Printer size={14} />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            )}

            <div className="flex rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 shrink-0">
              <button
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${viewMode === "kanban" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
              >
                <LayoutGrid size={14} />
                Board
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${viewMode === "list" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
              >
                <LayoutList size={14} />
                Table
              </button>
            </div>

            {/* Screen Layout / Fit to Screen Control */}
            <div className="relative shrink-0" ref={screenSettingsRef}>
              <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/90 gap-1">
                {/* 1-Click Fit Screen Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = screenFit === "fit" ? "standard" : "fit";
                    setScreenFit(nextMode);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("tls_kanban_screen_fit", nextMode);
                    }
                    toast.success(
                      nextMode === "fit" 
                        ? "Fit Screen active: All columns fitted to screen (พอดีหน้าจอ)" 
                        : "Standard layout active: 292px scrollable columns (ขนาดปกติ)"
                    );
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    screenFit === "fit"
                      ? "bg-indigo-600 text-white shadow-2xs font-bold"
                      : "bg-white text-slate-700 hover:text-slate-900 shadow-2xs font-medium"
                  }`}
                  title={
                    screenFit === "fit"
                      ? "Fit Screen is active (Click for Standard Scrollable)"
                      : "Click to adjust layout to fit your screen (ย่อให้พอดีหน้าจอ)"
                  }
                >
                  {screenFit === "fit" ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  <span>{screenFit === "fit" ? "Fit Screen" : "Fit to Screen"}</span>
                  {zoomLevel !== 100 && (
                    <span className={`text-[9.5px] px-1 py-0 rounded ${screenFit === "fit" ? "bg-indigo-700 text-white" : "bg-slate-200 text-slate-700"}`}>
                      {zoomLevel}%
                    </span>
                  )}
                </button>

                {/* Popover Settings Trigger */}
                <button
                  type="button"
                  onClick={() => setShowScreenSettings(prev => !prev)}
                  className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/80 transition-colors cursor-pointer ${
                    showScreenSettings ? "bg-white text-indigo-700 shadow-2xs font-bold" : ""
                  }`}
                  title="Screen Size & Zoom Settings"
                >
                  <SlidersHorizontal size={13} />
                </button>
              </div>

              {/* Screen Settings Popover Card */}
              {showScreenSettings && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl p-3.5 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Monitor size={14} className="text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">Screen Layout & Fit</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setScreenFit("fit");
                        setZoomLevel(100);
                        if (typeof window !== "undefined") {
                          localStorage.setItem("tls_kanban_screen_fit", "fit");
                          localStorage.setItem("tls_kanban_zoom", "100");
                        }
                      }}
                      className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>

                  {/* Mode selector: Fit Screen vs Standard */}
                  <div className="space-y-1.5">
                    <Label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                      Display Mode
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70">
                      <button
                        type="button"
                        onClick={() => {
                          setScreenFit("fit");
                          if (typeof window !== "undefined") {
                            localStorage.setItem("tls_kanban_screen_fit", "fit");
                          }
                        }}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          screenFit === "fit"
                            ? "bg-white text-indigo-700 shadow-2xs border border-slate-200/80"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Minimize2 size={14} className="mb-0.5 text-indigo-600" />
                        <span>Fit Screen</span>
                        <span className="text-[9px] font-normal text-slate-400">No horizontal scroll</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setScreenFit("standard");
                          if (typeof window !== "undefined") {
                            localStorage.setItem("tls_kanban_screen_fit", "standard");
                          }
                        }}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          screenFit === "standard"
                            ? "bg-white text-indigo-700 shadow-2xs border border-slate-200/80"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Maximize2 size={14} className="mb-0.5 text-slate-600" />
                        <span>Standard</span>
                        <span className="text-[9px] font-normal text-slate-400">292px scrollable</span>
                      </button>
                    </div>
                  </div>

                  {/* Zoom Presets & Steppers */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                        Zoom Scale
                      </Label>
                      <span className="text-xs font-extrabold text-indigo-600 font-mono">
                        {zoomLevel}%
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {[80, 90, 100, 110].map(level => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => {
                            setZoomLevel(level);
                            if (typeof window !== "undefined") {
                              localStorage.setItem("tls_kanban_zoom", String(level));
                            }
                          }}
                          className={`py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            zoomLevel === level
                              ? "bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs"
                              : "bg-slate-50 text-slate-600 border-slate-200/70 hover:bg-slate-100"
                          }`}
                        >
                          {level}%
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        disabled={zoomLevel <= 70}
                        onClick={() => {
                          const nextZoom = Math.max(70, zoomLevel - 5);
                          setZoomLevel(nextZoom);
                          if (typeof window !== "undefined") {
                            localStorage.setItem("tls_kanban_zoom", String(nextZoom));
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        <ZoomOut size={12} /> -5%
                      </button>
                      <button
                        type="button"
                        disabled={zoomLevel >= 125}
                        onClick={() => {
                          const nextZoom = Math.min(125, zoomLevel + 5);
                          setZoomLevel(nextZoom);
                          if (typeof window !== "undefined") {
                            localStorage.setItem("tls_kanban_zoom", String(nextZoom));
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        <ZoomIn size={12} /> +5%
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Active Columns: {visibleKanbanColumns.length}</span>
                    <span>Saved to device ✓</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clean Two-Row SaaS Command & Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/85 shadow-2xs p-3.5 space-y-3 print:hidden">
          {/* Row 1: Search, Date Range, Job Source, and Quick Billing/Stuck Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 min-w-[220px] sm:max-w-[360px] lg:max-w-[420px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <Input 
                  placeholder="Search order #, bill #, customer, phone..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-7 h-9 text-xs bg-slate-50/80 border-slate-200/80 focus:bg-white rounded-xl" 
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <XCircle size={13} />
                  </button>
                )}
              </div>

              {/* Date Filter Segmented Pill */}
              <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 h-9 items-center text-xs shrink-0" role="group">
                <button
                  type="button"
                  onClick={() => setDateFilter("today")}
                  className={`h-full px-3 rounded-lg font-semibold transition-all cursor-pointer ${dateFilter === "today" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter("yesterday")}
                  className={`h-full px-3 rounded-lg font-semibold transition-all cursor-pointer ${dateFilter === "yesterday" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter("custom")}
                  className={`h-full px-3 rounded-lg font-semibold transition-all cursor-pointer ${dateFilter === "custom" ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Custom
                </button>
              </div>

              {dateFilter === "custom" && (
                <div className="flex items-center gap-1.5">
                  <Input 
                    type="date" 
                    className="w-[128px] text-xs h-9 bg-slate-50/70 rounded-xl border-slate-200/80" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)} 
                  />
                  <span className="text-slate-400 text-xs font-medium">–</span>
                  <Input 
                    type="date" 
                    className="w-[128px] text-xs h-9 bg-slate-50/70 rounded-xl border-slate-200/80" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)} 
                  />
                </div>
              )}

              {/* Job Source Filter: ALL | ONLINE | POS */}
              <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 h-9 items-center text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setJobSourceFilter("ALL")}
                  className={`h-full px-2.5 rounded-lg transition-all cursor-pointer font-semibold flex items-center justify-center ${
                    jobSourceFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  ALL
                </button>
                <button
                  type="button"
                  onClick={() => setJobSourceFilter("ONLINE")}
                  className={`h-full px-2.5 rounded-lg transition-all cursor-pointer font-semibold flex items-center justify-center ${
                    jobSourceFilter === "ONLINE"
                      ? "bg-white text-indigo-600 shadow-2xs font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  ONLINE
                </button>
                <button
                  type="button"
                  onClick={() => setJobSourceFilter("POS")}
                  className={`h-full px-2.5 rounded-lg transition-all cursor-pointer font-semibold flex items-center justify-center ${
                    jobSourceFilter === "POS"
                      ? "bg-white text-amber-600 shadow-2xs font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  POS
                </button>
              </div>
            </div>

            {/* Quick Action Filter Pills: No Bill Issued | Bill Not Sent | Stuck */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 1. CSO Paid (Sky Blue) */}
              <button
                type="button"
                onClick={() => setCsoPaidFilter(prev => prev === "PAID" ? "ALL" : "PAID")}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  csoPaidFilter === "PAID"
                    ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                    : "bg-sky-50/90 text-sky-800 border-sky-200/90 hover:bg-sky-100/80"
                }`}
                title="Show orders where Customer has Paid and CSO confirmed Paid (ลูกค้าชำระเงินแล้ว / CSO กด Paid)"
              >
                <CheckCircle2 size={13} className={csoPaidFilter === "PAID" ? "text-white" : "text-sky-600"} />
                <span>CSO Paid</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  csoPaidFilter === "PAID" ? "bg-white/20 text-white" : "bg-sky-200/90 text-sky-900"
                }`}>
                  {csoOverviewCounts.csoPaidTotal}
                </span>
              </button>

              {/* 2. Shop Unpaid (Orange) */}
              <button
                type="button"
                onClick={() => setCsoPaidFilter(prev => prev === "SHOP_UNPAID" ? "ALL" : "SHOP_UNPAID")}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  csoPaidFilter === "SHOP_UNPAID"
                    ? "bg-orange-600 text-white border-orange-600 shadow-xs"
                    : "bg-orange-50/90 text-orange-800 border-orange-200/90 hover:bg-orange-100/80"
                }`}
                title="Show all bills / orders where the Shop is NOT paid yet (หน้าร้านยังไม่ได้รับชำระเงิน)"
              >
                <Banknote size={12} className={csoPaidFilter === "SHOP_UNPAID" ? "text-white" : "text-orange-600"} />
                <span>Shop Unpaid</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  csoPaidFilter === "SHOP_UNPAID" ? "bg-white/20 text-white" : "bg-orange-200/90 text-orange-950"
                }`}>
                  {csoOverviewCounts.shopUnpaidTotal}
                </span>
              </button>

              {/* 3. CSO Paid • Shop Unpaid (Teal) */}
              <button
                type="button"
                onClick={() => setCsoPaidFilter(prev => prev === "CSO_PAID_SHOP_UNPAID" ? "ALL" : "CSO_PAID_SHOP_UNPAID")}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  csoPaidFilter === "CSO_PAID_SHOP_UNPAID"
                    ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                    : "bg-teal-50/90 text-teal-800 border-teal-200/90 hover:bg-teal-100/80"
                }`}
                title="Customer has paid CSO, waiting for Shop settlement (CSO รับเงินแล้ว • หน้าร้านรอเคลียร์เงิน)"
              >
                <Wallet size={12} className={csoPaidFilter === "CSO_PAID_SHOP_UNPAID" ? "text-white" : "text-teal-600"} />
                <span>CSO Paid • Shop Unpaid</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  csoPaidFilter === "CSO_PAID_SHOP_UNPAID" ? "bg-white/20 text-white" : "bg-teal-200/90 text-teal-950"
                }`}>
                  {csoOverviewCounts.csoPaidShopUnpaidTotal}
                </span>
              </button>

              {/* 4. Rider Cash (Emerald Green) */}
              <button
                type="button"
                onClick={() => setCsoPaidFilter(prev => prev === "RIDER_CASH" ? "ALL" : "RIDER_CASH")}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  csoPaidFilter === "RIDER_CASH"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                    : "bg-emerald-50/90 text-emerald-800 border-emerald-200/90 hover:bg-emerald-100/80"
                }`}
                title={`Delivery Rider Cash Collection: ${csoOverviewCounts.riderCashTotal} orders (฿${Math.round(csoOverviewCounts.riderCashPendingAmount).toLocaleString()} pending collection)`}
              >
                <Banknote size={13} className={csoPaidFilter === "RIDER_CASH" ? "text-white" : "text-emerald-600"} />
                <span>Rider Cash</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  csoPaidFilter === "RIDER_CASH" ? "bg-white/20 text-white" : "bg-emerald-200/90 text-emerald-950"
                }`}>
                  {csoOverviewCounts.riderCashTotal}
                </span>
              </button>

              {/* 5. No Bill Issued (Amber / Gold) */}
              <button
                type="button"
                onClick={() => setBillingFilterMode(prev => prev === "NO_BILL" ? "ALL" : "NO_BILL")}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  billingFilterMode === "NO_BILL"
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-amber-50/90 text-amber-900 border-amber-200/90 hover:bg-amber-100/80"
                }`}
                title="Show orders that have not issued any bill yet"
              >
                <FileWarning size={13} className={billingFilterMode === "NO_BILL" ? "text-white" : "text-amber-600"} />
                <span>No Bill Issued</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  billingFilterMode === "NO_BILL" ? "bg-white/20 text-white" : "bg-amber-200/90 text-amber-950"
                }`}>
                  {billingOverview.noBillCount}
                </span>
              </button>

              {/* 6. Bill Not Sent (Violet / Purple) */}
              <button
                type="button"
                onClick={() => setBillingFilterMode(prev => prev === "UNSENT_BILL" ? "ALL" : "UNSENT_BILL")}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  billingFilterMode === "UNSENT_BILL"
                    ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                    : "bg-violet-50/90 text-violet-800 border-violet-200/90 hover:bg-violet-100/80"
                }`}
                title="Show orders where the bill has not been sent to the customer yet"
              >
                <Send size={12} className={billingFilterMode === "UNSENT_BILL" ? "text-white" : "text-violet-600"} />
                <span>Bill Not Sent</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  billingFilterMode === "UNSENT_BILL" ? "bg-white/20 text-white" : "bg-violet-200/90 text-violet-900"
                }`}>
                  {billingOverview.unsentBillCount}
                </span>
              </button>

              {/* 7. Stuck (Rose / Red) */}
              <button
                type="button"
                onClick={() => setStuckOnly(prev => !prev)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  stuckOnly
                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                    : "bg-rose-50/90 text-rose-800 border-rose-200/90 hover:bg-rose-100/80"
                }`}
                title="Show only Stuck orders"
              >
                <AlertCircle size={12} className={stuckOnly ? "text-white" : "text-rose-600"} />
                <span>Stuck</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  stuckOnly ? "bg-white/20 text-white" : "bg-rose-200/90 text-rose-900"
                }`}>
                  {billingOverview.stuckCount}
                </span>
              </button>
            </div>
          </div>

          {/* Row 2: Secondary Dropdowns & Visibility Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <BranchFilterDropdown
                branches={allowedBranches}
                selectedIds={isAreaRestricted ? effectiveSelectedBranchIds : selectedBranchIds}
                onChange={setSelectedBranchIds}
                placeholder={isAreaRestricted && allowedBranches.length === 1 ? getCleanBranchName(allowedBranches[0]?.name) : "All Branches"}
              />

              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value as any)}
                className="h-8 px-2.5 text-xs font-semibold border border-slate-200/80 rounded-xl hover:bg-white bg-slate-50/70 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-colors"
              >
                <option value="ALL">All Brands</option>
                <option value="that_laundry_shop">That Laundry Shop</option>
                <option value="noname_laundry">Noname Laundry</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-8 px-2.5 text-xs font-semibold border border-slate-200/80 rounded-xl hover:bg-white bg-slate-50/70 text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-colors"
              >
                <option value="all">All Stages</option>
                <option value="tba">TBA</option>
                <option value="pending">Pending</option>
                <option value="pickup">Pickup</option>
                <option value="billing">Billing</option>
                <option value="process">Process</option>
                <option value="delivery">Delivery</option>
                <option value="completed">Completed</option>
                <option value="cancel">Cancelled</option>
                <option value="return">Returned</option>
              </select>

              <select
                value={paymentChannelFilter}
                onChange={(e) => setPaymentChannelFilter(e.target.value)}
                className="h-8 text-xs border border-slate-200/80 rounded-xl px-2.5 bg-slate-50/70 hover:bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer text-slate-700 transition-colors"
              >
                <option value="ALL">All Payments</option>
                <option value="STATUS_CSO_PAID">🔵 CSO Paid (Customer Paid)</option>
                <option value="STATUS_CSO_UNPAID">⚪ CSO Unpaid (Pending)</option>
                <option value="STATUS_SHOP_UNPAID">🟠 Shop Unpaid (หน้าร้านยังไม่ได้รับชำระ)</option>
                <option value="STATUS_CSO_PAID_SHOP_UNPAID">🟢 CSO Paid • Shop Unpaid</option>
                <option value="STATUS_RIDER_CASH">💵 Rider Cash / COD (ไรเดอร์เก็บเงินสด)</option>
                <option disabled>──────────</option>
                {availablePaymentChannels.map(channel => (
                  <option key={channel} value={channel}>{channel}</option>
                ))}
              </select>

              <select
                value={selectedRiderId}
                onChange={(e) => setSelectedRiderId(e.target.value)}
                className="h-8 text-xs border border-slate-200/80 rounded-xl px-2.5 bg-slate-50/70 hover:bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer text-slate-700 transition-colors"
                title="Filter jobs assigned to a specific Rider"
              >
                <option value="ALL">All Riders</option>
                {riders.map(r => (
                  <option key={r.id} value={r.id}>🛵 {r.nickname || r.name}</option>
                ))}
              </select>

              {(searchTerm || statusFilter !== "all" || paymentChannelFilter !== "ALL" || billingFilterMode !== "ALL" || stuckOnly || csoPaidFilter !== "ALL" || jobSourceFilter !== "ALL" || selectedRiderId !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setPaymentChannelFilter("ALL");
                    setBillingFilterMode("ALL");
                    setCsoPaidFilter("ALL");
                    setSelectedRiderId("ALL");
                    setStuckOnly(false);
                    setJobSourceFilter("ALL");
                  }}
                  className="h-8 px-2.5 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1"
                >
                  <XCircle size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                  showCompleted
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200/90"
                    : "bg-slate-50 text-slate-400 border-slate-200/70 hover:text-slate-600"
                }`}
              >
                <CheckCircle2 size={12} className={showCompleted ? "text-emerald-600" : "text-slate-400"} />
                <span>Show Completed</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCancelled(!showCancelled)}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                  showCancelled
                    ? "bg-rose-50 text-rose-700 border-rose-200/90"
                    : "bg-slate-50 text-slate-400 border-slate-200/70 hover:text-slate-600"
                }`}
              >
                <XCircle size={12} className={showCancelled ? "text-rose-500" : "text-slate-400"} />
                <span>Show Cancelled</span>
              </button>
            </div>
          </div>
        </div>

      {viewMode === "list" ? (
      <div 
        style={zoomLevel !== 100 ? ({ zoom: `${zoomLevel}%` } as React.CSSProperties) : undefined}
        className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-x-auto print:overflow-visible print:border-none print:shadow-none"
      >
        <Table className="print:text-xs">
          <TableHeader>
            <TableRow className="bg-slate-50/90 hover:bg-slate-50/90 border-b border-slate-200/80">
              <TableHead className="w-[155px] py-3 pl-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Order & Schedule</TableHead>
              <TableHead className="min-w-[175px] py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Customer</TableHead>
              <TableHead className="min-w-[210px] py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Route / Address</TableHead>
              <TableHead className="w-[165px] py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Billing & Sent Status</TableHead>
              <TableHead 
                className="w-[215px] py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:bg-slate-100/80 select-none transition-colors"
                onClick={() => setPaymentSort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
              >
                <div className="flex items-center gap-1.5">
                  <span>Payment & Status</span>
                  <ArrowUpDown size={12} className={paymentSort ? "text-indigo-600" : "text-slate-400"} />
                </div>
              </TableHead>
              <TableHead className="text-right w-[105px] py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Amount</TableHead>
              <TableHead className="w-[145px] py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Rider & SLA</TableHead>
              <TableHead className="text-center w-[130px] py-3 pr-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">Stage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {sortedJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-52 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                        <Search size={22} />
                      </div>
                      <p className="text-sm font-semibold text-slate-600">No orders found matching your filters</p>
                      <p className="text-xs text-slate-400">Try adjusting your date range, search term, or stage filter.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedJobs.map((job, i) => {
                  const createdDate = new Date(job.createdAt);
                  
                  let durationMin = null;
                  if (job.completedAt) {
                    durationMin = differenceInMinutes(new Date(job.completedAt), createdDate);
                  }

                  const matchedCustomer = findMatchingCustomer(customers, {
                    customerId: job.customerId,
                    customerName: job.customerName,
                    customerPhone: job.customerPhone,
                  });

                  const customerDisplayName = job.customerName || "Walk-in Guest";
                  const customerInitials = customerDisplayName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(part => part[0]?.toUpperCase() || "")
                    .join("") || "G";

                  const rowBreakdown = getJobPaymentBreakdown(job);
                  const rowIsCsoPaid = Boolean(job.isPaid);
                  const rowIsShopPaid = rowBreakdown.isFullyPaid || Boolean(job.isShopPaid);

                  let rowThemeClass = "hover:bg-indigo-50/25 border-l-[4px] border-l-slate-200/70";
                  if (stuckOnly || job.isStuck) {
                    rowThemeClass = "bg-rose-50/60 hover:bg-rose-100/60 border-l-[4px] border-l-rose-500";
                  } else if (csoPaidFilter === "RIDER_CASH") {
                    rowThemeClass = "bg-emerald-50/35 hover:bg-emerald-50/70 border-l-[4px] border-l-emerald-500";
                  } else if (csoPaidFilter === "CSO_PAID_SHOP_UNPAID") {
                    rowThemeClass = "bg-teal-50/35 hover:bg-teal-50/70 border-l-[4px] border-l-teal-500";
                  } else if (csoPaidFilter === "SHOP_UNPAID") {
                    rowThemeClass = "bg-orange-50/35 hover:bg-orange-50/70 border-l-[4px] border-l-orange-500";
                  } else if (csoPaidFilter === "PAID") {
                    rowThemeClass = "bg-sky-50/35 hover:bg-sky-50/70 border-l-[4px] border-l-sky-500";
                  } else if (billingFilterMode === "NO_BILL") {
                    rowThemeClass = "bg-amber-50/35 hover:bg-amber-50/70 border-l-[4px] border-l-amber-500";
                  } else if (billingFilterMode === "UNSENT_BILL") {
                    rowThemeClass = "bg-violet-50/35 hover:bg-violet-50/70 border-l-[4px] border-l-violet-500";
                  } else if (rowIsCsoPaid && !rowIsShopPaid) {
                    rowThemeClass = "hover:bg-teal-50/25 border-l-[4px] border-l-teal-500";
                  } else if (rowIsCsoPaid && rowIsShopPaid) {
                    rowThemeClass = "hover:bg-sky-50/25 border-l-[4px] border-l-sky-500";
                  } else if (!rowIsShopPaid) {
                    rowThemeClass = "hover:bg-orange-50/25 border-l-[4px] border-l-orange-400";
                  } else {
                    rowThemeClass = "hover:bg-emerald-50/25 border-l-[4px] border-l-emerald-500";
                  }

                  return (
                    <motion.tr
                      key={job.id}
                      onClick={() => { if (onEditJob) onEditJob(job); }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.25) }}
                      className={`group border-b border-slate-100/90 cursor-pointer transition-colors ${rowThemeClass}`}
                    >
                      {/* Column 1: Order & Schedule */}
                      <TableCell className="align-middle py-3 pl-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[12.5px] font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors">
                              #{formatJobDisplayId(job.id)}
                            </span>
                            {job.branchId && (() => {
                              const shop = shopLocations.find(s => s.id === job.branchId);
                              const shortName = getBranchShortName(shop?.name);
                              if (!shortName) return null;
                              return (
                                <span 
                                  title={shop?.name}
                                  className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md truncate max-w-[110px] border border-slate-200/70"
                                >
                                  {shortName}
                                </span>
                              );
                            })()}
                            <Badge variant="secondary" className="text-[9px] font-bold bg-purple-50 text-purple-700 border-purple-200/70 px-1.5 py-0 h-4">
                              {job.serviceType === 'wash_iron_fold' ? 'W/I/F' : 'W/F'}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[10.5px] text-slate-600 inline-flex items-center gap-1 font-semibold bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/70">
                              <Clock size={10} className="text-amber-500 shrink-0" />
                              {format(new Date(job.scheduledAt), "dd MMM, HH:mm")}
                            </span>
                            {(() => {
                              const js = realtimeState.jobSaveStates?.[job.id];
                              const isSavingRow = savingJobIds?.has(job.id) || js?.status === 'saving';
                              if (isSavingRow) {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md animate-pulse">
                                    <RefreshCw size={9} className="animate-spin text-blue-600" />
                                    Saving
                                  </span>
                                );
                              }
                              if (js?.status === 'saved') {
                                return (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                    ✓ Saved
                                  </span>
                                );
                              }
                              if (js?.status === 'conflict' || js?.status === 'failed') {
                                return (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md">
                                    ⚠ {js.status === 'conflict' ? 'Conflict' : 'Failed'}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {job.isStuck && (
                              <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-red-100 text-red-700 border-red-200 shrink-0">
                                Stuck
                              </Badge>
                            )}
                            {job.source === 'pos' && (
                              <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
                                POS
                              </Badge>
                            )}
                            {job.brand === "noname_laundry" && (
                              <Badge className="text-[9px] font-black px-1.5 py-0 h-4 bg-amber-100 text-amber-900 border-amber-300">
                                Noname
                              </Badge>
                            )}
                            {job.remark?.includes("Express 50%") && (
                              <Badge className="text-[9px] font-bold px-1.5 py-0 h-4 bg-orange-50 text-orange-600 border-orange-200">
                                EXP 50%
                              </Badge>
                            )}
                            {job.remark?.includes("Express 100%") && (
                              <Badge className="text-[9px] font-bold px-1.5 py-0 h-4 bg-red-50 text-red-600 border-red-200">
                                EXP 100%
                              </Badge>
                            )}
                            {job.refundId && (
                              <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-rose-100 text-rose-700 border-rose-200">
                                {job.status === "cancel" ? "REFUNDED" : "REFUNDED"}
                              </Badge>
                            )}
                            {(job.refundedFromId || job.id.startsWith("RF-")) && (
                              <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-blue-200">
                                REISSUED
                              </Badge>
                            )}
                            {job.subStatus === 'wash'  && <span title="Washing" className="w-4 h-4 rounded flex items-center justify-center bg-blue-100 text-blue-700 border border-blue-200"><Droplets size={10} /></span>}
                            {job.subStatus === 'dry'   && <span title="Drying" className="w-4 h-4 rounded flex items-center justify-center bg-orange-100 text-orange-700 border border-orange-200"><Wind size={10} /></span>}
                            {job.subStatus === 'iron'  && <span title="Ironing" className="w-4 h-4 rounded flex items-center justify-center bg-indigo-100 text-indigo-700 border border-indigo-200"><Shirt size={10} /></span>}
                            {job.subStatus === 'ready' && <span title="Ready" className="w-4 h-4 rounded flex items-center justify-center bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 size={10} /></span>}
                          </div>
                        </div>
                      </TableCell>
                      
                      {/* Column 2: Customer */}
                      <TableCell className="align-middle py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 border ${
                            matchedCustomer?.isVIP
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : matchedCustomer?.isMember
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : "bg-slate-100 text-slate-600 border-slate-200/80"
                          }`}>
                            {customerInitials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 flex-wrap leading-snug">
                              <span className="truncate max-w-[155px]">{customerDisplayName}</span>
                              {matchedCustomer?.isVIP && (
                                <Badge className="text-[8.5px] px-1.5 py-0 h-3.5 bg-gradient-to-r from-amber-200 to-amber-400 text-amber-900 border-none font-black">
                                  VIP
                                </Badge>
                              )}
                              {matchedCustomer?.isMember && (
                                <Badge className="text-[8.5px] px-1.5 py-0 h-3.5 bg-blue-100 text-blue-700 border-none font-bold">
                                  MEMBER
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10.5px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {(() => {
                                const rawPhone = job.customerPhone && job.customerPhone !== "-" ? job.customerPhone : "";
                                const displayContact = rawPhone || (matchedCustomer?.whatsappId ? `WA: ${matchedCustomer.whatsappId}` : (matchedCustomer?.lineId ? `LINE: ${matchedCustomer.lineId}` : "No Phone"));
                                return (
                                  <>
                                    <span className="truncate max-w-[140px]">{displayContact}</span>
                                    {matchedCustomer?.whatsappId && rawPhone && !rawPhone.toLowerCase().includes(matchedCustomer.whatsappId.toLowerCase()) && (
                                      <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0 rounded border border-emerald-200">
                                        WA: {matchedCustomer.whatsappId}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 3: Route / Address (Deduplicates when Pickup & Delivery are identical) */}
                      <TableCell className="align-middle py-3">
                        {(() => {
                          const pLoc = formatLocationWithRoom(job.pickupLocation, matchedCustomer, shopLocations);
                          const dLoc = formatLocationWithRoom(job.dropoffLocation, matchedCustomer, shopLocations);
                          const isSameAddress = pLoc.trim().toLowerCase() === dLoc.trim().toLowerCase();

                          if (isSameAddress) {
                            return (
                              <div className="flex items-start gap-1.5 max-w-[230px]" title={`Pickup & Return: ${pLoc}`}>
                                <MapPin size={13} className="shrink-0 text-emerald-600 mt-0.5" />
                                <div className="min-w-0">
                                  <span className="text-[11.5px] font-medium text-slate-700 leading-snug line-clamp-2">
                                    {pLoc}
                                  </span>
                                  <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/70">
                                    รับ-ส่งที่เดียวกัน
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="flex flex-col gap-1 max-w-[230px]">
                              <div className="flex items-center gap-1.5" title={`Pickup: ${pLoc}`}>
                                <span className="text-[8.5px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0 rounded shrink-0">รับ</span>
                                <span className="text-[11px] text-slate-700 font-medium truncate">{pLoc}</span>
                              </div>
                              <div className="flex items-center gap-1.5" title={`Delivery: ${dLoc}`}>
                                <span className="text-[8.5px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0 rounded shrink-0">ส่ง</span>
                                <span className="text-[11px] text-slate-700 font-medium truncate">{dLoc}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>

                      {/* Column 4: Billing & Customer Sent Status */}
                      <TableCell className="align-middle py-3" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const bMeta = getJobBillingMeta(job);
                          return (
                            <div className="flex flex-col gap-1.5">
                              <span
                                onClick={() => onEditJob && onEditJob(job)}
                                className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded-lg border w-fit cursor-pointer transition-colors ${
                                  bMeta.isBillIssued
                                    ? "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100/80"
                                    : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100/80"
                                }`}
                                title={bMeta.isBillIssued ? `Bill Issued: ${bMeta.billIssuedLabel}` : "No bill issued yet — Click to open job"}
                              >
                                {bMeta.isBillIssued ? <FileCheck2 size={11} className="text-emerald-600 shrink-0" /> : <FileWarning size={11} className="text-amber-600 shrink-0" />}
                                <span className="truncate max-w-[125px]">{bMeta.isBillIssued ? bMeta.billIssuedLabel : "No Bill Issued"}</span>
                              </span>
                              <button
                                type="button"
                                disabled={!isCsoOrAdmin}
                                onClick={(e) => handleToggleBillSent(job, e)}
                                className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all w-fit ${
                                  !isCsoOrAdmin
                                    ? "opacity-60 cursor-not-allowed " + (bMeta.isBillSent ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-violet-50/70 text-violet-800 border-violet-200")
                                    : bMeta.isBillSent
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                                      : "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100/80 cursor-pointer"
                                }`}
                                title={
                                  !isCsoOrAdmin
                                    ? `Customer Bill Status: ${bMeta.isBillSent ? "Bill Sent" : "Not Sent"} (Only CSO and Admin can change)`
                                    : bMeta.isBillSent
                                      ? `Bill Sent${bMeta.billSentBy ? ` by ${bMeta.billSentBy}` : ""}${bMeta.billSentAt ? ` (${format(new Date(bMeta.billSentAt), "dd/MM HH:mm")})` : ""} — Click to unmark`
                                      : "Click to mark Bill as Sent to Customer"
                                }
                              >
                                {bMeta.isBillSent ? <CheckCircle2 size={10} className="text-emerald-600 shrink-0" /> : <Send size={9.5} className="text-violet-600 shrink-0" />}
                                <span>{bMeta.isBillSent ? "Bill Sent ✓" : "Not Sent"}</span>
                              </button>
                            </div>
                          );
                        })()}
                      </TableCell>

                      {/* Column 5: Consolidated Payment Channel + CSO & Shop Payment Status */}
                      <TableCell className="align-middle py-3">
                        {(() => {
                          const breakdown = getJobPaymentBreakdown(job);
                          const isPos = job.source === 'pos' || (job.type as string) === 'in_store';
                          const isCsoPaid = Boolean(job.isPaid);
                          const isShopPaid = breakdown.isFullyPaid || Boolean(job.isShopPaid);
                          const isCsoPaidShopUnpaid = isCsoPaid && !isShopPaid;
                          const isCash = job.paymentChannel === "Cash / COD" || (job.paymentMethod || "").toLowerCase() === "cash";
                          const isProcessOrLater = !['tba', 'pending', 'pickup'].includes(job.status);

                          return (
                            <div className="flex flex-col gap-1.5">
                              {/* Top Line: Channel + Tax Req + COD Warning */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {breakdown.isSplit ? (
                                  <div className="relative group inline-block">
                                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] px-1.5 py-0.5 font-bold cursor-default flex items-center gap-1 shadow-none">
                                      <CreditCard size={10} className="text-indigo-500" />
                                      SPLIT ({breakdown.payments.length})
                                    </Badge>
                                    <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-30 bg-slate-900 text-white text-[9.5px] rounded-lg p-2 shadow-xl border border-slate-700 w-44 pointer-events-none">
                                      <div className="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-300">
                                        Payment Breakdown:
                                      </div>
                                      {breakdown.payments.map((p, idx) => (
                                        <div key={idx} className="flex justify-between py-0.5">
                                          <span className="text-slate-300 truncate max-w-[90px]">{p.channel || p.method}:</span>
                                          <span className="font-mono font-bold text-emerald-400">฿{p.amount.toLocaleString()}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11.5px] font-bold text-slate-800">
                                    {job.paymentChannel || "Unspecified"}
                                  </span>
                                )}

                                {(job.remark?.includes("ขอใบกำกับภาษี") || (job.remark && (job.remark.includes("Tax Invoice") || job.remark.includes("Req Tax Inv")))) && (
                                  <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[8.5px] px-1.5 py-0 h-4 font-black tracking-wider shadow-none">
                                    TAX REQ
                                  </Badge>
                                )}

                                {isCash && !breakdown.isFullyPaid && !job.isPaid && isProcessOrLater && (
                                  <span title={`Collect Cash (COD)${job.totalAmount ? ` ฿${Math.round(job.totalAmount).toLocaleString()}` : ""}`} className="inline-flex items-center gap-0.5 px-1.5 py-0 h-4 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-bold">
                                    <Banknote size={10} /> COD
                                  </span>
                                )}
                              </div>

                              {/* Bottom Line: CSO & Shop Status Pills with Timestamps */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {!isPos && (
                                  <span
                                    title={job.csoPaidAt ? `CSO Paid At: ${format(new Date(job.csoPaidAt), "dd/MM/yyyy HH:mm")}` : "CSO Payment Status"}
                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                      isCsoPaid
                                        ? (isCsoPaidShopUnpaid && csoPaidFilter !== "PAID")
                                          ? "bg-teal-100 text-teal-800 border-teal-300 shadow-2xs font-bold"
                                          : "bg-sky-100 text-sky-800 border-sky-300 shadow-2xs font-bold"
                                        : breakdown.isPartial
                                          ? "bg-amber-50 text-amber-800 border-amber-200"
                                          : "bg-slate-100 text-slate-600 border-slate-200"
                                    }`}
                                  >
                                    {isCsoPaid ? (
                                      <CheckCircle2 size={10} className={(isCsoPaidShopUnpaid && csoPaidFilter !== "PAID") ? "text-teal-600 shrink-0" : "text-sky-600 shrink-0"} />
                                    ) : (
                                      <Clock size={10} className="text-slate-400 shrink-0" />
                                    )}
                                    <span className="opacity-70">CSO:</span>
                                    <span>{isCsoPaid ? "PAID" : breakdown.isPartial ? `฿${Math.round(breakdown.totalPaid).toLocaleString()}` : "UNPAID"}</span>
                                    {job.csoPaidAt && (
                                      <span className="text-[8.5px] opacity-75 font-mono">
                                        ({format(new Date(job.csoPaidAt), "HH:mm")})
                                      </span>
                                    )}
                                  </span>
                                )}

                                <span
                                  title={job.shopPaidAt ? `Shop Paid At: ${format(new Date(job.shopPaidAt), "dd/MM/yyyy HH:mm")}` : "Shop Payment Status"}
                                  className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border ${
                                    breakdown.isFullyPaid
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/90"
                                      : breakdown.isPartial
                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                        : "bg-orange-100 text-orange-800 border-orange-300"
                                  }`}
                                >
                                  {breakdown.isFullyPaid && <CheckCircle2 size={9} className="text-emerald-600 shrink-0" />}
                                  <span className="opacity-70">SHOP:</span>
                                  <span>{breakdown.isFullyPaid ? "PAID" : breakdown.isPartial ? "PARTIAL" : "UNPAID"}</span>
                                  {(() => {
                                    let shopTime: string | null = null;
                                    if (breakdown.isFullyPaid) {
                                      if (job.shopPaidAt) {
                                        try { shopTime = format(new Date(job.shopPaidAt), "HH:mm"); } catch {}
                                      } else if (breakdown.payments.length > 0) {
                                        const last = breakdown.payments[breakdown.payments.length - 1];
                                        if (last?.timestamp) {
                                          try { shopTime = format(new Date(last.timestamp), "HH:mm"); } catch {}
                                        }
                                      }
                                    }
                                    if (!shopTime) return null;
                                    return (
                                      <span className="text-[8.5px] opacity-75 font-mono font-bold">
                                        ({shopTime})
                                      </span>
                                    );
                                  })()}
                                </span>
                              </div>

                              {isRiderCashDeliveryJob(job) && (() => {
                                const dRider = riders.find(r => r.id === (job.deliveryRiderId || job.riderId));
                                const riderName = dRider?.nickname || dRider?.name || "Rider";
                                const isCollected = Boolean(job.isShopPaid || job.cashPlaced);
                                return (
                                  <div className="flex items-center gap-1.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
                                    {isCollected ? (
                                      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300">
                                        <CheckCircle2 size={10} className="text-emerald-600" />
                                        <span>Cash Collected ({riderName})</span>
                                      </span>
                                    ) : canManageJobs ? (
                                      <button
                                        type="button"
                                        onClick={(e) => handleCollectRiderCash(job, e)}
                                        className="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition-colors cursor-pointer"
                                        title={`Collect ฿${Math.round(job.totalAmount || 0).toLocaleString()} from ${riderName}`}
                                      >
                                        <Banknote size={10} />
                                        <span>Collect Cash ({riderName})</span>
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300">
                                        <Clock size={10} className="text-amber-600" />
                                        <span>Pending Rider Cash ({riderName})</span>
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </TableCell>

                      {/* Column 6: Amount */}
                      <TableCell className="align-middle py-3 text-right">
                        <div className="flex flex-col items-end justify-center">
                          {(job.totalAmount || 0) - (job.fee || 0) > 0 ? (
                            <div className="font-extrabold text-[13.5px] text-slate-900">
                              ฿{(job.totalAmount || 0).toLocaleString(undefined, {
                                minimumFractionDigits: ((job.totalAmount || 0) % 1 !== 0 || /VAT:\s*exclusive/i.test(job.remark || "")) ? 2 : 0,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-600 font-bold">฿{job.fee}</span>
                              <Badge variant="outline" className="text-[8.5px] px-1 bg-amber-50 text-amber-700 border-amber-200 py-0 h-3.5 font-bold">
                                TBD
                              </Badge>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {(job.distance || job.deliveryDistance || job.pickupDistance || 0)} km
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 7: Rider & SLA */}
                      <TableCell className="align-middle py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-col gap-1">
                            {job.pickupRiderId && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9.5px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200/80">P</span>
                                <span className="font-semibold text-[11.5px] text-slate-800 truncate max-w-[105px]">
                                  {riders.find(r => r.id === job.pickupRiderId)?.name || job.pickupRiderId}
                                </span>
                              </div>
                            )}
                            {job.deliveryRiderId && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9.5px] font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200/80">D</span>
                                <span className="font-semibold text-[11.5px] text-indigo-700 truncate max-w-[105px]">
                                  {riders.find(r => r.id === job.deliveryRiderId)?.name || job.deliveryRiderId}
                                </span>
                              </div>
                            )}
                            {!job.pickupRiderId && !job.deliveryRiderId && job.riderId && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[11.5px] text-slate-800 truncate max-w-[115px]">
                                  {riders.find(r => r.id === job.riderId)?.name || 'Unknown'}
                                </span>
                              </div>
                            )}
                            {!job.pickupRiderId && !job.deliveryRiderId && !job.riderId && (
                              <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                            )}
                          </div>
                          <div className="text-[10px] font-medium">
                            {durationMin !== null ? (
                              <span className="text-emerald-700 font-semibold">Done in {durationMin}m</span>
                            ) : (
                              <span className="text-slate-400">Active order</span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 8: Stage */}
                      <TableCell className="align-middle py-3 pr-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const currentCol = getJobKanbanColumn(job);
                          return (
                            <>
                              <div className="print:hidden">
                                {canManageJobs ? (
                                  <select 
                                    value={currentCol}
                                    onChange={(e) => {
                                      const newCol = e.target.value as KanbanColumnId;
                                      handleMoveJobToColumn(job, newCol);
                                    }}
                                    className={`w-full text-[11px] font-bold rounded-xl border py-1.5 px-2.5 text-center focus:ring-2 focus:ring-indigo-500/25 focus:outline-none cursor-pointer transition-all shadow-2xs ${statusConfig[currentCol]?.className || ''}`}
                                  >
                                    <option value="tba">TBA</option>
                                    <option value="pending">Pending</option>
                                    <option value="pickup">Pickup</option>
                                    <option value="billing">Billing</option>
                                    <option value="process">Process</option>
                                    <option value="delivery">Delivery</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancel">Cancelled</option>
                                    <option value="return">Return</option>
                                  </select>
                                ) : (
                                  <Badge variant="outline" className={`text-[10.5px] uppercase font-bold justify-center w-fit mx-auto px-2.5 py-1 rounded-xl ${statusConfig[currentCol]?.className || ''}`}>
                                    {statusConfig[currentCol]?.label || currentCol}
                                  </Badge>
                                )}
                              </div>
                              <span className="hidden print:inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300">
                                {statusConfig[currentCol]?.label || currentCol}
                              </span>
                            </>
                          );
                        })()}
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          {/* Kanban Column Selector for Mobile & Tablet */}
          <div className="flex lg:hidden overflow-x-auto gap-2 pb-2 hide-scrollbar border-b border-slate-200/70 shrink-0">
            {visibleKanbanColumns.map(status => {
              const jobsInCol = filteredJobs.filter(j => getJobKanbanColumn(j) === status);
              const isActive = activeKanbanColumn === status;
              return (
                <button
                  key={status}
                  onClick={() => setActiveKanbanColumn(status)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border cursor-pointer ${
                    isActive 
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span>{statusConfig[status]?.label || status}</span>
                  <span className={`h-4 min-w-4 px-1.5 flex items-center justify-center text-[10px] rounded-full font-black ${
                    isActive ? "bg-white text-indigo-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {jobsInCol.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`flex-1 pb-4 ${screenFit === "fit" ? "overflow-x-auto lg:overflow-x-hidden" : "overflow-x-auto custom-scrollbar"}`}>
            <div 
              style={zoomLevel !== 100 ? ({ zoom: `${zoomLevel}%` } as React.CSSProperties) : undefined}
              className={`flex h-full min-h-[640px] transition-all duration-200 ${
                screenFit === "fit"
                  ? "w-full min-w-0 gap-2 xl:gap-2.5"
                  : "gap-3.5 min-w-full lg:min-w-max"
              }`}
            >
              {visibleKanbanColumns.map(status => {
                const isTabActive = activeKanbanColumn === status;
                const colJobs = filteredJobs.filter(j => getJobKanbanColumn(j) === status);
                const colNoBillCount = status === "billing" ? colJobs.filter(j => !getJobBillingMeta(j).isBillIssued).length : 0;
                const colUnsentCount = status === "billing" ? colJobs.filter(j => !getJobBillingMeta(j).isBillSent).length : 0;

                return (
                  <div 
                    key={status} 
                    data-status={status}
                    className={`flex flex-col bg-slate-100/70 rounded-2xl border border-slate-200/85 border-t-4 ${statusConfig[status].topBorder} h-full max-h-[76vh] shadow-2xs transition-all ${
                      screenFit === "fit"
                        ? "w-full lg:flex-1 lg:min-w-0 min-w-0 shrink"
                        : "w-full lg:w-[292px] shrink-0"
                    } ${
                      isTabActive ? "flex" : "hidden lg:flex"
                    }`}
                    onDragOver={(e) => {
                      if (status === 'completed') return;
                      e.preventDefault();
                      e.currentTarget.classList.add('bg-indigo-50/50', 'ring-2', 'ring-indigo-400/30');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('bg-indigo-50/50', 'ring-2', 'ring-indigo-400/30');
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('bg-indigo-50/50', 'ring-2', 'ring-indigo-400/30');
                      
                      if (status === 'completed') {
                        toast.error("Cannot drag and drop jobs directly to Completed status.");
                        return;
                      }

                      const jobId = e.dataTransfer.getData('jobId');
                      if (jobId) {
                        try {
                          const job = filteredJobs.find(j => j.id === jobId);
                          if (!job) return;
                          await handleMoveJobToColumn(job, status);
                        } catch (err: any) {
                          toast.error(err.message || "Failed to update job status");
                        }
                      }
                    }}
                  >
                    {/* Modern Column Header */}
                    <div className={`${screenFit === "fit" ? "px-2.5 py-2.5" : "px-3.5 py-3"} border-b border-slate-200/80 bg-white rounded-t-xl shrink-0`}>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`${statusConfig[status].className} w-6 h-6 flex items-center justify-center rounded-lg border shrink-0`}>
                            {statusIcon[status]}
                          </span>
                          <div className="min-w-0">
                            <span className={`font-extrabold ${screenFit === "fit" ? "text-xs" : "text-[13px]"} text-slate-900 tracking-tight truncate block`}>
                              {statusConfig[status].label}
                            </span>
                            {status === "billing" && (
                              <span className="hidden sm:block text-[9px] font-medium text-slate-400 leading-none mt-0.5 truncate">
                                Issue & Send Bill
                              </span>
                            )}
                            {status === "process" && (
                              <span className="hidden sm:block text-[9px] font-medium text-slate-400 leading-none mt-0.5 truncate">
                                Wash • Dry • Iron
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-black text-xs shrink-0 ${statusConfig[status].headerBadge}`}>
                          {colJobs.length}
                        </span>
                      </div>

                      {/* Billing Column Summary Sub-bar */}
                      {status === "billing" && colJobs.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            colNoBillCount > 0 ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}>
                            <FileWarning size={10} className={colNoBillCount > 0 ? "text-amber-600" : "text-emerald-600"} />
                            {colNoBillCount} No Bill
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            colUnsentCount > 0 ? "bg-violet-50 text-violet-800 border-violet-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}>
                            <Send size={9} className={colUnsentCount > 0 ? "text-violet-600" : "text-emerald-600"} />
                            {colUnsentCount} Not Sent
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Cards Container */}
                    <div className="p-2.5 flex-1 overflow-y-auto flex flex-col gap-2.5 min-h-[150px]">
                      {colJobs.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center px-4">
                          <div className="w-9 h-9 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-slate-300 mb-2 shadow-2xs">
                            {statusIcon[status]}
                          </div>
                          <p className="text-xs font-semibold text-slate-400">No orders in {statusConfig[status].label}</p>
                        </div>
                      ) : colJobs
                        .sort((a, b) => {
                          if (status === 'completed') {
                            const isPinnedA = checkIsPinned(a, user);
                            const isPinnedB = checkIsPinned(b, user);
                            if (isPinnedA && !isPinnedB) return -1;
                            if (!isPinnedA && isPinnedB) return 1;
                          }
                          if (status === 'billing') {
                            // Prioritize orders with No Bill or Bill Not Sent at the top of Billing column
                            const bmA = getJobBillingMeta(a);
                            const bmB = getJobBillingMeta(b);
                            const scoreA = (!bmA.isBillIssued ? 2 : 0) + (!bmA.isBillSent ? 1 : 0);
                            const scoreB = (!bmB.isBillIssued ? 2 : 0) + (!bmB.isBillSent ? 1 : 0);
                            if (scoreA !== scoreB) return scoreB - scoreA;
                          }
                          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                          return timeB - timeA;
                        })
                        .map(job => {
                        let durationMin = null;
                        if (job.completedAt) {
                          durationMin = differenceInMinutes(new Date(job.completedAt), new Date(job.createdAt));
                        }
                        
                        const isPinned = checkIsPinned(job, user);
                        const jobSaveState = realtimeState.jobSaveStates?.[job.id];
                        const isSaving = savingJobIds?.has(job.id) || jobSaveState?.status === 'saving';
                        const isSaveFailed = jobSaveState?.status === 'failed' || jobSaveState?.status === 'conflict';
                        const bMeta = getJobBillingMeta(job);
                        const cardBreakdown = getJobPaymentBreakdown(job);
                        const isCsoPaid = Boolean(job.isPaid);
                        const isShopPaid = cardBreakdown.isFullyPaid || Boolean(job.isShopPaid);
                        const isCsoPaidShopUnpaid = isCsoPaid && !isShopPaid;

                        // Dynamic Left Border & Card Background matching the 7 Filter Themes
                        let csoBorderAccent = "border-l-[4px] border-l-slate-200/70";
                        let cardBgClass = "bg-white border-slate-200/90 hover:border-indigo-300/80";

                        if (isSaving) {
                          cardBgClass = "bg-blue-50/40 border-blue-300 ring-2 ring-blue-400/40 animate-pulse";
                          csoBorderAccent = "border-l-[4px] border-l-blue-500";
                        } else if (isSaveFailed) {
                          cardBgClass = "bg-rose-50/70 border-rose-400 ring-2 ring-rose-400/40";
                          csoBorderAccent = "border-l-[4px] border-l-rose-500";
                        } else if (job.isStuck || stuckOnly) {
                          cardBgClass = "bg-rose-50/85 border-rose-300 text-rose-950 hover:bg-rose-100/70";
                          csoBorderAccent = "border-l-[4px] border-l-rose-500 shadow-rose-500/10";
                        } else if (csoPaidFilter === "RIDER_CASH") {
                          cardBgClass = "bg-emerald-50/45 border-emerald-300/90 hover:border-emerald-400";
                          csoBorderAccent = "border-l-[4px] border-l-emerald-500 shadow-emerald-500/10";
                        } else if (csoPaidFilter === "CSO_PAID_SHOP_UNPAID") {
                          cardBgClass = "bg-teal-50/45 border-teal-300/90 hover:border-teal-400";
                          csoBorderAccent = "border-l-[4px] border-l-teal-500 shadow-teal-500/10";
                        } else if (csoPaidFilter === "SHOP_UNPAID") {
                          cardBgClass = "bg-orange-50/45 border-orange-300/90 hover:border-orange-400";
                          csoBorderAccent = "border-l-[4px] border-l-orange-500 shadow-orange-500/10";
                        } else if (csoPaidFilter === "PAID") {
                          cardBgClass = "bg-sky-50/45 border-sky-300/90 hover:border-sky-400";
                          csoBorderAccent = "border-l-[4px] border-l-sky-500 shadow-sky-500/10";
                        } else if (billingFilterMode === "NO_BILL") {
                          cardBgClass = "bg-amber-50/45 border-amber-300/90 hover:border-amber-400";
                          csoBorderAccent = "border-l-[4px] border-l-amber-500 shadow-amber-500/10";
                        } else if (billingFilterMode === "UNSENT_BILL") {
                          cardBgClass = "bg-violet-50/45 border-violet-300/90 hover:border-violet-400";
                          csoBorderAccent = "border-l-[4px] border-l-violet-500 shadow-violet-500/10";
                        } else if (isPinned) {
                          cardBgClass = "bg-orange-50/90 border-orange-300 text-orange-950 hover:bg-orange-100/70";
                          csoBorderAccent = "border-l-[4px] border-l-orange-500";
                        } else if (isCsoPaidShopUnpaid) {
                          csoBorderAccent = "border-l-[4px] border-l-teal-500 shadow-teal-500/10";
                        } else if (isCsoPaid && isShopPaid) {
                          csoBorderAccent = "border-l-[4px] border-l-sky-500 shadow-sky-500/10";
                        } else if (!isShopPaid) {
                          csoBorderAccent = "border-l-[4px] border-l-orange-400 shadow-orange-500/5";
                        } else {
                          csoBorderAccent = "border-l-[4px] border-l-emerald-500 shadow-emerald-500/5";
                        }

                        const showBillingPanel = status === 'billing' || status === 'process' || status === 'delivery' || bMeta.isBillIssued || bMeta.isBillSent;

                        return (
                          <div 
                            key={job.id}
                            draggable={canManageJobs}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('jobId', job.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onClick={() => onEditJob && onEditJob(job)}
                            className={`${cardBgClass} ${csoBorderAccent} ${screenFit === "fit" ? "p-2.5 space-y-2" : "p-3 space-y-2.5"} rounded-xl border shadow-2xs hover:shadow-md cursor-pointer transition-all ${canManageJobs ? 'active:cursor-grabbing' : ''}`}
                          >
                            {/* Row 1: Order ID, Branch & Status Badges */}
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <span className="font-mono text-xs font-extrabold text-slate-900 tracking-tight">
                                  #{formatJobDisplayId(job.id)}
                                </span>
                                {isCsoPaid ? (
                                  <Badge 
                                    className={`${
                                      isCsoPaidShopUnpaid && csoPaidFilter !== "PAID"
                                        ? "bg-teal-100 text-teal-800 border-teal-300"
                                        : "bg-sky-100 text-sky-800 border-sky-300"
                                    } font-extrabold text-[9px] px-1.5 py-0 h-4.5 rounded-md shadow-2xs flex items-center gap-1 shrink-0`} 
                                    title={`CSO Confirmed Customer Paid${job.csoPaidAt ? ` (${format(new Date(job.csoPaidAt), "dd/MM HH:mm")})` : ""}`}
                                  >
                                    <CheckCircle2 size={10} className={`${isCsoPaidShopUnpaid && csoPaidFilter !== "PAID" ? "text-teal-600" : "text-sky-600"} shrink-0`} />
                                    <span>CSO PAID</span>
                                    {job.csoPaidAt && (
                                      <span className="opacity-75 font-mono text-[8px]">
                                        {format(new Date(job.csoPaidAt), "HH:mm")}
                                      </span>
                                    )}
                                  </Badge>
                                ) : (
                                  <span 
                                    title="Customer has not paid CSO yet"
                                    className="text-[8px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 border border-slate-200/80 px-1 py-0.5 rounded shrink-0"
                                  >
                                    CSO UNPAID
                                  </span>
                                )}
                                {job.branchId && (() => {
                                  const shop = shopLocations.find(s => s.id === job.branchId);
                                  const shortName = getBranchShortName(shop?.name);
                                  if (!shortName) return null;
                                  return (
                                    <span 
                                      title={shop?.name}
                                      className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md truncate max-w-[110px] border border-slate-200/70"
                                    >
                                      {shortName}
                                    </span>
                                  );
                                })()}
                                {job.laundryTypes && job.laundryTypes.length > 0 && (
                                  <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">
                                    {job.laundryTypes.join(', ')}
                                  </span>
                                )}
                              </div>

                              <div className="flex gap-1 items-center flex-wrap justify-end shrink-0">
                                {isSaving && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-100/80 border border-blue-300 px-1.5 py-0.5 rounded-md">
                                    <RefreshCw size={9} className="animate-spin text-blue-600" />
                                    Saving
                                  </span>
                                )}
                                {!isSaving && jobSaveState?.status === 'saved' && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                    ✓ Saved
                                  </span>
                                )}
                                {isSaveFailed && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-700 bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded-md">
                                    ⚠ {jobSaveState?.status === 'conflict' ? 'Conflict' : 'Failed'}
                                  </span>
                                )}
                                {job.isStuck && (
                                  <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-rose-100 text-rose-700 border-rose-200">Stuck</Badge>
                                )}
                                {job.source === 'pos' && (
                                  <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">POS</Badge>
                                )}
                                {job.brand === "noname_laundry" && (
                                  <Badge className="text-[9px] uppercase font-black px-1.5 py-0 h-4 bg-amber-100 text-amber-900 border-amber-300">Noname</Badge>
                                )}
                                {job.refundId && (
                                  <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-rose-100 text-rose-700 border-rose-200">
                                    REFUNDED
                                  </Badge>
                                )}
                                {(job.refundedFromId || job.id.startsWith("RF-")) && (
                                  <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-blue-200">
                                    REISSUED
                                  </Badge>
                                )}
                                {job.subStatus === 'wash'    && <span title="Washing" className="w-5 h-5 rounded-md flex items-center justify-center bg-blue-100 text-blue-700 border border-blue-200"><Droplets size={11} /></span>}
                                {job.subStatus === 'dry'     && <span title="Drying" className="w-5 h-5 rounded-md flex items-center justify-center bg-orange-100 text-orange-700 border border-orange-200"><Wind size={11} /></span>}
                                {job.subStatus === 'iron'    && <span title="Ironing" className="w-5 h-5 rounded-md flex items-center justify-center bg-indigo-100 text-indigo-700 border border-indigo-200"><Shirt size={11} /></span>}
                                {job.subStatus === 'ready'   && <span title="Ready" className="w-5 h-5 rounded-md flex items-center justify-center bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 size={11} /></span>}
                              </div>
                            </div>

                            {/* Row 2: Customer Name & Tier */}
                            <div>
                              <div className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5 flex-wrap leading-snug">
                                <span className={`truncate ${screenFit === "fit" ? "max-w-[125px] 2xl:max-w-[180px]" : "max-w-[180px]"}`}>{job.customerName || "Walk-in Guest"}</span>
                                {(() => {
                                  const c = findMatchingCustomer(customers, {
                                    customerId: job.customerId,
                                    customerName: job.customerName,
                                    customerPhone: job.customerPhone,
                                  });
                                  if (!c) return null;
                                  return (
                                    <>
                                      {c.isVIP && <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-gradient-to-r from-amber-200 to-amber-400 text-amber-900 border-none font-black">VIP</Badge>}
                                      {c.isMember && <Badge className="text-[8px] px-1.5 py-0 h-3.5 bg-blue-100 text-blue-700 border-none font-bold">MEMBER</Badge>}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Row 3: Dedicated Billing & Customer Notification Panel */}
                            {showBillingPanel && (
                              <div
                                className="rounded-xl p-2 bg-slate-50/90 border border-slate-200/80 space-y-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="grid grid-cols-2 gap-1.5">
                                  {/* Indicator 1: Bill Issued vs No Bill Issued (Amber matches Filter #4) */}
                                  <div
                                    onClick={() => onEditJob && onEditJob(job)}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer ${
                                      bMeta.isBillIssued
                                        ? "bg-white text-slate-700 border-slate-200/90 shadow-2xs"
                                        : "bg-amber-50 text-amber-900 border-amber-300/90"
                                    }`}
                                    title={
                                      bMeta.isBillIssued
                                        ? `Bill Issued: ${bMeta.billIssuedLabel}${bMeta.hasBillPhoto ? ` (${bMeta.billPhotoCount} photo)` : ""}`
                                        : "No bill issued yet — Click to open job and issue bill"
                                    }
                                  >
                                    {bMeta.isBillIssued ? (
                                      <FileCheck2 size={12} className="text-emerald-600 shrink-0" />
                                    ) : (
                                      <FileWarning size={12} className="text-amber-600 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[8.5px] uppercase tracking-wider opacity-75 leading-none">
                                        {bMeta.isBillIssued ? "Bill Issued" : "Bill Status"}
                                      </div>
                                      <div className="truncate leading-tight mt-0.5">
                                        {bMeta.isBillIssued ? bMeta.billIssuedLabel : "No Bill Yet"}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Indicator 2: Sent to Customer vs Not Sent (Violet matches Filter #5) - Only CSO & Admin */}
                                  <button
                                    type="button"
                                    disabled={!isCsoOrAdmin}
                                    onClick={(e) => handleToggleBillSent(job, e)}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left text-[10px] font-bold transition-all ${
                                      !isCsoOrAdmin
                                        ? "opacity-60 cursor-not-allowed " + (bMeta.isBillSent ? "bg-emerald-50 text-emerald-700 border-emerald-200/90" : "bg-violet-50/70 text-violet-800 border-violet-200/70")
                                        : bMeta.isBillSent
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200/90 hover:bg-emerald-100/80 shadow-2xs cursor-pointer"
                                          : "bg-violet-50/90 text-violet-800 border-violet-200/90 hover:bg-violet-100/80 cursor-pointer"
                                    }`}
                                    title={
                                      !isCsoOrAdmin
                                        ? `Customer Bill Status: ${bMeta.isBillSent ? "Bill Sent" : "Not Sent"} (Only CSO and Admin can change)`
                                        : bMeta.isBillSent
                                          ? `Sent to Customer${bMeta.billSentBy ? ` by ${bMeta.billSentBy}` : ""}${bMeta.billSentAt ? ` (${format(new Date(bMeta.billSentAt), "dd/MM HH:mm")})` : ""} — Click to toggle`
                                          : "Bill not sent to customer yet — Click to mark as Sent"
                                    }
                                  >
                                    {bMeta.isBillSent ? (
                                      <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                                    ) : (
                                      <Send size={11} className="text-violet-600 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[8.5px] uppercase tracking-wider opacity-75 leading-none">
                                        Customer
                                      </div>
                                      <div className="truncate leading-tight mt-0.5">
                                        {bMeta.isBillSent ? "Bill Sent ✓" : "Not Sent"}
                                      </div>
                                    </div>
                                  </button>
                                </div>

                                {/* Quick Advance Button when inside Billing Column - Restricted to CSO, Admin, Branch Manager with Bill Sent */}
                                {status === "billing" && canManageJobs && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveJobToColumn(job, "process");
                                    }}
                                    className={`w-full flex items-center justify-center gap-1.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                      canAdvanceBilling && bMeta.isBillSent
                                        ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-2xs"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-200/80"
                                    }`}
                                    title={
                                      !canAdvanceBilling
                                        ? "Only CSO, Admin, and Branch Managers can advance order to Process"
                                        : !bMeta.isBillSent
                                          ? "Bill must be marked as Sent to Customer before advancing to Process"
                                          : "Move order from Billing to Process stage"
                                    }
                                  >
                                    <span>Move to Process</span>
                                    <ArrowRight size={11} />
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Row 4: Schedule & Route */}
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="inline-flex items-center gap-1 text-[10.5px] bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/60 text-slate-600 font-medium">
                                  <span className="text-[9px] font-extrabold text-emerald-600 uppercase">P:</span>
                                  <span>
                                    {job.scheduledAt
                                      ? isSameDay(new Date(job.scheduledAt), new Date())
                                        ? format(new Date(job.scheduledAt), "HH:mm")
                                      : format(new Date(job.scheduledAt), "dd MMM, HH:mm")
                                      : "-"}
                                  </span>
                                </div>
                                {job.deliveryScheduledAt && (
                                  <div className="inline-flex items-center gap-1 text-[10.5px] bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/60 text-slate-600 font-medium">
                                    <span className="text-[9px] font-extrabold text-rose-600 uppercase">D:</span>
                                    <span>
                                      {isSameDay(new Date(job.deliveryScheduledAt), new Date())
                                        ? format(new Date(job.deliveryScheduledAt), "HH:mm")
                                        : format(new Date(job.deliveryScheduledAt), "dd MMM, HH:mm")}
                                    </span>
                                  </div>
                                )}
                                {job.remark?.includes("Express 50%") && (
                                  <Badge className="text-[9px] font-bold px-1.5 py-0 h-4 bg-orange-50 text-orange-600 border-orange-200">
                                    EXP 50%
                                  </Badge>
                                )}
                                {job.remark?.includes("Express 100%") && (
                                  <Badge className="text-[9px] font-bold px-1.5 py-0 h-4 bg-red-50 text-red-600 border-red-200">
                                    EXP 100%
                                  </Badge>
                                )}
                              </div>

                              {job.type === 'full_service' && job.pickupLocation && job.dropoffLocation && 
                               job.pickupLocation.trim().toLowerCase() !== job.dropoffLocation.trim().toLowerCase() && (
                                <Badge className="text-[8.5px] font-extrabold px-1.5 py-0 h-4 bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-0.5 shadow-2xs uppercase">
                                  <MapPin size={9} className="text-rose-600 shrink-0" />
                                  รับ-ส่งคนละที่
                                </Badge>
                              )}

                              {(() => {
                                const c = findMatchingCustomer(customers, {
                                  customerId: job.customerId,
                                  customerName: job.customerName,
                                  customerPhone: job.customerPhone,
                                });
                                if (['billing', 'delivery', 'completed'].includes(job.status)) {
                                  const dLoc = formatLocationWithRoom(job.dropoffLocation, c, shopLocations);
                                  return (
                                    <div className="text-[11px] text-slate-600 flex items-start gap-1 pt-0.5" title="Delivery Address">
                                      <Navigation size={11} className="shrink-0 mt-0.5 text-rose-500" />
                                      <span className="line-clamp-2 font-medium text-slate-700 leading-snug">
                                        <span className="text-[8.5px] font-bold text-rose-600 uppercase mr-1 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">ส่ง</span>
                                        {dLoc}
                                      </span>
                                    </div>
                                  );
                                } else {
                                  const pLoc = formatLocationWithRoom(job.pickupLocation, c, shopLocations);
                                  return (
                                    <div className="text-[11px] text-slate-600 flex items-start gap-1 pt-0.5" title="Pickup Address">
                                      <MapPin size={11} className="shrink-0 mt-0.5 text-emerald-600" />
                                      <span className="line-clamp-2 leading-snug">
                                        <span className="text-[8.5px] font-bold text-emerald-600 uppercase mr-1 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">รับ</span>
                                        {pLoc}
                                      </span>
                                    </div>
                                  );
                                }
                              })()}
                            </div>

                            {/* Rider Cash Settlement Panel */}
                            {isRiderCashDeliveryJob(job) && (() => {
                              const dRider = riders.find(r => r.id === (job.deliveryRiderId || job.riderId));
                              const riderName = dRider?.nickname || dRider?.name || "Rider";
                              const isCollected = Boolean(job.isShopPaid || job.cashPlaced);
                              const amountFmt = (job.totalAmount || 0).toLocaleString(undefined, {
                                minimumFractionDigits: (job.totalAmount || 0) % 1 !== 0 ? 2 : 0,
                                maximumFractionDigits: 2,
                              });

                              return (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className={`rounded-xl p-2 border transition-all ${
                                    isCollected
                                      ? "bg-emerald-50/70 border-emerald-200/90 text-emerald-900"
                                      : "bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                        isCollected ? "bg-emerald-200/80 text-emerald-800" : "bg-emerald-600 text-white"
                                      }`}>
                                        <Banknote size={13} />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                                          <span>Rider Cash</span>
                                          <span className="text-slate-400 font-normal">•</span>
                                          <span className="truncate max-w-[90px] font-extrabold">{riderName}</span>
                                        </div>
                                        <div className="text-[11px] font-black font-mono text-emerald-950 leading-tight">
                                          ฿{amountFmt}
                                        </div>
                                      </div>
                                    </div>

                                    {isCollected ? (
                                      <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-1 rounded-lg bg-white/90 text-emerald-700 border border-emerald-300 shadow-2xs shrink-0">
                                        <CheckCircle2 size={11} className="text-emerald-600" />
                                        <span>Collected</span>
                                      </span>
                                    ) : canManageJobs ? (
                                      <button
                                        type="button"
                                        onClick={(e) => handleCollectRiderCash(job, e)}
                                        className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer shrink-0 active:scale-95"
                                        title={`Collect ฿${amountFmt} cash from ${riderName}`}
                                      >
                                        <Banknote size={11} />
                                        <span>Collect Cash</span>
                                      </button>
                                    ) : (
                                      <span className="text-[9.5px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300 shrink-0">
                                        Pending Cash
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Row 5: Price & Payment Status */}
                            <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-extrabold text-slate-900">
                                  ฿{(job.totalAmount || 0).toLocaleString(undefined, {
                                    minimumFractionDigits: ((job.totalAmount || 0) % 1 !== 0 || /VAT:\s*exclusive/i.test(job.remark || "")) ? 2 : 0,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                                {(() => {
                                  const breakdown = getJobPaymentBreakdown(job);
                                  const isPos = job.source === 'pos' || (job.type as string) === 'in_store';
                                  const fmtPaid = breakdown.totalPaid.toLocaleString(undefined, {
                                    minimumFractionDigits: breakdown.totalPaid % 1 !== 0 ? 2 : 0,
                                    maximumFractionDigits: 2,
                                  });
                                  const statusLabel = breakdown.isFullyPaid ? 'PAID' : breakdown.isPartial ? `PARTIAL (฿${fmtPaid})` : 'UNPAID';
                                  const colorClass = breakdown.isFullyPaid ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : breakdown.isPartial ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-orange-100 text-orange-800 border-orange-300';
                                  const channelLabel = breakdown.isSplit ? `SPLIT (${breakdown.payments.length})` : (job.paymentChannel || '');

                                  // Extract Shop Paid timestamp if paid
                                  let shopPaidTime: string | null = null;
                                  if (breakdown.isFullyPaid) {
                                    if (job.shopPaidAt) {
                                      try {
                                        shopPaidTime = format(new Date(job.shopPaidAt), "HH:mm");
                                      } catch {}
                                    } else if (breakdown.payments.length > 0) {
                                      const lastPayment = breakdown.payments[breakdown.payments.length - 1];
                                      if (lastPayment?.timestamp) {
                                        try {
                                          shopPaidTime = format(new Date(lastPayment.timestamp), "HH:mm");
                                        } catch {}
                                      }
                                    }
                                  }

                                  return (
                                    <div className="inline-flex items-center gap-1 flex-wrap text-[9px]">
                                      {/* Shop Payment Breakdown Badge */}
                                      <span 
                                        title={shopPaidTime ? `Shop Payment Recorded at ${shopPaidTime}` : undefined}
                                        className={`px-1.5 py-0.5 rounded-md uppercase font-bold tracking-wider inline-flex items-center gap-1 border ${colorClass}`}
                                      >
                                        {breakdown.isFullyPaid && <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />}
                                        <span>
                                          {channelLabel ? `${channelLabel} • ` : ''}{isPos ? `SHOP ${statusLabel}` : statusLabel}
                                        </span>
                                        {shopPaidTime && (
                                          <span className="font-mono text-[8px] opacity-80 font-bold">
                                            ({shopPaidTime})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>

                              {(() => {
                                const isCash = job.paymentChannel === "Cash / COD" || (job.paymentMethod || "").toLowerCase() === "cash";
                                const isProcessOrLater = !['tba', 'pending', 'pickup'].includes(job.status);
                                if (isCash && !isJobFullyPaid(job) && !job.isPaid && isProcessOrLater) {
                                  return (
                                    <span title="Collect Cash (COD)" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-bold shrink-0">
                                      <Banknote size={10} /> COD
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* Row 6: Riders & Timestamp Footer */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100/80">
                              <div className="flex gap-1 flex-wrap items-center">
                                {job.createdBy && (
                                  <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50/80 px-1.5 py-0.5 rounded-md border border-indigo-200/70 flex items-center gap-1 shrink-0" title={`Created by ${job.createdBy}`}>
                                    <User size={9} className="text-indigo-500" /> {job.createdBy}
                                  </span>
                                )}
                                {job.pickupRiderId && <span className="text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded-md border border-amber-200 flex items-center gap-1" title="Pickup Rider Assigned"><Package size={9} /> {(() => { const r = riders.find(r => r.id === job.pickupRiderId); return r?.nickname || r?.name || job.pickupRiderId; })()}</span>}
                                {job.deliveryRiderId && <span className="text-[9px] font-bold text-teal-800 bg-teal-100/80 px-1.5 py-0.5 rounded-md border border-teal-200 flex items-center gap-1" title="Delivery Rider Assigned"><Truck size={9} /> {(() => { const r = riders.find(r => r.id === job.deliveryRiderId); return r?.nickname || r?.name || job.deliveryRiderId; })()}</span>}
                                {!job.pickupRiderId && !job.deliveryRiderId && job.riderId && (
                                  <span className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200 flex items-center gap-1" title="Rider Assigned"><Truck size={9} /> {(() => { const r = riders.find(r => r.id === job.riderId); return r?.nickname || r?.name || job.riderId; })()}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                 {durationMin !== null ? (
                                   <span className="text-[10px] font-semibold text-slate-600">{durationMin}m</span>
                                 ) : (
                                   <span className="text-[10px] text-slate-400 font-medium">{format(new Date(job.createdAt), "HH:mm")}</span>
                                 )}
                              </div>
                            </div>

                            {status === 'delivery' && ((job.type as string) === 'in_store' || (job.source === 'pos' && (job.type as string) !== 'delivery' && (job.type as string) !== 'full_service')) && (() => {
                              const isPaid = isJobFullyPaid(job);
                              return (
                                <div className="pt-2 border-t border-slate-100">
                                  <Button
                                    size="sm"
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!isPaid) {
                                        const breakdown = getJobPaymentBreakdown(job);
                                        const remainingStr = breakdown.isPartial ? ` (คงเหลือ ฿${breakdown.remaining.toLocaleString()})` : '';
                                        toast.error(`ไม่สามารถปิดงานได้: Order #${formatJobDisplayId(job.id)} ยังไม่ได้ชำระเงิน${remainingStr} กรุณาบันทึกการชำระเงินก่อน`);
                                        return;
                                      }
                                      try {
                                        const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
                                        await jobStore.completeJob(job.id, undefined, "delivery", actorDetails);
                                        toast.success(`Order #${formatJobDisplayId(job.id)}: Customer Picked Up (Completed)`);
                                      } catch (err: any) {
                                        toast.error(`ไม่สามารถปิดงานได้: ${err.message}`);
                                      }
                                    }}
                                    className={`w-full h-7 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-pointer border transition-all ${
                                      isPaid
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                                    }`}
                                    title={isPaid ? "Customer Picked Up (ลูกค้ารับผ้าแล้ว)" : "ยังไม่ได้ชำระเงิน - กรุณาบันทึกการชำระเงินก่อนส่งมอบผ้า"}
                                  >
                                    <CheckCircle2 size={13} className={isPaid ? "text-white" : "text-slate-400"} />
                                    <span>Customer Picked Up</span>
                                    {!isPaid && <span className="text-[9px] font-extrabold text-rose-600 ml-0.5">(ยังไม่ชำระ)</span>}
                                  </Button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!cancellingJob} onOpenChange={(open) => {
        if (!open) {
          setCancellingJob(null);
          setCancelReason("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Job {cancellingJob ? `#${formatJobDisplayId(cancellingJob.id)}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for cancellation <span className="text-red-500">*</span></Label>
              <Input 
                value={cancelReason} 
                onChange={e => setCancelReason(e.target.value)} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cancelReason.trim()) {
                    e.preventDefault();
                    handleConfirmCancel();
                  }
                }}
                placeholder="e.g. Customer requested, Invalid location..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancellingJob(null); setCancelReason(""); }}>Keep Job</Button>
            <Button 
              disabled={!cancelReason.trim()}
              onClick={handleConfirmCancel} 
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenDialog.isOpen} onOpenChange={(open) => !open && setReopenDialog(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for moving job out of completed <span className="text-red-500">*</span></Label>
              <Input 
                id="reopen-reason-input"
                value={reopenDialog.reason} 
                onChange={e => setReopenDialog(prev => ({ ...prev, reason: e.target.value }))} 
                placeholder="e.g. Laundry needs rewashing, Customer changed request..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialog(prev => ({ ...prev, isOpen: false }))}>Cancel</Button>
            <Button 
              id="confirm-reopen-btn"
              disabled={!reopenDialog.reason.trim()}
              onClick={async () => {
                const { jobId, targetStatus, reason } = reopenDialog;
                if (!jobId || !targetStatus) return;
                try {
                  const job = filteredJobs.find(j => j.id === jobId);
                  if (!job) return;

                  const targetCol = targetStatus as KanbanColumnId;
                  const dbStatus: JobStatus = (targetCol === "billing" || targetCol === "process") ? "billing" : (targetCol as JobStatus);
                  const stagePatch: Record<string, any> =
                    targetCol === "billing"
                      ? { kanbanStage: "billing" }
                      : targetCol === "process"
                      ? { kanbanStage: "process" }
                      : {};

                  const updatedJson = buildUpdatedAdminNotesJson(
                    job,
                    stagePatch,
                    `Reopened Job: Status changed from Completed to ${statusConfig[targetCol]?.label || targetCol}. Reason: ${reason.trim()}`
                  );

                  const updates: any = {
                    status: dbStatus,
                    adminNotesJson: updatedJson,
                  };
                  if (targetCol === "billing") updates.subStatus = "billing";
                  else if (targetCol === "process") updates.subStatus = "wash";

                  const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
                  await jobStore.updateJobDetails(jobId, updates, actorDetails);
                  toast.success(`Job updated to ${statusConfig[targetCol]?.label || targetCol}`);
                  setReopenDialog({ isOpen: false, jobId: "", targetStatus: "", reason: "" });
                } catch (e: any) {
                  toast.error(`Error: ${e.message}`);
                }
              }} 
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Confirm Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Beam Online Payment Dialog */}
      <OnlinePaymentDialog
        isOpen={!!onlinePaymentJob}
        onClose={() => setOnlinePaymentJob(null)}
        job={onlinePaymentJob}
        customAmount={onlinePaymentJob?.totalAmount ?? undefined}
        onPaymentSuccess={async (paidInfo) => {
          if (onlinePaymentJob) {
            const { api, refreshDb } = await import("@/lib/api");
            api.optimisticUpdate(onlinePaymentJob.id, {
              isPaid: true,
              isShopPaid: true,
              paymentChannel: paidInfo.channel,
            } as any);
            jobStore.notify();
            await refreshDb();
            const updated = jobStore.getSnapshot().find(j => j.id === onlinePaymentJob.id) || onlinePaymentJob;
            setReceiptJob({ ...updated, isPaid: true, isShopPaid: true, paymentChannel: paidInfo.channel } as Job);
            setShowReceipt(true);
          }
          setOnlinePaymentJob(null);
        }}
      />

      {/* Receipt Viewer & Printer Dialog for AllJobs */}
      {receiptJob && (
        systemSettings?.receiptPaperSize === "A5" ? (
          <A5ReceiptDialog
            open={showReceipt}
            onOpenChange={(open) => {
              setShowReceipt(open);
              if (!open) setReceiptJob(null);
            }}
            receiptData={formatJobToReceiptData(receiptJob)}
            activeShop={shopLocations.find(s => s.id === receiptJob?.branchId) || shopLocations[0]}
            currentLanguage={systemSettings?.language || "th"}
          />
        ) : (
          <ThermalReceiptDialog
            open={showReceipt}
            onOpenChange={(open) => {
              setShowReceipt(open);
              if (!open) setReceiptJob(null);
            }}
            receiptData={formatJobToReceiptData(receiptJob)}
            activeShop={shopLocations.find(s => s.id === receiptJob?.branchId) || shopLocations[0]}
            receiptPaperSize={systemSettings?.receiptPaperSize || "80mm"}
            currentLanguage={systemSettings?.language || "th"}
          />
        )
      )}

      {/* Daily Sale Summary Dialog */}
      <DailySaleDialog
        isOpen={showDailySale}
        onClose={() => setShowDailySale(false)}
        jobs={jobs}
        user={user}
        shopLocations={shopLocations}
        selectedBranchIds={selectedBranchIds}
        customers={customers}
        onViewJob={onEditJob}
      />
    </div>
  );
});
