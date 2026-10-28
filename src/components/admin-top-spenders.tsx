"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Crown,
  CreditCard,
  Briefcase,
  Users,
  TrendingUp,
  ShoppingBag,
  Award,
  Sparkles,
  Search,
  Wallet,
  Phone,
  MapPin,
  Calendar,
  Layers,
  ChevronRight,
  FileSpreadsheet,
  RefreshCw,
  X,
  ArrowUpRight,
  Star,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfYear } from "date-fns";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { jobStore, type Job, type Customer } from "@/lib/store";
import { getTopUpTransactionsAction } from "@/actions/db";
import { formatJobDisplayId, getJobPaymentBreakdown, isRewashOrNoChargeJob, isSplitDeliveryChildJob } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface AdminTopSpendersProps {
  onViewJob?: (job: Job) => void;
}

type SegmentTab = "members" | "vip" | "corporate" | "all";
type DateRangePreset = "30days" | "90days" | "180days" | "year" | "all" | "custom";
type MemberSortBy = "topup_amount" | "service_orders" | "service_spend" | "wallet_balance";
type StandardSortBy = "service_spend" | "service_orders" | "aov";

interface TopUpRecord {
  id: string;
  memberId: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  bonusAmount: number;
  totalCredit: number;
  packageName: string;
  paymentChannel: string;
  status: string;
  createdAt: string;
}

interface ServiceUsageItem {
  name: string;
  quantity: number;
  revenue: number;
  orderCount: number;
}

interface CustomerAnalyticsRow {
  key: string;
  customerId?: string;
  memberId?: string | null;
  name: string;
  companyName?: string | null;
  phone: string;
  address: string;
  isMember: boolean;
  isVIP: boolean;
  isCorporate: boolean;
  creditBalance: number;
  // Top-up metrics (primarily for Members)
  topUpAmount: number;
  topUpBonus: number;
  topUpTotalCredit: number;
  topUpCount: number;
  lastTopUpDate: Date | null;
  topUpRecords: TopUpRecord[];
  // Service usage & spend metrics
  serviceOrderCount: number;
  serviceTotalSpend: number;
  avgOrderValue: number;
  topServiceName: string;
  serviceBreakdown: ServiceUsageItem[];
  lastServiceOrderDate: Date | null;
  recentOrders: Job[];
}

const FEE_OR_TOPUP_ITEM_NAMES = new Set([
  "PICK UP FEES",
  "PICKUP FEES",
  "PICKUP FEE",
  "DELIVERY FEES",
  "DELIVERY FEE",
  "TOP UP",
  "TOPUP",
  "PACKAGE",
]);

function formatServiceTypeLabel(st?: string | null): string | null {
  if (!st) return null;
  const lower = st.toLowerCase();
  if (lower === "wash_fold") return "Wash & Fold";
  if (lower === "wash_iron_fold") return "Wash & Iron (Fold)";
  if (lower === "wash_iron_hanger") return "Wash & Iron (Hanger)";
  return st;
}

