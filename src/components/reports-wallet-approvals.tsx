"use client";

import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar as CalendarIcon,
  Store,
  Eye,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Receipt,
  User,
  RotateCcw,
  Sparkles,
  Ban,
  MessageSquare
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import { 
  walletApprovalStore, 
  shopStore, 
  type WalletTransactionItem, 
  customerStore, 
  jobStore 
} from "@/lib/store";
import { formatCurrency, formatJobDisplayId } from "@/lib/utils";
import { A5ReceiptDialog } from "@/components/a5-receipt-dialog";
import { type ReceiptData } from "@/components/thermal-receipt-dialog";

export function getCleanBranchName(rawName?: string | null): string {
  if (!rawName || rawName === "-") return "-";
  // Matches "That Laundry Shop (15 Sukhumvit Residences)" or any "Prefix (Branch)"
  const parenMatch = rawName.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]?.trim()) {
    return parenMatch[1].trim();
  }
  // Matches "That Laundry Shop - Branch Name"
  const dashParts = rawName.split(/[-–—]/);
  if (dashParts.length > 1 && /that\s*laundry\s*shop|tls/i.test(dashParts[0])) {
    return dashParts.slice(1).join("-").trim();
  }
  // Strip "That Laundry Shop" or "TLS" prefix
  const stripped = rawName.replace(/^(that\s*laundry\s*shop|tls)\s+/i, "").trim();
  return stripped || rawName;
}

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";
type ApprovalStatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

export const getWalletTypeConfig = (type: string) => {
  switch (type) {
    case "TOPUP":
      return {
        label: "Top-Up",
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      };
    case "DEDUCT":
      return {
        label: "POS Payment",
        cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      };
    case "ADJUST_ADD":
      return {
        label: "Manual Adjust (+)",
        cls: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
      };
    case "ADJUST_DEDUCT":
      return {
        label: "Manual Adjust (-)",
        cls: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      };
    case "REFUND":
    case "REFUND_CREDIT":
      return {
        label: "Refund",
        cls: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
      };
    case "REVERSAL":
      return {
        label: "Reversal",
        cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      };
    default:
      return {
        label: type,
        cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      };
  }
};

interface ReportsWalletApprovalsProps {
  selectedBranch?: string;
  onViewJob?: (job: any, walletTx?: WalletTransactionItem) => void;
}

