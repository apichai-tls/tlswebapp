import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, Truck, CheckCircle2, Map, User, MapPin, Navigation, CalendarDays, Banknote, Coins, ArrowUpRight, Zap } from "lucide-react";
import { format } from "date-fns";
import { jobStore, shopStore, type Job, type JobStatus } from "@/lib/store";
import { AdminLiveMap } from "@/components/map-loader";
import { useState, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { useAuth } from "@/providers/auth-provider";

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
};

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock size={13} />,
  pickup: <Truck size={13} />,
  billing: <CheckCircle2 size={13} />,
  delivery: <Truck size={13} />,
  completed: <CheckCircle2 size={13} />,
  cancelled: <CheckCircle2 size={13} />,
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const rowVariant = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0, 0, 0.2, 1] as const } },
};

export function AdminDashboard({ jobs }: { jobs: Job[] }) {
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

      {/* Financial Overview */}
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
                  const createdDate = new Date(job.createdAt);
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
