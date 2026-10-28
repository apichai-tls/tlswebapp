"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Clock, Truck, CheckCircle2, User, Building, MapPin,
  Banknote, Coins, ArrowUpRight, ClipboardCheck, Trophy, AlertTriangle,
  Search, Layers, Package, Receipt, Droplets, XCircle, RotateCcw,
  Sparkles, Shirt, Footprints, BedDouble, Wind, ShoppingBag, Store,
  CreditCard, Crown, Filter, CheckCircle, AlertCircle
} from "lucide-react";
import { format, isSameDay, subDays } from "date-fns";
import { shopStore, settingsStore, type Job, type JobStatus, type Customer } from "@/lib/store";
import { useCustomers } from "@/lib/use-customers";
import { AdminLiveMap } from "@/components/map-loader";
import { useState, useEffect, useMemo, useSyncExternalStore, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import {
  getTasks, updateTask, archiveTask, unarchiveTask, toggleTaskChecklistItem,
  type TaskItem
} from "@/actions/tasks";
import { getUsers } from "@/actions/users";
import {
  TaskAdminDashboard,
  TaskUserDashboard,
  TaskFormModal,
  type AdminUser,
} from "@/components/admin-tasks";
import { getJobKanbanColumn, getJobBillingMeta, getBranchShortName, type KanbanColumnId } from "@/components/admin-all-jobs";
import { isItemMatchingCategory } from "@/lib/promotions";

type PipelineStageKey = "all" | "tba" | "pending" | "pickup" | "billing" | "process" | "delivery" | "completed" | "cancel";

const PIPELINE_STAGES: {
  id: PipelineStageKey;
  label: string;
  labelTh: string;
  subLabel: string;
  badgeClass: string;
  activeBorder: string;
  iconBg: string;
  dotColor: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "all",
    label: "All Orders",
    labelTh: "งานทั้งหมด",
    subLabel: "Total in scope",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-200",
    activeBorder: "border-slate-900 ring-2 ring-slate-900/10 bg-slate-900 text-white",
    iconBg: "bg-slate-100 text-slate-700 border-slate-200",
    dotColor: "bg-slate-500",
    icon: <Layers size={16} />,
  },
  {
    id: "tba",
    label: "TBA",
    labelTh: "รอยืนยันเวลา",
    subLabel: "Unscheduled",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    activeBorder: "border-slate-500 ring-2 ring-slate-500/15 bg-slate-50/80",
    iconBg: "bg-slate-100 text-slate-600 border-slate-200",
    dotColor: "bg-slate-400",
    icon: <Clock size={16} />,
  },
  {
    id: "pending",
    label: "Pending",
    labelTh: "รอมอบหมายไรเดอร์",
    subLabel: "Awaiting dispatch",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    activeBorder: "border-amber-500 ring-2 ring-amber-500/15 bg-amber-50/40",
    iconBg: "bg-amber-50 text-amber-600 border-amber-200/80",
    dotColor: "bg-amber-500",
    icon: <Clock size={16} />,
  },
  {
    id: "pickup",
    label: "Pickup",
    labelTh: "กำลังไปรับผ้า",
    subLabel: "Rider collecting",
    badgeClass: "bg-orange-50 text-orange-800 border-orange-200",
    activeBorder: "border-orange-500 ring-2 ring-orange-500/15 bg-orange-50/40",
    iconBg: "bg-orange-50 text-orange-600 border-orange-200/80",
    dotColor: "bg-orange-500",
    icon: <Package size={16} />,
  },
  {
    id: "billing",
    label: "Billing",
    labelTh: "คิดเงิน / ออกบิล",
    subLabel: "Awaiting bill/check",
    badgeClass: "bg-violet-50 text-violet-800 border-violet-200",
    activeBorder: "border-violet-500 ring-2 ring-violet-500/15 bg-violet-50/40",
    iconBg: "bg-violet-50 text-violet-600 border-violet-200/80",
    dotColor: "bg-violet-500",
    icon: <Receipt size={16} />,
  },
  {
    id: "process",
    label: "In Process",
    labelTh: "กำลังซัก/อบ/รีด",
    subLabel: "Washing & packing",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    activeBorder: "border-blue-500 ring-2 ring-blue-500/15 bg-blue-50/40",
    iconBg: "bg-blue-50 text-blue-600 border-blue-200/80",
    dotColor: "bg-blue-500",
    icon: <Droplets size={16} />,
  },
  {
    id: "delivery",
    label: "Delivery",
    labelTh: "กำลังจัดส่ง",
    subLabel: "Out for delivery",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
    activeBorder: "border-teal-500 ring-2 ring-teal-500/15 bg-teal-50/40",
    iconBg: "bg-teal-50 text-teal-600 border-teal-200/80",
    dotColor: "bg-teal-500",
    icon: <Truck size={16} />,
  },
  {
    id: "completed",
    label: "Completed",
    labelTh: "เสร็จสมบูรณ์",
    subLabel: "Delivered / Done",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    activeBorder: "border-emerald-500 ring-2 ring-emerald-500/15 bg-emerald-50/40",
    iconBg: "bg-emerald-50 text-emerald-600 border-emerald-200/80",
    dotColor: "bg-emerald-500",
    icon: <CheckCircle2 size={16} />,
  },
  {
    id: "cancel",
    label: "Cancelled",
    labelTh: "ยกเลิก / คืนงาน",
    subLabel: "Cancelled / Return",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    activeBorder: "border-rose-500 ring-2 ring-rose-500/15 bg-rose-50/40",
    iconBg: "bg-rose-50 text-rose-600 border-rose-200/80",
    dotColor: "bg-rose-500",
    icon: <XCircle size={16} />,
  },
];