export function ReportsWalletApprovals({ selectedBranch = "all", onViewJob }: ReportsWalletApprovalsProps) {
  const { user } = useAuth();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const customers = useSyncExternalStore(customerStore.subscribe, customerStore.getSnapshot, customerStore.getSnapshot);
  const jobs = useSyncExternalStore(jobStore.subscribe, jobStore.getSnapshot, jobStore.getSnapshot);
  const pendingWalletMap = useSyncExternalStore(walletApprovalStore.subscribe, walletApprovalStore.getSnapshot, walletApprovalStore.getSnapshot);

  // Permission check
  const canApproveWallet = Boolean(
    user?.role === "admin" ||
    user?.permissions?.includes("approve-wallet")
  );

  // --- Filter States ---
  const [statusFilter, setStatusFilter] = useState<ApprovalStatusFilter>("PENDING");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>(selectedBranch);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // --- Date Range States ---
  const [datePreset, setDatePreset] = useState<DatePreset>("30days");
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState<Date>(() => endOfDay(new Date()));
  const [customStartInput, setCustomStartInput] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEndInput, setCustomEndInput] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // --- Data State ---
  const [transactions, setTransactions] = useState<WalletTransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // --- Modals State ---
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [txToReject, setTxToReject] = useState<WalletTransactionItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [inspectTx, setInspectTx] = useState<WalletTransactionItem | null>(null);

  // Top-Up Receipt Dialog state
  const [previewReceiptData, setPreviewReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptActiveShop, setReceiptActiveShop] = useState<any>(null);

  const handleOpenTopUpReceipt = (tx: WalletTransactionItem) => {
    const customerObj = customers.find((c) => c.id === tx.customerId);
    const linkedJob = tx.referenceId ? jobs.find(j => j.id === tx.referenceId || j.billNo === tx.referenceId) : null;
    const effectiveBranchId = tx.branchId || linkedJob?.branchId;
    const branchObj = shops.find((s) => s.id === effectiveBranchId || s.name === tx.branchId) || shops[0] || null;
    const receiptNo = tx.referenceId || `TU-${tx.id.slice(0, 8).toUpperCase()}`;
    const paidAmount = Math.max(0, (tx.amount || 0) - (tx.bonusAmount || 0));

    const rdata: ReceiptData = {
      id: receiptNo,
      receiptNumber: receiptNo,
      createdAt: new Date(tx.createdAt),
      customerName: tx.customerName || customerObj?.name || "Customer",
      customerPhone: customerObj?.phone || "-",
      customerId: tx.customerId,
      deliveryAddress: customerObj?.defaultAddress || null,
      items: [
        {
          name: tx.packageName ? `Package: ${tx.packageName}` : "Member Wallet Top-Up",
          quantity: 1,
          price: paidAmount,
          total: paidAmount,
          category: "PACKAGE",
        } as any,
      ],
      subtotal: paidAmount,
      expressSurcharge: 0,
      discount: 0,
      total: paidAmount,
      isPaid: true,
      paymentChannel: tx.paymentChannel || "Transfer",
      isDraft: false,
      vatType: "none",
      vatRate: 0,
      vatAmount: 0,
      walletBalance: tx.balanceAfter,
      isMember: true,
      status: "completed",
      serviceSpeed: "standard",
    };

    setReceiptActiveShop(branchObj ? {
      id: branchObj.id,
      name: branchObj.name,
      address: branchObj.addressFull || branchObj.address,
      phone: branchObj.phone,
      taxId: branchObj.taxId,
      logoUrl: branchObj.logoUrl,
    } : null);

    setPreviewReceiptData(rdata);
    setIsReceiptOpen(true);
  };

  // Update internal branch filter when prop changes
  useEffect(() => {
    if (selectedBranch) {
      setBranchFilter(selectedBranch);
    }
  }, [selectedBranch]);

  // Apply Date Preset Helper
  const applyPreset = (preset: DatePreset) => {
    const today = new Date();
    setDatePreset(preset);

    if (preset === "today") {
      setStartDate(startOfDay(today));
      setEndDate(endOfDay(today));
    } else if (preset === "yesterday") {
      const yesterday = subDays(today, 1);
      setStartDate(startOfDay(yesterday));
      setEndDate(endOfDay(yesterday));
    } else if (preset === "7days") {
      setStartDate(startOfDay(subDays(today, 6)));
      setEndDate(endOfDay(today));
    } else if (preset === "30days") {
      setStartDate(startOfDay(subDays(today, 29)));
      setEndDate(endOfDay(today));
    } else if (preset === "thisMonth") {
      setStartDate(startOfMonth(today));
      setEndDate(endOfMonth(today));
    } else if (preset === "lastMonth") {
      const prevMonth = subMonths(today, 1);
      setStartDate(startOfMonth(prevMonth));
      setEndDate(endOfMonth(prevMonth));
    }
    setIsDatePickerOpen(false);
  };

  const handleApplyCustomDate = () => {
    if (customStartInput && customEndInput) {
      setStartDate(startOfDay(new Date(customStartInput)));
      setEndDate(endOfDay(new Date(customEndInput)));
      setDatePreset("custom");
      setIsDatePickerOpen(false);
    }
  };

  // Fetch Transactions
  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const res = await walletApprovalStore.getTransactions({
        approvalStatus: statusFilter === "all" ? undefined : statusFilter,
        type: typeFilter === "all" ? undefined : typeFilter,
        branchId: branchFilter === "all" ? undefined : branchFilter,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      setTransactions((res as any[]) || []);
    } catch (err: any) {
      console.error("Failed to load wallet approval transactions:", err);
      toast.error("Failed to load wallet approval transactions");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, typeFilter, branchFilter, startDate, endDate]);

  // Client-side Search Filter
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter((tx) => {
      const matchName = tx.customerName?.toLowerCase().includes(q);
      const matchId = tx.customerId?.toLowerCase().includes(q);
      const matchRef = tx.referenceId?.toLowerCase().includes(q);
      const matchReason = tx.reason?.toLowerCase().includes(q);
      const matchStaff = tx.createdByName?.toLowerCase().includes(q);
      return matchName || matchId || matchRef || matchReason || matchStaff;
    });
  }, [transactions, searchQuery]);

  // Summary Counts
  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let totalCredit = 0;
    let totalDebit = 0;

    filteredTransactions.forEach((tx) => {
      if (tx.approvalStatus === "PENDING") pending++;
      else if (tx.approvalStatus === "APPROVED") approved++;
      else if (tx.approvalStatus === "REJECTED") rejected++;

      if (tx.direction === "CREDIT") {
        totalCredit += tx.amount || 0;
      } else {
        totalDebit += tx.amount || 0;
      }
    });

    return {
      total: filteredTransactions.length,
      pending,
      approved,
      rejected,
      totalCredit,
      totalDebit,
    };
  }, [filteredTransactions]);

  // --- Pagination States ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, typeFilter, branchFilter, startDate, endDate, searchQuery]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1;
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  // --- Handlers ---
  const handleSingleApprove = async (tx: WalletTransactionItem) => {
    if (!canApproveWallet) {
      toast.error("You do not have permission to approve transactions.");
      return;
    }
    setIsProcessingAction(true);
    try {
      await walletApprovalStore.approve(
        tx.id,
        user?.id || "system",
        user?.name || user?.email || "Admin"
      );
      toast.success(`Approved ${tx.type} ฿${formatCurrency(tx.amount)} successfully`);
      await fetchTransactions();
    } catch (e: any) {
      toast.error("Failed to approve transaction: " + e.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!txToReject) return;
    if (!canApproveWallet) {
      toast.error("You do not have permission to reject transactions.");
      return;
    }
    if (!rejectReason.trim()) {
      toast.error("Please enter a reason for rejection.");
      return;
    }

    setIsProcessingAction(true);
    try {
      const res = await walletApprovalStore.reject(
        txToReject.id,
        user?.id || "system",
        user?.name || user?.email || "Admin",
        rejectReason.trim()
      );
      const createdTaskId = (res as any)?.taskId;
      toast.success(
        createdTaskId
          ? `Rejected #${txToReject.id.slice(0, 8)}. Created Task #${createdTaskId} for follow-up.`
          : `Rejected transaction #${txToReject.id.slice(0, 8)} successfully`,
        {
          action: createdTaskId
            ? {
                label: "Open Task",
                onClick: () => {
                  window.location.hash = "#tasks";
                  window.dispatchEvent(new CustomEvent("open-task-modal", { detail: { taskId: createdTaskId } }));
                },
              }
            : undefined,
          duration: 6000,
        }
      );
      setRejectModalOpen(false);
      setTxToReject(null);
      setRejectReason("");
      await fetchTransactions();
    } catch (e: any) {
      toast.error("Failed to reject transaction: " + e.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleBulkApprove = async () => {
    const pendingIds = filteredTransactions
      .filter((t) => t.approvalStatus === "PENDING")
      .map((t) => t.id);

    if (pendingIds.length === 0) return;
    setIsProcessingAction(true);
    try {
      await walletApprovalStore.bulkApprove(
        pendingIds,
        user?.id || "system",
        user?.name || user?.email || "Admin"
      );
      toast.success(`Bulk approved ${pendingIds.length} transactions successfully`);
      setBulkConfirmOpen(false);
      await fetchTransactions();
    } catch (e: any) {
      toast.error("Failed to bulk approve: " + e.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    let csv = "\uFEFF"; // UTF-8 BOM
    csv += "Date,Time,Customer,Type,Direction,Amount,Balance Before,Balance After,Reference,Reason,Branch,Created By,Status,Approved By,Approved At\n";

    filteredTransactions.forEach((tx) => {
      const d = new Date(tx.createdAt);
      const dateStr = format(d, "yyyy-MM-dd");
      const timeStr = format(d, "HH:mm:ss");
      const shopName = getCleanBranchName(shops.find((s) => s.id === tx.branchId)?.name || tx.branchId);
      const approvedAtStr = tx.approvedAt ? format(new Date(tx.approvedAt), "yyyy-MM-dd HH:mm") : "-";

      csv += `"${dateStr}","${timeStr}","${tx.customerName || "-"}","${tx.type}","${tx.direction}","${tx.amount}","${tx.balanceBefore}","${tx.balanceAfter}","${tx.referenceId || "-"}","${(tx.reason || "").replace(/"/g, '""')}","${shopName}","${tx.createdByName || "-"}","${tx.approvalStatus}","${tx.approvedByName || "-"}","${approvedAtStr}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallet-approvals-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRowClick = (tx: WalletTransactionItem) => {
    const isJob = tx.referenceType === "job" 
      || tx.type === "DEDUCT" 
      || tx.type === "REFUND"
      || (tx.referenceId && (tx.referenceId.startsWith("RF-") || tx.referenceId.startsWith("TLS-")));

    if (isJob && tx.referenceId && onViewJob) {
      const job = jobStore.getSnapshot().find(
        (j) => j.id === tx.referenceId || j.billNo === tx.referenceId
      );
      if (job) {
        onViewJob(job, tx);
        return;
      }
      toast.info("Job นี้ไม่อยู่ใน session ปัจจุบัน — กรุณาค้นหาจากหน้า Jobs");
      return;
    }

    // TOPUP or ADJUST or any other transaction -> Open Inspect Detail Dialog
    setInspectTx(tx);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        {/* Left: Filters & Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Tabs */}
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(
              [
                { key: "PENDING" as ApprovalStatusFilter, label: "Pending", badge: pendingWalletMap.total },
                { key: "APPROVED" as ApprovalStatusFilter, label: "Approved", badge: undefined },
                { key: "REJECTED" as ApprovalStatusFilter, label: "Rejected", badge: undefined },
                { key: "all" as ApprovalStatusFilter, label: "All", badge: undefined },
              ] as Array<{ key: ApprovalStatusFilter; label: string; badge?: number }>
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === tab.key
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-extrabold animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Filter size={13} className="text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent border-none outline-none font-bold cursor-pointer text-xs"
            >
              <option value="all">All Types</option>
              <option value="TOPUP">Top-Up</option>
              <option value="DEDUCT">POS Payment</option>
              <option value="ADJUST_ADD">Manual Adjust (+)</option>
              <option value="ADJUST_DEDUCT">Manual Adjust (-)</option>
              <option value="REFUND">Refund</option>
              <option value="REVERSAL">Reversal</option>
            </select>
          </div>

          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Store size={13} className="text-slate-400" />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-transparent border-none outline-none font-bold cursor-pointer text-xs"
            >
              <option value="all">All Branches</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {getCleanBranchName(s.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <CalendarIcon size={13} className="text-slate-400" />
              <span>
                {format(startDate, "dd MMM yyyy")} - {format(endDate, "dd MMM yyyy")}
              </span>
            </button>

            {isDatePickerOpen && (
              <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2.5 text-xs font-semibold">
                <div className="space-y-1">
                  {[
                    { key: "today", label: "Today" },
                    { key: "yesterday", label: "Yesterday" },
                    { key: "7days", label: "Last 7 Days" },
                    { key: "30days", label: "Last 30 Days" },
                    { key: "thisMonth", label: "This Month" },
                    { key: "lastMonth", label: "Last Month" },
                  ].map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyPreset(preset.key as DatePreset)}
                      className={`w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                        datePreset === preset.key
                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Custom Date Range</div>
                  <input
                    type="date"
                    value={customStartInput}
                    onChange={(e) => setCustomStartInput(e.target.value)}
                    className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />
                  <input
                    type="date"
                    value={customEndInput}
                    onChange={(e) => setCustomEndInput(e.target.value)}
                    className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={handleApplyCustomDate}
                    className="w-full h-7 text-xs font-bold bg-indigo-600 text-white rounded-lg cursor-pointer"
                  >
                    Apply Date
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Search, Bulk Actions & Export */}
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, receipt, ref..."
              className="pl-8 h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Bulk Approve Button */}
          {canApproveWallet && filteredTransactions.some((t) => t.approvalStatus === "PENDING") && (
            <Button
              type="button"
              size="sm"
              onClick={() => setBulkConfirmOpen(true)}
              disabled={isProcessingAction}
              className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 rounded-xl shadow-xs cursor-pointer"
            >
              <CheckCircle2 size={14} />
              <span>
                Approve All (
                {filteredTransactions.filter((t) => t.approvalStatus === "PENDING").length})
              </span>
            </Button>
          )}

          {/* Refresh Button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={fetchTransactions}
            disabled={isLoading}
            className="h-9 w-9 rounded-xl text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin text-indigo-600" : ""} />
          </Button>

          {/* Export CSV Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredTransactions.length === 0}
            className="h-9 px-3 gap-1 text-xs font-bold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Export to CSV"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pending Approvals</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{counts.pending}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Approved Transactions</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{counts.approved}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Credit (+In)</div>
            <div className="text-xl font-black text-emerald-700 mt-1">฿{formatCurrency(counts.totalCredit)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowDownLeft size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Debit (-Out)</div>
            <div className="text-xl font-black text-blue-700 mt-1">฿{formatCurrency(counts.totalDebit)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <ArrowUpRight size={20} />
          </div>
        </div>
      </div>

      {/* 3. Main Data Table */}
      <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-50/80 border-b-slate-200">
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 pl-6 py-3.5 text-xs uppercase tracking-wider">
                  Date & Time
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider">
                  Branch
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider">
                  Customer
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider">
                  Type / Reference
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider text-right">
                  Amount
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider text-center">
                  Balance: Before → After
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider">
                  Slip / Reason
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider">
                  Created By
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-3.5 text-xs uppercase tracking-wider text-center">
                  Status
                </TableHead>
                <TableHead className="font-bold text-slate-700 dark:text-slate-300 pr-6 py-3.5 text-xs uppercase tracking-wider text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-48 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Loader2 size={28} className="animate-spin text-indigo-600" />
                      <p className="text-xs font-semibold">Loading wallet approvals...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-48 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <ShieldCheck size={36} className="text-slate-300" />
                      <p className="font-semibold text-sm text-slate-700">No transactions found</p>
                      <p className="text-xs text-slate-400">
                        Transactions including Top-ups, POS payments, Adjustments, and Refunds will appear here.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedTransactions.map((tx) => {
                  const isPending = tx.approvalStatus === "PENDING";
                  const isApproved = tx.approvalStatus === "APPROVED";
                  const isRejected = tx.approvalStatus === "REJECTED";
                  const isCredit = tx.direction === "CREDIT";
                  const linkedJob = tx.referenceId ? jobs.find(j => j.id === tx.referenceId || j.billNo === tx.referenceId) : null;
                  const effectiveBranchId = tx.branchId || linkedJob?.branchId;
                  const branchObj = shops.find((s) => s.id === effectiveBranchId || s.name === tx.branchId);
                  const cleanBranch = getCleanBranchName(branchObj?.name || (tx.branchId && !shops.some(s => s.id === tx.branchId) ? tx.branchId : null));

                  const taskMatch = tx.rejectReason?.match(/\[Task:\s*([^\]]+)\]/i);
                  const linkedTaskId = taskMatch ? taskMatch[1].trim() : null;
                  const cleanRejectReason = tx.rejectReason?.replace(/\s*\[Task:\s*[^\]]+\]/i, "").trim() || "";

                  return (
                    <TableRow
                      key={tx.id}
                      onClick={() => handleRowClick(tx)}
                      className="border-b border-slate-100 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 cursor-pointer transition-colors"
                    >
                      {/* Date & Time */}
                      <TableCell className="pl-6 py-3.5 text-xs text-slate-600 font-medium">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {format(new Date(tx.createdAt), "dd MMM yyyy")}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {format(new Date(tx.createdAt), "HH:mm:ss")}
                        </div>
                      </TableCell>

                      {/* Branch */}
                      <TableCell className="py-3.5 text-xs text-slate-600">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {cleanBranch}
                        </span>
                      </TableCell>

                      {/* Customer */}
                      <TableCell className="py-3.5">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {tx.customerName || "Unnamed Customer"}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: {tx.customerId ? tx.customerId.slice(0, 8) : "-"}
                        </div>
                      </TableCell>

                      {/* Type & Ref */}
                      <TableCell className="py-3.5 min-w-[140px]">
                        <div className="flex flex-col items-start gap-1">
                          {/* Line 1: Type Badge with distinct color and clean English wording */}
                          {(() => {
                            const typeConfig = getWalletTypeConfig(tx.type);
                            return (
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border tracking-wide shadow-2xs ${typeConfig.cls}`}
                              >
                                {typeConfig.label}
                              </Badge>
                            );
                          })()}

                          {/* Line 2: Reference */}
                          {(() => {
                            const isJob = tx.referenceType === "job" || tx.type === "DEDUCT" || (tx.referenceId && tx.referenceId.startsWith("RF-"));
                            const isManual = tx.referenceType === "manual" || tx.type.startsWith("ADJUST");

                            if (isJob && tx.referenceId) {
                              return (
                                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400 font-sans text-[10px] font-medium">Ref:</span>
                                  <span
                                    className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 px-1.5 py-0.5 rounded text-[10px] max-w-[130px] truncate"
                                    title={`Job ID: ${tx.referenceId}`}
                                  >
                                    #{formatJobDisplayId(tx.referenceId)}
                                  </span>
                                </div>
                              );
                            }

                            if (isManual) {
                              return (
                                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                                  <span className="text-slate-400 text-[10px] font-medium">Ref:</span>
                                  <span className="font-semibold italic text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-1.5 py-0.5 rounded text-[10px]">
                                    Manual
                                  </span>
                                </div>
                              );
                            }

                            if (tx.referenceId) {
                              return (
                                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                                  <span className="text-slate-400 font-sans text-[10px] font-medium">Ref:</span>
                                  <span
                                    className="font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[10px] max-w-[130px] truncate"
                                    title={tx.referenceId}
                                  >
                                    {tx.referenceId}
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <span className="text-[10px] text-slate-400 italic">No ref</span>
                            );
                          })()}
                        </div>
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="py-3.5 text-right font-mono">
                        <span
                          className={`text-xs font-bold ${
                            isCredit ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {isCredit ? "+" : "-"}฿{formatCurrency(tx.amount)}
                        </span>
                      </TableCell>

                      {/* Balance Before -> After */}
                      <TableCell className="py-3.5 text-center text-xs font-mono text-slate-500">
                        <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-700 text-[11px]">
                          <span>฿{formatCurrency(tx.balanceBefore)}</span>
                          <span className="text-slate-300">→</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            ฿{formatCurrency(tx.balanceAfter)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Reason / Slip */}
                      <TableCell className="py-3.5 text-xs text-slate-600 max-w-[220px]">
                        <div className="flex items-start gap-2">
                          {tx.slipImageUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewSlipUrl(tx.slipImageUrl || null);
                              }}
                              className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-400 shrink-0 cursor-pointer mt-0.5"
                              title="Click to view transfer slip"
                            >
                              <img
                                src={tx.slipImageUrl}
                                alt="Slip"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
                          <div className="flex flex-col min-w-0">
                            <div className="truncate text-slate-700 dark:text-slate-300 text-[11px] font-medium" title={tx.reason || ""}>
                              {tx.reason || (tx.type === "TOPUP" ? `Top-up ${tx.packageName || ""}` : "-")}
                            </div>
                            {tx.type === "TOPUP" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenTopUpReceipt(tx);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 hover:text-indigo-900 border border-indigo-200/80 dark:border-indigo-800 px-1.5 py-0.5 rounded mt-1 cursor-pointer transition-colors shadow-2xs w-fit"
                                title="ดูใบเสร็จรับเงิน A5 (Click to view Receipt)"
                              >
                                <Receipt size={11} className="text-indigo-600 shrink-0" />
                                <span>Receipt: {tx.referenceId || "TU-Receipt"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Created By */}
                      <TableCell className="py-3.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <User size={12} className="text-slate-400" />
                          <span>{tx.createdByName || "System"}</span>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5 text-center">
                        {isPending && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">
                            Pending
                          </Badge>
                        )}
                        {isApproved && (
                          <div className="leading-tight">
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                              Approved
                            </Badge>
                            {tx.approvedByName && (
                              <div className="text-[9px] text-slate-400 mt-0.5" title={`By ${tx.approvedByName}`}>
                                {tx.approvedByName}
                              </div>
                            )}
                          </div>
                        )}
                        {isRejected && (
                          <div className="leading-tight flex flex-col items-center">
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] font-bold">
                              Rejected
                            </Badge>
                            {cleanRejectReason && (
                              <div className="text-[9px] text-rose-600 truncate max-w-[120px] mt-0.5" title={cleanRejectReason}>
                                {cleanRejectReason}
                              </div>
                            )}
                            {linkedTaskId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.location.hash = "#tasks";
                                  window.dispatchEvent(new CustomEvent("open-task-modal", { detail: { taskId: linkedTaskId } }));
                                }}
                                className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded mt-1 cursor-pointer transition-colors shadow-2xs"
                                title="Open discussion Task"
                              >
                                <MessageSquare size={10} />
                                <span>Task #{linkedTaskId}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="pr-6 py-3.5 text-right">
                        {isPending && canApproveWallet ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSingleApprove(tx);
                              }}
                              disabled={isProcessingAction}
                              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs rounded-lg cursor-pointer"
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTxToReject(tx);
                                setRejectReason("");
                                setRejectModalOpen(true);
                              }}
                              disabled={isProcessingAction}
                              className="h-7 px-2 text-rose-600 border-rose-200 hover:bg-rose-50 text-xs font-bold rounded-lg cursor-pointer"
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {filteredTransactions.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>
                Showing {Math.min(filteredTransactions.length, (currentPage - 1) * pageSize + 1)}-{Math.min(filteredTransactions.length, currentPage * pageSize)} of {filteredTransactions.length} transactions
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs focus:outline-none cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <span className="sr-only">Previous Page</span>
                  <ChevronLeft size={14} />
                </Button>

                {getPageNumbers().map((p, idx) => {
                  if (p === "...") {
                    return (
                      <span key={`ell-${idx}`} className="px-2 text-xs font-semibold text-slate-400">
                        ...
                      </span>
                    );
                  }
                  const isSelected = p === currentPage;
                  return (
                    <Button
                      key={`page-${p}`}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className={`h-8 min-w-[32px] px-2.5 text-xs font-bold rounded-lg transition-all ${
                        isSelected
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-xs"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                      onClick={() => setCurrentPage(Number(p))}
                    >
                      {p}
                    </Button>
                  );
                })}

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <span className="sr-only">Next Page</span>
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Slip Image Preview Modal */}
      <Dialog open={!!previewSlipUrl} onOpenChange={(open) => !open && setPreviewSlipUrl(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-4 border-b border-slate-100">
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Receipt size={16} className="text-indigo-600" />
              <span>Transfer Slip Preview</span>
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 flex justify-center bg-slate-900/5 max-h-[70vh] overflow-auto">
            {previewSlipUrl && (
              <img
                src={previewSlipUrl}
                alt="Transfer Slip"
                className="max-h-[60vh] object-contain rounded-lg shadow-sm"
              />
            )}
          </div>
          <DialogFooter className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between">
            {previewSlipUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(previewSlipUrl, "_blank")}
                className="text-xs font-bold gap-1"
              >
                <ExternalLink size={12} /> Open in new tab
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setPreviewSlipUrl(null)}
              className="text-xs font-bold px-4"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Reject Confirmation Dialog */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 text-base font-bold">
              <ShieldAlert size={18} />
              <span>Reject Transaction</span>
            </DialogTitle>
          </DialogHeader>

          {txToReject && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                <div className="font-bold text-rose-900">
                  {txToReject.type} ฿{formatCurrency(txToReject.amount)} - {txToReject.customerName}
                </div>
                <div className="text-[11px] text-slate-500">
                  Transaction will be marked as <strong>Rejected</strong> without altering customer's current balance.
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reject Reason (Required) *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Invalid slip, duplicate payment, incorrect amount..."
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejectModalOpen(false)}
              disabled={isProcessingAction}
              className="font-bold text-xs rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmReject}
              disabled={isProcessingAction || !rejectReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
            >
              {isProcessingAction ? <Loader2 size={14} className="animate-spin mr-1" /> : <Ban size={14} className="mr-1" />}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Bulk Approve Confirmation Dialog */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 text-base font-bold">
              <CheckCircle2 size={18} />
              <span>Confirm Bulk Approve</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 text-xs text-slate-600 leading-relaxed">
            Are you sure you want to approve all{" "}
            <span className="font-bold text-emerald-600">
              {filteredTransactions.filter((t) => t.approvalStatus === "PENDING").length}
            </span>{" "}
            pending transaction(s)?
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBulkConfirmOpen(false)}
              disabled={isProcessingAction}
              className="font-bold text-xs rounded-xl cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleBulkApprove}
              disabled={isProcessingAction}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
            >
              {isProcessingAction ? <Loader2 size={14} className="animate-spin mr-1" /> : <CheckCircle2 size={14} className="mr-1" />}
              Confirm Approve All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. Inspect Detail Dialog (Row-Click on TOPUP / ADJUST) */}
      <Dialog open={!!inspectTx} onOpenChange={(open) => { if (!open) setInspectTx(null); }}>
        <DialogContent className="sm:max-w-lg w-[95vw] rounded-2xl p-0 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900">
          {inspectTx && (() => {
            const isTopUp = inspectTx.type === "TOPUP";
            const isPending = inspectTx.approvalStatus === "PENDING";
            const isApproved = inspectTx.approvalStatus === "APPROVED";
            const isRejected = inspectTx.approvalStatus === "REJECTED";
            const linkedJob = inspectTx.referenceId ? jobs.find(j => j.id === inspectTx.referenceId || j.billNo === inspectTx.referenceId) : null;
            const effectiveBranchId = inspectTx.branchId || linkedJob?.branchId;
            const branchObj = shops.find((s) => s.id === effectiveBranchId || s.name === inspectTx.branchId);
            const cleanBranch = getCleanBranchName(branchObj?.name || (inspectTx.branchId && !shops.some(s => s.id === inspectTx.branchId) ? inspectTx.branchId : null));
            const cleanReject = inspectTx.rejectReason?.replace(/\s*\[Task:\s*[^\]]+\]/i, "").trim() || "";

            return (
              <div className="flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl ${isTopUp ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {isTopUp ? <Receipt size={18} /> : <ShieldCheck size={18} />}
                    </div>
                    <div>
                      <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {isTopUp ? "รายละเอียดการเติมเงิน (Top-Up Details)" : "รายละเอียดการปรับยอด (Adjustment Details)"}
                      </DialogTitle>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Ref ID: #{inspectTx.id.slice(0, 8)} • {format(new Date(inspectTx.createdAt), "dd MMM yyyy HH:mm")}
                      </div>
                    </div>
                  </div>
                  <Badge className={`text-xs font-bold ${
                    isPending ? "bg-amber-100 text-amber-800 border-amber-200" :
                    isApproved ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                    "bg-rose-100 text-rose-800 border-rose-200"
                  }`}>
                    {inspectTx.approvalStatus}
                  </Badge>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-4 text-sm">
                  {/* Customer & Branch info card */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[11px] font-medium text-slate-400">ลูกค้า (Customer)</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{inspectTx.customerName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">ID: {inspectTx.customerId ? inspectTx.customerId.slice(0, 8) : "-"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-400">สาขา (Branch)</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{cleanBranch}</div>
                      <div className="text-[11px] text-slate-400">โดย: {inspectTx.createdByName || "System"}</div>
                    </div>
                  </div>

                  {/* Financial Details */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-xs">ประเภทรายการ:</span>
                      <Badge variant="outline" className={`text-xs font-bold ${getWalletTypeConfig(inspectTx.type).cls}`}>
                        {getWalletTypeConfig(inspectTx.type).label}
                      </Badge>
                    </div>

                    {isTopUp && inspectTx.packageName && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">แพ็กเกจ (Package):</span>
                        <span className="font-bold text-indigo-600">{inspectTx.packageName}</span>
                      </div>
                    )}

                    {isTopUp && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">ช่องทางชำระเงิน:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{inspectTx.paymentChannel || "Transfer"}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-600 text-xs font-semibold">ยอดเงินทำรายการ:</span>
                      <span className={`text-base font-black ${inspectTx.direction === "CREDIT" ? "text-emerald-600" : "text-rose-600"}`}>
                        {inspectTx.direction === "CREDIT" ? "+" : "-"}฿{formatCurrency(inspectTx.amount)}
                      </span>
                    </div>

                    {isTopUp && inspectTx.bonusAmount ? (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">โบนัสแถม (Bonus):</span>
                        <span className="font-bold text-emerald-600">+฿{formatCurrency(inspectTx.bonusAmount)}</span>
                      </div>
                    ) : null}

                    {/* Balance Before -> After */}
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-500">ยอดคงเหลือ Wallet:</span>
                      <div className="inline-flex items-center gap-1 font-mono font-semibold">
                        <span>฿{formatCurrency(inspectTx.balanceBefore)}</span>
                        <span className="text-slate-300">→</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">฿{formatCurrency(inspectTx.balanceAfter)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Reason / Adjustment notes */}
                  {inspectTx.reason && (
                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-xl">
                      <div className="text-[11px] font-bold text-amber-800 dark:text-amber-400 mb-1">
                        เหตุผลในการทำรายการ (Reason):
                      </div>
                      <div className="text-xs text-amber-950 dark:text-amber-200 font-medium">
                        {inspectTx.reason}
                      </div>
                    </div>
                  )}

                  {/* Slip Image if present */}
                  {inspectTx.slipImageUrl && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        หลักฐานสลิปโอนเงิน (Transfer Slip):
                      </div>
                      <div 
                        className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-64 flex items-center justify-center bg-slate-900/5 cursor-pointer group relative"
                        onClick={() => setPreviewSlipUrl(inspectTx.slipImageUrl || null)}
                      >
                        <img
                          src={inspectTx.slipImageUrl}
                          alt="Slip Preview"
                          className="max-h-64 w-auto object-contain rounded-lg transition-transform group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                          <Eye size={16} /> คลิกเพื่อดูภาพเต็ม
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top-Up Receipt section */}
                  {isTopUp && (
                    <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg">
                          <Receipt size={18} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                            ใบเสร็จรับเงิน (Top-Up Receipt)
                          </div>
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono">
                            {inspectTx.referenceId ? `Receipt No: ${inspectTx.referenceId}` : "Receipt generated"}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenTopUpReceipt(inspectTx)}
                        className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold gap-1.5 shadow-2xs rounded-xl cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>ดูใบเสร็จ (View Receipt)</span>
                      </Button>
                    </div>
                  )}

                  {/* Status Details if already Approved or Rejected */}
                  {isApproved && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                      <div className="font-bold">อนุมัติแล้ว (Approved)</div>
                      <div>โดย: {inspectTx.approvedByName || "Admin"} • {inspectTx.approvedAt ? format(new Date(inspectTx.approvedAt), "dd MMM yyyy HH:mm") : "-"}</div>
                    </div>
                  )}

                  {isRejected && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 rounded-xl text-xs text-rose-800 dark:text-rose-300">
                      <div className="font-bold">ปฏิเสธแล้ว (Rejected)</div>
                      <div>เหตุผล: {cleanReject || inspectTx.rejectReason || "-"}</div>
                    </div>
                  )}
                </div>

                {/* Footer with Approve / Reject buttons */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setInspectTx(null)}
                    className="text-xs font-bold rounded-xl"
                  >
                    ปิด (Close)
                  </Button>

                  {isPending && canApproveWallet && (
                    <>
                      <Button
                        type="button"
                        disabled={isProcessingAction}
                        onClick={async () => {
                          const target = inspectTx;
                          setInspectTx(null);
                          await handleSingleApprove(target);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer shadow-xs rounded-xl"
                      >
                        <CheckCircle2 size={14} />
                        <span>Approve (อนุมัติ)</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled={isProcessingAction}
                        onClick={() => {
                          const target = inspectTx;
                          setInspectTx(null);
                          setTxToReject(target);
                          setRejectReason("");
                          setRejectModalOpen(true);
                        }}
                        className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs font-bold gap-1.5 cursor-pointer rounded-xl"
                      >
                        <XCircle size={14} />
                        <span>Reject (ปฏิเสธ)</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 8. Top-Up A5 Receipt Preview Modal */}
      {isReceiptOpen && previewReceiptData && (
        <A5ReceiptDialog
          open={isReceiptOpen}
          onOpenChange={setIsReceiptOpen}
          receiptData={previewReceiptData}
          activeShop={receiptActiveShop}
          currentLanguage="en"
        />
      )}
    </div>
  );
}
