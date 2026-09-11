"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  Store, 
  User, 
  Check,
  Search,
  Receipt,
  RotateCcw,
  Eye,
  FileText,
  X
} from "lucide-react";
import { 
  format, 
  subDays, 
  addDays, 
  startOfDay, 
  endOfDay, 
  differenceInCalendarDays, 
  startOfMonth, 
  endOfMonth, 
  subMonths 
} from "date-fns";
import { shopStore, jobStore, type Job } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { getTopUpTransactionsAction } from "@/actions/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface TopUpTransaction {
  id: string;
  memberId: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  type: string;
  status: string;
  createdAt: string;
  packageName: string;
  paymentChannel: string;
  bonusAmount: number;
  totalCredit: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  createdBy: string;
  branchId: string | null;
  slipImageUrl: string | null;
}

interface ReportsReceiptsProps {
  jobs: Job[];
  selectedBranch?: string;
  onViewJob?: (job: any) => void;
}

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";
type ReceiptTypeFilter = "all" | "sales" | "refunds";

export interface ReceiptItem {
  id: string;
  receiptNo: string;
  date: Date;
  dateStr: string;
  store: string;
  storeId?: string;
  employee: string;
  customerName: string;
  customerPhone: string;
  type: "Sale" | "Refund";
  total: number;
  rawJob?: Job;
  rawTopUp?: TopUpTransaction;
  isTopUp?: boolean;
}

