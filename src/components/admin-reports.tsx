"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { useRiders } from "@/lib/use-riders";
import { shopStore, shiftStore, computeLiveShiftStats, jobStore, walletApprovalStore, type CashierShift, type Customer } from "@/lib/store";
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
  Building,
  Layers,
  Clock,
  Lock,
  FileText,
  Printer,
  Truck,
  HelpCircle,
  Sparkles,
  LayoutGrid,
  CreditCard,
  Receipt,
  Banknote,
  RefreshCw,
  Wallet
} from "lucide-react";
import { getTopUpTransactionsAction } from "@/actions/db";
import { printImageUrl } from "@/components/ui/multi-image-uploader";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ReportsSalesSummary } from "@/components/reports-sales-summary";
import { ReportsSalesByItem } from "@/components/reports-sales-by-item";
import { ReportsSalesByCategory } from "@/components/reports-sales-by-category";
import { ReportsSalesByEmployee } from "@/components/reports-sales-by-employee";
import { ReportsSalesByPaymentType } from "@/components/reports-sales-by-payment-type";
import { ReportsReceipts } from "@/components/reports-receipts";
import { ReportsTaxes } from "@/components/reports-taxes";

function normalizeReportChannelName(name?: string | null): string {
  if (!name || !name.trim()) return "Unspecified";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "cash" || lower === "cash / cod" || lower === "cash/cod") return "Cash / COD";
  if (lower === "promptpay" || lower === "prompt pay" || lower.includes("promptpay") || lower.includes("พร้อมเพย์") || lower === "qr code" || lower === "qr" || lower.includes("qr code")) return "PromptPay / QR";
  if (lower === "transfer" || lower === "โอน" || lower === "โอนเงิน") return "Transfer";
  if (lower === "credit card" || lower === "credit_card" || lower === "card" || lower === "บัตรเครดิต") return "Credit Card";
  if (lower === "deduct member" || lower === "wallet" || lower === "credit") return "Deduct Member";
  if (lower === "hq/credit" || lower === "hq credit") return "HQ/Credit";
  if (lower.includes("beam") || lower.includes("gateway")) return "Beam Gateway";
  return trimmed;
}

function getChannelBadgeStyle(channelName: string) {
  const lower = channelName.toLowerCase();
  if (lower.includes("cash") || lower.includes("เงินสด")) {
    return {
      barColor: "bg-emerald-500",
      textColor: "text-emerald-500 dark:text-emerald-400",
    };
  }
  if (lower.includes("promptpay") || lower.includes("พร้อมเพย์") || lower.includes("qr")) return { barColor: "bg-blue-500", textColor: "text-blue-500 dark:text-blue-400" };
  if (lower.includes("transfer") || lower.includes("โอน")) {
    return {
      barColor: "bg-indigo-500",
      textColor: "text-indigo-500 dark:text-indigo-400",
    };
  }
  if (lower.includes("card") || lower.includes("beam") || lower.includes("gateway") || lower.includes("บัตร")) {
    return {
      barColor: "bg-sky-500",
      textColor: "text-sky-500 dark:text-sky-400",
    };
  }
  if (lower.includes("member") || lower.includes("wallet") || lower.includes("กระเป๋า")) {
    return {
      barColor: "bg-purple-500",
      textColor: "text-purple-500 dark:text-purple-400",
    };
  }
  if (lower.includes("hq") || lower.includes("credit") || lower.includes("เครดิต")) {
    return {
      barColor: "bg-amber-500",
      textColor: "text-amber-500 dark:text-amber-400",
    };
  }
  return {
    barColor: "bg-teal-500",
    textColor: "text-teal-500 dark:text-teal-400",
  };
}

interface AdminReportsProps {
  onViewJob?: (job: any) => void;
}