export function AdminTopSpenders({ onViewJob }: AdminTopSpendersProps) {
  const jobs = useJobs();
  const customers = useCustomers();

  const [activeSegment, setActiveSegment] = useState<SegmentTab>("members");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customStart, setCustomStart] = useState<string>(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [memberSortBy, setMemberSortBy] = useState<MemberSortBy>("topup_amount");
  const [standardSortBy, setStandardSortBy] = useState<StandardSortBy>("service_spend");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [topUpTransactions, setTopUpTransactions] = useState<TopUpRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  // Date bounds
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (datePreset === "30days") {
      return { startDate: startOfDay(subDays(now, 30)), endDate: endOfDay(now) };
    }
    if (datePreset === "90days") {
      return { startDate: startOfDay(subDays(now, 90)), endDate: endOfDay(now) };
    }
    if (datePreset === "180days") {
      return { startDate: startOfDay(subDays(now, 180)), endDate: endOfDay(now) };
    }
    if (datePreset === "year") {
      return { startDate: startOfYear(now), endDate: endOfDay(now) };
    }
    if (datePreset === "custom" && customStart && customEnd) {
      return {
        startDate: startOfDay(new Date(customStart)),
        endDate: endOfDay(new Date(customEnd)),
      };
    }
    // "all" -> last 365 days
    return { startDate: startOfDay(subDays(now, 365)), endDate: endOfDay(now) };
  }, [datePreset, customStart, customEnd]);

  // Load historical jobs & top-up transactions for the selected date range
  useEffect(() => {
    let active = true;
    setIsLoadingData(true);

    const timer = setTimeout(() => {
      Promise.all([
        jobStore.fetchHistoricalJobs(startDate, endDate).catch(() => {}),
        getTopUpTransactionsAction({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }).catch(() => []),
      ])
        .then(([, topUps]) => {
          if (active && Array.isArray(topUps)) {
            setTopUpTransactions(topUps as TopUpRecord[]);
          }
        })
        .finally(() => {
          if (active) setIsLoadingData(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [startDate, endDate]);

  // Build customer lookup maps & aggregate top-ups + service usage per customer
  const customerRows = useMemo<CustomerAnalyticsRow[]>(() => {
    const byId = new Map<string, Customer>();
    const byPhone = new Map<string, Customer>();

    for (const c of customers) {
      if (c.id) byId.set(c.id, c);
      const p1 = (c.phone || "").replace(/\D/g, "");
      if (p1.length >= 8) byPhone.set(p1.slice(-9), c);
      const p2 = (c.secondaryPhone || "").replace(/\D/g, "");
      if (p2.length >= 8) byPhone.set(p2.slice(-9), c);
    }

    const rowMap = new Map<
      string,
      {
        customer?: Customer;
        key: string;
        name: string;
        phone: string;
        address: string;
        isMember: boolean;
        isVIP: boolean;
        isCorporate: boolean;
        creditBalance: number;
        topUpAmount: number;
        topUpBonus: number;
        topUpTotalCredit: number;
        topUpCount: number;
        lastTopUpDate: Date | null;
        topUpRecords: TopUpRecord[];
        seenTopUpIds: Set<string>;
        serviceOrderCount: number;
        serviceTotalSpend: number;
        serviceMap: Map<string, ServiceUsageItem>;
        lastServiceOrderDate: Date | null;
        recentOrders: Job[];
      }
    >();

    const getOrCreateEntry = (
      customer: Customer | undefined,
      fallbackName?: string,
      fallbackPhone?: string,
      fallbackAddress?: string
    ) => {
      const cleanPhone = (customer?.phone || fallbackPhone || "").replace(/\D/g, "");
      const key =
        customer?.id ||
        (cleanPhone.length >= 8
          ? `tel:${cleanPhone.slice(-9)}`
          : `name:${(customer?.name || fallbackName || "Guest").trim().toLowerCase()}`);

      let entry = rowMap.get(key);
      if (!entry) {
        const isMember = Boolean(
          customer?.isMember ||
            customer?.tier === "member" ||
            (customer?.memberId && customer.memberId.trim().length > 0) ||
            (Number(customer?.creditBalance) || 0) > 0
        );
        const isVIP = Boolean(customer?.isVIP || customer?.tier === "vip");
        const isCorporate = Boolean(
          customer?.isCorporate ||
            customer?.tier === "corporate" ||
            (customer?.companyName && customer.companyName.trim().length > 0)
        );
        const addr =
          customer?.addresses?.[0]?.placeName ||
          customer?.defaultAddress ||
          fallbackAddress ||
          "-";

        entry = {
          customer,
          key,
          name: customer?.name || fallbackName || "Customer",
          phone: customer?.phone || fallbackPhone || "-",
          address: addr.startsWith("http") ? "-" : addr,
          isMember,
          isVIP,
          isCorporate,
          creditBalance: Math.max(0, Number(customer?.creditBalance) || 0),
          topUpAmount: 0,
          topUpBonus: 0,
          topUpTotalCredit: 0,
          topUpCount: 0,
          lastTopUpDate: null,
          topUpRecords: [],
          seenTopUpIds: new Set(),
          serviceOrderCount: 0,
          serviceTotalSpend: 0,
          serviceMap: new Map(),
          lastServiceOrderDate: null,
          recentOrders: [],
        };
        rowMap.set(key, entry);
      } else if (customer && !entry.customer) {
        entry.customer = customer;
      }
      return entry;
    };

    // Seed all known Members, VIPs, and Corporate customers from CRM
    for (const c of customers) {
      const isMem = Boolean(
        c.isMember ||
          c.tier === "member" ||
          (c.memberId && c.memberId.trim().length > 0) ||
          (Number(c.creditBalance) || 0) > 0
      );
      const isVip = Boolean(c.isVIP || c.tier === "vip");
      const isCorp = Boolean(
        c.isCorporate || c.tier === "corporate" || (c.companyName && c.companyName.trim().length > 0)
      );
      if (isMem || isVip || isCorp) {
        getOrCreateEntry(c, c.name, c.phone, c.defaultAddress);
      }
    }

    // 1. Process Top-Up Transactions from `getTopUpTransactionsAction`
    for (const t of topUpTransactions) {
      const statusUpper = (t.status || "").toUpperCase();
      if (statusUpper === "REJECTED" || statusUpper === "VOID" || statusUpper === "CANCELLED") continue;

      const tDate = new Date(t.createdAt);
      if (isNaN(tDate.getTime()) || tDate < startDate || tDate > endDate) continue;

      let matchedCustomer = t.memberId ? byId.get(t.memberId) : undefined;
      if (!matchedCustomer && t.customerPhone) {
        const cp = t.customerPhone.replace(/\D/g, "");
        if (cp.length >= 8) matchedCustomer = byPhone.get(cp.slice(-9));
      }

      const entry = getOrCreateEntry(matchedCustomer, t.customerName, t.customerPhone);
      entry.isMember = true; // Anyone with a wallet top-up is a Member
      if (entry.seenTopUpIds.has(t.id)) continue;
      entry.seenTopUpIds.add(t.id);

      const rawAmt = Math.max(0, Number(t.amount) || 0);
      const bonus = Math.max(0, Number(t.bonusAmount) || 0);

      const totalCred = Math.max(0, Number(t.totalCredit) || 0);
      const amt =
        bonus > 0 && totalCred > 0 && Math.abs(rawAmt - totalCred) < 0.01
          ? Math.max(0, rawAmt - bonus)
          : rawAmt;

      const credit = Math.max(amt, Number(t.totalCredit) || amt + bonus);

      entry.topUpAmount = Math.round((entry.topUpAmount + amt) * 100) / 100;
      entry.topUpBonus = Math.round((entry.topUpBonus + bonus) * 100) / 100;
      entry.topUpTotalCredit = Math.round((entry.topUpTotalCredit + credit) * 100) / 100;
      entry.topUpCount += 1;
      if (!entry.lastTopUpDate || tDate > entry.lastTopUpDate) {
        entry.lastTopUpDate = tDate;
      }
      entry.topUpRecords.push({ ...t, amount: amt, bonusAmount: 0, totalCredit: amt });
    }

    // 2. Process Laundry Service Orders (and fallback TU- topup jobs if not already in topUpTransactions)
    for (const job of jobs) {
      if (job.status === "cancel" || job.status === "return" || isSplitDeliveryChildJob(job)) continue;

      const jDate = new Date(job.createdAt);
      if (isNaN(jDate.getTime()) || jDate < startDate || jDate > endDate) continue;

      let matchedCustomer = job.customerId ? byId.get(job.customerId) : undefined;
      if (!matchedCustomer && job.customerPhone) {
        const cp = job.customerPhone.replace(/\D/g, "");
        if (cp.length >= 8) matchedCustomer = byPhone.get(cp.slice(-9));
      }

      const isTopUpOrder = job.status === "topup" || String(job.id).toUpperCase().startsWith("TU-");
      const entry = getOrCreateEntry(
        matchedCustomer,
        job.customerName,
        job.customerPhone,
        job.pickupLocation
      );

      if (isTopUpOrder) {
        entry.isMember = true;
        // Only count TU- job if no matching transaction was already recorded on the same minute/amount
        const amt = Math.max(0, Number(job.totalAmount) || 0);
        const alreadyHasTx = entry.topUpRecords.some(
          (r) =>
            Math.abs(r.amount - amt) < 1 &&
            Math.abs(new Date(r.createdAt).getTime() - jDate.getTime()) < 5 * 60 * 1000
        );
        if (!alreadyHasTx && amt > 0 && !entry.seenTopUpIds.has(job.id)) {
          entry.seenTopUpIds.add(job.id);
          entry.topUpAmount = Math.round((entry.topUpAmount + amt) * 100) / 100;
          entry.topUpTotalCredit = Math.round((entry.topUpTotalCredit + amt) * 100) / 100;
          entry.topUpCount += 1;
          if (!entry.lastTopUpDate || jDate > entry.lastTopUpDate) {
            entry.lastTopUpDate = jDate;
          }
          entry.topUpRecords.push({
            id: job.id,
            memberId: matchedCustomer?.id || job.customerId || "",
            customerName: entry.name,
            customerPhone: entry.phone,
            amount: amt,
            bonusAmount: 0,
            totalCredit: amt,
            packageName: "Wallet Top-Up",
            paymentChannel: job.paymentChannel || job.paymentMethod || "Transfer",
            status: "COMPLETED",
            createdAt: jDate.toISOString(),
          });
        }
        continue;
      }

      // If order was paid via Deduct Member / Wallet, mark as Member as well
      const channelLower = (job.paymentChannel || job.paymentMethod || "").toLowerCase();
      if (channelLower.includes("member") || channelLower.includes("wallet") || channelLower === "credit") {
        entry.isMember = true;
      }

      // Count laundry service usage & spend
      // Count laundry service usage & actual paid spend
      const isNoCharge = isRewashOrNoChargeJob(job);
      const paymentBreakdown = getJobPaymentBreakdown(job);
      const orderTotal = isNoCharge
        ? 0
        : paymentBreakdown.totalPaid > 0
          ? paymentBreakdown.totalPaid
          : job.isShopPaid || job.isPaid
            ? Math.max(0, Number(job.totalAmount) || 0)
            : 0;
      const orderFee = Math.max(0, Number(job.fee) || 0);
      entry.serviceOrderCount += 1;
      entry.serviceTotalSpend = Math.round((entry.serviceTotalSpend + orderTotal) * 100) / 100;
      if (!entry.lastServiceOrderDate || jDate > entry.lastServiceOrderDate) {
        entry.lastServiceOrderDate = jDate;
      }
      entry.recentOrders.push(job);

      // Extract line items / services used
      let jobItems: any[] = [];
      if (Array.isArray(job.items) && job.items.length > 0) {
        jobItems = job.items;
      } else if (job.itemsJson) {
        try {
          const parsed = JSON.parse(job.itemsJson);
          if (Array.isArray(parsed)) jobItems = parsed;
        } catch {}
      }

      let recordedItem = false;
      for (const item of jobItems) {
        const rawItemName = (item.name || item.nameEn || "").trim();
        if (!rawItemName) continue;
        if (FEE_OR_TOPUP_ITEM_NAMES.has(rawItemName.toUpperCase())) continue;

        const qty = Math.max(1, Number(item.quantity) || 1);
        const lineRev = Math.max(0, qty * (Number(item.price) || 0));
        const existing = entry.serviceMap.get(rawItemName) || {
          name: rawItemName,
          quantity: 0,
          revenue: 0,
          orderCount: 0,
        };
        existing.quantity = Math.round((existing.quantity + qty) * 100) / 100;
        existing.revenue = Math.round((existing.revenue + lineRev) * 100) / 100;
        existing.orderCount += 1;
        entry.serviceMap.set(rawItemName, existing);
        recordedItem = true;
      }

      if (!recordedItem) {
        const labels: string[] = [];
        if (Array.isArray(job.laundryTypes) && job.laundryTypes.length > 0) {
          labels.push(...job.laundryTypes.filter(Boolean));
        } else {
          const stLabel = formatServiceTypeLabel(job.serviceType);
          if (stLabel) labels.push(stLabel);
        }
        if (labels.length === 0) labels.push("Wash & Fold / Standard");
        const splitRev = Math.max(0, orderTotal - orderFee) / labels.length;
        for (const lb of labels) {
          const existing = entry.serviceMap.get(lb) || {
            name: lb,
            quantity: 0,
            revenue: 0,
            orderCount: 0,
          };
          existing.quantity += 1;
          existing.revenue = Math.round((existing.revenue + splitRev) * 100) / 100;
          existing.orderCount += 1;
          entry.serviceMap.set(lb, existing);
        }
      }
    }

    // Build final rows (only keeping customers belonging to Member, VIP, or Corporate segments who have activity or balance)
    const finalRows: CustomerAnalyticsRow[] = [];
    for (const entry of rowMap.values()) {
      if (!entry.isMember && !entry.isVIP && !entry.isCorporate) continue;
      if (entry.topUpAmount <= 0 && entry.serviceOrderCount <= 0 && entry.creditBalance <= 0) continue;

      const serviceBreakdown = Array.from(entry.serviceMap.values()).sort(
        (a, b) => b.revenue - a.revenue || b.orderCount - a.orderCount
      );
      const topServiceName = serviceBreakdown[0]?.name || (entry.serviceOrderCount > 0 ? "Wash & Fold" : "—");
      const avgOrderValue =
        entry.serviceOrderCount > 0 ? Math.round(entry.serviceTotalSpend / entry.serviceOrderCount) : 0;

      finalRows.push({
        key: entry.key,
        customerId: entry.customer?.id,
        memberId: entry.customer?.memberId,
        name: entry.name,
        companyName: entry.customer?.companyName,
        phone: entry.phone,
        address: entry.address,
        isMember: entry.isMember,
        isVIP: entry.isVIP,
        isCorporate: entry.isCorporate,
        creditBalance: entry.creditBalance,
        topUpAmount: entry.topUpAmount,
        topUpBonus: entry.topUpBonus,
        topUpTotalCredit: entry.topUpTotalCredit,
        topUpCount: entry.topUpCount,
        lastTopUpDate: entry.lastTopUpDate,
        topUpRecords: entry.topUpRecords.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        serviceOrderCount: entry.serviceOrderCount,
        serviceTotalSpend: entry.serviceTotalSpend,
        avgOrderValue,
        topServiceName,
        serviceBreakdown,
        lastServiceOrderDate: entry.lastServiceOrderDate,
        recentOrders: entry.recentOrders.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });
    }

    return finalRows;
  }, [customers, jobs, topUpTransactions, startDate, endDate]);

  // Segment-specific lists
  const memberRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customerRows
      .filter((r) => {
        if (!r.isMember) return false;
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          (r.memberId && r.memberId.toLowerCase().includes(q)) ||
          r.address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (memberSortBy === "topup_amount") {
          return b.topUpAmount - a.topUpAmount || b.topUpCount - a.topUpCount || b.serviceOrderCount - a.serviceOrderCount;
        }
        if (memberSortBy === "service_orders") {
          return b.serviceOrderCount - a.serviceOrderCount || b.serviceTotalSpend - a.serviceTotalSpend;
        }
        if (memberSortBy === "service_spend") {
          return b.serviceTotalSpend - a.serviceTotalSpend || b.serviceOrderCount - a.serviceOrderCount;
        }
        return b.creditBalance - a.creditBalance || b.topUpAmount - a.topUpAmount;
      });
  }, [customerRows, searchQuery, memberSortBy]);

  const vipRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customerRows
      .filter((r) => {
        if (!r.isVIP) return false;
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          r.address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (standardSortBy === "service_orders") {
          return b.serviceOrderCount - a.serviceOrderCount || b.serviceTotalSpend - a.serviceTotalSpend;
        }
        if (standardSortBy === "aov") {
          return b.avgOrderValue - a.avgOrderValue || b.serviceTotalSpend - a.serviceTotalSpend;
        }
        return b.serviceTotalSpend - a.serviceTotalSpend || b.serviceOrderCount - a.serviceOrderCount;
      });
  }, [customerRows, searchQuery, standardSortBy]);

  const corporateRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customerRows
      .filter((r) => {
        if (!r.isCorporate) return false;
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          (r.companyName && r.companyName.toLowerCase().includes(q)) ||
          r.phone.includes(q) ||
          r.address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (standardSortBy === "service_orders") {
          return b.serviceOrderCount - a.serviceOrderCount || b.serviceTotalSpend - a.serviceTotalSpend;
        }
        if (standardSortBy === "aov") {
          return b.avgOrderValue - a.avgOrderValue || b.serviceTotalSpend - a.serviceTotalSpend;
        }
        return b.serviceTotalSpend - a.serviceTotalSpend || b.serviceOrderCount - a.serviceOrderCount;
      });
  }, [customerRows, searchQuery, standardSortBy]);

  // Top leaderboards
  const topMembersByTopUp = useMemo(
    () =>
      [...customerRows]
        .filter((r) => r.isMember && (r.topUpAmount > 0 || r.creditBalance > 0))
        .sort((a, b) => b.topUpAmount - a.topUpAmount || b.creditBalance - a.creditBalance),
    [customerRows]
  );

  const topMembersByFrequency = useMemo(
    () =>
      [...customerRows]
        .filter((r) => r.isMember && r.serviceOrderCount > 0)
        .sort((a, b) => b.serviceOrderCount - a.serviceOrderCount || b.serviceTotalSpend - a.serviceTotalSpend),
    [customerRows]
  );

  const topVipBySpend = useMemo(
    () =>
      [...customerRows]
        .filter((r) => r.isVIP)
        .sort((a, b) => b.serviceTotalSpend - a.serviceTotalSpend || b.serviceOrderCount - a.serviceOrderCount),
    [customerRows]
  );

  const topVipByFrequency = useMemo(
    () =>
      [...customerRows]
        .filter((r) => r.isVIP)
        .sort((a, b) => b.serviceOrderCount - a.serviceOrderCount || b.serviceTotalSpend - a.serviceTotalSpend),
    [customerRows]
  );

  const topCorpBySpend = useMemo(
    () =>
      [...customerRows]
        .filter((r) => r.isCorporate)
        .sort((a, b) => b.serviceTotalSpend - a.serviceTotalSpend || b.serviceOrderCount - a.serviceOrderCount),
    [customerRows]
  );

  const topCorpByFrequency = useMemo(
    () =>
      [...customerRows]
        .filter((r) => r.isCorporate)
        .sort((a, b) => b.serviceOrderCount - a.serviceOrderCount || b.serviceTotalSpend - a.serviceTotalSpend),
    [customerRows]
  );

  // Summary KPIs
  const kpis = useMemo(() => {
    const members = customerRows.filter((r) => r.isMember);
    const vips = customerRows.filter((r) => r.isVIP);
    const corps = customerRows.filter((r) => r.isCorporate);

    const totalMemberTopUp = members.reduce((s, r) => s + r.topUpAmount, 0);
    const totalMemberOrders = members.reduce((s, r) => s + r.serviceOrderCount, 0);
    const totalVipSpend = vips.reduce((s, r) => s + r.serviceTotalSpend, 0);
    const totalVipOrders = vips.reduce((s, r) => s + r.serviceOrderCount, 0);
    const totalCorpSpend = corps.reduce((s, r) => s + r.serviceTotalSpend, 0);
    const totalCorpOrders = corps.reduce((s, r) => s + r.serviceOrderCount, 0);

    return {
      memberCount: members.length,
      totalMemberTopUp: Math.round(totalMemberTopUp),
      totalMemberOrders,
      vipCount: vips.length,
      totalVipSpend: Math.round(totalVipSpend),
      totalVipOrders,
      corpCount: corps.length,
      totalCorpSpend: Math.round(totalCorpSpend),
      totalCorpOrders,
    };
  }, [customerRows]);

  const selectedCustomer = useMemo(
    () => customerRows.find((r) => r.key === selectedCustomerKey) || null,
    [customerRows, selectedCustomerKey]
  );

  const handleExportCsv = () => {
    const targetList =
      activeSegment === "members"
        ? memberRows
        : activeSegment === "vip"
          ? vipRows
          : activeSegment === "corporate"
            ? corporateRows
            : customerRows;

    if (targetList.length === 0) {
      toast.error("No records to export");
      return;
    }

    const headers = [
      "Rank",
      "Customer Name",
      "Company / Member ID",
      "Phone",
      "Segment",
      "Actual Top-Up Paid (THB)",
      "Top-Up Count",
      "Current Wallet Balance (THB)",
      "Service Orders Used",
      "Actual Service Paid (THB)",
      "Avg Order Value (THB)",
      "Favorite Service",
      "Last Order Date",
      "Address / Building",
    ];

    const escapeCsv = (val: any) => {
      const str = String(val ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [
      headers.join(","),
      ...targetList.map((r, idx) => {
        const segs = [
          r.isCorporate ? "Corporate" : null,
          r.isVIP ? "VIP" : null,
          r.isMember ? "Member" : null,
        ]
          .filter(Boolean)
          .join(" / ");
        return [
          idx + 1,
          r.name,
          r.companyName || r.memberId || "-",
          r.phone,
          segs,
          r.topUpAmount,
          r.topUpCount,
          r.creditBalance,
          r.serviceOrderCount,
          r.serviceTotalSpend,
          r.avgOrderValue,
          r.topServiceName,
          r.lastServiceOrderDate ? format(r.lastServiceOrderDate, "yyyy-MM-dd") : "-",
          r.address,
        ]
          .map(escapeCsv)
          .join(",");
      }),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `top-spenders-${activeSegment}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${targetList.length} customers to CSV!`);
  };

  return (
    <div className="flex-1 bg-slate-50/70 p-4 lg:p-6 space-y-5 overflow-y-auto">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 text-white flex items-center justify-center shadow-sm shadow-amber-500/20 shrink-0">
            <Crown size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Top Spenders & Service Loyalty (Members • VIP • Corporate)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                <Sparkles size={11} /> Sales & CRM Intelligence
              </span>
              {isLoadingData && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <RefreshCw size={11} className="animate-spin text-indigo-600" /> Syncing records...
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Track Members who top up the most and use our service most often, alongside VIP & Corporate accounts ranked by total Baht spent and service frequency.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet size={14} className="mr-1.5" />
            Export Segment CSV
          </Button>
        </div>
      </div>

      {/* 3 Segment Hero Summary Cards (Click to switch segment) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Members */}
        <div
          onClick={() => setActiveSegment("members")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSegment === "members"
              ? "bg-gradient-to-br from-blue-50/90 to-indigo-50/50 border-blue-400 ring-2 ring-blue-500/15 shadow-xs"
              : "bg-white border-slate-200/90 hover:border-blue-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-blue-700">
              <Wallet size={15} className="text-blue-600" /> Members ({kpis.memberCount})
            </span>
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-extrabold">
              Top-Up & Frequency
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-blue-100/80">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Total Topped Up</div>
              <div className="text-lg font-black text-blue-700">฿{kpis.totalMemberTopUp.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                #1: {topMembersByTopUp[0]?.name || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Service Orders Used</div>
              <div className="text-lg font-black text-slate-900">{kpis.totalMemberOrders.toLocaleString()} orders</div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                Most Often: {topMembersByFrequency[0]?.name || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: VIP Customers */}
        <div
          onClick={() => setActiveSegment("vip")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSegment === "vip"
              ? "bg-gradient-to-br from-amber-50/90 to-yellow-50/50 border-amber-400 ring-2 ring-amber-500/15 shadow-xs"
              : "bg-white border-slate-200/90 hover:border-amber-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-800">
              <Crown size={15} className="text-amber-600" /> VIP Customers ({kpis.vipCount})
            </span>
            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-extrabold">
              Spend & Frequency
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-amber-100/80">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Total Spent (฿)</div>
              <div className="text-lg font-black text-amber-700">฿{kpis.totalVipSpend.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                #1 Spender: {topVipBySpend[0]?.name || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Service Orders Used</div>
              <div className="text-lg font-black text-slate-900">{kpis.totalVipOrders.toLocaleString()} orders</div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                Most Often: {topVipByFrequency[0]?.name || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Corporate Accounts */}
        <div
          onClick={() => setActiveSegment("corporate")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeSegment === "corporate"
              ? "bg-gradient-to-br from-indigo-50/90 to-violet-50/50 border-indigo-400 ring-2 ring-indigo-500/15 shadow-xs"
              : "bg-white border-slate-200/90 hover:border-indigo-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-indigo-800">
              <Briefcase size={15} className="text-indigo-600" /> Corporate ({kpis.corpCount})
            </span>
            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] font-extrabold">
              Spend & Frequency
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-indigo-100/80">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Total Spent (฿)</div>
              <div className="text-lg font-black text-indigo-700">฿{kpis.totalCorpSpend.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                #1 Spender: {topCorpBySpend[0]?.companyName || topCorpBySpend[0]?.name || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">Service Orders Used</div>
              <div className="text-lg font-black text-slate-900">{kpis.totalCorpOrders.toLocaleString()} orders</div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                Most Often: {topCorpByFrequency[0]?.companyName || topCorpByFrequency[0]?.name || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Segment Switcher, Date Presets & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Segment Tabs */}
          <div className="inline-flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
            {[
              { id: "members", label: `💳 Members (${kpis.memberCount})` },
              { id: "vip", label: `👑 VIP Customers (${kpis.vipCount})` },
              { id: "corporate", label: `💼 Corporate (${kpis.corpCount})` },
              { id: "all", label: "All Segments Overview" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSegment(tab.id as SegmentTab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  activeSegment === tab.id
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Range Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "30days", label: "30 Days" },
                { id: "90days", label: "90 Days" },
                { id: "180days", label: "6 Months" },
                { id: "year", label: "This Year" },
                { id: "all", label: "12 Months" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  datePreset === p.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
            {datePreset === "custom" && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                />
              </div>
            )}
          </div>
        </div>

        {/* Search & Segment Sort Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer name, phone, Member ID, company name, or address..."
              className="w-full h-9 pl-9 pr-8 text-xs bg-slate-50/90 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {activeSegment === "members" ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Rank Members By:</span>
              {(
                [
                  { id: "topup_amount", label: "💰 Most Top-Up (฿)" },
                  { id: "service_orders", label: "🔄 Most Service Used (Orders)" },
                  { id: "service_spend", label: "🧺 Service Spend (฿)" },
                  { id: "wallet_balance", label: "💳 Wallet Balance" },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setMemberSortBy(s.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    memberSortBy === s.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Rank By:</span>
              {(
                [
                  { id: "service_spend", label: "💰 Spend Most Amount (฿)" },
                  { id: "service_orders", label: "🔄 Use Service Most Often (Orders)" },
                  { id: "aov", label: "📈 Highest Avg Order (฿)" },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStandardSortBy(s.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    standardSortBy === s.id
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW 1: MEMBERS (Who Top Up the Most vs Who Uses Service Most Often)  */}
      {/* ===================================================================== */}
      {(activeSegment === "members" || activeSegment === "all") && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Leaderboard: Members Who Top Up the Most */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={16} />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Members Who Top Up the Most (฿)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-blue-100">Top 10 by Top-Up Baht</span>
              </div>
              <div className="divide-y divide-slate-100 p-2">
                {topMembersByTopUp.slice(0, 10).map((m, idx) => (
                  <div
                    key={`topup-${m.key}`}
                    onClick={() => setSelectedCustomerKey(m.key)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                              ? "bg-slate-200 text-slate-800"
                              : idx === 2
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 truncate">{m.name}</span>
                          {m.memberId && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              #{m.memberId}
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-medium truncate">
                          {m.topUpCount} top-ups • Balance:{" "}
                          <span className="font-bold text-emerald-700">฿{m.creditBalance.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-blue-700">฿{m.topUpAmount.toLocaleString()}</div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        {m.topUpCount} top-ups • {m.serviceOrderCount} orders
                      </div>
                    </div>
                  </div>
                ))}
                {topMembersByTopUp.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No member top-up transactions found in this period.
                  </div>
                )}
              </div>
            </div>

            {/* Right Leaderboard: Members Who Use Our Service Most Often */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Members Who Use Our Service Most Often
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-indigo-100">Top 10 by Service Orders</span>
              </div>
              <div className="divide-y divide-slate-100 p-2">
                {topMembersByFrequency.slice(0, 10).map((m, idx) => (
                  <div
                    key={`freq-${m.key}`}
                    onClick={() => setSelectedCustomerKey(m.key)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                              ? "bg-slate-200 text-slate-800"
                              : idx === 2
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 truncate">{m.name}</span>
                          {m.memberId && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              #{m.memberId}
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-medium truncate">
                          Top Service: <span className="font-bold text-slate-700">{m.topServiceName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-indigo-600">{m.serviceOrderCount} orders</div>
                      <div className="text-[10.5px] font-bold text-slate-600">
                        ฿{m.serviceTotalSpend.toLocaleString()} spent
                      </div>
                    </div>
                  </div>
                ))}
                {topMembersByFrequency.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No member service orders found in this period.
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeSegment === "members" && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900">
                    Complete Members Top-Up & Service Usage Directory ({memberRows.length})
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Click any Member to inspect their complete Top-Up History, Wallet Balance, and Laundry Service Usage.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4 w-12">#</th>
                      <th className="py-3 px-4">Member Name & Contact</th>
                      <th className="py-3 px-4 text-right">Actual Top-Up Paid (฿)</th>
                      <th className="py-3 px-3 text-right">Top-Up Count</th>
                      <th className="py-3 px-3 text-right">Wallet Balance (฿)</th>
                      <th className="py-3 px-3 text-right">Service Used (Orders)</th>
                      <th className="py-3 px-4 text-right">Service Spend (฿)</th>
                      <th className="py-3 px-4">Favorite Service</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {memberRows.slice(0, 150).map((m, idx) => (
                      <tr
                        key={m.key}
                        onClick={() => setSelectedCustomerKey(m.key)}
                        className="hover:bg-blue-50/35 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-black text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">{m.name}</span>
                            {m.memberId && (
                              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-blue-100 text-blue-800 border-blue-200">
                                #{m.memberId}
                              </Badge>
                            )}
                            {m.isVIP && (
                              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-900 border-amber-300">
                                VIP
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10.5px] text-slate-500 mt-0.5">
                            {m.phone} {m.address !== "-" ? `• ${m.address}` : ""}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="text-sm font-black text-blue-700">฿{m.topUpAmount.toLocaleString()}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-800">{m.topUpCount} times</td>
                        <td className="py-3 px-3 text-right font-extrabold text-emerald-700">
                          ฿{m.creditBalance.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-sm font-black text-indigo-600">{m.serviceOrderCount} orders</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-bold text-slate-900">฿{m.serviceTotalSpend.toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400">฿{m.avgOrderValue.toLocaleString()}/order</div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700 truncate max-w-[180px]">{m.topServiceName}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] font-bold border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 rounded-lg cursor-pointer"
                          >
                            View <ChevronRight size={12} className="ml-0.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: VIP CUSTOMERS (Who Spends Most Amount vs Uses Service Often)  */}
      {/* ===================================================================== */}
      {(activeSegment === "vip" || activeSegment === "all") && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Leaderboard: VIPs Who Spend the Most Amount (฿) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown size={16} />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    VIP Customers Who Spend the Most (฿)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-amber-100">Top 10 by Baht Spent</span>
              </div>
              <div className="divide-y divide-slate-100 p-2">
                {topVipBySpend.slice(0, 10).map((v, idx) => (
                  <div
                    key={`vip-spend-${v.key}`}
                    onClick={() => setSelectedCustomerKey(v.key)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-amber-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                              ? "bg-slate-200 text-slate-800"
                              : idx === 2
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 truncate">{v.name}</span>
                          <Badge className="text-[8.5px] px-1.5 py-0 h-3.5 bg-amber-100 text-amber-900 border-amber-300">
                            VIP
                          </Badge>
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-medium truncate">
                          {v.serviceOrderCount} orders • Avg ฿{v.avgOrderValue.toLocaleString()}/order
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-amber-700">฿{v.serviceTotalSpend.toLocaleString()}</div>
                      <div className="text-[10px] font-semibold text-slate-500">{v.topServiceName}</div>
                    </div>
                  </div>
                ))}
                {topVipBySpend.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">No VIP customer orders in this period.</div>
                )}
              </div>
            </div>

            {/* Right Leaderboard: VIPs Who Use Our Service Most Often */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    VIP Customers Who Use Service Most Often
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-orange-100">Top 10 by Service Orders</span>
              </div>
              <div className="divide-y divide-slate-100 p-2">
                {topVipByFrequency.slice(0, 10).map((v, idx) => (
                  <div
                    key={`vip-freq-${v.key}`}
                    onClick={() => setSelectedCustomerKey(v.key)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-orange-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                              ? "bg-slate-200 text-slate-800"
                              : idx === 2
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-extrabold text-slate-900 truncate block">{v.name}</span>
                        <div className="text-[10.5px] text-slate-500 font-medium truncate">
                          Top Service: <span className="font-bold text-slate-700">{v.topServiceName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-orange-700">{v.serviceOrderCount} orders</div>
                      <div className="text-[10.5px] font-bold text-slate-600">
                        ฿{v.serviceTotalSpend.toLocaleString()} spent
                      </div>
                    </div>
                  </div>
                ))}
                {topVipByFrequency.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">No VIP customer orders in this period.</div>
                )}
              </div>
            </div>
          </div>

          {activeSegment === "vip" && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-black text-slate-900">
                  Complete VIP Customers Spend & Service Frequency Directory ({vipRows.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4 w-12">#</th>
                      <th className="py-3 px-4">VIP Customer & Address</th>
                      <th className="py-3 px-4 text-right">Total Spend (฿)</th>
                      <th className="py-3 px-4 text-right">Service Used (Orders)</th>
                      <th className="py-3 px-4 text-right">Avg Order (AOV)</th>
                      <th className="py-3 px-4">Favorite Service</th>
                      <th className="py-3 px-4 text-right">Last Order</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {vipRows.slice(0, 150).map((v, idx) => (
                      <tr
                        key={v.key}
                        onClick={() => setSelectedCustomerKey(v.key)}
                        className="hover:bg-amber-50/35 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-black text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">{v.name}</span>
                            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-900 border-amber-300">
                              VIP
                            </Badge>
                          </div>
                          <div className="text-[10.5px] text-slate-500 mt-0.5">
                            {v.phone} {v.address !== "-" ? `• ${v.address}` : ""}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-black text-amber-700">
                          ฿{v.serviceTotalSpend.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-black text-slate-900">
                          {v.serviceOrderCount} orders
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-700">
                          ฿{v.avgOrderValue.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700">{v.topServiceName}</td>
                        <td className="py-3 px-4 text-right text-slate-500">
                          {v.lastServiceOrderDate ? format(v.lastServiceOrderDate, "dd MMM yyyy") : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] font-bold border-amber-200 text-amber-800 bg-amber-50/60 hover:bg-amber-100 rounded-lg cursor-pointer"
                          >
                            View <ChevronRight size={12} className="ml-0.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 3: CORPORATE ACCOUNTS (Who Spends Most vs Uses Service Often)    */}
      {/* ===================================================================== */}
      {(activeSegment === "corporate" || activeSegment === "all") && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Leaderboard: Corporate Accounts That Spend the Most (฿) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-indigo-700 to-slate-800 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase size={16} />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Corporate Accounts That Spend the Most (฿)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-indigo-200">Top 10 by Baht Spent</span>
              </div>
              <div className="divide-y divide-slate-100 p-2">
                {topCorpBySpend.slice(0, 10).map((c, idx) => (
                  <div
                    key={`corp-spend-${c.key}`}
                    onClick={() => setSelectedCustomerKey(c.key)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                              ? "bg-slate-200 text-slate-800"
                              : idx === 2
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 truncate">
                            {c.companyName || c.name}
                          </span>
                          <Badge className="text-[8.5px] px-1.5 py-0 h-3.5 bg-indigo-100 text-indigo-800 border-indigo-200">
                            CORP
                          </Badge>
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-medium truncate">
                          {c.serviceOrderCount} orders • Avg ฿{c.avgOrderValue.toLocaleString()}/order
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-indigo-700">฿{c.serviceTotalSpend.toLocaleString()}</div>
                      <div className="text-[10px] font-semibold text-slate-500">{c.topServiceName}</div>
                    </div>
                  </div>
                ))}
                {topCorpBySpend.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">No Corporate account orders in this period.</div>
                )}
              </div>
            </div>

            {/* Right Leaderboard: Corporate Accounts That Use Service Most Often */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Corporate Accounts Using Service Most Often
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-teal-100">Top 10 by Service Orders</span>
              </div>
              <div className="divide-y divide-slate-100 p-2">
                {topCorpByFrequency.slice(0, 10).map((c, idx) => (
                  <div
                    key={`corp-freq-${c.key}`}
                    onClick={() => setSelectedCustomerKey(c.key)}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-teal-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? "bg-amber-400 text-amber-950"
                            : idx === 1
                              ? "bg-slate-200 text-slate-800"
                              : idx === 2
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-extrabold text-slate-900 truncate block">
                          {c.companyName || c.name}
                        </span>
                        <div className="text-[10.5px] text-slate-500 font-medium truncate">
                          Top Service: <span className="font-bold text-slate-700">{c.topServiceName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-teal-700">{c.serviceOrderCount} orders</div>
                      <div className="text-[10.5px] font-bold text-slate-600">
                        ฿{c.serviceTotalSpend.toLocaleString()} spent
                      </div>
                    </div>
                  </div>
                ))}
                {topCorpByFrequency.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">No Corporate account orders in this period.</div>
                )}
              </div>
            </div>
          </div>

          {activeSegment === "corporate" && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-black text-slate-900">
                  Complete Corporate Accounts Spend & Service Frequency Directory ({corporateRows.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4 w-12">#</th>
                      <th className="py-3 px-4">Company / Account & Contact</th>
                      <th className="py-3 px-4 text-right">Total Spend (฿)</th>
                      <th className="py-3 px-4 text-right">Service Used (Orders)</th>
                      <th className="py-3 px-4 text-right">Avg Order (AOV)</th>
                      <th className="py-3 px-4">Top Service Used</th>
                      <th className="py-3 px-4 text-right">Last Order</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {corporateRows.slice(0, 150).map((c, idx) => (
                      <tr
                        key={c.key}
                        onClick={() => setSelectedCustomerKey(c.key)}
                        className="hover:bg-indigo-50/35 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-black text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">{c.companyName || c.name}</span>
                            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-indigo-100 text-indigo-800 border-indigo-200">
                              CORPORATE
                            </Badge>
                          </div>
                          <div className="text-[10.5px] text-slate-500 mt-0.5">
                            {c.name} • {c.phone} {c.address !== "-" ? `• ${c.address}` : ""}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-black text-indigo-700">
                          ฿{c.serviceTotalSpend.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-black text-slate-900">
                          {c.serviceOrderCount} orders
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-700">
                          ฿{c.avgOrderValue.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700">{c.topServiceName}</td>
                        <td className="py-3 px-4 text-right text-slate-500">
                          {c.lastServiceOrderDate ? format(c.lastServiceOrderDate, "dd MMM yyyy") : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] font-bold border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 rounded-lg cursor-pointer"
                          >
                            View <ChevronRight size={12} className="ml-0.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Customer Detail Modal (Top-Up History + Service Breakdown) */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomerKey(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Users size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-base font-black text-slate-900">
                          {selectedCustomer.companyName || selectedCustomer.name}
                        </span>
                        {selectedCustomer.isMember && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
                            MEMBER{selectedCustomer.memberId ? ` #${selectedCustomer.memberId}` : ""}
                          </Badge>
                        )}
                        {selectedCustomer.isVIP && (
                          <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">VIP</Badge>
                        )}
                        {selectedCustomer.isCorporate && (
                          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px]">
                            CORPORATE
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {selectedCustomer.phone} {selectedCustomer.address !== "-" ? `• ${selectedCustomer.address}` : ""}
                      </p>
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80">
                    <div className="text-[10px] font-extrabold text-blue-700 uppercase">Actual Top-Up Paid</div>
                    <div className="text-lg font-black text-blue-800 mt-0.5">
                      ฿{selectedCustomer.topUpAmount.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-semibold text-blue-600">
                      {selectedCustomer.topUpCount} top-up payments
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                    <div className="text-[10px] font-extrabold text-emerald-700 uppercase">Wallet Balance</div>
                    <div className="text-lg font-black text-emerald-800 mt-0.5">
                      ฿{selectedCustomer.creditBalance.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-semibold text-emerald-600">Available credit</div>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80">
                    <div className="text-[10px] font-extrabold text-indigo-700 uppercase">Service Orders Used</div>
                    <div className="text-lg font-black text-indigo-800 mt-0.5">
                      {selectedCustomer.serviceOrderCount} orders
                    </div>
                    <div className="text-[10px] font-semibold text-indigo-600">
                      Avg ฿{selectedCustomer.avgOrderValue.toLocaleString()}/order
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80">
                    <div className="text-[10px] font-extrabold text-amber-800 uppercase">Total Service Spend</div>
                    <div className="text-lg font-black text-amber-900 mt-0.5">
                      ฿{selectedCustomer.serviceTotalSpend.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-semibold text-amber-700 truncate">
                      Top: {selectedCustomer.topServiceName}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Top-Up History */}
                  <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Wallet size={13} className="text-blue-600" />
                      Wallet Top-Up History ({selectedCustomer.topUpRecords.length})
                    </h4>
                    <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1 text-xs">
                      {selectedCustomer.topUpRecords.length === 0 ? (
                        <div className="py-6 text-center text-slate-400">No top-up records in this period.</div>
                      ) : (
                        selectedCustomer.topUpRecords.map((t) => (
                          <div key={t.id} className="py-2 flex items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-slate-800">{t.packageName}</div>
                              <div className="text-[10px] text-slate-400">
                                {format(new Date(t.createdAt), "dd MMM yyyy, HH:mm")} • {t.paymentChannel}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-black text-blue-700">฿{t.amount.toLocaleString()}</div>
                              <div className="text-[10px] font-semibold text-slate-400">Actual Paid</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right: Services Used Breakdown */}
                  <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={13} className="text-indigo-600" />
                      Services Used Most Often
                    </h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                      {selectedCustomer.serviceBreakdown.length === 0 ? (
                        <div className="py-6 text-center text-slate-400">No service orders in this period.</div>
                      ) : (
                        selectedCustomer.serviceBreakdown.map((svc, idx) => (
                          <div key={svc.name} className="flex items-center justify-between py-1 border-b border-slate-50">
                            <span className="font-bold text-slate-800 truncate">
                              {idx + 1}. {svc.name}
                            </span>
                            <span className="font-extrabold text-indigo-700 shrink-0">
                              {svc.orderCount} orders • ฿{svc.revenue.toLocaleString()}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedCustomerKey(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
