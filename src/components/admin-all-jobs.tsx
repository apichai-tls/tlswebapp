"use client";

import React, { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Navigation, Truck, Package, CheckCircle2, Search, Filter, User, Zap, XCircle, Edit2, MoreHorizontal, LayoutList, LayoutGrid, Receipt, Droplets, Wind, Shirt, Banknote, Download, Printer, ArrowUpDown } from "lucide-react";
import Papa from "papaparse";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, differenceInMinutes, isSameDay, subDays } from "date-fns";
import { useRiders } from "@/lib/use-riders";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { jobStore, shopStore, customerStore, type Job, type JobStatus } from "@/lib/store";
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

export const AdminAllJobs = React.memo(function AdminAllJobs({ jobs, onEditJob, onCreateJob }: { jobs: Job[], onEditJob?: (job: Job) => void, onCreateJob?: () => void }) {
  const riders = useRiders();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<FilterDate>("today");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [paymentChannelFilter, setPaymentChannelFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  
  const [cancellingJob, setCancellingJob] = useState<Job | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  
  const [reopenDialog, setReopenDialog] = useState<{
    isOpen: boolean;
    jobId: string;
    targetStatus: string;
    reason: string;
  }>({
    isOpen: false,
    jobId: "",
    targetStatus: "",
    reason: "",
  });
  
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCancelled, setShowCancelled] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [paymentSort, setPaymentSort] = useState<'asc' | 'desc' | null>(null);
  const [filterArea, setFilterArea] = useState<string>("ALL");
  const [activeKanbanColumn, setActiveKanbanColumn] = useState<JobStatus>("pickup");
  
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const customers = useSyncExternalStore(customerStore.subscribe, customerStore.getSnapshot, customerStore.getSnapshot);

  const today = new Date();
  const yesterday = subDays(today, 1);

  const checkIsPinned = (j: Job, u: any) => {
    if (j.status !== 'completed') return false;
    const isAdmin = u?.role === 'admin' || u?.role === 'superadmin';
    const walkIn = j.source === 'pos' || (j.type as string) === 'in_store';
    const missingBill = !j.billNo || j.billNo.trim() === '';
    
    if (isAdmin) {
      if (walkIn) return !j.isShopPaid || missingBill;
      else return !j.isPaid || !j.isShopPaid || missingBill;
    }
    if (u?.role === 'cso') {
      if (walkIn) return !j.isShopPaid || missingBill;
      else return !j.isPaid || missingBill;
    }
    if (u?.role === 'manager') {
      if (walkIn) return !j.isShopPaid || missingBill;
      else return !j.isShopPaid;
    }
    return false;
  };

  const visibleKanbanColumns = KANBAN_COLUMNS.filter(
    status => {
      if (user?.role === 'manager' && status === 'tba') return false;
      if (status === 'completed' && !showCompleted) return false;
      if (status === 'cancel' && !showCancelled) return false;
      return true;
    }
  );

  useEffect(() => {
    if (visibleKanbanColumns.length > 0 && !visibleKanbanColumns.includes(activeKanbanColumn)) {
      setActiveKanbanColumn(visibleKanbanColumns[0]);
    }
  }, [visibleKanbanColumns, activeKanbanColumn]);

  useEffect(() => {
    let start: Date;
    let end: Date;
    
    if (dateFilter === "today") {
      start = today;
      end = today;
      // Today focuses on active work — hide completed/cancelled by default
      setShowCompleted(false);
      setShowCancelled(false);
    } else if (dateFilter === "yesterday") {
      start = yesterday;
      end = yesterday;
      // Historical view — show all statuses
      setShowCompleted(true);
      setShowCancelled(true);
    } else if (dateFilter === "custom") {
      start = new Date(startDate);
      end = new Date(endDate);
      // Historical view — show all statuses
      setShowCompleted(true);
      setShowCancelled(true);
    } else {
      return; 
    }
    
    setIsLoadingHistory(true);
    jobStore.fetchHistoricalJobs(start, end).finally(() => setIsLoadingHistory(false));
  }, [dateFilter, startDate, endDate]);

  useEffect(() => {
    if (user?.role === 'manager' && user.area && user.area !== 'ALL') {
      setFilterArea(user.area);
    }
  }, [user]);

  const availablePaymentChannels = [
    "Cash / COD",
    "Transfer",
    "Credit Card",
    "Gateway",
    "PromptPay",
    "Deduct Member",
    "HQ/Credit"
  ];

  // Filter Logic
  const filteredJobs = jobs.filter((job) => {
    // 0. Manager Role Filter
    if (user?.role === 'manager') {
      if (job.status === 'tba') return false;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const statusLabel = statusConfig[job.status]?.label || "";
    const customer = customers.find(c => {
      if (job.customerId) return c.id === job.customerId;
      const cleanPhone = job.customerPhone ? job.customerPhone.replace(/\D/g, '') : '';
      return cleanPhone.length >= 5 && c.phone === job.customerPhone;
    });

    const pickupRiderObj = riders.find(r => r.id === job.pickupRiderId);
    const deliveryRiderObj = riders.find(r => r.id === job.deliveryRiderId);
    const shopObj = shopLocations.find(s => s.id === job.branchId);

    const itemsMatch = Array.isArray(job.items) && job.items.some((item: any) => 
      item && item.name && typeof item.name === 'string' && item.name.toLowerCase().includes(searchLower)
    );

    const adminLogsMatch = Array.isArray(job.adminLogs) && job.adminLogs.some((log: any) => 
      (log && log.text && typeof log.text === 'string' && log.text.toLowerCase().includes(searchLower)) ||
      (log && log.userName && typeof log.userName === 'string' && log.userName.toLowerCase().includes(searchLower))
    );

    const matchesSearch = 
      !searchLower ||
      job.id.toLowerCase().includes(searchLower) ||
      (job.billNo && job.billNo.toLowerCase().includes(searchLower)) ||
      (job.customerName && job.customerName.toLowerCase().includes(searchLower)) ||
      (job.customerPhone && job.customerPhone.includes(searchLower)) ||
      (job.pickupLocation && job.pickupLocation.toLowerCase().includes(searchLower)) ||
      (job.pickupRoom && job.pickupRoom.toLowerCase().includes(searchLower)) ||
      (job.dropoffLocation && job.dropoffLocation.toLowerCase().includes(searchLower)) ||
      (job.dropoffRoom && job.dropoffRoom.toLowerCase().includes(searchLower)) ||
      (job.remark && job.remark.toLowerCase().includes(searchLower)) ||
      (job.adminNote && job.adminNote.toLowerCase().includes(searchLower)) ||
      (job.adminNotesJson && job.adminNotesJson.toLowerCase().includes(searchLower)) ||
      adminLogsMatch ||
      itemsMatch ||
      (pickupRiderObj && pickupRiderObj.name && pickupRiderObj.name.toLowerCase().includes(searchLower)) ||
      (deliveryRiderObj && deliveryRiderObj.name && deliveryRiderObj.name.toLowerCase().includes(searchLower)) ||
      statusLabel.toLowerCase().includes(searchLower) ||
      job.status.toLowerCase().includes(searchLower) ||
      (job.serviceType && job.serviceType.toLowerCase().includes(searchLower)) ||
      (job.serviceSpeed && job.serviceSpeed.toLowerCase().includes(searchLower)) ||
      (job.paymentChannel && job.paymentChannel.toLowerCase().includes(searchLower)) ||
      (job.paymentMethod && job.paymentMethod.toLowerCase().includes(searchLower)) ||
      (shopObj && shopObj.name && shopObj.name.toLowerCase().includes(searchLower)) ||
      (customer && (
        (customer.name && customer.name.toLowerCase().includes(searchLower)) ||
        (customer.phone && customer.phone.includes(searchLower)) ||
        (customer.memberId && customer.memberId.toLowerCase().includes(searchLower)) ||
        (customer.lineId && customer.lineId.toLowerCase().includes(searchLower)) ||
        (customer.email && customer.email.toLowerCase().includes(searchLower)) ||
        (customer.defaultAddress && customer.defaultAddress.toLowerCase().includes(searchLower)) ||
        (customer.secondaryAddress && customer.secondaryAddress.toLowerCase().includes(searchLower)) ||
        (customer.companyName && customer.companyName.toLowerCase().includes(searchLower)) ||
        (customer.taxId && customer.taxId.toLowerCase().includes(searchLower)) ||
        (customer.remark && customer.remark.toLowerCase().includes(searchLower))
      ));

    let matchesDate = true;
    const isActive = !['completed', 'cancel', 'return'].includes(job.status);
    
    if (dateFilter === "today") {
      matchesDate = isSameDay(new Date(job.createdAt), today) || 
                    isActive || 
                    (job.completedAt ? isSameDay(new Date(job.completedAt), today) : false) ||
                    (job.scheduledAt ? isSameDay(new Date(job.scheduledAt), today) : false);
    } else if (dateFilter === "yesterday") {
      matchesDate = isSameDay(new Date(job.createdAt), yesterday) || 
                    (job.completedAt ? isSameDay(new Date(job.completedAt), yesterday) : false) ||
                    (job.scheduledAt ? isSameDay(new Date(job.scheduledAt), yesterday) : false);
    } else if (dateFilter === "custom") {
      const jobDate = new Date(job.createdAt);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = (jobDate >= start && jobDate <= end) || 
                    (job.completedAt ? (new Date(job.completedAt) >= start && new Date(job.completedAt) <= end) : false) ||
                    (job.scheduledAt ? (new Date(job.scheduledAt) >= start && new Date(job.scheduledAt) <= end) : false);
    }

    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = job.status === statusFilter;
    } else {
      if (job.status === 'completed' && !showCompleted && viewMode === "list") matchesStatus = false;
      if (job.status === 'cancel' && !showCancelled && viewMode === "list") matchesStatus = false;
    }

    // Area Filter
    let matchesArea = true;
    if (filterArea !== "ALL") {
      const branch = shopLocations.find(s => s.id === job.branchId);
      matchesArea = branch?.area === filterArea;
    }

    // Payment Channel Filter
    let matchesPayment = true;
    if (paymentChannelFilter !== "ALL") {
      const pc = job.paymentChannel?.toUpperCase() || "";
      if (paymentChannelFilter === "Cash / COD") {
        matchesPayment = pc === "CASH / COD" || pc === "CASH";
      } else if (paymentChannelFilter === "Transfer") {
        matchesPayment = pc === "TRANSFER" || pc === "BANK TRANSFER";
      } else if (paymentChannelFilter === "Credit Card") {
        matchesPayment = pc === "CREDIT CARD" || pc === "CREDIT";
      } else {
        matchesPayment = job.paymentChannel === paymentChannelFilter;
      }
    }
    
    return matchesSearch && matchesDate && matchesStatus && matchesArea && matchesPayment;
  });

  const sortedJobs = [...filteredJobs];
  if (paymentSort === 'asc') {
    sortedJobs.sort((a, b) => (a.isPaid === b.isPaid ? 0 : a.isPaid ? -1 : 1));
  } else if (paymentSort === 'desc') {
    sortedJobs.sort((a, b) => (a.isPaid === b.isPaid ? 0 : a.isPaid ? 1 : -1));
  }

  const getTotalDuration = (start: Date, end: Date) => {
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours >= 24) {
      const days = Math.floor(diffHours / 24);
      const hours = diffHours % 24;
      return `${days} วัน ${hours} ชั่วโมง`;
    }
    return `${diffHours} ชั่วโมง ${diffMinutes} นาที`;
  };

  const exportToCSV = () => {
    const csvData = filteredJobs.map(job => {
      const customer = customers.find(c => c.id === job.customerId);
      const branch = shopLocations.find(s => s.id === job.branchId);
      return {
        "Job ID": job.id.split('-')[0].toUpperCase(),
        "Bill No": job.billNo || "-",
        "Date": format(new Date(job.createdAt), "dd MMM yyyy, HH:mm"),
        "Month": format(new Date(job.createdAt), "MM"),
        "Branch": branch?.name || "-",
        "Customer Name": job.customerName || "Walk-in Guest",
        "Customer Phone": job.customerPhone || "-",
        "Pickup Location": job.pickupLocation || "-",
        "Dropoff Location": job.dropoffLocation || "-",
        "Total Amount (THB)": job.totalAmount || 0,
        "Delivery Fee (THB)": job.fee || 0,
        "Pickup Rider": job.pickupRiderId ? (riders.find(r => r.id === job.pickupRiderId)?.name || job.pickupRiderId) : "-",
        "Delivery Rider": job.deliveryRiderId ? (riders.find(r => r.id === job.deliveryRiderId)?.name || job.deliveryRiderId) : "-",
        "Assigned Rider": (!job.pickupRiderId && !job.deliveryRiderId && job.riderId) ? (riders.find(r => r.id === job.riderId)?.name || job.riderId) : "-",
        "Payment Channel": job.paymentChannel || "-",
        "CSO Pay Status": job.isPaid ? "PAID" : "UNPAID",
        "CSO Paid At": job.csoPaidAt ? format(new Date(job.csoPaidAt), "dd/MM/yyyy HH:mm") : "-",
        "SHOP Pay Status": job.isShopPaid ? "PAID" : "UNPAID",
        "SHOP Paid At": job.shopPaidAt ? format(new Date(job.shopPaidAt), "dd/MM/yyyy HH:mm") : "-",
        "Total Duration": job.completedAt ? getTotalDuration(new Date(job.createdAt), new Date(job.completedAt)) : "-",
        "Status": statusConfig[job.status]?.label || job.status
      };
    });
    const csv = Papa.unparse(csvData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `jobs_report_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported to CSV successfully");
  };

  const printToPDF = () => {
    window.print();
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">All Jobs</h2>
              <p className="text-sm text-slate-500 mt-1">Review all past and active jobs, track durations and distances.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {viewMode === "list" && (
              <div className="flex gap-2 shrink-0 print:hidden">
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-sm"
                  title="Export as CSV"
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button
                  onClick={printToPDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors shadow-sm"
                  title="Print to PDF"
                >
                  <Printer size={16} />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </div>
            )}
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
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input 
              placeholder="Search jobs, customers, address..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-[260px] bg-white border-slate-200" 
            />
          </div>

          <div className="relative">
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="h-10 text-xs border border-slate-200 rounded-md px-3 bg-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 shadow-sm"
            >
              <option value="ALL">All Areas</option>
              <option value="BKK">BKK</option>
              <option value="PTY">PTY</option>
            </select>
          </div>

          <div className="relative">
            <select
              value={paymentChannelFilter}
              onChange={(e) => setPaymentChannelFilter(e.target.value)}
              className="h-10 text-xs border border-slate-200 rounded-md px-3 bg-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 shadow-sm"
            >
              <option value="ALL">All Payments</option>
              {availablePaymentChannels.map(channel => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
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
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto print:overflow-visible print:border-none print:shadow-none">
        <Table className="print:text-xs">
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="w-[120px]">Job ID & Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Route Details</TableHead>
              <TableHead className="text-center w-[120px]">Duration</TableHead>
              <TableHead className="w-[120px]">Payment Channel</TableHead>
              <TableHead 
                className="text-center w-[100px] cursor-pointer hover:bg-slate-100 select-none"
                onClick={() => setPaymentSort(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}
              >
                <div className="flex items-center justify-center gap-1">
                  CSO Pay Status
                  <ArrowUpDown size={12} className={paymentSort ? "text-indigo-600" : "text-slate-400"} />
                </div>
              </TableHead>
              <TableHead className="w-[120px]">CSO Paid At</TableHead>
              <TableHead className="text-center w-[100px]">SHOP Pay Status</TableHead>
              <TableHead className="w-[120px]">Shop Paid At</TableHead>
              <TableHead className="w-[100px]">Bill No.</TableHead>
              <TableHead className="text-right w-[100px]">Fee</TableHead>
              <TableHead className="w-[140px]">Rider</TableHead>
              <TableHead className="text-center w-[120px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence>
              {sortedJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="h-48 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search size={32} className="text-slate-300" />
                      <p>No jobs found matching your filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedJobs.map((job, i) => {
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
                          <div className="flex gap-1 items-center">
                          {job.source === 'pos' && (
                            <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-amber-50 text-amber-600 border-amber-100">
                              POS
                            </Badge>
                          )}
                          {job.cashPlaced && (
                            <span title="วางเงินแล้ว" className="w-4 h-4 rounded flex items-center justify-center bg-emerald-100 text-emerald-700 border border-emerald-200 animate-in fade-in duration-200">
                              <Banknote size={10} />
                            </span>
                          )}
                          {job.billImageUrl && job.billImageUrl !== '[]' && <span title="Bill uploaded" className="w-4 h-4 rounded flex items-center justify-center bg-violet-100 text-violet-700 border border-violet-200"><Receipt size={10} /></span>}
                          {job.subStatus === 'wash'    && <span title="Washing" className="w-4 h-4 rounded flex items-center justify-center bg-blue-100 text-blue-700 border border-blue-200"><Droplets size={10} /></span>}
                          {job.subStatus === 'dry'     && <span title="Drying" className="w-4 h-4 rounded flex items-center justify-center bg-orange-100 text-orange-700 border border-orange-200"><Wind size={10} /></span>}
                          {job.subStatus === 'iron'    && <span title="Ironing" className="w-4 h-4 rounded flex items-center justify-center bg-indigo-100 text-indigo-700 border border-indigo-200"><Shirt size={10} /></span>}
                          {job.subStatus === 'ready'   && <span title="Ready" className="w-4 h-4 rounded flex items-center justify-center bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 size={10} /></span>}
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
                            const c = customers.find(c => {
                              if (job.customerId) return c.id === job.customerId;
                              const cleanPhone = job.customerPhone ? job.customerPhone.replace(/\D/g, '') : '';
                              return cleanPhone.length >= 5 && c.phone === job.customerPhone;
                            });
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

                      <TableCell className="align-middle py-2">
                        <div className="text-[11px] font-bold text-slate-700">
                          {job.paymentChannel || "Unspecified"}
                        </div>
                      </TableCell>
                      
                      <TableCell className="align-middle py-2 text-center">
                        {job.source === 'pos' || (job.type as string) === 'in_store' ? (
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 border-none font-bold justify-center w-fit mx-auto ${job.isShopPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            SHOP {job.isShopPaid ? 'PAID' : 'UNPAID'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 border-none font-bold justify-center w-fit mx-auto ${job.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            {job.isPaid ? 'PAID' : 'UNPAID'}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="align-middle py-2">
                        <div className="text-[11px] font-medium text-slate-600">
                          {job.source === 'pos' || (job.type as string) === 'in_store' ? (
                            <span className="text-slate-400 font-bold">-</span>
                          ) : (
                            job.csoPaidAt ? format(new Date(job.csoPaidAt), "dd/MM/yyyy HH:mm") : "-"
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-middle py-2 text-center">
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 border-none font-bold justify-center w-fit mx-auto ${job.isShopPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                          {job.isShopPaid ? 'PAID' : 'UNPAID'}
                        </Badge>
                      </TableCell>

                      <TableCell className="align-middle py-2">
                        <div className="text-[11px] font-medium text-slate-600">
                          {job.shopPaidAt ? format(new Date(job.shopPaidAt), "dd/MM/yyyy HH:mm") : "-"}
                        </div>
                      </TableCell>

                      <TableCell className="align-middle py-2">
                        <div className="text-[11px] font-bold text-slate-700">
                          {job.billNo || "-"}
                        </div>
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
                        <div className="print:hidden">
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
                                  const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
                                  jobStore.updateJobDetails(job.id, updates, actorDetails);
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
                            <Badge variant="outline" className={`text-[10px] uppercase font-bold justify-center w-fit mx-auto ${statusConfig[job.status]?.className || ''}`}>
                              {statusConfig[job.status]?.label || job.status}
                            </Badge>
                          )}
                        </div>
                        <span className="hidden print:inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300">
                          {statusConfig[job.status]?.label || job.status}
                        </span>
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
        <div className="flex-1 flex flex-col gap-4">
          {/* Kanban Column Selector for Mobile & Tablet */}
          <div className="flex lg:hidden overflow-x-auto gap-2 pb-2 scrollbar-hide border-b border-slate-100 shrink-0">
            {visibleKanbanColumns.map(status => {
              const jobsInCol = filteredJobs.filter(j => j.status === status);
              const isActive = activeKanbanColumn === status;
              return (
                <button
                  key={status}
                  onClick={() => setActiveKanbanColumn(status)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border cursor-pointer ${
                    isActive 
                      ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="capitalize">{statusConfig[status]?.label || status}</span>
                  <Badge className={`h-4 min-w-4 px-1 flex items-center justify-center text-[10px] rounded-full font-black ${
                    isActive ? "bg-white text-slate-950" : "bg-slate-100 text-slate-600"
                  }`}>
                    {jobsInCol.length}
                  </Badge>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
            <div className="flex gap-4 min-w-full lg:min-w-max h-full min-h-[600px]">
              {visibleKanbanColumns.map(status => {
                const isTabActive = activeKanbanColumn === status;
                return (
                  <div 
                    key={status} 
                    data-status={status}
                    className={`w-full lg:w-72 flex flex-col bg-slate-50/50 rounded-xl border border-slate-200 shrink-0 h-full max-h-[75vh] ${
                      isTabActive ? "flex" : "hidden lg:flex"
                    }`}
                    onDragOver={(e) => {
                      if (status === 'completed') return; // Do not allow dragover drop effect on Completed column
                      e.preventDefault();
                      e.currentTarget.classList.add('bg-slate-100');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('bg-slate-100');
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('bg-slate-100');
                      
                      if (status === 'completed') {
                        toast.error("Cannot drag and drop jobs directly to Completed status.");
                        return;
                      }

                      const jobId = e.dataTransfer.getData('jobId');
                      if (jobId) {
                        try {
                          const job = filteredJobs.find(j => j.id === jobId);
                          if (!job) return;
                          
                          // Check if moving out of completed status
                          if (job.status === 'completed') {
                            setReopenDialog({
                              isOpen: true,
                              jobId,
                              targetStatus: status,
                              reason: ""
                            });
                            return;
                          }

                          // Proceed directly for normal status transition
                          const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
                          await jobStore.updateJobDetails(jobId, { status }, actorDetails);
                          toast.success(`Job updated to ${statusConfig[status].label}`);
                        } catch (err: any) {
                          toast.error(err.message || "Failed to update job status");
                        }
                      }
                    }}
                  >
                    {/* Header */}
                    <div className="p-4 border-b border-slate-200 bg-white rounded-t-xl flex justify-between items-center shrink-0">
                      <div className="flex items-center gap-2">
                        <span className={statusConfig[status].className + " w-6 h-6 flex items-center justify-center rounded-full"}>
                          {statusIcon[status]}
                        </span>
                        <span className="font-semibold text-sm text-slate-800">{statusConfig[status].label}</span>
                      </div>
                      <Badge variant="secondary" className="font-bold text-xs bg-slate-100 text-slate-600 border-none">
                        {filteredJobs.filter(j => j.status === status).length}
                      </Badge>
                    </div>

                    {/* Cards Container */}
                    <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-3 min-h-[150px]">
                      {filteredJobs
                        .filter(j => j.status === status)
                        .sort((a, b) => {
                          if (status === 'completed') {
                            const isPinnedA = checkIsPinned(a, user);
                            const isPinnedB = checkIsPinned(b, user);
                            if (isPinnedA && !isPinnedB) return -1;
                            if (!isPinnedA && isPinnedB) return 1;
                          }
                          return 0;
                        })
                        .map(job => {
                        let durationMin = null;
                        if (job.completedAt) {
                          durationMin = differenceInMinutes(new Date(job.completedAt), new Date(job.createdAt));
                        }
                        
                        const isPinned = checkIsPinned(job, user);
                        
                        let cardBgClass = 'bg-white border-slate-200';
                        if (job.isStuck) cardBgClass = 'bg-red-50 border-red-300 text-red-950 hover:bg-red-100/70';
                        else if (isPinned) cardBgClass = 'bg-orange-50 border-orange-300 text-orange-950 hover:bg-orange-100/70';

                        return (
                          <div 
                            key={job.id}
                            draggable={
                              user?.role === 'admin' || 
                              user?.role === 'cso' || 
                              user?.permissions?.includes('jobs') || 
                              user?.permissions?.includes('dashboard')
                            }
                            onDragStart={(e) => {
                              e.dataTransfer.setData('jobId', job.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onClick={() => onEditJob && onEditJob(job)}
                            className={`${cardBgClass} p-3 rounded-lg border shadow-sm hover:shadow-md cursor-pointer transition-shadow ${user?.role === 'admin' || user?.role === 'cso' || user?.permissions?.includes('jobs') || user?.permissions?.includes('dashboard') ? 'active:cursor-grabbing' : ''}`}
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
                                  {job.laundryTypes && job.laundryTypes.length > 0 && (
                                    <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded tracking-wide">
                                      {job.laundryTypes.join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1 items-center">
                                {job.isStuck && (
                                  <Badge className="text-[9px] uppercase font-bold px-1.5 py-0 h-4 bg-red-100 text-red-700 border-red-200 shrink-0">Stuck</Badge>
                                )}
                                {job.source === 'pos' && (
                                  <Badge className="text-[9px] uppercase font-bold px-1 py-0 h-4 bg-amber-50 text-amber-600 border-amber-100">POS</Badge>
                                )}
                                {job.cashPlaced && (
                                  <span title="วางเงินแล้ว" className="w-4 h-4 rounded flex items-center justify-center bg-emerald-100 text-emerald-700 border border-emerald-200 animate-in fade-in duration-200">
                                    <Banknote size={10} />
                                  </span>
                                )}
                                {job.billImageUrl && job.billImageUrl !== '[]' && <span title="Bill uploaded" className="w-4 h-4 rounded flex items-center justify-center bg-violet-100 text-violet-700 border border-violet-200"><Receipt size={10} /></span>}
                                {job.subStatus === 'wash'    && <span title="Washing" className="w-4 h-4 rounded flex items-center justify-center bg-blue-100 text-blue-700 border border-blue-200"><Droplets size={10} /></span>}
                                {job.subStatus === 'dry'     && <span title="Drying" className="w-4 h-4 rounded flex items-center justify-center bg-orange-100 text-orange-700 border border-orange-200"><Wind size={10} /></span>}
                                {job.subStatus === 'iron'    && <span title="Ironing" className="w-4 h-4 rounded flex items-center justify-center bg-indigo-100 text-indigo-700 border border-indigo-200"><Shirt size={10} /></span>}
                                {job.subStatus === 'ready'   && <span title="Ready" className="w-4 h-4 rounded flex items-center justify-center bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 size={10} /></span>}
                              </div>
                            </div>

                            <div className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                              {job.customerName || "Walk-in Guest"}
                              {(() => {
                                const c = customers.find(c => {
                                  if (job.customerId) return c.id === job.customerId;
                                  const cleanPhone = job.customerPhone ? job.customerPhone.replace(/\D/g, '') : '';
                                  return cleanPhone.length >= 5 && c.phone === job.customerPhone;
                                });
                                if (!c) return null;
                                return (
                                  <>
                                    {c.isVIP && <Badge className="text-[8px] px-1 py-0 h-3 bg-gradient-to-r from-amber-200 to-amber-400 text-amber-900 border-none font-bold">VIP</Badge>}
                                    {c.isMember && <Badge className="text-[8px] px-1 py-0 h-3 bg-blue-100 text-blue-700 border-none font-bold">MEMBER</Badge>}
                                  </>
                                );
                              })()}
                            </div>
                            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                              <CalendarDays size={11} className="shrink-0 text-slate-400" />
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">P Date:</span>
                              <span className="font-medium text-slate-600 flex items-center gap-1">
                                {job.scheduledAt
                                  ? isSameDay(new Date(job.scheduledAt), new Date())
                                    ? format(new Date(job.scheduledAt), "HH:mm")
                                    : format(new Date(job.scheduledAt), "dd MMM, HH:mm")
                                  : "-"}
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
                              </span>
                            </div>
                            {job.deliveryScheduledAt && (
                              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                                <CalendarDays size={11} className="shrink-0 text-slate-400" />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">D Date:</span>
                                <span className="font-medium text-slate-600 flex items-center gap-1.5 flex-wrap">
                                  {isSameDay(new Date(job.deliveryScheduledAt), new Date())
                                    ? format(new Date(job.deliveryScheduledAt), "HH:mm")
                                    : format(new Date(job.deliveryScheduledAt), "dd MMM, HH:mm")}
                                  {job.type === 'full_service' && job.pickupLocation && job.dropoffLocation && 
                                   job.pickupLocation.trim().toLowerCase() !== job.dropoffLocation.trim().toLowerCase() && (
                                    <Badge className="text-[8px] font-extrabold px-1.5 py-0 h-4 bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-0.5 shadow-sm uppercase shrink-0 animate-pulse">
                                      <MapPin size={9} className="text-rose-600 shrink-0" />
                                      รับ-ส่งคนละที่
                                    </Badge>
                                  )}
                                </span>
                              </div>
                            )}

                            {['billing', 'delivery', 'completed'].includes(job.status) ? (
                              <div className="text-xs text-slate-500 mb-3 flex items-start gap-1" title="Delivery Address">
                                <Navigation size={12} className="shrink-0 mt-0.5 text-rose-500" />
                                <span className="line-clamp-2 font-medium text-slate-700">
                                  <span className="text-[9px] font-bold text-rose-600 uppercase mr-1 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">ส่ง</span>
                                  {job.dropoffLocation || "-"}
                                </span>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 mb-3 flex items-start gap-1" title="Pickup Address">
                                <MapPin size={12} className="shrink-0 mt-0.5 text-emerald-600" />
                                <span className="line-clamp-2">
                                  <span className="text-[9px] font-bold text-emerald-600 uppercase mr-1 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">รับ</span>
                                  {job.pickupLocation || "-"}
                                </span>
                              </div>
                            )}

                            <div className="flex flex-col gap-1.5 mb-2">
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <Banknote size={12} className="text-slate-400" />
                                <span className="font-bold">฿{job.totalAmount || 0}</span>
                                {job.source === 'pos' || (job.type as string) === 'in_store' ? (
                                  <span className={`px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${job.isShopPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                    SHOP {job.isShopPaid ? 'PAID' : 'UNPAID'}
                                  </span>
                                ) : (
                                  <span className={`px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${job.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {job.paymentChannel ? `${job.paymentChannel} - ` : ''}{job.isPaid ? 'PAID' : 'UNPAID'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                              <div className="flex gap-1.5 flex-wrap items-center">
                                {job.createdBy && (
                                  <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-200 flex items-center gap-1 shrink-0" title={`Created by ${job.createdBy}`}>
                                    <User size={10} className="text-indigo-500" /> {job.createdBy}
                                  </span>
                                )}
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
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
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
                  const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
                  await jobStore.updateJobDetails(cancellingJob.id, { 
                    status: "cancel", 
                    remark: `${cancellingJob.remark || ''} | Cancelled Reason: ${cancelReason}`.trim() 
                  }, actorDetails);
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

      <Dialog open={reopenDialog.isOpen} onOpenChange={(open) => !open && setReopenDialog(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for moving job out of completed <span className="text-red-500">*</span></Label>
              <Input 
                id="reopen-reason-input"
                value={reopenDialog.reason} 
                onChange={e => setReopenDialog(prev => ({ ...prev, reason: e.target.value }))} 
                placeholder="e.g. Laundry needs rewashing, Customer changed request..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialog(prev => ({ ...prev, isOpen: false }))}>Cancel</Button>
            <Button 
              id="confirm-reopen-btn"
              disabled={!reopenDialog.reason.trim()}
              onClick={async () => {
                const { jobId, targetStatus, reason } = reopenDialog;
                if (!jobId || !targetStatus) return;
                try {
                  const job = filteredJobs.find(j => j.id === jobId);
                  if (!job) return;

                  let notes = [];
                  if (job.adminNotesJson) {
                    try {
                      notes = JSON.parse(job.adminNotesJson);
                      if (!Array.isArray(notes)) notes = [];
                    } catch (e) {
                      notes = [];
                    }
                  }

                  const newLog = {
                    id: Math.random().toString(36).substring(7),
                    userId: user?.id || "unknown",
                    userName: (user as any)?.name || user?.email || "Admin",
                    text: `Reopened Job: Status changed from Completed to ${statusConfig[targetStatus as JobStatus]?.label || targetStatus}. Reason: ${reason.trim()}`,
                    imageUrls: [],
                    timestamp: new Date().toISOString(),
                  };
                  notes.push(newLog);

                  const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
                  await jobStore.updateJobDetails(jobId, { 
                    status: targetStatus as JobStatus, 
                    adminNotesJson: JSON.stringify(notes) 
                  }, actorDetails);
                  toast.success(`Job updated to ${statusConfig[targetStatus as JobStatus].label}`);
                  setReopenDialog({ isOpen: false, jobId: "", targetStatus: "", reason: "" });
                } catch (e: any) {
                  toast.error(`Error: ${e.message}`);
                }
              }} 
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Confirm Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
