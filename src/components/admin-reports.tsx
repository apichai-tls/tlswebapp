"use client";

import { useState, useMemo, useEffect } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
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
  FileText
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface AdminReportsProps {
  onViewJob?: (job: any) => void;
}

export function AdminReports({ onViewJob }: AdminReportsProps) {
  const jobs = useJobs();
  const customers = useCustomers();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // Sub-tabs state
  const [subTab, setSubTab] = useState<"overview" | "shift" | "order" | "pos" | "customer">("overview");

  // Filters State
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "month" | "custom">("30days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  
  // Tab-specific filters/search
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Customer Report states
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [selectedCustomerForReport, setSelectedCustomerForReport] = useState<any | null>(null);
  const [showOnlyTopup, setShowOnlyTopup] = useState(false);
  const [selectedJobForView, setSelectedJobForView] = useState<any | null>(null);

  // Shift orders dialog state
  const [selectedShiftForOrders, setSelectedShiftForOrders] = useState<CashierShift | null>(null);
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<any | null>(null);
  const [shiftOrdersSearchQuery, setShiftOrdersSearchQuery] = useState("");

  const filteredCustomersForReport = useMemo(() => {
    if (!customerSearchQuery.trim()) return [];
    const query = customerSearchQuery.toLowerCase().trim();
    return customers.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.phone.includes(query) ||
      (c.memberId && c.memberId.toLowerCase().includes(query))
    );
  }, [customerSearchQuery, customers]);



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

  const customerJobsForReport = useMemo(() => {
    if (!selectedCustomerForReport) return [];

    // 1. Get all jobs for this customer from the entire job list (jobs)
    const rawJobs = jobs.filter(j =>
      j.customerId === selectedCustomerForReport.id || 
      j.customerPhone === selectedCustomerForReport.phone
    );

    // 2. Sort from newest to oldest
    const sorted = [...rawJobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 3. Calculate running balance backwards
    let runningBalance = selectedCustomerForReport.creditBalance || 0;
    
    const mapped = sorted.map(job => {
      // If the job already has walletBalanceAfter in DB, we use it. Otherwise compute it.
      const hasSnapshot = job.walletBalanceAfter !== undefined && job.walletBalanceAfter !== null;
      const displayBalance = hasSnapshot ? job.walletBalanceAfter : runningBalance;

      // Adjust runningBalance backwards for the next (older) step
      const isTopup = job.status === "topup" && job.isPaid;
      const isCreditPayment = (job.paymentChannel === "credit" || job.paymentMethod === "credit") && job.isPaid;

      if (isTopup) {
        // This transaction increased the wallet, so going backward, the balance was lower
        runningBalance -= (job.totalAmount || job.fee || 0);
      } else if (isCreditPayment) {
        // This transaction decreased the wallet, so going backward, the balance was higher
        runningBalance += (job.totalAmount || job.fee || 0);
      }

      return {
        ...job,
        displayWalletBalance: displayBalance,
        isWalletAffecting: isTopup || isCreditPayment
      };
    });

    // 4. Finally, filter by the selected date range, branch, and showOnlyTopup filter
    const filteredMapped = mapped.filter(job => {
      if (selectedBranch !== "all" && job.branchId !== selectedBranch) return false;
      if (!job.createdAt) return false;
      const jobDate = new Date(job.createdAt);
      const today = new Date();

      let dateFilterPassed = true;
      if (dateRange === "today") {
        dateFilterPassed = jobDate >= startOfDay(today) && jobDate <= endOfDay(today);
      } else if (dateRange === "7days") {
        dateFilterPassed = jobDate >= startOfDay(subDays(today, 7));
      } else if (dateRange === "30days") {
        dateFilterPassed = jobDate >= startOfDay(subDays(today, 30));
      } else if (dateRange === "month") {
        dateFilterPassed = jobDate.getMonth() === today.getMonth() && jobDate.getFullYear() === today.getFullYear();
      } else if (dateRange === "custom") {
        if (customStartDate) {
          const startMs = new Date(customStartDate).setHours(0, 0, 0, 0);
          if (jobDate.getTime() < startMs) dateFilterPassed = false;
        }
        if (customEndDate) {
          const endMs = new Date(customEndDate).setHours(23, 59, 59, 999);
          if (jobDate.getTime() > endMs) dateFilterPassed = false;
        }
      }

      if (!dateFilterPassed) return false;

      if (showOnlyTopup && job.status !== "topup") return false;

      return true;
    });

    return filteredMapped;
  }, [selectedCustomerForReport, jobs, selectedBranch, dateRange, customStartDate, customEndDate, showOnlyTopup]);

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

    } else if (subTab === "customer") {
      if (selectedCustomerForReport) {
        csvContent += `Customer Statement: ${selectedCustomerForReport.name}\n`;
        csvContent += `Phone: ${selectedCustomerForReport.phone}\n`;
        csvContent += `Current Credit Balance: ฿${selectedCustomerForReport.creditBalance || 0}\n\n`;
        csvContent += "Date,Transaction ID,Type,Total Amount,Wallet Balance After,Status\n";

        customerJobsForReport.forEach(job => {
          const dateStr = job.createdAt ? format(new Date(job.createdAt), "yyyy-MM-dd HH:mm:ss") : "";
          const isTopup = job.status === "topup";
          const typeStr = isTopup ? "Wallet Topup" : "Laundry Service";
          csvContent += `"${dateStr}","${job.id}","${typeStr}",${job.totalAmount || 0},${job.displayWalletBalance || 0},"${job.status}"\n`;
        });
      } else {
        csvContent += "Customer List Export\n\n";
        csvContent += "Customer ID,Name,Phone,Credit Balance,Is Member,VIP\n";
        customers.forEach(c => {
          csvContent += `"${c.id}","${c.name.replace(/"/g, '""')}","${c.phone}",${c.creditBalance || 0},"${c.isMember ? 'Yes' : 'No'}","${c.isVIP ? 'Yes' : 'No'}"\n`;
        });
      }
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
             subTab === "pos" ? "Print POS Report" :
             subTab === "customer" ? "Print Customer Report" : "Print Report"}
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

        <button
          onClick={() => setSubTab("customer")}
          className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            subTab === "customer"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-450 hover:text-slate-800"
          }`}
        >
          <Users size={14} />
          Customer Report
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
                          <td className="py-2.5 text-center text-slate-400 text-[10px] uppercase">
                             {(() => {
                               const ch = job.paymentChannel || job.paymentMethod || "CASH";
                               if (ch.toLowerCase() === "credit") return "Deduct Member";
                               if (ch.toLowerCase() === "card") return "Credit Card";
                               return ch;
                             })()}
                          </td>
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

      {subTab === "customer" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Customer Search Section */}
          <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide mb-3">
              Search Customer Report
            </h3>
            <div className="relative max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-450">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Search by Name, Phone, or Member ID..."
                className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
              />
              {/* Dropdown Results */}
              {filteredCustomersForReport.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCustomersForReport.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomerForReport(c);
                        setCustomerSearchQuery("");
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-850 flex items-center justify-between text-xs font-bold transition-colors cursor-pointer"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-800 dark:text-slate-100">{c.name}</span>
                        <span className="text-[10px] text-slate-450 font-medium">{c.phone}</span>
                      </div>
                      {c.isMember && c.memberId && (
                        <span className="bg-indigo-50 text-indigo-700 text-[8px] font-bold px-1.5 py-0.5 rounded border border-indigo-200/50">
                          MEMBER: {c.memberId}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Customer Usage Report Details */}
          {selectedCustomerForReport ? (
            <div className="space-y-6">
              {/* Customer Profile & Statistics Card */}
              <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm border border-indigo-100">
                      {selectedCustomerForReport.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        {selectedCustomerForReport.name}
                        {selectedCustomerForReport.isMember && (
                          <span className="bg-indigo-50 text-indigo-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-indigo-200/50 flex items-center gap-0.5">
                            MEMBER
                          </span>
                        )}
                      </h4>
                      <p className="text-xs font-bold text-slate-500">{selectedCustomerForReport.phone}</p>
                    </div>
                  </div>

                  {selectedCustomerForReport.isMember && selectedCustomerForReport.memberExpiryDate && (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200/40 px-2.5 py-1 rounded-lg w-fit">
                      <History size={12} className="text-slate-400" />
                      <span>
                        Membership: {format(new Date(selectedCustomerForReport.memberStartDate || selectedCustomerForReport.createdAt), "dd MMM yyyy")}
                        {" - "}
                        {format(new Date(selectedCustomerForReport.memberExpiryDate), "dd MMM yyyy")}
                      </span>
                      {new Date(selectedCustomerForReport.memberExpiryDate).getTime() < Date.now() ? (
                        <span className="text-rose-600 font-black ml-1 uppercase">(Expired)</span>
                      ) : (
                        <span className="text-emerald-600 font-black ml-1 uppercase">(Active)</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-8 text-center shrink-0">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest">Total Spend (LTV)</p>
                    <p className="text-lg font-black text-slate-900 dark:text-slate-100">
                      ฿{jobs.filter(j => j.customerId === selectedCustomerForReport.id || j.customerPhone === selectedCustomerForReport.phone)
                        .filter(j => j.isPaid || j.status === "completed")
                        .reduce((sum, j) => sum + (j.totalAmount || j.fee || 0), 0)
                        .toLocaleString()}
                    </p>
                  </div>
                  <div className="w-px bg-slate-200 dark:bg-slate-800 h-8" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest">Wallet Balance</p>
                    <p className="text-lg font-black text-emerald-600">
                      ฿{(selectedCustomerForReport.creditBalance || 0).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCustomerForReport(null)}
                    className="ml-4 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                  >
                    Clear Search
                  </button>
                </div>
              </div>

              {/* Customer Job History List */}
              <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                    Job & Top-up History
                  </h3>
                  
                  {/* Filter Top-up Only Toggle */}
                  <button
                    onClick={() => setShowOnlyTopup(prev => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase transition-all cursor-pointer ${
                      showOnlyTopup
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200/60"
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Percent size={12} />
                    Filter Topup Member Only
                  </button>
                </div>

                {customerJobsForReport.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-150 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <th className="pb-2">Job ID</th>
                          <th className="pb-2">Date</th>
                          <th className="pb-2">Type / Items</th>
                          <th className="pb-2 text-right">Amount</th>
                          <th className="pb-2 text-center">Payment Channel</th>
                          <th className="pb-2 text-right">Wallet Balance</th>
                          <th className="pb-2 text-center">Status</th>
                          <th className="pb-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-200 font-semibold">
                        {customerJobsForReport.map((job: any) => (
                          <tr key={job.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                            <td className="py-3 font-mono text-[10px] text-slate-400">{job.id}</td>
                            <td className="py-3 text-[11px] font-medium">
                              {format(new Date(job.createdAt), "dd MMM yyyy HH:mm")}
                            </td>
                            <td className="py-3">
                              <span className="font-bold text-slate-800 dark:text-slate-100">
                                {job.status === "topup" ? (
                                  <span className="text-indigo-600 font-extrabold uppercase flex items-center gap-0.5"><Crown size={12} /> TOPUP MEMBER</span>
                                ) : (
                                  (job.items || []).map((it: any) => `${it.name} (x${it.quantity})`).join(", ") || "Laundry Order"
                                )}
                              </span>
                            </td>
                            <td className="py-3 text-right font-black text-slate-900 dark:text-slate-50">
                              ฿{(job.totalAmount || job.fee || 0).toFixed(0)}
                            </td>
                            <td className="py-3 text-center font-bold text-slate-400 text-[10px] uppercase">
                               {(() => {
                                 const ch = job.paymentChannel || job.paymentMethod || "-";
                                 if (ch.toLowerCase() === "credit") return "Deduct Member";
                                 if (ch.toLowerCase() === "card") return "Credit Card";
                                 return ch;
                               })()}
                             </td>
                            <td className="py-3 text-right font-black text-slate-900 dark:text-slate-50">
                              {job.isWalletAffecting ? `฿${(job.displayWalletBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "-"}
                            </td>
                            <td className="py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                job.status === "completed" ? "bg-emerald-100 text-emerald-800" : (job.status === "topup" ? "bg-indigo-100 text-indigo-750" : "bg-indigo-50 text-indigo-600")
                              }`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              <button
                                onClick={() => {
                                  if (onViewJob) onViewJob(job);
                                  else setSelectedJobForView(job);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-350 text-[10px] font-black uppercase flex items-center gap-1 ml-auto cursor-pointer"
                              >
                                <Eye size={12} />
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-450 font-bold bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                    No orders or top-up history found.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-450 font-bold bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm space-y-2">
              <Users size={32} className="mx-auto text-indigo-400/80 mb-2" />
              <p className="text-sm">Please search and select a customer to view their report.</p>
              <p className="text-[10px] text-slate-400 font-medium">Type name, phone number, or Member No in the search bar above.</p>
            </div>
          )}
        </div>
      )}

      {/* View-Only Job Detail Modal */}
      {selectedJobForView && (
        <Dialog open={!!selectedJobForView} onOpenChange={() => setSelectedJobForView(null)}>
          <DialogContent className="max-w-lg p-6 bg-white overflow-y-auto max-h-[90vh] z-[9999] rounded-2xl shadow-2xl border-none">
            <DialogHeader className="mb-4 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <DialogTitle className="text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <ClipboardList size={18} className="text-indigo-500" />
                Job Details: {selectedJobForView.id}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-xs font-semibold text-slate-700">
              {/* Customer details banner */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Details</p>
                <div className="flex justify-between font-bold text-slate-800">
                  <span>Name: {selectedJobForView.customerName}</span>
                  <span>Phone: {selectedJobForView.customerPhone}</span>
                </div>
                {selectedJobForView.createdAt && (
                  <p className="text-[10px] text-slate-400 font-medium">Recorded Date: {format(new Date(selectedJobForView.createdAt), "dd MMM yyyy HH:mm")}</p>
                )}
              </div>

              {/* Status details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/50 space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Job Status</span>
                  <div className="text-slate-800 font-extrabold capitalize">{selectedJobForView.status}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/50 space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Payment Status</span>
                  <div className="flex items-center gap-1 text-slate-800 font-extrabold uppercase">
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
                <div className="border border-slate-200/80 rounded-xl overflow-hidden divide-y divide-slate-100 bg-slate-50/20">
                  {(selectedJobForView.items || []).length > 0 ? (
                    (selectedJobForView.items || []).map((it: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-3 text-xs font-bold text-slate-800">
                        <div className="flex flex-col gap-0.5">
                          <span>{it.name}</span>
                          <span className="text-[10px] text-slate-450 font-medium">Qty: {it.quantity} × ฿{it.price}</span>
                        </div>
                        <span className="font-extrabold text-slate-900">฿{(it.price * it.quantity).toFixed(0)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center font-bold text-slate-400">
                      {selectedJobForView.status === "topup" ? "Top-up Member Credits" : "No items listed"}
                    </div>
                  )}
                  <div className="flex justify-between items-center p-3 bg-slate-50/80 text-xs font-black text-slate-900">
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
                          <div key={index} className="border border-slate-205 rounded-xl overflow-hidden shadow-sm bg-slate-50 max-h-56 flex items-center justify-center p-1">
                            <img
                              src={url}
                              alt={`Receipt ${index + 1}`}
                              className="max-h-50 object-contain rounded-lg"
                            />
                          </div>
                        ));
                      } catch {
                        return (
                          <div className="border border-slate-205 rounded-xl overflow-hidden shadow-sm bg-slate-50 max-h-56 flex items-center justify-center p-1">
                            <img
                              src={selectedJobForView.billImageUrl}
                              alt="Receipt"
                              className="max-h-50 object-contain rounded-lg"
                            />
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-6 pt-3 border-t border-slate-100">
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
