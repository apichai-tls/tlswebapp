"use client";

import { useState, useMemo, useEffect } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { useRiders } from "@/lib/use-riders";
import { shopStore, shiftStore, jobStore, type CashierShift } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Users, 
  ArrowUpRight, 
  Percent, 
  Store,
  ArrowLeft,
  BarChart2,
  Download,
  History,
  ClipboardList,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Crown,
  Eye,
  Package,
  User,
  Clock,
  Lock,
  FileText,
  Printer,
  Truck,
  HelpCircle,
  Sparkles,
  LayoutGrid,
  CreditCard,
  Receipt
} from "lucide-react";
import { printImageUrl } from "@/components/ui/multi-image-uploader";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ReportsSalesSummary } from "@/components/reports-sales-summary";
import { ReportsSalesByItem } from "@/components/reports-sales-by-item";
import { ReportsSalesByCategory } from "@/components/reports-sales-by-category";
import { ReportsSalesByEmployee } from "@/components/reports-sales-by-employee";
import { ReportsSalesByPaymentType } from "@/components/reports-sales-by-payment-type";
import { ReportsReceipts } from "@/components/reports-receipts";
import { ReportsTaxes } from "@/components/reports-taxes";

interface AdminReportsProps {
  onViewJob?: (job: any) => void;
}

