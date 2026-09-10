"use client";

import { useState, useMemo, useEffect } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { useRiders } from "@/lib/use-riders";
import { shopStore, jobStore, calculateFee } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  DollarSign, 
  ShoppingBag, 
  Users, 
  Store,
  Download, 
  ClipboardList, 
  Search, 
  Package, 
  Printer, 
  Tag, 
  Gift, 
  Truck,
  Eye,
  ArrowLeft,
  Lock,
  Megaphone
} from "lucide-react";
import { printImageUrl } from "@/components/ui/multi-image-uploader";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface AdminMarketingProps {
  onViewJob?: (job: any) => void;
}

export function AdminMarketing({ onViewJob }: AdminMarketingProps) {
  const jobs = useJobs();
  const customers = useCustomers();
  const riders = useRiders();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // Sub-tabs state (extensible for future marketing tools)
  const [subTab, setSubTab] = useState<"promo">("promo");

  // Filters State
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "month" | "custom">("30days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Promo Report states
  const [promoStatusFilter, setPromoStatusFilter] = useState<"all" | "paid" | "unpaid">("paid");
  const [promoTypeFilter, setPromoTypeFilter] = useState<string>("all");
  const [promoCodeFilter, setPromoCodeFilter] = useState<string>("all");
  const [promoSearchQuery, setPromoSearchQuery] = useState<string>("");

  // Job view details modal
  const [selectedJobForView, setSelectedJobForView] = useState<any | null>(null);

  // Fetch historical jobs when date range expands beyond 30 days
  useEffect(() => {
    const today = new Date();
    let start: Date;
    let end: Date = endOfDay(today);

    if (dateRange === "today") {
      start = startOfDay(today);
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
        start = startOfDay(subDays(today, 30));
      }
      if (customEndDate) {
        end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
      }
    } else {
      start = startOfDay(subDays(today, 30));
    }

    jobStore.fetchHistoricalJobs(start, end).catch(err => {
      console.error("Failed to load historical jobs for marketing:", err);
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

  // Promo Code Report calculations
  const promoReportData = useMemo(() => {
    // 1. Filter jobs that contain 'Promo:' in remark and not cancelled
    const promoJobs = filteredJobs.filter(job => {
      if (job.status === "cancel") return false;
      if (!job.remark || !/Promo:/i.test(job.remark)) return false;

      // Ensure the job actually received an applied promo discount or legacy free delivery
      const match = job.remark.match(/Promo:\s*([^\s(|]+)(?:\s*\((ALL|DELIVERY):([\d.]+)\))?/i);
      if (!match) return false;

      const code = match[1]?.trim().toUpperCase();
      const explicitDiscount = match[3] ? parseFloat(match[3]) : 0;
      const fee = Number(job.fee) || 0;

      // Case A: Explicit discount syntax, e.g. Promo: CODE (DELIVERY:50) -> must have discount > 0
      if (match[3]) {
        if (explicitDiscount <= 0) return false;
      } else {
        // Case B: Legacy syntax without (TARGET:AMOUNT), e.g. Promo: FREEDELIVERY
        // Only accept if code is FREEDELIVERY and fee was 0 (free delivery).
        // Any other plain promo text (e.g. Promo: TEST) where discount was not applied (ยอดไม่ถึง) must be excluded.
        if (code !== "FREEDELIVERY" || fee > 0) return false;
      }

      return true;
    });

    // Lookup map for customers
    const customerMap = new Map<string, any>();
    customers.forEach(c => {
      if (c.id) customerMap.set(c.id, c);
      if (c.phone) customerMap.set(c.phone, c);
    });

    // Lookup map for riders
    const riderMap = new Map<string, any>();
    riders.forEach(r => {
      if (r.id) riderMap.set(r.id, r);
    });

    // Parse jobs
    const allParsedJobs = promoJobs.map(job => {
      const match = job.remark?.match(/Promo:\s*([^\s(|]+)(?:\s*\((ALL|DELIVERY):([\d.]+)\))?/i);
      const code = (match && match[1]) ? match[1].trim().toUpperCase() : "UNKNOWN";
      const campaignType = (match && match[2]) ? (match[2].toUpperCase() as "ALL" | "DELIVERY") : "DELIVERY";

      let discountAmount = match && match[3] ? parseFloat(match[3]) : 0;
      let isEstimated = false;

      const fee = Number(job.fee) || 0;
      const totalAmount = Number(job.totalAmount) || 0;
      const distance = Number(job.distance) || 0;

      // If no explicit discount amount in remark:
      if (!match || !match[3]) {
        if (fee === 0) {
          const estimated = calculateFee(distance);
          discountAmount = estimated;
          isEstimated = true;
        } else {
          discountAmount = 0;
        }
      }

      const originalFee = isEstimated ? discountAmount : (fee + discountAmount);
      const netFee = fee;
      const laundryAmount = Math.max(0, totalAmount - fee);

      const pickupComm = Number(job.pickupCommission) || 0;
      const deliveryComm = Number(job.deliveryCommission) || 0;
      const totalRiderComm = pickupComm + deliveryComm;

      // Net Margin = Laundry Sales + Net Fee - Rider Commission
      const netMargin = laundryAmount + netFee - totalRiderComm;

      // Customer info & badges
      const customer = (job.customerId && customerMap.get(job.customerId)) || (job.customerPhone && customerMap.get(job.customerPhone));
      const isNewCustomer = customer ? customer.isNew === true : false;
      const isVIP = customer ? customer.isVIP === true : false;
      const isMember = customer ? (customer.isMember === true || !!customer.memberId) : false;

      const customerBadges: ("NEW" | "VIP" | "MEMBER")[] = [];
      if (isNewCustomer) customerBadges.push("NEW");
      if (isVIP) customerBadges.push("VIP");
      if (isMember) customerBadges.push("MEMBER");

      // Rider names
      const pickupRider = job.pickupRiderId ? riderMap.get(job.pickupRiderId) : null;
      const deliveryRider = job.deliveryRiderId ? riderMap.get(job.deliveryRiderId) : null;
      const pickupRiderName = pickupRider?.nickname || pickupRider?.name || (job.pickupRiderId ? `Rider #${job.pickupRiderId.slice(-4)}` : "-");
      const deliveryRiderName = deliveryRider?.nickname || deliveryRider?.name || (job.deliveryRiderId ? `Rider #${job.deliveryRiderId.slice(-4)}` : "-");

      const dateObj = job.createdAt ? new Date(job.createdAt) : new Date();

      return {
        job,
        jobId: job.id,
        date: dateObj,
        dateStr: job.createdAt ? format(dateObj, "dd/MM/yyyy HH:mm") : "-",
        customerName: job.customerName || "Walk-In",
        customerPhone: job.customerPhone || "-",
        customerId: job.customerId,
        isNewCustomer,
        customerBadges,
        distance,
        laundryAmount,
        originalFee,
        promoCode: code,
        campaignType,
        discountAmount,
        netFee,
        billTotal: totalAmount,
        pickupCommission: pickupComm,
        deliveryCommission: deliveryComm,
        totalRiderComm,
        pickupRiderName,
        deliveryRiderName,
        netMargin,
        isPaid: !!job.isPaid,
        paymentChannel: job.paymentChannel || job.paymentMethod || "-",
        isEstimated
      };
    });

    // Unique promo codes list
    const availableCodes = Array.from(new Set(allParsedJobs.map(j => j.promoCode))).sort();

    // Filter by tab filter controls
    const filteredOrderList = allParsedJobs.filter(item => {
      if (promoStatusFilter === "paid" && !item.isPaid) return false;
      if (promoStatusFilter === "unpaid" && item.isPaid) return false;

      if (promoTypeFilter !== "all" && item.campaignType !== promoTypeFilter) return false;

      if (promoCodeFilter !== "all" && item.promoCode !== promoCodeFilter) return false;

      if (promoSearchQuery.trim()) {
        const q = promoSearchQuery.toLowerCase().trim();
        const matchCode = item.promoCode.toLowerCase().includes(q);
        const matchName = item.customerName.toLowerCase().includes(q);
        const matchPhone = item.customerPhone.includes(q);
        const matchJobId = item.jobId.toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchPhone && !matchJobId) return false;
      }

      return true;
    });

    // Compute Executive KPIs
    let totalDiscount = 0;
    let totalLaundrySales = 0;
    let totalRiderCommission = 0;
    let totalPickupComm = 0;
    let totalDeliveryComm = 0;
    let totalNetFeeCollected = 0;
    let totalNetMargin = 0;
    let freeCount = 0;
    let partialCount = 0;

    const newCustomerSet = new Set<string>();

    filteredOrderList.forEach(item => {
      totalDiscount += item.discountAmount;
      totalLaundrySales += item.laundryAmount;
      totalRiderCommission += item.totalRiderComm;
      totalPickupComm += item.pickupCommission;
      totalDeliveryComm += item.deliveryCommission;
      totalNetFeeCollected += item.netFee;
      totalNetMargin += item.netMargin;

      if (item.netFee === 0) {
        freeCount++;
      } else {
        partialCount++;
      }

      if (item.isNewCustomer) {
        newCustomerSet.add(item.customerId || item.customerPhone || item.jobId);
      }
    });

    const orderCount = filteredOrderList.length;
    const avgDiscount = orderCount > 0 ? totalDiscount / orderCount : 0;
    const newCustomerCount = newCustomerSet.size;

    // Aggregate by Promo Code for Summary Matrix
    const codeGroupMap = new Map<string, {
      code: string;
      campaignType: "ALL" | "DELIVERY";
      orderCount: number;
      totalDistance: number;
      originalFee: number;
      discountGiven: number;
      netFeeCollected: number;
      laundrySales: number;
      riderCommission: number;
      netMargin: number;
      newCustomerSet: Set<string>;
      firstUsed: Date;
      lastUsed: Date;
      hasEstimatedValues: boolean;
    }>();

    filteredOrderList.forEach(item => {
      let grp = codeGroupMap.get(item.promoCode);
      if (!grp) {
        grp = {
          code: item.promoCode,
          campaignType: item.campaignType,
          orderCount: 0,
          totalDistance: 0,
          originalFee: 0,
          discountGiven: 0,
          netFeeCollected: 0,
          laundrySales: 0,
          riderCommission: 0,
          netMargin: 0,
          newCustomerSet: new Set<string>(),
          firstUsed: item.date,
          lastUsed: item.date,
          hasEstimatedValues: false
        };
        codeGroupMap.set(item.promoCode, grp);
      }

      grp.orderCount += 1;
      grp.totalDistance += item.distance;
      grp.originalFee += item.originalFee;
      grp.discountGiven += item.discountAmount;
      grp.netFeeCollected += item.netFee;
      grp.laundrySales += item.laundryAmount;
      grp.riderCommission += item.totalRiderComm;
      grp.netMargin += item.netMargin;
      if (item.isEstimated) grp.hasEstimatedValues = true;

      if (item.isNewCustomer) {
        grp.newCustomerSet.add(item.customerId || item.customerPhone || item.jobId);
      }

      if (item.date < grp.firstUsed) grp.firstUsed = item.date;
      if (item.date > grp.lastUsed) grp.lastUsed = item.date;
    });

    const codeSummaries = Array.from(codeGroupMap.values()).map(g => ({
      code: g.code,
      campaignType: g.campaignType,
      orderCount: g.orderCount,
      totalDistance: g.totalDistance,
      originalFee: g.originalFee,
      discountGiven: g.discountGiven,
      netFeeCollected: g.netFeeCollected,
      laundrySales: g.laundrySales,
      riderCommission: g.riderCommission,
      netMargin: g.netMargin,
      newCustomerCount: g.newCustomerSet.size,
      firstUsed: g.firstUsed,
      lastUsed: g.lastUsed,
      firstUsedStr: format(g.firstUsed, "dd/MM/yyyy"),
      lastUsedStr: format(g.lastUsed, "dd/MM/yyyy"),
      hasEstimatedValues: g.hasEstimatedValues
    })).sort((a, b) => b.orderCount - a.orderCount);

    return {
      kpis: {
        totalDiscount,
        totalLaundrySales,
        totalRiderCommission,
        totalPickupComm,
        totalDeliveryComm,
        totalNetFeeCollected,
        totalNetMargin,
        orderCount,
        avgDiscount,
        newCustomerCount,
        freeCount,
        partialCount,
        uniqueCodesCount: codeSummaries.length
      },
      codeSummaries,
      orderList: filteredOrderList,
      availableCodes
    };
  }, [filteredJobs, customers, riders, promoStatusFilter, promoTypeFilter, promoCodeFilter, promoSearchQuery]);

  const handleExportExcel = () => {
    let csvContent = "\uFEFF"; // UTF-8 BOM for Thai character compatibility in Excel
    let filename = `marketing_promo_${format(new Date(), "yyyyMMdd")}.csv`;

    csvContent += "Promo Code Performance Report\n";
    csvContent += `Branch,${selectedBranch === "all" ? "All Branches" : (shops.find(s => s.id === selectedBranch)?.name || selectedBranch)}\n`;
    csvContent += `Date Range,${dateRange}\n`;
    csvContent += `Generated At,${format(new Date(), "yyyy-MM-dd HH:mm:ss")}\n\n`;

    csvContent += "=== 1. PROMOTION MATRIX SUMMARY ===\n";
    csvContent += "Promo Code,Campaign Type,Orders,Total Distance (km),Original Fee,Discount Given,Net Fee Collected,Laundry Sales,Rider Commission,Net Margin,New Customers,First Used,Last Used\n";
    
    promoReportData.codeSummaries.forEach(s => {
      csvContent += `"${s.code}","${s.campaignType}",${s.orderCount},${s.totalDistance.toFixed(1)},${s.originalFee.toFixed(2)},${s.discountGiven.toFixed(2)},${s.netFeeCollected.toFixed(2)},${s.laundrySales.toFixed(2)},${s.riderCommission.toFixed(2)},${s.netMargin.toFixed(2)},${s.newCustomerCount},"${s.firstUsedStr}","${s.lastUsedStr}"\n`;
    });

    csvContent += "\n=== 2. DETAILED ORDER LOG ===\n";
    csvContent += "Order ID,Date,Customer Name,Customer Phone,Customer Badges,Distance (km),Laundry Sales,Original Delivery Fee,Promo Code,Discount Given,Net Fee Collected,Bill Total,Pickup Rider,Pickup Comm,Delivery Rider,Delivery Comm,Total Rider Comm,Net Margin,Payment Channel,Paid Status\n";

    promoReportData.orderList.forEach(o => {
      const custBadges = o.customerBadges.join("/") || "Standard";
      csvContent += `"${o.jobId}","${o.dateStr}","${(o.customerName || "").replace(/"/g, '""')}","${o.customerPhone || ""}","${custBadges}",${o.distance.toFixed(1)},${o.laundryAmount.toFixed(2)},${o.originalFee.toFixed(2)},"${o.promoCode}",${o.discountAmount.toFixed(2)},${o.netFee.toFixed(2)},${o.billTotal.toFixed(2)},"${(o.pickupRiderName || "").replace(/"/g, '""')}",${o.pickupCommission.toFixed(2)},"${(o.deliveryRiderName || "").replace(/"/g, '""')}",${o.deliveryCommission.toFixed(2)},${o.totalRiderComm.toFixed(2)},${o.netMargin.toFixed(2)},"${o.paymentChannel}","${o.isPaid ? 'Paid' : 'Unpaid'}"\n`;
    });

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

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-900 font-sans">
      
      {/* Upper Title Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Megaphone className="text-indigo-600" size={24} />
            Marketing & Analytics
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            รายงานและสถิติประสิทธิภาพแคมเปญโปรโมชัน ยอดส่วนลด และผลตอบแทนทางการตลาด
          </p>
        </div>

        {/* Filter Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Select */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-sm">
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
          <div className="flex items-center bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shadow-sm">
            {(["today", "7days", "30days", "month", "custom"] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateRange === range
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {range === "today" ? "Today" :
                 range === "7days" ? "7 Days" :
                 range === "30days" ? "30 Days" :
                 range === "month" ? "This Month" : "Custom"}
              </button>
            ))}
          </div>

          {/* Custom Date Range Picker */}
          {dateRange === "custom" && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1 shadow-sm animate-in fade-in duration-200">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 border-none outline-none p-0.5"
              />
              <span className="text-xs text-slate-400 font-bold">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 border-none outline-none p-0.5"
              />
            </div>
          )}

          {/* Export to Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl px-3 py-2 shadow-sm cursor-pointer transition-colors"
            title="ส่งออกรายงานเป็น Excel/CSV"
          >
            <Download size={14} />
            Export CSV
          </button>

          {/* Print Button */}
          <button
            onClick={() => {
              document.body.classList.add("printing-report");
              setTimeout(() => {
                window.print();
              }, 50);
            }}
            className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-xl px-3 py-2 shadow-sm cursor-pointer transition-colors"
          >
            <Printer size={14} className="text-slate-400" />
            Print Promo Report
          </button>
        </div>
      </div>

      {/* Sub-tab navigation bar */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-px overflow-x-auto scrollbar-hide shrink-0">
        <button
          onClick={() => setSubTab("promo")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "promo"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <Tag size={14} />
          Promo Report
        </button>
      </div>

      {/* PROMO CODE PERFORMANCE REPORT CONTENT */}
      {subTab === "promo" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            {/* 1. Total Subsidy Given */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                <Gift size={70} className="text-rose-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Subsidy (ส่วนลดรวม)</span>
                  <h3 className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
                    ฿{promoReportData.kpis.totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold">
                  Subsidy
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-semibold">
                Free 100%: {promoReportData.kpis.freeCount} / Partial: {promoReportData.kpis.partialCount}
              </p>
            </div>

            {/* 2. Laundry Sales Revenue */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                <ShoppingBag size={70} className="text-indigo-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Laundry Sales (ยอดงานซัก)</span>
                  <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                    ฿{promoReportData.kpis.totalLaundrySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                  Revenue
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-semibold">
                Avg. ฿{(promoReportData.kpis.orderCount > 0 ? promoReportData.kpis.totalLaundrySales / promoReportData.kpis.orderCount : 0).toFixed(2)}/order
              </p>
            </div>

            {/* 3. Rider Commission Cost */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                <Truck size={70} className="text-amber-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rider Comm (ค่าคอม Rider)</span>
                  <h3 className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
                    ฿{promoReportData.kpis.totalRiderCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                  Cost
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-semibold">
                Pick: ฿{promoReportData.kpis.totalPickupComm.toFixed(0)} / Deliv: ฿{promoReportData.kpis.totalDeliveryComm.toFixed(0)}
              </p>
            </div>

            {/* 4. Net Margin Contribution */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                <DollarSign size={70} className="text-emerald-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Net Margin (กำไรส่วนเพิ่ม)</span>
                  <h3 className={`text-xl font-black mt-1 ${promoReportData.kpis.totalNetMargin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    ฿{promoReportData.kpis.totalNetMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <span className={`p-1.5 rounded-lg text-[10px] font-bold ${promoReportData.kpis.totalNetMargin >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                  {promoReportData.kpis.totalNetMargin >= 0 ? "+Margin" : "-Loss"}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-semibold">
                Laundry + Net Fee − Comm
              </p>
            </div>

            {/* 5. New Customers Acquired */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                <Users size={70} className="text-purple-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">New Acquired (ลูกค้าใหม่)</span>
                  <h3 className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1">
                    {promoReportData.kpis.newCustomerCount}
                  </h3>
                </div>
                <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold">
                  Acquired
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-semibold">
                {promoReportData.kpis.orderCount > 0 ? ((promoReportData.kpis.newCustomerCount / promoReportData.kpis.orderCount) * 100).toFixed(1) : 0}% of promo bills
              </p>
            </div>

            {/* 6. Total Promo Orders */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-2xl p-4.5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                <Package size={70} className="text-blue-600" />
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Promo Orders (ออเดอร์)</span>
                  <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                    {promoReportData.kpis.orderCount}
                  </h3>
                </div>
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                  Orders
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-semibold">
                {promoReportData.kpis.uniqueCodesCount} distinct active codes
              </p>
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหา Code, ลูกค้า, เบอร์, Job ID..."
                  value={promoSearchQuery}
                  onChange={(e) => setPromoSearchQuery(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Payment Filter */}
              <select
                value={promoStatusFilter}
                onChange={(e) => setPromoStatusFilter(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="paid">✅ ชำระแล้ว (Paid Only - แนะนำ)</option>
                <option value="all">ทุกสถานะการชำระ (All)</option>
                <option value="unpaid">⏳ ยังไม่ชำระ (Unpaid Only)</option>
              </select>

              {/* Campaign Type Filter */}
              <select
                value={promoTypeFilter}
                onChange={(e) => setPromoTypeFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">ทุกประเภท Campaign (All Types)</option>
                <option value="DELIVERY">🚚 ส่วนลดค่าส่ง (Delivery Promo)</option>
                <option value="ALL">📦 ส่วนลดทั้งบิล (All / Bill Promo)</option>
              </select>

              {/* Promo Code Filter */}
              {promoReportData.availableCodes.length > 1 && (
                <select
                  value={promoCodeFilter}
                  onChange={(e) => setPromoCodeFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer font-mono"
                >
                  <option value="all">ทุกรหัสโค้ด (All Codes)</option>
                  {promoReportData.availableCodes.map(c => (
                    <option key={c} value={c}>🎟️ {c}</option>
                  ))}
                </select>
              )}
            </div>

            {(promoSearchQuery || promoStatusFilter !== "paid" || promoTypeFilter !== "all" || promoCodeFilter !== "all") && (
              <button
                onClick={() => {
                  setPromoSearchQuery("");
                  setPromoStatusFilter("paid");
                  setPromoTypeFilter("all");
                  setPromoCodeFilter("all");
                }}
                className="text-[11px] text-rose-500 hover:text-rose-600 font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Section 2: Promotion Matrix Summary Table */}
          <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <Tag size={16} className="text-indigo-600" />
                  สรุปประสิทธิภาพโปรโมชันแยกตามรหัส (Promotion Matrix)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ภาพรวมยอดขาย ยอดส่วนลด และค่าคอมมิชชัน Rider แยกตาม Promo Code
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                พบ {promoReportData.codeSummaries.length} รหัสที่ถูกใช้งาน
              </span>
            </div>

            {promoReportData.codeSummaries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-semibold text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black bg-slate-50/50 dark:bg-slate-900/50">
                      <th className="py-3 px-3">Promo Code</th>
                      <th className="py-3 px-2 text-center">ประเภท</th>
                      <th className="py-3 px-2 text-center">ออเดอร์</th>
                      <th className="py-3 px-2 text-right">ระยะทางรวม</th>
                      <th className="py-3 px-3 text-right">ค่าส่งเดิม</th>
                      <th className="py-3 px-3 text-right">ส่วนลดที่ให้</th>
                      <th className="py-3 px-3 text-right">ค่าส่งเก็บจริง</th>
                      <th className="py-3 px-3 text-right">ยอดงานซัก</th>
                      <th className="py-3 px-3 text-right">ค่าคอม Rider</th>
                      <th className="py-3 px-3 text-right">กำไรสุทธิ</th>
                      <th className="py-3 px-2 text-center">ลูกค้าใหม่</th>
                      <th className="py-3 px-3 text-center">ช่วงวันที่ใช้</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {promoReportData.codeSummaries.map((sum) => (
                      <tr key={sum.code} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        {/* Code */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-[13px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                              🎟️ {sum.code}
                            </span>
                          </div>
                        </td>

                        {/* Campaign Type */}
                        <td className="py-3 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase inline-flex items-center gap-1 ${
                            sum.campaignType === "DELIVERY"
                              ? "bg-sky-50 text-sky-700 border border-sky-200/60 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800"
                              : "bg-purple-50 text-purple-700 border border-purple-200/60 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
                          }`}>
                            {sum.campaignType === "DELIVERY" ? "🚚 ค่าส่ง" : "📦 ทั้งบิล"}
                          </span>
                        </td>

                        {/* Orders */}
                        <td className="py-3 px-2 text-center font-black text-slate-850 dark:text-slate-100">
                          {sum.orderCount}
                        </td>

                        {/* Distance */}
                        <td className="py-3 px-2 text-right font-mono text-slate-500 dark:text-slate-400">
                          {sum.totalDistance.toFixed(1)} km
                        </td>

                        {/* Original Fee */}
                        <td className="py-3 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                          {sum.hasEstimatedValues && <span className="text-[10px] text-amber-500 mr-0.5" title="ประมาณการตามระยะทาง">~</span>}
                          ฿{sum.originalFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Discount Given */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          -฿{sum.discountGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Net Fee Collected */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          ฿{sum.netFeeCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Laundry Sales */}
                        <td className="py-3 px-3 text-right font-mono font-black text-indigo-650 dark:text-indigo-400">
                          ฿{sum.laundrySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Rider Comm */}
                        <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">
                          ฿{sum.riderCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Net Margin */}
                        <td className="py-3 px-3 text-right font-mono font-black">
                          <span className={`px-2 py-0.5 rounded-lg text-xs ${
                            sum.netMargin >= 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                          }`}>
                            ฿{sum.netMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* New Customers */}
                        <td className="py-3 px-2 text-center">
                          {sum.newCustomerCount > 0 ? (
                            <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                              +{sum.newCustomerCount}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </td>

                        {/* Date Range */}
                        <td className="py-3 px-3 text-center text-[10px] text-slate-400 font-mono">
                          {sum.firstUsedStr === sum.lastUsedStr ? sum.firstUsedStr : `${sum.firstUsedStr} - ${sum.lastUsedStr}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Summary Totals Footer */}
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-black text-slate-900 dark:text-slate-100 bg-slate-50/80 dark:bg-slate-900/80">
                      <td className="py-3 px-3 font-black uppercase text-[11px]">
                        รวมทั้งหมด ({promoReportData.codeSummaries.length} โค้ด)
                      </td>
                      <td className="py-3 px-2 text-center text-slate-400 text-[10px]">-</td>
                      <td className="py-3 px-2 text-center text-indigo-600 dark:text-indigo-400">
                        {promoReportData.kpis.orderCount}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-500">
                        {promoReportData.codeSummaries.reduce((a, b) => a + b.totalDistance, 0).toFixed(1)} km
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        ฿{promoReportData.codeSummaries.reduce((a, b) => a + b.originalFee, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                        -฿{promoReportData.kpis.totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        ฿{promoReportData.kpis.totalNetFeeCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-indigo-650 dark:text-indigo-400">
                        ฿{promoReportData.kpis.totalLaundrySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                        ฿{promoReportData.kpis.totalRiderCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span className={`px-2 py-0.5 rounded-lg text-xs ${
                          promoReportData.kpis.totalNetMargin >= 0
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300"
                        }`}>
                          ฿{promoReportData.kpis.totalNetMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center text-emerald-600 dark:text-emerald-400">
                        +{promoReportData.kpis.newCustomerCount}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-400 text-[10px]">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400">
                <Gift size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2 opacity-60" />
                <p className="text-xs font-bold">ไม่พบข้อมูลการใช้งาน Promo Code ตามเงื่อนไขที่เลือก</p>
                <p className="text-[10px] text-slate-400 mt-1">ลองเปลี่ยนช่วงเวลา, ตัวกรองสาขา หรือสถานะการชำระเงิน</p>
              </div>
            )}
          </div>

          {/* Section 3: Detailed Order Log Table */}
          <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                  <ClipboardList size={16} className="text-indigo-600" />
                  รายการออเดอร์ที่ใช้โปรโมชันทั้งหมด (Detailed Promo Order Log)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  บันทึกประวัติการใช้อย่างละเอียดรายบิล พร้อมข้อมูล Rider Commission และกำไรสุทธิ
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                แสดงผล {promoReportData.orderList.length} รายการ
              </span>
            </div>

            {promoReportData.orderList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-semibold text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black bg-slate-50/50 dark:bg-slate-900/50">
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-3">วันที่/เวลา</th>
                      <th className="py-3 px-3">ลูกค้า (Customer)</th>
                      <th className="py-3 px-2 text-center">ระยะทาง</th>
                      <th className="py-3 px-3 text-right">ยอดงานซัก</th>
                      <th className="py-3 px-3 text-right">ค่าส่งเดิม</th>
                      <th className="py-3 px-3 text-center">โปรโมชันที่ใช้</th>
                      <th className="py-3 px-3 text-right">ค่าส่งเก็บจริง</th>
                      <th className="py-3 px-3 text-right">ยอดรวมบิล</th>
                      <th className="py-3 px-3">Rider รับผ้า</th>
                      <th className="py-3 px-3">Rider ส่งผ้า</th>
                      <th className="py-3 px-3 text-right">กำไรสุทธิ</th>
                      <th className="py-3 px-3 text-center">การชำระเงิน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {promoReportData.orderList.map((item) => (
                      <tr key={item.jobId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        {/* Order ID */}
                        <td className="py-3 px-3">
                          <button
                            onClick={() => {
                              if (onViewJob) onViewJob(item.job);
                              else setSelectedJobForView(item.job);
                            }}
                            className="font-mono text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline underline-offset-2 cursor-pointer"
                          >
                            #{item.jobId.slice(-8).toUpperCase()}
                          </button>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                          {item.dateStr}
                        </td>

                        {/* Customer + Badges */}
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-850 dark:text-slate-100">
                                {item.customerName}
                              </span>
                              {item.customerBadges.map((badge) => (
                                <span
                                  key={badge}
                                  className={`text-[8px] font-black px-1.5 py-0.2 rounded ${
                                    badge === "NEW"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40"
                                      : badge === "VIP"
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/40"
                                      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300/40"
                                  }`}
                                >
                                  {badge === "NEW" ? "🆕 NEW" : badge === "VIP" ? "👑 VIP" : "🎫 MEMBER"}
                                </span>
                              ))}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {item.customerPhone}
                            </span>
                          </div>
                        </td>

                        {/* Distance */}
                        <td className="py-3 px-2 text-center font-mono text-slate-500 dark:text-slate-400">
                          {item.distance > 0 ? `${item.distance.toFixed(1)} km` : "-"}
                        </td>

                        {/* Laundry Amount */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-indigo-650 dark:text-indigo-400">
                          ฿{item.laundryAmount.toFixed(2)}
                        </td>

                        {/* Original Fee */}
                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          {item.isEstimated && <span className="text-[10px] text-amber-500 mr-0.5" title="ประมาณการตามระยะทาง">~</span>}
                          ฿{item.originalFee.toFixed(2)}
                        </td>

                        {/* Promo Code & Discount */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="font-mono font-bold text-[11px] bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 rounded border border-rose-200/60 dark:border-rose-900">
                              🎟️ {item.promoCode}
                            </span>
                            <span className="text-[9px] font-bold text-rose-600 mt-0.5">
                              -฿{item.discountAmount.toFixed(2)}
                            </span>
                          </div>
                        </td>

                        {/* Net Fee */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          ฿{item.netFee.toFixed(2)}
                        </td>

                        {/* Bill Total */}
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                          ฿{item.billTotal.toFixed(2)}
                        </td>

                        {/* Pickup Rider */}
                        <td className="py-3 px-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px]">
                              {item.pickupRiderName}
                            </span>
                            {item.pickupCommission > 0 && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold">
                                ฿{item.pickupCommission.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Delivery Rider */}
                        <td className="py-3 px-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700 dark:text-slate-200 text-[11px]">
                              {item.deliveryRiderName}
                            </span>
                            {item.deliveryCommission > 0 && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold">
                                ฿{item.deliveryCommission.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Net Margin */}
                        <td className="py-3 px-3 text-right font-mono font-black">
                          <span className={`px-2 py-0.5 rounded text-[11px] ${
                            item.netMargin >= 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                          }`}>
                            ฿{item.netMargin.toFixed(2)}
                          </span>
                        </td>

                        {/* Payment Status */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              item.isPaid
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            }`}>
                              {item.isPaid ? "Paid" : "Unpaid"}
                            </span>
                            <span className="text-[9px] text-slate-400 uppercase font-mono">
                              {item.paymentChannel}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400">
                <ClipboardList size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2 opacity-60" />
                <p className="text-xs font-bold">ไม่พบรายการออเดอร์ตามเงื่อนไขที่เลือก</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View-Only Job Detail Modal */}
      {selectedJobForView && (
        <Dialog open={!!selectedJobForView} onOpenChange={() => setSelectedJobForView(null)}>
          <DialogContent className="max-w-lg p-6 bg-white dark:bg-slate-900 overflow-y-auto max-h-[90vh] z-[9999] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800">
            <DialogHeader className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
              <DialogTitle className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
                <ClipboardList size={18} className="text-indigo-500" />
                Job Details: {selectedJobForView.id}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-xs font-semibold text-slate-700 dark:text-slate-200">
              {/* Customer details banner */}
              <div className="bg-slate-50 dark:bg-slate-850 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Details</p>
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-100">
                  <span>Name: {selectedJobForView.customerName}</span>
                  <span>Phone: {selectedJobForView.customerPhone}</span>
                </div>
                {selectedJobForView.createdAt && (
                  <p className="text-[10px] text-slate-400 font-medium">Recorded Date: {format(new Date(selectedJobForView.createdAt), "dd MMM yyyy HH:mm")}</p>
                )}
              </div>

              {/* Status details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800 space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Job Status</span>
                  <div className="text-slate-800 dark:text-slate-100 font-extrabold capitalize">{selectedJobForView.status}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800 space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Payment Status</span>
                  <div className="flex items-center gap-1 text-slate-800 dark:text-slate-100 font-extrabold uppercase">
                    {selectedJobForView.isPaid ? (
                      <span className="text-emerald-600 font-bold">PAID ({selectedJobForView.paymentChannel || selectedJobForView.paymentMethod || "CASH"})</span>
                    ) : (
                      <span className="text-amber-500 font-bold">UNPAID</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Items details table */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Details</p>
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/20">
                  {(selectedJobForView.items || []).length > 0 ? (
                    (selectedJobForView.items || []).map((it: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-3 text-xs font-bold text-slate-800 dark:text-slate-100">
                        <div className="flex flex-col gap-0.5">
                          <span>{it.name}</span>
                          <span className="text-[10px] text-slate-450 font-medium">Qty: {it.quantity} × ฿{it.price}</span>
                        </div>
                        <span className="font-extrabold text-slate-900 dark:text-slate-100">฿{(it.price * it.quantity).toFixed(0)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center font-bold text-slate-400">
                      {selectedJobForView.status === "topup" ? "Top-up Member Credits" : "No items listed"}
                    </div>
                  )}
                  <div className="flex justify-between items-center p-3 bg-slate-50/80 dark:bg-slate-850 text-xs font-black text-slate-900 dark:text-slate-100">
                    <span>GRAND TOTAL</span>
                    <span className="text-indigo-650 text-sm">฿{(selectedJobForView.totalAmount || selectedJobForView.fee || 0).toFixed(0)}</span>
                  </div>
                </div>
              </div>

              {/* Uploaded Receipt Preview */}
              {selectedJobForView.billImageUrl && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uploaded Receipts (Bill/Transfer)</p>
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {(() => {
                      try {
                        const urls = JSON.parse(selectedJobForView.billImageUrl);
                        const urlList = Array.isArray(urls) ? urls : [urls];
                        return urlList.map((url: string, index: number) => (
                          <div key={index} className="relative group border border-slate-205 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-slate-50 dark:bg-slate-850 max-h-56 flex items-center justify-center p-1">
                            <img
                              src={url}
                              alt={`Receipt ${index + 1}`}
                              className="max-h-50 object-contain rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => printImageUrl(url)}
                              className="absolute top-2 right-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-2.5 py-1 text-xs font-bold flex items-center gap-1 shadow-md transition-colors cursor-pointer"
                              title="พิมพ์รูปภาพนี้"
                            >
                              <Printer size={14} />
                              <span>พิมพ์</span>
                            </button>
                          </div>
                        ));
                      } catch {
                        return (
                          <div className="relative group border border-slate-205 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-slate-50 dark:bg-slate-850 max-h-56 flex items-center justify-center p-1">
                            <img
                              src={selectedJobForView.billImageUrl}
                              alt="Receipt"
                              className="max-h-50 object-contain rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => printImageUrl(selectedJobForView.billImageUrl)}
                              className="absolute top-2 right-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-2.5 py-1 text-xs font-bold flex items-center gap-1 shadow-md transition-colors cursor-pointer"
                              title="พิมพ์รูปภาพนี้"
                            >
                              <Printer size={14} />
                              <span>พิมพ์</span>
                            </button>
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                onClick={() => setSelectedJobForView(null)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-xs tracking-wider rounded-xl h-9 cursor-pointer border-none"
              >
                Close View
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
