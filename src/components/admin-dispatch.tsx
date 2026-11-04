"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useRiders } from "@/lib/use-riders";
import { jobStore, shopStore, type Job } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { getUserAssignedBranchIds } from "@/components/branch-filter-dropdown";
import { useSyncExternalStore } from "react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, MapPin, User, X, Copy, Eye, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, Filter, Search, Sparkles, Route, Navigation, Zap, Compass, Check, ArrowRight, ExternalLink, Activity, Info, Flame, ChevronDown } from "lucide-react";
import { optimizeRiderRoute, calculateEstimatedDistanceKm } from "@/lib/route-optimizer";
import type { LatLng, ShopLocation } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";

import { Calendar, dateFnsLocalizer, EventProps } from 'react-big-calendar';
import withDragAndDrop, { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, getDay, addMinutes } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop(Calendar as any);

interface CalendarEvent {
  id: string;
  jobId: string;
  type: 'pickup' | 'delivery';
  title: string;
  customerName?: string;
  location?: string;
  coords?: LatLng;
  start: Date;
  end: Date;
  riderId?: string;
  resourceId?: string;
  jobStatus: string;
}

const RIDER_COLORS = [
  '#3b82f6', // blue
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#ef4444', // red
  '#84cc16', // lime
];


export const AdminDispatch = React.memo(function AdminDispatch({ onEditJob }: { onEditJob?: (job: Job) => void }) {
  const allJobs = useJobs();
  const allRiders = useRiders();
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  
  const isAreaRestricted = Boolean(user && user.role !== 'admin' && ((user.area && user.area !== 'ALL') || (user.branchId && user.branchId !== 'all' && user.branchId !== 'ALL')));
  const allowedBranchIds = useMemo(() => new Set(getUserAssignedBranchIds(user, shopLocations)), [user, shopLocations]);
  const userArea = (user?.area && user.area !== 'ALL') ? user.area : (user?.branchId && user.branchId !== 'all' ? user.branchId : null);
  // userArea resolved above

  const [filterArea, setFilterArea] = useState<string>(() => userArea || "ALL");

  useEffect(() => {
    if (userArea) {
      setFilterArea(userArea);
    }
  }, [userArea]);

  const effectiveArea = isAreaRestricted && userArea ? userArea : filterArea;
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [taskTypeFilter, setTaskTypeFilter] = useState<"all" | "pickup" | "delivery" | "unassigned">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showRouteReportModal, setShowRouteReportModal] = useState(false);
  const [activeReportRiderId, setActiveReportRiderId] = useState<string | null>(null);
  const [editRiderId, setEditRiderId] = useState<string>("");
  const [viewJobId, setViewJobId] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<any>('day');
  const [dayViewMode, setDayViewMode] = useState<"time" | "rider">("time");

  useEffect(() => {
    let start: Date;
    let end: Date;

    if (currentView === 'month') {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    } else if (currentView === 'week') {
      start = startOfWeek(currentDate);
      end = endOfWeek(currentDate);
    } else {
      start = startOfDay(currentDate);
      end = endOfDay(currentDate);
    }

    jobStore.fetchHistoricalJobs(start, end);
  }, [currentDate, currentView]);

  // Filter riders by selected area (only active riders with branch assigned)
  const filteredRiders = useMemo(() => {
    const activeRiders = allRiders.filter(r => r.branchId && r.isActive !== false);
    if (effectiveArea === "ALL") return activeRiders;
    return activeRiders.filter(r => {
    const branch = shopLocations.find(s => s.id === r.branchId);
    if (isAreaRestricted && shopLocations.length > 0) {
      return Boolean(r.branchId && allowedBranchIds.has(r.branchId));
    }
    return (branch?.area || '').toUpperCase() === effectiveArea.toUpperCase() || r.branchId === effectiveArea;
      // returned above
    });
  }, [allRiders, effectiveArea, shopLocations, isAreaRestricted, allowedBranchIds]);

  // Selectable riders for reassigning (filtered active riders + currently assigned rider if resigned)
  const reassignOptions = useMemo(() => {
    if (editRiderId && !filteredRiders.some(r => r.id === editRiderId)) {
      const existing = allRiders.find(r => r.id === editRiderId);
      if (existing) return [...filteredRiders, existing];
    }
    return filteredRiders;
  }, [filteredRiders, editRiderId, allRiders]);

  // Toggle rider selection
  const toggleRider = (riderId: string) => {
    const next = new Set(selectedRiderIds);
    if (next.has(riderId)) {
      next.delete(riderId);
    } else {
      next.add(riderId);
    }
    setSelectedRiderIds(next);
  };

  const toggleAllRiders = () => {
    if (selectedRiderIds.size === filteredRiders.length) {
      setSelectedRiderIds(new Set());
    } else {
      setSelectedRiderIds(new Set(filteredRiders.map(r => r.id)));
    }
  };

  // Filter & Map Jobs to Events
  const events = useMemo(() => {
    let jobs = allJobs.filter(j => j.status !== "pending" && j.status !== "cancel");

    // Hide TBA jobs from Managers, matching Kanban board rules
    if (user?.role === 'manager') {
      jobs = jobs.filter(j => j.status !== 'tba');
    }
    
    // Filter jobs by selected area (or enforced user area)
    if (effectiveArea !== "ALL") {
      jobs = jobs.filter(j => {
        const branch = shopLocations.find(s => s.id === j.branchId);
        if (isAreaRestricted && shopLocations.length > 0) {
          return Boolean(j.branchId && allowedBranchIds.has(j.branchId));
        }
        return (branch?.area || '').toUpperCase() === effectiveArea.toUpperCase() || j.branchId === effectiveArea;
        // returned above
      });
    }
    
    if (!showCompleted) {
      jobs = jobs.filter(j => j.status !== "completed");
    }

    if (selectedRiderIds.size > 0) {
      jobs = jobs.filter(j => {
        const hasPickupRider = j.pickupRiderId && selectedRiderIds.has(j.pickupRiderId);
        const hasDeliveryRider = j.deliveryRiderId && selectedRiderIds.has(j.deliveryRiderId);
        const isUnassignedPickup = !j.pickupRiderId;
        const isUnassignedDelivery = !j.deliveryRiderId;
        return hasPickupRider || hasDeliveryRider || isUnassignedPickup || isUnassignedDelivery;
      });
    }

    const calendarEvents: CalendarEvent[] = [];

    jobs.forEach(job => {
      const pLat = Number((job as any).pickupLat ?? job.pickupCoords?.lat ?? (job as any).customer?.lat ?? 0);
      const pLng = Number((job as any).pickupLng ?? job.pickupCoords?.lng ?? (job as any).customer?.lng ?? 0);
      const pCoords: LatLng | undefined = (pLat !== 0 && pLng !== 0) 
        ? { lat: pLat, lng: pLng } 
        : (job.pickupCoords && job.pickupCoords.lat !== 0 ? job.pickupCoords : undefined);

      const dLat = Number((job as any).dropoffLat ?? job.dropoffCoords?.lat ?? (job as any).customer?.lat ?? 0);
      const dLng = Number((job as any).dropoffLng ?? job.dropoffCoords?.lng ?? (job as any).customer?.lng ?? 0);
      const dCoords: LatLng | undefined = (dLat !== 0 && dLng !== 0) 
        ? { lat: dLat, lng: dLng } 
        : (job.dropoffCoords && job.dropoffCoords.lat !== 0 ? job.dropoffCoords : undefined);

      // Create Pickup Event (Amber)
      if (job.type === 'pickup' || job.type === 'full_service') {
        if (selectedRiderIds.size === 0 || !job.pickupRiderId || selectedRiderIds.has(job.pickupRiderId)) {
          const pStart = new Date(job.pickupScheduledAt || job.scheduledAt || job.createdAt);
          const pEnd = job.pickupScheduledEndAt ? new Date(job.pickupScheduledEndAt) : addMinutes(pStart, 30);
          calendarEvents.push({
            id: `${job.id}-pickup`,
            jobId: job.id,
            type: 'pickup',
            title: `[รับผ้า] ${job.customerName || 'Guest'} (${job.pickupLocation || 'No Address'})`,
            customerName: job.customerName || (job as any).customer?.name || 'Guest',
            location: job.pickupLocation || (job as any).customer?.address || '',
            coords: pCoords,
            start: pStart,
            end: pEnd,
            riderId: job.pickupRiderId,
            resourceId: job.pickupRiderId || 'unassigned',
            jobStatus: job.status,
          });
        }
      }

      // Create Delivery Event (Indigo)
      if (job.type === 'delivery' || job.type === 'full_service') {
        const isPickupDone = !['pending', 'pickup'].includes(job.status);
        if (isPickupDone || job.type === 'delivery') {
          if (selectedRiderIds.size === 0 || !job.deliveryRiderId || selectedRiderIds.has(job.deliveryRiderId)) {
            const dStart = new Date(job.deliveryScheduledAt || new Date(job.createdAt).getTime() + 86400000);
            const dEnd = job.deliveryScheduledEndAt ? new Date(job.deliveryScheduledEndAt) : addMinutes(dStart, 30);
            calendarEvents.push({
              id: `${job.id}-delivery`,
              jobId: job.id,
              type: 'delivery',
              title: `[ส่งผ้า] ${job.customerName || 'Guest'} (${job.dropoffLocation || 'No Address'})`,
              customerName: job.customerName || (job as any).customer?.name || 'Guest',
              location: job.dropoffLocation || (job as any).customer?.address || '',
              coords: dCoords,
              start: dStart,
              end: dEnd,
              riderId: job.deliveryRiderId,
              jobStatus: job.status,
            });
          }
        }
      }
    });
    return calendarEvents;
  }, [allJobs, selectedRiderIds, showCompleted, effectiveArea, shopLocations, user, isAreaRestricted, allowedBranchIds]);

  // Route Optimization calculation for each active rider based on current schedule/calendar events
  const riderRouteReports = useMemo(() => {
    return filteredRiders.map(rider => {
      const riderBranch = shopLocations.find(s => s.id === rider.branchId);
      const origin: LatLng = (rider.currentLocation && typeof rider.currentLocation.lat === 'number')
        ? rider.currentLocation
        : (riderBranch?.coords || (riderBranch?.area === 'PTY' ? { lat: 12.9276, lng: 100.8771 } : { lat: 13.736717, lng: 100.523186 }));

      // Find all scheduled tasks for this rider currently in view / day
      const riderTasks = events
        .filter(e => e.riderId === rider.id)
        .map(e => ({
          id: e.id,
          jobId: e.jobId,
          legType: e.type,
          job: { id: e.jobId },
          targetCoords: (e.coords && typeof e.coords.lat === 'number' && e.coords.lat !== 0) ? e.coords : origin,
          title: e.title,
          customerName: e.customerName || 'Customer',
          location: e.location || '',
          scheduledTime: e.start,
          originalEvent: e,
        }));

      // Chronological route distance (as scheduled in time order)
      const sortedChrono = [...riderTasks].sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
      let chronologicalKm = 0;
      let prevChrono = origin;
      sortedChrono.forEach(t => {
        const dist = calculateEstimatedDistanceKm(prevChrono, t.targetCoords);
        chronologicalKm += dist;
        prevChrono = t.targetCoords;
      });
      chronologicalKm = Math.round(chronologicalKm * 10) / 10;

      // Optimized route calculation using Traveling Salesperson Problem (TSP) heuristic
      const optResult = optimizeRiderRoute(origin, riderTasks);
      const optimizedKm = optResult.totalDistanceKm;

      const savedKm = Math.max(0, Math.round((chronologicalKm - optimizedKm) * 10) / 10);
      const savedPercent = chronologicalKm > 0 ? Math.round((savedKm / chronologicalKm) * 100) : 0;
      const savedMinutes = Math.round(savedKm * 2.5); // ~2.5 mins per km in Bangkok/urban traffic

      return {
        rider,
        branch: riderBranch,
        origin,
        hasLiveGps: Boolean(rider.currentLocation && typeof rider.currentLocation.lat === 'number'),
        tasksCount: riderTasks.length,
        chronologicalKm,
        optimizedKm,
        savedKm,
        savedPercent,
        savedMinutes,
        googleMapsUrl: optResult.googleMapsUrl,
        orderedStops: optResult.orderedTasks.map(item => ({
          stopNumber: item.stopNumber,
          title: item.task.title,
          customerName: item.task.customerName,
          location: item.task.location,
          type: item.task.legType as 'pickup' | 'delivery',
          distanceFromPrevKm: item.distanceFromPrevKm,
          cumulativeDistanceKm: item.cumulativeDistanceKm,
          scheduledTime: item.task.scheduledTime,
          jobId: item.task.jobId,
          coords: item.task.targetCoords,
        })),
      };
    });
  }, [filteredRiders, events, shopLocations]);

  // Aggregate Route Optimization stats across all active riders
  const teamOptimizationTotals = useMemo(() => {
    let totalStops = 0;
    let totalChronoKm = 0;
    let totalOptKm = 0;
    let totalSavedKm = 0;
    let totalSavedMins = 0;

    riderRouteReports.forEach(r => {
      totalStops += r.tasksCount;
      totalChronoKm += r.chronologicalKm;
      totalOptKm += r.optimizedKm;
      totalSavedKm += r.savedKm;
      totalSavedMins += r.savedMinutes;
    });

    return {
      totalStops,
      totalChronoKm: Math.round(totalChronoKm * 10) / 10,
      totalOptKm: Math.round(totalOptKm * 10) / 10,
      totalSavedKm: Math.round(totalSavedKm * 10) / 10,
      totalSavedMins,
    };
  }, [riderRouteReports]);


  const onEventDrop = async ({ event, start, end }: any) => {
    const e = event as CalendarEvent;
    try {
      const actorInfo = {
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role
      };
      if (e.type === 'pickup') {
        await jobStore.updateJobDetails(e.jobId, { pickupScheduledAt: start, pickupScheduledEndAt: end, pickupRiderId: e.riderId || undefined, ...actorInfo });
      } else {
        await jobStore.updateJobDetails(e.jobId, { deliveryScheduledAt: start, deliveryScheduledEndAt: end, deliveryRiderId: e.riderId || undefined, ...actorInfo });
      }
      toast.success(`Updated ${e.type} time successfully`);
    } catch (error) {
      toast.error("Failed to update time");
    }
  };

  const onEventResize = async ({ event, start, end }: any) => {
    const e = event as CalendarEvent;
    try {
      const actorInfo = {
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role
      };
      if (e.type === 'pickup') {
        await jobStore.updateJobDetails(e.jobId, { pickupScheduledAt: start, pickupScheduledEndAt: end, ...actorInfo });
      } else {
        await jobStore.updateJobDetails(e.jobId, { deliveryScheduledAt: start, deliveryScheduledEndAt: end, ...actorInfo });
      }
      toast.success(`Updated ${e.type} duration successfully`);
    } catch (error) {
      toast.error("Failed to update duration");
    }
  };

  // Event Click Handler
  const onSelectEvent = (event: any) => {
    setEditingEvent(event);
    setEditRiderId(event.riderId || "");
  };

  const handleSaveEdit = async () => {
    if (!editingEvent) return;
    try {
      if (editingEvent.type === 'pickup') {
        await jobStore.assignPickupRider(editingEvent.jobId, editRiderId, editingEvent.start);
      } else {
        await jobStore.assignDeliveryRider(editingEvent.jobId, editRiderId, editingEvent.start);
      }
      toast.success("Rider reassigned successfully");
      setEditingEvent(null);
    } catch (error) {
      toast.error("Failed to reassign rider");
    }
  };

  const handleDuplicateJob = async () => {
    if (!editingEvent) return;
    const jobToDup = allJobs.find(j => j.id === editingEvent.jobId);
    if (!jobToDup) return;

    try {
      const newJobData = { ...jobToDup };
      delete (newJobData as any).id;
      delete (newJobData as any).createdAt;
      delete (newJobData as any).completedAt;
      delete (newJobData as any).customer;
      delete (newJobData as any).legs;
      delete (newJobData as any).adminNotesJson;
      delete (newJobData as any).pickupProofImageUrl;
      delete (newJobData as any).deliveryProofImageUrl;
      delete (newJobData as any).proofImageUrl;
      
      await jobStore.addJob({
        ...newJobData,
        status: "pending",
        pickupRiderId: undefined,
        deliveryRiderId: undefined,
        bagImageUrl: undefined,
        billImageUrl: undefined,
        createdBy: user?.name || user?.email || "Dispatcher",
        creatorRole: user?.role,
        actorId: user?.id,
        actorName: user?.name || user?.email,
      } as any);

      toast.success("Job duplicated and sent to Order Verify.");
      setEditingEvent(null);
    } catch (e: any) {
      toast.error(`Error duplicating job: ${e.message}`);
    }
  };

  const getRiderColor = (riderId?: string) => {
    if (!riderId) return '#94a3b8'; // unassigned = slate
    const rider = allRiders.find(r => r.id === riderId);
    return rider?.color || '#3b82f6'; // default blue if not set
  };


  // Smart Dispatch Proximity & Area Analysis for the currently selected event
  const smartRiderAnalysis = useMemo(() => {
    if (!editingEvent) return [];

    const targetJob = allJobs.find(j => j.id === editingEvent.jobId);
    const eventCoords = editingEvent.coords || 
      (editingEvent.type === 'pickup' 
        ? (targetJob?.pickupCoords || (targetJob as any)?.customer?.defaultCoords) 
        : (targetJob?.dropoffCoords || (targetJob as any)?.customer?.defaultCoords));

    const targetBranch = shopLocations.find(s => s.id === targetJob?.branchId);
    const orderArea = targetBranch?.area || (eventCoords && eventCoords.lat < 13.2 ? 'PTY' : 'BKK');

    return reassignOptions.map(rider => {
      const report = riderRouteReports.find(r => r.rider.id === rider.id);
      const riderBranch = shopLocations.find(s => s.id === rider.branchId);
      const riderArea = riderBranch?.area || 'BKK';
      const isSameArea = riderArea.toUpperCase() === (orderArea || 'BKK').toUpperCase();
      
      const riderOrigin = report?.origin || { lat: 13.736717, lng: 100.523186 };
      const distFromRiderLive = eventCoords ? calculateEstimatedDistanceKm(riderOrigin, eventCoords) : null;

      // Find nearest existing scheduled stop of this rider
      let nearestStopDist: number | null = null;
      let nearestStopName: string | null = null;
      if (report && report.orderedStops.length > 0 && eventCoords) {
        report.orderedStops.forEach(stop => {
          if (stop.coords) {
            const d = calculateEstimatedDistanceKm(stop.coords, eventCoords);
            if (nearestStopDist === null || d < nearestStopDist) {
              nearestStopDist = d;
              nearestStopName = stop.customerName || stop.location;
            }
          }
        });
      }

      // Calculate simulated detour if assigned to this rider
      let extraDetourKm = 0;
      if (report && eventCoords) {
        const currentKm = report.optimizedKm;
        const existingTasks = report.orderedStops.map(s => ({
          targetCoords: s.coords || riderOrigin,
          legType: s.type,
          job: { id: s.jobId }
        }));
        const simulated = optimizeRiderRoute(riderOrigin, [
          ...existingTasks,
          { targetCoords: eventCoords, legType: editingEvent.type, job: { id: editingEvent.jobId } }
        ]);
        extraDetourKm = Math.max(0, Math.round((simulated.totalDistanceKm - currentKm) * 10) / 10);
      }

      return {
        rider,
        report,
        riderBranch,
        riderArea,
        isSameArea,
        hasLiveGps: report?.hasLiveGps || false,
        distFromRiderLive,
        nearestStopDist,
        nearestStopName,
        extraDetourKm,
        currentStopsCount: report?.tasksCount || 0,
      };
    }).sort((a, b) => {
      // 1. Same area first
      if (a.isSameArea !== b.isSameArea) return a.isSameArea ? -1 : 1;
      // 2. Proximity by nearest stop or live distance
      const distA = a.nearestStopDist ?? a.distFromRiderLive ?? 999;
      const distB = b.nearestStopDist ?? b.distFromRiderLive ?? 999;
      return distA - distB;
    });
  }, [editingEvent, allJobs, reassignOptions, riderRouteReports, shopLocations]);

  // Resources for Day View by Rider Columns
  const riderResources = useMemo(() => {
    const unassignedCount = events.filter(e => !e.riderId).length;
    const list = [
      { id: 'unassigned', title: `⚠️ Unassigned (${unassignedCount})` }
    ];
    filteredRiders.forEach(r => {
      const count = events.filter(e => e.riderId === r.id).length;
      list.push({ id: r.id, title: `🏍️ ${r.nickname || r.name.split(' ')[0]} (${count})` });
    });
    return list;
  }, [filteredRiders, events]);

  // Task Stats for quick pills
  const stats = useMemo(() => {
    let pickups = 0;
    let deliveries = 0;
    let unassigned = 0;
    let completed = 0;

    events.forEach(e => {
      if (e.type === 'pickup') pickups++;
      if (e.type === 'delivery') deliveries++;
      if (!e.riderId) unassigned++;
      const isEventCompleted = e.type === 'pickup' 
        ? !['pending', 'pickup'].includes(e.jobStatus)
        : e.jobStatus === 'completed';
      if (isEventCompleted) completed++;
    });

    return { total: events.length, pickups, deliveries, unassigned, completed };
  }, [events]);

  // Custom Event Styling for react-big-calendar
  const eventStyleGetter = (event: any) => {
    return {
      style: {
        backgroundColor: 'transparent',
        borderRadius: '10px',
        color: 'inherit',
        border: 'none',
        display: 'block',
        fontSize: '11px',
        padding: '1px',
        boxShadow: 'none',
        overflow: 'visible',
      },
    };
  };

  // Custom Event Element: Modern card with clean white/tinted background & sharp typography
  const CustomEvent = ({ event }: any) => {
    const isPickup = event.type === 'pickup';
    const rider = allRiders.find(r => r.id === event.riderId);
    const isEventCompleted = isPickup 
      ? !['pending', 'pickup'].includes(event.jobStatus)
      : event.jobStatus === 'completed';

    return (
      <div
        className={`h-full w-full rounded-xl p-2 leading-tight flex flex-col justify-between overflow-hidden transition-all shadow-xs hover:shadow-md border ${
          isEventCompleted
            ? 'bg-slate-100/90 text-slate-500 border-slate-300 border-l-[4px] border-l-slate-400'
            : isPickup
              ? 'bg-amber-50/95 hover:bg-amber-50 text-slate-800 border-amber-200/90 border-l-[4.5px] border-l-amber-500'
              : 'bg-indigo-50/95 hover:bg-indigo-50 text-slate-800 border-indigo-200/90 border-l-[4.5px] border-l-indigo-600'
        }`}
        title={`${isPickup ? '🚚 [รับผ้า Pickup]' : '📦 [ส่งผ้า Delivery]'} ${event.customerName} - ${event.location} (${format(event.start, 'HH:mm')} - ${format(event.end, 'HH:mm')})`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={`inline-flex items-center gap-1 font-black text-[10px] shrink-0 tracking-tight ${
            isPickup ? 'text-amber-800' : 'text-indigo-800'
          }`}>
            {isPickup ? <Truck size={12} className="text-amber-600" /> : <MapPin size={12} className="text-indigo-600" />}
            <span>{isPickup ? 'รับผ้า' : 'ส่งผ้า'}</span>
            <span className="font-mono text-[9.5px] font-bold text-slate-500 bg-white/90 px-1 py-0.2 rounded border border-slate-200/70 ml-0.5">
              {format(event.start, 'HH:mm')}
            </span>
          </span>

          {rider ? (
            <span 
              className="text-[9px] px-1.5 py-0.5 rounded-md font-bold truncate max-w-[85px] text-white bg-slate-800 shrink-0 shadow-2xs"
            >
              {rider.nickname || rider.name.split(' ')[0]}
            </span>
          ) : (
            <span className="text-[8.5px] px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-300 font-black shrink-0 animate-pulse">
              Unassigned
            </span>
          )}
        </div>

        <div className="font-black text-xs text-slate-900 truncate mt-0.5">
          {event.customerName}
        </div>

        <div className="text-[10px] text-slate-500 truncate font-medium">
          {event.location}
        </div>
      </div>
    );
  };

  // Custom Toolbar Component
  const CustomToolbar = (toolbar: any) => {
    const goToBack = () => toolbar.onNavigate('PREV');
    const goToNext = () => toolbar.onNavigate('NEXT');
    const goToCurrent = () => toolbar.onNavigate('TODAY');

    let titleText = '';
    if (toolbar.view === 'day') {
      titleText = format(toolbar.date, 'EEEE, d MMMM yyyy');
    } else if (toolbar.view === 'week') {
      titleText = `${format(startOfWeek(toolbar.date), 'd MMM')} – ${format(endOfWeek(toolbar.date), 'd MMM yyyy')}`;
    } else if (toolbar.view === 'month') {
      titleText = format(toolbar.date, 'MMMM yyyy');
    } else {
      titleText = `Agenda Schedule • ${format(toolbar.date, 'MMMM yyyy')}`;
    }

    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white dark:bg-slate-850 border-b border-slate-200/90 dark:border-slate-800">
        {/* Navigation & Date */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-750">
            <button
              type="button"
              onClick={goToBack}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              title="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={goToCurrent}
              className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goToNext}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              title="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
              {titleText}
            </h3>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
              {events.length} tasks
            </span>
          </div>
        </div>

        {/* View Switcher: Day, Week, Month, Agenda */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-750">
          {(['day', 'week', 'month', 'agenda'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toolbar.onView(v)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg capitalize transition-all cursor-pointer ${
                toolbar.view === v
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full bg-slate-50/50">
      <style dangerouslySetInnerHTML={{__html: `
        .rbc-time-view, .rbc-month-view, .rbc-agenda-view { border: none !important; }
        .rbc-time-header { border-bottom: 1px solid #e2e8f0; }
        .rbc-header { padding: 10px 0; font-weight: 800; text-transform: uppercase; font-size: 11px; color: #64748b; letter-spacing: 0.05em; }
        .rbc-today { background-color: rgba(99, 102, 241, 0.04) !important; }
        .rbc-time-gutter { font-size: 11px; font-weight: 700; color: #64748b; font-family: monospace; }
        .rbc-timeslot-group { min-height: 52px; border-bottom: 1px solid #f1f5f9 !important; }
        .rbc-time-content { border-top: none; }
        .rbc-day-slot .rbc-time-slot { border-top: 1px dashed #f1f5f9; }
        .rbc-event { 
          overflow: visible !important; 
          border: none !important;
          background: transparent !important;
          min-width: 120px !important;
          transition: transform 0.15s ease, z-index 0.15s ease, box-shadow 0.15s ease;
        }
        .rbc-event:hover {
          z-index: 100 !important;
          transform: scale(1.04);
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25) !important;
          min-width: 200px !important;
        }
        .rbc-event-label { display: none !important; }
        .rbc-event-content { padding: 0 !important; height: 100%; }
        .rbc-agenda-view table.rbc-agenda-table { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .rbc-agenda-view table.rbc-agenda-table thead > tr > th { background-color: #f8fafc; padding: 10px 14px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; }
        .rbc-agenda-view table.rbc-agenda-table tbody > tr > td { padding: 10px 14px; font-size: 12px; border-top: 1px solid #f1f5f9; }
      `}} />

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Modern Top Filter & Control Header */}
        <div className="p-4 border-b border-slate-200/90 bg-white flex flex-col gap-3 shrink-0 shadow-2xs">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Title & Quick Stats Pills */}
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <CalendarIcon className="text-indigo-600" size={20} />
                  Task Schedule Calendar
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  ตารางเวลาและกำหนดการรับ-ส่งผ้าของไรเดอร์ (จัดสรรและโยกงานแบบเรียลไทม์)
                </p>
              </div>

              {/* Task Type Filter Pills */}
              <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setTaskTypeFilter("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    taskTypeFilter === "all"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All ({stats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskTypeFilter("pickup")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    taskTypeFilter === "pickup"
                      ? "bg-amber-500 text-white shadow-2xs"
                      : "text-amber-800 hover:bg-amber-50"
                  }`}
                >
                  <Truck size={12} />
                  <span>Pickups ({stats.pickups})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskTypeFilter("delivery")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    taskTypeFilter === "delivery"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "text-indigo-800 hover:bg-indigo-50"
                  }`}
                >
                  <MapPin size={12} />
                  <span>Deliveries ({stats.deliveries})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskTypeFilter("unassigned")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    taskTypeFilter === "unassigned"
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "text-rose-700 hover:bg-rose-50"
                  }`}
                >
                  <AlertCircle size={12} />
                  <span>Unassigned ({stats.unassigned})</span>
                </button>
              </div>
            </div>

            {/* Right: Area Select + Search Box + Show Completed */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Box */}
              <div className="relative w-48 sm:w-56">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customer, room..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Area Select */}
              <select
                className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 disabled:opacity-75 disabled:cursor-not-allowed"
                value={effectiveArea}
                disabled={isAreaRestricted}
                onChange={(e) => {
                  if (isAreaRestricted) return;
                  setFilterArea(e.target.value);
                  setSelectedRiderIds(new Set());
                }}
              >
                {!isAreaRestricted && <option value="ALL">🏢 All Areas</option>}
                {(!isAreaRestricted || userArea === "BKK") && <option value="BKK">📍 Bangkok (BKK)</option>}
                {(!isAreaRestricted || userArea === "PTY") && <option value="PTY">📍 Pattaya (PTY)</option>}
                {isAreaRestricted && userArea && userArea !== "BKK" && userArea !== "PTY" && (
                  <option value={userArea}>
                    {shopLocations.filter(s => allowedBranchIds.has(s.id)).map(s => s.name).join(", ") || userArea}
                  </option>
                )}
              </select>

              {/* Show Completed Toggle */}
              <Label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors shrink-0">
                <input 
                  type="checkbox"
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4 cursor-pointer"
                  checked={showCompleted} 
                  onChange={(e) => setShowCompleted(e.target.checked)}
                />
                <span className="text-xs font-bold text-slate-700">Completed ({stats.completed})</span>
              </Label>
            </div>
          </div>

          {/* Rider Filter Strip & Route Optimization Summary */}
          <div className="flex flex-col gap-2.5 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 overflow-x-auto hide-scrollbar py-1 flex-1">
                <span className="text-sm font-black uppercase tracking-wider text-slate-500 shrink-0 mr-1 flex items-center gap-1.5">
                  <Truck size={17} className="text-indigo-600" />
                  Riders:
                </span>
                <Button 
                  variant={selectedRiderIds.size === filteredRiders.length && filteredRiders.length > 0 ? "default" : "outline"} 
                  size="sm" 
                  onClick={toggleAllRiders} 
                  className="h-9 text-xs sm:text-sm font-black rounded-xl px-4 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 cursor-pointer shadow-2xs"
                >
                  All Riders ({filteredRiders.length})
                </Button>

                {filteredRiders.map(rider => {
                  const isSelected = selectedRiderIds.has(rider.id);
                  const riderActiveTasks = events.filter(e => e.riderId === rider.id).length;
                  const riderReport = riderRouteReports.find(r => r.rider.id === rider.id);
                  return (
                    <div 
                      key={rider.id}
                      onClick={() => toggleRider(rider.id)}
                      className={`inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-2xl border transition-all shrink-0 cursor-pointer shadow-2xs ${
                        isSelected 
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold ring-2 ring-indigo-400/25' 
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: getRiderColor(rider.id) }} />
                      <img src={rider.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-100 border border-slate-200" />
                      
                      {/* Name & Task Count */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-slate-900">{rider.nickname || rider.name.split(' ')[0]}</span>
                        <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono font-black border border-slate-200/60">
                          {riderActiveTasks}
                        </span>
                      </div>

                      {/* Route Optimization Badge */}
                      {riderReport && riderReport.tasksCount > 0 ? (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveReportRiderId(rider.id);
                            setShowRouteReportModal(true);
                          }}
                          title={`${rider.name}: Optimized ${riderReport.optimizedKm} km (Scheduled ${riderReport.chronologicalKm} km) - Saved ${riderReport.savedKm} km (~${riderReport.savedMinutes}m). Click for stop sequence.`}
                          className={`inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-xl border transition-all hover:scale-105 cursor-pointer ${
                            riderReport.savedKm > 0
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-2xs'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          }`}
                        >
                          <Route size={14} className={riderReport.savedKm > 0 ? "text-emerald-600" : "text-indigo-600"} />
                          <span className="text-xs font-black">{riderReport.optimizedKm} km</span>
                          {riderReport.savedKm > 0 ? (
                            <span className="text-[11px] text-emerald-700 font-black bg-emerald-100 px-1.5 py-0.2 rounded-md border border-emerald-200">
                              -{riderReport.savedKm}km
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Route Optimization Efficiency Report Trigger */}
              <button
                type="button"
                onClick={() => {
                  setActiveReportRiderId(filteredRiders[0]?.id || null);
                  setShowRouteReportModal(true);
                }}
                className="h-9 px-4 text-xs sm:text-sm rounded-2xl font-black bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-indigo-500/15 hover:from-emerald-500/25 hover:to-indigo-500/25 border border-emerald-300 text-emerald-950 flex items-center gap-2 cursor-pointer shadow-2xs transition-all shrink-0"
              >
                <Sparkles size={16} className="text-emerald-600 animate-pulse" />
                <span>Rider Route Report</span>
                <span className="bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-lg shadow-2xs">
                  {teamOptimizationTotals.totalSavedKm > 0 
                    ? `Saved ${teamOptimizationTotals.totalSavedKm} km (~${teamOptimizationTotals.totalSavedMins}m)` 
                    : `${teamOptimizationTotals.totalOptKm} km total`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modern Rounded Calendar Wrapper */}
        <div className="flex-1 p-3 sm:p-4 bg-white m-3 sm:m-4 rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
          <DnDCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            date={currentDate}
            onNavigate={(date: Date) => setCurrentDate(date)}
            view={currentView}
            onView={(view: any) => setCurrentView(view)}
            views={['day', 'week', 'month', 'agenda']}
            resources={currentView === 'day' && dayViewMode === 'rider' ? riderResources : undefined}
            resourceIdAccessor={(r: any) => r.id}
            resourceTitleAccessor={(r: any) => r.title}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            onSelectEvent={onSelectEvent}
            eventPropGetter={eventStyleGetter}
            dayLayoutAlgorithm="overlap"
            components={{
              toolbar: CustomToolbar,
              event: CustomEvent,
            }}
            resizable={true}
            step={30}
            timeslots={2}
            min={new Date(new Date().setHours(8, 0, 0, 0))}
            max={new Date(new Date().setHours(21, 0, 0, 0))}
            formats={{
              timeGutterFormat: 'HH:mm',
              eventTimeRangeFormat: ({ start, end }: any, culture: any, local: any) =>
                `${local.format(start, 'HH:mm', culture)} - ${local.format(end, 'HH:mm', culture)}`,
              agendaTimeRangeFormat: ({ start, end }: any, culture: any, local: any) =>
                `${local.format(start, 'HH:mm', culture)} - ${local.format(end, 'HH:mm', culture)}`,
              dayHeaderFormat: 'EEEE, MMM d, yyyy',
            }}
            className="font-sans flex-1"
          />
        </div>
      </div>
      {/* Edit Modal */}
      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingEvent?.type === 'pickup' ? <Truck size={18} className="text-amber-500" /> : <MapPin size={18} className="text-indigo-500" />}
              Reassign Rider (โยกงาน)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 relative">
              <p className="text-sm font-medium text-slate-900 pr-24">{editingEvent?.title}</p>
              <Button 
                variant="outline" 
                size="sm"
                className="absolute top-2 right-2 text-[10px] h-6 px-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                onClick={() => {
                  if (onEditJob && editingEvent) {
                    const fullJob = allJobs.find(j => j.id === editingEvent.jobId);
                    if (fullJob) {
                      setEditingEvent(null);
                      onEditJob(fullJob);
                    }
                  } else {
                    setViewJobId(editingEvent?.jobId || null);
                  }
                }}
              >
                View Details
              </Button>
              <p className="text-xs text-slate-500 mt-1">Scheduled: {editingEvent?.start && format(editingEvent.start, 'MMM d, yyyy HH:mm')}</p>
              <p className="text-xs text-slate-400 mt-1 italic">Tip: You can drag and drop the event on the calendar to change its time.</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <User size={14} className="text-slate-500" />
                Assign to Rider
              </Label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                value={editRiderId}
                onChange={(e) => setEditRiderId(e.target.value)}
              >
                <option value="">-- Unassigned --</option>
                {reassignOptions.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.isActive === false ? "(Resigned / ลาออกแล้ว)" : `(${r.status})`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="sm:justify-between flex-row gap-2">
            <Button variant="outline" onClick={handleDuplicateJob} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
              <Copy size={14} className="mr-2" /> Duplicate Job
            </Button>
            <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button variant="outline" onClick={() => setEditingEvent(null)} className="cursor-pointer">Cancel</Button>
              <Button onClick={handleSaveEdit} className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">Save Changes</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewJobId} onOpenChange={(v) => !v && setViewJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8 z-[60]">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {viewJobId && allJobs.find((j) => j.id === viewJobId) && (
            <AdminTaskTracker job={allJobs.find((j) => j.id === viewJobId)!} readOnly />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
