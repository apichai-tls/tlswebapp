"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useRiders } from "@/lib/use-riders";
import { jobStore, shopStore, type Job, type LatLng, type Rider } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { getUserAssignedBranchIds } from "@/components/branch-filter-dropdown";
import { useSyncExternalStore } from "react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Truck,
  MapPin,
  User,
  Copy,
  Calendar as CalendarIcon,
  LayoutGrid,
  Navigation,
  Clock,
  Package,
  Zap,
  Eye,
  EyeOff,
  Search,
  X,
  ArrowRightLeft,
  Sparkles,
  Route,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { optimizeRiderRoute, calculateEstimatedDistanceKm } from "@/lib/route-optimizer";

import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, getDay, addMinutes, isSameDay } from 'date-fns';
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
  tooltip?: string;
  customerName?: string;
  location?: string;
  coords?: LatLng;
  start: Date;
  end: Date;
  riderId?: string;
  jobStatus: string;
}

interface ExpressBadgeInfo {
  isExpress: boolean;
  label: string;
  is100: boolean;
}

interface BoardTaskItem {
  taskId: string;
  job: Job;
  legType: 'pickup' | 'delivery';
  riderId: string | null;
  scheduledAt: Date;
  targetLocation: string;
  targetCoords?: LatLng | null;
  stopNumber?: number;
  distanceFromPrevKm?: number;
  expressInfo?: ExpressBadgeInfo | null;
}

interface RiderRouteDelta {
  mode: "preview_add" | "preview_remove" | "committed";
  deltaKm: number;
  deltaMinutes: number;
  beforeKm: number;
  afterKm: number;
  beforeMinutes: number;
  afterMinutes: number;
  insertedStopNumber?: number;
  timestamp: number;
}

function isValidLatLng(c?: LatLng | null): c is LatLng {
  return Boolean(c && typeof c.lat === "number" && typeof c.lng === "number" && c.lat !== 0 && c.lng !== 0);
}

/**
 * Extract Express service speed info from Job (supports serviceSpeed field + remark tags)
 */
function getJobExpressInfo(job: Job): ExpressBadgeInfo | null {
  const speed = (job.serviceSpeed || "").toLowerCase();
  const remark = job.remark || "";

  if (speed === "express_100" || /express\s*100%/i.test(remark)) {
    return { isExpress: true, label: "EXP 100%", is100: true };
  }
  if (speed === "express_50" || /express\s*50%/i.test(remark)) {
    return { isExpress: true, label: "EXP 50%", is100: false };
  }
  const matchRemark = /express\s*(\d+%)/i.exec(remark);
  if (matchRemark) {
    const pct = matchRemark[1];
    return { isExpress: true, label: `EXP ${pct}`, is100: pct === "100%" };
  }
  if (speed && speed !== "standard" && speed.includes("express")) {
    return { isExpress: true, label: "EXPRESS", is100: false };
  }
  return null;
}

/**
 * Format minutes into a compact readable string, e.g. "35m" or "1h 25m"
 */
function formatDurationMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format signed minutes delta, e.g. "+12 นาที" or "-8 นาที"
 */
function formatSignedMinutes(deltaMinutes: number): string {
  const rounded = Math.round(deltaMinutes);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded} นาที`;
}

/**
 * Format signed km delta, e.g. "+2.4 km" or "-1.8 km"
 */
function formatSignedKm(deltaKm: number): string {
  const rounded = Math.round(deltaKm * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded} km`;
}

