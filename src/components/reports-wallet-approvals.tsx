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

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";
type ApprovalStatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

interface ReportsWalletApprovalsProps {
  selectedBranch?: string;
}

export function ReportsWalletApprovals({ selectedBranch = "all" }: ReportsWalletApprovalsProps) {
  const { user } = useAuth();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const pendingWalletMap = useSyncExternalStore(walletApprovalStore.subscribe, walletApprovalStore.getSnapshot, walletApprovalStore.getSnapshot);

  // Permission check
  const canApproveWallet = Boolean(
    user?.role === "admin" ||
    user?.role === "manager" ||
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
      const shopName = shops.find((s) => s.id === tx.branchId)?.name || tx.branchId || "-";
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
              <option value="TOPUP">Top-up (TOPUP)</option>
              <option value="DEDUCT">POS Payment (DEDUCT)</option>
              <option value="ADJUST_ADD">Adjust Add (+)</option>
              <option value="ADJUST_DEDUCT">Adjust Deduct (-)</option>
              <option value="REFUND">Refund (REFUND)</option>
              <option value="REVERSAL">Reversal (REVERSAL)</option>
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
                  {s.name}
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
                filteredTransactions.map((tx) => {
                  const isPending = tx.approvalStatus === "PENDING";
                  const isApproved = tx.approvalStatus === "APPROVED";
                  const isRejected = tx.approvalStatus === "REJECTED";
                  const isCredit = tx.direction === "CREDIT";
                  const branchObj = shops.find((s) => s.id === tx.branchId);

                  const taskMatch = tx.rejectReason?.match(/\[Task:\s*([^\]]+)\]/i);
                  const linkedTaskId = taskMatch ? taskMatch[1].trim() : null;
                  const cleanRejectReason = tx.rejectReason?.replace(/\s*\[Task:\s*[^\]]+\]/i, "").trim() || "";

                  return (
                    <TableRow
                      key={tx.id}
                      className="border-b border-slate-100 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
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
                          {branchObj?.name || "-"}
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
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md border ${
                              tx.type === "TOPUP"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : tx.type === "DEDUCT"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : tx.type === "REFUND"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : tx.type === "REVERSAL"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            }`}
                          >
                            {tx.type}
                          </Badge>
                          {tx.referenceId && (
                            <span
                              className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 max-w-[130px] truncate"
                              title={tx.referenceId}
                            >
                              {tx.referenceId.startsWith("RF-") || tx.referenceType === "job"
                                ? `#${formatJobDisplayId(tx.referenceId)}`
                                : tx.referenceId}
                            </span>
                          )}
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
                      <TableCell className="py-3.5 text-xs text-slate-600 max-w-[200px]">
                        <div className="flex items-center gap-2">
                          {tx.slipImageUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewSlipUrl(tx.slipImageUrl || null)}
                              className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-indigo-400 shrink-0 cursor-pointer"
                              title="Click to view transfer slip"
                            >
                              <img
                                src={tx.slipImageUrl}
                                alt="Slip"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
                          <div className="truncate text-slate-700 dark:text-slate-300 text-[11px]" title={tx.reason || ""}>
                            {tx.reason || (tx.type === "TOPUP" ? `Top-up ${tx.packageName || ""}` : "-")}
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
                                onClick={() => {
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
                              onClick={() => handleSingleApprove(tx)}
                              disabled={isProcessingAction}
                              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs rounded-lg cursor-pointer"
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
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
    </div>
  );
}
