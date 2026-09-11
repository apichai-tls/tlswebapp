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
  ArrowUp,
  ArrowDown
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

interface ReportsTaxesProps {
  jobs: Job[];
  selectedBranch?: string;
  onViewJob?: (job: any) => void;
}

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";

export interface TaxRow {
  taxName: string;
  taxRate: string;
  taxRateNum: number;
  taxableSales: number;
  taxAmount: number;
}

export function ReportsTaxes({ jobs, selectedBranch = "all", onViewJob }: ReportsTaxesProps) {
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

  // --- Top-Up Data State ---
  const [topups, setTopups] = useState<TopUpTransaction[]>([]);
  const [isLoadingTopups, setIsLoadingTopups] = useState(false);

  // --- Table Controls ---
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<keyof TaxRow>("taxName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

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
      console.error("Failed to load historical jobs for taxes:", err);
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
        console.error("Failed to load top-up transactions for taxes:", err);
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

  // Distinct employees for the employee dropdown
  const employeeList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.isPaid || j.isShopPaid) {
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
        if (j.createdBy && j.createdBy.trim()) {
          set.add(j.createdBy.trim());
        }
      });
    }
    return Array.from(set).sort();
  }, [jobs, topups]);

  // Time range filter
  const isInTimeRange = (date: Date, range: string) => {
    if (range === "all") return true;
    const hour = date.getHours();
    if (range === "night") return hour >= 0 && hour < 6;
    if (range === "morning") return hour >= 6 && hour < 12;
    if (range === "afternoon") return hour >= 12 && hour < 18;
    if (range === "evening") return hour >= 18 && hour < 24;
    return true;
  };

  // --- Filter Jobs by Scope ---
  const currentPeriodJobs = useMemo(() => {
    return jobs.filter(j => {
      if (!j.createdAt) return false;
      const jDate = new Date(j.createdAt);
      if (jDate < startDate || jDate > endDate) return false;

      // Store filter
      if (selectedStore !== "all" && j.branchId !== selectedStore) {
        return false;
      }

      // Time filter
      if (!isInTimeRange(jDate, selectedTimeRange)) {
        return false;
      }

      // Employee filter
      if (selectedEmployee !== "all") {
        const payee = getJobPayee(j);
        if (payee !== selectedEmployee) return false;
      }

      return true;
    });
  }, [jobs, startDate, endDate, selectedStore, selectedTimeRange, selectedEmployee]);

  // --- Filter Topups by Scope ---
  const currentPeriodTopUps = useMemo(() => {
    return topups.filter(t => {
      if (!t.createdAt) return false;
      const tDate = new Date(t.createdAt);
      if (tDate < startDate || tDate > endDate) return false;

      // Store filter
      if (selectedStore !== "all" && t.branchId && t.branchId !== selectedStore) {
        return false;
      }

      // Time filter
      if (!isInTimeRange(tDate, selectedTimeRange)) {
        return false;
      }

      // Employee filter
      if (selectedEmployee !== "all") {
        if ((t.createdBy || "").trim() !== selectedEmployee) return false;
      }

      return true;
    });
  }, [topups, startDate, endDate, selectedStore, selectedTimeRange, selectedEmployee]);

  // --- Calculate Taxes and Totals ---
  const taxCalculations = useMemo(() => {
    let taxableSales = 0;
    let nonTaxableSales = 0;

    // 1. Process Jobs
    currentPeriodJobs.forEach(job => {
      const isCancelled = job.status === "cancel";
      const isPaid = Boolean(job.isPaid || job.isShopPaid);

      if (!isPaid && !isCancelled) return;

      const total = Number(job.totalAmount) || 0;
      const discount = Number(job.discount) || 0;
      const gross = total + discount;
      const net = Math.max(0, gross - (isCancelled ? total : 0) - discount);

      // Check for explicit non-taxable / tax-exempt
      let isNonTaxable = false;
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          if (parsed.vatType === "none") {
            isNonTaxable = true;
          }
        } catch (e) {}
      }

      if (isNonTaxable) {
        nonTaxableSales += isCancelled ? -total : net;
      } else {
        taxableSales += isCancelled ? -total : net;
      }
    });

    // Ensure non-negative numbers
    taxableSales = Math.max(0, taxableSales);
    nonTaxableSales = Math.max(0, nonTaxableSales);
    const totalNetSales = taxableSales + nonTaxableSales;

    // 7% VAT Inclusive formula: Tax Amount = Taxable Sales * 7 / 107
    const vatRateNum = 7;
    const taxAmount = (taxableSales * vatRateNum) / (100 + vatRateNum);

    const rows: TaxRow[] = [
      {
        taxName: "VAT",
        taxRate: `${vatRateNum}%`,
        taxRateNum: vatRateNum,
        taxableSales,
        taxAmount,
      }
    ];

    return {
      taxableSales,
      nonTaxableSales,
      totalNetSales,
      taxAmount,
      rows,
    };
  }, [currentPeriodJobs]);

  // --- Sorting & Pagination ---
  const handleSort = (column: keyof TaxRow) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedRows = useMemo(() => {
    return [...taxCalculations.rows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }

      const numA = Number(aVal) || 0;
      const numB = Number(bVal) || 0;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });
  }, [taxCalculations.rows, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const startIndex = (page - 1) * rowsPerPage;
    return sortedRows.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedRows, page, rowsPerPage]);

  // --- CSV Export ---
  const handleExportCSV = () => {
    let csv = "\uFEFF"; // UTF-8 BOM for Excel
    csv += "Tax name,Tax rate,Taxable sales,Tax amount\n";
    sortedRows.forEach(r => {
      const name = `"${r.taxName.replace(/"/g, '""')}"`;
      const rate = `"${r.taxRate}"`;
      const sales = r.taxableSales.toFixed(2);
      const amt = r.taxAmount.toFixed(2);
      csv += `${name},${rate},${sales},${amt}\n`;
    });

    // Total row
    csv += `"Total",,,${taxCalculations.taxAmount.toFixed(2)}\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `taxes-${format(startDate, "yyyyMMdd")}-${format(endDate, "yyyyMMdd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val: number) => {
    return `฿${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Taxable sales */}
        <div>
          <div className="text-xs text-slate-500 font-medium mb-1">Taxable sales</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            {formatCurrency(taxCalculations.taxableSales)}
          </div>
        </div>

        {/* Non-taxable sales */}
        <div>
          <div className="text-xs text-slate-500 font-medium mb-1">Non-taxable sales</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            {formatCurrency(taxCalculations.nonTaxableSales)}
          </div>
        </div>

        {/* Total net sales */}
        <div>
          <div className="text-xs text-slate-500 font-medium mb-1">Total net sales</div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            {formatCurrency(taxCalculations.totalNetSales)}
          </div>
        </div>

      </div>

      {/* 3. TAXES DATA TABLE CARD */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        
        {/* Card Header with EXPORT Button */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={handleExportCSV}
            className="text-xs font-extrabold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 tracking-wider uppercase transition-colors cursor-pointer"
          >
            EXPORT
          </button>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                
                {/* Tax name */}
                <th 
                  onClick={() => handleSort("taxName")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors select-none text-left"
                >
                  <div className="flex items-center gap-1">
                    <span>Tax name</span>
                    {sortColumn === "taxName" && (
                      sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    )}
                  </div>
                </th>

                {/* Tax rate */}
                <th 
                  onClick={() => handleSort("taxRate")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors select-none text-left"
                >
                  <div className="flex items-center gap-1">
                    <span>Tax rate</span>
                    {sortColumn === "taxRate" && (
                      sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    )}
                  </div>
                </th>

                {/* Taxable sales */}
                <th 
                  onClick={() => handleSort("taxableSales")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Taxable sales</span>
                    {sortColumn === "taxableSales" && (
                      sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    )}
                  </div>
                </th>

                {/* Tax amount */}
                <th 
                  onClick={() => handleSort("taxAmount")}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Tax amount</span>
                    {sortColumn === "taxAmount" && (
                      sortDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    )}
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs text-slate-750 dark:text-slate-200">
              {paginatedRows.map(row => (
                <tr key={row.taxName} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-100 text-left">
                    {row.taxName}
                  </td>
                  <td className="py-3.5 px-4 text-left font-medium">
                    {row.taxRate}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium">
                    {formatCurrency(row.taxableSales)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-900 dark:text-slate-100">
                    {formatCurrency(row.taxAmount)}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Total Summary Footer Row (Bold) */}
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 text-xs font-black text-slate-900 dark:text-slate-50">
                <td className="py-4 px-4 text-left">
                  Total
                </td>
                <td className="py-4 px-4 text-left"></td>
                <td className="py-4 px-4 text-right"></td>
                <td className="py-4 px-4 text-right">
                  {formatCurrency(taxCalculations.taxAmount)}
                </td>
              </tr>
            </tfoot>
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

    </div>
  );
}