export function AdminReports({ onViewJob }: AdminReportsProps) {
  const jobs = useJobs();
  const customers = useCustomers();
  const riders = useRiders();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // Sub-tabs state
  const [subTab, setSubTab] = useState<"overview" | "sales-summary" | "sale-report" | "sales-by-item" | "sales-by-category" | "sales-by-employee" | "sales-by-payment-type" | "receipts" | "taxes" | "shift" | "order" | "pos">("overview");
  const [saleReportSubTab, setSaleReportSubTab] = useState<"item" | "category" | "employee" | "payment-type">("item");

  // Filters State
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "month" | "custom">("30days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  
  // Tab-specific filters/search
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Shift orders dialog state
  const [selectedShiftForOrders, setSelectedShiftForOrders] = useState<CashierShift | null>(null);
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<any | null>(null);
  const [shiftOrdersSearchQuery, setShiftOrdersSearchQuery] = useState("");




  // Closed shifts state
  const [closedShifts, setClosedShifts] = useState<any[]>([]);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);

  // Load Closed Shifts when Shift Tab is active
  useEffect(() => {
    if (subTab === "shift") {
      setIsLoadingShifts(true);
      shiftStore.getClosedShifts().then(res => {
        setClosedShifts(res);
        setIsLoadingShifts(false);
      }).catch(err => {
        console.error("Failed to load closed shifts:", err);
        setIsLoadingShifts(false);
      });
    }
  }, [subTab]);

  // Load historical jobs based on selected timeframe / date range
  useEffect(() => {
    const today = new Date();
    let start: Date;
    let end: Date = new Date();

    if (dateRange === "today") {
      start = startOfDay(today);
      end = endOfDay(today);
    } else if (dateRange === "7days") {
      start = startOfDay(subDays(today, 7));
    } else if (dateRange === "30days") {
      start = startOfDay(subDays(today, 30));
    } else if (dateRange === "month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
    } else if (dateRange === "custom") {
      if (customStartDate) {
        start = new Date(customStartDate);
        start.setHours(0, 0, 0, 0);
      } else {
        start = startOfDay(subDays(today, 30)); // fallback
      }
      if (customEndDate) {
        end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
      }
    } else {
      start = startOfDay(subDays(today, 30));
    }

    jobStore.fetchHistoricalJobs(start, end).catch(err => {
      console.error("Failed to load historical jobs for reports:", err);
    });
  }, [dateRange, customStartDate, customEndDate]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove("printing-report");
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  // Filtered Jobs based on main branch & date timeframe
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Branch filter
      if (selectedBranch !== "all" && job.branchId !== selectedBranch) {
        return false;
      }

      // Date filter
      if (!job.createdAt) return false;
      const jobDate = new Date(job.createdAt);
      const today = new Date();

      if (dateRange === "today") {
        return jobDate >= startOfDay(today) && jobDate <= endOfDay(today);
      } else if (dateRange === "7days") {
        return jobDate >= startOfDay(subDays(today, 7));
      } else if (dateRange === "30days") {
        return jobDate >= startOfDay(subDays(today, 30));
      } else if (dateRange === "month") {
        return jobDate.getMonth() === today.getMonth() && jobDate.getFullYear() === today.getFullYear();
      } else if (dateRange === "custom") {
        if (customStartDate) {
          const startMs = new Date(customStartDate).setHours(0, 0, 0, 0);
          if (jobDate.getTime() < startMs) return false;
        }
        if (customEndDate) {
          const endMs = new Date(customEndDate).setHours(23, 59, 59, 999);
          if (jobDate.getTime() > endMs) return false;
        }
        return true;
      }

      return true;
    });
  }, [jobs, selectedBranch, dateRange, customStartDate, customEndDate]);


  // Metric summaries for Overview Panel
  const overviewStats = useMemo(() => {
    let totalRevenue = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    
    let cashSum = 0;
    let transferSum = 0;
    let cardSum = 0;
    let creditSum = 0;

    const productSales: Record<string, { count: number; revenue: number }> = {};

    filteredJobs.forEach(job => {
      if (job.status === "cancel") {
        cancelledCount++;
        return;
      }
      
      if (job.status === "completed") {
        completedCount++;
      } else {
        pendingCount++;
      }

      if (job.isPaid) {
        totalRevenue += job.totalAmount || 0;
        
        const channel = (job.paymentChannel || "").toLowerCase();
        const method = (job.paymentMethod || "").toLowerCase();

        if (channel.includes("cash") || method.includes("cash")) {
          cashSum += job.totalAmount || 0;
        } else if (channel.includes("transfer") || method.includes("transfer")) {
          transferSum += job.totalAmount || 0;
        } else if (channel.includes("card") || method.includes("card")) {
          cardSum += job.totalAmount || 0;
        } else {
          creditSum += job.totalAmount || 0;
        }
      }

      // Item breakdown
      try {
        if (job.items) {
          const itemsList = typeof job.items === "string" ? JSON.parse(job.items) : job.items;
          if (Array.isArray(itemsList)) {
            itemsList.forEach((item: any) => {
              const name = item.name || "General Laundry";
              const qty = item.quantity || 1;
              const price = item.price || 0;
              const rev = qty * price;

              if (!productSales[name]) {
                productSales[name] = { count: 0, revenue: 0 };
              }
              productSales[name].count = Math.round((productSales[name].count + qty) * 100) / 100;
              productSales[name].revenue = Math.round((productSales[name].revenue + rev) * 100) / 100;
            });
          }
        }
      } catch (e) {}
    });

    const averageTicket = completedCount > 0 ? totalRevenue / completedCount : 0;

    const topProducts = Object.entries(productSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      totalRevenue,
      completedCount,
      pendingCount,
      cancelledCount,
      averageTicket,
      paymentBreakdown: {
        cash: cashSum,
        transfer: transferSum,
        card: cardSum,
        credit: creditSum
      },
      topProducts
    };
  }, [filteredJobs]);

  // --- Sales Trend & Operations Volume Chart States & Logic ---
  const [trendMetric, setTrendMetric] = useState<"both" | "sales" | "volume">("both");
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  // Time-bucket aggregation for Overview Chart
  const trendBuckets = useMemo(() => {
    const today = new Date();
    interface Bucket {
      id: string;
      label: string;
      subLabel: string;
      sales: number;
      volume: number;
      dateStart: Date;
      dateEnd: Date;
    }
    const buckets: Bucket[] = [];

    if (dateRange === "today") {
      // 12 two-hour intervals across today (00:00 - 24:00)
      for (let h = 0; h < 24; h += 2) {
        const s = new Date(today);
        s.setHours(h, 0, 0, 0);
        const e = new Date(today);
        e.setHours(h + 1, 59, 59, 999);
        const startStr = `${String(h).padStart(2, "0")}:00`;
        const endStr = `${String(h + 2).padStart(2, "0")}:00`;
        buckets.push({
          id: `h-${h}`,
          label: startStr,
          subLabel: `${startStr} - ${endStr}`,
          sales: 0,
          volume: 0,
          dateStart: s,
          dateEnd: e,
        });
      }
    } else if (dateRange === "7days") {
      // 7 days up to today
      for (let i = 6; i >= 0; i--) {
        const d = subDays(today, i);
        const s = startOfDay(d);
        const e = endOfDay(d);
        buckets.push({
          id: `d-${format(d, "yyyy-MM-dd")}`,
          label: format(d, "EEE d/M"),
          subLabel: format(d, "EEEE, d MMM yyyy"),
          sales: 0,
          volume: 0,
          dateStart: s,
          dateEnd: e,
        });
      }
    } else if (dateRange === "30days") {
      // 30 days up to today
      for (let i = 29; i >= 0; i--) {
        const d = subDays(today, i);
        const s = startOfDay(d);
        const e = endOfDay(d);
        buckets.push({
          id: `d-${format(d, "yyyy-MM-dd")}`,
          label: format(d, "d/M"),
          subLabel: format(d, "EEEE, d MMM yyyy"),
          sales: 0,
          volume: 0,
          dateStart: s,
          dateEnd: e,
        });
      }
    } else if (dateRange === "month") {
      // Days in current month
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(today.getFullYear(), today.getMonth(), day);
        const s = startOfDay(d);
        const e = endOfDay(d);
        buckets.push({
          id: `d-${format(d, "yyyy-MM-dd")}`,
          label: String(day),
          subLabel: format(d, "EEEE, d MMM yyyy"),
          sales: 0,
          volume: 0,
          dateStart: s,
          dateEnd: e,
        });
      }
    } else if (dateRange === "custom") {
      const sDate = customStartDate ? new Date(customStartDate) : subDays(today, 30);
      const eDate = customEndDate ? new Date(customEndDate) : today;
      const sTime = startOfDay(sDate).getTime();
      const eTime = endOfDay(eDate).getTime();
      const diffDays = Math.max(1, Math.round((eTime - sTime) / (1000 * 60 * 60 * 24)));

      if (diffDays <= 2) {
        // Hourly (2-hour bins)
        for (let h = 0; h < 24; h += 2) {
          const s = new Date(sDate);
          s.setHours(h, 0, 0, 0);
          const e = new Date(sDate);
          e.setHours(h + 1, 59, 59, 999);
          const startStr = `${String(h).padStart(2, "0")}:00`;
          const endStr = `${String(h + 2).padStart(2, "0")}:00`;
          buckets.push({
            id: `h-${h}`,
            label: startStr,
            subLabel: `${startStr} - ${endStr}`,
            sales: 0,
            volume: 0,
            dateStart: s,
            dateEnd: e,
          });
        }
      } else if (diffDays <= 35) {
        // Daily
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(sTime + i * 24 * 60 * 60 * 1000);
          buckets.push({
            id: `d-${format(d, "yyyy-MM-dd")}`,
            label: format(d, "d/M"),
            subLabel: format(d, "EEEE, d MMM yyyy"),
            sales: 0,
            volume: 0,
            dateStart: startOfDay(d),
            dateEnd: endOfDay(d),
          });
        }
      } else {
        // Weekly
        const numWeeks = Math.ceil(diffDays / 7);
        for (let w = 0; w < numWeeks; w++) {
          const s = new Date(sTime + w * 7 * 24 * 60 * 60 * 1000);
          const e = new Date(Math.min(eTime, sTime + (w + 1) * 7 * 24 * 60 * 60 * 1000 - 1));
          buckets.push({
            id: `w-${w}`,
            label: `W${w + 1}`,
            subLabel: `${format(s, "d/M")} - ${format(e, "d/M/yy")}`,
            sales: 0,
            volume: 0,
            dateStart: s,
            dateEnd: e,
          });
        }
      }
    }

    // Populate data from filteredJobs
    filteredJobs.forEach((job) => {
      if (job.status === "cancel") return;
      if (!job.createdAt) return;
      const jobTime = new Date(job.createdAt).getTime();

      const b = buckets.find(
        (b) => jobTime >= b.dateStart.getTime() && jobTime <= b.dateEnd.getTime()
      );
      if (b) {
        b.volume += 1;
        if (job.isPaid) {
          b.sales += job.totalAmount || 0;
        }
      }
    });

    return buckets;
  }, [filteredJobs, dateRange, customStartDate, customEndDate]);

  // Calculations for chart scaling and coordinates
  const trendChartStats = useMemo(() => {
    let totalSales = 0;
    let totalVolume = 0;
    let maxSales = 0;
    let maxVolume = 0;

    trendBuckets.forEach((b) => {
      totalSales += b.sales;
      totalVolume += b.volume;
      if (b.sales > maxSales) maxSales = b.sales;
      if (b.volume > maxVolume) maxVolume = b.volume;
    });

    // Nice ceiling for sales (฿)
    if (maxSales === 0) maxSales = 1000;
    else {
      const mag = Math.pow(10, Math.floor(Math.log10(maxSales)));
      const step = mag / 2 || 1;
      maxSales = Math.ceil((maxSales * 1.15) / step) * step;
    }

    // Nice ceiling for volume (orders)
    if (maxVolume === 0) maxVolume = 5;
    else {
      if (maxVolume <= 5) maxVolume = 5;
      else if (maxVolume <= 10) maxVolume = 10;
      else if (maxVolume <= 20) maxVolume = 20;
      else if (maxVolume <= 50) maxVolume = 50;
      else {
        const step = Math.pow(10, Math.floor(Math.log10(maxVolume)));
        maxVolume = Math.ceil((maxVolume * 1.2) / step) * step;
      }
    }

    const avgTicket = totalVolume > 0 ? totalSales / totalVolume : 0;

    return {
      totalSales,
      totalVolume,
      maxSales,
      maxVolume,
      avgTicket,
    };
  }, [trendBuckets]);

  // SVG Chart Geometry for Overview Trend Chart
  const chartW = 600;
  const chartH = 200;
  const pLeft = 52;
  const pRight = 44;
  const pTop = 16;
  const pBottom = 30;
  const plotW = chartW - pLeft - pRight;
  const plotH = chartH - pTop - pBottom;
  const baselineY = pTop + plotH;

  const formatShortMoney = (amount: number) => {
    if (amount >= 1000000) return `฿${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `฿${(amount / 1000).toFixed(1)}k`;
    return `฿${Math.round(amount)}`;
  };

  const trendPoints = useMemo(() => {
    const n = trendBuckets.length;
    return trendBuckets.map((b, i) => {
      const x = pLeft + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
      const ySales = pTop + plotH - (b.sales / trendChartStats.maxSales) * plotH;
      const yVolume = pTop + plotH - (b.volume / trendChartStats.maxVolume) * plotH;
      const barHeight = Math.max(0, (b.volume / trendChartStats.maxVolume) * plotH);
      const barY = pTop + plotH - barHeight;
      return {
        ...b,
        index: i,
        x,
        ySales,
        yVolume,
        barHeight,
        barY,
      };
    });
  }, [trendBuckets, plotW, plotH, pLeft, pTop, trendChartStats.maxSales, trendChartStats.maxVolume]);

  const salesPath = useMemo(() => {
    if (trendPoints.length === 0) return "";
    if (trendPoints.length === 1) return `M ${trendPoints[0].x.toFixed(1)} ${trendPoints[0].ySales.toFixed(1)}`;
    let d = `M ${trendPoints[0].x.toFixed(1)} ${trendPoints[0].ySales.toFixed(1)}`;
    for (let i = 0; i < trendPoints.length - 1; i++) {
      const p0 = trendPoints[i === 0 ? i : i - 1];
      const p1 = trendPoints[i];
      const p2 = trendPoints[i + 1];
      const p3 = trendPoints[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.ySales + (p2.ySales - p0.ySales) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.ySales - (p3.ySales - p1.ySales) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.ySales.toFixed(1)}`;
    }
    return d;
  }, [trendPoints]);

  const salesAreaPath = useMemo(() => {
    if (trendPoints.length === 0 || !salesPath) return "";
    return `${salesPath} L ${trendPoints[trendPoints.length - 1].x.toFixed(1)} ${baselineY} L ${trendPoints[0].x.toFixed(1)} ${baselineY} Z`;
  }, [salesPath, trendPoints, baselineY]);

  const yTicks = useMemo(() => {
    return [
      { ratio: 1.0, y: pTop, labelSales: formatShortMoney(trendChartStats.maxSales), labelVolume: trendChartStats.maxVolume },
      { ratio: 0.666, y: pTop + plotH * 0.334, labelSales: formatShortMoney(trendChartStats.maxSales * 0.666), labelVolume: Math.round(trendChartStats.maxVolume * 0.666) },
      { ratio: 0.333, y: pTop + plotH * 0.667, labelSales: formatShortMoney(trendChartStats.maxSales * 0.333), labelVolume: Math.round(trendChartStats.maxVolume * 0.333) },
      { ratio: 0.0, y: baselineY, labelSales: "฿0", labelVolume: 0 },
    ];
  }, [pTop, plotH, baselineY, trendChartStats.maxSales, trendChartStats.maxVolume]);

  const barW = Math.max(3, Math.min(22, (plotW / Math.max(1, trendBuckets.length)) * 0.55));
  const stepW = plotW / Math.max(1, trendBuckets.length);

  // 1. Shift Report calculations
  const shiftReportData = useMemo(() => {
    return closedShifts.filter(shift => {
      if (selectedBranch !== "all" && shift.branchId !== selectedBranch) return false;
      return true;
    });
  }, [closedShifts, selectedBranch]);

  // Shift orders list calculation for modal
  const shiftJobsList = useMemo(() => {
    if (!selectedShiftForOrders) return [];
    const shift = selectedShiftForOrders;
    const shiftOpenTime = new Date(shift.openedAt).getTime();
    const shiftCloseTime = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();

    const filtered = jobs.filter(job => {
      if (job.branchId !== shift.branchId) return false;
      if (job.shiftId === shift.id) return true;

      // Check payment logs in adminNotesJson
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          if (parsed && Array.isArray(parsed.payments)) {
            for (const pay of parsed.payments) {
              const payTime = new Date(pay.timestamp).getTime();
              if (payTime >= shiftOpenTime && payTime <= shiftCloseTime) {
                return true;
              }
            }
          }
        } catch (e) {}
      }

      // Legacy fallback check
      if (job.createdAt) {
        const jobTime = new Date(job.createdAt).getTime();
        if (jobTime >= shiftOpenTime && jobTime <= shiftCloseTime && job.createdBy === shift.userName && job.isPaid) {
          return true;
        }
      }

      return false;
    });

    if (shiftOrdersSearchQuery.trim()) {
      const q = shiftOrdersSearchQuery.toLowerCase();
      return filtered.filter(j => 
        j.id?.toLowerCase().includes(q) ||
        j.customerName?.toLowerCase().includes(q) ||
        j.customerPhone?.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [selectedShiftForOrders, jobs, shiftOrdersSearchQuery]);

  // 2. Order Report calculations
  const orderReportData = useMemo(() => {
    return filteredJobs.filter(job => {
      // Status filter
      if (orderStatusFilter !== "all" && job.status !== orderStatusFilter) {
        return false;
      }
      
      // Payment filter
      if (orderPaymentFilter !== "all") {
        if (orderPaymentFilter === "paid" && !job.isPaid) return false;
        if (orderPaymentFilter === "unpaid" && job.isPaid) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = job.id.toLowerCase().includes(query);
        const matchesName = job.customerName ? job.customerName.toLowerCase().includes(query) : false;
        const matchesPhone = job.customerPhone ? job.customerPhone.toLowerCase().includes(query) : false;
        return matchesId || matchesName || matchesPhone;
      }

      return true;
    });
  }, [filteredJobs, orderStatusFilter, orderPaymentFilter, searchQuery]);



  // 4. POS Report calculations (jobs linked to shifts or walk-in orders)
  const posReportData = useMemo(() => {
    const list = filteredJobs.filter(job => {
      const isPosOrder = 
        job.source === "pos" || 
        job.type === "in_store" || 
        Boolean(job.shiftId) || 
        job.pickupLocation === "POS Counter (Walk-in)" ||
        (typeof job.pickupLocation === "string" && (
          job.pickupLocation.toLowerCase().includes("pos") ||
          job.pickupLocation.toLowerCase().includes("walk-in") ||
          job.pickupLocation.includes("That Laundry Shop")
        ));
      
      if (!isPosOrder) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = job.id.toLowerCase().includes(query);
        const matchesName = job.customerName ? job.customerName.toLowerCase().includes(query) : false;
        const matchesPhone = job.customerPhone ? job.customerPhone.toLowerCase().includes(query) : false;
        const matchesProforma = (job as any).proformaNumber ? String((job as any).proformaNumber).toLowerCase().includes(query) : false;
        return matchesId || matchesName || matchesPhone || matchesProforma;
      }
      
      return true;
    });

    let posRevenue = 0;
    let posCount = 0;
    let cashPos = 0;
    let transferPos = 0;
    let cardPos = 0;
    let creditPos = 0;

    list.forEach(job => {
      posCount++;
      if (job.isPaid) {
        posRevenue += job.totalAmount || 0;
        
        const channel = (job.paymentChannel || "").toLowerCase();
        const method = (job.paymentMethod || "").toLowerCase();

        if (channel.includes("cash") || method.includes("cash")) {
          cashPos += job.totalAmount || 0;
        } else if (channel.includes("transfer") || method.includes("transfer")) {
          transferPos += job.totalAmount || 0;
        } else if (channel.includes("card") || method.includes("card")) {
          cardPos += job.totalAmount || 0;
        } else {
          creditPos += job.totalAmount || 0;
        }
      }
    });

    return {
      list,
      revenue: posRevenue,
      count: posCount,
      averageOrder: posCount > 0 ? posRevenue / posCount : 0,
      breakdown: {
        cash: cashPos,
        transfer: transferPos,
        card: cardPos,
        credit: creditPos
      }
    };
  }, [filteredJobs, searchQuery]);


  const handleExportExcel = () => {
    let csvContent = "\uFEFF"; // UTF-8 BOM for Thai character compatibility in Excel
    let filename = `report_${subTab}_${format(new Date(), "yyyyMMdd")}.csv`;

    if (subTab === "overview") {
      csvContent += "Overview Statistics\n";
      csvContent += `Branch,${selectedBranch === "all" ? "All Branches" : (shops.find(s => s.id === selectedBranch)?.name || selectedBranch)}\n`;
      csvContent += `Date Range,${dateRange}\n\n`;
      
      csvContent += "Metric,Value\n";
      csvContent += `Total Paid Revenue,฿${overviewStats.totalRevenue.toFixed(2)}\n`;
      csvContent += `Completed Orders,${overviewStats.completedCount}\n`;
      csvContent += `Pending Orders,${overviewStats.pendingCount}\n`;
      csvContent += `Cancelled Orders,${overviewStats.cancelledCount}\n`;
      csvContent += `Average Ticket,฿${overviewStats.averageTicket.toFixed(2)}\n\n`;

      csvContent += "Payment Channels,Revenue\n";
      csvContent += `Cash / COD,฿${overviewStats.paymentBreakdown.cash.toFixed(2)}\n`;
      csvContent += `Transfer,฿${overviewStats.paymentBreakdown.transfer.toFixed(2)}\n`;
      csvContent += `Credit Card,฿${overviewStats.paymentBreakdown.card.toFixed(2)}\n`;
      csvContent += `Deduct Member / Other,฿${overviewStats.paymentBreakdown.credit.toFixed(2)}\n\n`;

      csvContent += "Top Products,Qty Sold,Revenue\n";
      overviewStats.topProducts.forEach((prod: any) => {
        csvContent += `"${prod.name.replace(/"/g, '""')}",${prod.count},฿${prod.revenue.toFixed(2)}\n`;
      });

    } else if (subTab === "shift") {
      csvContent += "Closed Cashier Shifts Report\n\n";
      csvContent += "Shift ID,Cashier,Open Date,Close Date,Expected Cash,Actual Cash,Difference,Status\n";
      
      shiftReportData.forEach(shift => {
        const openStr = shift.openedAt ? format(new Date(shift.openedAt), "yyyy-MM-dd HH:mm:ss") : "";
        const closeStr = shift.closedAt ? format(new Date(shift.closedAt), "yyyy-MM-dd HH:mm:ss") : "";
        const expected = shift.expectedCash || 0;
        const actual = shift.actualCash || 0;
        const diff = actual - expected;
        csvContent += `"${shift.id}","${shift.userEmail || ""}","${openStr}","${closeStr}",${expected},${actual},${diff},"${shift.status}"\n`;
      });

    } else if (subTab === "order") {
      csvContent += "Order List Report\n\n";
      csvContent += "Order ID,Customer,Date,Status,Payment Channel,Paid Status,Delivery Fee,Total Amount,Source\n";
      
      orderReportData.forEach(job => {
        const dateStr = job.createdAt ? format(new Date(job.createdAt), "yyyy-MM-dd HH:mm:ss") : "";
        csvContent += `"${job.id}","${(job.customerName || "").replace(/"/g, '""')}","${dateStr}","${job.status}","${job.paymentChannel || ""}","${job.isPaid ? 'Paid' : 'Unpaid'}",${job.fee || 0},${job.totalAmount || 0},"${job.source || ""}"\n`;
      });

    } else if (subTab === "pos") {
      csvContent += "POS Sales Report\n\n";
      csvContent += "Order ID,Customer,Date,Status,Payment Channel,Paid Status,Total Amount\n";
      
      posReportData.list.forEach(job => {
        const dateStr = job.createdAt ? format(new Date(job.createdAt), "yyyy-MM-dd HH:mm:ss") : "";
        csvContent += `"${job.id}","${(job.customerName || "").replace(/"/g, '""')}","${dateStr}","${job.status}","${job.paymentChannel || ""}","${job.isPaid ? 'Paid' : 'Unpaid'}",${job.totalAmount || 0}\n`;
      });

    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeBranchName = useMemo(() => {
    if (selectedBranch === "all") return "All Branches";
    return shops.find(s => s.id === selectedBranch)?.name || "Selected Branch";
  }, [selectedBranch, shops]);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-900 font-sans">
      
      {/* Upper Title Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Reports & Analytics</h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">Live business performance metrics, transaction analytics, and sales summaries</p>
        </div>

        {/* Filter Toolbar Controls (Hidden when in Sales Summary, Sale Report, Receipts, or Taxes as they have dedicated toolbars) */}
        {subTab !== "sales-summary" && subTab !== "sale-report" && subTab !== "sales-by-item" && subTab !== "sales-by-category" && subTab !== "sales-by-employee" && subTab !== "sales-by-payment-type" && subTab !== "receipts" && subTab !== "taxes" && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Select */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-sm">
              <Store size={14} className="text-slate-400" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-6 select-none"
              >
                <option value="all">All Branches</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-sm">
              {(["today", "7days", "30days", "month", "custom"] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                    dateRange === range
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-750"
                  }`}
                >
                  {range === "7days" ? "7 Days" : range === "30days" ? "30 Days" : range}
                </button>
              ))}
            </div>

            {/* Custom Date Picker Inputs */}
            {dateRange === "custom" && (
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1 shadow-sm animate-in fade-in duration-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">From:</span>
                <input
                  type="date"
                  className="bg-transparent text-xs font-bold text-slate-750 dark:text-slate-200 outline-none cursor-pointer border-none p-0 focus:ring-0"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">To:</span>
                <input
                  type="date"
                  className="bg-transparent text-xs font-bold text-slate-750 dark:text-slate-200 outline-none cursor-pointer border-none p-0 focus:ring-0"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
                {(customStartDate || customEndDate) && (
                  <button
                    onClick={() => {
                      setCustomStartDate("");
                      setCustomEndDate("");
                    }}
                    className="text-[10px] text-rose-500 hover:text-rose-600 font-extrabold uppercase ml-1 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-250 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 text-xs font-bold text-emerald-700 dark:text-emerald-300 rounded-xl px-3 py-2 shadow-sm cursor-pointer transition-colors"
            >
              <Download size={14} className="text-emerald-500" />
              Export Excel
            </button>

            <button 
              onClick={() => {
                document.body.classList.add("printing-report");
                setTimeout(() => {
                  window.print();
                }, 50);
              }}
              className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-xl px-3 py-2 shadow-sm cursor-pointer transition-colors"
            >
              <Download size={14} className="text-slate-400" />
              {subTab === "overview" ? "Print Overview" :
               subTab === "shift" ? "Print Shift Report" :
               subTab === "order" ? "Print Order Report" :
               subTab === "pos" ? "Print POS Report" : "Print Report"}
            </button>
          </div>
        )}
      </div>

      {/* Sub-tab navigation bar */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-px overflow-x-auto scrollbar-hide shrink-0">
        <button
          onClick={() => setSubTab("overview")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "overview"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <BarChart2 size={14} />
          Overview Dashboard
        </button>

        <button
          onClick={() => setSubTab("sales-summary")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "sales-summary"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <TrendingUp size={14} />
          Sales summary
        </button>

        <button
          onClick={() => setSubTab("sale-report")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "sale-report" || subTab === "sales-by-item" || subTab === "sales-by-category" || subTab === "sales-by-employee" || subTab === "sales-by-payment-type"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <ShoppingBag size={14} />
          SALE REPORT
        </button>

        <button
          onClick={() => setSubTab("receipts")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "receipts"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <Receipt size={14} />
          Receipts
        </button>

        <button
          onClick={() => setSubTab("taxes")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "taxes"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <Percent size={14} />
          Taxes
        </button>

        <button
          onClick={() => setSubTab("shift")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "shift"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <History size={14} />
          Shift Report
        </button>

        <button
          onClick={() => setSubTab("order")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "order"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <ClipboardList size={14} />
          Order Report
        </button>

        <button
          onClick={() => setSubTab("pos")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "pos"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <Store size={14} />
          POS Report
        </button>
      </div>

      {/* RENDER ACTIVE SUBTAB CONTENT */}

      {/* 1. OVERVIEW DASHBOARD */}
      {subTab === "overview" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <DollarSign size={80} className="text-indigo-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Sales Revenue</span>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1.5">
                    ฿{overviewStats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-0.5">
                  <TrendingUp size={12} />
                  +14%
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-4.5 font-semibold font-sans">Active: {activeBranchName}</p>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <ShoppingBag size={80} className="text-indigo-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Completed Orders</span>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1.5">
                    {overviewStats.completedCount}
                  </h3>
                </div>
                <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center gap-0.5">
                  <ArrowUpRight size={12} />
                  Jobs
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-4.5 font-semibold">Pending completion: {overviewStats.pendingCount} bills</p>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Percent size={80} className="text-indigo-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Average Order Size</span>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1.5">
                    ฿{overviewStats.averageTicket.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold">
                  Value
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-4.5 font-semibold">Calculated from total paid receipts</p>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Users size={80} className="text-indigo-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Active CRM Users</span>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1.5">
                    {customers.length}
                  </h3>
                </div>
                <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold">
                  Users
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-4.5 font-semibold">Registered customer profiles</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sales Trend & Operations Volume Chart */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 lg:col-span-2 shadow-sm relative flex flex-col justify-between">
              {/* Header with Title, Stats & Metric Toggles */}
              <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                      Sales Trend & Operations Volume
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                      Real Data
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1 flex flex-wrap items-center gap-x-2">
                    <span>
                      ยอดขาย:{" "}
                      <span className="text-indigo-600 dark:text-indigo-400 font-mono font-black">
                        ฿{trendChartStats.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span>
                      จำนวนงาน:{" "}
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">
                        {trendChartStats.totalVolume.toLocaleString()} ออเดอร์
                      </span>
                    </span>
                    {trendChartStats.totalVolume > 0 && (
                      <>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span>
                          เฉลี่ย/บิล:{" "}
                          <span className="text-slate-700 dark:text-slate-200 font-mono font-bold">
                            ฿{trendChartStats.avgTicket.toFixed(2)}
                          </span>
                        </span>
                      </>
                    )}
                  </p>
                </div>

                {/* Metric Selector Buttons */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setTrendMetric("both")}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      trendMetric === "both"
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-black"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    รวม / Both
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendMetric("sales")}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                      trendMetric === "sales"
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-black"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                    ยอดขาย (Sales)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendMetric("volume")}
                    className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                      trendMetric === "volume"
                        ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-black"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    จำนวนงาน (Volume)
                  </button>
                </div>
              </div>

              {/* Chart Visual Area */}
              <div 
                className="w-full relative pt-1 select-none"
                onMouseLeave={() => setHoveredTrendIndex(null)}
              >
                {/* Floating Interactive Tooltip */}
                {hoveredTrendIndex !== null && trendPoints[hoveredTrendIndex] && (
                  <div
                    className="absolute pointer-events-none z-30 bg-slate-900/95 dark:bg-slate-900/95 text-white px-3 py-2 rounded-xl shadow-xl border border-slate-700/80 backdrop-blur-md text-xs transition-all duration-75"
                    style={{
                      left: `${(trendPoints[hoveredTrendIndex].x / chartW) * 100}%`,
                      top: "6px",
                      transform:
                        trendPoints[hoveredTrendIndex].x > 380
                          ? "translateX(-105%)"
                          : trendPoints[hoveredTrendIndex].x < 180
                          ? "translateX(5%)"
                          : "translateX(-50%)",
                    }}
                  >
                    <p className="font-bold text-[11px] text-slate-300 pb-1 border-b border-slate-700/60 mb-1.5 flex items-center justify-between gap-3">
                      <span>{trendPoints[hoveredTrendIndex].subLabel}</span>
                    </p>
                    <div className="space-y-1">
                      {(trendMetric === "both" || trendMetric === "sales") && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                            ยอดขาย (Sales):
                          </span>
                          <span className="font-mono font-black text-indigo-200">
                            ฿{trendPoints[hoveredTrendIndex].sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      {(trendMetric === "both" || trendMetric === "volume") && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            จำนวนงาน (Volume):
                          </span>
                          <span className="font-mono font-black text-emerald-200">
                            {trendPoints[hoveredTrendIndex].volume} ออเดอร์
                          </span>
                        </div>
                      )}
                      {trendPoints[hoveredTrendIndex].volume > 0 && (
                        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-700/50 text-[10px] text-slate-400">
                          <span>เฉลี่ยต่อบิล:</span>
                          <span className="font-mono font-semibold text-slate-300">
                            ฿{(trendPoints[hoveredTrendIndex].sales / trendPoints[hoveredTrendIndex].volume).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SVG Chart */}
                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto overflow-visible">
                  <defs>
                    <linearGradient id="salesTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Gridlines & Y-Axis Labels */}
                  {yTicks.map((tick, idx) => (
                    <g key={idx}>
                      <line
                        x1={pLeft}
                        y1={tick.y}
                        x2={pLeft + plotW}
                        y2={tick.y}
                        stroke={idx === yTicks.length - 1 ? "#cbd5e1" : "#f1f5f9"}
                        strokeWidth={idx === yTicks.length - 1 ? "1.5" : "1"}
                        className={idx === yTicks.length - 1 ? "dark:stroke-slate-700" : "dark:stroke-slate-800"}
                      />
                      {/* Left Y-axis (Sales ฿) */}
                      {(trendMetric === "both" || trendMetric === "sales") && (
                        <text
                          x={pLeft - 8}
                          y={tick.y + 3.5}
                          textAnchor="end"
                          className="fill-slate-400 dark:fill-slate-500 font-mono text-[9px] font-bold"
                        >
                          {tick.labelSales}
                        </text>
                      )}
                      {/* Right Y-axis (Volume Orders) */}
                      {(trendMetric === "both" || trendMetric === "volume") && (
                        <text
                          x={pLeft + plotW + 8}
                          y={tick.y + 3.5}
                          textAnchor="start"
                          className="fill-emerald-600/70 dark:fill-emerald-400/70 font-mono text-[9px] font-bold"
                        >
                          {tick.labelVolume}
                        </text>
                      )}
                    </g>
                  ))}

                  {/* Volume Bars (rendered in "both" or "volume" modes) */}
                  {(trendMetric === "both" || trendMetric === "volume") &&
                    trendPoints.map((p, i) => {
                      if (p.volume === 0) return null;
                      const isHovered = hoveredTrendIndex === i;
                      return (
                        <rect
                          key={`bar-${p.id}`}
                          x={p.x - barW / 2}
                          y={p.barY}
                          width={barW}
                          height={p.barHeight}
                          rx={Math.min(3, barW / 2)}
                          className={`transition-all duration-150 ${
                            isHovered
                              ? "fill-emerald-500 opacity-90"
                              : "fill-emerald-500/25 dark:fill-emerald-400/25 hover:fill-emerald-500/50"
                          }`}
                        />
                      );
                    })}

                  {/* Sales Area Gradient & Smooth Line (rendered in "both" or "sales" modes) */}
                  {(trendMetric === "both" || trendMetric === "sales") && salesAreaPath && (
                    <path d={salesAreaPath} fill="url(#salesTrendGradient)" />
                  )}
                  {(trendMetric === "both" || trendMetric === "sales") && salesPath && (
                    <path
                      d={salesPath}
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Data Points (dots) */}
                  {(trendMetric === "both" || trendMetric === "sales") &&
                    trendPoints.length <= 16 &&
                    trendPoints.map((p, i) => (
                      <circle
                        key={`dot-${p.id}`}
                        cx={p.x}
                        cy={p.ySales}
                        r={hoveredTrendIndex === i ? 5 : 3}
                        className={`transition-all ${
                          hoveredTrendIndex === i
                            ? "fill-indigo-600 stroke-white dark:stroke-slate-900 stroke-2"
                            : "fill-indigo-600 dark:fill-indigo-400"
                        }`}
                      />
                    ))}

                  {/* Active Hover Guideline & Point */}
                  {hoveredTrendIndex !== null && trendPoints[hoveredTrendIndex] && (
                    <g className="pointer-events-none">
                      <line
                        x1={trendPoints[hoveredTrendIndex].x}
                        x2={trendPoints[hoveredTrendIndex].x}
                        y1={pTop}
                        y2={baselineY}
                        stroke="#6366f1"
                        strokeWidth="1.5"
                        strokeDasharray="3,3"
                        className="opacity-70"
                      />
                      {(trendMetric === "both" || trendMetric === "sales") && (
                        <circle
                          cx={trendPoints[hoveredTrendIndex].x}
                          cy={trendPoints[hoveredTrendIndex].ySales}
                          r={6}
                          fill="#4f46e5"
                          stroke="#ffffff"
                          strokeWidth="2.5"
                        />
                      )}
                    </g>
                  )}

                  {/* X-Axis Tick Labels */}
                  {trendPoints.map((p, i) => {
                    const showLabel =
                      trendPoints.length <= 12 ||
                      (trendPoints.length <= 20 && (i % 2 === 0 || i === trendPoints.length - 1)) ||
                      (i % 5 === 0 || i === trendPoints.length - 1);
                    if (!showLabel) return null;
                    return (
                      <text
                        key={`lbl-${p.id}`}
                        x={p.x}
                        y={baselineY + 16}
                        textAnchor="middle"
                        className="fill-slate-400 dark:fill-slate-500 font-bold text-[9px]"
                      >
                        {p.label}
                      </text>
                    );
                  })}

                  {/* Invisible Hit Zones for Hover Tracking */}
                  {trendPoints.map((p, i) => (
                    <rect
                      key={`hit-${p.id}`}
                      x={p.x - stepW / 2}
                      y={pTop}
                      width={stepW}
                      height={plotH + pBottom}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredTrendIndex(i)}
                      onTouchStart={() => setHoveredTrendIndex(i)}
                    />
                  ))}
                </svg>

                {/* Empty State Overlay if 0 sales & 0 volume */}
                {trendChartStats.totalSales === 0 && trendChartStats.totalVolume === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
                    <div className="bg-slate-100/90 dark:bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold shadow-xs">
                      ไม่มีข้อมูลออเดอร์ในช่วงเวลาที่เลือก (No order data in this timeframe)
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">Payment Channels share</h3>
              <div className="mt-6 space-y-4 text-xs font-bold">
                <div>
                  <div className="flex justify-between text-slate-500 mb-1.5">
                    <span>Cash / เงินสด</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{overviewStats.paymentBreakdown.cash.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${overviewStats.totalRevenue > 0 ? (overviewStats.paymentBreakdown.cash / overviewStats.totalRevenue) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-slate-500 mb-1.5">
                    <span>Transfer / โอนเงิน</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{overviewStats.paymentBreakdown.transfer.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${overviewStats.totalRevenue > 0 ? (overviewStats.paymentBreakdown.transfer / overviewStats.totalRevenue) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-slate-500 mb-1.5">
                    <span>Credit Card / บัตรเครดิต</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{overviewStats.paymentBreakdown.card.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-sky-500 h-full rounded-full" style={{ width: `${overviewStats.totalRevenue > 0 ? (overviewStats.paymentBreakdown.card / overviewStats.totalRevenue) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-slate-500 mb-1.5">
                    <span>Wallet Credit / ตัดกระเป๋า</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{overviewStats.paymentBreakdown.credit.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${overviewStats.totalRevenue > 0 ? (overviewStats.paymentBreakdown.credit / overviewStats.totalRevenue) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide mb-4">Top-Selling Products</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-semibold text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black">
                    <th className="pb-3">Product Name</th>
                    <th className="pb-3 text-center">Units Sold</th>
                    <th className="pb-3 text-right">Revenue Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {overviewStats.topProducts.map((p, idx) => (
                    <tr key={idx}>
                      <td className="py-3 flex items-center gap-2">
                        <span className="w-5 h-5 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center font-black text-[10px]">#{idx + 1}</span>
                        {p.name}
                      </td>
                      <td className="py-3 text-center font-bold">
                        {p.count.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-right text-indigo-600 dark:text-indigo-400 font-black">
                        ฿{p.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 2. SALES SUMMARY (Loyverse style) */}
      {subTab === "sales-summary" && (
        <ReportsSalesSummary
          jobs={jobs}
          selectedBranch={selectedBranch}
          onViewJob={onViewJob}
        />
      )}

      {/* 2.1 SALE REPORT (Merged: Item, Category, Employee, Payment Type) */}
      {(subTab === "sale-report" || subTab === "sales-by-item" || subTab === "sales-by-category" || subTab === "sales-by-employee" || subTab === "sales-by-payment-type") && (
        <div className="space-y-4">
          {/* Sub-navigation bar inside Sale Report */}
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl w-fit shadow-xs">
            <button
              onClick={() => {
                setSubTab("sale-report");
                setSaleReportSubTab("item");
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                (subTab === "sale-report" && saleReportSubTab === "item") || subTab === "sales-by-item"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750"
              }`}
            >
              <ShoppingBag size={14} />
              Sale by Item
            </button>

            <button
              onClick={() => {
                setSubTab("sale-report");
                setSaleReportSubTab("category");
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                (subTab === "sale-report" && saleReportSubTab === "category") || subTab === "sales-by-category"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750"
              }`}
            >
              <LayoutGrid size={14} />
              Category
            </button>

            <button
              onClick={() => {
                setSubTab("sale-report");
                setSaleReportSubTab("employee");
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                (subTab === "sale-report" && saleReportSubTab === "employee") || subTab === "sales-by-employee"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750"
              }`}
            >
              <User size={14} />
              Employee
            </button>

            <button
              onClick={() => {
                setSubTab("sale-report");
                setSaleReportSubTab("payment-type");
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                (subTab === "sale-report" && saleReportSubTab === "payment-type") || subTab === "sales-by-payment-type"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750"
              }`}
            >
              <CreditCard size={14} />
              Payment Type
            </button>
          </div>

          {/* Sub-view Content */}
          {((subTab === "sale-report" && saleReportSubTab === "item") || subTab === "sales-by-item") && (
            <ReportsSalesByItem
              jobs={jobs}
              selectedBranch={selectedBranch}
              onViewJob={onViewJob}
            />
          )}

          {((subTab === "sale-report" && saleReportSubTab === "category") || subTab === "sales-by-category") && (
            <ReportsSalesByCategory
              jobs={jobs}
              selectedBranch={selectedBranch}
              onViewJob={onViewJob}
            />
          )}

          {((subTab === "sale-report" && saleReportSubTab === "employee") || subTab === "sales-by-employee") && (
            <ReportsSalesByEmployee
              jobs={jobs}
              selectedBranch={selectedBranch}
              onViewJob={onViewJob}
            />
          )}

          {((subTab === "sale-report" && saleReportSubTab === "payment-type") || subTab === "sales-by-payment-type") && (
            <ReportsSalesByPaymentType
              jobs={jobs}
              selectedBranch={selectedBranch}
              onViewJob={onViewJob}
            />
          )}
        </div>
      )}

      {/* 2.5 RECEIPTS (Loyverse style) */}
      {subTab === "receipts" && (
        <ReportsReceipts
          jobs={jobs}
          selectedBranch={selectedBranch}
          onViewJob={(job) => {
            if (onViewJob) onViewJob(job);
            else setSelectedJobForDetails(job);
          }}
        />
      )}

      {/* 2.6 TAXES (Loyverse style) */}
      {subTab === "taxes" && (
        <ReportsTaxes
          jobs={jobs}
          selectedBranch={selectedBranch}
          onViewJob={onViewJob}
        />
      )}

      {/* 3. SHIFT REPORT */}
      {subTab === "shift" && (
        <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">Cashier Drawer Shift History</h3>
          </div>

          {isLoadingShifts ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="animate-spin text-indigo-600" />
              <span className="text-xs text-slate-500">Loading cashier shifts...</span>
            </div>
          ) : shiftReportData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-semibold text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black">
                    <th className="pb-3">Shift ID</th>
                    <th className="pb-3">Branch</th>
                    <th className="pb-3">Cashier</th>
                    <th className="pb-3 text-center">Open Time</th>
                    <th className="pb-3 text-center">Close Time</th>
                    <th className="pb-3 text-center">Orders</th>
                    <th className="pb-3 text-right">Start Float</th>
                    <th className="pb-3 text-right">Expected Drawer</th>
                    <th className="pb-3 text-right">Actual Drawer</th>
                    <th className="pb-3 text-right">Variance</th>
                    <th className="pb-3 text-right pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {shiftReportData.map((shift) => {
                    const variance = (shift.actualCash || 0) - shift.expectedCash;
                    const branchName = shops.find(s => s.id === shift.branchId)?.name || shift.branchId;
                    return (
                      <tr key={shift.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-3 font-mono text-[10px] text-slate-400">{shift.id.slice(-8).toUpperCase()}</td>
                        <td className="py-3">{branchName}</td>
                        <td className="py-3 font-bold text-slate-800 dark:text-slate-100">{shift.userName}</td>
                        <td className="py-3 text-center text-slate-400">{format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm")}</td>
                        <td className="py-3 text-center text-slate-400">{shift.closedAt ? format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm") : "-"}</td>
                        <td className="py-3 text-center font-bold text-slate-800 dark:text-slate-200">
                          <button
                            onClick={() => {
                              setSelectedShiftForOrders(shift);
                              setSelectedJobForDetails(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-400 font-bold transition-all cursor-pointer border border-indigo-200/60 dark:border-indigo-800/40 shadow-xs"
                          >
                            <Eye size={12} />
                            <span>{shift.totalOrders || 0} ออเดอร์</span>
                            <span className="text-[9.5px] opacity-80 font-medium whitespace-nowrap hidden lg:inline">(💵{shift.cashOrders || 0} | 📱{shift.transferOrders || 0} | 💳{shift.cardOrders || 0} | 👑{shift.creditOrders || 0})</span>
                          </button>
                        </td>
                        <td className="py-3 text-right">฿{shift.startingCash.toLocaleString()}</td>
                        <td className="py-3 text-right">฿{shift.expectedCash.toLocaleString()}</td>
                        <td className="py-3 text-right font-bold text-slate-800 dark:text-slate-100">฿{(shift.actualCash || 0).toLocaleString()}</td>
                        <td className={`py-3 text-right font-black ${variance === 0 ? "text-emerald-600" : variance > 0 ? "text-blue-500" : "text-rose-600"}`}>
                          {variance === 0 ? "฿0.00" : `${variance > 0 ? "+" : ""}฿${variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        </td>
                        <td className="py-3 text-right pr-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedShiftForOrders(shift);
                              setSelectedJobForDetails(null);
                            }}
                            className="h-7 px-2.5 text-[11px] font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-400 dark:hover:bg-indigo-950/40 rounded-lg cursor-pointer transition-colors shadow-xs"
                          >
                            <Eye size={12} className="mr-1" />
                            ดูรายการออเดอร์
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 font-semibold">No closed shifts found.</div>
          )}
        </div>
      )}

      {/* 3. ORDER REPORT */}
      {subTab === "order" && (
        <div className="space-y-4">
          {/* Order Specific Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white dark:bg-slate-850 p-4 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Search ID/Customer</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="Search by ID or customer..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Order Status</label>
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="billing">Billing</option>
                <option value="wash">Wash</option>
                <option value="dry">Dry</option>
                <option value="iron">Iron</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancel">Cancelled</option>
                <option value="topup">Topup Member</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Payment Status</label>
              <select
                value={orderPaymentFilter}
                onChange={(e) => setOrderPaymentFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
              >
                <option value="all">All Payments</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide mb-4">Detailed Jobs List</h3>
            {orderReportData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-semibold text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black">
                      <th className="pb-3">Job ID</th>
                      <th className="pb-3">Customer</th>
                      <th className="pb-3">Branch</th>
                      <th className="pb-3 text-center">Date</th>
                      <th className="pb-3 text-right">Total Amount</th>
                      <th className="pb-3 text-center">Payment Status</th>
                      <th className="pb-3 text-center">Job Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {orderReportData.map((job) => {
                      const branchName = shops.find(s => s.id === job.branchId)?.name || job.branchId || "-";
                      return (
                        <tr key={job.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-3 font-mono text-[10px] text-slate-400">{job.id.slice(-8).toUpperCase()}</td>
                          <td className="py-3">
                            <div>
                              <p className="font-bold text-slate-850 dark:text-slate-100 leading-none">{job.customerName || "Walk-In"}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{job.customerPhone || "-"}</p>
                            </div>
                          </td>
                          <td className="py-3">{branchName}</td>
                          <td className="py-3 text-center text-slate-400">{job.createdAt ? format(new Date(job.createdAt), "dd/MM/yyyy HH:mm") : "-"}</td>
                          <td className="py-3 text-right text-indigo-650 dark:text-indigo-400 font-black">฿{(job.totalAmount || 0).toFixed(2)}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${job.isPaid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                              {job.isPaid ? "Paid" : "Unpaid"}
                            </span>
                          </td>
                           <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              job.status === "completed" 
                                ? "bg-emerald-100 text-emerald-800" 
                                : job.status === "cancel" 
                                ? "bg-slate-100 text-slate-800" 
                                : job.status === "topup"
                                ? "bg-indigo-100 text-indigo-750 border border-indigo-200"
                                : "bg-indigo-100 text-indigo-800"
                            }`}>
                              {job.status === "topup" ? "TOPUP MEMBER" : job.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 font-semibold">No orders matching current filter criteria.</div>
            )}
          </div>
        </div>
      )}



      {/* 5. POS REPORT */}
      {subTab === "pos" && (
        <div className="space-y-6">
          {/* POS Dashboard KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">POS Sales Volume</span>
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                ฿{posReportData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-[9px] text-slate-400 font-semibold mt-2">Active: {activeBranchName}</p>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">POS Sales Count</span>
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                {posReportData.count} bills
              </h3>
              <p className="text-[9px] text-slate-400 font-semibold mt-2">Counter transaction tickets</p>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">POS Average Ticket</span>
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                ฿{posReportData.averageOrder.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-[9px] text-slate-400 font-semibold mt-2">Average walk-in customer spend</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* POS Sales list (2/3 width) */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 lg:col-span-2 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">POS Receipts History</h3>
                <div className="relative w-44">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                  <input
                    type="text"
                    placeholder="Search POS..."
                    className="w-full pl-7 pr-3 py-1 text-xs bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {posReportData.list.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-semibold text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black">
                        <th className="pb-3">Order / Bill ID</th>
                        <th className="pb-3">Customer</th>
                        <th className="pb-3 text-center">Date / Time</th>
                        <th className="pb-3 text-right">Amount</th>
                        <th className="pb-3 text-center">Payment</th>
                        <th className="pb-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                      {posReportData.list.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 font-mono text-[11px]">
                            {onViewJob ? (
                              <button
                                type="button"
                                onClick={() => onViewJob(job)}
                                className="font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline underline-offset-2 cursor-pointer text-left"
                              >
                                {job.id}
                              </button>
                            ) : (
                              <span className="font-bold text-slate-700 dark:text-slate-300">{job.id}</span>
                            )}
                            {(job as any).proformaNumber && (
                              <span className="block text-[9px] text-slate-400 font-mono mt-0.5">
                                {(job as any).proformaNumber}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <p className="font-bold text-slate-850 dark:text-slate-100 leading-none">{job.customerName || "Walk-In"}</p>
                            {job.customerPhone && job.customerPhone !== "-" && (
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{job.customerPhone}</p>
                            )}
                          </td>
                          <td className="py-2.5 text-center text-slate-400 font-mono text-[10px]">
                            {job.createdAt ? format(new Date(job.createdAt), "dd/MM/yy HH:mm") : "-"}
                          </td>
                          <td className="py-2.5 text-right font-black text-slate-850 dark:text-slate-100 font-mono">
                            ฿{(job.totalAmount || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">
                                {(() => {
                                  const ch = job.paymentChannel || job.paymentMethod || "CASH";
                                  if (ch.toLowerCase() === "credit") return "Deduct Member";
                                  if (ch.toLowerCase() === "card") return "Credit Card";
                                  return ch;
                                })()}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                                job.isPaid
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              }`}>
                                {job.isPaid ? "Paid" : "Unpaid"}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              job.status === "completed" 
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" 
                                : job.status === "cancel" 
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300" 
                                : "bg-indigo-100 text-indigo-850 dark:bg-indigo-950/60 dark:text-indigo-300"
                            }`}>
                              {job.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 font-semibold">No POS Counter sales recorded.</div>
              )}
            </div>

            {/* POS Revenue Breakdown (1/3 width) */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">POS Sales channels</h3>
              
              <div className="space-y-4 text-xs font-bold pt-2">
                <div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Cash Sales:</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{posReportData.breakdown.cash.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{ width: `${posReportData.revenue > 0 ? (posReportData.breakdown.cash / posReportData.revenue) * 100 : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Transfer QR Sales:</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{posReportData.breakdown.transfer.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full" style={{ width: `${posReportData.revenue > 0 ? (posReportData.breakdown.transfer / posReportData.revenue) * 100 : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Card POS Terminal:</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{posReportData.breakdown.card.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-sky-500 h-full" style={{ width: `${posReportData.revenue > 0 ? (posReportData.breakdown.card / posReportData.revenue) * 100 : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Member Credit Usage:</span>
                    <span className="text-slate-800 dark:text-slate-200">฿{posReportData.breakdown.credit.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full" style={{ width: `${posReportData.revenue > 0 ? (posReportData.breakdown.credit / posReportData.revenue) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* SHIFT ORDERS & READ-ONLY JOB DETAILS DIALOG */}
      <Dialog 
        open={!!selectedShiftForOrders} 
        onOpenChange={(open) => {
          if (!open) {
            setSelectedShiftForOrders(null);
            setSelectedJobForDetails(null);
            setShiftOrdersSearchQuery("");
          }
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw] p-0 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col z-[9999]">
          {/* Header */}
          <DialogHeader className="p-4 bg-white dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 shrink-0 flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {selectedJobForDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedJobForDetails(null)}
                  className="h-8 px-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft size={14} />
                  ย้อนกลับ
                </Button>
              )}
              <div>
                <DialogTitle className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Package className="text-indigo-600" size={18} />
                  {selectedJobForDetails ? (
                    <span>รายละเอียดใบงาน #{selectedJobForDetails.id.split('-')[0].toUpperCase()}</span>
                  ) : (
                    <span>รายการออเดอร์ในรอบกะ #{selectedShiftForOrders?.id.slice(-8).toUpperCase()}</span>
                  )}
                </DialogTitle>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                  {selectedJobForDetails ? (
                    <span className="flex items-center gap-2">
                      <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200/50 flex items-center gap-1">
                        <Lock size={11} /> โหมดดูอย่างเดียว (Read-Only)
                      </span>
                      • สาขา: {shops.find(s => s.id === selectedJobForDetails.branchId)?.name || selectedJobForDetails.branchId}
                    </span>
                  ) : (
                    <span>
                      พนักงาน: <strong className="text-slate-700 dark:text-slate-200">{selectedShiftForOrders?.userName}</strong> • 
                      สาขา: <strong className="text-slate-700 dark:text-slate-200">{shops.find(s => s.id === selectedShiftForOrders?.branchId)?.name}</strong> • 
                      เวลาเปิด: {selectedShiftForOrders?.openedAt ? format(new Date(selectedShiftForOrders.openedAt), "dd/MM/yyyy HH:mm") : "-"}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Body Content */}
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            {!selectedJobForDetails ? (
              /* STATE 1: Shift Orders List */
              <>
                {/* Top Info Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white dark:bg-slate-850 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs font-semibold">
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">จำนวนออเดอร์ในกะ</span>
                    <span className="text-slate-800 dark:text-slate-100 font-black text-base mt-0.5">{shiftJobsList.length} ออเดอร์</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">เงินทอนเริ่มต้น</span>
                    <span className="text-slate-800 dark:text-slate-100 font-bold mt-0.5">฿{(selectedShiftForOrders?.startingCash || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">เงินสดลิ้นชักคาดการณ์</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-black text-base mt-0.5">฿{(selectedShiftForOrders?.expectedCash || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">เงินสดนับได้จริง</span>
                    <span className="text-slate-800 dark:text-slate-100 font-bold mt-0.5">฿{(selectedShiftForOrders?.actualCash || 0).toLocaleString()}</span>
                  </div>
                </div>

                {/* Search & Filter */}
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ค้นหารหัสใบงาน / ชื่อลูกค้า / เบอร์โทร..."
                      value={shiftOrdersSearchQuery}
                      onChange={(e) => setShiftOrdersSearchQuery(e.target.value)}
                      className="w-full bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>
                </div>

                {/* Orders Table */}
                {shiftJobsList.length > 0 ? (
                  <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-semibold text-left">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black bg-slate-50/50 dark:bg-slate-900/50">
                            <th className="py-3 px-4">Order ID</th>
                            <th className="py-3 px-3">ลูกค้า (Customer)</th>
                            <th className="py-3 px-3">เวลาทำรายการ</th>
                            <th className="py-3 px-3">รายการบริการ</th>
                            <th className="py-3 px-3 text-right">ยอดเงินรวม</th>
                            <th className="py-3 px-3 text-center">ชำระเงิน</th>
                            <th className="py-3 px-3 text-center">สถานะชำระ</th>
                            <th className="py-3 px-4 text-right">แอ็กชัน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                          {shiftJobsList.map((job) => {
                            const dateStr = job.createdAt ? format(new Date(job.createdAt), "dd/MM/yyyy HH:mm") : "-";
                            const itemsSummary = Array.isArray(job.items) 
                              ? job.items.map((i: any) => `${i.name || i.serviceName} x${i.quantity || i.qty || 1}`).join(", ")
                              : "-";
                            
                            return (
                              <tr key={job.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="py-3 px-4 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-100">
                                  #{job.id.split('-')[0].toUpperCase()}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-800 dark:text-slate-100">{job.customerName || "ลูกค้าทั่วไป"}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">{job.customerPhone || "-"}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-slate-400 text-[11px]">{dateStr}</td>
                                <td className="py-3 px-3 max-w-[200px] truncate text-[11px] text-slate-600 dark:text-slate-300" title={itemsSummary}>
                                  {itemsSummary}
                                </td>
                                <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-slate-100">
                                  ฿{(job.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                                    {job.paymentChannel || job.paymentMethod || "Cash"}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                    job.isPaid 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50" 
                                      : "bg-amber-50 text-amber-700 border border-amber-200/50"
                                  }`}>
                                    {job.isPaid ? "Paid" : "Unpaid"}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <Button
                                    size="sm"
                                    onClick={() => setSelectedJobForDetails(job)}
                                    className="h-7 px-2.5 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer flex items-center gap-1 ml-auto shadow-sm"
                                  >
                                    <Eye size={12} />
                                    ดูรายละเอียด
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-850 p-8 rounded-xl border border-slate-200/60 dark:border-slate-800 text-center text-slate-400 font-semibold text-xs">
                    ไม่พบรายการออเดอร์ในรอบกะนี้
                  </div>
                )}
              </>
            ) : (
              /* STATE 2: Read-Only Job Details View */
              <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 p-3 rounded-xl flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Lock size={16} className="text-amber-600 shrink-0" />
                    <span>โหมดดูรายละเอียดใบงานแบบอ่านอย่างเดียว (Read-Only) — เพื่อป้องกันข้อมูลการขายย้อนหลังถูกแก้ไข</span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    {selectedJobForDetails.isPaid ? "ชำระเงินเรียบร้อย" : "ยังไม่ชำระเงิน"}
                  </span>
                </div>

                {/* Customer & Order Metadata Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-2 text-xs">
                    <h4 className="font-black text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                      <User size={14} /> ข้อมูลลูกค้า (Customer Info)
                    </h4>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400">ชื่อลูกค้า:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{selectedJobForDetails.customerName || "ลูกค้าทั่วไป"}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400">เบอร์โทรศัพท์:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 font-mono">{selectedJobForDetails.customerPhone || "-"}</span>
                    </div>
                    {selectedJobForDetails.customerAddress && (
                      <div className="flex justify-between py-1">
                        <span className="text-slate-400">ที่อยู่จัดส่ง:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 text-right max-w-[220px]">{selectedJobForDetails.customerAddress}</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-2 text-xs">
                    <h4 className="font-black text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                      <FileText size={14} /> ข้อมูลใบงาน (Order Info)
                    </h4>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400">รหัสใบงาน (Order ID):</span>
                      <span className="font-bold font-mono text-slate-800 dark:text-slate-100">#{selectedJobForDetails.id}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400">วันเวลาสร้างรายการ:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {selectedJobForDetails.createdAt ? format(new Date(selectedJobForDetails.createdAt), "dd/MM/yyyy HH:mm น.") : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">พนักงานผู้สร้าง/แคชเชียร์:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{selectedJobForDetails.createdBy || "-"}</span>
                    </div>
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <div className="bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-3">
                  <h4 className="font-black text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                    <ShoppingBag size={14} /> รายการสินค้า / บริการในออเดอร์
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-semibold text-left">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black">
                          <th className="pb-2">ชื่อรายการ</th>
                          <th className="pb-2 text-right">ราคา/หน่วย</th>
                          <th className="pb-2 text-center">จำนวน</th>
                          <th className="pb-2 text-right">รวมเงิน (฿)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                        {Array.isArray(selectedJobForDetails.items) && selectedJobForDetails.items.map((item: any, idx: number) => {
                          const qty = item.quantity || item.qty || 1;
                          const price = item.price || item.unitPrice || 0;
                          const total = item.totalPrice || (price * qty);
                          return (
                            <tr key={idx}>
                              <td className="py-2.5 font-bold text-slate-800 dark:text-slate-100">
                                {item.name || item.serviceName || "บริการซักอบรีด"}
                              </td>
                              <td className="py-2.5 text-right text-slate-500">฿{price.toLocaleString()}</td>
                              <td className="py-2.5 text-center font-bold">{qty} {item.unit || "ชิ้น"}</td>
                              <td className="py-2.5 text-right font-black text-slate-900 dark:text-slate-100">฿{total.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Summary Box */}
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col items-end space-y-1.5 text-xs font-bold">
                    <div className="flex justify-between w-full max-w-xs text-slate-500">
                      <span>ยอดรวมสินค้า/บริการ:</span>
                      <span>฿{(selectedJobForDetails.subtotal || selectedJobForDetails.totalAmount || 0).toLocaleString()}</span>
                    </div>
                    {selectedJobForDetails.discount > 0 && (
                      <div className="flex justify-between w-full max-w-xs text-rose-600">
                        <span>ส่วนลด (Discount):</span>
                        <span>-฿{selectedJobForDetails.discount.toLocaleString()}</span>
                      </div>
                    )}
                    {selectedJobForDetails.deliveryFee > 0 && (
                      <div className="flex justify-between w-full max-w-xs text-slate-600 dark:text-slate-300">
                        <span>ค่าบริการรับส่ง:</span>
                        <span>+฿{selectedJobForDetails.deliveryFee.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between w-full max-w-xs text-base font-black text-indigo-600 dark:text-indigo-400 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                      <span>ยอดสุทธิ (Grand Total):</span>
                      <span>฿{(selectedJobForDetails.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Notes if any */}
                {selectedJobForDetails.notes && (
                  <div className="bg-slate-100 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs">
                    <span className="font-bold text-slate-500 block mb-0.5">หมายเหตุเพิ่มเติม:</span>
                    <p className="text-slate-700 dark:text-slate-200 italic">{selectedJobForDetails.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="p-3 bg-white dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-semibold">
              {selectedJobForDetails ? "กดปุ่มย้อนกลับเพื่อดูรายการออเดอร์อื่นในกะนี้" : `แสดงผล ${shiftJobsList.length} รายการออเดอร์`}
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedShiftForOrders(null);
                setSelectedJobForDetails(null);
                setShiftOrdersSearchQuery("");
              }}
              className="h-8 px-4 text-xs font-bold rounded-xl cursor-pointer"
            >
              ปิด (Close)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
