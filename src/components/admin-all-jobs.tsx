"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Navigation, Truck, CheckCircle2, Search, Filter, User, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format, differenceInMinutes, isSameDay, subDays } from "date-fns";
import { useRiders } from "@/lib/use-riders";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { useAuth } from "@/providers/auth-provider";
import { jobStore } from "@/lib/store";

const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  pickup: {
    label: "Pickup",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  delivery: {
    label: "Delivery",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  accepted: {
    label: "Accepted",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  active: {
    label: "Active",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

const statusIcon: Record<JobStatus, React.ReactNode> = {
  pending: <Clock size={13} />,
  pickup: <Truck size={13} />,
  delivery: <Truck size={13} />,
  accepted: <Truck size={13} />,
  active: <Zap size={13} />,
  completed: <CheckCircle2 size={13} />,
};

type FilterDate = "today" | "yesterday" | "all";

export function AdminAllJobs({ jobs }: { jobs: Job[] }) {
  const riders = useRiders();
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<FilterDate>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { user } = useAuth();

  const today = new Date();
  const yesterday = subDays(today, 1);

  // Filter Logic
  const filteredJobs = jobs.filter((job) => {
    // 0. Manager Role Filter
    if (user?.role === 'manager' && job.status === 'pending') return false;

    // 1. Search Query (ID, Customer Name, or Phone)
    const matchesSearch = 
      job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.customerName && job.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.customerPhone && job.customerPhone.includes(searchTerm));

    // 2. Date Filter
    let matchesDate = true;
    if (dateFilter === "today") {
      matchesDate = isSameDay(new Date(job.createdAt), today);
    } else if (dateFilter === "yesterday") {
      matchesDate = isSameDay(new Date(job.createdAt), yesterday);
    }

    return matchesSearch && matchesDate;
  });

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Historical Jobs Log</h2>
          <p className="text-sm text-slate-500 mt-1">Review all past and active jobs, track durations and distances.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input 
              placeholder="Search ID or Customer..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[220px] bg-white border-slate-200" 
            />
          </div>
          <div className="flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setDateFilter("all")}
              className={`px-4 py-2 text-sm font-medium border border-slate-200 rounded-l-lg hover:bg-slate-50 focus:z-10 transition-colors ${dateFilter === "all" ? "bg-slate-100 text-slate-900" : "bg-white text-slate-500"}`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("today")}
              className={`px-4 py-2 text-sm font-medium border-t border-b border-slate-200 hover:bg-slate-50 focus:z-10 transition-colors ${dateFilter === "today" ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500"}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("yesterday")}
              className={`px-4 py-2 text-sm font-medium border border-slate-200 rounded-r-lg hover:bg-slate-50 focus:z-10 transition-colors ${dateFilter === "yesterday" ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500"}`}
            >
              Yesterday
            </button>
          </div>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                    <Filter className="mx-auto mb-2 text-slate-300" size={24} />
                    No jobs found for the selected filters.
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
                      <TableCell className="align-top py-4">
                        <div className="font-mono text-sm font-semibold text-slate-900">{job.id}</div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <Clock size={12} className="text-amber-500" />
                          Sch: {format(new Date(job.scheduledAt), "HH:mm")}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <CalendarDays size={12} />
                          {format(new Date(job.scheduledAt), "MMM d")}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Badge variant="secondary" className="text-[9px] bg-purple-50 text-purple-700 border-purple-100 py-0 h-4 min-w-[90px] justify-center">
                            {job.serviceType === 'wash_iron_fold' ? 'Wash/Iron/Fold' : 'Wash/Fold'}
                          </Badge>
                          {job.source === 'pos' && (
                            <Badge className="text-[9px] uppercase font-bold py-0 h-4 bg-amber-50 text-amber-600 border-amber-100 min-w-[90px] justify-center">
                              POS
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell className="align-top py-4">
                        <div className="font-medium text-slate-900">{job.customerName || "Walk-in Guest"}</div>
                        <div className="text-xs text-slate-500 mt-1">{job.customerPhone || "No Phone"}</div>
                      </TableCell>

                      <TableCell className="align-top py-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start gap-1.5">
                            <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                            <span className="text-xs text-slate-700 line-clamp-2">{job.pickupLocation}</span>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <Navigation size={14} className="mt-0.5 shrink-0 text-red-500" />
                            <span className="text-xs text-slate-700 line-clamp-2">{job.dropoffLocation}</span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top py-4 text-center">
                        {durationMin !== null ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-sm font-semibold text-slate-700">{durationMin} min</span>
                            <span className="text-[10px] text-slate-400">Total flight</span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">In Progress...</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top py-4 text-right">
                        <div className="font-semibold text-sm text-slate-900">฿{(job.totalAmount || job.fee).toLocaleString()}</div>
                        <div className="text-[11px] text-slate-400 mt-1.5">{job.distance} km</div>
                        {job.proofImageUrl && (
                          <div className="mt-2 flex justify-end">
                            <img src={job.proofImageUrl} alt="Proof" className="w-10 h-10 rounded-lg border border-slate-200 object-cover shadow-sm" />
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="align-top py-4">
                        <div className="flex flex-col gap-1.5">
                          {job.legs?.pickupOutbound?.riderId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1 rounded">P</span>
                              <span className="font-medium text-xs text-slate-900 line-clamp-1">
                                {riders.find(r => r.id === job.legs?.pickupOutbound?.riderId)?.name || job.legs.pickupOutbound.riderId}
                              </span>
                            </div>
                          )}
                          {job.legs?.deliveryOutbound?.riderId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-1 rounded">D</span>
                              <span className="font-medium text-xs text-indigo-700 line-clamp-1">
                                {riders.find(r => r.id === job.legs?.deliveryOutbound?.riderId)?.name || job.legs.deliveryOutbound.riderId}
                              </span>
                            </div>
                          )}
                          {!job.legs?.pickupOutbound?.riderId && !job.legs?.deliveryOutbound?.riderId && job.riderId && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-xs text-slate-900 line-clamp-1">
                                {riders.find(r => r.id === job.riderId)?.name || 'Unknown'}
                              </span>
                            </div>
                          )}
                          {!job.legs?.pickupOutbound?.riderId && !job.legs?.deliveryOutbound?.riderId && !job.riderId && (
                            <span className="text-xs text-slate-400 italic">Unassigned</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-top py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {user?.role === 'admin' ? (
                          <select 
                            value={job.status}
                            onChange={(e) => jobStore.updateJobDetails(job.id, { status: e.target.value as JobStatus })}
                            className={`w-full text-xs font-semibold rounded-md border py-1.5 px-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none cursor-pointer ${statusConfig[job.status].className}`}
                          >
                            <option value="pending">Pending</option>
                            <option value="pickup">Pickup</option>
                            <option value="delivery">Delivery</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <Badge variant="outline" className={`gap-1 w-full justify-center ${statusConfig[job.status].className}`}>
                            {statusIcon[job.status]}
                            {statusConfig[job.status].label}
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

      <Dialog open={!!selectedJobId} onOpenChange={(v) => !v && setSelectedJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {selectedJobId && (
            <AdminTaskTracker job={jobs.find((j) => j.id === selectedJobId)!} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
