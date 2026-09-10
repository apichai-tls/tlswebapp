"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  Store, 
  User, 
  SlidersHorizontal,
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
import { shopStore, jobStore, serviceStore, type Job } from "@/lib/store";
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

interface ReportsSalesByCategoryProps {
  jobs: Job[];
  selectedBranch?: string;
  onViewJob?: (job: any) => void;
}

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";

export interface CategorySalesRow {
  category: string;
  itemsSold: number;
  grossSales: number;
  itemsRefunded: number;
  refunds: number;
  discounts: number;
  netSales: number;
}

// Standard 8 categories matching Loyverse POS (with TOP UP for wallet top-ups and packages)
const STANDARD_CATEGORIES = [
  "DRY CLEAN",
  "IRON",
  "KILO",
  "LINENS",
  "OTHERS",
  "TOP UP",
  "PCS",
  "SHOES",
];

export function ReportsSalesByCategory({ jobs, selectedBranch = "all", onViewJob }: ReportsSalesByCategoryProps) {
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);

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

  // Update internal store filter when prop changes
  useEffect(() => {
    if (selectedBranch) {
      setSelectedStore(selectedBranch);
    }
  }, [selectedBranch]);

  // --- Table Controls ---
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<keyof CategorySalesRow>("category");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    itemsSold: true,
    grossSales: true,
    itemsRefunded: true,
    refunds: true,
    discounts: true,
    netSales: true,
  });

  // Close popovers on click outside
  const datePickerRef = useRef<HTMLDivElement>(null);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setIsDatePickerOpen(false);
      }
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(e.target as Node)) {
        setIsColumnsDropdownOpen(false);
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
      console.error("Failed to load historical jobs for sales by category:", err);
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
        console.error("Failed to load top-up transactions for sales by category:", err);
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

      // Employee filter
      if (selectedEmployee !== "all") {
        const payee = getJobPayee(j);
        if (payee !== selectedEmployee) {
          return false;
        }
      }

      // Time filter
      if (!isInTimeRange(jDate, selectedTimeRange)) {
        return false;
      }

      return true;
    });
  }, [jobs, startDate, endDate, selectedStore, selectedEmployee, selectedTimeRange]);

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

      // Employee filter
      if (selectedEmployee !== "all") {
        const creator = (t.createdBy || "").trim();
        if (creator !== selectedEmployee) {
          return false;
        }
      }

      // Time filter
      if (!isInTimeRange(tDate, selectedTimeRange)) {
        return false;
      }

      return true;
    });
  }, [topups, startDate, endDate, selectedStore, selectedEmployee, selectedTimeRange]);

  // Service lookup maps
  const serviceCategoryMap = useMemo(() => {
    const idMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    services.forEach(s => {
      let cat = (s.category || "").trim().toUpperCase();
      if (cat === "PACKAGE" || cat === "TOPUP" || cat === "TOP UP") cat = "TOP UP";
      if (s.id && cat) idMap.set(s.id.toLowerCase(), cat);
      if (s.name && cat) nameMap.set(s.name.trim().toLowerCase(), cat);
      if (s.nameEn && cat) nameMap.set(s.nameEn.trim().toLowerCase(), cat);
    });

    return { idMap, nameMap };
  }, [services]);

  // Resolve category for an item
  const resolveCategory = (item: any): string => {
    const sid = (item.serviceId || item.id || "").toLowerCase();
    if (sid && serviceCategoryMap.idMap.has(sid)) {
      return serviceCategoryMap.idMap.get(sid)!;
    }

    const name = (item.name || item.nameEn || "").trim().toLowerCase();
    if (name && serviceCategoryMap.nameMap.has(name)) {
      return serviceCategoryMap.nameMap.get(name)!;
    }

    // SKU prefix heuristics
    const upperSid = sid.toUpperCase();
    if (upperSid.startsWith("DRY-")) return "DRY CLEAN";
    if (upperSid.startsWith("IRO-")) return "IRON";
    if (upperSid.startsWith("KIL-")) return "KILO";
    if (upperSid.startsWith("LIN-")) return "LINENS";
    if (upperSid.startsWith("PCS-")) return "PCS";
    if (upperSid.startsWith("SHO-")) return "SHOES";
    if (upperSid.startsWith("PKG-") || upperSid.startsWith("PAC-")) return "TOP UP";
    if (upperSid.startsWith("OTH-")) return "OTHERS";

    // Keyword heuristics
    if (name.includes("ซักพับ") || name.includes("wash/fold") || name.includes("kilo")) return "KILO";
    if (name.includes("ซักรีด") || name.includes("รีด") || name.includes("iron")) return "IRON";
    if (name.includes("dry clean") || name.includes("ซักแห้ง")) return "DRY CLEAN";
    if (name.includes("ผ้าม่าน") || name.includes("curtain") || name.includes("bed") || name.includes("linen")) return "LINENS";
    if (name.includes("รองเท้า") || name.includes("shoe")) return "SHOES";
    if (name.includes("package") || name.includes("top up") || name.includes("topup")) return "TOP UP";

    return "OTHERS";
  };

  // --- Category Aggregation Engine ---
  const aggregatedCategories = useMemo(() => {
    const catMap = new Map<string, CategorySalesRow>();

    const getOrCreate = (cat: string): CategorySalesRow => {
      let cleanCat = cat.toUpperCase().trim();
      if (cleanCat === "PACKAGE" || cleanCat === "TOPUP") cleanCat = "TOP UP";
      const existing = catMap.get(cleanCat);
      if (existing) return existing;
      const initial: CategorySalesRow = {
        category: cleanCat,
        itemsSold: 0,
        grossSales: 0,
        itemsRefunded: 0,
        refunds: 0,
        discounts: 0,
        netSales: 0,
      };
      catMap.set(cleanCat, initial);
      return initial;
    };

    // 1. Process Jobs
    currentPeriodJobs.forEach(job => {
      const isCancelled = job.status === "cancel";
      const isPaid = Boolean(job.isPaid || job.isShopPaid);

      if (!isPaid && !isCancelled) return;

      // Top-up jobs recorded in Job model
      if (job.status === "topup") {
        const row = getOrCreate("TOP UP");
        const amount = Number(job.totalAmount) || 0;
        if (isCancelled) {
          row.itemsRefunded += 1;
          row.refunds += amount;
        } else {
          row.itemsSold += 1;
          row.grossSales += amount;
        }
        return;
      }

      // Extract line items
      let jobItems: any[] = [];
      if (Array.isArray(job.items) && job.items.length > 0) {
        jobItems = job.items;
      } else if (job.itemsJson) {
        try {
          const parsed = JSON.parse(job.itemsJson);
          if (Array.isArray(parsed)) {
            jobItems = parsed;
          }
        } catch (e) {}
      }

      // Calculate order subtotal before discount to proportionally attribute job.discount
      const jobFee = Number(job.fee) || 0;
      let orderItemsSubtotal = 0;
      jobItems.forEach(it => {
        const qty = Number(it.quantity) || 1;
        const pr = Number(it.price) || 0;
        orderItemsSubtotal += qty * pr;
      });

      const orderGrossSubtotal = orderItemsSubtotal + jobFee;
      const orderDiscount = Number(job.discount) || 0;

      // Attribute line items
      jobItems.forEach(it => {
        const cat = resolveCategory(it);
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        const itemGross = qty * price;

        // Proportional discount for this item
        let itemDiscount = 0;
        if (orderGrossSubtotal > 0 && orderDiscount > 0) {
          itemDiscount = (itemGross / orderGrossSubtotal) * orderDiscount;
        }

        const row = getOrCreate(cat);

        if (isCancelled) {
          row.itemsRefunded += qty;
          row.refunds += Math.max(0, itemGross - itemDiscount);
        } else {
          row.itemsSold += qty;
          row.grossSales += itemGross;
          row.discounts += itemDiscount;
        }
      });

      // Attribute Delivery & Pickup fees (both belong to "OTHERS" category)
      if (jobFee > 0) {
        const row = getOrCreate("OTHERS");
        
        let feeDiscount = 0;
        if (orderGrossSubtotal > 0 && orderDiscount > 0) {
          feeDiscount = (jobFee / orderGrossSubtotal) * orderDiscount;
        }

        let legCount = 1;
        if (job.legs) {
          const hasP = Boolean(job.legs.pickupOutbound || job.legs.pickupInbound);
          const hasD = Boolean(job.legs.deliveryOutbound || job.legs.deliveryInbound);
          if (hasP && hasD) legCount = 2;
        } else if (job.legsJson) {
          try {
            const legs = JSON.parse(job.legsJson);
            const hasP = Boolean(legs.pickupOutbound || legs.pickupInbound);
            const hasD = Boolean(legs.deliveryOutbound || legs.deliveryInbound);
            if (hasP && hasD) legCount = 2;
          } catch (e) {}
        }

        if (isCancelled) {
          row.itemsRefunded += legCount;
          row.refunds += Math.max(0, jobFee - feeDiscount);
        } else {
          row.itemsSold += legCount;
          row.grossSales += jobFee;
          row.discounts += feeDiscount;
        }
      }
    });

    // 2. Process Wallet Top-ups (belong to "TOP UP" category)
    currentPeriodTopUps.forEach(topup => {
      const topUpAmount = Number(topup.amount) || 0;
      if (topUpAmount > 0) {
        const row = getOrCreate("TOP UP");
        row.itemsSold += 1;
        row.grossSales += topUpAmount;
      }
    });

    // 3. Compute Net sales: Gross sales - Refunds - Discounts
    const rows = Array.from(catMap.values()).map(r => {
      const net = Math.max(0, r.grossSales - r.refunds - r.discounts);
      return {
        ...r,
        netSales: net,
      };
    });

    return rows;
  }, [currentPeriodJobs, currentPeriodTopUps, serviceCategoryMap]);

  // --- Sorting & Pagination ---
  const handleSort = (column: keyof CategorySalesRow) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedCategories = useMemo(() => {
    return [...aggregatedCategories].sort((a, b) => {
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
  }, [aggregatedCategories, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedCategories.length / rowsPerPage));
  const paginatedCategories = useMemo(() => {
    const startIndex = (page - 1) * rowsPerPage;
    return sortedCategories.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedCategories, page, rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // --- CSV Export ---
  const handleExportCSV = () => {
    let csv = "Category,Items sold,Gross sales,Items refunded,Refunds,Discounts,Net sales\n";
    sortedCategories.forEach(c => {
      const cat = `"${c.category.replace(/"/g, '""')}"`;
      const sold = c.itemsSold.toFixed(1).replace(/\.0$/, '');
      const gross = c.grossSales.toFixed(2);
      const refunded = c.itemsRefunded.toFixed(1).replace(/\.0$/, '');
      const refAmount = c.refunds.toFixed(2);
      const disc = c.discounts.toFixed(2);
      const net = c.netSales.toFixed(2);
      csv += `${cat},${sold},${gross},${refunded},${refAmount},${disc},${net}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sales-by-category-${format(startDate, "yyyyMMdd")}-${format(endDate, "yyyyMMdd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatQuantity = (val: number) => {
    if (Number.isInteger(val)) {
      return val.toLocaleString("en-US");
    }
    return val.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

        {/* Time Selector Dropdown */}
        <div className="relative">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 shadow-sm">
            <Clock size={14} className="text-slate-400" />
            <select
              value={selectedTimeRange}
              onChange={(e) => {
                setSelectedTimeRange(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-4 select-none"
            >
              <option value="all">All day</option>
              <option value="night">Night (00:00 - 06:00)</option>
              <option value="morning">Morning (06:00 - 12:00)</option>
              <option value="afternoon">Afternoon (12:00 - 18:00)</option>
              <option value="evening">Evening (18:00 - 24:00)</option>
            </select>
          </div>
        </div>

        {/* Store Selector Dropdown */}
        <div className="relative">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 shadow-sm">
            <Store size={14} className="text-slate-400" />
            <select
              value={selectedStore}
              onChange={(e) => {
                setSelectedStore(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-4 select-none"
            >
              <option value="all">All stores</option>
              {shops.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Employee Selector Dropdown */}
        <div className="relative">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 shadow-sm">
            <User size={14} className="text-slate-400" />
            <select
              value={selectedEmployee}
              onChange={(e) => {
                setSelectedEmployee(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-4 select-none"
            >
              <option value="all">All employees</option>
              {employeeList.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. BREAKDOWN DATA TABLE (Loyverse POS Layout) */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        
        {/* Table Toolbar: EXPORT & Column Visibility */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={handleExportCSV}
            className="text-xs font-black tracking-wider text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors uppercase cursor-pointer"
          >
            EXPORT
          </button>

          {/* Columns Visibility Dropdown */}
          <div className="relative" ref={columnsDropdownRef}>
            <button
              onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Columns"
            >
              <SlidersHorizontal size={16} />
            </button>

            {isColumnsDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 p-2 text-xs font-semibold">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 py-1">Toggle Columns</div>
                <div className="space-y-1 mt-1">
                  {[
                    { key: "itemsSold", label: "Items sold" },
                    { key: "grossSales", label: "Gross sales" },
                    { key: "itemsRefunded", label: "Items refunded" },
                    { key: "refunds", label: "Refunds" },
                    { key: "discounts", label: "Discounts" },
                    { key: "netSales", label: "Net sales" },
                  ].map(col => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer select-none text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.key as keyof typeof visibleColumns]}
                        onChange={(e) => {
                          setVisibleColumns({
                            ...visibleColumns,
                            [col.key]: e.target.checked
                          });
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 select-none bg-slate-50/50 dark:bg-slate-800/30">
                
                {/* Category Column (Sortable) */}
                <th 
                  onClick={() => handleSort("category")}
                  className="py-3 px-5 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Category</span>
                    {sortColumn === "category" && (
                      sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                    )}
                  </div>
                </th>

                {/* Items sold Column (Sortable) */}
                {visibleColumns.itemsSold && (
                  <th 
                    onClick={() => handleSort("itemsSold")}
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Items sold</span>
                      {sortColumn === "itemsSold" && (
                        sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                      )}
                    </div>
                  </th>
                )}

                {/* Gross sales Column (Sortable) */}
                {visibleColumns.grossSales && (
                  <th 
                    onClick={() => handleSort("grossSales")}
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Gross sales</span>
                      {sortColumn === "grossSales" && (
                        sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                      )}
                    </div>
                  </th>
                )}

                {/* Items refunded Column (Sortable) */}
                {visibleColumns.itemsRefunded && (
                  <th 
                    onClick={() => handleSort("itemsRefunded")}
                    className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Items refunded</span>
                      {sortColumn === "itemsRefunded" && (
                        sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                      )}
                    </div>
                  </th>
                )}

                {/* Refunds Column (Sortable) */}
                {visibleColumns.refunds && (
                  <th 
                    onClick={() => handleSort("refunds")}
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Refunds</span>
                      {sortColumn === "refunds" && (
                        sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                      )}
                    </div>
                  </th>
                )}

                {/* Discounts Column (Sortable) */}
                {visibleColumns.discounts && (
                  <th 
                    onClick={() => handleSort("discounts")}
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Discounts</span>
                      {sortColumn === "discounts" && (
                        sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                      )}
                    </div>
                  </th>
                )}

                {/* Net sales Column (Sortable) */}
                {visibleColumns.netSales && (
                  <th 
                    onClick={() => handleSort("netSales")}
                    className="py-3 px-5 text-right cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Net sales</span>
                      {sortColumn === "netSales" && (
                        sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                      )}
                    </div>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
              {paginatedCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    No sales data found for any category in this period
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((row) => (
                  <tr key={row.category} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    
                    {/* Category Name */}
                    <td className="py-3 px-5 font-bold uppercase tracking-tight text-slate-800 dark:text-slate-100">
                      {row.category}
                    </td>

                    {/* Items Sold */}
                    {visibleColumns.itemsSold && (
                      <td className="py-3 px-4 text-center tabular-nums">
                        {formatQuantity(row.itemsSold)}
                      </td>
                    )}

                    {/* Gross Sales */}
                    {visibleColumns.grossSales && (
                      <td className="py-3 px-4 text-right tabular-nums">
                        ฿{row.grossSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    )}

                    {/* Items Refunded */}
                    {visibleColumns.itemsRefunded && (
                      <td className="py-3 px-4 text-center tabular-nums text-slate-500">
                        {formatQuantity(row.itemsRefunded)}
                      </td>
                    )}

                    {/* Refunds */}
                    {visibleColumns.refunds && (
                      <td className="py-3 px-4 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        ฿{row.refunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    )}

                    {/* Discounts */}
                    {visibleColumns.discounts && (
                      <td className="py-3 px-4 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        ฿{row.discounts.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    )}

                    {/* Net Sales */}
                    {visibleColumns.netSales && (
                      <td className="py-3 px-5 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                        ฿{row.netSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
          
          {/* Prev / Next Pagination Controls */}
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
            
            <div className="flex items-center gap-1.5 ml-2">
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
                className="w-12 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded text-center text-xs font-bold bg-white dark:bg-slate-800 outline-none"
              />
              <span>of {totalPages}</span>
            </div>
          </div>

          {/* Rows per page Selector */}
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-xs font-bold outline-none cursor-pointer"
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
