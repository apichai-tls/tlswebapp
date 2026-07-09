"use client";

import { useState, useMemo, useEffect } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { shopStore, riderStore, shiftStore, type CashierShift } from "@/lib/store";
import { useSyncExternalStore } from "react";
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
  Truck,
  ClipboardList,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

export function AdminReports() {
  const jobs = useJobs();
  const customers = useCustomers();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const riders = useSyncExternalStore(riderStore.subscribe, riderStore.getSnapshot, riderStore.getSnapshot);

  // Sub-tabs state
  const [subTab, setSubTab] = useState<"overview" | "shift" | "order" | "rider" | "pos">("overview");

  // Filters State
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "month">("30days");
  
  // Tab-specific filters/search
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
      }

      return true;
    });
  }, [jobs, selectedBranch, dateRange]);

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
              productSales[name].count += qty;
              productSales[name].revenue += rev;
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

  // 1. Shift Report calculations
  const shiftReportData = useMemo(() => {
    return closedShifts.filter(shift => {
      if (selectedBranch !== "all" && shift.branchId !== selectedBranch) return false;
      return true;
    });
  }, [closedShifts, selectedBranch]);

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

  // 3. Rider Commission calculations
  const riderCommissionData = useMemo(() => {
    const list: any[] = [];
    let totalPayout = 0;

    filteredJobs.forEach(job => {
      const hasPickupRider = !!job.pickupRiderId;
      const hasDeliveryRider = !!job.deliveryRiderId;
      const pickupComm = job.pickupCommission || 0;
      const deliveryComm = job.deliveryCommission || 0;

      if (hasPickupRider) {
        const riderName = riders.find(r => r.id === job.pickupRiderId)?.name || job.pickupRiderId;
        totalPayout += pickupComm;
        list.push({
          jobId: job.id,
          riderId: job.pickupRiderId,
          riderName,
          type: "Pickup",
          amount: job.totalAmount || 0,
          commission: pickupComm,
          date: job.createdAt ? new Date(job.createdAt) : null,
          status: job.status
        });
      }

      if (hasDeliveryRider) {
        const riderName = riders.find(r => r.id === job.deliveryRiderId)?.name || job.deliveryRiderId;
        totalPayout += deliveryComm;
        list.push({
          jobId: job.id,
          riderId: job.deliveryRiderId,
          riderName,
          type: "Delivery",
          amount: job.totalAmount || 0,
          commission: deliveryComm,
          date: job.createdAt ? new Date(job.createdAt) : null,
          status: job.status
        });
      }
    });

    return { list, totalPayout };
  }, [filteredJobs, riders]);

  // 4. POS Report calculations (jobs linked to shifts or walk-in orders)
  const posReportData = useMemo(() => {
    const list = filteredJobs.filter(job => {
      const isPosWalkIn = job.pickupLocation === "POS Counter (Walk-in)" || !!job.shiftId;
      
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = job.id.toLowerCase().includes(query);
        const matchesName = job.customerName ? job.customerName.toLowerCase().includes(query) : false;
        return isPosWalkIn && (matchesId || matchesName);
      }
      
      return isPosWalkIn;
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

        {/* Filter Toolbar Controls */}
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
            {(["today", "7days", "30days", "month"] as const).map(range => (
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

          <button 
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-xl px-3 py-2 shadow-sm cursor-pointer transition-colors"
          >
            <Download size={14} className="text-slate-400" />
            Print Report
          </button>
        </div>
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
          onClick={() => setSubTab("rider")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "rider"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <Truck size={14} />
          Rider Commission Report
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
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 lg:col-span-2 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">Sales Trend & Operations Volume</h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Weekly volume performance projection</p>
                </div>
              </div>
              <div className="h-56 w-full relative pt-2">
                <svg viewBox="0 0 500 200" className="w-full h-full">
                  <line x1="0" y1="40" x2="500" y2="40" stroke="#f1f5f9" strokeWidth="1" className="dark:stroke-slate-800" />
                  <line x1="0" y1="90" x2="500" y2="90" stroke="#f1f5f9" strokeWidth="1" className="dark:stroke-slate-800" />
                  <line x1="0" y1="140" x2="500" y2="140" stroke="#f1f5f9" strokeWidth="1" className="dark:stroke-slate-800" />
                  <line x1="0" y1="190" x2="500" y2="190" stroke="#e2e8f0" strokeWidth="1.5" className="dark:stroke-slate-700" />
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M 0 160 Q 50 120 100 130 T 200 90 T 300 70 T 400 40 T 500 25" fill="none" stroke="#4f46e5" strokeWidth="3.5" strokeLinecap="round" />
                  <path d="M 0 160 Q 50 120 100 130 T 200 90 T 300 70 T 400 40 T 500 25 L 500 190 L 0 190 Z" fill="url(#chartGradient)" />
                </svg>
                <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase mt-2">
                  <span>Week 1</span>
                  <span>Week 2</span>
                  <span>Week 3</span>
                  <span>Week 4</span>
                  <span>Week 5</span>
                </div>
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
                      <td className="py-3 text-center font-bold">{p.count}</td>
                      <td className="py-3 text-right text-indigo-600 dark:text-indigo-400 font-black">฿{p.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 2. SHIFT REPORT */}
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
                    <th className="pb-3 text-right">Start Float</th>
                    <th className="pb-3 text-right">Expected Drawer</th>
                    <th className="pb-3 text-right">Actual Drawer</th>
                    <th className="pb-3 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {shiftReportData.map((shift) => {
                    const variance = shift.actualCash - shift.expectedCash;
                    const branchName = shops.find(s => s.id === shift.branchId)?.name || shift.branchId;
                    return (
                      <tr key={shift.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-3 font-mono text-[10px] text-slate-400">{shift.id.slice(-8).toUpperCase()}</td>
                        <td className="py-3">{branchName}</td>
                        <td className="py-3 font-bold text-slate-800 dark:text-slate-100">{shift.userName}</td>
                        <td className="py-3 text-center text-slate-400">{format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm")}</td>
                        <td className="py-3 text-center text-slate-400">{shift.closedAt ? format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm") : "-"}</td>
                        <td className="py-3 text-right">฿{shift.startingCash.toLocaleString()}</td>
                        <td className="py-3 text-right">฿{shift.expectedCash.toLocaleString()}</td>
                        <td className="py-3 text-right font-bold text-slate-800 dark:text-slate-100">฿{shift.actualCash.toLocaleString()}</td>
                        <td className={`py-3 text-right font-black ${variance === 0 ? "text-emerald-600" : variance > 0 ? "text-blue-500" : "text-rose-600"}`}>
                          {variance === 0 ? "฿0.00" : `${variance > 0 ? "+" : ""}฿${variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
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
                                : "bg-indigo-100 text-indigo-800"
                            }`}>
                              {job.status}
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

      {/* 4. RIDER COMMISSION REPORT */}
      {subTab === "rider" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">Rider Commission Payout Summary</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Summary of shipping commission calculations for pickup and delivery riders</p>
              </div>
              <div className="bg-indigo-500/10 text-indigo-600 rounded-xl px-4 py-2 border border-indigo-200/50">
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider block">Total Commission Payout</span>
                <span className="text-lg font-black">฿{riderCommissionData.totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {riderCommissionData.list.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-semibold text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black">
                      <th className="pb-3">Job ID</th>
                      <th className="pb-3">Rider Name</th>
                      <th className="pb-3 text-center">Transit Role</th>
                      <th className="pb-3 text-right">Job Total</th>
                      <th className="pb-3 text-right">Rider Commission</th>
                      <th className="pb-3 text-center">Date</th>
                      <th className="pb-3 text-center">Job Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {riderCommissionData.list.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-3 font-mono text-[10px] text-slate-400">{item.jobId.slice(-8).toUpperCase()}</td>
                        <td className="py-3 font-bold text-slate-800 dark:text-slate-100">{item.riderName}</td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${item.type === "Pickup" ? "bg-indigo-50 text-indigo-750" : "bg-sky-50 text-sky-750"}`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="py-3 text-right text-slate-400">฿{item.amount.toFixed(2)}</td>
                        <td className="py-3 text-right text-emerald-600 dark:text-emerald-400 font-black">฿{item.commission.toFixed(2)}</td>
                        <td className="py-3 text-center text-slate-400">{item.date ? format(item.date, "dd/MM/yyyy HH:mm") : "-"}</td>
                        <td className="py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-150 text-slate-800">
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 font-semibold">No rider commission logs found in this timeframe.</div>
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
                        <th className="pb-3">Bill ID</th>
                        <th className="pb-3">Customer</th>
                        <th className="pb-3 text-right">Amount</th>
                        <th className="pb-3 text-center">Method</th>
                        <th className="pb-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                      {posReportData.list.map((job) => (
                        <tr key={job.id}>
                          <td className="py-2.5 font-mono text-[10px] text-slate-400">{job.id.slice(-8).toUpperCase()}</td>
                          <td className="py-2.5 font-bold">{job.customerName || "Walk-In"}</td>
                          <td className="py-2.5 text-right font-black text-slate-850 dark:text-slate-100">฿{(job.totalAmount || 0).toFixed(2)}</td>
                          <td className="py-2.5 text-center text-slate-400 text-[10px] uppercase">{job.paymentChannel || job.paymentMethod || "CASH"}</td>
                          <td className="py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              job.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-850"
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

    </div>
  );
}
