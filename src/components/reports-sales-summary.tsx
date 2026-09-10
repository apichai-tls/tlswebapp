"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  Store, 
  User, 
  Download, 
  BarChart2, 
  SlidersHorizontal,
  ChevronDown,
  Check,
  ArrowUpDown,
  Wallet
} from "lucide-react";
import { 
  format, 
  subDays, 
  addDays, 
  startOfDay, 
  endOfDay, 
  differenceInCalendarDays, 
  isSameDay, 
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

interface ReportsSalesSummaryProps {
  jobs: Job[];
  selectedBranch?: string;
  onViewJob?: (job: any) => void;
}

type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";
type MetricType = "grossSales" | "netSales" | "refunds" | "discounts" | "topup";
type ChartType = "bar" | "line";
type IntervalType = "hours" | "days";

// Pure helper to calculate percentage & value differences between two periods
function calculateDiff(curr: number, prev: number) {
  const diff = curr - prev;
  if (prev === 0) {
    if (curr === 0) return { percent: 0, diff: 0, isPositive: true, isZero: true };
    return { percent: 100, diff, isPositive: true, isZero: false };
  }
  const percent = (diff / prev) * 100;
  return {
    percent,
    diff,
    isPositive: diff >= 0,
    isZero: diff === 0
  };
}

export function ReportsSalesSummary({ jobs, selectedBranch = "all", onViewJob }: ReportsSalesSummaryProps) {
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
  const [includeTopUpInBreakdown, setIncludeTopUpInBreakdown] = useState(false);

  // Update internal store filter when prop changes
  useEffect(() => {
    if (selectedBranch) {
      setSelectedStore(selectedBranch);
    }
  }, [selectedBranch]);

  // --- Chart & View Controls ---
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("grossSales");
  const [chartType, setChartType] = useState<ChartType>("bar");
  
  // Auto-set interval depending on duration, but allow manual override
  const isSingleDay = useMemo(() => {
    return isSameDay(startDate, endDate) || differenceInCalendarDays(endDate, startDate) === 0;
  }, [startDate, endDate]);

  const [intervalOverride, setIntervalOverride] = useState<IntervalType | null>(null);
  const effectiveInterval: IntervalType = intervalOverride || (isSingleDay ? "hours" : "days");

  // --- Table Controls ---
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortDesc, setSortDesc] = useState(true);
  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    grossSales: true,
    refunds: true,
    discounts: true,
    netSales: true,
    topup: true,
    taxes: true
  });

  // Tooltip state for SVG chart
  const [hoveredBucket, setHoveredBucket] = useState<{
    x: number;
    y: number;
    label: string;
    grossSales: number;
    netSales: number;
    refunds: number;
    discounts: number;
    topup: number;
    orders: number;
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
    setIntervalOverride(null);
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
      // Keep open so user can pick dates
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
        setIntervalOverride(null);
        setPage(1);
        setIsDatePickerOpen(false);
      }
    }
  };

  // Previous Period: same duration immediately preceding startDate
  const { prevStartDate, prevEndDate, daySpan } = useMemo(() => {
    const span = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
    const pEnd = endOfDay(subDays(startDate, 1));
    const pStart = startOfDay(subDays(startDate, span));
    return { prevStartDate: pStart, prevEndDate: pEnd, daySpan: span };
  }, [startDate, endDate]);

  // Navigate left (<) and right (>)
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

  // Trigger historical jobs load for full range (including previous comparison window)
  useEffect(() => {
    jobStore.fetchHistoricalJobs(prevStartDate, endDate).catch(err => {
      console.error("Failed to load historical jobs for sales summary:", err);
    });
  }, [prevStartDate, endDate]);

  // Load Top-up Transactions
  useEffect(() => {
    let isMounted = true;
    setIsLoadingTopups(true);
    getTopUpTransactionsAction({
      startDate: prevStartDate.toISOString(),
      endDate: endDate.toISOString(),
    })
      .then((res) => {
        if (isMounted) {
          setTopups(res as TopUpTransaction[]);
        }
      })
      .catch((err) => {
        console.error("Failed to load top-up transactions for sales summary:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingTopups(false);
      });

    return () => {
      isMounted = false;
    };
  }, [prevStartDate, endDate]);

  // Helper to identify the cashier/user who clicked Pay / collected payment
  const getJobPayee = (job: Job): string | null => {
    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.payments) && parsed.payments.length > 0) {
            // Read from latest payment backwards for the user who collected payment
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

    // Fallback 1: Shift cashier if present
    if ((job as any).shift?.userName) {
      return (job as any).shift.userName.trim();
    }

    // Fallback 2: createdBy (in POS Walk-in, createdBy is the cashier who opened/paid)
    if (job.createdBy && job.createdBy.trim()) {
      return job.createdBy.trim();
    }

    return null;
  };

  // Extract distinct employees who accepted payments (Payees / Cashiers) or processed Top-ups
  const employeeList = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if (j.isPaid || j.isShopPaid) {
        const payee = getJobPayee(j);
        if (payee) {
          set.add(payee);
        }
      }
    });
    topups.forEach(t => {
      if (t.createdBy && t.createdBy.trim()) {
        set.add(t.createdBy.trim());
      }
    });
    // Fallback if no paid jobs in memory yet
    if (set.size === 0) {
      jobs.forEach(j => {
        if (j.createdBy && j.createdBy.trim()) {
          set.add(j.createdBy.trim());
        }
      });
    }
    return Array.from(set).sort();
  }, [jobs, topups]);

  // --- Top-Up Filtering Helper ---
  const filterTopUpsByScope = (topUpList: TopUpTransaction[], start: Date, end: Date) => {
    return topUpList.filter(t => {
      if (!t.createdAt) return false;
      const tDate = new Date(t.createdAt);
      if (tDate < start || tDate > end) return false;

      // Store filter (if topup has branchId specified)
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
      if (selectedTimeRange !== "all") {
        const hour = tDate.getHours();
        if (selectedTimeRange === "night" && hour >= 6) return false;
        if (selectedTimeRange === "morning" && (hour < 6 || hour >= 12)) return false;
        if (selectedTimeRange === "afternoon" && (hour < 12 || hour >= 18)) return false;
        if (selectedTimeRange === "evening" && hour < 18) return false;
      }

      return true;
    });
  };

  const currentPeriodTopUps = useMemo(() => {
    return filterTopUpsByScope(topups, startDate, endDate);
  }, [topups, startDate, endDate, selectedStore, selectedEmployee, selectedTimeRange]);

  const previousPeriodTopUps = useMemo(() => {
    return filterTopUpsByScope(topups, prevStartDate, prevEndDate);
  }, [topups, prevStartDate, prevEndDate, selectedStore, selectedEmployee, selectedTimeRange]);

  const calculateTopUpTotals = (list: TopUpTransaction[]) => {
    let amount = 0;
    let bonus = 0;
    let credit = 0;
    list.forEach(t => {
      amount += Number(t.amount) || 0;
      bonus += Number(t.bonusAmount) || 0;
      credit += Number(t.totalCredit) || 0;
    });
    return {
      amount,
      count: list.length,
      bonus,
      credit,
    };
  };

  const currentTopUpTotals = useMemo(() => calculateTopUpTotals(currentPeriodTopUps), [currentPeriodTopUps]);
  const previousTopUpTotals = useMemo(() => calculateTopUpTotals(previousPeriodTopUps), [previousPeriodTopUps]);
  const topUpDelta = useMemo(() => calculateDiff(currentTopUpTotals.amount, previousTopUpTotals.amount), [currentTopUpTotals.amount, previousTopUpTotals.amount]);

  // --- Filtering Helper ---
  const filterJobsByScope = (jobList: Job[], start: Date, end: Date) => {
    return jobList.filter(job => {
      if (!job.createdAt) return false;
      const jobDate = new Date(job.createdAt);
      if (jobDate < start || jobDate > end) return false;

      // Store filter
      if (selectedStore !== "all" && job.branchId !== selectedStore) {
        return false;
      }

      // Employee filter: filters specifically by the user who pressed Pay / collected payment
      if (selectedEmployee !== "all") {
        const payee = getJobPayee(job);
        if (payee !== selectedEmployee) {
          return false;
        }
      }

      // Time filter
      if (selectedTimeRange !== "all") {
        const hour = jobDate.getHours();
        if (selectedTimeRange === "night" && hour >= 6) return false;
        if (selectedTimeRange === "morning" && (hour < 6 || hour >= 12)) return false;
        if (selectedTimeRange === "afternoon" && (hour < 12 || hour >= 18)) return false;
        if (selectedTimeRange === "evening" && hour < 18) return false;
      }

      return true;
    });
  };

  // Jobs for current period and previous period
  const currentPeriodJobs = useMemo(() => {
    return filterJobsByScope(jobs, startDate, endDate);
  }, [jobs, startDate, endDate, selectedStore, selectedEmployee, selectedTimeRange]);

  const previousPeriodJobs = useMemo(() => {
    return filterJobsByScope(jobs, prevStartDate, prevEndDate);
  }, [jobs, prevStartDate, prevEndDate, selectedStore, selectedEmployee, selectedTimeRange]);

  // --- Metrics Calculation Engine ---
  const calculateTotals = (jobList: Job[]) => {
    let grossSales = 0;
    let refunds = 0;
    let discounts = 0;
    let paidOrderCount = 0;

    jobList.forEach(job => {
      const total = Number(job.totalAmount) || 0;
      const discount = Number(job.discount) || 0;
      const isCancel = job.status === "cancel";
      const isRefund = isCancel && (job.isPaid || job.isShopPaid || (job.remark && job.remark.toLowerCase().includes("refund")));

      if (isRefund) {
        refunds += total;
        return;
      }

      if (isCancel) {
        return;
      }

      if (job.isPaid || job.isShopPaid) {
        paidOrderCount++;
        // Gross sales is value before discount
        grossSales += (total + discount);
        discounts += discount;
      }
    });

    const netSales = Math.max(0, grossSales - refunds - discounts);
    const grossProfit = netSales; // Service business: Gross Profit = Net Sales
    const taxes = (netSales * 7) / 107; // 7% VAT inclusive

    return {
      grossSales,
      refunds,
      discounts,
      netSales,
      grossProfit,
      taxes,
      paidOrderCount
    };
  };

  const currentTotals = useMemo(() => calculateTotals(currentPeriodJobs), [currentPeriodJobs]);
  const previousTotals = useMemo(() => calculateTotals(previousPeriodJobs), [previousPeriodJobs]);

  const grossSalesDelta = useMemo(() => calculateDiff(currentTotals.grossSales, previousTotals.grossSales), [currentTotals, previousTotals]);
  const refundsDelta = useMemo(() => calculateDiff(currentTotals.refunds, previousTotals.refunds), [currentTotals, previousTotals]);
  const discountsDelta = useMemo(() => calculateDiff(currentTotals.discounts, previousTotals.discounts), [currentTotals, previousTotals]);
  const netSalesDelta = useMemo(() => calculateDiff(currentTotals.netSales, previousTotals.netSales), [currentTotals, previousTotals]);
  const grossProfitDelta = useMemo(() => calculateDiff(currentTotals.grossProfit, previousTotals.grossProfit), [currentTotals, previousTotals]);

  // Combined totals when includeTopUpInBreakdown is enabled
  const effectiveCurrentTotals = useMemo(() => {
    if (!includeTopUpInBreakdown) return currentTotals;
    const combinedGross = currentTotals.grossSales + currentTopUpTotals.amount;
    const combinedNet = currentTotals.netSales + currentTopUpTotals.amount;
    const combinedProfit = currentTotals.grossProfit + currentTopUpTotals.amount;
    const combinedTaxes = (combinedNet * 7) / 107;
    return {
      ...currentTotals,
      grossSales: combinedGross,
      netSales: combinedNet,
      grossProfit: combinedProfit,
      taxes: combinedTaxes,
      paidOrderCount: currentTotals.paidOrderCount + currentTopUpTotals.count,
    };
  }, [currentTotals, currentTopUpTotals, includeTopUpInBreakdown]);

  // --- Aggregate Buckets for Chart and Table ---
  interface TimeBucket {
    id: string;
    label: string;
    shortLabel: string;
    timestamp: Date;
    grossSales: number;
    refunds: number;
    discounts: number;
    netSales: number;
    topup: number;
    topupCount: number;
    taxes: number;
    orders: number;
  }

  const buckets = useMemo<TimeBucket[]>(() => {
    if (effectiveInterval === "hours") {
      // 24 Hourly Buckets (00:00 to 23:00)
      const hourlyMap: Record<number, { gross: number; ref: number; disc: number; orders: number; topup: number; topupCount: number }> = {};
      for (let h = 0; h < 24; h++) {
        hourlyMap[h] = { gross: 0, ref: 0, disc: 0, orders: 0, topup: 0, topupCount: 0 };
      }

      currentPeriodJobs.forEach(job => {
        if (!job.createdAt) return;
        const d = new Date(job.createdAt);
        const h = d.getHours();
        const total = Number(job.totalAmount) || 0;
        const discount = Number(job.discount) || 0;
        const isCancel = job.status === "cancel";
        const isRefund = isCancel && (job.isPaid || job.isShopPaid || (job.remark && job.remark.toLowerCase().includes("refund")));

        if (isRefund) {
          hourlyMap[h].ref += total;
          return;
        }
        if (isCancel) return;

        if (job.isPaid || job.isShopPaid) {
          hourlyMap[h].gross += (total + discount);
          hourlyMap[h].disc += discount;
          hourlyMap[h].orders += 1;
        }
      });

      currentPeriodTopUps.forEach(t => {
        if (!t.createdAt) return;
        const d = new Date(t.createdAt);
        const h = d.getHours();
        if (hourlyMap[h]) {
          hourlyMap[h].topup += Number(t.amount) || 0;
          hourlyMap[h].topupCount += 1;
        }
      });

      return Array.from({ length: 24 }).map((_, h) => {
        const startH = `${h.toString().padStart(2, "0")}:00`;
        const nextH = `${((h + 1) % 24).toString().padStart(2, "0")}:00`;
        const label = `${startH} - ${nextH}`;
        
        // Short label for chart x-axis e.g. 12 AM, 3 AM...
        const ampm = h >= 12 ? "PM" : "AM";
        const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const shortLabel = `${displayH} ${ampm}`;

        const data = hourlyMap[h];
        const baseGross = data.gross;
        const baseNet = Math.max(0, data.gross - data.ref - data.disc);
        const grossSales = includeTopUpInBreakdown ? baseGross + data.topup : baseGross;
        const netSales = includeTopUpInBreakdown ? baseNet + data.topup : baseNet;
        const orders = includeTopUpInBreakdown ? data.orders + data.topupCount : data.orders;
        const taxes = (netSales * 7) / 107;

        return {
          id: `h-${h}`,
          label,
          shortLabel,
          timestamp: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), h),
          grossSales,
          refunds: data.ref,
          discounts: data.disc,
          netSales,
          topup: data.topup,
          topupCount: data.topupCount,
          taxes,
          orders
        };
      });
    } else {
      // Daily Buckets
      const daysCount = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
      const dayBuckets: TimeBucket[] = [];

      for (let i = 0; i < daysCount; i++) {
        const currentDay = addDays(startDate, i);
        const dayStart = startOfDay(currentDay);
        const dayEnd = endOfDay(currentDay);

        const dayJobs = currentPeriodJobs.filter(j => {
          if (!j.createdAt) return false;
          const jd = new Date(j.createdAt);
          return jd >= dayStart && jd <= dayEnd;
        });

        const dayTotals = calculateTotals(dayJobs);

        const dayTopups = currentPeriodTopUps.filter(t => {
          if (!t.createdAt) return false;
          const td = new Date(t.createdAt);
          return td >= dayStart && td <= dayEnd;
        });
        const dayTopupAmount = dayTopups.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const dayTopupCount = dayTopups.length;

        const dateStr = format(currentDay, "MMM d, yyyy");
        const shortStr = format(currentDay, "MMM d");

        const baseGross = dayTotals.grossSales;
        const baseNet = dayTotals.netSales;
        const grossSales = includeTopUpInBreakdown ? baseGross + dayTopupAmount : baseGross;
        const netSales = includeTopUpInBreakdown ? baseNet + dayTopupAmount : baseNet;
        const orders = includeTopUpInBreakdown ? dayTotals.paidOrderCount + dayTopupCount : dayTotals.paidOrderCount;
        const taxes = (netSales * 7) / 107;

        dayBuckets.push({
          id: `d-${format(currentDay, "yyyyMMdd")}`,
          label: dateStr,
          shortLabel: shortStr,
          timestamp: currentDay,
          grossSales,
          refunds: dayTotals.refunds,
          discounts: dayTotals.discounts,
          netSales,
          topup: dayTopupAmount,
          topupCount: dayTopupCount,
          taxes,
          orders
        });
      }

      return dayBuckets;
    }
  }, [effectiveInterval, currentPeriodJobs, currentPeriodTopUps, includeTopUpInBreakdown, startDate, endDate]);

  // Sorted Buckets for Table (Descending by default)
  const tableBuckets = useMemo(() => {
    const list = [...buckets];
    if (sortDesc) {
      list.reverse();
    }
    return list;
  }, [buckets, sortDesc]);

  // Pagination for table
  const totalPages = Math.max(1, Math.ceil(tableBuckets.length / rowsPerPage));
  const paginatedBuckets = useMemo(() => {
    const startIdx = (page - 1) * rowsPerPage;
    return tableBuckets.slice(startIdx, startIdx + rowsPerPage);
  }, [tableBuckets, page, rowsPerPage]);

  // --- SVG Chart Dimensions and Math ---
  const chartHeight = 220;
  const chartWidth = 900;
  const paddingLeft = 65;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const maxVal = useMemo(() => {
    let m = 0;
    buckets.forEach(b => {
      const v = b[selectedMetric];
      if (v > m) m = v;
    });
    if (m === 0) return 1000;
    // Round up to nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil((m * 1.15) / magnitude) * magnitude;
  }, [buckets, selectedMetric]);

  const yTicks = useMemo(() => {
    return [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
  }, [maxVal]);

  // Format currency
  const formatMoney = (amount: number) => {
    return `฿${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatShortMoney = (amount: number) => {
    if (amount >= 1000000) return `฿${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `฿${(amount / 1000).toFixed(1)}k`;
    return `฿${Math.round(amount)}`;
  };

  // --- Export CSV Handler ---
  const handleExportCSV = () => {
    let csv = "\uFEFF"; // UTF-8 BOM
    const titleDate = isSingleDay 
      ? format(startDate, "yyyy-MM-dd") 
      : `${format(startDate, "yyyy-MM-dd")}_to_${format(endDate, "yyyy-MM-dd")}`;
    const filename = `sales_summary_${titleDate}.csv`;

    csv += "Sales Summary Report\n";
    csv += `Period,${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}\n`;
    csv += `Store,${selectedStore === "all" ? "All Stores" : (shops.find(s => s.id === selectedStore)?.name || selectedStore)}\n`;
    csv += `Employee,${selectedEmployee === "all" ? "All Employees" : selectedEmployee}\n`;
    csv += `Time,${selectedTimeRange === "all" ? "All Day" : selectedTimeRange}\n`;
    csv += `Generated At,${format(new Date(), "yyyy-MM-dd HH:mm:ss")}\n\n`;

    csv += "=== KPI SUMMARY ===\n";
    csv += "Gross Sales,Refunds,Discounts,Net Sales,Gross Profit,Wallet Top-up,Taxes (VAT 7%),Orders,Top-up Count\n";
    csv += `${currentTotals.grossSales.toFixed(2)},${currentTotals.refunds.toFixed(2)},${currentTotals.discounts.toFixed(2)},${currentTotals.netSales.toFixed(2)},${currentTotals.grossProfit.toFixed(2)},${currentTopUpTotals.amount.toFixed(2)},${currentTotals.taxes.toFixed(2)},${currentTotals.paidOrderCount},${currentTopUpTotals.count}\n\n`;

    csv += `=== BREAKDOWN BY ${effectiveInterval.toUpperCase()} ===\n`;
    csv += `${effectiveInterval === "hours" ? "Time" : "Date"},Gross Sales,Refunds,Discounts,Net Sales,Wallet Top-up,Taxes,Orders\n`;

    tableBuckets.forEach(b => {
      csv += `"${b.label}",${b.grossSales.toFixed(2)},${b.refunds.toFixed(2)},${b.discounts.toFixed(2)},${b.netSales.toFixed(2)},${b.topup.toFixed(2)},${b.taxes.toFixed(2)},${b.orders}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Metric title map
  const metricLabelMap: Record<MetricType, string> = {
    grossSales: "Gross sales",
    netSales: "Net sales",
    refunds: "Refunds",
    discounts: "Discounts",
    topup: "Wallet Top-up"
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TOP FILTER TOOLBAR (Loyverse Style) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-850 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        
        {/* Left: Date Navigator with < [Date Range] > */}
        <div className="flex items-center gap-1.5 relative" ref={datePickerRef}>
          {/* Previous Date Arrow */}
          <button
            onClick={() => handleNavigateDate("prev")}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Previous period"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Date Picker Button */}
          <button
            onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xs transition-colors cursor-pointer"
          >
            <CalendarIcon size={15} className="text-slate-400" />
            <span>
              {isSingleDay 
                ? format(startDate, "MMM d, yyyy") 
                : `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`}
            </span>
            <ChevronDown size={14} className="text-slate-400 ml-0.5" />
          </button>

          {/* Next Date Arrow */}
          <button
            onClick={() => handleNavigateDate("next")}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Next period"
          >
            <ChevronRight size={18} />
          </button>

          {/* Date Picker Dropdown Popover */}
          {isDatePickerOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 font-sans">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 mb-1">Select Period</div>
              
              <div className="space-y-0.5">
                {[
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "7days", label: "Last 7 days" },
                  { id: "30days", label: "Last 30 days" },
                  { id: "thisMonth", label: "This month" },
                  { id: "lastMonth", label: "Last month" },
                  { id: "custom", label: "Custom range" }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => applyPreset(item.id as DatePreset)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                      datePreset === item.id
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-750"
                    }`}
                  >
                    <span>{item.label}</span>
                    {datePreset === item.id && <Check size={14} />}
                  </button>
                ))}
              </div>

              {/* Custom Date Inputs */}
              {datePreset === "custom" && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">From</label>
                    <input
                      type="date"
                      value={customStartInput}
                      onChange={(e) => setCustomStartInput(e.target.value)}
                      className="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">To</label>
                    <input
                      type="date"
                      value={customEndInput}
                      onChange={(e) => setCustomEndInput(e.target.value)}
                      className="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                    />
                  </div>
                  <button
                    onClick={applyCustomDates}
                    className="w-full mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    Apply Range
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Controls: Time, Stores, Employees */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Time Filter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <Clock size={14} className="text-slate-400" />
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-750 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-4 select-none"
            >
              <option value="all">All day</option>
              <option value="morning">Morning (06:00 - 12:00)</option>
              <option value="afternoon">Afternoon (12:00 - 18:00)</option>
              <option value="evening">Evening (18:00 - 24:00)</option>
              <option value="night">Night (00:00 - 06:00)</option>
            </select>
          </div>

          {/* Store Filter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <Store size={14} className="text-slate-400" />
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-750 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-4 select-none"
            >
              <option value="all">All stores</option>
              {shops.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Employee Filter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <User size={14} className="text-slate-400" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-750 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-4 select-none max-w-[150px] truncate"
            >
              <option value="all">All employees</option>
              {employeeList.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* 2. 6 KPI CARDS (With Period-over-Period Delta) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        
        {/* Gross Sales */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Gross sales</div>
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {formatMoney(currentTotals.grossSales)}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-[11px] font-bold">
            {grossSalesDelta.isZero ? (
              <span className="text-slate-400">0.0%</span>
            ) : grossSalesDelta.isPositive ? (
              <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingUp size={13} />
                +{grossSalesDelta.percent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-rose-500 dark:text-rose-400 flex items-center gap-0.5">
                <TrendingDown size={13} />
                {grossSalesDelta.percent.toFixed(1)}%
              </span>
            )}
            <span className="text-slate-400 font-medium text-[10px]">vs. prev</span>
          </div>
        </div>

        {/* Refunds */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Refunds</div>
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {formatMoney(currentTotals.refunds)}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-[11px] font-bold">
            {refundsDelta.isZero ? (
              <span className="text-slate-400">0.0%</span>
            ) : refundsDelta.isPositive ? (
              <span className="text-amber-500 dark:text-amber-400 flex items-center gap-0.5">
                <TrendingUp size={13} />
                +{refundsDelta.percent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingDown size={13} />
                {refundsDelta.percent.toFixed(1)}%
              </span>
            )}
            <span className="text-slate-400 font-medium text-[10px]">vs. prev</span>
          </div>
        </div>

        {/* Discounts */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Discounts</div>
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {formatMoney(currentTotals.discounts)}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-[11px] font-bold">
            {discountsDelta.isZero ? (
              <span className="text-slate-400">0.0%</span>
            ) : discountsDelta.isPositive ? (
              <span className="text-amber-500 dark:text-amber-400 flex items-center gap-0.5">
                <TrendingUp size={13} />
                +{discountsDelta.percent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingDown size={13} />
                {discountsDelta.percent.toFixed(1)}%
              </span>
            )}
            <span className="text-slate-400 font-medium text-[10px]">vs. prev</span>
          </div>
        </div>

        {/* Net Sales */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Net sales</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {formatMoney(currentTotals.netSales)}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-[11px] font-bold">
            {netSalesDelta.isZero ? (
              <span className="text-slate-400">0.0%</span>
            ) : netSalesDelta.isPositive ? (
              <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingUp size={13} />
                +{netSalesDelta.percent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-rose-500 dark:text-rose-400 flex items-center gap-0.5">
                <TrendingDown size={13} />
                {netSalesDelta.percent.toFixed(1)}%
              </span>
            )}
            <span className="text-slate-400 font-medium text-[10px]">vs. prev</span>
          </div>
        </div>

        {/* Gross Profit */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Gross profit</div>
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {formatMoney(currentTotals.grossProfit)}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-[11px] font-bold">
            {grossProfitDelta.isZero ? (
              <span className="text-slate-400">0.0%</span>
            ) : grossProfitDelta.isPositive ? (
              <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingUp size={13} />
                +{grossProfitDelta.percent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-rose-500 dark:text-rose-400 flex items-center gap-0.5">
                <TrendingDown size={13} />
                {grossProfitDelta.percent.toFixed(1)}%
              </span>
            )}
            <span className="text-slate-400 font-medium text-[10px]">vs. prev</span>
          </div>
        </div>

        {/* Wallet Top-up */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-purple-200/80 dark:border-purple-900/50 shadow-xs flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-purple-50/30 to-transparent dark:from-purple-950/20">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">Wallet Top-up</span>
              <div className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Wallet size={13} />
              </div>
            </div>
            <div className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1">
              {formatMoney(currentTopUpTotals.amount)}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold">
            <div className="flex items-center gap-1">
              {topUpDelta.isZero ? (
                <span className="text-slate-400">0.0%</span>
              ) : topUpDelta.isPositive ? (
                <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5">
                  <TrendingUp size={13} />
                  +{topUpDelta.percent.toFixed(1)}%
                </span>
              ) : (
                <span className="text-rose-500 dark:text-rose-400 flex items-center gap-0.5">
                  <TrendingDown size={13} />
                  {topUpDelta.percent.toFixed(1)}%
                </span>
              )}
              <span className="text-slate-400 font-medium text-[10px]">vs. prev</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">{currentTopUpTotals.count} รายการ</span>
          </div>
        </div>

      </div>

      {/* 3. INTERACTIVE CHART SECTION */}
      <div className="bg-white dark:bg-slate-850 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
        
        {/* Chart Header Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          
          {/* Left: Metric Selector & Top-Up Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-850 dark:text-slate-100 rounded-xl px-3 py-1.5 outline-none cursor-pointer"
            >
              <option value="grossSales">Gross sales</option>
              <option value="netSales">Net sales</option>
              <option value="refunds">Refunds</option>
              <option value="discounts">Discounts</option>
              <option value="topup">Wallet Top-up</option>
            </select>

            {/* Toggle: Include Top-Up into breakdown */}
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 text-xs font-bold text-purple-800 dark:text-purple-300 cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-950/40 transition-colors select-none">
              <input
                type="checkbox"
                checked={includeTopUpInBreakdown}
                onChange={(e) => setIncludeTopUpInBreakdown(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-0 cursor-pointer accent-purple-600"
              />
              <span className="flex items-center gap-1.5">
                <span>รวมยอด Top-up ในตารางและกราฟ</span>
                {includeTopUpInBreakdown && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-200/70 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 font-extrabold">
                    +{formatShortMoney(currentTopUpTotals.amount)}
                  </span>
                )}
              </span>
            </label>
          </div>

          {/* Right: Chart Type & Interval Switchers */}
          <div className="flex items-center gap-2">
            
            {/* Chart Type Toggle: Bar vs Line */}
            <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5">
              <button
                onClick={() => setChartType("bar")}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  chartType === "bar"
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
                title="Bar Chart"
              >
                <BarChart2 size={15} />
              </button>
              <button
                onClick={() => setChartType("line")}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  chartType === "line"
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
                title="Line Chart"
              >
                <TrendingUp size={15} />
              </button>
            </div>

            {/* Interval Toggle: Hours vs Days */}
            <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5">
              <button
                onClick={() => setIntervalOverride("hours")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  effectiveInterval === "hours"
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                Hours
              </button>
              <button
                onClick={() => setIntervalOverride("days")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  effectiveInterval === "days"
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                Days
              </button>
            </div>

          </div>
        </div>

        {/* Responsive SVG Chart Container */}
        <div className="relative w-full overflow-x-auto select-none">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto min-w-[650px] overflow-visible"
          >
            <defs>
              {/* Gradients for Line Chart */}
              <linearGradient id="emeraldArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="purpleArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Y-Axis Labels */}
            {yTicks.map((tick, idx) => {
              const y = paddingTop + plotHeight - (tick / maxVal) * plotHeight;
              return (
                <g key={idx}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-150 dark:text-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={paddingLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="text-[10px] font-bold fill-slate-400"
                  >
                    {formatShortMoney(tick)}
                  </text>
                </g>
              );
            })}

            {/* Render Bars or Line */}
            {(() => {
              const count = buckets.length;
              if (count === 0) return null;

              const slotWidth = plotWidth / count;
              const barWidth = Math.max(3, Math.min(26, slotWidth * 0.65));
              const isMetricTopup = selectedMetric === "topup";

              if (chartType === "bar") {
                return buckets.map((bucket, i) => {
                  const val = bucket[selectedMetric];
                  const barH = maxVal > 0 ? (val / maxVal) * plotHeight : 0;
                  const x = paddingLeft + i * slotWidth + (slotWidth - barWidth) / 2;
                  const y = paddingTop + plotHeight - barH;

                  const isHovered = hoveredBucket?.label === bucket.label;

                  return (
                    <g 
                      key={bucket.id}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredBucket({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                          label: bucket.label,
                          grossSales: bucket.grossSales,
                          netSales: bucket.netSales,
                          refunds: bucket.refunds,
                          discounts: bucket.discounts,
                          topup: bucket.topup,
                          orders: bucket.orders
                        });
                      }}
                      onMouseLeave={() => setHoveredBucket(null)}
                    >
                      {/* Transparent Hover Hitbox */}
                      <rect
                        x={paddingLeft + i * slotWidth}
                        y={paddingTop}
                        width={slotWidth}
                        height={plotHeight}
                        fill="transparent"
                      />

                      {/* Bar */}
                      {val > 0 ? (
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barH}
                          rx={3}
                          className={`transition-all duration-200 ${
                            isHovered 
                              ? (isMetricTopup ? "fill-purple-600 dark:fill-purple-400" : "fill-emerald-600 dark:fill-emerald-400") 
                              : (isMetricTopup ? "fill-purple-500/85 dark:fill-purple-500 hover:fill-purple-600" : "fill-emerald-500/85 dark:fill-emerald-500 hover:fill-emerald-600")
                          }`}
                        />
                      ) : (
                        /* Zero-value baseline tick */
                        <rect
                          x={x}
                          y={paddingTop + plotHeight - 1}
                          width={barWidth}
                          height={1.5}
                          className="fill-slate-200 dark:fill-slate-750"
                        />
                      )}
                    </g>
                  );
                });
              } else {
                // Line Chart Mode
                const points = buckets.map((bucket, i) => {
                  const val = bucket[selectedMetric];
                  const x = paddingLeft + i * slotWidth + slotWidth / 2;
                  const y = paddingTop + plotHeight - (maxVal > 0 ? (val / maxVal) * plotHeight : 0);
                  return { x, y, bucket };
                });

                const linePath = points.reduce((acc, p, idx) => {
                  return `${acc} ${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`;
                }, "");

                const areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + plotHeight} L ${points[0].x} ${paddingTop + plotHeight} Z`;

                return (
                  <g>
                    {/* Area under line */}
                    <path d={areaPath} fill={isMetricTopup ? "url(#purpleArea)" : "url(#emeraldArea)"} />
                    {/* Stroke line */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke={isMetricTopup ? "#a855f7" : "#10b981"}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Points */}
                    {points.map((p, idx) => {
                      const isHovered = hoveredBucket?.label === p.bucket.label;
                      return (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={isHovered ? 5 : 3}
                          className={isMetricTopup ? "fill-purple-600 dark:fill-purple-400 stroke-white dark:stroke-slate-850 cursor-pointer" : "fill-emerald-600 dark:fill-emerald-400 stroke-white dark:stroke-slate-850 cursor-pointer"}
                          strokeWidth={2}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredBucket({
                              x: rect.left,
                              y: rect.top,
                              label: p.bucket.label,
                              grossSales: p.bucket.grossSales,
                              netSales: p.bucket.netSales,
                              refunds: p.bucket.refunds,
                              discounts: p.bucket.discounts,
                              topup: p.bucket.topup,
                              orders: p.bucket.orders
                            });
                          }}
                          onMouseLeave={() => setHoveredBucket(null)}
                        />
                      );
                    })}
                  </g>
                );
              }
            })()}

            {/* X-Axis Labels */}
            {buckets.map((bucket, i) => {
              const count = buckets.length;
              const slotWidth = plotWidth / count;
              const x = paddingLeft + i * slotWidth + slotWidth / 2;
              const y = paddingTop + plotHeight + 20;

              // Display cadence: for hours show every 3h, for days show every 1-3 days depending on count
              let shouldShow = false;
              if (effectiveInterval === "hours") {
                shouldShow = i % 3 === 0;
              } else {
                if (count <= 14) shouldShow = true;
                else if (count <= 31) shouldShow = i % 3 === 0;
                else shouldShow = i % 5 === 0;
              }

              if (!shouldShow) return null;

              return (
                <text
                  key={bucket.id}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  className="text-[10px] font-bold fill-slate-400"
                >
                  {bucket.shortLabel}
                </text>
              );
            })}
          </svg>

          {/* Interactive Floating Tooltip */}
          {hoveredBucket && (
            <div 
              className="absolute pointer-events-none bg-slate-900/95 text-white dark:bg-slate-800/95 dark:text-slate-100 p-2.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1 z-50 transform -translate-x-1/2 -translate-y-full"
              style={{
                left: `${hoveredBucket.x}px`,
                top: `${hoveredBucket.y - 12}px`
              }}
            >
              <div className="font-extrabold text-[11px] text-slate-300 border-b border-slate-750 pb-1">
                {hoveredBucket.label}
              </div>
              <div className="flex items-center justify-between gap-4 pt-0.5">
                <span className="text-slate-400">{metricLabelMap[selectedMetric]}:</span>
                <span className={`font-black ${selectedMetric === "topup" ? "text-purple-400" : "text-emerald-400"}`}>
                  {formatMoney(
                    selectedMetric === "grossSales" ? hoveredBucket.grossSales :
                    selectedMetric === "netSales" ? hoveredBucket.netSales :
                    selectedMetric === "refunds" ? hoveredBucket.refunds :
                    selectedMetric === "discounts" ? hoveredBucket.discounts :
                    hoveredBucket.topup
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400">
                <span>Net Sales:</span>
                <span className="font-bold text-slate-200">{formatMoney(hoveredBucket.netSales)}</span>
              </div>
              {hoveredBucket.topup > 0 && (
                <div className="flex items-center justify-between gap-4 text-[10px] text-purple-300 font-semibold">
                  <span>Top-up:</span>
                  <span>{formatMoney(hoveredBucket.topup)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400">
                <span>Orders:</span>
                <span className="font-bold text-slate-200">{hoveredBucket.orders}</span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 4. BREAKDOWN DATA TABLE */}
      <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        
        {/* Table Action Bar (Loyverse Style) */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          
          {/* Left: EXPORT Button */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-black uppercase tracking-wider px-3.5 py-2 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Download size={14} />
            Export
          </button>

          {/* Right: Columns Selector */}
          <div className="relative" ref={columnsDropdownRef}>
            <button
              onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}
              className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <SlidersHorizontal size={14} className="text-slate-400" />
              Columns
              <ChevronDown size={13} className="text-slate-400" />
            </button>

            {/* Columns Dropdown */}
            {isColumnsDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1 mb-1">Toggle Columns</div>
                {(Object.keys(visibleColumns) as (keyof typeof visibleColumns)[]).map(col => (
                  <label
                    key={col}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-750 rounded-xl cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col]}
                      onChange={(e) => setVisibleColumns(prev => ({ ...prev, [col]: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="capitalize">{col.replace(/([A-Z])/g, " $1")}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200 border-collapse">
            
            {/* Table Header */}
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 font-black uppercase tracking-wider text-[10px] text-slate-450">
                <th 
                  className="py-3.5 px-4 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200"
                  onClick={() => setSortDesc(!sortDesc)}
                >
                  <div className="flex items-center gap-1">
                    <span>{effectiveInterval === "hours" ? "Time" : "Date"}</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                {visibleColumns.grossSales && <th className="py-3.5 px-4 text-right">Gross sales</th>}
                {visibleColumns.refunds && <th className="py-3.5 px-4 text-right">Refunds</th>}
                {visibleColumns.discounts && <th className="py-3.5 px-4 text-right">Discounts</th>}
                {visibleColumns.netSales && <th className="py-3.5 px-4 text-right">Net sales</th>}
                {visibleColumns.topup && <th className="py-3.5 px-4 text-right">Top-up</th>}
                {visibleColumns.taxes && <th className="py-3.5 px-4 text-right">Taxes (VAT 7%)</th>}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {/* Summary / Total Row at top */}
              <tr className="bg-slate-100/60 dark:bg-slate-800/80 font-black text-slate-900 dark:text-slate-100 border-b-2 border-slate-200 dark:border-slate-700">
                <td className="py-3.5 px-4">
                  <span className="uppercase text-[11px] tracking-wider text-slate-500 dark:text-slate-400">Total</span>
                </td>
                {visibleColumns.grossSales && <td className="py-3.5 px-4 text-right font-black">{formatMoney(effectiveCurrentTotals.grossSales)}</td>}
                {visibleColumns.refunds && <td className="py-3.5 px-4 text-right font-black">{formatMoney(effectiveCurrentTotals.refunds)}</td>}
                {visibleColumns.discounts && <td className="py-3.5 px-4 text-right font-black">{formatMoney(effectiveCurrentTotals.discounts)}</td>}
                {visibleColumns.netSales && <td className="py-3.5 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">{formatMoney(effectiveCurrentTotals.netSales)}</td>}
                {visibleColumns.topup && (
                  <td className="py-3.5 px-4 text-right font-black text-purple-600 dark:text-purple-400">
                    {formatMoney(currentTopUpTotals.amount)}
                  </td>
                )}
                {visibleColumns.taxes && <td className="py-3.5 px-4 text-right font-black">{formatMoney(effectiveCurrentTotals.taxes)}</td>}
              </tr>

              {/* Data Rows */}
              {paginatedBuckets.map((bucket) => (
                <tr 
                  key={bucket.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors font-medium"
                >
                  <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {bucket.label}
                  </td>
                  {visibleColumns.grossSales && (
                    <td className="py-3.5 px-4 text-right font-bold">
                      {formatMoney(bucket.grossSales)}
                    </td>
                  )}
                  {visibleColumns.refunds && (
                    <td className="py-3.5 px-4 text-right text-slate-500 dark:text-slate-400">
                      {formatMoney(bucket.refunds)}
                    </td>
                  )}
                  {visibleColumns.discounts && (
                    <td className="py-3.5 px-4 text-right text-slate-500 dark:text-slate-400">
                      {formatMoney(bucket.discounts)}
                    </td>
                  )}
                  {visibleColumns.netSales && (
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(bucket.netSales)}
                    </td>
                  )}
                  {visibleColumns.topup && (
                    <td className="py-3.5 px-4 text-right font-bold text-purple-600 dark:text-purple-400">
                      {bucket.topup > 0 ? formatMoney(bucket.topup) : <span className="text-slate-300 dark:text-slate-600 font-normal">฿0.00</span>}
                    </td>
                  )}
                  {visibleColumns.taxes && (
                    <td className="py-3.5 px-4 text-right text-slate-500 dark:text-slate-400">
                      {formatMoney(bucket.taxes)}
                    </td>
                  )}
                </tr>
              ))}

              {paginatedBuckets.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold text-xs">
                    No sales data available for this timeframe
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400">
          
          {/* Rows Per Page */}
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 outline-none text-slate-750 dark:text-slate-200 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Page Indicator and Prev/Next buttons */}
          <div className="flex items-center gap-3">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
