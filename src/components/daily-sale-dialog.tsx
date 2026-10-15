"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  CalendarDays, 
  Banknote, 
  CreditCard, 
  Wallet, 
  ArrowUpRight, 
  Search, 
  Download, 
  Printer, 
  RefreshCw, 
  Store, 
  CheckCircle2, 
  ShoppingBag, 
  Layers, 
  UserCheck, 
  X,
  ExternalLink
} from "lucide-react";
import { format, isSameDay, startOfDay, endOfDay, subDays } from "date-fns";
import Papa from "papaparse";
import { toast } from "sonner";
import { getTopUpTransactionsAction } from "@/actions/db";
import { 
  findMatchingCustomer, 
  formatJobDisplayId, 
  getJobPaymentBreakdown, 
  formatLocationWithRoom 
} from "@/lib/utils";
import { getUserAssignedBranchIds, getCleanBranchName } from "@/components/branch-filter-dropdown";
import type { Job, Customer } from "@/lib/store";

export interface DailySaleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: Job[];
  user: any;
  shopLocations: any[];
  selectedBranchIds?: string[];
  customers: Customer[];
  onViewJob?: (job: Job) => void;
}

export interface UnifiedDailySaleItem {
  id: string;
  type: "job" | "topup";
  timestamp: Date;
  referenceNo: string;
  customerName: string;
  customerPhone: string;
  isMember: boolean;
  isVIP: boolean;
  paymentChannel: string;
  paymentMethod: string;
  amount: number;
  branchId: string | null;
  branchName: string;
  staffName: string;
  rawJob?: Job;
  rawTopup?: any;
}

function normalizeChannelName(name?: string | null): string {
  if (!name || !name.trim()) return "Unspecified";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "cash" || lower === "cash / cod" || lower === "cash/cod" || lower.includes("เงินสด")) return "Cash / COD";
  if (lower === "transfer" || lower === "promptpay" || lower === "โอน" || lower === "โอนเงิน") return "Transfer";
  if (lower === "credit card" || lower === "card" || lower === "บัตรเครดิต") return "Credit Card";
  if (lower === "deduct member" || lower === "wallet" || lower === "credit" || lower.includes("กระเป๋า")) return "Deduct Member";
  if (lower === "hq/credit" || lower === "hq credit") return "HQ/Credit";
  if (lower.includes("beam") || lower.includes("gateway")) return "Beam Gateway";
  return trimmed;
}

