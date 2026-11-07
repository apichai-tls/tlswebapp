"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Building,
  Phone,
  User,
  Package,
  Layers,
  Sparkles,
  Zap,
  ArrowRight,
  Filter,
  Check,
  X,
  ChevronDown,
  Store,
  FileText,
  CalendarDays,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  RecurringSchedule,
  DAY_NAMES,
  TIME_SLOTS,
  SERVICE_CATEGORIES,
} from "@/types/recurring-order";
import {
  getRecurringSchedulesAction,
  saveRecurringScheduleAction,
  deleteRecurringScheduleAction,
  toggleRecurringScheduleStatusAction,
  triggerRecurringOrderNowAction,
  runRecurringOrdersAutomationAction,
} from "@/actions/db";

interface AdminRecurringOrdersProps {
  customers?: any[];
  shops?: any[];
  onViewJob?: (jobId: string) => void;
  initialSelectedCustomer?: any | null;
  onCloseModal?: () => void;
}

export function AdminRecurringOrders({
  customers = [],
  shops = [],
  onViewJob,
  initialSelectedCustomer = null,
}: AdminRecurringOrdersProps) {
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAutomation, setRunningAutomation] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "all" | "today">("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"all" | "active" | "paused">("all");

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<RecurringSchedule | null>(null);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Default Mon, Wed, Fri (3x/week)
  const [timeSlot, setTimeSlot] = useState("09:00 - 11:00");
  const [deliveryDaysOffset, setDeliveryDaysOffset] = useState(1);
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState("17:00 - 19:00");
  const [serviceType, setServiceType] = useState<string>("KILO");
  const [serviceSummary, setServiceSummary] = useState("KILO (Wash & Fold)");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [branchId, setBranchId] = useState("ONLINE");
  const [brand, setBrand] = useState("that_laundry_shop");
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [saving, setSaving] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // Today Bangkok Day of Week
  const todayDayOfWeek = useMemo(() => {
    const bkkDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    return bkkDate.getDay();
  }, []);

  // Fetch Schedules
  const loadSchedules = async () => {
    try {
      setLoading(true);
      const res = await getRecurringSchedulesAction();
      if (res.success && res.schedules) {
        setSchedules(res.schedules);
      }
    } catch (e: any) {
      toast.error("Failed to load recurring schedules: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  // Open dialog pre-filled if initialSelectedCustomer provided
  useEffect(() => {
    if (initialSelectedCustomer) {
      openCreateDialog(initialSelectedCustomer);
    }
  }, [initialSelectedCustomer]);

  const openCreateDialog = (cust?: any) => {
    setEditingSchedule(null);
    if (cust) {
      setSelectedCustomerId(cust.id);
      setCustomerSearch(`${cust.name} (${cust.phone || "-"})`);
      setBranchId(cust.branchId || "ONLINE");
      setBrand(cust.brand || "that_laundry_shop");
    } else {
      setSelectedCustomerId("");
      setCustomerSearch("");
      setBranchId("ONLINE");
      setBrand("that_laundry_shop");
    }
    setSelectedDays([1, 3, 5]); // Default 3x/week
    setTimeSlot("09:00 - 11:00");
    setDeliveryDaysOffset(1);
    setDeliveryTimeSlot("17:00 - 19:00");
    setServiceType("KILO");
    setServiceSummary("KILO (Wash & Fold)");
    setSpecialInstructions(cust?.remark || "");
    setStatus("active");
    setIsDialogOpen(true);
  };

  const openEditDialog = (schedule: RecurringSchedule) => {
    setEditingSchedule(schedule);
    setSelectedCustomerId(schedule.customerId);
    const matchedCust = customers.find((c) => c.id === schedule.customerId);
    setCustomerSearch(
      matchedCust ? `${matchedCust.name} (${matchedCust.phone || "-"})` : schedule.customerName
    );
    setSelectedDays(schedule.daysOfWeek || [1]);
    setTimeSlot(schedule.timeSlot || "09:00 - 11:00");
    setDeliveryDaysOffset(schedule.deliveryDaysOffset ?? 1);
    setDeliveryTimeSlot(schedule.deliveryTimeSlot || "17:00 - 19:00");
    setServiceType(schedule.serviceType || "KILO");
    setServiceSummary(schedule.serviceSummary || "KILO (Wash & Fold)");
    setSpecialInstructions(schedule.specialInstructions || "");
    setBranchId(schedule.branchId || "ONLINE");
    setBrand(schedule.brand || "that_laundry_shop");
    setStatus(schedule.status || "active");
    setIsDialogOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!selectedCustomerId) {
      toast.error("Please select a customer");
      return;
    }
    if (selectedDays.length === 0) {
      toast.error("Please select at least one day of the week");
      return;
    }

    const customer = customers.find((c) => c.id === selectedCustomerId);
    const customerName = customer ? customer.name : editingSchedule?.customerName || "";
    const customerPhone = customer ? customer.phone : editingSchedule?.customerPhone || "";
    const address = customer ? customer.defaultAddress || "" : editingSchedule?.address || "";
    const roomNo = customer ? customer.roomNo || customer.secondaryAddress || "" : editingSchedule?.roomNo || "";

    const payload: Partial<RecurringSchedule> = {
      ...(editingSchedule ? { id: editingSchedule.id } : {}),
      customerId: selectedCustomerId,
      customerName,
      customerPhone,
      address,
      roomNo,
      branchId,
      brand,
      frequencyType: selectedDays.length === 1 ? "weekly" : "multi_days",
      daysOfWeek: selectedDays.sort((a, b) => a - b),
      timeSlot,
      deliveryDaysOffset: Number(deliveryDaysOffset) || 1,
      deliveryTimeSlot,
      serviceType,
      serviceSummary,
      specialInstructions,
      autoCreateTiming: "same_day_morning",
      status,
    };

    try {
      setSaving(true);
      const res = await saveRecurringScheduleAction(payload);
      if (res.success) {
        toast.success(editingSchedule ? "Schedule updated" : "New recurring schedule created!");
        setIsDialogOpen(false);
        if (res.schedules) {
          setSchedules(res.schedules);
        } else {
          loadSchedules();
        }
      } else {
        toast.error(res.error || "Failed to save schedule");
      }
    } catch (e: any) {
      toast.error("Error saving schedule: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove the recurring automation for ${name}?`)) {
      return;
    }
    try {
      const res = await deleteRecurringScheduleAction(id);
      if (res.success) {
        toast.success("Schedule deleted");
        if (res.schedules) setSchedules(res.schedules);
        else loadSchedules();
      } else {
        toast.error(res.error || "Failed to delete schedule");
      }
    } catch (e: any) {
      toast.error("Error deleting schedule: " + e.message);
    }
  };

  const handleToggleStatus = async (schedule: RecurringSchedule) => {
    const nextStatus = schedule.status === "active" ? "paused" : "active";
    try {
      const res = await toggleRecurringScheduleStatusAction(schedule.id, nextStatus);
      if (res.success) {
        toast.success(`Schedule ${nextStatus === "active" ? "activated" : "paused"}`);
        if (res.schedules) setSchedules(res.schedules);
        else loadSchedules();
      } else {
        toast.error(res.error || "Failed to update status");
      }
    } catch (e: any) {
      toast.error("Error updating status: " + e.message);
    }
  };

  const handleTriggerNow = async (schedule: RecurringSchedule) => {
    if (!confirm(`Create today's pickup job order now for ${schedule.customerName}?`)) {
      return;
    }
    try {
      setTriggeringId(schedule.id);
      const res = await triggerRecurringOrderNowAction(schedule.id);
      if (res.success && res.job) {
        toast.success(`Job #${res.job.id} created successfully for ${schedule.customerName}!`, {
          action: {
            label: "View Job",
            onClick: () => onViewJob?.(res.job.id),
          },
        });
        loadSchedules();
      } else {
        toast.error(res.error || "Failed to trigger job");
      }
    } catch (e: any) {
      toast.error("Error triggering job: " + e.message);
    } finally {
      setTriggeringId(null);
    }
  };

  const handleRunAutomation = async () => {
    try {
      setRunningAutomation(true);
      const res = await runRecurringOrdersAutomationAction();
      if (res.success) {
        if ((res.generatedCount ?? 0) > 0) {
          toast.success(`Successfully auto-created ${res.generatedCount} recurring order(s) for today!`);
        } else {
          toast.info("All recurring orders for today have already been generated or none are scheduled.");
        }
        if (res.schedules) setSchedules(res.schedules);
        else loadSchedules();
      } else {
        toast.error(res.error || "Failed to run automation");
      }
    } catch (e: any) {
      toast.error("Error running automation: " + e.message);
    } finally {
      setRunningAutomation(false);
    }
  };

  // Quick Preset Handlers
  const applyPreset = (preset: "mon" | "2x" | "3x_mwf" | "3x_tts" | "4x" | "daily") => {
    switch (preset) {
      case "mon":
        setSelectedDays([1]);
        break;
      case "2x":
        setSelectedDays([1, 4]); // Mon, Thu
        break;
      case "3x_mwf":
        setSelectedDays([1, 3, 5]); // Mon, Wed, Fri
        break;
      case "3x_tts":
        setSelectedDays([2, 4, 6]); // Tue, Thu, Sat
        break;
      case "4x":
        setSelectedDays([1, 2, 4, 5]); // Mon, Tue, Thu, Fri
        break;
      case "daily":
        setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
        break;
    }
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      if (selectedDays.length === 1) {
        toast.error("At least one day must remain selected");
        return;
      }
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  // Filtered Customers for Search Dropdown
  const filteredCustomerOptions = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 15);
    const q = customerSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.defaultAddress?.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [customers, customerSearch]);

  // Statistics KPIs
  const stats = useMemo(() => {
    const total = schedules.length;
    const active = schedules.filter((s) => s.status === "active").length;
    const paused = schedules.filter((s) => s.status === "paused").length;
    const dueToday = schedules.filter(
      (s) => s.status === "active" && s.daysOfWeek.includes(todayDayOfWeek)
    ).length;
    const totalWeeklyPickups = schedules
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + (s.daysOfWeek?.length || 0), 0);

    return { total, active, paused, dueToday, totalWeeklyPickups };
  }, [schedules, todayDayOfWeek]);

  // Filtered Schedules List
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      // Day filter
      if (selectedDayFilter === "today") {
        if (!s.daysOfWeek?.includes(todayDayOfWeek)) return false;
      } else if (typeof selectedDayFilter === "number") {
        if (!s.daysOfWeek?.includes(selectedDayFilter)) return false;
      }

      // Status filter
      if (selectedStatusFilter !== "all" && s.status !== selectedStatusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.customerName?.toLowerCase().includes(q);
        const matchesPhone = s.customerPhone?.includes(q);
        const matchesAddress = s.address?.toLowerCase().includes(q);
        const matchesRoom = s.roomNo?.toLowerCase().includes(q);
        const matchesService = s.serviceSummary?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesAddress && !matchesRoom && !matchesService) {
          return false;
        }
      }

      return true;
    });
  }, [schedules, selectedDayFilter, selectedStatusFilter, searchQuery, todayDayOfWeek]);

  return (
    <div className="space-y-5">
      {/* 1. Executive Command Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shadow-2xs">
              <RefreshCw size={18} className="animate-spin-slow" />
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Recurring Order Automation
            </h2>
            <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-black text-[10px] px-2 py-0.5 rounded-lg">
              {stats.active} Active Schedules
            </Badge>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Automate weekly (1x) and multi-day recurring laundry pickups (3-4x/week) with custom time slots and delivery turnaround
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunAutomation}
            disabled={runningAutomation}
            className="h-9 px-3 border-amber-300/90 bg-amber-50/70 text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600 font-bold text-xs rounded-xl shadow-2xs transition-all gap-1.5 cursor-pointer"
          >
            <Zap size={14} className={runningAutomation ? "animate-spin" : "fill-amber-500"} />
            <span>{runningAutomation ? "Running Check..." : "Run Automation Now"}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => openCreateDialog()}
            className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all gap-1.5 cursor-pointer"
          >
            <Plus size={15} />
            <span>+ New Recurring Schedule</span>
          </Button>
        </div>
      </div>

      {/* 2. Harmonized KPI Analytics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Active Subscriptions */}
        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-indigo-500 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Active Subscriptions
            </span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <User size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.active}</span>
            <span className="text-xs text-slate-400 font-semibold">customers</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Regular automated pickups</p>
        </div>

        {/* KPI 2: Due Today */}
        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-emerald-500 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Due Today ({DAY_NAMES[todayDayOfWeek].short})
            </span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CalendarDays size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">{stats.dueToday}</span>
            <span className="text-xs text-emerald-700 font-semibold">orders</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Scheduled for pickup today</p>
        </div>

        {/* KPI 3: Weekly Scheduled Volume */}
        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-purple-500 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Weekly Run Volume
            </span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Layers size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-700">{stats.totalWeeklyPickups}</span>
            <span className="text-xs text-purple-600 font-semibold">pickups / week</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Across all recurring days</p>
        </div>

        {/* KPI 4: Paused Subscriptions */}
        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-amber-500 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Paused Schedules
            </span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Pause size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">{stats.paused}</span>
            <span className="text-xs text-amber-700 font-semibold">temporarily stopped</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Holiday / customer request</p>
        </div>
      </div>

      {/* 3. Filter & Command Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 space-y-3">
        {/* Row 1: Day of Week Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <Filter size={12} /> Day:
          </span>
          <button
            type="button"
            onClick={() => setSelectedDayFilter("all")}
            className={`px-3 py-1 text-xs font-extrabold rounded-lg border transition-all shrink-0 cursor-pointer ${
              selectedDayFilter === "all"
                ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            All Days ({schedules.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedDayFilter("today")}
            className={`px-3 py-1 text-xs font-extrabold rounded-lg border transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
              selectedDayFilter === "today"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <Sparkles size={11} />
            Today ({DAY_NAMES[todayDayOfWeek].short})
          </button>

          {DAY_NAMES.map((d) => {
            const countForDay = schedules.filter((s) => s.daysOfWeek?.includes(d.day)).length;
            const isToday = d.day === todayDayOfWeek;
            const active = selectedDayFilter === d.day;
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => setSelectedDayFilter(d.day)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                  active
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : isToday
                      ? "bg-indigo-50/70 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{d.short}</span>
                {countForDay > 0 && (
                  <span
                    className={`text-[10px] px-1 rounded-full font-black ${
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {countForDay}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 2: Status Toggle & Search Input */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 self-start">
            <span className="text-xs font-bold text-slate-400 mr-1">Status:</span>
            {(["all", "active", "paused"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg border capitalize transition-all cursor-pointer ${
                  selectedStatusFilter === st
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, phone, address..."
              className="h-8.5 pl-8 pr-7 text-xs bg-slate-50/70 border-slate-200 rounded-xl focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Schedules List */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200/80">
          <RefreshCw size={24} className="animate-spin text-indigo-500 mb-2" />
          <p className="text-xs font-bold text-slate-500">Loading recurring automation schedules...</p>
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-slate-200 p-6 text-center">
          <Calendar size={36} className="text-slate-300 mb-2" />
          <h3 className="font-bold text-sm text-slate-700">No recurring schedules found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {searchQuery
              ? "No schedules match your current search keywords or filters."
              : "Get started by creating your first automated recurring laundry schedule for frequent weekly customers."}
          </p>
          <Button
            size="sm"
            onClick={() => openCreateDialog()}
            className="mt-4 h-8.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl gap-1.5"
          >
            <Plus size={14} /> Create First Schedule
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          <AnimatePresence>
            {filteredSchedules.map((schedule) => {
              const isDueToday =
                schedule.status === "active" && schedule.daysOfWeek?.includes(todayDayOfWeek);
              const isTriggering = triggeringId === schedule.id;

              return (
                <motion.div
                  key={schedule.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between gap-3 shadow-2xs hover:shadow-md ${
                    schedule.status === "paused"
                      ? "border-slate-200 opacity-75 bg-slate-50/50"
                      : isDueToday
                        ? "border-emerald-300 ring-2 ring-emerald-100"
                        : "border-slate-200/90"
                  }`}
                >
                  {/* Top Bar: Customer Initials + Name + Status Switch */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                        {schedule.customerName
                          ?.split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "CU"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-extrabold text-slate-900 text-sm truncate max-w-[170px]" title={schedule.customerName}>
                            {schedule.customerName}
                          </h4>
                          {isDueToday && (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-300 font-black text-[9px] px-1.5 py-0 h-4 rounded-md">
                              TODAY
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold mt-0.5">
                          <span className="flex items-center gap-0.5">
                            <Phone size={10} className="text-slate-400" />
                            {schedule.customerPhone || "-"}
                          </span>
                          <span className="text-slate-300">•</span>
                          <Badge className="bg-slate-100 text-slate-600 border-none font-bold text-[9px] px-1.5 py-0 h-4">
                            {schedule.daysOfWeek?.length === 1
                              ? "Weekly 1x"
                              : `${schedule.daysOfWeek?.length}x / week`}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(schedule)}
                      title={schedule.status === "active" ? "Pause schedule" : "Activate schedule"}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
                        schedule.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                          : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                      }`}
                    >
                      {schedule.status}
                    </button>
                  </div>

                  {/* Day Pills Matrix */}
                  <div className="flex items-center gap-1 bg-slate-50/80 p-1.5 rounded-xl border border-slate-100 justify-between">
                    {DAY_NAMES.map((d) => {
                      const isSelected = schedule.daysOfWeek?.includes(d.day);
                      const isToday = d.day === todayDayOfWeek;
                      return (
                        <div
                          key={d.day}
                          className={`flex-1 text-center py-1 rounded-lg text-[10px] font-black transition-all ${
                            isSelected
                              ? isToday
                                ? "bg-emerald-600 text-white shadow-2xs"
                                : "bg-indigo-600 text-white shadow-2xs"
                              : "text-slate-300 bg-white/60"
                          }`}
                          title={`${d.full}${isSelected ? " (Active pickup day)" : ""}`}
                        >
                          {d.short}
                        </div>
                      );
                    })}
                  </div>

                  {/* Details Strip: Address + Time slot + Delivery Offset */}
                  <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-start gap-1.5">
                      <Building size={12} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-[11px] font-medium text-slate-700 line-clamp-1" title={schedule.address}>
                        {schedule.address || "No address specified"}
                        {schedule.roomNo ? ` (Room ${schedule.roomNo})` : ""}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 font-medium">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Clock size={11} className="text-indigo-500" />
                        {schedule.timeSlot}
                      </span>
                      <span className="text-slate-500 font-semibold bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                        Turnaround: +{schedule.deliveryDaysOffset}d
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                      <span className="truncate max-w-[200px] font-extrabold text-slate-800 flex items-center gap-1.5" title={schedule.serviceSummary}>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-100 uppercase">
                          {SERVICE_CATEGORIES.find((c) => c.id === schedule.serviceType)?.icon || "🧺"} {schedule.serviceType || "KILO"}
                        </span>
                        <span className="text-slate-600 font-semibold truncate">
                          {schedule.serviceSummary || "KILO (Wash & Fold)"}
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {schedule.totalJobsCreated || 0} jobs
                      </span>
                    </div>
                  </div>

                  {/* Special Notes if any */}
                  {schedule.specialInstructions && (
                    <div className="text-[11px] text-amber-700 bg-amber-50/70 border border-amber-200/80 px-2.5 py-1 rounded-lg line-clamp-1">
                      ⚠️ {schedule.specialInstructions}
                    </div>
                  )}

                  {/* Footer & Action Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="text-[10px] text-slate-400 font-medium truncate">
                      {schedule.lastGeneratedDate ? (
                        <span>
                          Last run: <span className="font-bold text-slate-600">{schedule.lastGeneratedDate}</span>
                          {schedule.lastJobId && (
                            <button
                              type="button"
                              onClick={() => onViewJob?.(schedule.lastJobId!)}
                              className="text-indigo-600 hover:underline font-bold ml-1 cursor-pointer"
                            >
                              (#{schedule.lastJobId})
                            </button>
                          )}
                        </span>
                      ) : (
                        <span>Not yet triggered</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTriggerNow(schedule)}
                        disabled={isTriggering}
                        className="h-7 px-2 border-emerald-300 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 font-bold text-[10px] rounded-lg gap-1 cursor-pointer shadow-2xs"
                        title="Create order for this customer right now"
                      >
                        <Zap size={10} className={isTriggering ? "animate-spin" : ""} />
                        <span>Trigger Now</span>
                      </Button>

                      <button
                        type="button"
                        onClick={() => openEditDialog(schedule)}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Schedule"
                      >
                        <Edit2 size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSchedule(schedule.id, schedule.customerName)}
                        className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Schedule"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* 5. Schedule Creation & Editing Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-2xl">
          <DialogHeader className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-white/10 text-white">
                <RefreshCw size={16} />
              </span>
              <DialogTitle className="text-base font-extrabold text-white">
                {editingSchedule ? "Edit Recurring Schedule" : "Create Recurring Order Automation"}
              </DialogTitle>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Configure automatic laundry pickup schedules for weekly or multi-day frequent customers
            </p>
          </DialogHeader>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
            {/* Customer Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Select Customer *</span>
                {selectedCustomerId && (
                  <span className="text-[10px] text-emerald-600 font-extrabold">✓ Customer Selected</span>
                )}
              </label>
              <div className="relative">
                <Input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerDropdownOpen(true);
                  }}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  placeholder="Type to search customer by name or phone..."
                  className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl"
                />
                {customerDropdownOpen && filteredCustomerOptions.length > 0 && (
                  <div className="absolute top-10 left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar p-1">
                    {filteredCustomerOptions.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerSearch(`${c.name} (${c.phone || "-"})`);
                          setBranchId(c.branchId || "ONLINE");
                          setBrand(c.brand || "that_laundry_shop");
                          setSpecialInstructions(c.remark || "");
                          setCustomerDropdownOpen(false);
                        }}
                        className="p-2 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-extrabold text-slate-800">{c.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {c.phone || "-"} • {c.defaultAddress || "No address"}
                          </div>
                        </div>
                        <Badge className="bg-slate-100 text-slate-600 border-none text-[9px]">Select</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Frequency Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Frequency Presets</span>
                <span className="text-[10px] text-slate-400">Selected: {selectedDays.length} day(s)/week</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset("mon")}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                    selectedDays.length === 1 && selectedDays[0] === 1
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Weekly (1x)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("2x")}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                    selectedDays.length === 2 && selectedDays.includes(1) && selectedDays.includes(4)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  2x / Week
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("3x_mwf")}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                    selectedDays.length === 3 && selectedDays.includes(1) && selectedDays.includes(3) && selectedDays.includes(5)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  3x (Mon/Wed/Fri)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("3x_tts")}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                    selectedDays.length === 3 && selectedDays.includes(2) && selectedDays.includes(4) && selectedDays.includes(6)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  3x (Tue/Thu/Sat)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("4x")}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                    selectedDays.length === 4
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  4x / Week
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("daily")}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                    selectedDays.length === 7
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Daily (7x)
                </button>
              </div>
            </div>

            {/* Custom Day Toggles */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Days of the Week *</label>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_NAMES.map((d) => {
                  const isSelected = selectedDays.includes(d.day);
                  return (
                    <button
                      key={d.day}
                      type="button"
                      onClick={() => toggleDay(d.day)}
                      className={`py-2 text-center rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <span>{d.short}</span>
                      <span className="text-[9px] font-medium opacity-80">{d.thai}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slot & Turnaround */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Preferred Pickup Time Slot</label>
                <select
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none"
                >
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Delivery Turnaround</label>
                <select
                  value={deliveryDaysOffset}
                  onChange={(e) => setDeliveryDaysOffset(Number(e.target.value))}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none"
                >
                  <option value={1}>+1 Day (Next Day)</option>
                  <option value={2}>+2 Days</option>
                  <option value={3}>+3 Days</option>
                  <option value={0}>Same Day (+0 Days)</option>
                </select>
              </div>
            </div>

            {/* Service Category (POS Categories: KILO, IRON, DRY CLEAN, LINENS, PCS, SHOES, OTHERS) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Service Category (หมวดบริการ) *</span>
                <span className="text-[10px] text-indigo-700 bg-indigo-50 font-black px-2 py-0.5 rounded-md border border-indigo-200/80 uppercase">
                  Selected: {serviceType}
                </span>
              </label>

              {/* POS Category Cards matching TLS Service Menu */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SERVICE_CATEGORIES.map((cat) => {
                  const isSelected = serviceType === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setServiceType(cat.id);
                        setServiceSummary(cat.defaultSummary);
                      }}
                      className={`h-16 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center p-2 gap-0.5 shadow-2xs ${
                        isSelected
                          ? "bg-indigo-50/90 border-indigo-600 ring-2 ring-indigo-500/20 text-indigo-800 font-black shadow-xs"
                          : "bg-white border-slate-200/90 text-slate-700 font-extrabold hover:border-slate-300 hover:bg-slate-50/80"
                      }`}
                    >
                      <span className="text-xs tracking-wider uppercase font-black flex items-center gap-1.5">
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </span>
                      <span className="text-[9px] font-semibold text-slate-400 truncate max-w-full">
                        {cat.label.split("(")[1]?.replace(")", "") || ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Branch & Brand */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Branch</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none"
                >
                  <option value="ONLINE">Online Dispatch Center</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none"
                >
                  <option value="active">Active (Auto-generate orders)</option>
                  <option value="paused">Paused (Temporarily stopped)</option>
                </select>
              </div>
            </div>

            {/* Special Instructions */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Special Instructions / Notes for Rider & Staff
              </label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g. Leave with Juristic / Condo Lobby desk, Doorbell #402, Call 15 min before arrival..."
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none custom-scrollbar"
              />
            </div>
          </div>

          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              className="h-8.5 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSchedule}
              disabled={saving}
              className="h-8.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl gap-1.5"
            >
              {saving ? "Saving..." : editingSchedule ? "Update Schedule" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