export function ReportsReceipts({ jobs, selectedBranch = "all", onViewJob }: ReportsReceiptsProps) {
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // --- Date Range State ---
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => endOfDay(new Date()));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [customStartInput, setCustomStartInput] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [customEndInput, setCustomEndInput] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // --- Filter States ---
  const [selectedStore, setSelectedStore] = useState<string>(selectedBranch);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("all"); // "all" | "night" | "morning" | "afternoon" | "evening"
  const [receiptTypeFilter, setReceiptTypeFilter] = useState<ReceiptTypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // --- Top-Up Data State ---
  const [topups, setTopups] = useState<TopUpTransaction[]>([]);
  const [isLoadingTopups, setIsLoadingTopups] = useState(false);

  // --- Pagination State ---
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // --- Modal View State ---
  const [selectedReceiptForModal, setSelectedReceiptForModal] = useState<ReceiptItem | null>(null);

  // Update internal store filter when prop changes
  useEffect(() => {
    if (selectedBranch) {
      setSelectedStore(selectedBranch);
    }
  }, [selectedBranch]);

  // Close popovers on click outside
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Date Range Switcher Helpers ---
  const applyPreset = (preset: DatePreset) => {
    const today = new Date();
    setDatePreset(preset);
    setPage(1);

    if (preset === "today") {
      setStartDate(startOfDay(today));
      setEndDate(endOfDay(today));
      setIsDatePickerOpen(false);
    } else if (preset === "yesterday") {
      const yesterday = subDays(today, 1);
      setStartDate(startOfDay(yesterday));
      setEndDate(endOfDay(yesterday));
      setIsDatePickerOpen(false);
    } else if (preset === "7days") {
      setStartDate(startOfDay(subDays(today, 6)));
      setEndDate(endOfDay(today));
      setIsDatePickerOpen(false);
    } else if (preset === "30days") {
      setStartDate(startOfDay(subDays(today, 29)));
      setEndDate(endOfDay(today));
      setIsDatePickerOpen(false);
    } else if (preset === "thisMonth") {
      setStartDate(startOfMonth(today));
      setEndDate(endOfDay(today));
      setIsDatePickerOpen(false);
    } else if (preset === "lastMonth") {
      const lastMonthDate = subMonths(today, 1);
      setStartDate(startOfMonth(lastMonthDate));
      setEndDate(endOfMonth(lastMonthDate));
      setIsDatePickerOpen(false);
    } else if (preset === "custom") {
      // Keep open for date inputs
    }
  };

  const applyCustomDates = () => {
    if (customStartInput && customEndInput) {
      const s = startOfDay(new Date(customStartInput));
      const e = endOfDay(new Date(customEndInput));
      if (s <= e) {
        setStartDate(s);
        setEndDate(e);
        setDatePreset("custom");
        setPage(1);
        setIsDatePickerOpen(false);
      }
    }
  };

  const daySpan = useMemo(() => {
    return Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
  }, [startDate, endDate]);

  const handleNavigateDate = (direction: "prev" | "next") => {
    setPage(1);
    if (direction === "prev") {
      setStartDate(subDays(startDate, daySpan));
      setEndDate(subDays(endDate, daySpan));
    } else {
      setStartDate(addDays(startDate, daySpan));
      setEndDate(addDays(endDate, daySpan));
    }
    setDatePreset("custom");
  };

  // Trigger historical jobs load for full range
  useEffect(() => {
    jobStore.fetchHistoricalJobs(startDate, endDate).catch(err => {
      console.error("Failed to load historical jobs for receipts:", err);
    });
  }, [startDate, endDate]);

  // Load Top-up Transactions
  useEffect(() => {
    let isMounted = true;
    setIsLoadingTopups(true);
    getTopUpTransactionsAction({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    })
      .then((res) => {
        if (isMounted) {
          setTopups(res as TopUpTransaction[]);
        }
      })
      .catch((err) => {
        console.error("Failed to load top-up transactions for receipts:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingTopups(false);
      });

    return () => {
      isMounted = false;
    };
  }, [startDate, endDate]);

  // Helper to identify payee / cashier
  const getJobPayee = (job: Job): string | null => {
    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.payments) && parsed.payments.length > 0) {
            for (let i = parsed.payments.length - 1; i >= 0; i--) {
              const p = parsed.payments[i];
              if (p.paidBy && typeof p.paidBy === "string" && p.paidBy.trim()) {
                return p.paidBy.trim();
              }
            }
          }
        }
      } catch (e) {}
    }

    if ((job as any).shift?.userName) {
      return (job as any).shift.userName.trim();
    }

    if (job.createdBy && job.createdBy.trim()) {
      return job.createdBy.trim();
    }

    return null;
  };

  // Distinct employees for the employee dropdown (only shop-paid jobs + topups)
  const employeeList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.isShopPaid) {
        const payee = getJobPayee(j);
        if (payee) set.add(payee);
      }
    });
    topups.forEach(t => {
      if (t.createdBy && t.createdBy.trim()) {
        set.add(t.createdBy.trim());
      }
    });
    if (set.size === 0) {
      jobs.forEach(j => {
        if (j.isShopPaid && j.createdBy && j.createdBy.trim()) {
          set.add(j.createdBy.trim());
        }
      });
    }
    return Array.from(set).sort();
  }, [jobs, topups]);

  // Time range filter helper
  const isInTimeRange = (date: Date, range: string) => {
    if (range === "all") return true;
    const hour = date.getHours();
    if (range === "night") return hour >= 0 && hour < 6;
    if (range === "morning") return hour >= 6 && hour < 12;
    if (range === "afternoon") return hour >= 12 && hour < 18;
    if (range === "evening") return hour >= 18 && hour < 24;
    return true;
  };

  // Format Receipt Number nicely matching Loyverse (prioritizing billNo if filled)
  const formatReceiptNumber = (job: Job): string => {
    if (job.billNo && job.billNo.trim()) return job.billNo.trim();
    if ((job as any).receiptNumber) return (job as any).receiptNumber;
    if ((job as any).proformaNumber) return (job as any).proformaNumber;
    if ((job as any).proformaReceiptNumber) return (job as any).proformaReceiptNumber;
    if (job.id.startsWith("RE-") || job.id.startsWith("PR-") || job.id.includes("-")) return job.id;
    return `1-${job.id.slice(-5)}`;
  };

  // Find store code or short name
  const getStoreName = (branchId?: string | null): string => {
    if (!branchId) return "TLSSR";
    const shop = shops.find(s => s.id === branchId);
    if (shop?.name) {
      const match = shop.name.match(/\(([^)]+)\)/);
      if (match && match[1]) return match[1];
      return shop.name;
    }
    return branchId;
  };

  // --- Assemble All Receipts in Current Scope ---
  const allReceipts = useMemo(() => {
    const list: ReceiptItem[] = [];

    // 1. Process Jobs
    jobs.forEach(job => {
      if (!job.createdAt) return;
      const jDate = new Date(job.createdAt);
      if (jDate < startDate || jDate > endDate) return false;

      // Store filter
      if (selectedStore !== "all" && job.branchId !== selectedStore) {
        return;
      }

      // Time filter
      if (!isInTimeRange(jDate, selectedTimeRange)) {
        return;
      }

      // Employee filter
      const employee = getJobPayee(job) || "Staff";
      if (selectedEmployee !== "all" && employee !== selectedEmployee) {
        return;
      }

      // ดึงมาเฉพาะรายการที่หน้าร้านรับชำระ (Shop Paid) ยกเว้น Topup ซึ่งประมวลผลแยกอยู่ด้านล่าง
      if (!job.isShopPaid) return;

      const isCancelled = job.status === "cancel";
      const type: "Sale" | "Refund" = isCancelled ? "Refund" : "Sale";
      const receiptNo = formatReceiptNumber(job);
      const store = getStoreName(job.branchId);
      const customerName = (job.customerName && job.customerName !== "ลูกค้าทั่วไป") ? job.customerName.trim() : "";
      const customerPhone = job.customerPhone || "";
      const total = Number(job.totalAmount) || 0;

      list.push({
        id: job.id,
        receiptNo,
        date: jDate,
        dateStr: format(jDate, "MMM dd, yyyy hh:mm a"),
        store,
        storeId: job.branchId,
        employee,
        customerName,
        customerPhone,
        type,
        total,
        rawJob: job,
        isTopUp: false,
      });
    });

    // 2. Process Top-ups
    topups.forEach(topup => {
      if (!topup.createdAt) return;
      const tDate = new Date(topup.createdAt);
      if (tDate < startDate || tDate > endDate) return;

      // Store filter
      if (selectedStore !== "all" && topup.branchId && topup.branchId !== selectedStore) {
        return;
      }

      // Time filter
      if (!isInTimeRange(tDate, selectedTimeRange)) {
        return;
      }

      // Employee filter
      const creator = (topup.createdBy || "Staff").trim();
      if (selectedEmployee !== "all" && creator !== selectedEmployee) {
        return;
      }

      const type: "Sale" | "Refund" = topup.status === "cancelled" ? "Refund" : "Sale";
      const store = getStoreName(topup.branchId);
      const total = Number(topup.amount) || 0;

      list.push({
        id: topup.id,
        receiptNo: topup.id || `TU-${topup.memberId}`,
        date: tDate,
        dateStr: format(tDate, "MMM dd, yyyy hh:mm a"),
        store,
        storeId: topup.branchId || undefined,
        employee: creator,
        customerName: topup.customerName || "",
        customerPhone: topup.customerPhone || "",
        type,
        total,
        rawTopUp: topup,
        isTopUp: true,
      });
    });

    // Sort descending by date (newest receipts first)
    list.sort((a, b) => b.date.getTime() - a.date.getTime());

    return list;
  }, [jobs, topups, startDate, endDate, selectedStore, selectedTimeRange, selectedEmployee, shops]);

  // --- Top Summary Stats Counts ---
  const stats = useMemo(() => {
    let salesCount = 0;
    let refundsCount = 0;

    allReceipts.forEach(r => {
      if (r.type === "Sale") salesCount++;
      else if (r.type === "Refund") refundsCount++;
    });

    return {
      allCount: allReceipts.length,
      salesCount,
      refundsCount,
    };
  }, [allReceipts]);

  // --- Filter by Type & Search Query ---
  const filteredReceipts = useMemo(() => {
    return allReceipts.filter(r => {
      // Type card tab filter
      if (receiptTypeFilter === "sales" && r.type !== "Sale") return false;
      if (receiptTypeFilter === "refunds" && r.type !== "Refund") return false;

      // Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNo = r.receiptNo.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
        const matchesStore = r.store.toLowerCase().includes(q);
        const matchesEmp = r.employee.toLowerCase().includes(q);
        const matchesCust = r.customerName.toLowerCase().includes(q) || r.customerPhone.includes(q);
        const matchesType = r.type.toLowerCase().includes(q);
        if (!matchesNo && !matchesStore && !matchesEmp && !matchesCust && !matchesType) {
          return false;
        }
      }

      return true;
    });
  }, [allReceipts, receiptTypeFilter, searchQuery]);

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filteredReceipts.length / rowsPerPage));
  const paginatedReceipts = useMemo(() => {
    const startIndex = (page - 1) * rowsPerPage;
    return filteredReceipts.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredReceipts, page, rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [receiptTypeFilter, searchQuery, startDate, endDate, selectedStore, selectedEmployee, selectedTimeRange]);

  // --- CSV Export ---
  const handleExportCSV = () => {
    let csv = "\uFEFF"; // UTF-8 BOM for Thai characters in Excel
    csv += "Receipt no.,Date,Store,Employee,Customer,Customer Phone,Type,Total\n";
    filteredReceipts.forEach(r => {
      const recNo = `"${r.receiptNo.replace(/"/g, '""')}"`;
      const date = `"${r.dateStr.replace(/"/g, '""')}"`;
      const store = `"${r.store.replace(/"/g, '""')}"`;
      const emp = `"${r.employee.replace(/"/g, '""')}"`;
      const cust = `"${r.customerName.replace(/"/g, '""')}"`;
      const phone = `"${r.customerPhone.replace(/"/g, '""')}"`;
      const type = r.type;
      const total = r.total.toFixed(2);
      csv += `${recNo},${date},${store},${emp},${cust},${phone},${type},${total}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `receipts-${format(startDate, "yyyyMMdd")}-${format(endDate, "yyyyMMdd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRowClick = (receipt: ReceiptItem) => {
    if (receipt.rawJob && onViewJob) {
      onViewJob(receipt.rawJob);
      return;
    }
    setSelectedReceiptForModal(receipt);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TOP FILTER TOOLBAR (Loyverse POS Style) */}
      <div className="flex flex-wrap items-center gap-2.5">
        
        {/* Date Navigator Group */}
        <div className="flex items-center bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
          <button
            onClick={() => handleNavigateDate("prev")}
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-l-lg transition-colors cursor-pointer"
            title="Previous period"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Date Picker Button / Dropdown */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer border-x border-slate-200 dark:border-slate-800 select-none"
            >
              <CalendarIcon size={14} className="text-slate-400" />
              <span>
                {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")}
              </span>
            </button>

            {/* Date Preset Dropdown Popover */}
            {isDatePickerOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-2 text-xs font-semibold">
                <div className="space-y-1">
                  {[
                    { key: "today", label: "Today" },
                    { key: "yesterday", label: "Yesterday" },
                    { key: "7days", label: "Last 7 days" },
                    { key: "30days", label: "Last 30 days" },
                    { key: "thisMonth", label: "This month" },
                    { key: "lastMonth", label: "Last month" },
                    { key: "custom", label: "Custom" },
                  ].map(preset => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset.key as DatePreset)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                        datePreset === preset.key
                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{preset.label}</span>
                      {datePreset === preset.key && <Check size={14} />}
                    </button>
                  ))}
                </div>

                {/* Custom Date Form */}
                {datePreset === "custom" && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Start Date</label>
                      <input
                        type="date"
                        value={customStartInput}
                        onChange={(e) => setCustomStartInput(e.target.value)}
                        className="w-full mt-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">End Date</label>
                      <input
                        type="date"
                        value={customEndInput}
                        onChange={(e) => setCustomEndInput(e.target.value)}
                        className="w-full mt-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200"
                      />
                    </div>
                    <button
                      onClick={applyCustomDates}
                      className="w-full mt-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black shadow-sm transition-colors cursor-pointer"
                    >
                      Apply Range
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => handleNavigateDate("next")}
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-r-lg transition-colors cursor-pointer"
            title="Next period"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Time of Day Filter */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200">
          <Clock size={14} className="text-slate-400" />
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="bg-transparent border-none outline-none cursor-pointer pr-4 select-none"
          >
            <option value="all">All day</option>
            <option value="night">Night (00:00 - 06:00)</option>
            <option value="morning">Morning (06:00 - 12:00)</option>
            <option value="afternoon">Afternoon (12:00 - 18:00)</option>
            <option value="evening">Evening (18:00 - 24:00)</option>
          </select>
        </div>

        {/* Stores Filter */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200">
          <Store size={14} className="text-slate-400" />
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="bg-transparent border-none outline-none cursor-pointer pr-4 select-none"
          >
            <option value="all">All stores</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Employees Filter */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200">
          <User size={14} className="text-slate-400" />
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="bg-transparent border-none outline-none cursor-pointer pr-4 select-none"
          >
            <option value="all">All employees</option>
            {employeeList.map(emp => (
              <option key={emp} value={emp}>{emp}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. TOP SUMMARY METRIC CARDS (Exact Loyverse Style) */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden grid grid-cols-3">
        
        {/* Card 1: All receipts */}
        <button
          onClick={() => setReceiptTypeFilter("all")}
          className={`flex items-center justify-center gap-4 py-5 px-6 transition-colors relative cursor-pointer text-left ${
            receiptTypeFilter === "all" ? "bg-slate-50/50 dark:bg-slate-800/40" : "hover:bg-slate-50/30"
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-slate-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <Receipt size={22} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">All receipts</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.allCount}</div>
          </div>
          {receiptTypeFilter === "all" && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-t-sm" />
          )}
        </button>

        {/* Card 2: Sales */}
        <button
          onClick={() => setReceiptTypeFilter("sales")}
          className={`flex items-center justify-center gap-4 py-5 px-6 transition-colors relative cursor-pointer text-left border-l border-slate-100 dark:border-slate-800 ${
            receiptTypeFilter === "sales" ? "bg-slate-50/50 dark:bg-slate-800/40" : "hover:bg-slate-50/30"
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <div className="flex items-center justify-center relative">
              <Receipt size={22} strokeWidth={2.2} />
              <span className="absolute text-[10px] font-black bottom-0 right-0">$</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Sales</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.salesCount}</div>
          </div>
          {receiptTypeFilter === "sales" && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-t-sm" />
          )}
        </button>

        {/* Card 3: Refunds */}
        <button
          onClick={() => setReceiptTypeFilter("refunds")}
          className={`flex items-center justify-center gap-4 py-5 px-6 transition-colors relative cursor-pointer text-left border-l border-slate-100 dark:border-slate-800 ${
            receiptTypeFilter === "refunds" ? "bg-slate-50/50 dark:bg-slate-800/40" : "hover:bg-slate-50/30"
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-rose-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <RotateCcw size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Refunds</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.refundsCount}</div>
          </div>
          {receiptTypeFilter === "refunds" && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-600 rounded-t-sm" />
          )}
        </button>

      </div>

      {/* 3. RECEIPTS DATA TABLE CARD */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        
        {/* Card Header: EXPORT on left, Search on right */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <button
            onClick={handleExportCSV}
            className="text-xs font-extrabold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 tracking-wider uppercase transition-colors cursor-pointer flex items-center gap-1"
          >
            EXPORT
          </button>

          <div className="relative max-w-xs w-full">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search receipts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Receipts Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 text-left">Receipt no.</th>
                <th className="py-3 px-4 text-left">Date</th>
                <th className="py-3 px-4 text-left">Store</th>
                <th className="py-3 px-4 text-left">Employee</th>
                <th className="py-3 px-4 text-left">Customer</th>
                <th className="py-3 px-4 text-left">Type</th>
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs text-slate-750 dark:text-slate-200">
              {paginatedReceipts.length > 0 ? (
                paginatedReceipts.map(receipt => (
                  <tr 
                    key={receipt.id}
                    onClick={() => handleRowClick(receipt)}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    {/* Receipt no. */}
                    <td className="py-3.5 px-4 font-semibold text-slate-850 dark:text-slate-100 text-left">
                      {receipt.receiptNo}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 text-left">
                      {receipt.dateStr}
                    </td>

                    {/* Store */}
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 text-left">
                      {receipt.store}
                    </td>

                    {/* Employee */}
                    <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200 text-left">
                      {receipt.employee}
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4 text-left">
                      {receipt.customerName ? (
                        <div className="leading-snug">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{receipt.customerName}</div>
                          {receipt.customerPhone && (
                            <div className="text-[11px] text-slate-400 font-mono">{receipt.customerPhone}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-4 text-left">
                      <span className={`text-[11px] font-semibold ${
                        receipt.type === "Refund" 
                          ? "text-rose-600 dark:text-rose-400 font-bold" 
                          : "text-slate-700 dark:text-slate-200"
                      }`}>
                        {receipt.type}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                      ฿{receipt.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium text-xs">
                    No receipts found for the selected period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 4. PAGINATION FOOTER */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
          
          {/* Arrow Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Page Info */}
          <div className="flex items-center gap-2">
            <span>Page:</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                  setPage(val);
                }
              }}
              className="w-12 px-2 py-1 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100"
            />
            <span>of {totalPages}</span>
          </div>

          {/* Rows per page */}
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

      </div>

      {/* 5. RECEIPT DETAILS MODAL */}
      <Dialog 
        open={!!selectedReceiptForModal} 
        onOpenChange={(open) => {
          if (!open) setSelectedReceiptForModal(null);
        }}
      >
        <DialogContent className="max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="text-indigo-600" size={18} />
                <span>Receipt #{selectedReceiptForModal?.receiptNo}</span>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                selectedReceiptForModal?.type === "Refund"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              }`}>
                {selectedReceiptForModal?.type}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedReceiptForModal && (
            <div className="space-y-4 text-xs mt-2">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl space-y-2 border border-slate-200/60 dark:border-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-400">Date & Time:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReceiptForModal.dateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Store:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReceiptForModal.store}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Cashier / Staff:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReceiptForModal.employee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedReceiptForModal.customerName || "General Walk-in"} {selectedReceiptForModal.customerPhone ? `(${selectedReceiptForModal.customerPhone})` : ""}
                  </span>
                </div>
              </div>

              {/* Items in Job if available */}
              {selectedReceiptForModal.rawJob?.items && selectedReceiptForModal.rawJob.items.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 font-bold text-[11px] text-slate-600 dark:text-slate-300 uppercase">
                    Items Purchased
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                    {selectedReceiptForModal.rawJob.items.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</div>
                          <div className="text-[10px] text-slate-400">{item.quantity} x ฿{item.price.toFixed(2)}</div>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          ฿{(item.quantity * item.price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total Row */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-black text-slate-900 dark:text-slate-100">
                <span>Total Amount:</span>
                <span className="text-base text-indigo-600 dark:text-indigo-400">
                  ฿{selectedReceiptForModal.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
