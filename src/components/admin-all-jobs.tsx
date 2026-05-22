"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Navigation, Truck, Package, CheckCircle2, Search, Filter, User, Zap, XCircle, Edit2, MoreHorizontal, LayoutList, LayoutGrid, Receipt, Droplets, Wind, Shirt, Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, differenceInMinutes, isSameDay, subDays } from "date-fns";
import { useEffect } from "react";
import { useRiders } from "@/lib/use-riders";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { jobStore, shopStore, customerStore, type Job, type JobStatus } from "@/lib/store";
import { useSyncExternalStore } from "react";
const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  tba: { label: "TBA", className: "bg-slate-100 text-slate-500 border-slate-300" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  pickup: { label: "Pickup", className: "bg-amber-50 text-amber-700 border-amber-200" },
  billing: { label: "Process", className: "bg-blue-50 text-blue-700 border-blue-200" },
  delivery: { label: "Delivery", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancel: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200" },
  return: { label: "Return", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

const statusIcon: Record<JobStatus, React.ReactNode> = {
  tba: <Clock size={13} />,
  pending: <Clock size={13} />,
  pickup: <Package size={13} />,
  billing: <Clock size={13} />,
  delivery: <Truck size={13} />,
  completed: <CheckCircle2 size={13} />,
  cancel: <XCircle size={13} />,
  return: <Navigation size={13} />,
};

type FilterDate = "today" | "yesterday" | "custom";

const KANBAN_COLUMNS: JobStatus[] = ['tba', 'pending', 'pickup', 'billing', 'delivery', 'completed', 'cancel'];

export function AdminAllJobs({ jobs, onEditJob, onCreateJob }: { jobs: Job[], onEditJob?: (job: Job) => void, onCreateJob?: () => void }) {
  const riders = useRiders();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<FilterDate>("today");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  
  const [cancellingJob, setCancellingJob] = useState<Job | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const customers = useSyncExternalStore(customerStore.subscribe, customerStore.getSnapshot, customerStore.getSnapshot);

  const today = new Date();
  const yesterday = subDays(today, 1);

  const visibleKanbanColumns = KANBAN_COLUMNS.filter(
    status => {
      if (user?.role === 'manager' && status === 'tba') return false;
      if (status === 'completed' && !showCompleted) return false;
      if (status === 'cancel' && !showCancelled) return false;
      return true;
    }
  );

  useEffect(() => {
    let start: Date;
    let end: Date;
    
    if (dateFilter === "today") {
      start = today;
      end = today;
    } else if (dateFilter === "yesterday") {
      start = yesterday;
      end = yesterday;
    } else if (dateFilter === "custom") {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      return; 
    }
    
    setIsLoadingHistory(true);
    jobStore.fetchHistoricalJobs(start, end).finally(() => setIsLoadingHistory(false));
  }, [dateFilter, startDate, endDate]);

  // Filter Logic
  const filteredJobs = jobs.filter((job) => {
    // 0. Manager Role Filter & Area Filter
    if (user?.role === 'manager') {
      if (job.status === 'tba') return false;
      if (job.status === 'pending') return false;
      if (user.area && user.area !== 'ALL') {
        const branch = shopLocations.find(s => s.id === job.branchId);
        if (branch?.area !== user.area) return false;
      }
    }

    // 1. Search Query (ID, Customer Name, or Phone)
    const matchesSearch = 
      job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.customerName && job.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.customerPhone && job.customerPhone.includes(searchTerm));

    let matchesDate = true;
    const isActive = !['completed', 'cancel', 'return'].includes(job.status);
    
    if (dateFilter === "today") {
      matchesDate = isSameDay(new Date(job.createdAt), today) || 
                    isActive || 
                    (job.completedAt ? isSameDay(new Date(job.completedAt), today) : false);
    } else if (dateFilter === "yesterday") {
      matchesDate = isSameDay(new Date(job.createdAt), yesterday) || 
                    (job.completedAt ? isSameDay(new Date(job.completedAt), yesterday) : false);
    } else if (dateFilter === "custom") {
      const jobDate = new Date(job.createdAt);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = (jobDate >= start && jobDate <= end) || 
                    (job.completedAt ? (new Date(job.completedAt) >= start && new Date(job.completedAt) <= end) : false);
    }

    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = job.status === statusFilter;
    } else {
      if (job.status === 'completed' && !showCompleted && viewMode === "list") matchesStatus = false;
      if (job.status === 'cancel' && !showCancelled && viewMode === "list") matchesStatus = false;
    }

    return matchesSearch && matchesDate && matchesStatus;
  });

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">All Jobs</h2>
              <p className="text-sm text-slate-500 mt-1">Review all past and active jobs, track durations and distances.</p>
            </div>
          </div>
          <div className="flex rounded-md shadow-sm border border-slate-200 bg-slate-50 p-1 shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${viewMode === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <LayoutList size={16} />
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${viewMode === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <LayoutGrid size={16} />
              Kanban
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input 
              placeholder="Search ID or Customer..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[200px] bg-white border-slate-200" 
            />
          </div>
          
          <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-md px-3 py-1.5 h-10">
            <Label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="rounded border-slate-300" />
              <span className="text-xs font-medium text-slate-700">Show Completed</span>
            </Label>
            <Label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="rounded border-slate-300" />
              <span className="text-xs font-medium text-slate-700">Show Cancelled</span>
            </Label>
            {isLoadingHistory && <span className="text-[10px] text-slate-400 ml-2 animate-pulse">Loading...</span>}
          </div>

          <div className="flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setDateFilter("today")}
              className={`px-4 py-2 text-sm font-medium border border-slate-200 rounded-l-lg hover:bg-slate-50 focus:z-10 transition-colors ${dateFilter === "today" ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500"}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("yesterday")}
              className={`px-4 py-2 text-sm font-medium border-t border-b border-slate-200 hover:bg-slate-50 focus:z-10 transition-colors ${dateFilter === "yesterday" ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500"}`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("custom")}
              className={`px-4 py-2 text-sm font-medium border border-slate-200 rounded-r-lg hover:bg-slate-50 focus:z-10 transition-colors ${dateFilter === "custom" ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500"}`}
            >
              Custom Range
            </button>
          </div>
          
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="tba">TBA</option>
              <option value="pending">Pending</option>
              <option value="pickup">Pickup</option>
              <option value="billing">In Shop / Processing</option>
              <option value="delivery">Delivery</option>
              <option value="completed">Completed</option>
              <option value="cancel">Cancelled</option>
              <option value="return">Returned</option>
            </select>
          </div>
          
          {dateFilter === "custom" && (
            <div className="flex items-center gap-2">
              <Input 
                type="date" 
                className="w-[130px] text-xs h-9 bg-white" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
              />
              <span className="text-slate-400 text-xs">to</span>
              <Input 
                type="date" 
                className="w-[130px] text-xs h-9 bg-white" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
              />
            </div>
          )}
        </div>

      {viewMode === "list" ? (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="w-[120px]">Job ID & Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Route Details</TableHead>
              <TableHead className="text-center w-[120px]">Duration</TableHead>
              <TableHead className="text-right w-[100px]">Fee</TableHead>
              <TableHead className="w-[140px]">Rider</TableHead>
              <TableHead className="text-center w-[120px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                    <div className="align-middle py-2 text-center text-slate-300">
                        <MoreHorizontal size={16} className="mx-auto" />
                    No jobs found for the selected filters.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job, i) => {
                  const createdDate = new Date(job.createdAt);
                  
                  // Calculate strictly for completed jobs, OR for active jobs calculate "Time Elapsed" so far.
                  let durationMin = null;
                  if (job.completedAt) {
                    durationMin = differenceInMinutes(new Date(job.completedAt), createdDate);
                  }

                  return (
                    <motion.tr
                      key={job.id}
                      onClick={() => { if (onEditJob) onEditJob(job); }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                    >
                      <TableCell className="align-middle py-2">
                        <div className="flex flex-col gap-1 mb-1.5">
                          <div className="font-mono text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>#{job.id.split('-')[0].toUpperCase()}</span>
                            {job.branchId && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                                {shopLocations.find(s => s.id === job.branchId)?.name}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1">
                          {job.source === 'pos' && (
                            <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-amber-50 text-amber-600 border-amber-100">
                              POS
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[9px] bg-purple-50 text-purple-700 border-purple-100 px-1.5 py-0 h-4">
                            {job.serviceType === 'wash_iron_fold' ? 'W/I/F' : 'W/F'}
                          </Badge>
                          {job.remark?.includes("Express 50%") && (
                            <Badge className="text-[9px] font-bold px-1.5 py-0 h-4 bg-orange-50 text-orange-600 border-orange-200">
                              EXP 50%
                            </Badge>
                          )}
                          {job.remark?.includes("Express 100%") && (
                            <Badge className="text-[9px] font-bold px-1.5 py-0 h-4 bg-red-50 text-red-600 border-red-200">
                              EXP 100%
                            </Badge>
                          )}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 font-medium bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 inline-flex">
                          <Clock size={10} className="text-amber-500" />
                          {format(new Date(job.scheduledAt), "dd MMM, HH:mm")}
                        </div>
                      </TableCell>
                      
                      <TableCell className="align-middle py-2">
                        <div className="font-medium text-[11px] text-slate-900 flex items-center gap-1 flex-wrap">
                          {job.customerName || "Walk-in Guest"}
                          {(() => {
                            const c = customers.find(c => c.id === job.customerId || (job.customerPhone && c.phone === job.customerPhone));
                            if (!c) return null;
                            return (
                              <>
                                {c.isVIP && <Badge className="text-[8px] px-1 py-0 h-3 bg-gradient-to-r from-amber-200 to-amber-400 text-amber-900 border-none font-bold">VIP</Badge>}
                                {c.isMember && <Badge className="text-[8px] px-1 py-0 h-3 bg-blue-100 text-blue-700 border-none font-bold">MEMBER</Badge>}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{job.customerPhone || "No Phone"}</div>
                      </TableCell>

                      <TableCell className="align-middle py-2">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={12} className="shrink-0 text-emerald-600" />
                            <span className="text-[11px] text-slate-600 leading-tight truncate max-w-[180px]">{job.pickupLocation}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Navigation size={12} className="shrink-0 text-red-500" />
                            <span className="text-[11px] text-slate-600 leading-tight truncate max-w-[180px]">{job.dropoffLocation}</span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-middle py-2 text-center">
                        {durationMin !== null ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-xs font-semibold text-slate-700">{durationMin} min</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-medium">In Progress...</span>
                        )}
                      </TableCell>

                      <TableCell className="align-middle py-2 text-right">
                        <div className="flex flex-col items-end justify-center">
                          { (job.totalAmount || 0) - (job.fee || 0) > 0 ? (
                            <div className="font-bold text-[13px] text-indigo-700">
                              ฿{(job.totalAmount || 0).toLocaleString()}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-500 font-medium">฿{job.fee}</span>
                              <Badge variant="outline" className="text-[8px] px-1 bg-amber-50 text-amber-600 border-amber-200 py-0 h-3">
                                TBD
                              </Badge>
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-0.5">{job.distance} km</div>
                        </div>
                      </TableCell>

                      <TableCell className="align-middle py-2">
                        <div className="flex flex-col gap-1.5">
                          {job.pickupRiderId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1 rounded">P</span>
                              <span className="font-medium text-xs text-slate-900 line-clamp-1">
                                {riders.find(r => r.id === job.pickupRiderId)?.name || job.pickupRiderId}
                              </span>
                            </div>
                          )}
                          {job.deliveryRiderId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-1 rounded">D</span>
                              <span className="font-medium text-xs text-indigo-700 line-clamp-1">
                                {riders.find(r => r.id === job.deliveryRiderId)?.name || job.deliveryRiderId}
                              </span>
                            </div>
                          )}
                          {!job.pickupRiderId && !job.deliveryRiderId && job.riderId && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-xs text-slate-900 line-clamp-1">
                                {riders.find(r => r.id === job.riderId)?.name || 'Unknown'}
                              </span>
                            </div>
                          )}
                          {!job.pickupRiderId && !job.deliveryRiderId && !job.riderId && (
                            <span className="text-xs text-slate-400 italic">Unassigned</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-middle py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {(user?.role === 'admin' || user?.permissions?.includes('jobs') || user?.permissions?.includes('dashboard')) ? (
                          <select 
                            value={job.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as JobStatus;
                              if (newStatus === "cancel") {
                                setCancellingJob(job);
                              } else {
                                const updates: any = { status: newStatus };
                                if (newStatus === 'completed') {
                                  updates.completedAt = new Date().toISOString();
                                }
                                jobStore.updateJobDetails(job.id, updates);
                              }
                            }}
                            className={`w-full text-[10px] font-semibold rounded-md border py-1 px-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none cursor-pointer ${statusConfig[job.status]?.className || ''}`}
                          >
                            <option value="tba">TBA</option>
                            <option value="pending">Pending</option>
                            <option value="pickup">Pickup</option>
                            <option value="billing">Process</option>
                            <option value="delivery">Delivery</option>
                            <option value="completed">Completed</option>
                            <option value="cancel">Cancelled</option>
                            <option value="return">Return</option>
                          </select>
                        ) : (
                          <Badge variant="outline" className={`gap-1 w-full justify-center py-0.5 h-auto text-[10px] ${statusConfig[job.status]?.className || ''}`}>
                            {statusIcon[job.status]}
                            {statusConfig[job.status]?.label || job.status}
                          </Badge>
                        )}
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
      ) : (
        <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
          <div className="flex gap-4 min-w-max h-full min-h-[600px]">
            {visibleKanbanColumns.map(status => (
              <div 
                key={status} 
                className="w-72 flex flex-col bg-slate-50/50 rounded-xl border border-slate-200 shrink-0 h-full max-h-[75vh]"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('bg-slate-100');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('bg-slate-100');
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('bg-slate-100');
                  const jobId = e.dataTransfer.getData('jobId');
                  if (jobId) {
                    try {
                      const job = filteredJobs.find(j => j.id === jobId);
                      if (job && job.status !== status) {
                         if (user?.role === 'admin' || user?.permissions?.includes('jobs') || user?.permissions?.includes('dashboard')) {
                           const updates: any = { status };
                           if (status === 'completed') {
                             updates.completedAt = new Date().toISOString();
                           }
                           await jobStore.updateJobDetails(jobId, updates);
                           toast.success(`Job updated to ${statusConfig[status].label}`);
                         } else {
                           toast.error("You don't have permission to change status.");
                         }
                      }
                    } catch(err: any) {
                      toast.error(`Error updating job: ${err.message}`);
                    }
                  }
                }}
              >
                <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white rounded-t-xl sticky top-0 z-10 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={statusConfig[status].className + " w-6 h-6 flex items-center justify-center rounded-full"}>
                       {statusIcon[status]}
                    </span>
                    <span className="font-semibold text-sm text-slate-800">{statusConfig[status].label}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs bg-slate-100">
                    {filteredJobs.filter(j => j.status === status).length}
                  </Badge>
                </div>
                <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-3 min-h-[150px]">
                  {filteredJobs.filter(j => j.status === status).map(job => {
                    let durationMin = null;
                    if (job.completedAt) {
                      durationMin = differenceInMinutes(new Date(job.completedAt), new Date(job.createdAt));
                    }
                    return (
                    <div 
                      key={job.id}
                      draggable={user?.role === 'admin' || user?.permissions?.includes('jobs') || user?.permissions?.includes('dashboard')}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('jobId', job.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => onEditJob && onEditJob(job)}
                      className={`bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-shadow ${user?.role === 'admin' || user?.permissions?.includes('jobs') || user?.permissions?.includes('dashboard') ? 'active:cursor-grabbing' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-900">#{job.id.split('-')[0].toUpperCase()}</span>
                            {job.branchId && (
                              <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                                {shopLocations.find(s => s.id === job.branchId)?.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 items-start">
                          {job.source === 'pos' && (
                            <Badge className="text-[9px] uppercase font-bold px-1 py-0 h-4 bg-amber-50 text-amber-600 border-amber-100">POS</Badge>
                          )}
                          {job.subStatus === 'billing' && <span title="Billing" className="text-[9px] font-bold px-1.5 py-0.5 h-4 rounded flex items-center gap-1 bg-violet-100 text-violet-700 border border-violet-200"><Receipt size={9} /> BILL</span>}
                          {job.subStatus === 'wash'    && <span title="Washing" className="text-[9px] font-bold px-1.5 py-0.5 h-4 rounded flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200"><Droplets size={9} /> WASH</span>}
                          {job.subStatus === 'dry'     && <span title="Drying" className="text-[9px] font-bold px-1.5 py-0.5 h-4 rounded flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200"><Wind size={9} /> DRY</span>}
                          {job.subStatus === 'iron'    && <span title="Ironing" className="text-[9px] font-bold px-1.5 py-0.5 h-4 rounded flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-200"><Shirt size={9} /> IRON</span>}
                          {job.subStatus === 'ready'   && <span title="Ready" className="text-[9px] font-bold px-1.5 py-0.5 h-4 rounded flex items-center gap-1 bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 size={9} /> READY</span>}
                        </div>
                      </div>
                      <div className="font-medium text-sm text-slate-900 mb-1 leading-tight flex items-center gap-1 flex-wrap">
                        {job.customerName || "Walk-in Guest"}
                        {(() => {
                          const c = customers.find(c => c.id === job.customerId || (job.customerPhone && c.phone === job.customerPhone));
                          if (!c) return null;
                          return (
                            <>
                              {c.isVIP && <Badge className="text-[8px] px-1 py-0 h-3 bg-gradient-to-r from-amber-200 to-amber-400 text-amber-900 border-none font-bold">VIP</Badge>}
                              {c.isMember && <Badge className="text-[8px] px-1 py-0 h-3 bg-blue-100 text-blue-700 border-none font-bold">MEMBER</Badge>}
                            </>
                          );
                        })()}
                      </div>
                      <div className="text-xs text-slate-500 mb-3 flex items-start gap-1">
                        <MapPin size={12} className="shrink-0 mt-0.5 text-emerald-600" />
                        <span className="line-clamp-2">{job.pickupLocation || "-"}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 mb-2">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <Banknote size={12} className="text-slate-400" />
                          <span className="font-bold">฿{job.totalAmount || 0}</span>
                          <span className={`px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${job.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            {job.paymentChannel ? `${job.paymentChannel} - ` : ''}{job.isPaid ? 'PAID' : 'UNPAID'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="flex gap-1.5">
                          {job.pickupRiderId && <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded border border-amber-300 flex items-center gap-1" title="Pickup Rider Assigned"><Package size={10} /> {(() => { const r = riders.find(r => r.id === job.pickupRiderId); return r?.nickname || r?.name || job.pickupRiderId; })()}</span>}
                          {job.deliveryRiderId && <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded border border-emerald-300 flex items-center gap-1" title="Delivery Rider Assigned"><Truck size={10} /> {(() => { const r = riders.find(r => r.id === job.deliveryRiderId); return r?.nickname || r?.name || job.deliveryRiderId; })()}</span>}
                          {!job.pickupRiderId && !job.deliveryRiderId && job.riderId && (
                            <span className="text-[9px] font-bold text-slate-700 bg-slate-100 px-1 rounded border border-slate-300 flex items-center gap-1" title="Rider Assigned"><Truck size={10} /> {(() => { const r = riders.find(r => r.id === job.riderId); return r?.nickname || r?.name || job.riderId; })()}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                           {durationMin !== null ? (
                             <span className="text-[10px] font-semibold text-slate-700">{durationMin}m</span>
                           ) : (
                             <span className="text-[10px] text-slate-400 font-medium">{format(new Date(job.createdAt), "HH:mm")}</span>
                           )}
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!cancellingJob} onOpenChange={(open) => !open && setCancellingJob(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for cancellation <span className="text-red-500">*</span></Label>
              <Input 
                value={cancelReason} 
                onChange={e => setCancelReason(e.target.value)} 
                placeholder="e.g. Customer requested, Invalid location..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancellingJob(null)}>Keep Job</Button>
            <Button 
              disabled={!cancelReason.trim()}
              onClick={async () => {
                if (!cancellingJob) return;
                try {
                  await jobStore.updateJobDetails(cancellingJob.id, { 
                    status: "cancel", 
                    remark: `${cancellingJob.remark || ''} | Cancelled Reason: ${cancelReason}`.trim() 
                  });
                  toast.success(`Job has been cancelled.`);
                  setCancellingJob(null);
                  setCancelReason("");
                } catch (e: any) {
                  toast.error(`Error: ${e.message}`);
                }
              }} 
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
