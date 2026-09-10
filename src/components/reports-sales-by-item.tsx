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
  ChevronDown,
  Check,
  ArrowUp,
  ArrowDown,
  PieChart as PieChartIcon
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

interface ReportsSalesByItemProps {
  jobs: Job[];
  selectedBranch?: string;
  onViewJob?: (job: any) => void;
}

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";

export interface ItemSalesRow {
  name: string;
  sku: string;
  itemsSold: number;
  grossSales: number;
  itemsRefunded: number;
  netSales: number;
}

// Color palette for Top 5 items and Pie chart matching Loyverse POS screenshot
const TOP5_COLORS = [
  "#64748b", // 1: Slate Gray
  "#84cc16", // 2: Lime Green
  "#3b82f6", // 3: Blue
  "#e11d48", // 4: Rose / Magenta
  "#eab308", // 5: Yellow / Amber
  "#94a3b8", // 6: Other
];

// Fallback known SKUs for standard system line items
const KNOWN_SKU_MAP: Record<string, string> = {
  "TOP UP": "10071",
  "PACKAGE": "10071",
  "PICK UP FEES": "10072",
  "DELIVERY FEES": "10073",
  "BATHMATS": "10075",
  "CAP/HAT": "10086",
  "HANGERS": "10001",
  "JEANS": "10084",
  "LAUNDRY BAG": "10082",
};