export const AdminDispatch = React.memo(function AdminDispatch({ onEditJob }: { onEditJob?: (job: Job) => void }) {
  const allJobs = useJobs();
  const allRiders = useRiders();
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  
  const isAreaRestricted = Boolean(user && user.role !== 'admin' && ((user.area && user.area !== 'ALL') || (user.branchId && user.branchId !== 'all' && user.branchId !== 'ALL')));
  const allowedBranchIds = useMemo(() => new Set(getUserAssignedBranchIds(user, shopLocations)), [user, shopLocations]);
  const userArea = (user?.area && user.area !== 'ALL') ? user.area : (user?.branchId && user.branchId !== 'all' ? user.branchId : null);

  const [filterArea, setFilterArea] = useState<string>(() => userArea || "ALL");

  useEffect(() => {
    if (userArea) {
      setFilterArea(userArea);
    }
  }, [userArea]);

  const effectiveArea = isAreaRestricted && userArea ? userArea : filterArea;
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  // Default to "calendar" (Schedule Calendar on Left, Rider Route Board on Right)
  const [dispatchTab, setDispatchTab] = useState<"calendar" | "board">("calendar");
  const [showOfflineRiders, setShowOfflineRiders] = useState(false);
  const [boardSortMode, setBoardSortMode] = useState<"optimized" | "time">("optimized");
  const [boardDateScope, setBoardDateScope] = useState<"today" | "all_active">("today");
  const [boardLegFilter, setBoardLegFilter] = useState<"all" | "pickup" | "delivery">("all");
  const [boardSearch, setBoardSearch] = useState("");
  const [draggedTask, setDraggedTask] = useState<BoardTaskItem | null>(null);
  const draggedTaskRef = useRef<BoardTaskItem | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [isReassigningTask, setIsReassigningTask] = useState<string | null>(null);
  const [recentRiderDeltas, setRecentRiderDeltas] = useState<Record<string, RiderRouteDelta>>({});
  
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showRouteReportModal, setShowRouteReportModal] = useState(false);
  const [activeReportRiderId, setActiveReportRiderId] = useState<string | null>(null);
  const [editRiderId, setEditRiderId] = useState<string>("");
  const [viewJobId, setViewJobId] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<any>('day');

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

  // Clear recent delta badges after 10 seconds
  useEffect(() => {
    const keys = Object.keys(recentRiderDeltas);
    if (keys.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setRecentRiderDeltas(prev => {
        const next: Record<string, RiderRouteDelta> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.timestamp < 10000) {
            next[k] = v;
          }
        }
        return next;
      });
    }, 10500);
    return () => clearTimeout(timer);
  }, [recentRiderDeltas]);

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

  // Helper to resolve rider origin coordinates (Live GPS -> Branch -> Regional BKK/PTY default)
  const getRiderOriginCoords = React.useCallback(
    (rider: Rider): LatLng => {
      const branchObj = rider.branchId ? shopLocations.find(s => s.id === rider.branchId) : null;
      const hasValidBranchCoords = isValidLatLng(branchObj?.coords);
      const isPattayaRider =
        (branchObj?.area || "").toUpperCase() === "PTY" ||
        (branchObj?.name || "").toLowerCase().includes("pattaya") ||
        (rider.branchId || "").toLowerCase().includes("pty");
      const defaultRegionalCoords: LatLng = isPattayaRider
        ? { lat: 12.9236, lng: 100.8825 }
        : { lat: 13.736717, lng: 100.523186 };

      const hasValidLiveGps = isValidLatLng(rider.currentLocation);
      return hasValidLiveGps
        ? rider.currentLocation!
        : hasValidBranchCoords
          ? branchObj!.coords
          : defaultRegionalCoords;
    },
    [shopLocations]
  );

  // Helper to evaluate a rider's route distance & estimated time (driving + stop service time)
  const evaluateRiderTasksMetrics = React.useCallback(
    (rider: Rider, tasks: BoardTaskItem[]) => {
      if (tasks.length === 0) {
        return {
          displayTasks: [] as BoardTaskItem[],
          optimizedDistanceKm: 0,
          chronoDistanceKm: 0,
          activeDistanceKm: 0,
          savedKm: 0,
          estimatedMinutes: 0,
          googleMapsUrl: "",
        };
      }

      const rawTasks = [...tasks].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      const riderOrigin = getRiderOriginCoords(rider);
      const optimized = optimizeRiderRoute(riderOrigin, rawTasks, riderOrigin);

      let chronoKm = 0;
      let prev = riderOrigin;
      const chronoItems: BoardTaskItem[] = rawTasks.map((t, idx) => {
        const coords = isValidLatLng(t.targetCoords) ? t.targetCoords : prev;
        const dist = calculateEstimatedDistanceKm(prev, coords);
        chronoKm = Math.round((chronoKm + dist) * 10) / 10;
        prev = coords;
        return {
          ...t,
          stopNumber: idx + 1,
          distanceFromPrevKm: dist,
        };
      });

      const savedKm = Math.max(0, Math.round((chronoKm - optimized.totalDistanceKm) * 10) / 10);
      const displayTasks: BoardTaskItem[] =
        boardSortMode === "optimized" && optimized.orderedTasks.length > 0
          ? optimized.orderedTasks.map(it => ({
              ...it.task,
              stopNumber: it.stopNumber,
              distanceFromPrevKm: it.distanceFromPrevKm,
            }))
          : chronoItems;

      const activeDistanceKm = boardSortMode === "optimized" ? optimized.totalDistanceKm : chronoKm;

      // Estimate total duration: ~2.4 min per km urban driving + 6 min per building stop (or 2 min if same building)
      let stopServiceMinutes = 0;
      displayTasks.forEach((t, idx) => {
        if (idx > 0 && t.distanceFromPrevKm === 0) {
          stopServiceMinutes += 2;
        } else {
          stopServiceMinutes += 6;
        }
      });
      const drivingMinutes = activeDistanceKm * 2.4;
      const estimatedMinutes = Math.round(drivingMinutes + stopServiceMinutes);

      return {
        displayTasks,
        optimizedDistanceKm: optimized.totalDistanceKm,
        chronoDistanceKm: chronoKm,
        activeDistanceKm,
        savedKm,
        estimatedMinutes,
        googleMapsUrl: optimized.googleMapsUrl,
      };
    },
    [getRiderOriginCoords, boardSortMode]
  );

  // Build all active tasks (both today and overdue) so we can show counts and filter cleanly
  const { activeBoardTasks, reportBoardTasks, todayTaskCount, allActiveTaskCount } = useMemo(() => {
    let jobs = allJobs.filter(j => !["cancel", "completed", "delivered", "tba"].includes(j.status));

    if (effectiveArea !== "ALL") {
      jobs = jobs.filter(j => {
        const branch = shopLocations.find(s => s.id === j.branchId);
        if (isAreaRestricted && shopLocations.length > 0) {
          return Boolean(j.branchId && allowedBranchIds.has(j.branchId));
        }
        return (branch?.area || '').toUpperCase() === effectiveArea.toUpperCase() || j.branchId === effectiveArea;
      });
    }

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const allCandidateTasks: (BoardTaskItem & { isToday: boolean })[] = [];

    jobs.forEach(j => {
      const expressInfo = getJobExpressInfo(j);
      const rawPLat = Number((j as any).pickupLat ?? j.pickupCoords?.lat ?? (j as any).customer?.lat ?? 0);
      const rawPLng = Number((j as any).pickupLng ?? j.pickupCoords?.lng ?? (j as any).customer?.lng ?? 0);
      const rawDLat = Number((j as any).dropoffLat ?? j.dropoffCoords?.lat ?? (j as any).customer?.lat ?? 0);
      const rawDLng = Number((j as any).dropoffLng ?? j.dropoffCoords?.lng ?? (j as any).customer?.lng ?? 0);

      const resolvedPickupCoords: LatLng | null =
        rawPLat !== 0 && rawPLng !== 0
          ? { lat: rawPLat, lng: rawPLng }
          : isValidLatLng(j.pickupCoords)
            ? j.pickupCoords
            : null;
      const resolvedDropoffCoords: LatLng | null =
        rawDLat !== 0 && rawDLng !== 0
          ? { lat: rawDLat, lng: rawDLng }
          : isValidLatLng(j.dropoffCoords)
            ? j.dropoffCoords
            : null;

      const validPickupCoords = resolvedPickupCoords || resolvedDropoffCoords;
      const validDropoffCoords = resolvedDropoffCoords || resolvedPickupCoords;

      // 1. Check active Pickup leg (only if pickup has NOT been completed yet)
      if (j.type === "pickup" || j.type === "full_service") {
        const isPickupActive = ["pending", "accepted", "pickup"].includes(j.status);
        const isPickupDone = ["picked_up", "billing", "active", "ready_to_wash", "washed", "delivery", "completed", "cancel"].includes(j.status);
        if (isPickupActive && !isPickupDone) {
          const sched = j.pickupScheduledAt ? new Date(j.pickupScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date(j.createdAt));
          if (sched <= todayEnd) {
            const assignedRiderId = j.pickupRiderId || j.riderId || null;
            allCandidateTasks.push({
              taskId: `${j.id}-pickup`,
              job: j,
              legType: "pickup",
              riderId: assignedRiderId,
              scheduledAt: sched,
              targetLocation: j.pickupLocation || j.dropoffLocation || "-",
              targetCoords: validPickupCoords,
              expressInfo,
              isToday: isSameDay(sched, now) || Boolean(assignedRiderId),
            });
          }
        }
      }

      // 2. Check active Delivery leg (only if delivery has NOT been completed yet and scheduled <= todayEnd)
      if (j.type === "delivery" || j.type === "full_service" || Boolean(j.deliveryRiderId)) {
        let isDeliveredStage = false;
        if (j.status === "delivery" && j.adminNotesJson) {
          try {
            const parsed = JSON.parse(j.adminNotesJson);
            if (parsed?.kanbanStage === "delivered") isDeliveredStage = true;
          } catch {}
        }
        const isDeliveryDone =
          ["delivered", "completed", "cancel"].includes(j.status) ||
          isDeliveredStage ||
          j.legs?.deliveryOutbound?.status === "completed";
        const isPickupCompletedForFullService = ["picked_up", "billing", "active", "ready_to_wash", "washed", "delivery"].includes(j.status);
        const isSameDayPreAssignedOrExpress =
          ["pending", "accepted", "pickup"].includes(j.status) &&
          (Boolean(j.deliveryRiderId) || Boolean(expressInfo?.isExpress));
        const isDeliveryActive =
          (j.type === "delivery"
            ? ["pending", "accepted", "picked_up", "billing", "active", "ready_to_wash", "washed", "delivery"].includes(j.status)
            : isPickupCompletedForFullService || isSameDayPreAssignedOrExpress) && !j.isStuck;

        if (isDeliveryActive && !isDeliveryDone) {
          const sched = j.deliveryScheduledAt ? new Date(j.deliveryScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date(j.createdAt));
          if (sched <= todayEnd) {
            const assignedRiderId = j.deliveryRiderId || null;
            allCandidateTasks.push({
              taskId: `${j.id}-delivery`,
              job: j,
              legType: "delivery",
              riderId: assignedRiderId,
              scheduledAt: sched,
              targetLocation: j.dropoffLocation || j.pickupLocation || "-",
              targetCoords: validDropoffCoords,
              expressInfo,
              isToday: isSameDay(sched, now) || Boolean(assignedRiderId),
            });
          }
        }
      }
    });

    const scopedTasks = allCandidateTasks.filter(t => (boardDateScope === "today" ? t.isToday : true));
    const riderFilteredTasks = allCandidateTasks.filter(
      t => selectedRiderIds.size === 0 || !t.riderId || selectedRiderIds.has(t.riderId)
    );

    const tCount = riderFilteredTasks.filter(t => t.isToday).length;
    const aCount = riderFilteredTasks.length;

    const searchLower = boardSearch.trim().toLowerCase();
    const filtered = riderFilteredTasks
      .filter(t => (boardDateScope === "today" ? t.isToday : true))
      .filter(t => (boardLegFilter === "all" ? true : t.legType === boardLegFilter))
      .filter(t => {
        if (!searchLower) return true;
        return (
          (t.job.customerName || "").toLowerCase().includes(searchLower) ||
          t.job.id.toLowerCase().includes(searchLower) ||
          (t.targetLocation || "").toLowerCase().includes(searchLower) ||
          (t.expressInfo?.label || "").toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    return {
      activeBoardTasks: filtered,
      reportBoardTasks: scopedTasks,
      todayTaskCount: tCount,
      allActiveTaskCount: aCount,
    };
  }, [allJobs, effectiveArea, shopLocations, isAreaRestricted, allowedBranchIds, selectedRiderIds, boardDateScope, boardLegFilter, boardSearch]);

  // Group tasks by riderId + compute Auto Route & Live Drag Preview Deltas per rider
  const boardColumnsData = useMemo(() => {
    const unassignedTasks = activeBoardTasks
      .filter(t => !t.riderId)
      .sort((a, b) => {
        const aExp = a.expressInfo?.isExpress ? (a.expressInfo.is100 ? 2 : 1) : 0;
        const bExp = b.expressInfo?.isExpress ? (b.expressInfo.is100 ? 2 : 1) : 0;
        if (aExp !== bExp) return bExp - aExp;
        return a.scheduledAt.getTime() - b.scheduledAt.getTime();
      });
    const tasksByRider = new Map<string, BoardTaskItem[]>();

    filteredRiders.forEach(r => tasksByRider.set(r.id, []));
    activeBoardTasks.forEach(t => {
      if (t.riderId) {
        const list = tasksByRider.get(t.riderId) || [];
        list.push(t);
        tasksByRider.set(t.riderId, list);
      }
    });

    const visibleRiders = filteredRiders.filter(r => {
      if (selectedRiderIds.size > 0 && !selectedRiderIds.has(r.id)) return false;
      const riderTasks = tasksByRider.get(r.id) || [];
      const isOnlineOrBusy = r.status === "online" || r.status === "busy";
      return isOnlineOrBusy || riderTasks.length > 0 || showOfflineRiders;
    });

    const hiddenOfflineCount = filteredRiders.filter(r => {
      if (selectedRiderIds.size > 0 && !selectedRiderIds.has(r.id)) return false;
      const riderTasks = tasksByRider.get(r.id) || [];
      const isOnlineOrBusy = r.status === "online" || r.status === "busy";
      return !isOnlineOrBusy && riderTasks.length === 0;
    }).length;

    const riderColumns = visibleRiders.map(rider => {
      const rawTasks = (tasksByRider.get(rider.id) || []).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
      const baseMetrics = evaluateRiderTasksMetrics(rider, rawTasks);

      // Compute Live Drag Preview Delta when dragging a task over a rider box
      let previewDelta: RiderRouteDelta | null = null;
      if (draggedTask && dragOverColumnId) {
        const isHoveredTargetCol = dragOverColumnId === rider.id && draggedTask.riderId !== rider.id;
        const isSourceColWhileHoveringOther = draggedTask.riderId === rider.id && dragOverColumnId !== rider.id;

        if (isHoveredTargetCol) {
          const hypoTasks = [...rawTasks, { ...draggedTask, riderId: rider.id }];
          const hypoMetrics = evaluateRiderTasksMetrics(rider, hypoTasks);
          const insertedItem = hypoMetrics.displayTasks.find(t => t.taskId === draggedTask.taskId);
          previewDelta = {
            mode: "preview_add",
            deltaKm: Math.round((hypoMetrics.activeDistanceKm - baseMetrics.activeDistanceKm) * 10) / 10,
            deltaMinutes: hypoMetrics.estimatedMinutes - baseMetrics.estimatedMinutes,
            beforeKm: baseMetrics.activeDistanceKm,
            afterKm: hypoMetrics.activeDistanceKm,
            beforeMinutes: baseMetrics.estimatedMinutes,
            afterMinutes: hypoMetrics.estimatedMinutes,
            insertedStopNumber: insertedItem?.stopNumber,
            timestamp: Date.now(),
          };
        } else if (isSourceColWhileHoveringOther) {
          const hypoTasks = rawTasks.filter(t => t.taskId !== draggedTask.taskId);
          const hypoMetrics = evaluateRiderTasksMetrics(rider, hypoTasks);
          previewDelta = {
            mode: "preview_remove",
            deltaKm: Math.round((hypoMetrics.activeDistanceKm - baseMetrics.activeDistanceKm) * 10) / 10,
            deltaMinutes: hypoMetrics.estimatedMinutes - baseMetrics.estimatedMinutes,
            beforeKm: baseMetrics.activeDistanceKm,
            afterKm: hypoMetrics.activeDistanceKm,
            beforeMinutes: baseMetrics.estimatedMinutes,
            afterMinutes: hypoMetrics.estimatedMinutes,
            timestamp: Date.now(),
          };
        }
      }

      const pickupCount = rawTasks.filter(t => t.legType === "pickup").length;
      const deliveryCount = rawTasks.filter(t => t.legType === "delivery").length;

      return {
        rider,
        rawTasks,
        displayTasks: baseMetrics.displayTasks,
        pickupCount,
        deliveryCount,
        optimizedDistanceKm: baseMetrics.optimizedDistanceKm,
        chronoDistanceKm: baseMetrics.chronoDistanceKm,
        activeDistanceKm: baseMetrics.activeDistanceKm,
        savedKm: baseMetrics.savedKm,
        estimatedMinutes: baseMetrics.estimatedMinutes,
        googleMapsUrl: baseMetrics.googleMapsUrl,
        previewDelta,
      };
    });

    riderColumns.sort((a, b) => {
      const aActive = a.rider.status === "online" || a.rider.status === "busy" ? 1 : 0;
      const bActive = b.rider.status === "online" || b.rider.status === "busy" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      if (a.rawTasks.length !== b.rawTasks.length) return b.rawTasks.length - a.rawTasks.length;
      return a.rider.name.localeCompare(b.rider.name);
    });

    return {
      unassignedTasks,
      riderColumns,
      hiddenOfflineCount,
    };
  }, [activeBoardTasks, filteredRiders, selectedRiderIds, showOfflineRiders, evaluateRiderTasksMetrics, draggedTask, dragOverColumnId]);

  const handleStartDragTask = (e: React.DragEvent, task: BoardTaskItem) => {
    draggedTaskRef.current = task;
    try {
      e.dataTransfer.setData("text/plain", task.taskId);
      e.dataTransfer.effectAllowed = "move";
    } catch {}
    requestAnimationFrame(() => {
      setDraggedTask(task);
    });
  };

  const handleEndDragTask = () => {
    draggedTaskRef.current = null;
    setDraggedTask(null);
    setDragOverColumnId(null);
  };

  const handleReassignTaskToRider = async (task: BoardTaskItem, targetRiderId: string | null) => {
    const normalizedTarget = targetRiderId || "";
    const currentNormalized = task.riderId || "";
    if (normalizedTarget === currentNormalized) return;

    const nowTs = Date.now();
    const newDeltas: Record<string, RiderRouteDelta> = {};

    if (currentNormalized) {
      const sourceCol = boardColumnsData.riderColumns.find(c => c.rider.id === currentNormalized);
      if (sourceCol) {
        const afterTasks = sourceCol.rawTasks.filter(t => t.taskId !== task.taskId);
        const afterMetrics = evaluateRiderTasksMetrics(sourceCol.rider, afterTasks);
        newDeltas[currentNormalized] = {
          mode: "committed",
          deltaKm: Math.round((afterMetrics.activeDistanceKm - sourceCol.activeDistanceKm) * 10) / 10,
          deltaMinutes: afterMetrics.estimatedMinutes - sourceCol.estimatedMinutes,
          beforeKm: sourceCol.activeDistanceKm,
          afterKm: afterMetrics.activeDistanceKm,
          beforeMinutes: sourceCol.estimatedMinutes,
          afterMinutes: afterMetrics.estimatedMinutes,
          timestamp: nowTs,
        };
      }
    }

    if (normalizedTarget) {
      const targetCol = boardColumnsData.riderColumns.find(c => c.rider.id === normalizedTarget);
      if (targetCol) {
        const afterTasks = [...targetCol.rawTasks, { ...task, riderId: normalizedTarget }];
        const afterMetrics = evaluateRiderTasksMetrics(targetCol.rider, afterTasks);
        const insertedItem = afterMetrics.displayTasks.find(t => t.taskId === task.taskId);
        newDeltas[normalizedTarget] = {
          mode: "committed",
          deltaKm: Math.round((afterMetrics.activeDistanceKm - targetCol.activeDistanceKm) * 10) / 10,
          deltaMinutes: afterMetrics.estimatedMinutes - targetCol.estimatedMinutes,
          beforeKm: targetCol.activeDistanceKm,
          afterKm: afterMetrics.activeDistanceKm,
          beforeMinutes: targetCol.estimatedMinutes,
          afterMinutes: afterMetrics.estimatedMinutes,
          insertedStopNumber: insertedItem?.stopNumber,
          timestamp: nowTs,
        };
      }
    }

    setIsReassigningTask(task.taskId);
    try {
      if (task.legType === "pickup") {
        await jobStore.assignPickupRider(task.job.id, normalizedTarget, task.scheduledAt);
      } else {
        await jobStore.assignDeliveryRider(task.job.id, normalizedTarget, task.scheduledAt);
      }
      if (Object.keys(newDeltas).length > 0) {
        setRecentRiderDeltas(prev => ({ ...prev, ...newDeltas }));
      }
      const targetRider = allRiders.find(r => r.id === normalizedTarget);
      const targetName = targetRider ? (targetRider.nickname || targetRider.name) : "Unassigned";
      const targetDelta = normalizedTarget ? newDeltas[normalizedTarget] : null;
      const deltaSummary = targetDelta
        ? ` (${formatSignedKm(targetDelta.deltaKm)} / ${formatSignedMinutes(targetDelta.deltaMinutes)})`
        : "";
      toast.success(`Moved ${task.legType === "pickup" ? "Pickup" : "Delivery"} #${task.job.id} ➔ ${targetName}${deltaSummary}`);
    } catch {
      toast.error("Failed to reassign rider");
    } finally {
      setIsReassigningTask(null);
    }
  };

  // Filter & Map Jobs to Events
  const events = useMemo(() => {
    let jobs = allJobs.filter(j => j.status !== "pending" && j.status !== "cancel" && j.status !== "tba");
    
    if (effectiveArea !== "ALL") {
      jobs = jobs.filter(j => {
        const branch = shopLocations.find(s => s.id === j.branchId);
        if (isAreaRestricted && shopLocations.length > 0) {
          return Boolean(j.branchId && allowedBranchIds.has(j.branchId));
        }
        return (branch?.area || '').toUpperCase() === effectiveArea.toUpperCase() || j.branchId === effectiveArea;
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
      const custName = job.customerName || (job as any).customer?.name || 'Guest';
      const pickupLoc = job.pickupLocation || (job as any).customer?.address || '-';
      const dropoffLoc = job.dropoffLocation || job.pickupLocation || (job as any).customer?.address || '-';

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

      if (job.type === 'pickup' || job.type === 'full_service') {
        if (selectedRiderIds.size === 0 || !job.pickupRiderId || selectedRiderIds.has(job.pickupRiderId)) {
          const pStart = new Date(job.pickupScheduledAt || job.scheduledAt || job.createdAt);
          const pEnd = job.pickupScheduledEndAt ? new Date(job.pickupScheduledEndAt) : addMinutes(pStart, 30);
          calendarEvents.push({
            id: `${job.id}-pickup`,
            jobId: job.id,
            type: 'pickup',
            title: `[รับผ้า] ${custName} (${pickupLoc})`,
            tooltip: `🚚 [รับผ้า Pickup] ${custName} - ${pickupLoc} (${format(pStart, 'HH:mm')} - ${format(pEnd, 'HH:mm')})`,
            customerName: custName,
            location: pickupLoc,
            coords: pCoords,
            start: pStart,
            end: pEnd,
            riderId: job.pickupRiderId,
            jobStatus: job.status,
          });
        }
      }

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
              title: `[ส่งผ้า] ${custName} (${dropoffLoc})`,
              tooltip: `📦 [ส่งผ้า Delivery] ${custName} - ${dropoffLoc} (${format(dStart, 'HH:mm')} - ${format(dEnd, 'HH:mm')})`,
              customerName: custName,
              location: dropoffLoc,
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

  // Route Optimization calculation for each active rider (strictly using active uncompleted tasks for Today / selected scope)
  const riderRouteReports = useMemo(() => {
    return filteredRiders.map(rider => {
      const riderBranch = shopLocations.find(s => s.id === rider.branchId);
      const origin: LatLng = getRiderOriginCoords(rider);

      const riderTasks = reportBoardTasks
        .filter(t => t.riderId === rider.id)
        .map(t => {
          const custName = t.job.customerName || (t.job as any).customer?.name || 'Customer';
          const loc = t.targetLocation || '-';
          return {
            id: t.taskId,
            jobId: t.job.id,
            legType: t.legType,
            job: { id: t.job.id },
            targetCoords: isValidLatLng(t.targetCoords) ? t.targetCoords : origin,
            title: `[${t.legType === 'pickup' ? 'รับผ้า' : 'ส่งผ้า'}] ${custName} (${loc})`,
            customerName: custName,
            location: loc,
            scheduledTime: t.scheduledAt,
          };
        });

      const sortedChrono = [...riderTasks].sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
      let chronologicalKm = 0;
      let prevChrono = origin;
      sortedChrono.forEach(t => {
        const dist = calculateEstimatedDistanceKm(prevChrono, t.targetCoords);
        chronologicalKm = Math.round((chronologicalKm + dist) * 10) / 10;
        prevChrono = t.targetCoords;
      });

      const optResult = optimizeRiderRoute(origin, sortedChrono, origin);
      const optimizedKm = optResult.totalDistanceKm;

      const savedKm = Math.max(0, Math.round((chronologicalKm - optimizedKm) * 10) / 10);
      const savedPercent = chronologicalKm > 0 ? Math.round((savedKm / chronologicalKm) * 100) : 0;
      const savedMinutes = Math.round(savedKm * 2.5);

      return {
        rider,
        branch: riderBranch,
        origin,
        hasLiveGps: isValidLatLng(rider.currentLocation),
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
  }, [filteredRiders, reportBoardTasks, shopLocations, getRiderOriginCoords]);

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

  const activeRiderReport = useMemo(() => {
    if (!riderRouteReports.length) return null;
    if (activeReportRiderId) {
      const found = riderRouteReports.find(r => r.rider.id === activeReportRiderId);
      if (found) return found;
    }
    return riderRouteReports[0];
  }, [riderRouteReports, activeReportRiderId]);

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
    } catch {
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
    } catch {
      toast.error("Failed to update duration");
    }
  };

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
    } catch {
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
    if (!riderId) return '#94a3b8';
    const rider = allRiders.find(r => r.id === riderId);
    return rider?.color || '#3b82f6';
  };

  const eventStyleGetter = (event: any) => {
    let isEventCompleted = false;
    
    if (event.type === 'pickup') {
      isEventCompleted = !['pending', 'pickup'].includes(event.jobStatus);
    } else if (event.type === 'delivery') {
      isEventCompleted = event.jobStatus === 'completed';
    }

    let backgroundColor = getRiderColor(event.riderId);
    if (isEventCompleted) {
      backgroundColor = '#475569';
    }

    const opacity = isEventCompleted ? 0.7 : 0.95;
    
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity,
        color: 'white',
        border: '1px solid rgba(255,255,255,0.7)',
        display: 'block',
        fontSize: '10px',
        fontWeight: 500,
        boxShadow: 'none',
      }
    };
  };

  const openJobDetail = (job: Job) => {
    if (onEditJob) {
      onEditJob(job);
    } else {
      setViewJobId(job.id);
    }
  };

  const unassignedExpressCount = useMemo(
    () => boardColumnsData.unassignedTasks.filter(t => t.expressInfo?.isExpress).length,
    [boardColumnsData.unassignedTasks]
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-slate-50/50">
      <style dangerouslySetInnerHTML={{__html: `
        .rbc-toolbar button { font-family: inherit; font-weight: 500; border-radius: 6px; }
        .rbc-toolbar button.rbc-active { background-color: #312e81; color: white; border-color: #312e81; }
        .rbc-header { padding: 8px 0; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #64748b; }
        .rbc-today { background-color: #f8fafc; }
        .rbc-event { overflow: hidden; }
        .rbc-event-label { display: none !important; }
        .rbc-event-content { padding: 1px 3px; white-space: normal; line-height: 1.2; word-break: break-word; text-overflow: ellipsis; }
      `}} />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Header Bar (Always Pinned/Sticky at Top) */}
        <div className="sticky top-0 px-4 py-2.5 border-b border-slate-200 bg-white flex flex-col gap-2 shrink-0 z-20 shadow-2xs">
          {/* Row 1: Tab Switcher on Left, Area & Show Completed on Right */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setDispatchTab("calendar")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  dispatchTab === "calendar"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <CalendarIcon size={14} className={dispatchTab === "calendar" ? "text-indigo-400" : "text-slate-400"} />
                <span>Schedule Calendar</span>
              </button>

              <button
                type="button"
                onClick={() => setDispatchTab("board")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  dispatchTab === "board"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <LayoutGrid size={14} className={dispatchTab === "board" ? "text-amber-400" : "text-slate-400"} />
                <span>Rider Route</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  dispatchTab === "board" ? "bg-amber-400 text-slate-950" : "bg-slate-200 text-slate-700"
                }`}>
                  {todayTaskCount}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              <select
                className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 disabled:opacity-75 shrink-0"
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

              {dispatchTab === "calendar" && (
                <Label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors shrink-0">
                  <input 
                    type="checkbox"
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4 cursor-pointer"
                    checked={showCompleted} 
                    onChange={(e) => setShowCompleted(e.target.checked)}
                  />
                  <span className="text-xs font-bold text-slate-700">Show Completed</span>
                </Label>
              )}
            </div>
          </div>

          {/* Row 2: Rider Filter Strip & Route Optimization Summary */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-0.5 flex-1">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 shrink-0 mr-1 flex items-center gap-1.5">
                <Truck size={15} className="text-indigo-600" />
                Riders:
              </span>
              <Button 
                variant={selectedRiderIds.size === 0 ? "default" : "outline"} 
                size="sm" 
                onClick={toggleAllRiders} 
                className="h-8 text-xs font-black rounded-xl px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 cursor-pointer shadow-2xs"
              >
                All Riders ({filteredRiders.length})
              </Button>

              {filteredRiders.map(rider => {
                const isSelected = selectedRiderIds.has(rider.id);
                const riderReport = riderRouteReports.find(r => r.rider.id === rider.id);
                const riderActiveTasks = riderReport?.tasksCount || 0;
                return (
                  <div 
                    key={rider.id}
                    onClick={() => toggleRider(rider.id)}
                    className={`inline-flex items-center gap-2 pl-2.5 pr-2 py-1 rounded-2xl border transition-all shrink-0 cursor-pointer shadow-2xs ${
                      isSelected 
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold ring-2 ring-indigo-400/25' 
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: getRiderColor(rider.id) }} />
                    <img
                      src={rider.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(rider.name)}&background=4f46e5&color=fff`}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover shrink-0 bg-slate-100 border border-slate-200"
                    />
                    
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900">{rider.nickname || rider.name.split(' ')[0]}</span>
                      <span className="text-[11px] px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-700 font-mono font-black border border-slate-200/60">
                        {riderActiveTasks}
                      </span>
                    </div>

                    {riderReport && riderReport.tasksCount > 0 ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveReportRiderId(rider.id);
                          setShowRouteReportModal(true);
                        }}
                        title={`${rider.name}: Optimized ${riderReport.optimizedKm} km (Scheduled ${riderReport.chronologicalKm} km) - Saved ${riderReport.savedKm} km (~${riderReport.savedMinutes}m). Click for stop sequence.`}
                        className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-xl border transition-all hover:scale-105 cursor-pointer ${
                          riderReport.savedKm > 0
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-2xs'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        <Route size={12} className={riderReport.savedKm > 0 ? "text-emerald-600" : "text-indigo-600"} />
                        <span>{riderReport.optimizedKm} km</span>
                        {riderReport.savedKm > 0 ? (
                          <span className="text-[10px] text-emerald-700 font-black bg-emerald-100 px-1 py-0.1 rounded border border-emerald-200">
                            -{riderReport.savedKm}km
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveReportRiderId(filteredRiders[0]?.id || null);
                setShowRouteReportModal(true);
              }}
              className="h-8 px-3.5 text-xs rounded-2xl font-black bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-indigo-500/15 hover:from-emerald-500/25 hover:to-indigo-500/25 border border-emerald-300 text-emerald-950 flex items-center gap-2 cursor-pointer shadow-2xs transition-all shrink-0"
            >
              <Sparkles size={14} className="text-emerald-600 animate-pulse" />
              <span>Rider Route Report</span>
              <span className="bg-emerald-600 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-2xs">
                {teamOptimizationTotals.totalSavedKm > 0 
                  ? `Saved ${teamOptimizationTotals.totalSavedKm} km (~${teamOptimizationTotals.totalSavedMins}m)` 
                  : `${teamOptimizationTotals.totalOptKm} km total`}
              </span>
            </button>
          </div>

          {/* Row 3: Sub-Toolbar for Rider Route Board: Easy Filters & Search */}
          {dispatchTab === "board" && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {/* Date Scope: Today vs All Active (including past uncompleted) */}
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBoardDateScope("today")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      boardDateScope === "today"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Today ({todayTaskCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoardDateScope("all_active")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      boardDateScope === "all_active"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    All Pending ({allActiveTaskCount})
                  </button>
                </div>

                {/* Leg Type Filter: All / Pickup / Delivery */}
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBoardLegFilter("all")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      boardLegFilter === "all"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    All Legs
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoardLegFilter("pickup")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      boardLegFilter === "pickup"
                        ? "bg-amber-500 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Pickup
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoardLegFilter("delivery")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      boardLegFilter === "delivery"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    Delivery
                  </button>
                </div>

                {/* Quick Search */}
                <div className="relative w-52 sm:w-64">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={boardSearch}
                    onChange={(e) => setBoardSearch(e.target.value)}
                    placeholder="Search customer, building, #ID..."
                    className="w-full h-7.5 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-400"
                  />
                  {boardSearch && (
                    <button
                      type="button"
                      onClick={() => setBoardSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Right Side: Auto Route vs Time + Show Offline Riders */}
              <div className="flex items-center gap-2">
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBoardSortMode("optimized")}
                    className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                      boardSortMode === "optimized"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Zap size={12} className={boardSortMode === "optimized" ? "text-amber-300" : "text-slate-400"} />
                    <span>Auto Route</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoardSortMode("time")}
                    className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                      boardSortMode === "time"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Clock size={12} />
                    <span>By Time</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowOfflineRiders(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    showOfflineRiders
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {showOfflineRiders ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>Offline Riders</span>
                  {!showOfflineRiders && boardColumnsData.hiddenOfflineCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black">
                      +{boardColumnsData.hiddenOfflineCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ===================================================================== */}
        {/* TAB 1 (DEFAULT): SCHEDULE CALENDAR                                    */}
        {/* ===================================================================== */}
        {dispatchTab === "calendar" ? (
          <div className="flex-1 min-h-0 p-4 bg-white m-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <DnDCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              tooltipAccessor={(event: any) => event.tooltip || event.title}
              date={currentDate}
              onNavigate={(date: Date) => setCurrentDate(date)}
              view={currentView}
              onView={(view: any) => setCurrentView(view)}
              views={['day', 'week', 'month', 'agenda']}
              onEventDrop={onEventDrop}
              onEventResize={onEventResize}
              onSelectEvent={onSelectEvent}
              eventPropGetter={eventStyleGetter}
              dayLayoutAlgorithm="no-overlap"
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
        ) : (
          /* ===================================================================== */
          /* TAB 2: RIDER ROUTE BOARD (KANBAN) WITH STICKY/PINNED HEADERS          */
          /* ===================================================================== */
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3.5">
            <div className="flex items-stretch gap-3.5 h-full min-h-0 min-w-max">
              {/* 1. UNASSIGNED TASKS COLUMN */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (dragOverColumnId !== "__unassigned__") {
                    setDragOverColumnId("__unassigned__");
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverColumnId !== "__unassigned__") {
                    setDragOverColumnId("__unassigned__");
                  }
                }}
                onDragLeave={(e) => {
                  const related = e.relatedTarget as Node | null;
                  if (related && e.currentTarget.contains(related)) return;
                  setDragOverColumnId((prev) => (prev === "__unassigned__" ? null : prev));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskToMove = draggedTaskRef.current || draggedTask;
                  handleEndDragTask();
                  if (taskToMove) {
                    handleReassignTaskToRider(taskToMove, null);
                  }
                }}
                className={`w-[295px] h-full min-h-0 shrink-0 flex flex-col rounded-2xl border transition-all bg-slate-100/90 ${
                  dragOverColumnId === "__unassigned__"
                    ? "border-amber-400 ring-2 ring-amber-400/30 bg-amber-50/40"
                    : "border-slate-200/90"
                }`}
              >
                {/* Pinned/Sticky Unassigned Header */}
                <div className="sticky top-0 px-3.5 py-3 bg-white rounded-t-2xl border-b border-slate-200/80 flex items-center justify-between shrink-0 z-10 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          Unassigned
                        </h3>
                        {unassignedExpressCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9.5px] font-black bg-rose-600 text-white shadow-2xs animate-pulse">
                            <Zap size={9} className="fill-white" />
                            {unassignedExpressCount} EXP
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Drag card to a rider column
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                    {boardColumnsData.unassignedTasks.length}
                  </span>
                </div>

                {/* Scrollable Unassigned Cards */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                  {boardColumnsData.unassignedTasks.length === 0 ? (
                    <div className="h-36 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 rounded-xl bg-white/60">
                      <Package size={20} className="text-slate-300 mb-1" />
                      <p className="text-xs font-bold text-slate-500">No unassigned tasks</p>
                    </div>
                  ) : (
                    boardColumnsData.unassignedTasks.map((task) => {
                      const isPickup = task.legType === "pickup";
                      const exp = task.expressInfo;
                      const isInProcessWash =
                        task.legType === "delivery" &&
                        ["picked_up", "billing", "active", "ready_to_wash"].includes(task.job.status);

                      return (
                        <div
                          key={task.taskId}
                          draggable
                          onDragStart={(e) => handleStartDragTask(e, task)}
                          onDragEnd={handleEndDragTask}
                          className={`bg-white rounded-xl border ${
                            exp?.isExpress
                              ? exp.is100
                                ? "border-rose-300 ring-1 ring-rose-200/70 bg-rose-50/20"
                                : "border-orange-300 ring-1 ring-orange-200/70 bg-orange-50/20"
                              : "border-slate-200/90"
                          } border-l-4 ${
                            isPickup ? "border-l-amber-500" : "border-l-indigo-500"
                          } p-2.5 shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing space-y-1.5 ${
                            isReassigningTask === task.taskId ? "opacity-50 pointer-events-none" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 flex-nowrap">
                            <div className="flex items-center gap-1 min-w-0 flex-wrap">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase shrink-0 ${
                                  isPickup
                                    ? "bg-amber-50 text-amber-800 border border-amber-200/80"
                                    : "bg-indigo-50 text-indigo-800 border border-indigo-200/80"
                                }`}
                              >
                                {isPickup ? "Pickup" : "Delivery"}
                              </span>

                              {exp?.isExpress && (
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black uppercase shadow-2xs shrink-0 ${
                                    exp.is100
                                      ? "bg-rose-600 text-white"
                                      : "bg-orange-500 text-white"
                                  }`}
                                >
                                  <Zap size={8.5} className="fill-white shrink-0" />
                                  {exp.label}
                                </span>
                              )}

                              {isInProcessWash && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                                  กำลังซัก
                                </span>
                              )}
                            </div>

                            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-600 shrink-0 self-start">
                              <Clock size={10} className="text-slate-400 shrink-0" />
                              {format(task.scheduledAt, "HH:mm")}
                            </span>
                          </div>

                          <div
                            onClick={() => openJobDetail(task.job)}
                            className="cursor-pointer group"
                          >
                            <div className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600 truncate">
                              {task.job.customerName || "Guest"}
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                              {task.targetLocation}
                            </div>
                          </div>

                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1.5">
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) handleReassignTaskToRider(task, e.target.value);
                              }}
                              className="h-6.5 text-[10.5px] font-bold bg-indigo-50/70 hover:bg-indigo-50 border border-indigo-200/80 rounded-md px-1.5 text-indigo-800 flex-1 min-w-0 cursor-pointer"
                            >
                              <option value="">+ Assign Rider...</option>
                              {filteredRiders.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nickname || r.name.split(" ")[0]} ({r.status})
                                </option>
                              ))}
                            </select>
                            <span className="text-[9.5px] font-mono text-slate-400 shrink-0">
                              #{task.job.id.slice(-4)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 2. RIDER COLUMNS */}
              {boardColumnsData.riderColumns.length === 0 ? (
                <div className="flex-1 min-w-[340px] flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <Truck size={28} className="text-slate-300 mb-2" />
                  <p className="text-sm font-extrabold text-slate-700">No Active Riders with Tasks</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    {boardDateScope === "today" && allActiveTaskCount > todayTaskCount
                      ? `There are ${allActiveTaskCount - todayTaskCount} pending tasks from previous days. Switch to "All Pending (${allActiveTaskCount})" to view them.`
                      : "Click 'Offline Riders' in the toolbar to view offline riders and assign tasks."}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    {boardDateScope === "today" && allActiveTaskCount > todayTaskCount && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setBoardDateScope("all_active")}
                        className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      >
                        View All Pending ({allActiveTaskCount})
                      </Button>
                    )}
                    {!showOfflineRiders && boardColumnsData.hiddenOfflineCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowOfflineRiders(true)}
                        className="text-xs font-bold cursor-pointer"
                      >
                        <Eye size={13} className="mr-1.5" />
                        Show Offline Riders (+{boardColumnsData.hiddenOfflineCount})
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                boardColumnsData.riderColumns.map((col) => {
                  const {
                    rider,
                    displayTasks,
                    pickupCount,
                    deliveryCount,
                    activeDistanceKm,
                    savedKm,
                    estimatedMinutes,
                    googleMapsUrl,
                    previewDelta,
                  } = col;
                  const branchName = shopLocations
                    .find((s) => s.id === rider.branchId)
                    ?.name?.replace("That Laundry Shop ", "");
                  const isDropTarget = dragOverColumnId === rider.id;
                  const recentDelta = recentRiderDeltas[rider.id];
                  const activeDelta = previewDelta || recentDelta || null;

                  return (
                    <div
                      key={rider.id}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        if (dragOverColumnId !== rider.id) {
                          setDragOverColumnId(rider.id);
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverColumnId !== rider.id) {
                          setDragOverColumnId(rider.id);
                        }
                      }}
                      onDragLeave={(e) => {
                        const related = e.relatedTarget as Node | null;
                        if (related && e.currentTarget.contains(related)) return;
                        setDragOverColumnId((prev) => (prev === rider.id ? null : prev));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const taskToMove = draggedTaskRef.current || draggedTask;
                        handleEndDragTask();
                        if (taskToMove) {
                          handleReassignTaskToRider(taskToMove, rider.id);
                        }
                      }}
                      className={`w-[308px] h-full min-h-0 shrink-0 flex flex-col rounded-2xl border transition-all bg-slate-100/80 ${
                        isDropTarget
                          ? "border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-50/50 shadow-lg"
                          : "border-slate-200/90"
                      }`}
                    >
                      {/* PINNED/STICKY RIDER COLUMN HEADER */}
                      <div className="sticky top-0 p-3 bg-white rounded-t-2xl border-b border-slate-200/80 space-y-2 shrink-0 z-10 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative shrink-0">
                              <img
                                src={
                                  rider.avatarUrl ||
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(rider.name)}&background=4f46e5&color=fff`
                                }
                                alt={rider.name}
                                className="w-8.5 h-8.5 rounded-full object-cover border-2"
                                style={{ borderColor: getRiderColor(rider.id) }}
                              />
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                  rider.status === "online"
                                    ? "bg-emerald-500"
                                    : rider.status === "busy"
                                      ? "bg-amber-500"
                                      : "bg-slate-400"
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-black text-slate-900 truncate">
                                {rider.nickname || rider.name.split(" ")[0]}
                              </div>
                              <div className="text-[10px] font-semibold text-slate-400 truncate">
                                {branchName || rider.status}
                              </div>
                            </div>
                          </div>

                          {/* Pickup / Delivery Mini Counters */}
                          <div className="flex items-center gap-1 shrink-0">
                            {pickupCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200/80">
                                {pickupCount}P
                              </span>
                            )}
                            {deliveryCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-indigo-50 text-indigo-800 border border-indigo-200/80">
                                {deliveryCount}D
                              </span>
                            )}
                            {displayTasks.length === 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400">
                                0 stops
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Sleek Route Summary Bar: Stops • Distance • Est. Time + Map */}
                        {displayTasks.length > 0 && (
                          <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-bold min-w-0">
                              <Zap size={11} className="text-amber-400 shrink-0" />
                              <span className="truncate">
                                {displayTasks.length} stops • ~{activeDistanceKm} km • ~{formatDurationMinutes(estimatedMinutes)}
                              </span>
                              {savedKm > 0 && boardSortMode === "optimized" && !activeDelta && (
                                <span className="text-[9.5px] font-extrabold text-emerald-400 shrink-0">
                                  (-{savedKm}km)
                                </span>
                              )}
                            </div>

                            {googleMapsUrl && (
                              <a
                                href={googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black shrink-0 transition-colors"
                                title="Open multi-stop route in Google Maps"
                              >
                                <Navigation size={10} className="fill-white" />
                                <span>Map</span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Instant Live Calculation Banner when hovering a task over a rider box */}
                        {activeDelta && (
                          <div
                            className={`rounded-xl p-2 border transition-all ${
                              activeDelta.mode === "preview_add"
                                ? "bg-indigo-600 text-white border-indigo-700 shadow-md"
                                : activeDelta.deltaMinutes <= 0 && activeDelta.deltaKm <= 0
                                  ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                                  : "bg-amber-50 text-amber-950 border-amber-300"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold uppercase tracking-wide opacity-90">
                              <span>
                                {activeDelta.mode === "preview_add"
                                  ? `⚡ ถ้าย้ายงานมาคนนี้${activeDelta.insertedStopNumber ? ` (จุดแวะ #${activeDelta.insertedStopNumber})` : ""}`
                                  : activeDelta.mode === "preview_remove"
                                    ? "⚡ ถ้าดึงงานออกจากคนนี้"
                                    : "✓ อัปเดตเส้นทางแล้ว"}
                              </span>
                            </div>

                            <div className="mt-1 grid grid-cols-2 gap-1.5">
                              <div
                                className={`rounded-lg px-2 py-1 ${
                                  activeDelta.mode === "preview_add"
                                    ? "bg-white/15 text-white"
                                    : "bg-white/80 border border-black/5"
                                }`}
                              >
                                <div className="text-[9px] font-bold opacity-75">ระยะทาง (Distance)</div>
                                <div className="text-xs font-black">
                                  {formatSignedKm(activeDelta.deltaKm)}
                                </div>
                                <div className="text-[9.5px] font-semibold opacity-80">
                                  {activeDelta.beforeKm} ➔ {activeDelta.afterKm} km
                                </div>
                              </div>

                              <div
                                className={`rounded-lg px-2 py-1 ${
                                  activeDelta.mode === "preview_add"
                                    ? "bg-white/15 text-white"
                                    : "bg-white/80 border border-black/5"
                                }`}
                              >
                                <div className="text-[9px] font-bold opacity-75">เวลา (Est. Time)</div>
                                <div className="text-xs font-black">
                                  {formatSignedMinutes(activeDelta.deltaMinutes)}
                                </div>
                                <div className="text-[9.5px] font-semibold opacity-80">
                                  {formatDurationMinutes(activeDelta.beforeMinutes)} ➔ {formatDurationMinutes(activeDelta.afterMinutes)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Scrollable Rider Stop Cards */}
                      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                        {displayTasks.length === 0 ? (
                          <div className="h-36 flex flex-col items-center justify-center text-center px-4 border border-dashed border-slate-200 rounded-xl bg-white/50">
                            <p className="text-xs font-bold text-slate-400">No stops assigned</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Drop a card here to assign
                            </p>
                          </div>
                        ) : (
                          displayTasks.map((task, idx) => {
                            const isPickup = task.legType === "pickup";
                            const stopNum = task.stopNumber || idx + 1;
                            const isSameSpotAsPrev = idx > 0 && task.distanceFromPrevKm === 0;
                            const legDriveMins = isSameSpotAsPrev
                              ? 2
                              : Math.max(3, Math.round((task.distanceFromPrevKm || 0) * 2.4 + 4));
                            const isBeingDragged = draggedTask?.taskId === task.taskId;
                            const exp = task.expressInfo;

                            return (
                              <div
                                key={task.taskId}
                                draggable
                                onDragStart={(e) => handleStartDragTask(e, task)}
                                onDragEnd={handleEndDragTask}
                                className={`bg-white rounded-xl border ${
                                  exp?.isExpress
                                    ? exp.is100
                                      ? "border-rose-300 ring-1 ring-rose-200/70"
                                      : "border-orange-300 ring-1 ring-orange-200/70"
                                    : "border-slate-200/90"
                                } border-l-4 ${
                                  isPickup ? "border-l-amber-500" : "border-l-indigo-500"
                                } p-2.5 shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing space-y-1.5 ${
                                  isReassigningTask === task.taskId || isBeingDragged ? "opacity-50" : ""
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5 flex-nowrap">
                                  <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                                    <span
                                      className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                                        isPickup
                                          ? "bg-amber-500 text-white"
                                          : "bg-indigo-600 text-white"
                                      }`}
                                    >
                                      {stopNum}
                                    </span>
                                    <span
                                      className={`text-[10px] font-extrabold uppercase shrink-0 ${
                                        isPickup ? "text-amber-700" : "text-indigo-700"
                                      }`}
                                    >
                                      {isPickup ? "Pickup" : "Delivery"}
                                    </span>
                                    {exp?.isExpress && (
                                      <span
                                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase shrink-0 ${
                                          exp.is100
                                            ? "bg-rose-600 text-white"
                                            : "bg-orange-500 text-white"
                                        }`}
                                      >
                                        <Zap size={8} className="fill-white shrink-0" />
                                        {exp.label}
                                      </span>
                                    )}
                                    {task.distanceFromPrevKm !== undefined && (
                                      <span className="text-[9.5px] font-bold text-slate-400 truncate">
                                        • {isSameSpotAsPrev ? "Same spot" : `+${task.distanceFromPrevKm}km (~${legDriveMins}m)`}
                                      </span>
                                    )}
                                  </div>

                                  <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-slate-600 shrink-0">
                                    <Clock size={10} className="text-slate-400 shrink-0" />
                                    {format(task.scheduledAt, "HH:mm")}
                                  </span>
                                </div>

                                <div
                                  onClick={() => openJobDetail(task.job)}
                                  className="cursor-pointer group"
                                >
                                  <div className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600 truncate">
                                    {task.job.customerName || "Guest"}
                                  </div>
                                  <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                                    {task.targetLocation}
                                  </div>
                                </div>

                                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openJobDetail(task.job)}
                                    className="text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-600 cursor-pointer"
                                  >
                                    #{task.job.id}
                                  </button>

                                  <div className="relative flex items-center">
                                    <ArrowRightLeft size={10} className="text-slate-400 mr-1 pointer-events-none" />
                                    <select
                                      value={rider.id}
                                      onChange={(e) => handleReassignTaskToRider(task, e.target.value || null)}
                                      className="h-6 text-[10px] font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-1.5 text-slate-600 max-w-[125px] truncate cursor-pointer"
                                      title="Move task to another rider"
                                    >
                                      <option value="">Unassign</option>
                                      {filteredRiders.map((r) => (
                                        <option key={r.id} value={r.id}>
                                          ➔ {r.nickname || r.name.split(" ")[0]}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
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

      {/* Rider Route Report Modal */}
      <Dialog open={showRouteReportModal} onOpenChange={setShowRouteReportModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-emerald-600" />
              Rider Route Optimization Report
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
            {riderRouteReports.map(rep => (
              <button
                key={rep.rider.id}
                type="button"
                onClick={() => setActiveReportRiderId(rep.rider.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 cursor-pointer transition-all ${
                  activeRiderReport?.rider.id === rep.rider.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{rep.rider.nickname || rep.rider.name.split(" ")[0]}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-black">
                  {rep.tasksCount}
                </span>
              </button>
            ))}
          </div>

          {activeRiderReport ? (
            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500">Scheduled Order</div>
                  <div className="text-base font-black text-slate-900">{activeRiderReport.chronologicalKm} km</div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-[11px] font-bold text-indigo-700">Optimized Route</div>
                  <div className="text-base font-black text-indigo-950">{activeRiderReport.optimizedKm} km</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[11px] font-bold text-emerald-700">Estimated Saved</div>
                  <div className="text-base font-black text-emerald-900">
                    {activeRiderReport.savedKm} km (~{activeRiderReport.savedMinutes}m)
                  </div>
                </div>
              </div>

              {activeRiderReport.googleMapsUrl && (
                <div className="flex justify-end">
                  <a
                    href={activeRiderReport.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold"
                  >
                    <Navigation size={13} />
                    <span>Open Multi-Stop Route in Google Maps</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              <div className="space-y-2">
                {activeRiderReport.orderedStops.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">No scheduled stops for this rider in the current view.</p>
                ) : (
                  activeRiderReport.orderedStops.map((stop) => (
                    <div
                      key={`${stop.jobId}-${stop.type}-${stop.stopNumber}`}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 bg-white"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center text-white shrink-0 ${
                            stop.type === "pickup" ? "bg-amber-500" : "bg-indigo-600"
                          }`}
                        >
                          {stop.stopNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-slate-900 truncate">
                            [{stop.type === "pickup" ? "รับผ้า" : "ส่งผ้า"}] {stop.customerName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{stop.location}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-slate-800">+{stop.distanceFromPrevKm} km</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {format(stop.scheduledTime, "HH:mm")} • Total {stop.cumulativeDistanceKm} km
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
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
