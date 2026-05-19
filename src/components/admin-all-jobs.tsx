"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Navigation, Truck, CheckCircle2, Search, Filter, User, Zap, XCircle, Edit2, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, differenceInMinutes, isSameDay, subDays } from "date-fns";
import { useRiders } from "@/lib/use-riders";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { useAuth } from "@/providers/auth-provider";
import { jobStore, shopStore, type Job, type JobStatus } from "@/lib/store";
import { useSyncExternalStore } from "react";
const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  pickup: { label: "Pickup", className: "bg-orange-50 text-orange-700 border-orange-200" },
  picked_up: { label: "Picked Up", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  ready_to_wash: { label: "Ready to Wash", className: "bg-blue-50 text-blue-700 border-blue-200" },
  washed: { label: "Washed", className: "bg-sky-50 text-sky-700 border-sky-200" },
  delivery: { label: "Delivery", className: "bg-purple-50 text-purple-700 border-purple-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  active: { label: "Active", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  cancel: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200" },
  return: { label: "Return", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

const statusIcon: Record<JobStatus, React.ReactNode> = {
  pending: <Clock size={13} />,
  pickup: <Truck size={13} />,
  picked_up: <CheckCircle2 size={13} />,
  ready_to_wash: <Clock size={13} />,
  washed: <CheckCircle2 size={13} />,
  delivery: <Navigation size={13} />,
  completed: <CheckCircle2 size={13} />,
  active: <Zap size={13} />,
  cancel: <XCircle size={13} />,
  return: <Navigation size={13} />,
};

type FilterDate = "today" | "yesterday" | "custom";

export function AdminAllJobs({ jobs, onEditJob, onCreateJob }: { jobs: Job[], onEditJob?: (job: Job) => void, onCreateJob?: () => void }) {
  const riders = useRiders();
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<FilterDate>("today");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  
  const [cancellingJob, setCancellingJob] = useState<Job | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  const today = new Date();
  const yesterday = subDays(today, 1);

  // Filter Logic
  const filteredJobs = jobs.filter((job) => {
    // 0. Manager Role Filter & Area Filter
    if (user?.role === 'manager') {
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
    if (dateFilter === "today") {
      matchesDate = isSameDay(new Date(job.createdAt), today);
    } else if (dateFilter === "yesterday") {
      matchesDate = isSameDay(new Date(job.createdAt), yesterday);
    } else if (dateFilter === "custom") {
      const jobDate = new Date(job.createdAt);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = jobDate >= start && jobDate <= end;
    }

    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = job.status === statusFilter;
    }

    return matchesSearch && matchesDate && matchesStatus;
  });

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Historical Jobs Log</h2>
            <p className="text-sm text-slate-500 mt-1">Review all past and active jobs, track durations and distances.</p>
          </div>
          {onCreateJob && (
            <Button onClick={onCreateJob} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm shrink-0">
              <Zap size={16} />
              <span className="hidden sm:inline">Create New Job</span>
              <span className="sm:hidden">Create</span>
            </Button>
          )}
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
              <option value="pending">Pending</option>
              <option value="pickup">Pickup</option>
              <option value="picked_up">Picked Up</option>
              <option value="ready_to_wash">Ready to Wash</option>
              <option value="washed">Washed</option>
              <option value="delivery">Delivery</option>
              <option value="completed">Completed</option>
              <option value="active">Active</option>
              <option value="cancel">Cancelled</option>
              <option value="return">Return</option>
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
      </div>

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
              <TableHead className="text-center w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-slate-500">
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
                      onClick={() => setSelectedJobId(job.id)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                    >
                      <TableCell className="align-middle py-2">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <div className="font-mono text-xs font-semibold text-slate-900">{job.id.split('-')[0].toUpperCase()}</div>
                          {job.source === 'pos' && (
                            <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-amber-50 text-amber-600 border-amber-100">
                              POS
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[9px] bg-purple-50 text-purple-700 border-purple-100 px-1.5 py-0 h-4">
                            {job.serviceType === 'wash_iron_fold' ? 'W/I/F' : 'W/F'}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 font-medium bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 inline-flex">
                          <Clock size={10} className="text-amber-500" />
                          {format(new Date(job.scheduledAt), "dd MMM, HH:mm")}
                        </div>
                      </TableCell>
                      
                      <TableCell className="align-middle py-2">
                        <div className="font-medium text-[11px] text-slate-900">{job.customerName || "Walk-in Guest"}</div>
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
                                jobStore.updateJobDetails(job.id, { status: newStatus });
                              }
                            }}
                            className={`w-full text-[10px] font-semibold rounded-md border py-1 px-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none cursor-pointer ${statusConfig[job.status]?.className || ''}`}
                          >
                            <option value="pending">Pending</option>
                            <option value="pickup">Pickup</option>
                            <option value="picked_up">Picked Up</option>
                            <option value="ready_to_wash">Ready to Wash</option>
                            <option value="washed">Washed</option>
                            <option value="delivery">Delivery</option>
                            <option value="active">Active</option>
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
                      
                      <TableCell className="align-top py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onEditJob) onEditJob(job);
                          }}
                        >
                          <Edit2 size={14} />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedJobId} onOpenChange={(v) => !v && setSelectedJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {selectedJobId && (
            <AdminTaskTracker job={jobs.find((j) => j.id === selectedJobId)!} />
          )}
        </DialogContent>
      </Dialog>

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