export function AdminReports({ onViewJob }: AdminReportsProps) {
  const jobs = useJobs();
  const customers = useCustomers();
  const riders = useRiders();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const pendingWalletMap = useSyncExternalStore(walletApprovalStore.subscribe, walletApprovalStore.getSnapshot, walletApprovalStore.getSnapshot);

  // Sub-tabs state
  const [subTab, setSubTab] = useState<"overview" | "sales-summary" | "sale-report" | "sales-by-item" | "sales-by-category" | "sales-by-employee" | "sales-by-payment-type" | "receipts" | "taxes" | "shift" | "order" | "pos">("overview");
  const [saleReportSubTab, setSaleReportSubTab] = useState<"item" | "category" | "employee" | "payment-type">("item");

  // Filters State
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"today" | "7days" | "30days" | "month" | "custom">("30days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [customerSegment, setCustomerSegment] = useState<"retail" | "corporate" | "all">("retail");
  const [topUpTransactions, setTopUpTransactions] = useState<any[]>([]);

  const { customerIdMap, customerPhoneMap } = useMemo(() => {
    const idMap = new Map<string, Customer>();
    const phoneMap = new Map<string, Customer>();
    for (const c of customers) {
      if (c.id) idMap.set(c.id, c);
      const p1 = (c.phone || "").replace(/\D/g, "");
      if (p1.length >= 8) phoneMap.set(p1.slice(-9), c);
      const p2 = (c.secondaryPhone || "").replace(/\D/g, "");
      if (p2.length >= 8) phoneMap.set(p2.slice(-9), c);
    }
    return { customerIdMap: idMap, customerPhoneMap: phoneMap };
  }, [customers]);

  const isJobCorporate = useCallback((job: any): boolean => {
    let c: Customer | undefined;
    if (job.customerId && customerIdMap.has(job.customerId)) {
      c = customerIdMap.get(job.customerId);
    } else {
      const cleanPhone = (job.customerPhone || "").replace(/\D/g, "");
      if (cleanPhone.length >= 8) {
        c = customerPhoneMap.get(cleanPhone.slice(-9));
      }
    }
    return Boolean(c && (c.isCorporate || c.tier === "corporate"));
  }, [customerIdMap, customerPhoneMap]);
  
  // Tab-specific filters/search
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Shift orders dialog state
  const [selectedShiftForOrders, setSelectedShiftForOrders] = useState<CashierShift | null>(null);
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<any | null>(null);
  const [shiftOrdersSearchQuery, setShiftOrdersSearchQuery] = useState("");




  // Closed & Open shifts state
  const [closedShifts, setClosedShifts] = useState<any[]>([]);
  const [openShiftsList, setOpenShiftsList] = useState<CashierShift[]>([]);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);
  const [shiftStatusFilter, setShiftStatusFilter] = useState<"all" | "open" | "closed" | "variance">("all");
  const [shiftSearchQuery, setShiftSearchQuery] = useState("");

  const fetchAllShiftsForReport = useCallback(async () => {
    setIsLoadingShifts(true);
    try {
      const [closedRes, openRes] = await Promise.all([
        shiftStore.getClosedShifts(),
        shiftStore.getOpenShifts(),
      ]);
      setClosedShifts(closedRes || []);
      setOpenShiftsList(openRes || []);
    } catch (err) {
      console.error("Failed to load shifts for report:", err);
    } finally {
      setIsLoadingShifts(false);
    }
  }, []);

  // Load Open & Closed Shifts when Shift Tab is active
  useEffect(() => {
    if (subTab === "shift") {
      fetchAllShiftsForReport();
    }
  }, [subTab, fetchAllShiftsForReport]);

  // Listen for open-reports-tab custom event (e.g. from top header notification button)
  useEffect(() => {
    const handleOpenTab = (e: any) => {
      if (e.detail?.tab) {
        setSubTab(e.detail.tab);
      }
    };
    window.addEventListener("open-reports-tab", handleOpenTab);
    return () => window.removeEventListener("open-reports-tab", handleOpenTab);
  }, []);

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

    let active = true;
    const timer = setTimeout(() => {
      jobStore.fetchHistoricalJobs(start, end).catch(err => {
        console.error("Failed to load historical jobs for reports:", err);
      });
      getTopUpTransactionsAction({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      })
        .then((res) => {
          if (active && Array.isArray(res)) {
            setTopUpTransactions(res);
          }
        })
        .catch((err) => {
          console.error("Failed to load top-up transactions for overview report:", err);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dateRange, customStartDate, customEndDate]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove("printing-report");
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const isTopUpJob = useCallback((job: any): boolean => {
    if (!job) return false;
    if (job.status === "topup" || String(job.id).toUpperCase().startsWith("TU-")) return true;
    const jobItems = Array.isArray(job.items)
      ? job.items
      : typeof job.items === "string"
      ? (() => {
          try {
            return JSON.parse(job.items);
          } catch {
            return [];
          }
        })()
      : [];
    if (
      Array.isArray(jobItems) &&
      jobItems.length > 0 &&
      jobItems.every(
        (it: any) =>
          it?.category === "PACKAGE" ||
          it?.serviceId === "topup-member-item" ||
          it?.id === "topup-member-item"
      )
    ) {
      return true;
    }
    return false;
  }, []);

  // Filtered Jobs based on main branch, shopPaidAt timeframe, and excluding Top-Up jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Exclude Top-Up jobs
      if (isTopUpJob(job)) {
        return false;
      }

      // Only include Shop Paid jobs
      if (!job.isShopPaid) {
        return false;
      }

      // Branch filter
      if (selectedBranch !== "all" && job.branchId !== selectedBranch) {
        return false;
      }

      // Date filter using shopPaidAt (fallback to csoPaidAt / createdAt for legacy records)
      const rawPaidDate = (job as any).shopPaidAt || (job as any).csoPaidAt || job.createdAt;
      if (!rawPaidDate) return false;
      const jobDate = new Date(rawPaidDate);
      if (isNaN(jobDate.getTime())) return false;
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
  }, [jobs, selectedBranch, dateRange, customStartDate, customEndDate, isTopUpJob]);

  // Helper to check if a top-up transaction belongs to a corporate customer
  const isTopUpCorporate = useCallback((tx: any): boolean => {
    let c: Customer | undefined;
    if (tx.memberId && customerIdMap.has(tx.memberId)) {
      c = customerIdMap.get(tx.memberId);
    } else if (tx.customerPhone) {
      const cleanPhone = String(tx.customerPhone).replace(/\D/g, "");
      if (cleanPhone.length >= 8) {
        c = customerPhoneMap.get(cleanPhone.slice(-9));
      }
    }
    return Boolean(c && (c.isCorporate || c.tier === "corporate"));
  }, [customerIdMap, customerPhoneMap]);

  // Filtered Member Top-Up Transactions within selected branch & timeframe (plus any fallback TU- jobs)
  const filteredTopUps = useMemo(() => {
    const today = new Date();
    const isDateInRange = (d: Date) => {
      if (isNaN(d.getTime())) return false;
      if (dateRange === "today") {
        return d >= startOfDay(today) && d <= endOfDay(today);
      } else if (dateRange === "7days") {
        return d >= startOfDay(subDays(today, 7));
      } else if (dateRange === "30days") {
        return d >= startOfDay(subDays(today, 30));
      } else if (dateRange === "month") {
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      } else if (dateRange === "custom") {
        if (customStartDate) {
          const startMs = new Date(customStartDate).setHours(0, 0, 0, 0);
          if (d.getTime() < startMs) return false;
        }
        if (customEndDate) {
          const endMs = new Date(customEndDate).setHours(23, 59, 59, 999);
          if (d.getTime() > endMs) return false;
        }
        return true;
      }
      return true;
    };

    const list: Array<{
      id: string;
      memberId: string;
      customerName: string;
      customerPhone: string;
      amount: number;
      bonusAmount: number;
      totalCredit: number;
      packageName: string;
      paymentChannel: string;
      branchId: string | null;
      createdAt: string;
    }> = [];
    const seenIds = new Set<string>();

    topUpTransactions.forEach((t: any) => {
      const statusUpper = String(t.status || "").toUpperCase();
      if (statusUpper === "REJECTED" || statusUpper === "VOID" || statusUpper === "CANCELLED") return;
      if (selectedBranch !== "all" && t.branchId && t.branchId !== selectedBranch) return;
      const tDate = new Date(t.createdAt);
      if (!isDateInRange(tDate)) return;

      const rawAmt = Math.max(0, Number(t.amount) || 0);
      if (rawAmt <= 0) return;
      const bonus = Math.max(0, Number(t.bonusAmount) || 0);
      const totalCred = Math.max(0, Number(t.totalCredit) || 0);
      const amt =
        bonus > 0 && totalCred > 0 && Math.abs(rawAmt - totalCred) < 0.01
          ? Math.max(0, rawAmt - bonus)
          : rawAmt;
      const credit = Math.max(amt, totalCred || amt + bonus);

      seenIds.add(String(t.id));
      list.push({
        id: String(t.id),
        memberId: t.memberId || "",
        customerName: t.customerName || "Member",
        customerPhone: t.customerPhone || "",
        amount: amt,
        bonusAmount: bonus,
        totalCredit: credit,
        packageName: t.packageName || "Member Top-Up",
        paymentChannel: t.paymentChannel || "PromptPay / QR",
        branchId: t.branchId || null,
        createdAt: t.createdAt,
      });
    });

    // Also include any paid Top-Up jobs in jobs that were not already in topUpTransactions
    jobs.forEach((job: any) => {
      if (!isTopUpJob(job) || !job.isShopPaid || job.status === "cancel") return;
      if (seenIds.has(String(job.id))) return;
      if (selectedBranch !== "all" && job.branchId !== selectedBranch) return;
      const rawDate = job.shopPaidAt || job.csoPaidAt || job.createdAt;
      if (!rawDate) return;
      const jDate = new Date(rawDate);
      if (!isDateInRange(jDate)) return;

      const amt = Math.max(0, Number(job.totalAmount) || 0);
      if (amt <= 0) return;

      const duplicate = list.some(
        (existing) =>
          Math.abs(existing.amount - amt) < 1 &&
          Math.abs(new Date(existing.createdAt).getTime() - jDate.getTime()) < 5 * 60 * 1000
      );
      if (duplicate) return;

      seenIds.add(String(job.id));
      list.push({
        id: String(job.id),
        memberId: job.customerId || "",
        customerName: job.customerName || "Member",
        customerPhone: job.customerPhone || "",
        amount: amt,
        bonusAmount: 0,
        totalCredit: amt,
        packageName: "Member Top-Up",
        paymentChannel: job.paymentChannel || job.paymentMethod || "PromptPay / QR",
        branchId: job.branchId || null,
        createdAt: jDate.toISOString(),
      });
    });

    return list;
  }, [topUpTransactions, jobs, isTopUpJob, selectedBranch, dateRange, customStartDate, customEndDate]);

  // Segment counts for jobs + member top-ups within selected timeframe & branch
  const segmentCounts = useMemo(() => {
    let retail = 0;
    let corporate = 0;
    filteredJobs.forEach((job) => {
      if (isJobCorporate(job)) {
        corporate++;
      } else {
        retail++;
      }
    });
    filteredTopUps.forEach((tx) => {
      if (isTopUpCorporate(tx)) {
        corporate++;
      } else {
        retail++;
      }
    });
    return {
      retail,
      corporate,
      all: retail + corporate,
    };
  }, [filteredJobs, filteredTopUps, isJobCorporate, isTopUpCorporate]);

  // Jobs filtered by customer segment specifically for Overview Dashboard
  const overviewJobs = useMemo(() => {
    if (customerSegment === "all") return filteredJobs;
    if (customerSegment === "corporate") return filteredJobs.filter((j) => isJobCorporate(j));
    return filteredJobs.filter((j) => !isJobCorporate(j));
  }, [filteredJobs, customerSegment, isJobCorporate]);

  // Top-Ups filtered by customer segment specifically for Overview Dashboard
  const overviewTopUps = useMemo(() => {
    if (customerSegment === "all") return filteredTopUps;
    if (customerSegment === "corporate") return filteredTopUps.filter((t) => isTopUpCorporate(t));
    return filteredTopUps.filter((t) => !isTopUpCorporate(t));
  }, [filteredTopUps, customerSegment, isTopUpCorporate]);

  // CRM customer count by segment
  const segmentCustomersCount = useMemo(() => {
    if (customerSegment === "all") return customers.length;
    if (customerSegment === "corporate") {
      return customers.filter((c) => c.isCorporate || c.tier === "corporate").length;
    }
    return customers.filter((c) => !c.isCorporate && c.tier !== "corporate").length;
  }, [customers, customerSegment]);

  // Active Members count in CRM
  const activeMembersCount = useMemo(() => {
    return customers.filter(
      (c) =>
        c.isMember ||
        c.tier === "member" ||
        (c.memberId && String(c.memberId).trim().length > 0) ||
        (Number(c.creditBalance) || 0) > 0
    ).length;
  }, [customers]);

  // Metric summaries for Overview Panel (including Member Top-Ups)
  const overviewStats = useMemo(() => {
    let laundryRevenue = 0;
    let topUpRevenue = 0;
    let topUpBonus = 0;
    let topUpTotalCredit = 0;
    let topUpCount = 0;

    let completedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    
    let cashSum = 0;
    let transferSum = 0;
    let cardSum = 0;
    let creditSum = 0;

    const channelMap: Record<string, { channel: string; revenue: number; count: number }> = {};
    const productSales: Record<string, { count: number; revenue: number; isTopUp?: boolean }> = {};

    const addPaymentToChannelAndCategory = (rawChannel: string | undefined | null, rawMethod: string | undefined | null, amt: number) => {
      if (amt <= 0) return;
      const normName = normalizeReportChannelName(rawChannel || rawMethod);
      if (!channelMap[normName]) {
        channelMap[normName] = { channel: normName, revenue: 0, count: 0 };
      }
      channelMap[normName].revenue += amt;
      channelMap[normName].count += 1;

      const ch = normName.toLowerCase();
      const m = (rawMethod || "").toLowerCase();
      if (ch.includes("cash") || m.includes("cash")) {
        cashSum += amt;
      } else if (ch.includes("transfer") || ch.includes("promptpay") || ch.includes("qr") || ch.includes("wise") || m.includes("transfer")) {
        transferSum += amt;
      } else if (ch.includes("card") || ch.includes("gateway") || ch.includes("beam") || m.includes("card")) {
        cardSum += amt;
      } else {
        creditSum += amt;
      }
    };

    // 1. Process Laundry Service Jobs
    overviewJobs.forEach(job => {
      if (job.status === "cancel") {
        cancelledCount++;
        return;
      }
      
      if (job.status === "completed") {
        completedCount++;
      } else {
        pendingCount++;
      }

      if (job.isShopPaid) {
        const jobAmt = job.totalAmount || 0;
        laundryRevenue += jobAmt;
        
        let splitProcessed = false;
        if (job.adminNotesJson) {
          try {
            const parsed = JSON.parse(job.adminNotesJson);
            if (Array.isArray(parsed?.payments) && parsed.payments.length > 0) {
              parsed.payments.forEach((p: any) => {
                const amt = Number(p.amount) || 0;
                addPaymentToChannelAndCategory(p.channel, p.method, amt);
              });
              splitProcessed = true;
            }
          } catch {}
        }

        if (!splitProcessed) {
          addPaymentToChannelAndCategory(job.paymentChannel, job.paymentMethod, jobAmt);
        }
      }

      // Item breakdown (Laundry items)
      try {
        if (job.items) {
          const itemsList = typeof job.items === "string" ? JSON.parse(job.items) : job.items;
          if (Array.isArray(itemsList)) {
            itemsList.forEach((item: any) => {
              if (
                item?.category === "PACKAGE" ||
                item?.serviceId === "topup-member-item" ||
                item?.id === "topup-member-item"
              ) {
                return;
              }
              const name = item.name || "General Laundry";
              const qty = item.quantity || 1;
              const price = item.price || 0;
              const rev = qty * price;

              if (!productSales[name]) {
                productSales[name] = { count: 0, revenue: 0, isTopUp: false };
              }
              productSales[name].count = Math.round((productSales[name].count + qty) * 100) / 100;
              productSales[name].revenue = Math.round((productSales[name].revenue + rev) * 100) / 100;
            });
          }
        }
      } catch (e) {}
    });

    // 2. Process Member Top-Up Transactions
    overviewTopUps.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (amt <= 0) return;
      topUpRevenue += amt;
      topUpBonus += Number(tx.bonusAmount) || 0;
      topUpTotalCredit += Number(tx.totalCredit) || amt;
      topUpCount += 1;

      // Add top-up payment into Payment Channels Share & Payment Category Breakdown
      addPaymentToChannelAndCategory(tx.paymentChannel, tx.paymentChannel, amt);

      // Add Member Top-Up into Top-Selling Products & Services
      const topUpItemName = "MEMBER TOP-UP (แพ็กเกจเติมเงินสมาชิก)";
      if (!productSales[topUpItemName]) {
        productSales[topUpItemName] = { count: 0, revenue: 0, isTopUp: true };
      }
      productSales[topUpItemName].count += 1;
      productSales[topUpItemName].revenue = Math.round((productSales[topUpItemName].revenue + amt) * 100) / 100;
    });

    const totalRevenue = laundryRevenue + topUpRevenue;
    const paidOrdersCount = completedCount + pendingCount;
    const totalTransactionsCount = paidOrdersCount + topUpCount;
    const averageTicket = totalTransactionsCount > 0 ? totalRevenue / totalTransactionsCount : 0;
    const laundryAverageTicket = paidOrdersCount > 0 ? laundryRevenue / paidOrdersCount : 0;

    const channelBreakdown = Object.values(channelMap)
      .map(item => ({
        ...item,
        revenue: Math.round(item.revenue * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const allProductsSorted = Object.entries(productSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalProductRevenue = allProductsSorted.reduce((acc, p) => acc + p.revenue, 0);
    const totalProductUnits = allProductsSorted
      .filter((p) => !p.isTopUp)
      .reduce((acc, p) => acc + p.count, 0);
    const topProducts = allProductsSorted.slice(0, 8);

    return {
      totalRevenue,
      laundryRevenue,
      topUpRevenue,
      topUpBonus,
      topUpTotalCredit,
      topUpCount,
      completedCount,
      pendingCount,
      cancelledCount,
      averageTicket,
      laundryAverageTicket,
      totalTransactionsCount,
      totalProductRevenue,
      totalProductUnits,
      paymentBreakdown: {
        cash: cashSum,
        transfer: transferSum,
        card: cardSum,
        credit: creditSum
      },
      channelBreakdown,
      topProducts
    };
  }, [overviewJobs, overviewTopUps]);

  // --- Sales Trend & Operations Volume Chart States & Logic ---
  const [trendMetric, setTrendMetric] = useState<"both" | "sales" | "volume">("both");
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  // Time-bucket aggregation for Overview Chart (Includes Laundry Orders + Member Top-Ups)
  const trendBuckets = useMemo(() => {
    const today = new Date();
    interface Bucket {
      id: string;
      label: string;
      subLabel: string;
      sales: number;
      laundrySales: number;
      topUpSales: number;
      volume: number;
      laundryVolume: number;
      topUpVolume: number;
      dateStart: Date;
      dateEnd: Date;
    }
    const buckets: Bucket[] = [];

    const makeEmptyBucket = (id: string, label: string, subLabel: string, dateStart: Date, dateEnd: Date): Bucket => ({
      id,
      label,
      subLabel,
      sales: 0,
      laundrySales: 0,
      topUpSales: 0,
      volume: 0,
      laundryVolume: 0,
      topUpVolume: 0,
      dateStart,
      dateEnd,
    });

    if (dateRange === "today") {
      for (let h = 0; h < 24; h += 2) {
        const s = new Date(today);
        s.setHours(h, 0, 0, 0);
        const e = new Date(today);
        e.setHours(h + 1, 59, 59, 999);
        const startStr = `${String(h).padStart(2, "0")}:00`;
        const endStr = `${String(h + 2).padStart(2, "0")}:00`;
        buckets.push(makeEmptyBucket(`h-${h}`, startStr, `${startStr} - ${endStr}`, s, e));
      }
    } else if (dateRange === "7days") {
      for (let i = 6; i >= 0; i--) {
        const d = subDays(today, i);
        buckets.push(makeEmptyBucket(`d-${format(d, "yyyy-MM-dd")}`, format(d, "EEE d/M"), format(d, "EEEE, d MMM yyyy"), startOfDay(d), endOfDay(d)));
      }
    } else if (dateRange === "30days") {
      for (let i = 29; i >= 0; i--) {
        const d = subDays(today, i);
        buckets.push(makeEmptyBucket(`d-${format(d, "yyyy-MM-dd")}`, format(d, "d/M"), format(d, "EEEE, d MMM yyyy"), startOfDay(d), endOfDay(d)));
      }
    } else if (dateRange === "month") {
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(today.getFullYear(), today.getMonth(), day);
        buckets.push(makeEmptyBucket(`d-${format(d, "yyyy-MM-dd")}`, String(day), format(d, "EEEE, d MMM yyyy"), startOfDay(d), endOfDay(d)));
      }
    } else if (dateRange === "custom") {
      const sDate = customStartDate ? new Date(customStartDate) : subDays(today, 30);
      const eDate = customEndDate ? new Date(customEndDate) : today;
      const sTime = startOfDay(sDate).getTime();
      const eTime = endOfDay(eDate).getTime();
      const diffDays = Math.max(1, Math.round((eTime - sTime) / (1000 * 60 * 60 * 24)));

      if (diffDays <= 2) {
        for (let h = 0; h < 24; h += 2) {
          const s = new Date(sDate);
          s.setHours(h, 0, 0, 0);
          const e = new Date(sDate);
          e.setHours(h + 1, 59, 59, 999);
          const startStr = `${String(h).padStart(2, "0")}:00`;
          const endStr = `${String(h + 2).padStart(2, "0")}:00`;
          buckets.push(makeEmptyBucket(`h-${h}`, startStr, `${startStr} - ${endStr}`, s, e));
        }
      } else if (diffDays <= 35) {
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(sTime + i * 24 * 60 * 60 * 1000);
          buckets.push(makeEmptyBucket(`d-${format(d, "yyyy-MM-dd")}`, format(d, "d/M"), format(d, "EEEE, d MMM yyyy"), startOfDay(d), endOfDay(d)));
        }
      } else {
        const numWeeks = Math.ceil(diffDays / 7);
        for (let w = 0; w < numWeeks; w++) {
          const s = new Date(sTime + w * 7 * 24 * 60 * 60 * 1000);
          const e = new Date(Math.min(eTime, sTime + (w + 1) * 7 * 24 * 60 * 60 * 1000 - 1));
          buckets.push(makeEmptyBucket(`w-${w}`, `W${w + 1}`, `${format(s, "d/M")} - ${format(e, "d/M/yy")}`, s, e));
        }
      }
    }

    // Populate data from overviewJobs (using shopPaidAt timestamp)
    overviewJobs.forEach((job) => {
      if (job.status === "cancel") return;
      const rawPaidDate = (job as any).shopPaidAt || (job as any).csoPaidAt || job.createdAt;
      if (!rawPaidDate) return;
      const jobTime = new Date(rawPaidDate).getTime();
      if (isNaN(jobTime)) return;

      const b = buckets.find(
        (b) => jobTime >= b.dateStart.getTime() && jobTime <= b.dateEnd.getTime()
      );
      if (b) {
        b.volume += 1;
        b.laundryVolume += 1;
        if (job.isShopPaid) {
          const amt = job.totalAmount || 0;
          b.sales += amt;
          b.laundrySales += amt;
        }
      }
    });

    // Populate data from overviewTopUps
    overviewTopUps.forEach((tx) => {
      if (!tx.createdAt) return;
      const txTime = new Date(tx.createdAt).getTime();
      if (isNaN(txTime)) return;

      const b = buckets.find(
        (b) => txTime >= b.dateStart.getTime() && txTime <= b.dateEnd.getTime()
      );
      if (b) {
        const amt = Number(tx.amount) || 0;
        b.volume += 1;
        b.topUpVolume += 1;
        b.sales += amt;
        b.topUpSales += amt;
      }
    });

    return buckets;
  }, [overviewJobs, overviewTopUps, dateRange, customStartDate, customEndDate]);

  // Calculations for chart scaling and coordinates
  const trendChartStats = useMemo(() => {
    let totalSales = 0;
    let laundrySales = 0;
    let topUpSales = 0;
    let totalVolume = 0;
    let laundryVolume = 0;
    let topUpVolume = 0;
    let maxSales = 0;
    let maxVolume = 0;

    trendBuckets.forEach((b) => {
      totalSales += b.sales;
      laundrySales += b.laundrySales;
      topUpSales += b.topUpSales;
      totalVolume += b.volume;
      laundryVolume += b.laundryVolume;
      topUpVolume += b.topUpVolume;
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
      laundrySales,
      topUpSales,
      totalVolume,
      laundryVolume,
      topUpVolume,
      maxSales,
      maxVolume,
      avgTicket,
    };
  }, [trendBuckets]);

  // SVG Chart Geometry for Overview Trend Chart (High-Resolution Proportional ViewBox)
  const chartW = 820;
  const chartH = 225;
  const pLeft = 58;
  const pRight = 44;
  const pTop = 18;
  const pBottom = 28;
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

  // 1. Shift Report calculations (combines Open + Closed shifts with live stats from All Jobs & POS)
  const shiftReportData = useMemo(() => {
    const today = new Date();
    let rangeStart = startOfDay(today).getTime();
    let rangeEnd = endOfDay(today).getTime();

    if (dateRange === "7days") {
      rangeStart = startOfDay(subDays(today, 7)).getTime();
    } else if (dateRange === "30days") {
      rangeStart = startOfDay(subDays(today, 30)).getTime();
    } else if (dateRange === "month") {
      const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
      mStart.setHours(0, 0, 0, 0);
      rangeStart = mStart.getTime();
    } else if (dateRange === "custom") {
      if (customStartDate) {
        const s = new Date(customStartDate);
        s.setHours(0, 0, 0, 0);
        rangeStart = s.getTime();
      } else {
        rangeStart = 0;
      }
      if (customEndDate) {
        const e = new Date(customEndDate);
        e.setHours(23, 59, 59, 999);
        rangeEnd = e.getTime();
      }
    }

    // Merge open shifts and closed shifts without duplicates
    const combinedMap = new Map<string, any>();
    openShiftsList.forEach(s => combinedMap.set(s.id, { ...s, status: "open" }));
    closedShifts.forEach(s => {
      if (!combinedMap.has(s.id)) {
        combinedMap.set(s.id, { ...s, status: s.status || "closed" });
      }
    });

    const enriched = Array.from(combinedMap.values()).map((shift) => {
      const live = computeLiveShiftStats(shift, jobs);
      const isOpen = shift.status === "open";
      const cashSales = isOpen ? live.cashSales : Math.max(Number(shift.cashSales) || 0, live.cashSales);
      const transferSales = isOpen ? live.transferSales : Math.max(Number(shift.transferSales) || 0, live.transferSales);
      const cardSales = isOpen ? live.cardSales : Math.max(Number(shift.cardSales) || 0, live.cardSales);
      const creditSales = isOpen ? live.creditSales : Math.max(Number(shift.creditSales) || 0, live.creditSales);
      const expectedCash = isOpen ? live.expectedCash : (Number(shift.expectedCash) || ((Number(shift.startingCash) || 0) + cashSales));
      const totalOrders = isOpen ? live.totalOrders : Math.max(Number(shift.totalOrders) || 0, live.totalOrders);
      const cashOrders = isOpen ? live.cashOrders : Math.max(Number(shift.cashOrders) || 0, live.cashOrders);
      const transferOrders = isOpen ? live.transferOrders : Math.max(Number(shift.transferOrders) || 0, live.transferOrders);
      const cardOrders = isOpen ? live.cardOrders : Math.max(Number(shift.cardOrders) || 0, live.cardOrders);
      const creditOrders = isOpen ? live.creditOrders : Math.max(Number(shift.creditOrders) || 0, live.creditOrders);
      const totalRevenue = cashSales + transferSales + cardSales + creditSales;
      const nonCashSales = transferSales + cardSales + creditSales;
      const variance = isOpen ? 0 : ((Number(shift.actualCash) || 0) - expectedCash);

      return {
        ...shift,
        cashSales,
        transferSales,
        cardSales,
        creditSales,
        nonCashSales,
        totalRevenue,
        expectedCash,
        totalOrders,
        cashOrders,
        transferOrders,
        cardOrders,
        creditOrders,
        walkInOrders: live.walkInOrders,
        deliveryOrders: live.deliveryOrders,
        variance,
      };
    });

    const q = shiftSearchQuery.trim().toLowerCase();

    return enriched
      .filter((shift) => {
        if (selectedBranch !== "all" && shift.branchId !== selectedBranch) return false;

        // Status filter
        if (shiftStatusFilter === "open" && shift.status !== "open") return false;
        if (shiftStatusFilter === "closed" && shift.status !== "closed") return false;
        if (shiftStatusFilter === "variance" && (shift.status !== "closed" || Math.abs(shift.variance) < 0.01)) return false;

        // Date range filter (always keep currently open shifts visible when viewing 'today')
        const openedMs = shift.openedAt ? new Date(shift.openedAt).getTime() : 0;
        const closedMs = shift.closedAt ? new Date(shift.closedAt).getTime() : openedMs;
        const inDateRange =
          (openedMs >= rangeStart && openedMs <= rangeEnd) ||
          (closedMs >= rangeStart && closedMs <= rangeEnd) ||
          (shift.status === "open" && dateRange === "today");
        if (!inDateRange) return false;

        if (q) {
          const branchName = (shops.find(s => s.id === shift.branchId)?.name || "").toLowerCase();
          const matchId = shift.id.toLowerCase().includes(q);
          const matchUser = (shift.userName || "").toLowerCase().includes(q);
          const matchNotes = (shift.notes || "").toLowerCase().includes(q);
          const matchBranch = branchName.includes(q);
          if (!matchId && !matchUser && !matchNotes && !matchBranch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.status === "open" && b.status !== "open") return -1;
        if (a.status !== "open" && b.status === "open") return 1;
        return new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
      });
  }, [
    openShiftsList,
    closedShifts,
    jobs,
    selectedBranch,
    dateRange,
    customStartDate,
    customEndDate,
    shiftStatusFilter,
    shiftSearchQuery,
    shops,
  ]);

  const shiftSummaryStats = useMemo(() => {
    let openCount = 0;
    let closedCount = 0;
    let totalOrders = 0;
    let totalCashSales = 0;
    let totalNonCashSales = 0;
    let totalRevenue = 0;
    let totalStartingCash = 0;
    let netVariance = 0;
    let shortageShiftCount = 0;
    let overageShiftCount = 0;

    shiftReportData.forEach((s) => {
      if (s.status === "open") openCount++;
      else closedCount++;
      totalOrders += s.totalOrders || 0;
      totalCashSales += s.cashSales || 0;
      totalNonCashSales += s.nonCashSales || 0;
      totalRevenue += s.totalRevenue || 0;
      totalStartingCash += s.startingCash || 0;
      if (s.status === "closed") {
        netVariance += s.variance || 0;
        if (s.variance < -0.01) shortageShiftCount++;
        else if (s.variance > 0.01) overageShiftCount++;
      }
    });

    return {
      totalShifts: shiftReportData.length,
      openCount,
      closedCount,
      totalOrders,
      totalCashSales,
      totalNonCashSales,
      totalRevenue,
      totalStartingCash,
      netVariance,
      shortageShiftCount,
      overageShiftCount,
    };
  }, [shiftReportData]);

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
              if (pay.shiftId && pay.shiftId === shift.id) return true;
              const payTime = new Date(pay.timestamp).getTime();
              if (!pay.shiftId && payTime >= shiftOpenTime && payTime <= shiftCloseTime) {
                return true;
              }
            }
          }
        } catch (e) {}
      }

      // Legacy fallback check
      if (job.createdAt) {
        const jobTime = new Date(job.createdAt).getTime();
        if (jobTime >= shiftOpenTime && jobTime <= shiftCloseTime && job.createdBy === shift.userName && job.isShopPaid) {
          return true;
        }
      }

      return false;
    });

    if (shiftOrdersSearchQuery.trim()) {
      const q = shiftOrdersSearchQuery.toLowerCase();
      return filtered.filter(j => 
        j.id?.toLowerCase().includes(q) ||
        j.billNo?.toLowerCase().includes(q) ||
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
        if (orderPaymentFilter === "paid" && !job.isShopPaid) return false;
        if (orderPaymentFilter === "unpaid" && job.isShopPaid) return false;
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
      if (job.isShopPaid) {
        posRevenue += job.totalAmount || 0;
        
        let splitProcessed = false;
        if (job.adminNotesJson) {
          try {
            const parsed = JSON.parse(job.adminNotesJson);
            if (Array.isArray(parsed?.payments) && parsed.payments.length > 0) {
              parsed.payments.forEach((p: any) => {
                const amt = Number(p.amount) || 0;
                const ch = (p.channel || "").toLowerCase();
                const m = (p.method || "").toLowerCase();
                if (ch.includes("cash") || m === "cash") {
                  cashPos += amt;
                } else if (ch.includes("transfer") || ch.includes("promptpay") || m === "transfer") {
                  transferPos += amt;
                } else if (ch.includes("card") || ch.includes("gateway") || ch.includes("beam") || m === "card") {
                  cardPos += amt;
                } else {
                  creditPos += amt;
                }
              });
              splitProcessed = true;
            }
          } catch {}
        }

        if (!splitProcessed) {
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
      csvContent += `Branch,${selectedBranch === "all" ? "All Branches" : selectedBranch === "ONLINE" ? "Online" : (shops.find(s => s.id === selectedBranch)?.name || selectedBranch)}\n`;
      csvContent += `Date Range,${dateRange}\n`;
      csvContent += `Customer Segment,${customerSegment === "corporate" ? "Corporate" : customerSegment === "retail" ? "Retail" : "All"}\n\n`;
      
      csvContent += "Metric,Value\n";
      csvContent += `Total Combined Revenue (Incl. Top-Up),฿${overviewStats.totalRevenue.toFixed(2)}\n`;
      csvContent += `Laundry Service Revenue,฿${overviewStats.laundryRevenue.toFixed(2)}\n`;
      csvContent += `Member Top-Up Revenue (${overviewStats.topUpCount} Top-Ups),฿${overviewStats.topUpRevenue.toFixed(2)}\n`;
      csvContent += `Member Top-Up Bonus Given,฿${overviewStats.topUpBonus.toFixed(2)}\n`;
      csvContent += `Completed Orders,${overviewStats.completedCount}\n`;
      csvContent += `Pending Orders,${overviewStats.pendingCount}\n`;
      csvContent += `Cancelled Orders,${overviewStats.cancelledCount}\n`;
      csvContent += `Average Ticket,฿${overviewStats.averageTicket.toFixed(2)}\n\n`;

      csvContent += "Payment Channels,Orders,Revenue,Share (%)\n";
      overviewStats.channelBreakdown.forEach((item) => {
        const pct = overviewStats.totalRevenue > 0 ? ((item.revenue / overviewStats.totalRevenue) * 100).toFixed(1) : "0.0";
        csvContent += `"${item.channel.replace(/"/g, '""')}",${item.count},฿${item.revenue.toFixed(2)},${pct}%\n`;
      });
      csvContent += "\n";

      csvContent += "Top Products,Qty Sold,Revenue\n";
      overviewStats.topProducts.forEach((prod: any) => {
        csvContent += `"${prod.name.replace(/"/g, '""')}",${prod.count},฿${prod.revenue.toFixed(2)}\n`;
      });

    } else if (subTab === "shift") {
      csvContent += "Cashier Drawer Shifts Report (All Jobs & POS)\n\n";
      csvContent += "Shift ID,Status,Branch,Cashier,Open Date,Close Date,Total Orders,Walk-In Orders,Delivery Orders,Start Float,Cash Sales,Transfer Sales,Card Sales,Member Wallet Sales,Total Revenue,Expected Cash,Actual Cash,Variance,Notes\n";
      
      shiftReportData.forEach(shift => {
        const openStr = shift.openedAt ? format(new Date(shift.openedAt), "yyyy-MM-dd HH:mm:ss") : "";
        const closeStr = shift.closedAt ? format(new Date(shift.closedAt), "yyyy-MM-dd HH:mm:ss") : "-";
        const branchName = (shops.find(s => s.id === shift.branchId)?.name || shift.branchId || "").replace(/"/g, '""');
        const cashierName = (shift.userName || shift.userEmail || "").replace(/"/g, '""');
        const notesStr = (shift.notes || "").replace(/"/g, '""');
        const expected = shift.expectedCash || 0;
        const actual = shift.status === "open" ? "" : (shift.actualCash ?? 0);
        const diff = shift.status === "open" ? "" : (shift.variance ?? 0);
        csvContent += `"${shift.id}","${(shift.status || 'closed').toUpperCase()}","${branchName}","${cashierName}","${openStr}","${closeStr}",${shift.totalOrders || 0},${shift.walkInOrders || 0},${shift.deliveryOrders || 0},${shift.startingCash || 0},${shift.cashSales || 0},${shift.transferSales || 0},${shift.cardSales || 0},${shift.creditSales || 0},${shift.totalRevenue || 0},${expected},${actual},${diff},"${notesStr}"\n`;
      });

    } else if (subTab === "order") {
      csvContent += "Order List Report\n\n";
      csvContent += "Order ID,Customer,Date,Status,Payment Channel,Paid Status,Delivery Fee,Total Amount,Source\n";
      
      orderReportData.forEach(job => {
        const dateStr = job.createdAt ? format(new Date(job.createdAt), "yyyy-MM-dd HH:mm:ss") : "";
        csvContent += `"${job.id}","${(job.customerName || "").replace(/"/g, '""')}","${dateStr}","${job.status}","${job.paymentChannel || ""}","${job.isShopPaid ? 'Paid' : 'Unpaid'}",${job.fee || 0},${job.totalAmount || 0},"${job.source || ""}"\n`;
      });

    } else if (subTab === "pos") {
      csvContent += "POS Sales Report\n\n";
      csvContent += "Order ID,Customer,Date,Status,Payment Channel,Paid Status,Total Amount\n";
      
      posReportData.list.forEach(job => {
        const dateStr = job.createdAt ? format(new Date(job.createdAt), "yyyy-MM-dd HH:mm:ss") : "";
        csvContent += `"${job.id}","${(job.customerName || "").replace(/"/g, '""')}","${dateStr}","${job.status}","${job.paymentChannel || ""}","${job.isShopPaid ? 'Paid' : 'Unpaid'}",${job.totalAmount || 0}\n`;
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
    if (selectedBranch === "ONLINE") return "Online";
    return shops.find(s => s.id === selectedBranch)?.name || "Selected Branch";
  }, [selectedBranch, shops]);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-900 font-sans">
      
      {/* Upper Title & Filter Command Bar */}
      <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <BarChart2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  Reports & Analytics
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                  Executive Insights
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                รายงานวิเคราะห์ผลประกอบการ ยอดขาย ช่องทางการชำระเงิน และสถิติการดำเนินงานแบบเรียลไทม์
              </p>
            </div>
          </div>

          {/* Filter Toolbar Controls */}
          {subTab !== "sales-summary" && subTab !== "sale-report" && subTab !== "sales-by-item" && subTab !== "sales-by-category" && subTab !== "sales-by-employee" && subTab !== "sales-by-payment-type" && subTab !== "receipts" && subTab !== "taxes" && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Branch Select */}
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-2xs">
                <Store size={14} className="text-indigo-600 dark:text-indigo-400" />
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer border-none p-0 pr-5 select-none"
                >
                  <option value="all">All Branches (ทุกสาขา)</option>
                  <option value="ONLINE">Online</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl p-1">
                {(["today", "7days", "30days", "month", "custom"] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                      dateRange === range
                        ? "bg-indigo-600 text-white shadow-xs font-black"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {range === "7days" ? "7 Days" : range === "30days" ? "30 Days" : range}
                  </button>
                ))}
              </div>

              {/* Custom Date Picker Inputs */}
              {dateRange === "custom" && (
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-2xs animate-in fade-in duration-200">
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
                className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-bold text-emerald-700 dark:text-emerald-300 rounded-xl px-3.5 py-2 shadow-2xs cursor-pointer transition-all"
              >
                <Download size={14} className="text-emerald-600 dark:text-emerald-400" />
                Export Excel
              </button>

              <button 
                onClick={() => {
                  document.body.classList.add("printing-report");
                  setTimeout(() => {
                    window.print();
                  }, 50);
                }}
                className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-xl px-3.5 py-2 shadow-2xs cursor-pointer transition-all"
              >
                <Printer size={14} className="text-slate-500" />
                {subTab === "overview" ? "Print Overview" :
                 subTab === "shift" ? "Print Shift Report" :
                 subTab === "order" ? "Print Order Report" :
                 subTab === "pos" ? "Print POS Report" : "Print Report"}
              </button>
            </div>
          )}
        </div>

        {/* Modern Pill Sub-Tab Navigation Dock */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {[
            { id: "overview", label: "Overview Dashboard", icon: BarChart2, activeMatch: (t: string) => t === "overview" },
            { id: "sales-summary", label: "Sales Summary", icon: TrendingUp, activeMatch: (t: string) => t === "sales-summary" },
            { id: "sale-report", label: "Sale Report", icon: ShoppingBag, activeMatch: (t: string) => ["sale-report", "sales-by-item", "sales-by-category", "sales-by-employee", "sales-by-payment-type"].includes(t) },
            { id: "receipts", label: "Receipts", icon: Receipt, activeMatch: (t: string) => t === "receipts" },
            { id: "taxes", label: "Taxes", icon: Percent, activeMatch: (t: string) => t === "taxes" },
            { id: "shift", label: "Shift Report", icon: History, activeMatch: (t: string) => t === "shift" },
            { id: "order", label: "Order Report", icon: ClipboardList, activeMatch: (t: string) => t === "order" },
            { id: "pos", label: "POS Report", icon: Store, activeMatch: (t: string) => t === "pos" },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.activeMatch(subTab);
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={14} className={isActive ? "text-white" : "text-slate-400"} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RENDER ACTIVE SUBTAB CONTENT */}

      {/* 1. OVERVIEW DASHBOARD */}
      {subTab === "overview" && (
        <div className="space-y-5">
          {/* Unified Customer Segment & Live Operations Context Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-850 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-2 text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Building size={14} />
                </div>
                <div>
                  <span className="block text-[11px] font-black text-slate-800 dark:text-slate-100 leading-tight">กลุ่มลูกค้า / Customer Segment</span>
                  <span className="block text-[10px] font-medium text-slate-400 leading-tight">เลือกกรองข้อมูลตามประเภทลูกค้า</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700">
                {/* 1. Retail */}
                <button
                  type="button"
                  onClick={() => setCustomerSegment("retail")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    customerSegment === "retail"
                      ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs font-black"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <User size={13} className={customerSegment === "retail" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
                  <span>ทั่วไป (Retail)</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black font-mono ${
                    customerSegment === "retail" ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300" : "bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}>
                    {segmentCounts.retail}
                  </span>
                </button>

                {/* 2. Corporate */}
                <button
                  type="button"
                  onClick={() => setCustomerSegment("corporate")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    customerSegment === "corporate"
                      ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 shadow-xs font-black"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Building size={13} className={customerSegment === "corporate" ? "text-amber-600 dark:text-amber-400" : "text-slate-400"} />
                  <span>องค์กร (Corporate)</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black font-mono ${
                    customerSegment === "corporate" ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300" : "bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}>
                    {segmentCounts.corporate}
                  </span>
                </button>

                {/* 3. All */}
                <button
                  type="button"
                  onClick={() => setCustomerSegment("all")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    customerSegment === "all"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs font-black"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Layers size={13} className={customerSegment === "all" ? "text-slate-800 dark:text-slate-200" : "text-slate-400"} />
                  <span>ทั้งหมด (All)</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black font-mono ${
                    customerSegment === "all" ? "bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100" : "bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}>
                    {segmentCounts.all}
                  </span>
                </button>
              </div>
            </div>

            {/* Right: Live Context Summary Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                <Store size={13} className="text-indigo-500" />
                <span className="text-slate-500 dark:text-slate-400 font-medium">สาขา:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{activeBranchName}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60">
                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">อัตราจบงาน:</span>
                <span className="font-mono font-black text-emerald-800 dark:text-emerald-200">
                  {overviewStats.completedCount + overviewStats.pendingCount > 0
                    ? `${Math.round((overviewStats.completedCount / (overviewStats.completedCount + overviewStats.pendingCount)) * 100)}%`
                    : "0%"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60">
                <Package size={13} className="text-amber-600 dark:text-amber-400" />
                <span className="text-amber-800 dark:text-amber-300 font-medium">จำนวนชิ้นรวม:</span>
                <span className="font-mono font-black text-amber-900 dark:text-amber-200">
                  {(overviewStats.totalProductUnits || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} ชิ้น
                </span>
              </div>
            </div>
          </div>

          {/* 5 Executive KPI Cards (Includes Member Top-Ups) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {/* Card 1: Total Combined Revenue (Laundry + Member Top-Ups) */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 border-t-4 border-t-indigo-600 shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-start gap-2.5">
                <div className="space-y-1 min-w-0">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400 block truncate">
                    Total Revenue (ยอดขายรวมทั้งหมด)
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight truncate">
                    ฿{overviewStats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <DollarSign size={20} />
                </div>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  ซักรีด: <strong className="font-mono text-slate-800 dark:text-slate-200">฿{overviewStats.laundryRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold text-[10px] font-mono">
                  +เติมเงิน: ฿{overviewStats.topUpRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Card 2: Member Top-Ups (ยอดเติมเงินสมาชิก) */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 border-t-4 border-t-purple-600 shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-start gap-2.5">
                <div className="space-y-1 min-w-0">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block truncate">
                    Member Top-Ups (เติมเงินสมาชิก)
                  </span>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                      ฿{overviewStats.topUpRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <span className="text-[11px] font-black text-purple-600 dark:text-purple-400 font-mono">
                      ({overviewStats.topUpCount} รายการ)
                    </span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/80 border border-purple-100 dark:border-purple-800/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                  <Wallet size={19} />
                </div>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  โบนัสแถม: <strong className="font-mono text-emerald-600 dark:text-emerald-400">+฿{overviewStats.topUpBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold text-[10px] font-mono">
                  เครดิตรวม: ฿{overviewStats.topUpTotalCredit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Card 3: Completed Orders */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 border-t-4 border-t-emerald-500 shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-start gap-2.5">
                <div className="space-y-1 min-w-0">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block truncate">
                    Completed Orders (งานที่สำเร็จ)
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                      {overviewStats.completedCount.toLocaleString()}
                    </h3>
                    <span className="text-xs font-bold text-slate-400">
                      / {(overviewStats.completedCount + overviewStats.pendingCount).toLocaleString()} บิล
                    </span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <ShoppingBag size={19} />
                </div>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                  <Clock size={12} className="text-amber-500" />
                  รอดำเนินการ: <strong className="font-mono text-amber-600 dark:text-amber-400">{overviewStats.pendingCount} บิล</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                  +Top-Up {overviewStats.topUpCount}
                </span>
              </div>
            </div>

            {/* Card 4: Average Order Size */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 border-t-4 border-t-amber-500 shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-start gap-2.5">
                <div className="space-y-1 min-w-0">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block truncate">
                    Average Ticket (ยอดเฉลี่ย/รายการ)
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                    ฿{overviewStats.averageTicket.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-100 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <Percent size={19} />
                </div>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium truncate">
                  เฉลี่ยซักรีด: <strong className="font-mono text-slate-700 dark:text-slate-200">฿{overviewStats.laundryAverageTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold text-[10px] shrink-0">
                  {overviewStats.totalTransactionsCount} รายการ
                </span>
              </div>
            </div>

            {/* Card 5: CRM Users & Members */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 border-t-4 border-t-sky-500 shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
              <div className="flex justify-between items-start gap-2.5">
                <div className="space-y-1 min-w-0">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block truncate">
                    {customerSegment === "corporate" ? "Corporate CRM (ลูกค้าองค์กร)" : "CRM & Members (ฐานลูกค้า)"}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                    {segmentCustomersCount.toLocaleString()}
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/80 border border-sky-100 dark:border-sky-800/60 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                  <Users size={19} />
                </div>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  สมาชิก (Members): <strong className="font-mono text-purple-600 dark:text-purple-400">{activeMembersCount.toLocaleString()}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold text-[10px]">
                  {customerSegment === "corporate" ? "B2B Corp" : customerSegment === "retail" ? "B2C Retail" : "All CRM"}
                </span>
              </div>
            </div>
          </div>

          {/* Main 12-Column Analytics Section: Trend Chart (8 cols) + Payment Channels Share (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 8 Cols: Sales Trend & Operations Volume Chart */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 lg:col-span-8 shadow-xs flex flex-col justify-between">
              <div>
                {/* Header with Title & Metric Toggles */}
                <div className="flex flex-wrap justify-between items-start gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                        Sales Trend & Operations Volume (รวมยอดเติมเงินสมาชิก)
                      </h3>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/50">
                        Includes Member Top-Ups
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      กราฟแนวโน้มยอดขายรายวัน (งานซักรีด + เติมเงินสมาชิก) เปรียบเทียบกับปริมาณรายการทั้งหมด
                    </p>
                  </div>

                  {/* Metric Selector Buttons */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setTrendMetric("both")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        trendMetric === "both"
                          ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-black"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                      }`}
                    >
                      รวม / Both
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendMetric("sales")}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        trendMetric === "sales"
                          ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-black"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                      ยอดขาย (Sales)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendMetric("volume")}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        trendMetric === "volume"
                          ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-black"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      จำนวนงาน (Volume)
                    </button>
                  </div>
                </div>

                {/* 4 Inline Summary Metrics Strip (Total Sales, Laundry Sales, Member Top-Ups, Volume) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                  <div className="bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">ยอดขายรวมตามกราฟ (Total)</span>
                    <span className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 font-mono mt-0.5 block">
                      ฿{trendChartStats.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">ยอดงานซักรีด (Laundry)</span>
                    <span className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100 font-mono mt-0.5 block">
                      ฿{trendChartStats.laundrySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-purple-50/60 dark:bg-purple-950/25 border border-purple-200/60 dark:border-purple-800/50 rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase block">เติมเงินสมาชิก (Top-Ups)</span>
                    <span className="text-sm sm:text-base font-black text-purple-700 dark:text-purple-300 font-mono mt-0.5 block">
                      ฿{trendChartStats.topUpSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3.5 py-2.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">ปริมาณรายการรวม (Volume)</span>
                    <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
                      {trendChartStats.laundryVolume.toLocaleString()} บิล + {trendChartStats.topUpVolume} เติมเงิน
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart Visual Area */}
              <div 
                className="w-full relative pt-2 select-none"
                onMouseLeave={() => setHoveredTrendIndex(null)}
              >
                {/* Floating Interactive Tooltip */}
                {hoveredTrendIndex !== null && trendPoints[hoveredTrendIndex] && (
                  <div
                    className="absolute pointer-events-none z-30 bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700/80 backdrop-blur-md text-xs transition-all duration-75"
                    style={{
                      left: `${(trendPoints[hoveredTrendIndex].x / chartW) * 100}%`,
                      top: "0px",
                      transform:
                        trendPoints[hoveredTrendIndex].x > chartW * 0.65
                          ? "translateX(-105%)"
                          : trendPoints[hoveredTrendIndex].x < chartW * 0.25
                          ? "translateX(5%)"
                          : "translateX(-50%)",
                    }}
                  >
                    <p className="font-bold text-[11px] text-slate-300 pb-1 border-b border-slate-700/60 mb-1.5 flex items-center justify-between gap-3">
                      <span>{trendPoints[hoveredTrendIndex].subLabel}</span>
                    </p>
                    <div className="space-y-1">
                      {(trendMetric === "both" || trendMetric === "sales") && (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                              ยอดขายรวม (Total):
                            </span>
                            <span className="font-mono font-black text-indigo-200">
                              ฿{trendPoints[hoveredTrendIndex].sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-[10.5px] text-slate-300 pl-3.5">
                            <span>• ซักรีด (Laundry):</span>
                            <span className="font-mono font-bold">
                              ฿{trendPoints[hoveredTrendIndex].laundrySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          {trendPoints[hoveredTrendIndex].topUpSales > 0 && (
                            <div className="flex items-center justify-between gap-4 text-[10.5px] text-purple-300 pl-3.5">
                              <span>• เติมเงิน (Top-Up):</span>
                              <span className="font-mono font-bold">
                                ฿{trendPoints[hoveredTrendIndex].topUpSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({trendPoints[hoveredTrendIndex].topUpVolume})
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {(trendMetric === "both" || trendMetric === "volume") && (
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            จำนวนรายการ (Volume):
                          </span>
                          <span className="font-mono font-black text-emerald-200">
                            {trendPoints[hoveredTrendIndex].volume} รายการ
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Crisp High-Res SVG Chart */}
                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto overflow-visible">
                  <defs>
                    <linearGradient id="salesTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
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
                        strokeDasharray={idx === yTicks.length - 1 ? undefined : "4,4"}
                        className={idx === yTicks.length - 1 ? "dark:stroke-slate-700" : "dark:stroke-slate-800"}
                      />
                      {/* Left Y-axis (Sales ฿) */}
                      {(trendMetric === "both" || trendMetric === "sales") && (
                        <text
                          x={pLeft - 10}
                          y={tick.y + 4}
                          textAnchor="end"
                          className="fill-slate-400 dark:fill-slate-500 font-mono text-[11px] font-bold"
                        >
                          {tick.labelSales}
                        </text>
                      )}
                      {/* Right Y-axis (Volume Orders) */}
                      {(trendMetric === "both" || trendMetric === "volume") && (
                        <text
                          x={pLeft + plotW + 10}
                          y={tick.y + 4}
                          textAnchor="start"
                          className="fill-emerald-600/80 dark:fill-emerald-400/80 font-mono text-[11px] font-bold"
                        >
                          {tick.labelVolume}
                        </text>
                      )}
                    </g>
                  ))}

                  {/* Volume Bars */}
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
                          rx={Math.min(4, barW / 2)}
                          className={`transition-all duration-150 ${
                            isHovered
                              ? "fill-emerald-500 opacity-95"
                              : "fill-emerald-500/30 dark:fill-emerald-400/25 hover:fill-emerald-500/50"
                          }`}
                        />
                      );
                    })}

                  {/* Sales Area Gradient & Smooth Line */}
                  {(trendMetric === "both" || trendMetric === "sales") && salesAreaPath && (
                    <path d={salesAreaPath} fill="url(#salesTrendGradient)" />
                  )}
                  {(trendMetric === "both" || trendMetric === "sales") && salesPath && (
                    <path
                      d={salesPath}
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Data Points */}
                  {(trendMetric === "both" || trendMetric === "sales") &&
                    trendPoints.map((p, i) => {
                      if (p.sales === 0 && trendPoints.length > 16 && hoveredTrendIndex !== i) return null;
                      return (
                        <circle
                          key={`dot-${p.id}`}
                          cx={p.x}
                          cy={p.ySales}
                          r={hoveredTrendIndex === i ? 5.5 : 3}
                          className={`transition-all ${
                            hoveredTrendIndex === i
                              ? "fill-indigo-600 stroke-white dark:stroke-slate-900 stroke-2"
                              : "fill-indigo-600 dark:fill-indigo-400"
                          }`}
                        />
                      );
                    })}

                  {/* Active Hover Guideline */}
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
                    </g>
                  )}

                  {/* X-Axis Tick Labels */}
                  {trendPoints.map((p, i) => {
                    const showLabel =
                      trendPoints.length <= 12 ||
                      (trendPoints.length <= 20 && (i % 2 === 0 || i === trendPoints.length - 1)) ||
                      (i % 4 === 0 || i === trendPoints.length - 1);
                    if (!showLabel) return null;
                    return (
                      <text
                        key={`lbl-${p.id}`}
                        x={p.x}
                        y={baselineY + 18}
                        textAnchor="middle"
                        className="fill-slate-400 dark:fill-slate-500 font-bold text-[10.5px]"
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
                    <div className="bg-slate-100/90 dark:bg-slate-800/90 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold shadow-xs">
                      {customerSegment === "corporate"
                        ? "ไม่มีข้อมูลออเดอร์ของลูกค้าองค์กรในช่วงเวลาที่เลือก (No corporate orders in this timeframe)"
                        : customerSegment === "retail"
                        ? "ไม่มีข้อมูลออเดอร์ของลูกค้าทั่วไปในช่วงเวลาที่เลือก (No retail orders in this timeframe)"
                        : "ไม่มีข้อมูลออเดอร์ในช่วงเวลาที่เลือก (No order data in this timeframe)"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right 4 Cols: Payment Channels Share */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 lg:col-span-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                      Payment Channels Share
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      สัดส่วนยอดรับชำระแยกตามช่องทาง (รวมยอดเติมเงิน)
                    </p>
                  </div>
                  {overviewStats.channelBreakdown.length > 0 && (
                    <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/50 px-2.5 py-1 rounded-full shrink-0">
                      {overviewStats.channelBreakdown.length} ช่องทาง
                    </span>
                  )}
                </div>

                {/* Multi-Color Stacked Distribution Bar */}
                {overviewStats.channelBreakdown.length > 0 && overviewStats.totalRevenue > 0 && (
                  <div className="my-3.5">
                    <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex gap-0.5 p-0.5 border border-slate-200/60 dark:border-slate-700">
                      {overviewStats.channelBreakdown.map((item) => {
                        const pct = (item.revenue / overviewStats.totalRevenue) * 100;
                        if (pct <= 0) return null;
                        const style = getChannelBadgeStyle(item.channel);
                        return (
                          <div
                            key={`stack-${item.channel}`}
                            title={`${item.channel}: ฿${item.revenue.toLocaleString()} (${pct.toFixed(1)}%)`}
                            className={`${style.barColor} h-full first:rounded-l-full last:rounded-r-full transition-all duration-300`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5 text-xs font-bold max-h-[340px] overflow-y-auto pr-1 mt-2">
                  {overviewStats.channelBreakdown.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 font-medium bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                      ไม่มีข้อมูลการชำระเงินในช่วงเวลาที่เลือก
                    </div>
                  ) : (
                    overviewStats.channelBreakdown.map((item) => {
                      const pct = overviewStats.totalRevenue > 0 ? (item.revenue / overviewStats.totalRevenue) * 100 : 0;
                      const style = getChannelBadgeStyle(item.channel);
                      return (
                        <div
                          key={item.channel}
                          className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <div className="flex justify-between items-center mb-1.5 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${style.barColor} shrink-0`} />
                              <span className="text-slate-900 dark:text-slate-100 font-extrabold truncate">
                                {item.channel}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white dark:bg-slate-700 border border-slate-200/70 dark:border-slate-600 text-slate-500 dark:text-slate-300 font-semibold shrink-0">
                                {item.count} รายการ
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-black text-slate-900 dark:text-white">
                                ฿{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-1.5 py-0.5 rounded font-mono min-w-[44px] text-right">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-200/70 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div className={`${style.barColor} h-full rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom 12-Column Section: Top-Selling Products (8 cols) + Payment & Member Top-Up Summary (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 8 Cols: Top-Selling Products & Packages Table */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 lg:col-span-8 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    <Crown size={16} className="text-amber-500" />
                    Top-Selling Products, Services & Member Top-Ups (บริการและแพ็กเกจขายดี)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    จัดอันดับรายการซักรีดและแพ็กเกจเติมเงินสมาชิกที่สร้างรายได้สูงสุดในช่วงเวลาที่เลือก
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-xl">
                  Top {overviewStats.topProducts.length} Items
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs font-semibold text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-black">
                      <th className="pb-3 pl-2 w-12">Rank</th>
                      <th className="pb-3">Service / Product Name</th>
                      <th className="pb-3 text-right">Units / Tx</th>
                      <th className="pb-3 text-right hidden sm:table-cell">Avg. Price</th>
                      <th className="pb-3 text-right w-44">Share of Sales</th>
                      <th className="pb-3 text-right pr-2">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
                    {overviewStats.topProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400 font-medium">
                          {customerSegment === "corporate"
                            ? "ไม่มีข้อมูลยอดขายสินค้าของลูกค้าองค์กรในช่วงนี้"
                            : customerSegment === "retail"
                            ? "ไม่มีข้อมูลยอดขายสินค้าของลูกค้าทั่วไปในช่วงนี้"
                            : "ไม่มีข้อมูลยอดขายสินค้าในช่วงนี้"}
                        </td>
                      </tr>
                    ) : (
                      overviewStats.topProducts.map((p: any, idx: number) => {
                        const sharePct = (overviewStats.totalProductRevenue || overviewStats.totalRevenue) > 0
                          ? (p.revenue / (overviewStats.totalProductRevenue || overviewStats.totalRevenue)) * 100
                          : 0;
                        const avgUnit = p.count > 0 ? p.revenue / p.count : 0;
                        const rankBadgeClass =
                          idx === 0
                            ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                            : idx === 1
                            ? "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-200"
                            : idx === 2
                            ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300"
                            : "bg-indigo-50 text-indigo-600 border-indigo-200/60 dark:bg-indigo-950/60 dark:text-indigo-400";

                        return (
                          <tr key={idx} className={`transition-colors ${p.isTopUp ? "bg-purple-50/40 dark:bg-purple-950/20 hover:bg-purple-50/70" : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"}`}>
                            <td className="py-3 pl-2">
                              <span className={`w-6 h-6 border rounded-lg flex items-center justify-center font-black text-[10px] ${rankBadgeClass}`}>
                                #{idx + 1}
                              </span>
                            </td>
                            <td className="py-3 font-extrabold text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                <span>{p.name}</span>
                                {p.isTopUp && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 dark:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                                    Wallet Package
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                              {p.isTopUp ? `${p.count} รายการ` : p.count.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 text-right font-mono text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                              ฿{avgUnit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                  <div
                                    className={`${p.isTopUp ? "bg-purple-600" : "bg-indigo-500"} h-full rounded-full`}
                                    style={{ width: `${Math.min(100, sharePct)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[11px] font-bold text-slate-500 w-11 text-right">
                                  {sharePct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className={`py-3 text-right pr-2 font-mono font-black ${p.isTopUp ? "text-purple-600 dark:text-purple-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                              ฿{p.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 4 Cols: Payment Category, Member Top-Up & Order Fulfillment Summary */}
            <div className="bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 lg:col-span-4 shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <div className="pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    <CreditCard size={16} className="text-indigo-600 dark:text-indigo-400" />
                    Payment & Top-Up Summary
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    สรุปหมวดหมู่การรับชำระเงิน ยอดเติมเงินสมาชิก และสถานะบิล
                  </p>
                </div>

                {/* Highlight Banner: Member Top-Up Cash Inflow */}
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-50 via-indigo-50/70 to-purple-50 dark:from-purple-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 border border-purple-200/80 dark:border-purple-800/60 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Wallet size={16} />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 block">
                          Member Top-Up Inflow (ยอดเติมเงินสมาชิก)
                        </span>
                        <span className="text-base font-black font-mono text-purple-950 dark:text-white">
                          ฿{overviewStats.topUpRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white font-mono block">
                        {overviewStats.topUpCount} รายการ
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
                        โบนัส +฿{overviewStats.topUpBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2x2 Payment Category Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50">
                    <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 block">
                      เงินสด (Cash / COD)
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-emerald-900 dark:text-emerald-200 mt-1 block">
                      ฿{overviewStats.paymentBreakdown.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/50">
                    <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-400 block">
                      โอน/QR (Transfer/QR)
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-indigo-900 dark:text-indigo-200 mt-1 block">
                      ฿{overviewStats.paymentBreakdown.transfer.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-800/50">
                    <span className="text-[10px] font-black uppercase text-sky-700 dark:text-sky-400 block">
                      บัตร/ออนไลน์ (Card/Beam)
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-sky-900 dark:text-sky-200 mt-1 block">
                      ฿{overviewStats.paymentBreakdown.card.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/50">
                    <span className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-400 block">
                      ตัดเครดิตสมาชิก (Wallet Used)
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-purple-900 dark:text-purple-200 mt-1 block">
                      ฿{overviewStats.paymentBreakdown.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Status Breakdown */}
              <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <span className="text-[11px] font-black uppercase text-slate-400 tracking-wider block">
                  Order & Top-Up Activity (สถานะรายการทั้งหมด)
                </span>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 block">
                      {overviewStats.completedCount}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">ซักเสร็จ</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <span className="text-sm font-black font-mono text-amber-600 dark:text-amber-400 block">
                      {overviewStats.pendingCount}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">กำลังซัก</span>
                  </div>
                  <div className="p-2 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/60">
                    <span className="text-sm font-black font-mono text-purple-600 dark:text-purple-400 block">
                      {overviewStats.topUpCount}
                    </span>
                    <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300">เติมเงิน</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <span className="text-sm font-black font-mono text-rose-500 block">
                      {overviewStats.cancelledCount}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">ยกเลิก</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
        <div className="space-y-4">
          {/* Shift Summary KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">จำนวนรอบกะ (Total Shifts)</span>
                <History size={15} className="text-indigo-500" />
              </div>
              <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">
                {shiftSummaryStats.totalShifts} รอบกะ
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[10.5px] font-bold">
                <span className="text-emerald-600">🟢 เปิดอยู่ {shiftSummaryStats.openCount}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">⚪ ปิดแล้ว {shiftSummaryStats.closedCount}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ยอดรับชำระรวมในกะ (Shift Revenue)</span>
                <TrendingUp size={15} className="text-indigo-600" />
              </div>
              <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                ฿{shiftSummaryStats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10.5px] text-slate-500 font-semibold mt-1.5">
                รวม {shiftSummaryStats.totalOrders} ออเดอร์ (เงินสด + โอน + บัตร + สมาชิก)
              </div>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ยอดรับเงินสดเข้าลิ้นชัก (Cash Sales)</span>
                <Banknote size={15} className="text-emerald-600" />
              </div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                +฿{shiftSummaryStats.totalCashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10.5px] text-slate-500 font-semibold mt-1.5">
                ช่องทางอื่น (Non-Cash): ฿{shiftSummaryStats.totalNonCashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ส่วนต่างลิ้นชักสุทธิ (Net Variance)</span>
                <AlertCircle size={15} className={shiftSummaryStats.netVariance < 0 ? "text-rose-500" : "text-emerald-500"} />
              </div>
              <div className={`text-xl font-black mt-1 ${
                Math.abs(shiftSummaryStats.netVariance) < 0.01
                  ? "text-emerald-600"
                  : shiftSummaryStats.netVariance > 0
                  ? "text-blue-600"
                  : "text-rose-600"
              }`}>
                {Math.abs(shiftSummaryStats.netVariance) < 0.01
                  ? "฿0.00 (Balanced)"
                  : `${shiftSummaryStats.netVariance > 0 ? "+" : ""}฿${shiftSummaryStats.netVariance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </div>
              <div className="text-[10.5px] text-slate-500 font-semibold mt-1.5">
                เงินขาด {shiftSummaryStats.shortageShiftCount} กะ • เงินเกิน {shiftSummaryStats.overageShiftCount} กะ
              </div>
            </div>
          </div>

          {/* Shift Filter & Table Card */}
          <div className="bg-white dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                  Cashier Drawer Shift Report (All Jobs & POS)
                </h3>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                  รายงานการเปิด-ปิดลิ้นชักเงินสดรายวัน ยอดรับชำระแยกช่องทาง และตรวจสอบส่วนต่างเงินสด (รองรับทั้งบิล Walk-in และ Delivery)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาพนักงาน / รหัสกะ / หมายเหตุ..."
                    value={shiftSearchQuery}
                    onChange={(e) => setShiftSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-3 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 w-52"
                  />
                </div>

                <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/70 dark:border-slate-700 text-[11px] font-bold">
                  {[
                    { id: "all", label: "ทั้งหมด" },
                    { id: "open", label: "🟢 เปิดอยู่" },
                    { id: "closed", label: "⚪ ปิดแล้ว" },
                    { id: "variance", label: "⚠️ มีส่วนต่าง" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setShiftStatusFilter(tab.id as any)}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        shiftStatusFilter === tab.id
                          ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs font-black"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchAllShiftsForReport}
                  className="h-8 px-2.5 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw size={12} className={isLoadingShifts ? "animate-spin" : ""} />
                  <span>รีเฟรช</span>
                </Button>
              </div>
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
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Branch</th>
                      <th className="pb-3">Cashier</th>
                      <th className="pb-3 text-center">Open / Close Time</th>
                      <th className="pb-3 text-center">Orders</th>
                      <th className="pb-3 text-right">Start Float</th>
                      <th className="pb-3 text-right">Cash Sales</th>
                      <th className="pb-3 text-right">Non-Cash</th>
                      <th className="pb-3 text-right">Expected Cash</th>
                      <th className="pb-3 text-right">Actual Cash</th>
                      <th className="pb-3 text-right">Variance</th>
                      <th className="pb-3 text-right pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {shiftReportData.map((shift) => {
                      const isOpen = shift.status === "open";
                      const variance = shift.variance || 0;
                      const branchName = shops.find(s => s.id === shift.branchId)?.name || shift.branchId;
                      return (
                        <tr key={shift.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-3 font-mono text-[10px] text-slate-500 font-bold">#{shift.id.slice(-8).toUpperCase()}</td>
                          <td className="py-3">
                            {isOpen ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                OPEN
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                CLOSED
                              </span>
                            )}
                          </td>
                          <td className="py-3">{branchName}</td>
                          <td className="py-3">
                            <div className="font-bold text-slate-800 dark:text-slate-100">{shift.userName}</div>
                            {shift.notes && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[160px]" title={shift.notes}>
                                📝 {shift.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 text-center text-[11px]">
                            <div className="text-slate-700 dark:text-slate-200 font-bold">{format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm")}</div>
                            <div className="text-[10px] text-slate-400">
                              {shift.closedAt ? `ถึง ${format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm")}` : "กำลังเปิดกะ..."}
                            </div>
                          </td>
                          <td className="py-3 text-center font-bold text-slate-800 dark:text-slate-200">
                            <button
                              onClick={() => {
                                setSelectedShiftForOrders(shift);
                                setSelectedJobForDetails(null);
                              }}
                              className="inline-flex flex-col items-center px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-400 font-bold transition-all cursor-pointer border border-indigo-200/60 dark:border-indigo-800/40 shadow-xs"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Eye size={11} />
                                <span>{shift.totalOrders || 0} ออเดอร์</span>
                              </span>
                              <span className="text-[9px] opacity-80 font-medium whitespace-nowrap">
                                💵{shift.cashOrders || 0} | 📱{shift.transferOrders || 0} | 💳{shift.cardOrders || 0} | 👑{shift.creditOrders || 0}
                              </span>
                            </button>
                          </td>
                          <td className="py-3 text-right">฿{(shift.startingCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 text-right text-emerald-600 font-bold">+฿{(shift.cashSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 text-right text-indigo-600 font-bold">฿{(shift.nonCashSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 text-right font-black text-slate-900 dark:text-slate-100">฿{(shift.expectedCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 text-right font-bold text-slate-800 dark:text-slate-100">
                            {isOpen ? <span className="text-slate-400 italic text-[11px]">รอนับปิดกะ</span> : `฿${(shift.actualCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                          </td>
                          <td className={`py-3 text-right font-black ${isOpen ? "text-slate-400" : Math.abs(variance) < 0.01 ? "text-emerald-600" : variance > 0 ? "text-blue-500" : "text-rose-600"}`}>
                            {isOpen ? "-" : Math.abs(variance) < 0.01 ? "฿0.00" : `${variance > 0 ? "+" : ""}฿${variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
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
                              ดูสรุปกะ
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 font-semibold">ไม่พบข้อมูลรอบกะในช่วงเวลาหรือตัวกรองที่เลือก</div>
            )}
          </div>
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
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${job.isShopPaid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                              {job.isShopPaid ? "Paid" : "Unpaid"}
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
                                job.isShopPaid
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              }`}>
                                {job.isShopPaid ? "Paid" : "Unpaid"}
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-slate-850 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs font-semibold">
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">จำนวนออเดอร์ในกะ</span>
                    <span className="text-slate-800 dark:text-slate-100 font-black text-base mt-0.5">{shiftJobsList.length} ออเดอร์</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      หน้าร้าน {(selectedShiftForOrders as any)?.walkInOrders || 0} • รับ-ส่ง {(selectedShiftForOrders as any)?.deliveryOrders || 0}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">เงินทอน + รับเงินสด</span>
                    <span className="text-slate-800 dark:text-slate-100 font-bold mt-0.5">
                      ฿{(selectedShiftForOrders?.startingCash || 0).toLocaleString()} <span className="text-emerald-600">+฿{(selectedShiftForOrders?.cashSales || 0).toLocaleString()}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      ควรมีในลิ้นชัก: <strong className="text-emerald-600">฿{(selectedShiftForOrders?.expectedCash || 0).toLocaleString()}</strong>
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">ยอดโอน / บัตร / สมาชิก</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-black text-base mt-0.5">
                      ฿{(((selectedShiftForOrders?.transferSales || 0) + (selectedShiftForOrders?.cardSales || 0) + (selectedShiftForOrders?.creditSales || 0))).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      โอน ฿{(selectedShiftForOrders?.transferSales || 0).toLocaleString()} • บัตร ฿{(selectedShiftForOrders?.cardSales || 0).toLocaleString()} • สมาชิก ฿{(selectedShiftForOrders?.creditSales || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">เงินสดนับได้จริง / ส่วนต่าง</span>
                    <span className="text-slate-800 dark:text-slate-100 font-bold mt-0.5">
                      {selectedShiftForOrders?.status === "open"
                        ? "กำลังเปิดกะอยู่"
                        : `฿${(selectedShiftForOrders?.actualCash || 0).toLocaleString()}`}
                    </span>
                    {selectedShiftForOrders?.status !== "open" && (
                      <span className={`text-[10px] font-black mt-0.5 ${
                        ((selectedShiftForOrders?.actualCash || 0) - (selectedShiftForOrders?.expectedCash || 0)) === 0
                          ? "text-emerald-600"
                          : ((selectedShiftForOrders?.actualCash || 0) - (selectedShiftForOrders?.expectedCash || 0)) > 0
                          ? "text-blue-600"
                          : "text-rose-600"
                      }`}>
                        ส่วนต่าง: {((selectedShiftForOrders?.actualCash || 0) - (selectedShiftForOrders?.expectedCash || 0)) > 0 ? "+" : ""}฿{((selectedShiftForOrders?.actualCash || 0) - (selectedShiftForOrders?.expectedCash || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    )}
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
                                    job.isShopPaid 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50" 
                                      : "bg-amber-50 text-amber-700 border border-amber-200/50"
                                  }`}>
                                    {job.isShopPaid ? "Paid" : "Unpaid"}
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
                    {selectedJobForDetails.isShopPaid ? "ชำระเงินเรียบร้อย" : "ยังไม่ชำระเงิน"}
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
