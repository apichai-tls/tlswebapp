import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, Truck, CheckCircle2, Map, User, MapPin, Navigation, Banknote, Coins, ArrowUpRight, Store, History, Play, Square } from "lucide-react";
import { format } from "date-fns";
import { shopStore, shiftStore, settingsStore, type Job, type JobStatus, type CashierShift } from "@/lib/store";
import { AdminLiveMap } from "@/components/map-loader";
import { useState, useSyncExternalStore, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { useAuth } from "@/providers/auth-provider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

export function AdminDashboard({
  jobs,
  onTabChange,
}: {
  jobs: Job[];
  onTabChange?: (
    tab:
      | "jobs"
      | "map"
      | "riders"
      | "pos"
      | "dashboard"
      | "dispatch"
      | "services"
      | "customers"
      | "settings"
      | "users"
      | "verify"
      | "calculator"
      | "activity-logs"
  ) => void;
}) {
  const [activeTab, setActiveTab] = useState<"all" | "active" | JobStatus>("all");
  const [financePeriod, setFinancePeriod] = useState<"this_month" | "last_month" | "this_year" | "all_time">("this_month");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const today = new Date();
  const isToday = (dateStr: string | Date | undefined) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const { user } = useAuth();
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
  const todaysJobs = jobs.filter(j => isToday(j.createdAt));
  

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

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
      <div className="flex flex-col mb-4">
         <h1 className="text-2xl font-bold text-slate-900 leading-tight">Operational Dashboard</h1>
         <p className="text-sm text-slate-500 font-medium">Tracking {todaysJobs.length} scheduled jobs for Today</p>
      </div>

      {/* Stats */}
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

      {/* Cashier Shift Management Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={(user?.role === "admin" || user?.role === "manager") ? "lg:col-span-2" : "lg:col-span-3"}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow relative overflow-hidden group">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${activeShift ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"}`}>
                  <Store size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {currentLanguage === "en" ? "Cashier Register & Shift Control" : "ลิ้นชักเงินสดและกะพนักงาน"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {activeShift 
                      ? `${currentLanguage === "en" ? "Active Branch" : "สาขาที่ปฏิบัติงาน"}: ${shopLocations.find(s => s.id === activeShift.branchId)?.name || "Unknown"}` 
                      : (currentLanguage === "en" ? "No active register shift" : "ไม่มีการเปิดกะปฏิบัติงาน")}
                  </p>
                </div>
              </div>
              <div>
                <Badge className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeShift ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                  {activeShift ? (currentLanguage === "en" ? "🟢 OPEN" : "🟢 เปิดกะ") : (currentLanguage === "en" ? "🔴 CLOSED" : "🔴 ปิดกะ")}
                </Badge>
              </div>
            </div>

            {/* Shift content info */}
            {activeShift ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-xs leading-relaxed font-semibold text-slate-700">
                    <div className="flex justify-between border-b border-slate-50 pb-1.5">
                      <span className="text-slate-400">{currentLanguage === "en" ? "Cashier" : "พนักงานแคชเชียร์"}:</span>
                      <span className="text-slate-950 font-bold">{activeShift.userName}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-1.5">
                      <span className="text-slate-400">{currentLanguage === "en" ? "Opened At" : "เวลาเปิดกะ"}:</span>
                      <span className="text-slate-950">{format(new Date(activeShift.openedAt), "dd MMM yyyy, HH:mm")}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-1.5">
                      <span className="text-slate-400">{currentLanguage === "en" ? "Starting Float" : "เงินทอนเริ่มต้น"}:</span>
                      <span className="text-slate-950">฿{activeShift.startingCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-1.5">
                      <span className="text-slate-400">{currentLanguage === "en" ? "Expected Drawer Cash" : "ยอดเงินสดที่ควรมี"}:</span>
                      <span className="text-emerald-700 font-bold">฿{activeShiftStats.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Payment breakdown */}
                  <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-4 space-y-2.5 text-[11px] leading-relaxed text-slate-600 font-semibold">
                    <p className="font-bold text-slate-900 border-b border-slate-100 pb-1 mb-1">
                      {currentLanguage === "en" ? "Shift Sales Summary" : "สรุปยอดขายแยกประเภทในกะ"}
                    </p>
                    <div className="flex justify-between">
                      <span>{currentLanguage === "en" ? "- Cash Sales" : "- ยอดเงินสด"}:</span>
                      <span className="font-bold text-slate-800">฿{activeShiftStats.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{currentLanguage === "en" ? "- Bank Transfer" : "- ยอดเงินโอน"}:</span>
                      <span className="font-bold text-slate-800">฿{activeShiftStats.transferSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{currentLanguage === "en" ? "- Card Payment" : "- ยอดชำระบัตร"}:</span>
                      <span className="font-bold text-slate-800">฿{activeShiftStats.cardSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{currentLanguage === "en" ? "- Store Credit" : "- ยอดวงเงินสมาชิก"}:</span>
                      <span className="font-bold text-slate-800">฿{activeShiftStats.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/60 pt-1.5 font-bold text-slate-900">
                      <span>{currentLanguage === "en" ? "Total Orders" : "ยอดออเดอร์สะสม"}:</span>
                      <span>{activeShiftStats.totalOrders} {currentLanguage === "en" ? "orders" : "ออเดอร์"}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setActualCash("");
                      setCloseShiftNotes("");
                      setIsCloseShiftOpen(true);
                    }}
                    className="h-9 px-4 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Square size={13} fill="currentColor" />
                    {currentLanguage === "en" ? "Close Shift" : "ปิดกะและบันทึกยอดเงิน"}
                  </Button>
                  {onTabChange && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onTabChange("pos")}
                      className="h-9 px-4 font-bold text-xs rounded-xl cursor-pointer border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
                    >
                      {currentLanguage === "en" ? "Go to Cashier POS" : "ไปยังหน้าจอแคชเชียร์ POS"}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {currentLanguage === "en" 
                    ? "In order to ring up sales and handle cash drawer operations in the POS register, you must first open a cashier shift with a starting float."
                    : "คุณต้องเปิดกะและกรอกเงินทอนเริ่มต้นในลิ้นชักก่อนใช้งานระบบขายหน้าร้าน (POS) เพื่อให้ยอดระบบเงินสดถูกต้องตามกะพนักงาน"}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setStartingCash("1000");
                      setOpenShiftNotes("");
                      setIsOpenShiftOpen(true);
                    }}
                    className="h-9 px-4 bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/10 cursor-pointer"
                  >
                    <Play size={12} fill="currentColor" />
                    {currentLanguage === "en" ? "Open Cashier Shift" : "เปิดรอบกะพนักงาน"}
                  </Button>
                  {onTabChange && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onTabChange("pos")}
                      className="h-9 px-4 font-bold text-xs rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                    >
                      {currentLanguage === "en" ? "Go to POS" : "ไปยังหน้า POS"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Other active branch shifts monitor */}
        {(user?.role === "admin" || user?.role === "manager") && (
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow h-full flex flex-col">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <History size={16} className="text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900">
                  {currentLanguage === "en" ? "Branch Shifts Live Monitor" : "มอนิเตอร์กะสาขาเรียลไทม์"}
                </h3>
              </div>
              
              <div className="flex-1 overflow-auto max-h-[220px] lg:max-h-[300px] space-y-3 pr-1">
                {isLoadingOpenShifts ? (
                  <p className="text-[11px] text-slate-400 font-semibold">{currentLanguage === "en" ? "Loading active shifts..." : "กำลังโหลดกะสาขา..."}</p>
                ) : openShifts.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-semibold py-4 text-center">
                    {currentLanguage === "en" ? "No open shifts at other branches." : "ไม่มีการเปิดกะในสาขาอื่นๆ ในขณะนี้"}
                  </p>
                ) : (
                  openShifts.map((shift) => (
                    <div key={shift.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2 text-xs font-semibold leading-relaxed">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-slate-900">
                          {shopLocations.find(s => s.id === shift.branchId)?.name || "Unknown Branch"}
                        </span>
                        <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1 py-0 h-4">
                          {currentLanguage === "en" ? "ACTIVE" : "กำลังเปิด"}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-slate-500 text-[10px]">
                        <div>{currentLanguage === "en" ? "Cashier" : "พนักงาน"}: <span className="text-slate-800">{shift.userName}</span></div>
                        <div>{currentLanguage === "en" ? "Opened" : "เวลาเปิด"}: <span className="text-slate-800">{format(new Date(shift.openedAt), "dd/MM, HH:mm")}</span></div>
                        <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200/50 pt-1.5 mt-1 text-[11px]">
                          <span>{currentLanguage === "en" ? "Drawer Float" : "เงินสดควรมีในตู้"}:</span>
                          <span className="text-indigo-600">฿{(shift.startingCash + shift.cashSales).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Financial Overview */}
      <div className="flex flex-col mb-2 pt-2 sm:flex-row sm:items-center justify-between gap-4">
         <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
           <Banknote size={14} />
           Financial Performance
         </h2>
         <select
           value={financePeriod}
           onChange={(e) => setFinancePeriod(e.target.value as typeof financePeriod)}
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
              <h2 className="text-base font-bold text-slate-900">Today&apos;s Timeline</h2>
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
          
          <div className="flex-1 overflow-auto">
            <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="font-semibold text-slate-600 w-[170px] pl-6">Job & Customer</TableHead>
                <TableHead className="font-semibold text-slate-600">Route</TableHead>
                <TableHead className="font-semibold text-slate-600 text-right">Price</TableHead>
                <TableHead className="font-semibold text-slate-600 text-center w-[120px] pr-2">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {displayedJobs.map((job, i) => {
                  return (
                    <motion.tr
                      layout
                      key={job.id}
                      onClick={() => setSelectedJobId(job.id)}
                    variants={rowVariant}
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, x: -10, transition: { duration: 0.2 } }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                    className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <TableCell className="pl-6 py-2">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <div className="font-mono text-xs font-semibold text-slate-900">{job.id.split('-')[0].toUpperCase()}</div>
                        <Badge variant="outline" className={`text-[9px] uppercase font-bold px-1.5 py-0 h-4 ${job.type === 'pickup' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {job.type}
                        </Badge>
                        {job.source === 'pos' && (
                          <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-amber-50 text-amber-600 border-amber-100">
                            POS
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[9px] bg-purple-50 text-purple-700 border-purple-100 px-1.5 py-0 h-4">
                          {job.serviceType === 'wash_iron_fold' ? 'W/I/F' : 'W/F'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-[11px] text-slate-600 flex items-center gap-1 font-medium">
                          <User size={11} className="text-slate-400" />
                          <span className="truncate max-w-[100px]">{job.customerName || "Guest"}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 font-medium bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                          <Clock size={10} className="text-amber-500" />
                          {format(new Date(job.scheduledAt), "dd MMM, HH:mm")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={12} className="shrink-0 text-emerald-600" />
                          <span className="text-[11px] text-slate-600 leading-tight truncate max-w-[160px]">{job.pickupLocation}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Navigation size={12} className="shrink-0 text-red-500" />
                          <span className="text-[11px] text-slate-600 leading-tight truncate max-w-[160px]">{job.dropoffLocation}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle py-2 text-right">
                      <div className="flex flex-col items-end justify-center">
                        { (job.totalAmount || 0) - (job.fee || 0) > 0 ? (
                          <div className="font-bold text-xs text-indigo-700">
                            ฿{(job.totalAmount || 0).toLocaleString()}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-600 font-medium">฿{job.fee}</span>
                            <Badge variant="outline" className="text-[9px] px-1 bg-amber-50 text-amber-600 border-amber-200 py-0 h-4">
                              TBD
                            </Badge>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{job.distance} km</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-2 align-middle">
                      <Badge variant="outline" className={`gap-1 w-full justify-center py-0.5 h-auto text-[10px] ${statusConfig[job.status]?.className || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                        {statusIcon[job.status] || <Clock size={13} />}
                        {statusConfig[job.status]?.label || job.status}
                      </Badge>
                    </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {displayedJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-16 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center">
                        <Map size={24} className="text-slate-300" />
                      </div>
                      <p className="font-medium text-sm">No jobs found for this exact criteria today.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </motion.div>

        {/* Map (Right — 2 cols) */}
        <motion.div
          className="xl:col-span-2 h-[420px] xl:h-[600px] xl:min-h-[600px]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Map size={16} className="text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900">Active Fleet Routing</h2>
              <span className="text-xs text-slate-400 ml-auto">Live preview</span>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-slate-200">
              <AdminLiveMap minimal={true} />
            </div>
          </div>
        </motion.div>
      </div>

      <Dialog open={!!selectedJobId} onOpenChange={(v) => !v && setSelectedJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8 bg-slate-50/50">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {selectedJobId && (
            <AdminTaskTracker job={jobs.find((j) => j.id === selectedJobId)!} />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Open Shift */}
      <Dialog open={isOpenShiftOpen} onOpenChange={setIsOpenShiftOpen}>
        <DialogContent className="max-w-md p-5 bg-white border border-slate-200 shadow-2xl rounded-2xl">
          <DialogHeader className="shrink-0 mb-3">
            <DialogTitle className="text-base font-black text-slate-950 flex items-center gap-2">
              <Store className="text-indigo-600" size={18} />
              {currentLanguage === "en" ? "Open Cashier Shift" : "เปิดรอบกะเก็บเงินพนักงาน"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleOpenShiftSubmit} className="space-y-4">
            {/* Branch Selection (Only if admin and has multiple branches) */}
            {(!user?.branchId && shopLocations.length > 0) ? (
              <div className="space-y-1.5">
                <Label htmlFor="branchSelect" className="text-xs font-bold text-slate-900">
                  {currentLanguage === "en" ? "Select Branch" : "เลือกสาขาเปิดกะ"}
                </Label>
                <select
                  id="branchSelect"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {shopLocations.map(shop => (
                    <option key={shop.id} value={shop.id}>{shop.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400">
                  {currentLanguage === "en" ? "Branch" : "สาขาปฏิบัติงาน"}
                </Label>
                <div className="text-xs font-bold text-slate-900 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2">
                  {shopLocations.find(s => s.id === (user?.branchId || selectedBranchId))?.name || "Unknown"}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="startingCash" className="text-xs font-bold text-slate-900">
                {currentLanguage === "en" ? "Starting Float Cash (THB)" : "ระบุเงินทอนเริ่มต้นในลิ้นชัก (บาท)"}
              </Label>
              <Input
                id="startingCash"
                type="number"
                min="0"
                step="any"
                placeholder="1000"
                className="bg-slate-50/50 border-slate-200 text-xs focus-visible:ring-indigo-500 rounded-xl"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="openShiftNotes" className="text-xs font-bold text-slate-900">
                {currentLanguage === "en" ? "Opening Notes" : "บันทึกเพิ่มเติมการเปิดกะ"}
              </Label>
              <Input
                id="openShiftNotes"
                type="text"
                placeholder={currentLanguage === "en" ? "e.g., standard float, morning shift..." : "เช่น ทอนเริ่มต้นประจำวัน, กะเช้า..."}
                className="bg-slate-50/50 border-slate-200 text-xs focus-visible:ring-indigo-500 rounded-xl"
                value={openShiftNotes}
                onChange={(e) => setOpenShiftNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2 border-t border-slate-100 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsOpenShiftOpen(false)}
                className="h-9 font-bold text-xs rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {currentLanguage === "en" ? "Cancel" : "ยกเลิก"}
              </Button>
              <Button
                type="submit"
                disabled={isShiftSubmitting}
                className="h-9 bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer shadow-lg shadow-indigo-600/10"
              >
                {currentLanguage === "en" ? "Open Shift" : "ยืนยันเปิดกะ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Close Shift */}
      <Dialog open={isCloseShiftOpen} onOpenChange={setIsCloseShiftOpen}>
        <DialogContent className="max-w-md p-5 bg-white border border-slate-200 shadow-2xl rounded-2xl">
          <DialogHeader className="shrink-0 mb-3">
            <DialogTitle className="text-base font-black text-slate-950 flex items-center gap-2">
              <Banknote className="text-red-500" size={18} />
              {currentLanguage === "en" ? "Close Cashier Shift & Drawer Report" : "รายงานการปิดกะและเงินทอนในตู้"}
            </DialogTitle>
          </DialogHeader>

          {activeShift && (
            <form onSubmit={handleCloseShiftSubmit} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 text-xs text-slate-800 font-semibold leading-relaxed">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold border-b border-slate-100 pb-1.5 mb-1">
                  <span>{currentLanguage === "en" ? "Staff" : "พนักงาน"}: {activeShift.userName}</span>
                  <span>
                    {currentLanguage === "en" ? "Opened" : "เวลาเปิด"}: {format(new Date(activeShift.openedAt), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {currentLanguage === "en" ? "1. Starting Float:" : "1. เงินทอนเริ่มต้น (Starting Float):"}
                  </span>
                  <span>฿{activeShift.startingCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {currentLanguage === "en" ? "2. Cash Sales:" : "2. ยอดขายเงินสด (Cash Sales):"}
                  </span>
                  <span className="text-emerald-600 font-bold">
                    +฿{activeShiftStats.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                <div className="flex justify-between font-black border-t border-dashed border-slate-200 pt-2 text-sm text-slate-950">
                  <span>
                    {currentLanguage === "en" ? "Expected Cash in Drawer:" : "ยอดเงินสดที่ควรมี (Expected Cash):"}
                  </span>
                  <span>฿{activeShiftStats.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="border-t border-slate-100 pt-2.5 mt-1 space-y-1 text-[11px] text-slate-500">
                  <p className="font-bold text-slate-900 mb-1">
                    {currentLanguage === "en" ? "Non-cash Sales:" : "ยอดขายช่องทางอื่น ๆ (Non-cash Sales):"}
                  </p>
                  <div className="flex justify-between">
                    <span>{currentLanguage === "en" ? "- Bank Transfer:" : "- โอนเงิน (Bank Transfer):"}</span>
                    <span>฿{activeShiftStats.transferSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{currentLanguage === "en" ? "- Card:" : "- บัตรเครดิต (Card):"}</span>
                    <span>฿{activeShiftStats.cardSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{currentLanguage === "en" ? "- Store Credit:" : "- วงเงินสมาชิก (Store Credit):"}</span>
                    <span>฿{activeShiftStats.creditSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="actualCash" className="text-xs font-bold text-slate-900">
                  {currentLanguage === "en" ? "Declare Actual Cash in Drawer (THB)" : "ยอดเงินสดนับได้จริงในเครื่อง (บาท)"}
                </Label>
                <Input
                  id="actualCash"
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="e.g., 4200"
                  className="bg-slate-50/50 border-slate-200 text-xs focus-visible:ring-indigo-500 rounded-xl"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                />
              </div>

              {actualCash.trim() !== "" && !isNaN(parseFloat(actualCash)) && (() => {
                const diff = parseFloat(actualCash) - activeShiftStats.expectedCash;
                return (
                  <div className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 leading-none ${
                    diff === 0 
                      ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                      : "bg-amber-50 border-amber-100 text-amber-800"
                  }`}>
                    {diff === 0 ? (
                      <span>🟢 {currentLanguage === "en" ? "Balanced" : "ยอดเงินตรงพอดี"}</span>
                    ) : diff > 0 ? (
                      <span>⚠️ {currentLanguage === "en" ? `Overage: +฿${diff.toLocaleString()}` : `เงินเกินระบบ: +฿${diff.toLocaleString()}`}</span>
                    ) : (
                      <span>⚠️ {currentLanguage === "en" ? `Shortage: -฿${Math.abs(diff).toLocaleString()}` : `เงินขาดระบบ: -฿${Math.abs(diff).toLocaleString()}`}</span>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <Label htmlFor="closeShiftNotes" className="text-xs font-bold text-slate-900">
                  {currentLanguage === "en" ? "Closing Notes" : "บันทึกเพิ่มเติมการปิดกะ"}
                </Label>
                <Input
                  id="closeShiftNotes"
                  type="text"
                  placeholder={currentLanguage === "en" ? "e.g., drawer balanced, extra coins..." : "เช่น ยอดเงินตรงปกติ..."}
                  className="bg-slate-50/50 border-slate-200 text-xs focus-visible:ring-indigo-500 rounded-xl"
                  value={closeShiftNotes}
                  onChange={(e) => setCloseShiftNotes(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-2 border-t border-slate-100 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCloseShiftOpen(false)}
                  className="h-9 font-bold text-xs rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  {currentLanguage === "en" ? "Cancel" : "ยกเลิก"}
                </Button>
                <Button
                  type="submit"
                  disabled={isShiftSubmitting}
                  className="h-9 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer shadow-lg shadow-red-600/10"
                >
                  {currentLanguage === "en" ? "Close Shift" : "ยืนยันปิดกะเก็บเงิน"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
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