export function DailySaleDialog({
  isOpen,
  onClose,
  jobs,
  user,
  shopLocations,
  selectedBranchIds = [],
  customers,
  onViewJob,
}: DailySaleDialogProps) {
  const [targetDate, setTargetDate] = useState<Date>(new Date());
  const [activeDateTab, setActiveDateTab] = useState<"today" | "yesterday">("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "job" | "topup">("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [topups, setTopups] = useState<any[]>([]);
  const [isLoadingTopups, setIsLoadingTopups] = useState(false);

  // Compute allowed branches strictly for current user
  const isAreaRestricted = useMemo(() => {
    if (!user || user.role === "admin") return false;
    return Boolean((user.area && user.area !== "ALL") || user.branchId);
  }, [user]);

  const userAssignedBranchIds = useMemo(() => {
    if (!isAreaRestricted) return [];
    return getUserAssignedBranchIds(user, shopLocations);
  }, [isAreaRestricted, user, shopLocations]);

  // Determine effective branches to consider
  const targetBranchIds = useMemo(() => {
    if (isAreaRestricted) {
      if (selectedBranchIds.length > 0) {
        return selectedBranchIds.filter(id => userAssignedBranchIds.includes(id));
      }
      return userAssignedBranchIds;
    }
    if (selectedBranchIds.length > 0 && selectedBranchIds.length < shopLocations.length) {
      return selectedBranchIds;
    }
    return shopLocations.map(s => s.id);
  }, [isAreaRestricted, userAssignedBranchIds, selectedBranchIds, shopLocations]);

  const targetBranchIdSet = useMemo(() => new Set(targetBranchIds), [targetBranchIds]);

  // Load Top-up transactions when target date changes or dialog opens
  const fetchTopups = useCallback(async (date: Date) => {
    try {
      setIsLoadingTopups(true);
      const start = startOfDay(date).toISOString();
      const end = endOfDay(date).toISOString();
      const res = await getTopUpTransactionsAction({
        startDate: start,
        endDate: end,
      });
      setTopups(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error("[DailySaleDialog] Failed to fetch topups:", err);
      toast.error("ไม่สามารถโหลดรายการเติมเงินได้");
    } finally {
      setIsLoadingTopups(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTopups(targetDate);
    }
  }, [isOpen, targetDate, fetchTopups]);

  const handleSelectDateTab = (tab: "today" | "yesterday") => {
    setActiveDateTab(tab);
    if (tab === "today") {
      setTargetDate(new Date());
    } else {
      setTargetDate(subDays(new Date(), 1));
    }
  };

  // Helper to check if a customer or job is Corporate
  const isCorporateCustomer = useCallback((customerId?: string | null, name?: string | null, phone?: string | null): boolean => {
    const matched = findMatchingCustomer(customers, { customerId, customerName: name, customerPhone: phone });
    if (matched) {
      if (matched.isCorporate || matched.tier === "corporate") return true;
      if (matched.companyName && matched.companyName.trim()) return true;
    }
    const lowerName = (name || "").toLowerCase();
    if (lowerName.includes("legacy") || lowerName.includes("evolve") || lowerName.includes("hotel") || lowerName.includes("condo")) {
      // Check if actually tagged as corporate in customer record
      if (matched && (matched.isCorporate || matched.tier === "corporate")) return true;
    }
    return false;
  }, [customers]);

  // Map of shopId -> shopName
  const branchMap = useMemo(() => {
    const map = new Map<string, string>();
    shopLocations.forEach(s => {
      map.set(s.id, getCleanBranchName(s.name) || s.name);
    });
    return map;
  }, [shopLocations]);

  // Process & Filter Jobs
  const jobItems = useMemo<UnifiedDailySaleItem[]>(() => {
    const list: UnifiedDailySaleItem[] = [];

    jobs.forEach(job => {
      // 1. Must be Shop Paid
      if (!job.isShopPaid) return;

      // 2. Check Date: shopPaidAt must be on target date
      const rawPaidDate = (job as any).shopPaidAt || (job as any).csoPaidAt;
      if (!rawPaidDate) return;
      const paidDate = new Date(rawPaidDate);
      if (isNaN(paidDate.getTime()) || !isSameDay(paidDate, targetDate)) return;

      // 3. Branch filter
      if (targetBranchIdSet.size > 0 && job.branchId && !targetBranchIdSet.has(job.branchId)) {
        return;
      }

      // 4. Exclude Corporate Customers
      if (isCorporateCustomer(job.customerId, job.customerName, job.customerPhone)) {
        return;
      }
      if ((job as any).isCorporate || (job as any).corporatePricing) {
        return;
      }

      // 5. Exclude pure Top-up jobs (to avoid double-counting with Top-up table)
      if (job.status === "topup" || String(job.id).toUpperCase().startsWith("TU-")) return;

      const customer = findMatchingCustomer(customers, {
        customerId: job.customerId,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
      });

      const breakdown = getJobPaymentBreakdown(job);
      const branchName = job.branchId ? (branchMap.get(job.branchId) || "หน้าร้าน") : "หน้าร้าน";

      // If split payments exist, explode or list the primary breakdown
      if (breakdown.isSplit && breakdown.payments.length > 0) {
        breakdown.payments.forEach((p, idx) => {
          list.push({
            id: `${job.id}-p${idx}`,
            type: "job",
            timestamp: p.timestamp ? new Date(p.timestamp) : paidDate,
            referenceNo: job.billNo || formatJobDisplayId(job.id),
            customerName: job.customerName || "ลูกค้าทั่วไป",
            customerPhone: job.customerPhone || "-",
            isMember: Boolean(customer?.isMember),
            isVIP: Boolean(customer?.isVIP),
            paymentChannel: normalizeChannelName(p.channel || p.method),
            paymentMethod: p.method || "cash",
            amount: Number(p.amount) || 0,
            branchId: job.branchId || null,
            branchName,
            staffName: p.paidBy || (job as any).shopPaidByName || "Staff",
            rawJob: job,
          });
        });
      } else {
        const primaryChannel = normalizeChannelName(job.paymentChannel || job.paymentMethod);
        list.push({
          id: job.id,
          type: "job",
          timestamp: paidDate,
          referenceNo: job.billNo || formatJobDisplayId(job.id),
          customerName: job.customerName || "ลูกค้าทั่วไป",
          customerPhone: job.customerPhone || "-",
          isMember: Boolean(customer?.isMember),
          isVIP: Boolean(customer?.isVIP),
          paymentChannel: primaryChannel,
          paymentMethod: job.paymentMethod || "cash",
          amount: Number(job.totalAmount) || 0,
          branchId: job.branchId || null,
          branchName,
          staffName: (job as any).shopPaidByName || "Staff",
          rawJob: job,
        });
      }
    });

    return list;
  }, [jobs, targetDate, targetBranchIdSet, isCorporateCustomer, customers, branchMap]);

  // Process & Filter Top-Up transactions
  const topupItems = useMemo<UnifiedDailySaleItem[]>(() => {
    const list: UnifiedDailySaleItem[] = [];

    topups.forEach(t => {
      // 1. Check Date
      if (!t.createdAt) return;
      const tDate = new Date(t.createdAt);
      if (isNaN(tDate.getTime()) || !isSameDay(tDate, targetDate)) return;

      // 2. Branch filter
      if (targetBranchIdSet.size > 0 && t.branchId && !targetBranchIdSet.has(t.branchId)) {
        return;
      }

      // 3. Exclude Corporate Customers
      if (t.Customer?.isCorporate || t.Customer?.tier === "corporate") {
        return;
      }

      const branchName = t.branchId ? (branchMap.get(t.branchId) || "หน้าร้าน") : "หน้าร้าน";

      list.push({
        id: t.id,
        type: "topup",
        timestamp: tDate,
        referenceNo: t.id || `TU-${t.memberId || ""}`,
        customerName: t.customerName || t.Customer?.name || "ลูกค้าสมาชิก",
        customerPhone: t.customerPhone || t.Customer?.phone || "-",
        isMember: true,
        isVIP: Boolean(t.Customer?.isVIP),
        paymentChannel: normalizeChannelName(t.paymentChannel),
        paymentMethod: t.paymentChannel || "transfer",
        amount: Number(t.amount) || 0,
        branchId: t.branchId || null,
        branchName,
        staffName: t.createdBy || "Staff",
        rawTopup: t,
      });
    });

    return list;
  }, [topups, targetDate, targetBranchIdSet, branchMap]);

  // Combined and sorted items
  const allItems = useMemo(() => {
    const combined = [...jobItems, ...topupItems];
    return combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [jobItems, topupItems]);

  // Financial Summaries
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let jobRevenue = 0;
    let topupRevenue = 0;

    let cashTotal = 0;
    let transferTotal = 0;
    let cardTotal = 0;
    let memberDeductTotal = 0;
    let otherTotal = 0;

    allItems.forEach(item => {
      const amt = item.amount || 0;
      totalRevenue += amt;

      if (item.type === "job") {
        jobRevenue += amt;
      } else {
        topupRevenue += amt;
      }

      const ch = item.paymentChannel;
      if (ch === "Cash / COD") {
        cashTotal += amt;
      } else if (ch === "Transfer") {
        transferTotal += amt;
      } else if (ch === "Credit Card") {
        cardTotal += amt;
      } else if (ch === "Deduct Member") {
        memberDeductTotal += amt;
      } else {
        otherTotal += amt;
      }
    });

    // Actual Cash & Direct Inflow (excluding Deduct Member, since Member wallet is paid in advance during Top-up)
    const netReceivedInflow = cashTotal + transferTotal + cardTotal + otherTotal;

    return {
      totalRevenue,
      netReceivedInflow,
      jobRevenue,
      topupRevenue,
      jobCount: jobItems.length,
      topupCount: topupItems.length,
      cashTotal,
      transferTotal,
      cardTotal,
      memberDeductTotal,
      otherTotal,
    };
  }, [allItems, jobItems.length, topupItems.length]);

  // Filtered Items for Display Table
  const filteredDisplayItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return allItems.filter(item => {
      // Filter Type: all | job | topup
      if (filterType !== "all" && item.type !== filterType) return false;

      // Filter Channel
      if (filterChannel !== "all" && item.paymentChannel !== filterChannel) return false;

      // Search Query
      if (query) {
        const matchesRef = item.referenceNo.toLowerCase().includes(query);
        const matchesName = item.customerName.toLowerCase().includes(query);
        const matchesPhone = item.customerPhone.includes(query);
        const matchesBranch = item.branchName.toLowerCase().includes(query);
        if (!matchesRef && !matchesName && !matchesPhone && !matchesBranch) return false;
      }

      return true;
    });
  }, [allItems, filterType, filterChannel, searchQuery]);

  // Export CSV
  const handleExportCSV = () => {
    if (allItems.length === 0) {
      toast.info("ไม่พบรายการสำหรับดาวน์โหลด");
      return;
    }

    const csvData = allItems.map(item => ({
      "เวลา (Time)": format(item.timestamp, "dd/MM/yyyy HH:mm:ss"),
      "ประเภท (Type)": item.type === "job" ? "งานซัก (Job)" : "เติมเงิน (Top-Up)",
      "เลขที่บิล / Ref": item.referenceNo,
      "ชื่อลูกค้า (Customer)": item.customerName,
      "เบอร์โทร (Phone)": item.customerPhone,
      "ช่องทางชำระ (Payment)": item.paymentChannel,
      "ยอดเงิน (Amount)": item.amount,
      "สาขา (Branch)": item.branchName,
      "ผู้บันทึก (Staff)": item.staffName,
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `daily_sales_${format(targetDate, "yyyyMMdd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("ส่งออกไฟล์ CSV สำเร็จ");
  };

  const handlePrint = () => {
    window.print();
  };

  const branchDisplayLabel = useMemo(() => {
    if (isAreaRestricted) {
      if (userAssignedBranchIds.length === 1) {
        return branchMap.get(userAssignedBranchIds[0]) || "สาขาที่รับผิดชอบ";
      }
      return `สาขาที่รับผิดชอบ (${userAssignedBranchIds.length} สาขา)`;
    }
    if (selectedBranchIds.length > 0 && selectedBranchIds.length < shopLocations.length) {
      return selectedBranchIds.map(id => branchMap.get(id) || id).join(", ");
    }
    return "ทุกสาขา (All Branches)";
  }, [isAreaRestricted, userAssignedBranchIds, selectedBranchIds, shopLocations.length, branchMap]);

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-5xl w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-slate-200 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 bg-white border-b border-slate-200 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Banknote size={18} />
                </div>
                <div>
                  <DialogTitle className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                    Daily Sales Summary
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                      {format(targetDate, "dd MMMM yyyy")}
                    </span>
                  </DialogTitle>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <Store size={12} className="text-indigo-500" />
                      {branchDisplayLabel}
                    </span>
                    <span>•</span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      Shop Paid
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 font-medium">
                      ไม่รวมลูกค้า Corporate
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions & Date Switcher */}
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleSelectDateTab("today")}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer font-bold ${
                    activeDateTab === "today"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  วันนี้ (Today)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectDateTab("yesterday")}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer font-bold ${
                    activeDateTab === "yesterday"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  เมื่อวาน (Yesterday)
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTopups(targetDate)}
                disabled={isLoadingTopups}
                className="h-8 px-2.5 text-xs border-slate-200 hover:bg-slate-50 text-slate-700"
                title="Refresh data"
              >
                <RefreshCw size={13} className={isLoadingTopups ? "animate-spin text-indigo-600" : ""} />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="h-8 px-2.5 text-xs border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100"
                title="Export as CSV"
              >
                <Download size={13} className="mr-1" />
                Excel
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 px-2.5 text-xs border-slate-200 text-slate-700 hover:bg-slate-100"
                title="Print"
              >
                <Printer size={13} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Grand Total */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={13} className="text-slate-400" />
                ยอดขายรวม (Total)
              </span>
              <div className="mt-2">
                <div className="text-2xl font-black text-slate-900 tracking-tight">
                  ฿{Math.round(stats.totalRevenue).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">{stats.jobCount} งานซัก</span>
                  <span>•</span>
                  <span className="font-semibold text-purple-700">{stats.topupCount} เติมเงิน</span>
                </div>
              </div>
            </div>

            {/* Cash in Drawer */}
            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <Banknote size={13} className="text-emerald-600" />
                เงินสด (Cash)
              </span>
              <div className="mt-2">
                <div className="text-xl font-black text-emerald-800">
                  ฿{Math.round(stats.cashTotal).toLocaleString()}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                  ยอดสดในลิ้นชักหน้าร้าน
                </div>
              </div>
            </div>

            {/* Transfer / PromptPay */}
            <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpRight size={13} className="text-indigo-600" />
                เงินโอน (Transfer)
              </span>
              <div className="mt-2">
                <div className="text-xl font-black text-indigo-900">
                  ฿{Math.round(stats.transferTotal).toLocaleString()}
                </div>
                <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                  PromptPay / QR / Beam
                </div>
              </div>
            </div>

            {/* Credit Card */}
            <div className="bg-sky-50/70 p-3.5 rounded-xl border border-sky-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard size={13} className="text-sky-600" />
                บัตรเครดิต (Card)
              </span>
              <div className="mt-2">
                <div className="text-xl font-black text-sky-900">
                  ฿{Math.round(stats.cardTotal).toLocaleString()}
                </div>
                <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
                  รูดบัตร EDC / ออนไลน์
                </div>
              </div>
            </div>

            {/* Deduct Member */}
            <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200/80 shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
                <Wallet size={13} className="text-purple-600" />
                หักสมาชิก (Deduct)
              </span>
              <div className="mt-2">
                <div className="text-xl font-black text-purple-900">
                  ฿{Math.round(stats.memberDeductTotal).toLocaleString()}
                </div>
                <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                  หักจากแพ็กเกจล่วงหน้า
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            {/* Type Filter Buttons */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer font-bold ${
                  filterType === "all"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                ทั้งหมด ({allItems.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("job")}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer font-bold ${
                  filterType === "job"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                งานซัก ({stats.jobCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("topup")}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer font-bold ${
                  filterType === "topup"
                    ? "bg-white text-purple-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                เติมเงิน ({stats.topupCount})
              </button>
            </div>

            {/* Payment Channel Filter & Search */}
            <div className="flex items-center gap-2">
              <select
                value={filterChannel}
                onChange={e => setFilterChannel(e.target.value)}
                className="h-8 text-xs border border-slate-200 rounded-lg px-2.5 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">ทุกช่องทางชำระ</option>
                <option value="Cash / COD">เงินสด (Cash)</option>
                <option value="Transfer">เงินโอน (Transfer)</option>
                <option value="Credit Card">บัตรเครดิต (Card)</option>
                <option value="Deduct Member">หักสมาชิก (Deduct)</option>
              </select>

              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <Input
                  placeholder="ค้นหาบิล, ลูกค้า, เบอร์..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-50 border-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">เวลา</th>
                    <th className="py-2.5 px-3">ประเภท</th>
                    <th className="py-2.5 px-3">เลขที่บิล / Ref</th>
                    <th className="py-2.5 px-3">ลูกค้า</th>
                    <th className="py-2.5 px-3">ช่องทางชำระ</th>
                    <th className="py-2.5 px-3 text-right">ยอดเงิน</th>
                    <th className="py-2.5 px-3">สาขา</th>
                    {onViewJob && <th className="py-2.5 px-3 text-center">ดูงาน</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredDisplayItems.length === 0 ? (
                    <tr>
                      <td colSpan={onViewJob ? 8 : 7} className="py-12 text-center text-slate-400">
                        <ShoppingBag size={28} className="mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">ไม่พบรายการชำระเงินหน้าร้านตามเงื่อนไขที่เลือก</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">ระบบจะแสดงเฉพาะงานที่เป็น Shop Paid และเติมเงินของสาขาที่รับผิดชอบ</p>
                      </td>
                    </tr>
                  ) : (
                    filteredDisplayItems.map(item => {
                      const isTopup = item.type === "topup";
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {format(item.timestamp, "HH:mm:ss")}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {isTopup ? (
                              <Badge className="bg-purple-100 text-purple-800 border-none text-[10px] font-bold px-1.5 py-0 h-4.5">
                                Top-up
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800 border-none text-[10px] font-bold px-1.5 py-0 h-4.5">
                                Job
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {item.referenceNo}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900 line-clamp-1 flex items-center gap-1.5">
                              {item.customerName}
                              {item.isVIP && (
                                <Badge className="text-[8px] px-1 py-0 h-3 bg-amber-200 text-amber-900 border-none font-black">
                                  VIP
                                </Badge>
                              )}
                              {item.isMember && (
                                <Badge className="text-[8px] px-1 py-0 h-3 bg-blue-100 text-blue-700 border-none font-bold">
                                  MEMBER
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">{item.customerPhone}</div>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
                                item.paymentChannel === "Cash / COD"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : item.paymentChannel === "Transfer"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : item.paymentChannel === "Credit Card"
                                  ? "bg-sky-100 text-sky-800"
                                  : item.paymentChannel === "Deduct Member"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {item.paymentChannel}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-900 whitespace-nowrap text-sm">
                            ฿{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                            {item.branchName}
                          </td>
                          {onViewJob && (
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {item.rawJob ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    onViewJob(item.rawJob!);
                                    onClose();
                                  }}
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-indigo-600"
                                  title="ดูรายละเอียดงาน"
                                >
                                  <ExternalLink size={12} />
                                </Button>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Table Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
              <span className="font-semibold">
                แสดงผล {filteredDisplayItems.length} จากทั้งหมด {allItems.length} รายการ
              </span>
              <div className="flex items-center gap-3 font-bold text-slate-800">
                <span>ยอดรวมในตาราง:</span>
                <span className="text-base text-indigo-700 font-black">
                  ฿{Math.round(filteredDisplayItems.reduce((sum, it) => sum + (it.amount || 0), 0)).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 hidden sm:block">
            * ระบบกรองเฉพาะรายการที่หน้าร้านรับชำระ (Shop Paid) และตัดลูกค้า Corporate ออกอัตโนมัติ
          </div>
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-8 px-4 text-xs font-bold rounded-lg cursor-pointer"
          >
            ปิดหน้าต่าง (Close)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
