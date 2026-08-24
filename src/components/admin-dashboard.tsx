"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Clock, Truck, CheckCircle2, Map, User, MapPin, Navigation, CalendarDays,
  Banknote, Coins, ArrowUpRight, Zap, ClipboardCheck, Trophy, Sparkles, AlertTriangle,
  LayoutGrid, List, Search, Layers, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { shopStore, shiftStore, settingsStore, type Job, type JobStatus, type CashierShift } from "@/lib/store";
import { AdminLiveMap } from "@/components/map-loader";
import { useState, useEffect, useMemo, useRef, useSyncExternalStore, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import {
  getTasks, updateTask, createTask, archiveTask, unarchiveTask, toggleTaskChecklistItem,
  type TaskItem
} from "@/actions/tasks";
import { getUsers } from "@/actions/users";
import {
  TaskAdminDashboard,
  TaskUserDashboard,
  TaskFormModal,
  type AdminUser,
} from "@/components/admin-tasks";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100",
  },
  pickup: {
    label: "Pickup",
    className: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
  },
  delivery: {
    label: "Delivery",
    className: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50",
  },
  pickup_completed: {
    label: "Pickup Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  },
  billing: {
    label: "In Shop / Processing",
    className: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50",
  },
  completed: {
    label: "Completed",
    className: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  },
  topup: {
    label: "Topup Member",
    className: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50",
  },
};

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock size={13} />,
  pickup: <Truck size={13} />,
  billing: <CheckCircle2 size={13} />,
  delivery: <Truck size={13} />,
  completed: <CheckCircle2 size={13} />,
  cancelled: <CheckCircle2 size={13} />,
  topup: <Banknote size={13} />,
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const rowVariant = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0, 0, 0.2, 1] as const } },
};