const SERVICE_CATEGORIES_META = [
  {
    id: "KILO",
    label: "Wash & Fold (Kilo)",
    labelTh: "ซักอบพับ (กิโล)",
    color: "bg-blue-500",
    lightBg: "bg-blue-50/80 border-blue-200/80 text-blue-700",
    icon: <ShoppingBag size={16} className="text-blue-600" />,
  },
  {
    id: "DRY CLEAN",
    label: "Dry Cleaning",
    labelTh: "ซักแห้ง",
    color: "bg-violet-500",
    lightBg: "bg-violet-50/80 border-violet-200/80 text-violet-700",
    icon: <Shirt size={16} className="text-violet-600" />,
  },
  {
    id: "IRON",
    label: "Ironing Service",
    labelTh: "บริการรีดผ้า",
    color: "bg-amber-500",
    lightBg: "bg-amber-50/80 border-amber-200/80 text-amber-700",
    icon: <Wind size={16} className="text-amber-600" />,
  },
  {
    id: "SHOES",
    label: "Shoe & Bag Spa",
    labelTh: "ซักรองเท้า / กระเป๋า",
    color: "bg-emerald-500",
    lightBg: "bg-emerald-50/80 border-emerald-200/80 text-emerald-700",
    icon: <Footprints size={16} className="text-emerald-600" />,
  },
  {
    id: "LINENS",
    label: "Bedding & Curtains",
    labelTh: "เครื่องนอน / ผ้าม่าน",
    color: "bg-indigo-500",
    lightBg: "bg-indigo-50/80 border-indigo-200/80 text-indigo-700",
    icon: <BedDouble size={16} className="text-indigo-600" />,
  },
  {
    id: "OTHER",
    label: "General / Other Laundry",
    labelTh: "บริการซักรีดอื่นๆ / รับ-ส่ง",
    color: "bg-slate-500",
    lightBg: "bg-slate-100 border-slate-200/80 text-slate-700",
    icon: <Sparkles size={16} className="text-slate-600" />,
  },
] as const;