export function ReportsSalesByItem({ jobs, selectedBranch = "all", onViewJob }: ReportsSalesByItemProps) {
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
  const [sortColumn, setSortColumn] = useState<keyof ItemSalesRow>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    sku: true,
    itemsSold: true,
    grossSales: true,
    itemsRefunded: true,
    netSales: true,
  });

  // SVG Pie Tooltip state
  const [hoveredSlice, setHoveredSlice] = useState<{
    name: string;
    netSales: number;
    itemsSold: number;
    percentage: number;
    color: string;
  } | null>(null);

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
      console.error("Failed to load historical jobs for sales by item:", err);
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
        console.error("Failed to load top-up transactions for sales by item:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingTopups(false);
      });

    return () => {
      isMounted = false;
    };
  }, [startDate, endDate]);

  // Helper to identify who collected payment / cashier
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

  // Time range checker
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

      // Time range filter
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

  // Service lookup map for fast SKU retrieval
  const serviceSkuMap = useMemo(() => {
    const map = new Map<string, string>();
    services.forEach(s => {
      if (s.id) {
        map.set(s.id, s.id);
        if (s.name) map.set(s.name.trim().toLowerCase(), s.id);
        if (s.nameEn) map.set(s.nameEn.trim().toLowerCase(), s.id);
      }
    });
    return map;
  }, [services]);

  // Helper to resolve SKU for an item
  const resolveSKU = (name: string, serviceId?: string): string => {
    const upperName = (name || "").trim().toUpperCase();
    if (upperName.startsWith("TOP UP") || upperName === "PACKAGE") {
      return KNOWN_SKU_MAP["TOP UP"] || "10071";
    }
    if (KNOWN_SKU_MAP[upperName]) {
      return KNOWN_SKU_MAP[upperName];
    }
    if (serviceId && serviceId.trim()) {
      return serviceId.trim();
    }
    const lower = (name || "").trim().toLowerCase();
    if (serviceSkuMap.has(lower)) {
      return serviceSkuMap.get(lower)!;
    }
    return "-";
  };

  // --- Core Aggregation of Items ---
  const aggregatedItems = useMemo(() => {
    const itemsMap = new Map<string, ItemSalesRow>();

    const getOrCreate = (name: string, defaultSku: string): ItemSalesRow => {
      const existing = itemsMap.get(name);
      if (existing) return existing;
      const initial: ItemSalesRow = {
        name,
        sku: defaultSku,
        itemsSold: 0,
        grossSales: 0,
        itemsRefunded: 0,
        netSales: 0,
      };
      itemsMap.set(name, initial);
      return initial;
    };

    // 1. Process Jobs Line Items & Fees
    currentPeriodJobs.forEach(job => {
      const isCancelled = job.status === "cancel";
      const isPaid = Boolean(job.isPaid || job.isShopPaid);

      // We process jobs that had commercial value (paid or cancelled-after-payment)
      if (!isPaid && !isCancelled) return;

      // Line items from items or itemsJson
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

      jobItems.forEach(item => {
        const rawName = item.name || item.nameEn || "Other (Custom Service)";
        let cleanName = rawName.trim();
        if (cleanName.toUpperCase() === "PACKAGE") {
          cleanName = "TOP UP";
        }
        const sku = resolveSKU(cleanName, item.serviceId);
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const lineGross = qty * price;

        const row = getOrCreate(cleanName, sku);
        if (row.sku === "-" && sku !== "-") {
          row.sku = sku;
        }

        if (isCancelled) {
          // If the order was cancelled, count as refunded
          row.itemsRefunded += qty;
        } else {
          row.itemsSold += qty;
          row.grossSales += lineGross;
          row.netSales += lineGross;
        }
      });

      // 2. Process Delivery & Pickup Fees
      const fee = Number(job.fee) || 0;
      if (fee > 0) {
        let hasPickup = true;
        let hasDelivery = true;

        if (job.legs) {
          hasPickup = Boolean(job.legs.pickupOutbound || job.legs.pickupInbound);
          hasDelivery = Boolean(job.legs.deliveryOutbound || job.legs.deliveryInbound);
        } else if (job.legsJson) {
          try {
            const legs = JSON.parse(job.legsJson);
            hasPickup = Boolean(legs.pickupOutbound || legs.pickupInbound);
            hasDelivery = Boolean(legs.deliveryOutbound || legs.deliveryInbound);
          } catch (e) {}
        }

        if (hasPickup && hasDelivery) {
          const halfFee = fee / 2;
          // Pickup Fee
          const pRow = getOrCreate("PICK UP FEES", KNOWN_SKU_MAP["PICK UP FEES"] || "10072");
          if (isCancelled) {
            pRow.itemsRefunded += 1;
          } else {
            pRow.itemsSold += 1;
            pRow.grossSales += halfFee;
            pRow.netSales += halfFee;
          }

          // Delivery Fee
          const dRow = getOrCreate("DELIVERY FEES", KNOWN_SKU_MAP["DELIVERY FEES"] || "10073");
          if (isCancelled) {
            dRow.itemsRefunded += 1;
          } else {
            dRow.itemsSold += 1;
            dRow.grossSales += halfFee;
            dRow.netSales += halfFee;
          }
        } else if (hasPickup) {
          const pRow = getOrCreate("PICK UP FEES", KNOWN_SKU_MAP["PICK UP FEES"] || "10072");
          if (isCancelled) {
            pRow.itemsRefunded += 1;
          } else {
            pRow.itemsSold += 1;
            pRow.grossSales += fee;
            pRow.netSales += fee;
          }
        } else {
          const dRow = getOrCreate("DELIVERY FEES", KNOWN_SKU_MAP["DELIVERY FEES"] || "10073");
          if (isCancelled) {
            dRow.itemsRefunded += 1;
          } else {
            dRow.itemsSold += 1;
            dRow.grossSales += fee;
            dRow.netSales += fee;
          }
        }
      }
    });

    // 3. Process Wallet Top-ups as "TOP UP"
    currentPeriodTopUps.forEach(topup => {
      const topUpAmount = Number(topup.amount) || 0;
      if (topUpAmount > 0) {
        // Derive clean package name e.g. "฿3,000 x1" -> "฿3,000" or "Package S"
        const rawPkg = (topup.packageName || "").replace(/x\d+$/i, '').trim();
        let itemName = "TOP UP";
        if (rawPkg && !["top up", "topup"].includes(rawPkg.toLowerCase())) {
          itemName = rawPkg.toUpperCase().startsWith("TOP UP")
            ? rawPkg.toUpperCase()
            : `TOP UP - ${rawPkg.toUpperCase()}`;
        } else if (topUpAmount > 0) {
          itemName = `TOP UP - ฿${topUpAmount.toLocaleString()}`;
        }

        const sku = KNOWN_SKU_MAP["TOP UP"] || "10071";
        const pkgRow = getOrCreate(itemName, sku);
        pkgRow.itemsSold += 1;
        pkgRow.grossSales += topUpAmount;
        pkgRow.netSales += topUpAmount;
      }
    });

    // Return as array
    return Array.from(itemsMap.values());
  }, [currentPeriodJobs, currentPeriodTopUps, serviceSkuMap]);

  // --- Top 5 Items Ranked by Net Sales ---
  const top5Items = useMemo(() => {
    const sorted = [...aggregatedItems].sort((a, b) => b.netSales - a.netSales);
    return sorted.slice(0, 5);
  }, [aggregatedItems]);

  // Total Net Sales for percentage calculation
  const totalNetSales = useMemo(() => {
    return aggregatedItems.reduce((sum, item) => sum + Math.max(0, item.netSales), 0);
  }, [aggregatedItems]);

  // --- Pie Chart Slices Calculation ---
  const pieSlices = useMemo(() => {
    if (totalNetSales <= 0) return [];

    const top5 = top5Items.filter(item => item.netSales > 0);
    const top5NetSum = top5.reduce((sum, item) => sum + item.netSales, 0);
    const otherNet = Math.max(0, totalNetSales - top5NetSum);

    const slices: Array<{
      name: string;
      netSales: number;
      itemsSold: number;
      percentage: number;
      color: string;
      startAngle: number;
      endAngle: number;
    }> = [];

    let currentAngle = -Math.PI / 2; // Start at 12 o'clock

    top5.forEach((item, index) => {
      const percentage = item.netSales / totalNetSales;
      const sliceAngle = percentage * 2 * Math.PI;
      const endAngle = currentAngle + sliceAngle;

      slices.push({
        name: item.name,
        netSales: item.netSales,
        itemsSold: item.itemsSold,
        percentage,
        color: TOP5_COLORS[index] || TOP5_COLORS[0],
        startAngle: currentAngle,
        endAngle,
      });

      currentAngle = endAngle;
    });

    // If there's an "Other" category
    if (otherNet > 0) {
      const percentage = otherNet / totalNetSales;
      const sliceAngle = percentage * 2 * Math.PI;
      const endAngle = currentAngle + sliceAngle;

      slices.push({
        name: "Other items",
        netSales: otherNet,
        itemsSold: 0,
        percentage,
        color: TOP5_COLORS[5],
        startAngle: currentAngle,
        endAngle,
      });
    }

    return slices;
  }, [top5Items, totalNetSales]);

  // --- Table Sorting & Pagination ---
  const handleSort = (column: keyof ItemSalesRow) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedItems = useMemo(() => {
    return [...aggregatedItems].sort((a, b) => {
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
  }, [aggregatedItems, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / rowsPerPage));
  const paginatedItems = useMemo(() => {
    const startIndex = (page - 1) * rowsPerPage;
    return sortedItems.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedItems, page, rowsPerPage]);

  // Adjust page if out of bounds
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // --- CSV Export ---
  const handleExportCSV = () => {
    let csv = "Item,SKU,Items sold,Gross sales,Items refunded,Net sales\n";
    sortedItems.forEach(item => {
      const itemName = `"${item.name.replace(/"/g, '""')}"`;
      const sku = `"${item.sku.replace(/"/g, '""')}"`;
      const sold = item.itemsSold;
      const gross = item.grossSales.toFixed(2);
      const refunded = item.itemsRefunded;
      const net = item.netSales.toFixed(2);
      csv += `${itemName},${sku},${sold},${gross},${refunded},${net}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sales-by-item-${format(startDate, "yyyyMMdd")}-${format(endDate, "yyyyMMdd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for rendering SVG arc paths
  const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
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

      {/* 2. TOP SECTION: TOP 5 ITEMS & PIE CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Card: Top 5 Items List */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Top 5 items</span>
              <span className="text-xs font-semibold text-slate-400">Net sales</span>
            </div>

            {top5Items.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No items sold in this period
              </div>
            ) : (
              <div className="space-y-4">
                {top5Items.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <div 
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: TOP5_COLORS[index] || TOP5_COLORS[0] }}
                      />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate uppercase tracking-tight" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      ฿{item.netSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Sales by Item Chart */}
        <div className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Sales by item chart</span>
            
            <div className="flex items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
              <div className="relative inline-flex items-center gap-1 border-b-2 border-indigo-600 pb-0.5 text-indigo-600 dark:text-indigo-400 cursor-pointer">
                <span>Pie</span>
                <ChevronDown size={12} />
              </div>
              <div className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200">
                <span>Days</span>
                <ChevronDown size={12} />
              </div>
            </div>
          </div>

          {/* SVG Pie Chart Canvas */}
          <div className="flex-1 flex items-center justify-center min-h-[260px] relative">
            {pieSlices.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 gap-2">
                <PieChartIcon size={64} strokeWidth={1.5} />
                <span className="text-xs font-semibold text-slate-400">No data available for chart</span>
              </div>
            ) : (
              <div className="relative flex items-center justify-center w-full h-[260px]">
                <svg viewBox="0 0 300 300" className="w-[240px] h-[240px] overflow-visible">
                  {pieSlices.length === 1 ? (
                    // Single item 100% full circle
                    <circle
                      cx="150"
                      cy="150"
                      r="115"
                      fill={pieSlices[0].color}
                      stroke="white"
                      strokeWidth="2"
                      className="cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
                      onMouseEnter={() => {
                        setHoveredSlice({
                          name: pieSlices[0].name,
                          netSales: pieSlices[0].netSales,
                          itemsSold: pieSlices[0].itemsSold,
                          percentage: 1,
                          color: pieSlices[0].color,
                        });
                      }}
                      onMouseLeave={() => setHoveredSlice(null)}
                    />
                  ) : (
                    pieSlices.map((slice, i) => {
                      const path = describeArc(150, 150, 115, slice.startAngle, slice.endAngle);
                      return (
                        <path
                          key={slice.name + i}
                          d={path}
                          fill={slice.color}
                          stroke="white"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          className="cursor-pointer transition-all duration-200 hover:opacity-90 hover:scale-[1.03] origin-center"
                          onMouseEnter={() => {
                            setHoveredSlice({
                              name: slice.name,
                              netSales: slice.netSales,
                              itemsSold: slice.itemsSold,
                              percentage: slice.percentage,
                              color: slice.color,
                            });
                          }}
                          onMouseLeave={() => setHoveredSlice(null)}
                        />
                      );
                    })
                  )}
                </svg>

                {/* Interactive Tooltip */}
                {hoveredSlice && (
                  <div 
                    className="absolute bg-slate-900/90 backdrop-blur-sm text-white px-3 py-2 rounded-xl shadow-xl border border-slate-700 pointer-events-none z-30 text-center animate-in fade-in zoom-in-95 duration-150"
                    style={{
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)"
                    }}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredSlice.color }} />
                      <div className="text-[11px] font-black uppercase tracking-tight max-w-[150px] truncate">{hoveredSlice.name}</div>
                    </div>
                    <div className="text-xs font-black text-amber-300">
                      ฿{hoveredSlice.netSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-300 font-bold mt-0.5">
                      {(hoveredSlice.percentage * 100).toFixed(1)}% of total
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. BOTTOM SECTION: BREAKDOWN DATA TABLE */}
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
                    { key: "sku", label: "SKU" },
                    { key: "itemsSold", label: "Items sold" },
                    { key: "grossSales", label: "Gross sales" },
                    { key: "itemsRefunded", label: "Items refunded" },
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
                
                {/* Item Column (Sortable) */}
                <th 
                  onClick={() => handleSort("name")}
                  className="py-3 px-5 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Item</span>
                    {sortColumn === "name" && (
                      sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                    )}
                  </div>
                </th>

                {/* SKU Column (Sortable) */}
                {visibleColumns.sku && (
                  <th 
                    onClick={() => handleSort("sku")}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>SKU</span>
                      {sortColumn === "sku" && (
                        sortDirection === "asc" ? <ArrowUp size={12} className="text-slate-800 dark:text-slate-100" /> : <ArrowDown size={12} className="text-slate-800 dark:text-slate-100" />
                      )}
                    </div>
                  </th>
                )}

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
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    No sales items found in this period
                  </td>
                </tr>
              ) : (
                paginatedItems.map((row, idx) => (
                  <tr key={row.name + idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    
                    {/* Item Name */}
                    <td className="py-3 px-5 font-bold uppercase tracking-tight text-slate-800 dark:text-slate-100">
                      {row.name}
                    </td>

                    {/* SKU */}
                    {visibleColumns.sku && (
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {row.sku}
                      </td>
                    )}

                    {/* Items Sold */}
                    {visibleColumns.itemsSold && (
                      <td className="py-3 px-4 text-center tabular-nums">
                        {row.itemsSold}
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
                        {row.itemsRefunded}
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