export function AdminDashboard({ jobs }: { jobs: Job[] }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [dashboardSection, setDashboardSection] = useState<"operations" | "tasks">(() => {
    return isAdmin ? "operations" : "tasks";
  });

  const [activeTab, setActiveTab] = useState<"all" | "active" | JobStatus>("all");
  const [financePeriod, setFinancePeriod] = useState<"this_month" | "last_month" | "this_year" | "all_time">("this_month");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Tasks & Users State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const currentUserId = user?.id ?? "unknown";
  const currentUserName = (user as any)?.name ?? user?.email ?? "Admin";

  const loadData = async () => {
    setLoadingTasks(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        getTasks(
          user
            ? {
                id: user.id,
                role: user.role,
                isDepartmentHead: user.isDepartmentHead,
                department: user.department,
              }
            : undefined
        ),
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
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const today = new Date();
  const isToday = (dateStr: string | Date | undefined) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // Cashier shift state hooks
  const { activeShift, hasLoaded: hasLoadedShift } = useSyncExternalStore(
    shiftStore.subscribe,
    shiftStore.getSnapshot,
    shiftStore.getSnapshot
  );

  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot
  );
  
  const currentLanguage = settings?.language || "th";

  // Modal/Form states
  const [isOpenShiftOpen, setIsOpenShiftOpen] = useState(false);
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false);
  const [startingCash, setStartingCash] = useState("1000"); // default Starting Float
  const [actualCash, setActualCash] = useState("");
  const [openShiftNotes, setOpenShiftNotes] = useState("");
  const [closeShiftNotes, setCloseShiftNotes] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [isShiftSubmitting, setIsShiftSubmitting] = useState(false);

  // Monitor shifts for Admin
  const [openShifts, setOpenShifts] = useState<CashierShift[]>([]);
  const [isLoadingOpenShifts, setIsLoadingOpenShifts] = useState(false);

  const fetchOpenShifts = useCallback(async () => {
    if (user?.role === "admin" || user?.role === "manager") {
      setIsLoadingOpenShifts(true);
      try {
        const shifts = await shiftStore.getOpenShifts();
        setOpenShifts(shifts);
      } catch (e) {
        console.error("Failed to fetch open shifts", e);
      } finally {
        setIsLoadingOpenShifts(false);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchOpenShifts();
    const unsubscribe = shiftStore.subscribe(() => {
      fetchOpenShifts();
    });
    return () => unsubscribe();
  }, [fetchOpenShifts]);

  // Initial fetch of cashier shift if not loaded yet
  useEffect(() => {
    if (user?.id && !hasLoadedShift) {
      shiftStore.fetchActiveShift(user.id, user.branchId || undefined);
    }
  }, [user, hasLoadedShift]);

  // Default branch for opening a shift
  useEffect(() => {
    if (shopLocations.length > 0 && !selectedBranchId) {
      setSelectedBranchId(user?.branchId || shopLocations[0].id);
    }
  }, [shopLocations, user, selectedBranchId]);

  const isShiftFromPreviousDay = useMemo(() => {
    if (!activeShift?.openedAt) return false;
    const openedDate = new Date(activeShift.openedAt);
    const today = new Date();
    return (
      openedDate.getFullYear() !== today.getFullYear() ||
      openedDate.getMonth() !== today.getMonth() ||
      openedDate.getDate() !== today.getDate()
    );
  }, [activeShift]);

  // Compute live active shift stats
  const activeShiftStats = useMemo(() => {
    if (!activeShift) return {
      cashSales: 0,
      transferSales: 0,
      cardSales: 0,
      creditSales: 0,
      expectedCash: 0,
      totalOrders: 0
    };
    
    let cashSales = 0;
    let transferSales = 0;
    let cardSales = 0;
    let creditSales = 0;
    let totalOrders = 0;
    
    const shiftOpenTime = new Date(activeShift.openedAt).getTime();
    
    for (const job of jobs) {
      if (job.branchId !== activeShift.branchId) continue;
      
      let hasPaymentLog = false;
      let usedCash = false;
      let usedTransfer = false;
      let usedCard = false;
      let usedCredit = false;
      
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          if (parsed && Array.isArray(parsed.payments)) {
            hasPaymentLog = true;
            for (const pay of parsed.payments) {
              const payTime = new Date(pay.timestamp).getTime();
              if (payTime >= shiftOpenTime) {
                const method = pay.method?.toLowerCase();
                const amount = pay.amount || 0;
                if (method === "cash") {
                  cashSales += amount;
                  usedCash = true;
                } else if (method === "transfer") {
                  transferSales += amount;
                  usedTransfer = true;
                } else if (method === "card") {
                  cardSales += amount;
                  usedCard = true;
                } else if (method === "credit") {
                  creditSales += amount;
                  usedCredit = true;
                }
              }
            }
          }
        } catch {
          // Ignore
        }
      }
      
      if (!hasPaymentLog) {
        if (!job.createdAt) continue;
        const jobTime = new Date(job.createdAt).getTime();
        if (jobTime >= shiftOpenTime && job.createdBy === activeShift.userName && job.isPaid) {
          const method = job.paymentMethod?.toLowerCase();
          const amount = job.totalAmount || 0;
          if (method === "cash") {
            cashSales += amount;
            usedCash = true;
          } else if (method === "transfer") {
            transferSales += amount;
            usedTransfer = true;
          } else if (method === "card") {
            cardSales += amount;
            usedCard = true;
          } else if (method === "credit") {
            creditSales += amount;
            usedCredit = true;
          }
        }
      }
      
      if (usedCash || usedTransfer || usedCard || usedCredit) {
        totalOrders++;
      }
    }
    
    return {
      cashSales,
      transferSales,
      cardSales,
      creditSales,
      expectedCash: activeShift.startingCash + cashSales,
      totalOrders
    };
  }, [activeShift, jobs]);

  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const finalBranchId = user.branchId || selectedBranchId || shopLocations[0]?.id;
    if (!finalBranchId) {
      toast.error(currentLanguage === "en" ? "Please select a branch" : "กรุณาเลือกสาขา");
      return;
    }
    const cashVal = parseFloat(startingCash);
    if (isNaN(cashVal) || cashVal < 0) {
      toast.error(currentLanguage === "en" ? "Starting float must be at least 0" : "เงินทอนเริ่มต้นต้องไม่ต่ำกว่า 0");
      return;
    }
    setIsShiftSubmitting(true);
    try {
      await shiftStore.openShift(user.id, user.name || user.email, finalBranchId, cashVal, openShiftNotes);
      toast.success(
        currentLanguage === "en"
          ? "Cashier shift opened successfully."
          : "เปิดรอบลิ้นชักเงินสดสำเร็จแล้ว"
      );
      setIsOpenShiftOpen(false);
      setOpenShiftNotes("");
    } catch {
      toast.error(
        currentLanguage === "en"
          ? "Failed to open cashier shift"
          : "ไม่สามารถเปิดกะเก็บเงินได้"
      );
    } finally {
      setIsShiftSubmitting(false);
    }
  };

  const handleCloseShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    const cashVal = parseFloat(actualCash);
    if (isNaN(cashVal) || cashVal < 0) {
      toast.error(
        currentLanguage === "en"
          ? "Please enter a valid actual cash amount (must be at least 0)"
          : "กรุณาระบุเงินสดนับจริงให้ถูกต้อง (ต้องไม่น้อยกว่า 0)"
      );
      return;
    }
    setIsShiftSubmitting(true);
    try {
      await shiftStore.closeShift(activeShift.id, cashVal, closeShiftNotes);
      toast.success(
        currentLanguage === "en"
          ? "Cashier shift closed successfully. POS locked."
          : "ปิดรอบลิ้นชักเงินสดสำเร็จแล้ว หน้า POS ถูกล็อก"
      );
      setIsCloseShiftOpen(false);
      setActualCash("");
      setCloseShiftNotes("");
    } catch {
      toast.error(
        currentLanguage === "en"
          ? "Failed to close cashier shift"
          : "ไม่สามารถปิดรอบลิ้นชักเงินสดได้"
      );
    } finally {
      setIsShiftSubmitting(false);
    }
  };

  // Only display TODAY'S jobs for the dashboard
  let todaysJobs = jobs.filter(j => isToday(j.createdAt));

  const pendingCount = todaysJobs.filter((j) => j.status === "pending").length;
  const activeCount = todaysJobs.filter((j) => ["pickup", "billing", "delivery"].includes(j.status)).length;
  const completedCount = todaysJobs.filter((j) => j.status === "completed").length;

  const displayedJobs = todaysJobs.filter(j => activeTab === "all" ? true : activeTab === "active" ? ["pickup", "billing", "delivery"].includes(j.status) : j.status === activeTab);

  // Financial Summary
  const filteredCompletedJobs = jobs.filter(j => {
    if (j.status !== 'completed') return false;

    const date = new Date(j.completedAt || j.createdAt);
    if (financePeriod === "this_month") {
      return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    }
    if (financePeriod === "last_month") {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear();
    }
    if (financePeriod === "this_year") {
      return date.getFullYear() === today.getFullYear();
    }
    return true; // all_time
  });

  const monthlyRevenue = filteredCompletedJobs.reduce((sum, j) => sum + (j.totalAmount || 0), 0);
  const monthlyRiderPayout = filteredCompletedJobs.reduce((sum, j) => {
    const comm = (j.pickupCommission || 0) + (j.deliveryCommission || 0);
    return sum + (comm > 0 ? comm : (j.fee || 0));
  }, 0);
  const platformProfit = monthlyRevenue - monthlyRiderPayout;

  // Task KPI count for top banner
  const activeTasksCount = tasks.filter(t => !t.isArchived && (t.status === "todo" || t.status === "in_progress" || t.status === "stuck")).length;
  const stuckOverdueTasksCount = tasks.filter(t => !t.isArchived && (t.status === "stuck" || (t.status !== "done" && t.dueDate && new Date(t.dueDate) < today))).length;

  const handleSaveTask = async (taskData: any) => {
    if (editingTask) {
      const res = await updateTask(
        editingTask.id,
        taskData,
        { id: currentUserId, name: currentUserName, role: user?.role }
      );
      if (res.success) {
        toast.success("Task updated successfully");
        setModalOpen(false);
        loadData();
      } else {
        toast.error(res.error || "Failed to update task");
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

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ── Top Dashboard Navigation Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight flex items-center gap-2">
            <span>Operational & Tasks Command Center</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            {isAdmin
              ? `Tracking ${todaysJobs.length} jobs scheduled today · ${activeTasksCount} active team tasks`
              : `Personal workspace and action center for ${currentUserName}`}
          </p>
        </div>

        {/* Section Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70 shrink-0 self-start sm:self-auto">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setDashboardSection("operations")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                dashboardSection === "operations"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Truck size={14} className={dashboardSection === "operations" ? "text-indigo-600" : "text-slate-400"} />
              <span>Operations & Fleet</span>
              {pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setDashboardSection("tasks")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              dashboardSection === "tasks"
                ? "bg-white text-indigo-700 shadow-2xs font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {isAdmin ? (
              <>
                <Trophy size={14} className={dashboardSection === "tasks" ? "text-amber-500" : "text-slate-400"} />
                <span>Task Intelligence & Staff Ratings</span>
                {activeTasksCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold">
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
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                dashboardSection === "operations"
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Truck size={14} className={dashboardSection === "operations" ? "text-indigo-600" : "text-slate-400"} />
              <span>Jobs Timeline</span>
            </button>
          )}
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
            onFilterStaff={(staffName) => {
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
        /* ── SECTION 2: OPERATIONS & LOGISTICS VIEW ── */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Stats Cards */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            <StatCard label="Pending" count={pendingCount} icon={<Clock size={20} />} color="slate" onClick={() => setActiveTab("pending")} active={activeTab === "pending"} />
            <StatCard label="In Transit" count={activeCount} icon={<Truck size={20} />} color="indigo" onClick={() => setActiveTab("active")} active={activeTab === "active"} />
            <StatCard label="Completed Today" count={completedCount} icon={<CheckCircle2 size={20} />} color="teal" onClick={() => setActiveTab("completed")} active={activeTab === "completed"} />
          </motion.div>

          {/* Task Intelligence Quick Bar */}
          <div className="bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <ClipboardCheck size={20} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                  <span>Task Management & Intelligence Hub</span>
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.2 rounded-full border border-amber-200">⭐ 5-Star Staff Ratings</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  {activeTasksCount} active tasks · {stuckOverdueTasksCount > 0 ? `⚠️ ${stuckOverdueTasksCount} tasks need attention` : "✓ All on track"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDashboardSection("tasks")}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-2xs shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <span>View Task Leaderboard</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          {/* Financial Overview (Admin Only) */}
          {isAdmin && (
            <>
              <div className="flex flex-col mb-2 pt-2 sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Banknote size={14} />
                  Financial Performance
                </h2>
                <select
                  value={financePeriod}
                  onChange={(e) => setFinancePeriod(e.target.value as any)}
                  className="h-8 w-[140px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="this_year">This Year</option>
                  <option value="all_time">All Time</option>
                </select>
              </div>
              <motion.div
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl shadow-slate-200/50 relative overflow-hidden group">
                  <div className="absolute -right-6 -top-6 text-white/5 group-hover:text-white/10 transition-colors">
                    <Coins size={140} />
                  </div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Revenue</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold">฿{monthlyRevenue.toLocaleString()}</h3>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <ArrowUpRight size={10} />
                      Gross
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-4 leading-relaxed font-medium">Sum of all service fees from {filteredCompletedJobs.length} completed orders for this period.</p>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Rider Commissions</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold text-indigo-600">฿{monthlyRiderPayout.toLocaleString()}</h3>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 leading-relaxed font-medium">Payout calculated at 2 THB/km. Total payment due to independent riders.</p>
                </div>

                <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200/50 relative overflow-hidden group">
                  <div className="absolute -right-6 -top-6 text-white/5 group-hover:text-white/10 transition-colors">
                    <Banknote size={140} />
                  </div>
                  <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Platform Earnings</p>
                  <h3 className="text-3xl font-bold text-white">฿{platformProfit.toLocaleString()}</h3>
                  <p className="text-[10px] text-indigo-200/60 mt-4 leading-relaxed font-medium">Net generated after rider payouts (excl. fixed costs).</p>
                </div>
              </motion.div>
            </>
          )}

          {/* Split: Table + Map */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Table (Left — 3 cols) */}
            <motion.div
              className="xl:col-span-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Today's Timeline</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Categorized by operational status</p>
                </div>

                {/* Custom Interactive Tabs */}
                <div className="flex p-1 bg-slate-100/80 rounded-lg">
                  {(["all", "pending", "active", "completed"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`relative px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        activeTab === tab ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {activeTab === tab && (
                        <motion.div
                          layoutId="dashboardTab"
                          className="absolute inset-0 bg-white rounded-md shadow-sm border border-slate-200/50"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          style={{ zIndex: 0 }}
                        />
                      )}
                      <span className="relative z-10 capitalize">{tab === "active" ? "Active" : tab}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <Table>
                  <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-md">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[100px] text-xs font-semibold text-slate-500">Order ID</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Customer</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">Time</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-500">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {displayedJobs.length > 0 ? (
                        displayedJobs.map((job) => {
                          const status = statusConfig[job.status] || {
                            label: job.status,
                            className: "bg-slate-100 text-slate-700 border-slate-200",
                          };
                          const icon = statusIcon[job.status] || <Clock size={13} />;

                          return (
                            <motion.tr
                              key={job.id}
                              variants={rowVariant}
                              initial="initial"
                              animate="animate"
                              exit="exit"
                              className="group cursor-pointer hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0"
                              onClick={() => setSelectedJobId(job.id)}
                            >
                              <TableCell className="font-mono text-xs font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                #{job.id}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium text-slate-900">{job.customerName}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{job.customerPhone}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`gap-1.5 px-2 py-0.5 text-[10px] font-medium transition-all ${status.className}`}
                                >
                                  {icon}
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-slate-500 text-xs">
                                {format(new Date(job.createdAt), "HH:mm")}
                              </TableCell>
                              <TableCell className="text-right font-medium text-slate-900 text-xs">
                                ฿{job.totalAmount?.toLocaleString() || "0"}
                              </TableCell>
                            </motion.tr>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-48 text-center text-slate-400 text-xs">
                            No jobs found for the selected category.
                          </TableCell>
                        </TableRow>
                      )}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </motion.div>

            {/* Map (Right — 2 cols) */}
            <motion.div
              className="xl:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Live Rider Fleet</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Real-time GPS positions & hubs</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Active</span>
                </div>
              </div>
              <div className="flex-1 relative bg-slate-100">
                <AdminLiveMap minimal={true} />
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Task Tracker Dialog */}
      <Dialog open={!!selectedJobId} onOpenChange={(v) => !v && setSelectedJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8 bg-slate-50/50">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {selectedJobId && (
            <AdminTaskTracker job={jobs.find((j) => j.id === selectedJobId)!} />
          )}
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

function StatCard({
  label,
  count,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: "slate" | "indigo" | "teal";
  active?: boolean;
  onClick?: () => void;
}) {
  const colorMap = {
    slate: active ? "bg-slate-100 border-slate-300 shadow-sm" : "bg-slate-50 text-slate-600 border-slate-200",
    indigo: active ? "bg-indigo-100 border-indigo-300 shadow-sm" : "bg-indigo-50 text-indigo-700 border-indigo-100",
    teal: active ? "bg-teal-100 border-teal-300 shadow-sm" : "bg-teal-50 text-teal-700 border-teal-100",
  };
  const iconBgMap = {
    slate: "bg-slate-200 text-slate-700",
    indigo: "bg-indigo-100 text-indigo-700",
    teal: "bg-teal-100 text-teal-700",
  };

  return (
    <motion.div
      variants={rowVariant}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`rounded-xl border p-5 ${colorMap[color]} flex items-center gap-4 cursor-pointer transition-colors`}
    >
      <div className={`rounded-lg p-2.5 shadow-sm ${iconBgMap[color]} bg-white border border-slate-100`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{count}</p>
        <p className="text-sm font-semibold opacity-80">{label}</p>
      </div>
    </motion.div>
  );
}