export function AdminDashboard({ jobs }: { jobs: Job[] }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [dashboardSection, setDashboardSection] = useState<"operations" | "tasks">(() => {
    return isAdmin ? "operations" : "tasks";
  });

  const [activeStage, setActiveStage] = useState<PipelineStageKey>("all");
  const [selectedServiceCat, setSelectedServiceCat] = useState<string>("ALL");
  const [dateScope, setDateScope] = useState<"today_pipeline" | "today_only" | "yesterday" | "this_month" | "all_time">("today_pipeline");
  const [financePeriod, setFinancePeriod] = useState<"this_month" | "last_month" | "this_year" | "all_time">("this_month");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Tasks & Users State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const currentUserId = user?.id ?? "unknown";
  const currentUserName = user?.name ?? user?.email ?? "Admin";

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoadingTasks(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        getTasks({
          id: user.id,
          role: user.role,
          isDepartmentHead: user.isDepartmentHead,
          department: user.department,
        }),
        getUsers(),
      ]);
      if (tasksRes.success && tasksRes.data) {
        setTasks(tasksRes.data);
      }
      if (usersRes.success && usersRes.data) {
        setAdminUsers(usersRes.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTasks(false);
    }
  }, [user?.id, user?.role, user?.isDepartmentHead, user?.department]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot, settingsStore.getSnapshot);
  const currentLanguage = settings?.language || "th";

  // Default to "all" so no orders are unexpectedly hidden on first load
  const [customerSegment, setCustomerSegment] = useState<"all" | "retail" | "corporate" | "member" | "vip">("all");

  const customers = useCustomers();

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

  const getJobCustomerInfo = useCallback(
    (job: Job): { isCorp: boolean; isMember: boolean; isVIP: boolean; companyName?: string | null; customer?: Customer } => {
      let c: Customer | undefined;
      if (job.customerId && customerIdMap.has(job.customerId)) {
        c = customerIdMap.get(job.customerId);
      } else {
        const cleanPhone = (job.customerPhone || "").replace(/\D/g, "");
        if (cleanPhone.length >= 8) {
          c = customerPhoneMap.get(cleanPhone.slice(-9));
        }
      }
      const isCorp = Boolean(c && (c.isCorporate || c.tier === "corporate"));
      const isVIP = Boolean(c && (c.isVIP || c.tier === "vip"));
      const isMember = Boolean(
        (c && (c.isMember || (c.creditBalance ?? 0) > 0)) ||
        (job.paymentChannel || "").toLowerCase().includes("member") ||
        (job.paymentMethod || "").toLowerCase().includes("credit")
      );
      return { isCorp, isMember, isVIP, companyName: c?.companyName, customer: c };
    },
    [customerIdMap, customerPhoneMap]
  );

  // Helper: check if job matches selected dateScope
  const matchesDateScope = useCallback(
    (job: Job): boolean => {
      if (job.status === "topup") return false;
      const now = new Date();
      const yesterday = subDays(now, 1);
      const isActivePipeline = !["completed", "cancel", "return", "topup"].includes(job.status);

      const isJobOnDay = (targetDay: Date) =>
        (job.createdAt ? isSameDay(new Date(job.createdAt), targetDay) : false) ||
        (job.completedAt ? isSameDay(new Date(job.completedAt), targetDay) : false) ||
        (job.scheduledAt ? isSameDay(new Date(job.scheduledAt), targetDay) : false) ||
        (job.pickupScheduledAt ? isSameDay(new Date(job.pickupScheduledAt), targetDay) : false) ||
        (job.deliveryScheduledAt ? isSameDay(new Date(job.deliveryScheduledAt), targetDay) : false);

      if (dateScope === "today_pipeline") {
        return isActivePipeline || isJobOnDay(now);
      }
      if (dateScope === "today_only") {
        return isJobOnDay(now);
      }
      if (dateScope === "yesterday") {
        return isJobOnDay(yesterday);
      }
      if (dateScope === "this_month") {
        const d = new Date(job.createdAt || now);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true; // all_time
    },
    [dateScope]
  );

  // Base jobs filtered by Date Scope + Branch
  const dateAndBranchJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (!matchesDateScope(j)) return false;
      if (selectedBranchId !== "ALL" && j.branchId !== selectedBranchId) return false;
      return true;
    });
  }, [jobs, matchesDateScope, selectedBranchId]);

  // Customer Segment Breakdown (computed across dateAndBranchJobs)
  const segmentCounts = useMemo(() => {
    let retail = 0;
    let corporate = 0;
    let member = 0;
    let vip = 0;
    let all = 0;

    for (const j of dateAndBranchJobs) {
      all++;
      const info = getJobCustomerInfo(j);
      if (info.isCorp) corporate++;
      else retail++;
      if (info.isMember) member++;
      if (info.isVIP) vip++;
    }

    return { all, retail, corporate, member, vip };
  }, [dateAndBranchJobs, getJobCustomerInfo]);

  // Jobs filtered by selected Customer Segment
  const segmentScopedJobs = useMemo(() => {
    if (customerSegment === "all") return dateAndBranchJobs;
    return dateAndBranchJobs.filter((j) => {
      const info = getJobCustomerInfo(j);
      if (customerSegment === "corporate") return info.isCorp;
      if (customerSegment === "retail") return !info.isCorp;
      if (customerSegment === "member") return info.isMember;
      if (customerSegment === "vip") return info.isVIP;
      return true;
    });
  }, [dateAndBranchJobs, customerSegment, getJobCustomerInfo]);

  // Map job to PipelineStageKey
  const getJobStageKey = useCallback((job: Job): Exclude<PipelineStageKey, "all"> => {
    const col = getJobKanbanColumn(job);
    if (col === "return" || col === "cancel") return "cancel";
    if (
      col === "tba" ||
      col === "pending" ||
      col === "pickup" ||
      col === "billing" ||
      col === "process" ||
      col === "delivery" ||
      col === "completed"
    ) {
      return col;
    }
    return "pending";
  }, []);

  // 1. Operational Pipeline Stage Summary (All 8 stages + Total)
  const stageStats = useMemo(() => {
    const counts: Record<PipelineStageKey, { count: number; amount: number }> = {
      all: { count: 0, amount: 0 },
      tba: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
      pickup: { count: 0, amount: 0 },
      billing: { count: 0, amount: 0 },
      process: { count: 0, amount: 0 },
      delivery: { count: 0, amount: 0 },
      completed: { count: 0, amount: 0 },
      cancel: { count: 0, amount: 0 },
    };

    for (const j of segmentScopedJobs) {
      const amt = Number(j.totalAmount) || 0;
      const st = getJobStageKey(j);
      counts.all.count++;
      if (st !== "cancel") counts.all.amount += amt;
      counts[st].count++;
      counts[st].amount += amt;
    }

    return counts;
  }, [segmentScopedJobs, getJobStageKey]);

  // 2. Service Category Summary + Operational Alerts + Channel Breakdown
  const { serviceCategorySummary, operationalQuickStats, jobCategoryMap } = useMemo(() => {
    const catTotals: Record<string, { orderIds: Set<string>; itemCount: number; revenue: number }> = {
      KILO: { orderIds: new Set(), itemCount: 0, revenue: 0 },
      "DRY CLEAN": { orderIds: new Set(), itemCount: 0, revenue: 0 },
      IRON: { orderIds: new Set(), itemCount: 0, revenue: 0 },
      SHOES: { orderIds: new Set(), itemCount: 0, revenue: 0 },
      LINENS: { orderIds: new Set(), itemCount: 0, revenue: 0 },
      OTHER: { orderIds: new Set(), itemCount: 0, revenue: 0 },
    };

    const perJobCats = new Map<string, Set<string>>();

    let paidCount = 0;
    let paidRevenue = 0;
    let unpaidCount = 0;
    let unpaidAmount = 0;
    let posWalkInCount = 0;
    let onlineDeliveryCount = 0;
    let noBillCount = 0;
    let unsentBillCount = 0;
    let stuckCount = 0;

    for (const j of segmentScopedJobs) {
      if (j.status === "cancel" || j.status === "return") continue;

      const totalAmt = Number(j.totalAmount) || 0;
      const isPaid = Boolean(j.isPaid || j.isShopPaid);
      if (isPaid) {
        paidCount++;
        paidRevenue += totalAmt;
      } else {
        unpaidCount++;
        unpaidAmount += totalAmt;
      }

      const isPos = j.source === "pos" || (j.type as string) === "in_store";
      if (isPos) posWalkInCount++;
      else onlineDeliveryCount++;

      if (j.isStuck) stuckCount++;

      const billMeta = getJobBillingMeta(j);
      if (!billMeta.isBillIssued && ["billing", "process", "delivery"].includes(j.status)) {
        noBillCount++;
      } else if (billMeta.isBillIssued && !billMeta.isBillSent && ["billing", "process", "delivery"].includes(j.status)) {
        unsentBillCount++;
      }

      const jCats = new Set<string>();
      let parsedItems: any[] = [];
      if (j.itemsJson) {
        try {
          const parsed = JSON.parse(j.itemsJson);
          if (Array.isArray(parsed)) parsedItems = parsed;
        } catch {}
      }

      if (parsedItems.length > 0) {
        for (const it of parsedItems) {
          const qty = Math.max(1, Number(it.quantity ?? it.qty ?? 1) || 1);
          const lineTotal =
            it.totalPrice != null
              ? Number(it.totalPrice)
              : (Number(it.price) || 0) * qty;

          let matchedCat = "OTHER";
          if (isItemMatchingCategory(it, "SHOES")) matchedCat = "SHOES";
          else if (isItemMatchingCategory(it, "DRY CLEAN")) matchedCat = "DRY CLEAN";
          else if (isItemMatchingCategory(it, "IRON")) matchedCat = "IRON";
          else if (isItemMatchingCategory(it, "LINENS")) matchedCat = "LINENS";
          else if (isItemMatchingCategory(it, "KILO")) matchedCat = "KILO";

          catTotals[matchedCat].orderIds.add(j.id);
          catTotals[matchedCat].itemCount += qty;
          catTotals[matchedCat].revenue += lineTotal;
          jCats.add(matchedCat);
        }
      } else {
        // Fallback when itemsJson is empty
        catTotals.OTHER.orderIds.add(j.id);
        catTotals.OTHER.itemCount += 1;
        catTotals.OTHER.revenue += totalAmt;
        jCats.add("OTHER");
      }

      perJobCats.set(j.id, jCats);
    }

    const totalCategorizedRevenue = Object.values(catTotals).reduce((s, c) => s + c.revenue, 0);

    const summaryList = SERVICE_CATEGORIES_META.map((meta) => {
      const stat = catTotals[meta.id] || { orderIds: new Set(), itemCount: 0, revenue: 0 };
      const sharePct = totalCategorizedRevenue > 0 ? (stat.revenue / totalCategorizedRevenue) * 100 : 0;
      return {
        ...meta,
        orderCount: stat.orderIds.size,
        itemCount: Math.round(stat.itemCount * 10) / 10,
        revenue: Math.round(stat.revenue),
        sharePct,
      };
    });

    return {
      serviceCategorySummary: summaryList,
      operationalQuickStats: {
        paidCount,
        paidRevenue,
        unpaidCount,
        unpaidAmount,
        posWalkInCount,
        onlineDeliveryCount,
        noBillCount,
        unsentBillCount,
        stuckCount,
      },
      jobCategoryMap: perJobCats,
    };
  }, [segmentScopedJobs]);

  // Filtered jobs for Timeline Table
  const displayedJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return segmentScopedJobs
      .filter((j) => {
        if (activeStage !== "all" && getJobStageKey(j) !== activeStage) return false;
        if (selectedServiceCat !== "ALL") {
          const cats = jobCategoryMap.get(j.id);
          if (!cats || !cats.has(selectedServiceCat)) return false;
        }
        if (q) {
          const idMatch = (j.id || "").toLowerCase().includes(q);
          const billMatch = (j.billNo || "").toLowerCase().includes(q);
          const nameMatch = (j.customerName || "").toLowerCase().includes(q);
          const phoneMatch = (j.customerPhone || "").toLowerCase().includes(q);
          if (!idMatch && !billMatch && !nameMatch && !phoneMatch) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [segmentScopedJobs, activeStage, selectedServiceCat, searchQuery, getJobStageKey, jobCategoryMap]);

  // Financial Summary (based on selected segment across all jobs + financePeriod)
  const { filteredCompletedJobs, monthlyRevenue, monthlyRiderPayout, platformProfit } = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    const filtered = jobs.filter((j) => {
      if (j.status !== "completed") return false;
      if (selectedBranchId !== "ALL" && j.branchId !== selectedBranchId) return false;

      if (customerSegment !== "all") {
        const info = getJobCustomerInfo(j);
        if (customerSegment === "corporate" && !info.isCorp) return false;
        if (customerSegment === "retail" && info.isCorp) return false;
        if (customerSegment === "member" && !info.isMember) return false;
        if (customerSegment === "vip" && !info.isVIP) return false;
      }

      const date = new Date(j.completedAt || j.createdAt);
      if (financePeriod === "this_month") {
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      }
      if (financePeriod === "last_month") {
        return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
      }
      if (financePeriod === "this_year") {
        return date.getFullYear() === currentYear;
      }
      return true; // all_time
    });

    const revenue = filtered.reduce((sum, j) => sum + (j.totalAmount || 0), 0);
    const riderPayout = filtered.reduce((sum, j) => {
      const comm = (Number(j.pickupCommission) || 0) + (Number(j.deliveryCommission) || 0);
      return sum + comm;
    }, 0);
    const profit = revenue - riderPayout;

    return {
      filteredCompletedJobs: filtered,
      monthlyRevenue: revenue,
      monthlyRiderPayout: riderPayout,
      platformProfit: profit,
    };
  }, [jobs, selectedBranchId, customerSegment, getJobCustomerInfo, financePeriod]);

  // Task KPI count for top banner
  const { activeTasksCount, stuckOverdueTasksCount } = useMemo(() => {
    const now = new Date();
    let active = 0;
    let stuckOrOverdue = 0;

    for (const t of tasks) {
      if (t.isArchived) continue;
      if (t.status === "todo" || t.status === "in_progress" || t.status === "stuck") {
        active++;
      }
      if (t.status === "stuck" || (t.status !== "done" && t.dueDate && new Date(t.dueDate) < now)) {
        stuckOrOverdue++;
      }
    }

    return { activeTasksCount: active, stuckOverdueTasksCount: stuckOrOverdue };
  }, [tasks]);

  const handleSaveTask = async (taskData: any) => {
    if (editingTask) {
      const res = await updateTask(
        editingTask.id,
        taskData,
        { id: currentUserId, name: currentUserName, role: user?.role }
      );
      if (res.success && res.data) {
        toast.success("Task updated successfully");
        setTasks((prev) => prev.map((t) => (t.id === res.data!.id ? res.data! : t)));
        setModalOpen(false);
        setEditingTask(null);
        loadData();
        return res;
      } else {
        if (res.isConflict && res.latestTask) {
          setTasks((prev) => prev.map((t) => (t.id === res.latestTask!.id ? res.latestTask! : t)));
          setEditingTask(res.latestTask);
          toast.error(res.error || "ข้อมูลถูกอัปเดตโดยผู้ใช้อื่น กรุณาตรวจสอบแล้วกดบันทึกอีกครั้ง", { duration: 7000 });
          return res;
        }
        toast.error(res.error || "Failed to update task");
        return res;
      }
    }
  };

  const handleArchiveTask = async (taskId: string) => {
    const res = await archiveTask(taskId, { id: currentUserId, name: currentUserName });
    if (res.success) {
      toast.success("Task archived");
      setModalOpen(false);
      loadData();
    } else {
      toast.error(res.error || "Failed to archive task");
    }
  };

  const handleUnarchiveTask = async (taskId: string) => {
    const res = await unarchiveTask(taskId, { id: currentUserId, name: currentUserName });
    if (res.success) {
      toast.success("Task unarchived");
      setModalOpen(false);
      loadData();
    } else {
      toast.error(res.error || "Failed to unarchive task");
    }
  };

  const activePipelineTotal =
    stageStats.tba.count +
    stageStats.pending.count +
    stageStats.pickup.count +
    stageStats.billing.count +
    stageStats.process.count +
    stageStats.delivery.count;

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
      {/* ── Top Command Center Header ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Operational & Tasks Command Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
              {activePipelineTotal} In Pipeline
            </span>
            {operationalQuickStats.stuckCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <AlertTriangle size={12} />
                {operationalQuickStats.stuckCount} Stuck
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            {isAdmin
              ? `Real-time summary across ${stageStats.all.count} orders (฿${stageStats.all.amount.toLocaleString()}) · ${activeTasksCount} active team tasks`
              : `Personal workspace and action center for ${currentUserName}`}
          </p>
        </div>

        {/* Right Controls: Branch + Date Scope + Section Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {dashboardSection === "operations" && (
            <>
              {/* Branch Selector */}
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="h-9 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="ALL">All Branches ({shopLocations.length})</option>
                {shopLocations.map((b) => (
                  <option key={b.id} value={b.id}>
                    {getBranchShortName(b.name) || b.name}
                  </option>
                ))}
              </select>

              {/* Date Scope Selector */}
              <select
                value={dateScope}
                onChange={(e) => setDateScope(e.target.value as any)}
                className="h-9 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="today_pipeline">Today + Active Pipeline</option>
                <option value="today_only">Today Scheduled/Created</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_month">This Month</option>
                <option value="all_time">All Loaded Orders</option>
              </select>
            </>
          )}

          {/* Section Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setDashboardSection("operations")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  dashboardSection === "operations"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Truck size={14} className={dashboardSection === "operations" ? "text-indigo-600" : "text-slate-400"} />
                <span>Operations & Fleet</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setDashboardSection("tasks")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                dashboardSection === "tasks"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {isAdmin ? (
                <>
                  <Trophy size={14} className={dashboardSection === "tasks" ? "text-amber-500" : "text-slate-400"} />
                  <span>Task Intelligence</span>
                  {activeTasksCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black">
                      {activeTasksCount}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <ClipboardCheck size={14} className={dashboardSection === "tasks" ? "text-indigo-600" : "text-slate-400"} />
                  <span>My Task Action Hub</span>
                </>
              )}
            </button>

            {!isAdmin && (
              <button
                type="button"
                onClick={() => setDashboardSection("operations")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  dashboardSection === "operations"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Truck size={14} className={dashboardSection === "operations" ? "text-indigo-600" : "text-slate-400"} />
                <span>Jobs Timeline</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 1: TASK DASHBOARDS (ROLE ADAPTIVE) ── */}
      {dashboardSection === "tasks" ? (
        isAdmin ? (
          <TaskAdminDashboard
            tasks={tasks}
            adminUsers={adminUsers}
            onOpenTask={(task) => {
              setEditingTask(task);
              setModalOpen(true);
            }}
            onFilterStaff={() => {
              window.location.hash = "tasks";
            }}
          />
        ) : (
          <TaskUserDashboard
            tasks={tasks}
            adminUsers={adminUsers}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserDept={user?.department}
            isDepartmentHead={user?.isDepartmentHead}
            onOpenTask={(task) => {
              setEditingTask(task);
              setModalOpen(true);
            }}
            onToggleChecklist={async (taskId, itemId, completed) => {
              await toggleTaskChecklistItem(taskId, itemId, completed, { id: currentUserId, name: currentUserName });
              loadData();
            }}
          />
        )
      ) : (
        /* ── SECTION 2: MODERN OPERATIONS & FULL CATEGORY SUMMARY VIEW ── */
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 1. Customer Segment & Operational Quick Status Bar */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            {/* Customer Segment Filter Pills (7 cols) */}
            <div className="xl:col-span-7 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 px-1 shrink-0">
                <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                  Customer Segment
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70">
                {[
                  { id: "all", label: "All Segments", count: segmentCounts.all, icon: <Layers size={13} />, activeClass: "text-slate-900", badgeClass: "bg-slate-200 text-slate-800" },
                  { id: "retail", label: "Retail (B2C)", count: segmentCounts.retail, icon: <User size={13} />, activeClass: "text-indigo-700", badgeClass: "bg-indigo-100 text-indigo-700" },
                  { id: "member", label: "Member", count: segmentCounts.member, icon: <CreditCard size={13} />, activeClass: "text-emerald-700", badgeClass: "bg-emerald-100 text-emerald-700" },
                  { id: "vip", label: "VIP", count: segmentCounts.vip, icon: <Crown size={13} />, activeClass: "text-purple-700", badgeClass: "bg-purple-100 text-purple-700" },
                  { id: "corporate", label: "Corporate (B2B)", count: segmentCounts.corporate, icon: <Building size={13} />, activeClass: "text-amber-700", badgeClass: "bg-amber-100 text-amber-800" },
                ].map((seg) => {
                  const isSelected = customerSegment === seg.id;
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => setCustomerSegment(seg.id as any)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? `bg-white ${seg.activeClass} shadow-2xs font-extrabold`
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {seg.icon}
                      <span>{seg.label}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                          isSelected ? seg.badgeClass : "bg-slate-200/80 text-slate-600"
                        }`}
                      >
                        {seg.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Channel & Billing Health Summary Pills (5 cols) */}
            <div className="xl:col-span-5 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 flex flex-col justify-center">
                <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700 uppercase">
                  <span>Paid Orders</span>
                  <CheckCircle size={12} />
                </div>
                <div className="text-sm font-black text-emerald-950 mt-0.5">
                  {operationalQuickStats.paidCount} <span className="text-[11px] font-bold text-emerald-700">(฿{operationalQuickStats.paidRevenue.toLocaleString()})</span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 rounded-xl bg-amber-50/70 border border-amber-200/70 flex flex-col justify-center">
                <div className="flex items-center justify-between text-[10px] font-bold text-amber-700 uppercase">
                  <span>Unpaid</span>
                  <AlertCircle size={12} />
                </div>
                <div className="text-sm font-black text-amber-950 mt-0.5">
                  {operationalQuickStats.unpaidCount} <span className="text-[11px] font-bold text-amber-700">(฿{operationalQuickStats.unpaidAmount.toLocaleString()})</span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 rounded-xl bg-indigo-50/70 border border-indigo-200/70 flex flex-col justify-center">
                <div className="flex items-center justify-between text-[10px] font-bold text-indigo-700 uppercase">
                  <span>Online / POS</span>
                  <Store size={12} />
                </div>
                <div className="text-sm font-black text-indigo-950 mt-0.5">
                  {operationalQuickStats.onlineDeliveryCount} <span className="text-slate-400 font-normal">/</span> {operationalQuickStats.posWalkInCount}
                </div>
              </div>

              <div className="px-2.5 py-1.5 rounded-xl bg-violet-50/70 border border-violet-200/70 flex flex-col justify-center">
                <div className="flex items-center justify-between text-[10px] font-bold text-violet-700 uppercase">
                  <span>Bill Action</span>
                  <Receipt size={12} />
                </div>
                <div className="text-xs font-black text-violet-950 mt-0.5 truncate" title="No Bill / Unsent Bill">
                  {operationalQuickStats.noBillCount} No Bill · {operationalQuickStats.unsentBillCount} Unsent
                </div>
              </div>
            </div>
          </div>

          {/* 2. ALL OPERATIONAL PIPELINE STAGE CATEGORIES (9 Interactive Cards) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-indigo-600" />
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Order Pipeline Stage Summary (All Categories)
                </h2>
              </div>
              {activeStage !== "all" && (
                <button
                  type="button"
                  onClick={() => setActiveStage("all")}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  Reset Stage Filter ✕
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2.5">
              {PIPELINE_STAGES.map((stage) => {
                const stat = stageStats[stage.id];
                const isSelected = activeStage === stage.id;
                const isDarkAll = stage.id === "all" && isSelected;

                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setActiveStage(stage.id)}
                    className={`text-left rounded-xl border p-3 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isSelected
                        ? stage.activeBorder
                        : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 w-full">
                      <span
                        className={`text-[11px] font-extrabold uppercase tracking-wide truncate ${
                          isDarkAll ? "text-slate-200" : "text-slate-700"
                        }`}
                      >
                        {stage.label}
                      </span>
                      <div
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${
                          isDarkAll ? "bg-white/15 text-white border-white/20" : stage.iconBg
                        }`}
                      >
                        {stage.icon}
                      </div>
                    </div>

                    <div>
                      <div
                        className={`text-2xl font-black tracking-tight leading-none ${
                          isDarkAll ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {stat.count}
                      </div>
                      <div
                        className={`text-[11px] font-bold mt-1 truncate ${
                          isDarkAll ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        ฿{stat.amount.toLocaleString()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. ALL SERVICE CATEGORIES SUMMARY SHOWCASE */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-600" />
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Service Categories Breakdown Summary
                </h2>
                <span className="text-[11px] text-slate-400 font-medium">
                  Click any category to filter orders below
                </span>
              </div>
              {selectedServiceCat !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setSelectedServiceCat("ALL")}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer self-start sm:self-auto"
                >
                  Show All Service Categories ✕
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {serviceCategorySummary.map((cat) => {
                const isSelected = selectedServiceCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedServiceCat(isSelected ? "ALL" : cat.id)}
                    className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? "border-indigo-600 ring-2 ring-indigo-500/15 bg-indigo-50/30 shadow-xs"
                        : "border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-slate-300 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-800 truncate">{cat.label}</div>
                        <div className="text-[10.5px] font-medium text-slate-400 truncate">{cat.labelTh}</div>
                      </div>
                      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${cat.lightBg}`}>
                        {cat.icon}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-lg font-black text-slate-900">฿{cat.revenue.toLocaleString()}</span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {cat.orderCount} {cat.orderCount === 1 ? "order" : "orders"} · {cat.itemCount} qty
                        </span>
                      </div>

                      {/* Share Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${cat.color} rounded-full transition-all duration-300`}
                          style={{ width: `${Math.min(100, Math.max(cat.orderCount > 0 ? 6 : 0, cat.sharePct))}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>Revenue Share</span>
                        <span>{cat.sharePct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. FINANCIAL PERFORMANCE + TASK HUB COMPACT ROW */}
          {isAdmin && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Financial Cards (8 cols) */}
              <div className="xl:col-span-8 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Banknote size={15} className="text-emerald-600" />
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Completed Financial Performance ({filteredCompletedJobs.length} Completed Orders)
                    </h2>
                  </div>
                  <select
                    value={financePeriod}
                    onChange={(e) => setFinancePeriod(e.target.value as any)}
                    className="h-7 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                  >
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_year">This Year</option>
                    <option value="all_time">All Time</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 text-white/5">
                      <Coins size={90} />
                    </div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Gross Revenue</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <h3 className="text-2xl font-black">฿{monthlyRevenue.toLocaleString()}</h3>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <ArrowUpRight size={10} />
                        Gross
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 font-medium">
                      From {filteredCompletedJobs.length} completed orders
                    </p>
                  </div>

                  <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Rider Commissions</p>
                      <h3 className="text-2xl font-black text-indigo-600 mt-1">
                        ฿{monthlyRiderPayout.toLocaleString()}
                      </h3>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 font-medium">
                      Pickup & delivery rider payouts
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl p-4 text-white relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 text-white/10">
                      <Banknote size={90} />
                    </div>
                    <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest">Net Platform Earnings</p>
                    <h3 className="text-2xl font-black text-white mt-1">฿{platformProfit.toLocaleString()}</h3>
                    <p className="text-[10px] text-indigo-100/80 mt-2 font-medium">
                      Net after rider commissions
                    </p>
                  </div>
                </div>
              </div>

              {/* Task Intelligence Hub Card (4 cols) */}
              <div className="xl:col-span-4 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50 border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-col justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                    <ClipboardCheck size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black uppercase tracking-wider text-indigo-900">
                        Task & Staff Intelligence
                      </span>
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-200">
                        ⭐ 5-Star Ratings
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed">
                      <strong className="text-slate-900">{activeTasksCount}</strong> active tasks across departments ·{" "}
                      {stuckOverdueTasksCount > 0 ? (
                        <span className="text-rose-600 font-bold">⚠️ {stuckOverdueTasksCount} need attention</span>
                      ) : (
                        <span className="text-emerald-600 font-bold">✓ All tasks on track</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Staff KPI & Leaderboard
                  </span>
                  <button
                    type="button"
                    onClick={() => setDashboardSection("tasks")}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-2xs cursor-pointer"
                  >
                    <span>Open Task Hub</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. SPLIT: INTERACTIVE ORDERS TIMELINE TABLE (LEFT 7 COLS) + LIVE RIDER FLEET MAP (RIGHT 5 COLS) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Orders Timeline Table */}
            <div className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden flex flex-col h-[560px]">
              <div className="px-4 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                      Orders Timeline & Category Explorer
                    </h2>
                    <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[11px] font-bold">
                      {displayedJobs.length} orders
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Showing{" "}
                    <strong className="text-slate-700">
                      {PIPELINE_STAGES.find((s) => s.id === activeStage)?.label || "All"}
                    </strong>
                    {selectedServiceCat !== "ALL" && (
                      <>
                        {" "}
                        in{" "}
                        <strong className="text-indigo-600">
                          {SERVICE_CATEGORIES_META.find((c) => c.id === selectedServiceCat)?.label}
                        </strong>
                      </>
                    )}
                  </p>
                </div>

                {/* Search Input */}
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Order ID, Bill, Customer..."
                    className="w-full h-8 pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="overflow-auto flex-1">
                <Table>
                  <TableHeader className="bg-slate-50/90 sticky top-0 z-10 backdrop-blur-xs">
                    <TableRow className="hover:bg-transparent border-slate-200/70">
                      <TableHead className="w-[120px] text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                        Order / Bill
                      </TableHead>
                      <TableHead className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                        Customer & Branch
                      </TableHead>
                      <TableHead className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                        Service Categories
                      </TableHead>
                      <TableHead className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                        Stage
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedJobs.length > 0 ? (
                      displayedJobs.slice(0, 120).map((job) => {
                        const stageKey = getJobStageKey(job);
                        const stageMeta =
                          PIPELINE_STAGES.find((s) => s.id === stageKey) || PIPELINE_STAGES[2];
                        const custInfo = getJobCustomerInfo(job);
                        const branchObj = shopLocations.find((b) => b.id === job.branchId);
                        const branchShort = getBranchShortName(branchObj?.name || "");
                        const jobCats = Array.from(jobCategoryMap.get(job.id) || []);
                        const isPaid = Boolean(job.isPaid || job.isShopPaid);

                        return (
                          <TableRow
                            key={job.id}
                            onClick={() => setSelectedJobId(job.id)}
                            className="group cursor-pointer hover:bg-indigo-50/40 transition-colors border-b border-slate-100"
                          >
                            <TableCell className="py-2.5">
                              <div className="font-mono text-xs font-black text-slate-900 group-hover:text-indigo-600">
                                #{job.id}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {job.billNo ? (
                                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                                    {job.billNo}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">
                                    {format(new Date(job.createdAt), "dd MMM HH:mm")}
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-slate-900">
                                  {job.customerName || "Walk-in Customer"}
                                </span>
                                {custInfo.isCorp && (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-50 text-amber-800 border-amber-200 text-[9px] py-0 px-1.5 font-bold"
                                  >
                                    Corp
                                  </Badge>
                                )}
                                {custInfo.isVIP && (
                                  <Badge
                                    variant="outline"
                                    className="bg-purple-50 text-purple-700 border-purple-200 text-[9px] py-0 px-1.5 font-bold"
                                  >
                                    VIP
                                  </Badge>
                                )}
                                {custInfo.isMember && (
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] py-0 px-1.5 font-bold"
                                  >
                                    Member
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10.5px] text-slate-400 mt-0.5">
                                {job.customerPhone && <span className="font-mono">{job.customerPhone}</span>}
                                {branchShort && (
                                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 rounded">
                                    {branchShort}
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {jobCats.length > 0 ? (
                                  jobCats.map((cid) => {
                                    const meta = SERVICE_CATEGORIES_META.find((m) => m.id === cid);
                                    if (!meta) return null;
                                    return (
                                      <span
                                        key={cid}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${meta.lightBg}`}
                                      >
                                        {meta.label.split(" ")[0]}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-[10px] text-slate-400">—</span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="py-2.5">
                              <Badge
                                variant="outline"
                                className={`gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${stageMeta.badgeClass}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${stageMeta.dotColor}`} />
                                {stageMeta.label}
                              </Badge>
                            </TableCell>

                            <TableCell className="py-2.5 text-right">
                              <div className="font-black text-slate-900 text-xs">
                                ฿{(job.totalAmount || 0).toLocaleString()}
                              </div>
                              <div
                                className={`text-[9.5px] font-bold ${
                                  isPaid ? "text-emerald-600" : "text-amber-600"
                                }`}
                              >
                                {isPaid ? "PAID" : "UNPAID"}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-48 text-center text-slate-400 text-xs">
                          No orders match the current filter criteria.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Live Rider Fleet Map (Right 5 cols) */}
            <div className="xl:col-span-5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden flex flex-col h-[560px]">
              <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    Live Rider Fleet & Hubs
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Real-time GPS positions & active routes
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/70">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Live GPS</span>
                </div>
              </div>
              <div className="flex-1 relative bg-slate-100">
                <AdminLiveMap minimal={true} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Tracker Dialog */}
      <Dialog open={!!selectedJobId} onOpenChange={(v) => !v && setSelectedJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8 bg-slate-50/50">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {selectedJobId && (() => {
            const currentJob = jobs.find((j) => j.id === selectedJobId);
            return currentJob ? <AdminTaskTracker job={currentJob} /> : null;
          })()}
        </DialogContent>
      </Dialog>

      {/* Task Edit / Create Modal directly inside Dashboard */}
      {modalOpen && (
        <TaskFormModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingTask(null);
          }}
          onSave={handleSaveTask}
          onArchive={handleArchiveTask}
          onUnarchive={handleUnarchiveTask}
          initialTask={editingTask}
          adminUsers={adminUsers}
          currentUser={user}
          onUpdateTask={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setEditingTask(updated);
          }}
          onPreviewImage={(url) => setPreviewImage(url)}
        />
      )}

      {/* Zoomable Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <img
            src={previewImage}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
