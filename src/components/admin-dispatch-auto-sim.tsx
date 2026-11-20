"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Bot,
  CheckCircle2,
  Clock,
  Cloud,
  MapPin,
  Pause,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  StepForward,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Customer, Job, LatLng, Rider, ShopLocation } from "@/lib/store";
import { useCustomers } from "@/lib/use-customers";
import {
  calculateEstimatedDistanceKm,
  extractTaskHandoverMode,
  extractTaskJobProcessingBranchId,
  isDedicatedCorporateManTask,
  optimizeSmartRiderRoute,
  suggestBestRiderForTask,
  CandidateRiderForAutoAssign,
  RiderAutoAssignSuggestion,
} from "@/lib/route-optimizer";
import {
  getDispatchAutoSimStateAction,
  saveDispatchAutoSimStateAction,
} from "@/actions/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface SimTaskItem {
  taskId: string;
  job: Job;
  legType: "pickup" | "delivery";
  handoverMode: "lobby" | "meetup";
  laundryBranchId: string;
  laundryBranchLabel: string;
  scheduledAt: Date;
  targetLocation: string;
  targetCoords: LatLng;
  expressInfo: { isExpress: boolean; label: string; is100: boolean } | null;
  isReady: boolean;
  isCsoPaid: boolean;
  isCompleted: boolean;
}

interface SerializedSimTask {
  taskId: string;
  jobId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  branchId: string;
  laundryBranchId?: string;
  legType: "pickup" | "delivery";
  handoverMode?: "lobby" | "meetup";
  isReady?: boolean;
  isCsoPaid?: boolean;
  scheduledAtIso: string;
  targetLocation: string;
  targetCoords: LatLng;
  serviceSpeed: "standard" | "express_50" | "express_100";
}

export interface SimAssignmentRecord {
  taskId: string;
  jobId: string;
  legType: "pickup" | "delivery";
  simRiderId: string;
  assignedAt: string;
  reason: string;
  detourKm: number;
  distFromRiderKm: number;
  distToNearestStopKm: number;
  score: number;
  insertedStopNumber?: number;
}

interface SimSettings {
  maxRadiusKm: number;
  maxActiveStops: number;
  maxDailyJobs: number;
  shiftEndHour: number | null;
  respectStrictTimeWindows: boolean;
  ignoreNonMeetupTimeWindows?: boolean;
  disableWorkloadBalance?: boolean;
  ignoreBranchRouting?: boolean;
}

interface RiderLastLocationRecord {
  coords: LatLng;
  locationName: string;
  jobId: string;
  atTimeStr: string;
  atHour: number;
}

interface PersistedSimState {
  dateKey: string;
  simTasks: SerializedSimTask[];
  assignments: Record<string, SimAssignmentRecord>;
  riderOnlineOverrides?: Record<string, boolean>;
  riderBranchOverrides?: Record<string, string>;
  simClockHour?: number;
  completedTaskTimes?: Record<string, string>;
  riderLastLocations?: Record<string, RiderLastLocationRecord>;
  rejectedRiderIdsByTask?: Record<string, string[]>;
  nextSeq: number;
  settings: SimSettings;
  updatedAt?: string;
}

const DEFAULT_SETTINGS: SimSettings = {
  maxRadiusKm: 4.5,
  maxActiveStops: 10,
  maxDailyJobs: 35,
  shiftEndHour: 18.5,
  respectStrictTimeWindows: true,
  ignoreNonMeetupTimeWindows: false,
  disableWorkloadBalance: false,
  ignoreBranchRouting: false,
};

function isValidLatLng(coords?: LatLng | null): coords is LatLng {
  return Boolean(
    coords &&
      typeof coords.lat === "number" &&
      typeof coords.lng === "number" &&
      coords.lat !== 0 &&
      coords.lng !== 0 &&
      !Number.isNaN(coords.lat) &&
      !Number.isNaN(coords.lng)
  );
}

function resolveExpressInfo(speed: SerializedSimTask["serviceSpeed"]) {
  if (speed === "express_100") return { isExpress: true, label: "EXP 100%", is100: true };
  if (speed === "express_50") return { isExpress: true, label: "EXP 50%", is100: false };
  return null;
}

function getSimBranchShortLabel(branchId?: string | null): string {
  if (!branchId) return "Soi 15";
  const lower = branchId.toLowerCase();
  if (branchId === "SHOP-MOGWZ0X0" || lower.includes("pk") || lower.includes("phattanakarn")) return "PK";
  if (branchId === "SHOP-MOLCJ2X8" || lower.includes("pty") || lower.includes("pattaya")) return "PTY";
  return "Soi 15";
}

function getSimClockDate(hourFloat: number): Date {
  const d = new Date();
  const h = Math.floor(hourFloat);
  const m = Math.round((hourFloat - h) * 60);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatSimClockHour(hourFloat: number): string {
  const h = Math.floor(hourFloat);
  const m = Math.round((hourFloat - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hydrateSimTask(s: SerializedSimTask, completedAtStr?: string): SimTaskItem {
  const sched = new Date(s.scheduledAtIso);
  const expressInfo = resolveExpressInfo(s.serviceSpeed);
  const handoverMode: "lobby" | "meetup" = s.handoverMode || "lobby";
  const isReady = s.isReady !== undefined ? Boolean(s.isReady) : true;
  const isCsoPaid = s.isCsoPaid !== undefined ? Boolean(s.isCsoPaid) : true;
  const laundryBranchId = s.laundryBranchId || s.branchId || "shop-head";
  const laundryBranchLabel = getSimBranchShortLabel(laundryBranchId);
  const handoverRemark =
    handoverMode === "meetup"
      ? "Pickup: Meet up | Delivery: Meet up"
      : "Pickup: Leave at Lobby | Delivery: Leave at Lobby";
  const mockJob: Job = {
    id: s.jobId,
    type: s.legType,
    customerId: s.customerId,
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    pickupLocation: s.targetLocation,
    dropoffLocation: s.targetLocation,
    pickupCoords: s.targetCoords,
    dropoffCoords: s.targetCoords,
    distance: 0,
    fee: 0,
    status: s.legType === "pickup" ? "pickup" : "delivery",
    // Keep subStatus = "ready" on mockJob so Auto Assign distributes first, while task.isReady controls stack sorting!
    subStatus: s.legType === "delivery" ? "ready" : undefined,
    serviceSpeed: s.serviceSpeed,
    remark: handoverRemark,
    branchId: s.branchId,
    adminNotesJson: JSON.stringify({ processingBranchId: laundryBranchId }),
    createdAt: sched,
    scheduledAt: sched,
    pickupScheduledAt: sched,
    deliveryScheduledAt: sched,
    isStuck: false,
  } as Job;

  return {
    taskId: s.taskId,
    job: mockJob,
    legType: s.legType,
    handoverMode,
    laundryBranchId,
    laundryBranchLabel,
    scheduledAt: sched,
    targetLocation: s.targetLocation,
    targetCoords: s.targetCoords,
    expressInfo,
    isReady,
    isCsoPaid,
    isCompleted: Boolean(completedAtStr),
  };
}

function slotIndexToSimDate(slotIndex: number): Date {
  const base = new Date();
  const clamped = Math.max(0, Math.min(16, slotIndex));
  const totalMins = 10 * 60 + 30 + clamped * 30; // 10:30 .. 18:30 (17 slots of 30 mins)
  base.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0);
  return base;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Distribute N simulation jobs evenly across 10:30-18:30 (17 x 30-min slots; rider shift starts at 10:00)
function buildBalancedSimSlotDates(count: number): Date[] {
  const slots: number[] = [];
  while (slots.length < count) {
    const firstHalf: number[] = [0]; // 10:30 slot
    const secondHalf: number[] = [];
    for (let h = 1; h < 9; h++) {
      const s0 = h * 2 - 1; // :00
      const s1 = h * 2;     // :30
      if (Math.random() < 0.5) {
        firstHalf.push(s0);
        secondHalf.push(s1);
      } else {
        firstHalf.push(s1);
        secondHalf.push(s0);
      }
    }
    slots.push(...shuffleArray(firstHalf), ...shuffleArray(secondHalf));
  }
  return shuffleArray(slots.slice(0, count)).map(slotIndexToSimDate);
}

function pickLeastUsedSimSlotDate(existingTasks: SerializedSimTask[]): Date {
  const slotCounts = new Array<number>(18).fill(0);
  const hourCounts = new Array<number>(9).fill(0);
  for (const t of existingTasks) {
    const d = new Date(t.scheduledAtIso);
    if (Number.isNaN(d.getTime())) continue;
    const minsFrom10 = (d.getHours() - 10) * 60 + d.getMinutes();
    const slotIdx = Math.max(0, Math.min(17, Math.floor(minsFrom10 / 30)));
    slotCounts[slotIdx]++;
    hourCounts[Math.floor(slotIdx / 2)]++;
  }
  const minHourCount = Math.min(...hourCounts);
  const candidateSlots: number[] = [];
  for (let s = 0; s < 18; s++) {
    if (hourCounts[Math.floor(s / 2)] === minHourCount) {
      candidateSlots.push(s);
    }
  }
  const minSlotCount = Math.min(...candidateSlots.map((s) => slotCounts[s]));
  const bestSlots = candidateSlots.filter((s) => slotCounts[s] === minSlotCount);
  const chosen = bestSlots[Math.floor(Math.random() * bestSlots.length)] ?? 0;
  return slotIndexToSimDate(chosen);
}

function createRandomSimTask(
  seq: number,
  crmPool: Customer[],
  shopLocations: ShopLocation[],
  effectiveArea: string,
  forcedLegType?: "pickup" | "delivery",
  forcedScheduledAt?: Date
): SerializedSimTask | null {
  if (crmPool.length === 0) return null;

  const cust = crmPool[Math.floor(Math.random() * crmPool.length)];
  const lat = Number(cust.defaultCoords?.lat ?? (cust as any).defaultLat ?? 0);
  const lng = Number(cust.defaultCoords?.lng ?? (cust as any).defaultLng ?? 0);
  const address = (cust.defaultAddress || cust.secondaryAddress || cust.name || "Bangkok").trim();

  // Resolve branch for the job (match customer branchId or closest shop in area)
  let branchId = cust.branchId || "";
  const validShop = shopLocations.find((s) => s.id === branchId);
  if (!validShop) {
    const areaShops =
      effectiveArea === "ALL"
        ? shopLocations
        : shopLocations.filter((s) => (s.area || "").toUpperCase() === effectiveArea.toUpperCase());
    const poolShops = areaShops.length > 0 ? areaShops : shopLocations;
    if (poolShops.length > 0) {
      let bestShop = poolShops[0];
      let bestDist = Infinity;
      for (const s of poolShops) {
        const d = calculateEstimatedDistanceKm({ lat, lng }, s.coords);
        if (d < bestDist) {
          bestDist = d;
          bestShop = s;
        }
      }
      branchId = bestShop.id;
    } else {
      branchId = "shop-head";
    }
  }

  const legType: "pickup" | "delivery" =
    forcedLegType || (Math.random() < 0.5 ? "pickup" : "delivery");
  const handoverMode: "lobby" | "meetup" = Math.random() < 0.35 ? "meetup" : "lobby";
  const isReady = legType === "pickup" ? true : Math.random() < 0.7;
  const isCsoPaid = legType === "pickup" ? true : Math.random() < 0.7;

  const speedRoll = Math.random();
  const serviceSpeed: SerializedSimTask["serviceSpeed"] =
    speedRoll < 0.1 ? "express_100" : speedRoll < 0.25 ? "express_50" : "standard";

  // Random time between 10:30 and 18:30 today if not forced (rider shift starts at 10:00)
  let sched = forcedScheduledAt;
  if (!sched) {
    const base = new Date();
    const slotIndex = Math.floor(Math.random() * 17); // 0..16 -> 10:30..18:30 (30-min steps)
    const totalMins = 10 * 60 + 30 + slotIndex * 30;
    base.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0);
    sched = base;
  }

  // Assign laundry branch (where laundry is stored for Delivery, or where it must be returned for Pickup)
  let laundryBranchId = branchId;
  if (branchId !== "SHOP-MOLCJ2X8") {
    // BKK: ~55% Soi 15 (shop-head), ~45% Phattanakarn (SHOP-MOGWZ0X0)
    laundryBranchId = Math.random() < 0.55 ? "shop-head" : "SHOP-MOGWZ0X0";
  }

  const jobId = `SIM-${String(seq).padStart(3, "0")}`;
  return {
    taskId: `${jobId}-${legType}`,
    jobId,
    customerId: cust.id,
    customerName: cust.name,
    customerPhone: cust.phone || "-",
    branchId,
    laundryBranchId,
    legType,
    handoverMode,
    isReady,
    isCsoPaid,
    scheduledAtIso: sched.toISOString(),
    targetLocation: address,
    targetCoords: { lat, lng },
    serviceSpeed,
  };
}

export function AdminDispatchAutoSim({
  mode = "sim",
  allJobs = [],
  riders,
  shopLocations,
  effectiveArea,
  isAreaRestricted,
  allowedBranchIds,
  getRiderOriginCoords,
}: {
  mode?: "sim" | "live_shadow";
  allJobs?: Job[];
  riders: Rider[];
  shopLocations: ShopLocation[];
  effectiveArea: string;
  isAreaRestricted?: boolean;
  allowedBranchIds?: Set<string>;
  getRiderOriginCoords: (rider: Rider) => LatLng;
  onOpenJobDetail?: (job: Job) => void;
}) {
  const customers = useCustomers();
  const isLiveShadow = mode === "live_shadow";
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const dbStateKey = isLiveShadow ? `${todayKey}_LIVE_SHADOW` : `${todayKey}_SANDBOX`;

  const [simState, setSimState] = useState<PersistedSimState>({
    dateKey: todayKey,
    simTasks: [],
    assignments: {},
    nextSeq: 1,
    settings: DEFAULT_SETTINGS,
  });
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"loading" | "synced" | "saving" | "error">("loading");
  const [isAutoAssignRunning, setIsAutoAssignRunning] = useState(false);
  const [isTimePlaying, setIsTimePlaying] = useState(false);
  const [simBatchSize, setSimBatchSize] = useState<number>(35);
  const lastSavedJsonRef = useRef<string>("");

  // Eligible CRM customers with valid GPS coordinates AND real delivery/pickup address (not '-' or shop address)
  const eligibleCrmPool = useMemo(() => {
    return customers.filter((c) => {
      const lat = Number(c.defaultCoords?.lat ?? (c as any).defaultLat ?? 0);
      const lng = Number(c.defaultCoords?.lng ?? (c as any).defaultLng ?? 0);
      if (!isValidLatLng({ lat, lng })) return false;

      const rawAddr = String(c.defaultAddress || "").trim();
      if (!rawAddr || rawAddr === "-" || rawAddr.length < 4) return false;
      const addrLower = rawAddr.toLowerCase();
      if (
        addrLower === "n/a" ||
        addrLower === "none" ||
        addrLower.includes("that laundry shop") ||
        addrLower.includes("15 sukhumvit res") ||
        addrLower.includes("customer pickup at shop") ||
        addrLower.includes("kamphaeng phet 7") ||
        addrLower.includes("soi kho pai 4") ||
        addrLower.startsWith("walk-in") ||
        addrLower.startsWith("walk in")
      ) {
        return false;
      }

      if (effectiveArea === "PTY") {
        return lat < 13.3 || (c.branchId || "").includes("MOLCJ2X8");
      }
      if (effectiveArea === "BKK") {
        return lat >= 13.3;
      }
      return true;
    });
  }, [customers, effectiveArea]);

  // Build live production queue tasks (used in mode === "live_shadow", never mutates real jobs)
  const liveProductionTasks = useMemo<SerializedSimTask[]>(() => {
    if (!isLiveShadow) return [];
    let jobs = allJobs.filter(
      (j) => !["cancel", "completed", "delivered", "tba", "pending"].includes(j.status)
    );
    if (effectiveArea !== "ALL") {
      jobs = jobs.filter((j) => {
        const branch = shopLocations.find((s) => s.id === j.branchId);
        if (isAreaRestricted && shopLocations.length > 0 && allowedBranchIds) {
          return Boolean(j.branchId && allowedBranchIds.has(j.branchId));
        }
        return (
          (branch?.area || "").toUpperCase() === effectiveArea.toUpperCase() ||
          j.branchId === effectiveArea
        );
      });
    }

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const result: SerializedSimTask[] = [];

    for (const j of jobs) {
      const rawPLat = Number((j as any).pickupLat ?? j.pickupCoords?.lat ?? (j as any).customer?.lat ?? 0);
      const rawPLng = Number((j as any).pickupLng ?? j.pickupCoords?.lng ?? (j as any).customer?.lng ?? 0);
      const rawDLat = Number((j as any).dropoffLat ?? j.dropoffCoords?.lat ?? (j as any).customer?.lat ?? 0);
      const rawDLng = Number((j as any).dropoffLng ?? j.dropoffCoords?.lng ?? (j as any).customer?.lng ?? 0);

      const resolvedP =
        rawPLat !== 0 && rawPLng !== 0
          ? { lat: rawPLat, lng: rawPLng }
          : isValidLatLng(j.pickupCoords)
            ? j.pickupCoords
            : null;
      const resolvedD =
        rawDLat !== 0 && rawDLng !== 0
          ? { lat: rawDLat, lng: rawDLng }
          : isValidLatLng(j.dropoffCoords)
            ? j.dropoffCoords
            : null;
      const validP = resolvedP || resolvedD;
      const validD = resolvedD || resolvedP;

      const remarkUpper = `${j.serviceSpeed || ""} ${j.remark || ""}`.toLowerCase();
      const serviceSpeed: SerializedSimTask["serviceSpeed"] =
        j.serviceSpeed === "express_100" || /express\s*100%|exp\s*100%/i.test(remarkUpper)
          ? "express_100"
          : j.serviceSpeed === "express_50" ||
              /express\s*50%|exp\s*50%|express/i.test(remarkUpper)
            ? "express_50"
            : "standard";
      const laundryBranchId =
        extractTaskJobProcessingBranchId({ job: j }) || j.branchId || "shop-head";

      // 1. Active Pickup leg
      if (j.type === "pickup" || j.type === "full_service") {
        const isPickupReady = ["accepted", "pickup"].includes(j.status);
        const isPickupDone = [
          "picked_up",
          "billing",
          "process",
          "active",
          "ready_to_wash",
          "washed",
          "delivery",
          "completed",
          "cancel",
        ].includes(j.status);
        if (isPickupReady && !isPickupDone && validP) {
          const sched = j.pickupScheduledAt
            ? new Date(j.pickupScheduledAt)
            : j.scheduledAt
              ? new Date(j.scheduledAt)
              : new Date(j.createdAt);
          if (sched <= todayEnd) {
            result.push({
              taskId: `${j.id}-pickup`,
              jobId: j.id,
              customerId: j.customerId || j.id,
              customerName: j.customerName || "Customer",
              customerPhone: j.customerPhone || "-",
              branchId: j.branchId || "shop-head",
              laundryBranchId,
              legType: "pickup",
              handoverMode: extractTaskHandoverMode({ job: j, legType: "pickup" }),
              isReady: true,
              isCsoPaid: true,
              scheduledAtIso: sched.toISOString(),
              targetLocation: j.pickupLocation || j.dropoffLocation || "-",
              targetCoords: validP,
              serviceSpeed,
            });
          }
        }
      }

      // 2. Active Delivery leg
      if (j.type === "delivery" || j.type === "full_service" || Boolean(j.deliveryRiderId)) {
        const isWalkInSelfPickup =
          ((j.type as string) === "in_store" || j.dropoffLocation === "Customer Pickup at Shop") &&
          !j.deliveryRiderId;
        if (isWalkInSelfPickup) continue;

        let isDeliveredStage = false;
        if (j.status === "delivery" && j.adminNotesJson) {
          try {
            const parsed = JSON.parse(j.adminNotesJson);
            if (
              parsed?.kanbanStage === "delivered" ||
              parsed?.isRiderDelivered === true ||
              Boolean(parsed?.deliveredAt)
            ) {
              isDeliveredStage = true;
            }
          } catch {}
        }
        const hasDeliveryPhoto = Boolean(j.deliveryProofImageUrl && j.deliveryProofImageUrl !== "[]");
        const isDeliveryDone =
          ["delivered", "completed", "cancel"].includes(j.status) ||
          isDeliveredStage ||
          hasDeliveryPhoto ||
          j.legs?.deliveryOutbound?.status === "completed";
        const isDeliveryReady =
          (["washed", "delivery"].includes(j.status) || j.subStatus === "ready") && !j.isStuck;

        if (isDeliveryReady && !isDeliveryDone && validD) {
          const sched = j.deliveryScheduledAt
            ? new Date(j.deliveryScheduledAt)
            : j.scheduledAt
              ? new Date(j.scheduledAt)
              : new Date(j.createdAt);
          if (sched <= todayEnd) {
            result.push({
              taskId: `${j.id}-delivery`,
              jobId: j.id,
              customerId: j.customerId || j.id,
              customerName: j.customerName || "Customer",
              customerPhone: j.customerPhone || "-",
              branchId: j.branchId || "shop-head",
              laundryBranchId,
              legType: "delivery",
              handoverMode: extractTaskHandoverMode({ job: j, legType: "delivery" }),
              isReady: j.subStatus === "ready" || j.status === "delivery" || String(j.status) === "washed",
              isCsoPaid: j.isPaid !== false,
              scheduledAtIso: sched.toISOString(),
              targetLocation: j.deliveryAddress || j.dropoffLocation || j.pickupLocation || "-",
              targetCoords: validD,
              serviceSpeed,
            });
          }
        }
      }
    }

    return result;
  }, [isLiveShadow, allJobs, effectiveArea, isAreaRestricted, allowedBranchIds, shopLocations]);

  const loadFromDb = async () => {
    setSyncStatus("loading");
    try {
      const res = await getDispatchAutoSimStateAction(dbStateKey);
      if (res.success) {
        if (res.state && Array.isArray(res.state.simTasks)) {
          const loaded: PersistedSimState = {
            dateKey: todayKey,
            simTasks: res.state.simTasks,
            assignments: res.state.assignments || {},
            riderOnlineOverrides: res.state.riderOnlineOverrides || {},
            riderBranchOverrides: res.state.riderBranchOverrides || {},
            simClockHour: typeof res.state.simClockHour === "number" ? res.state.simClockHour : 10,
            completedTaskTimes: res.state.completedTaskTimes || {},
            riderLastLocations: res.state.riderLastLocations || {},
            rejectedRiderIdsByTask: res.state.rejectedRiderIdsByTask || {},
            nextSeq: res.state.nextSeq || res.state.simTasks.length + 1,
            settings: { ...DEFAULT_SETTINGS, ...(res.state.settings || {}) },
            updatedAt: res.state.updatedAt,
          };
          lastSavedJsonRef.current = JSON.stringify(loaded);
          setSimState(loaded);
        } else {
          setSimState({
            dateKey: todayKey,
            simTasks: [],
            assignments: {},
            nextSeq: 1,
            settings: DEFAULT_SETTINGS,
          });
        }
        setSyncStatus("synced");
      } else {
        setSyncStatus("error");
      }
    } catch {
      setSyncStatus("error");
    } finally {
      setIsDbLoaded(true);
    }
  };

  useEffect(() => {
    setIsDbLoaded(false);
    loadFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbStateKey]);

  // Auto-populate live production queue on first open of Live Shadow tab if empty
  useEffect(() => {
    if (!isLiveShadow || !isDbLoaded) return;
    if (simState.simTasks.length === 0 && liveProductionTasks.length > 0) {
      setSimState((prev) => ({
        ...prev,
        simTasks: liveProductionTasks,
        assignments: {},
        simClockHour: 10,
        completedTaskTimes: {},
        riderLastLocations: {},
        rejectedRiderIdsByTask: {},
        nextSeq: liveProductionTasks.length + 1,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveShadow, isDbLoaded, liveProductionTasks.length]);

  // Save simulation state to shared DB Setting table
  useEffect(() => {
    if (!isDbLoaded) return;
    const payload: PersistedSimState = {
      ...simState,
      dateKey: todayKey,
      updatedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(payload);
    const comparable = JSON.stringify({
      simTasks: payload.simTasks,
      assignments: payload.assignments,
      riderOnlineOverrides: payload.riderOnlineOverrides || {},
      riderBranchOverrides: payload.riderBranchOverrides || {},
      simClockHour: payload.simClockHour ?? 10,
      completedTaskTimes: payload.completedTaskTimes || {},
      riderLastLocations: payload.riderLastLocations || {},
      rejectedRiderIdsByTask: payload.rejectedRiderIdsByTask || {},
      nextSeq: payload.nextSeq,
      settings: payload.settings,
    });
    const prevComparable = (() => {
      if (!lastSavedJsonRef.current) return "";
      try {
        const p = JSON.parse(lastSavedJsonRef.current);
        return JSON.stringify({
          simTasks: p.simTasks,
          assignments: p.assignments,
          riderOnlineOverrides: p.riderOnlineOverrides || {},
          riderBranchOverrides: p.riderBranchOverrides || {},
          simClockHour: p.simClockHour ?? 10,
          completedTaskTimes: p.completedTaskTimes || {},
          riderLastLocations: p.riderLastLocations || {},
          rejectedRiderIdsByTask: p.rejectedRiderIdsByTask || {},
          nextSeq: p.nextSeq,
          settings: p.settings,
        });
      } catch {
        return "";
      }
    })();

    if (comparable === prevComparable) return;

    const timer = setTimeout(async () => {
      setSyncStatus("saving");
      try {
        const res = await saveDispatchAutoSimStateAction(dbStateKey, serialized);
        if (res.success) {
          lastSavedJsonRef.current = serialized;
          setSyncStatus("synced");
        } else {
          setSyncStatus("error");
        }
      } catch {
        setSyncStatus("error");
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [simState, isDbLoaded, todayKey]);

  const settings = simState.settings;
  const assignments = simState.assignments;
  const riderOnlineOverrides = simState.riderOnlineOverrides || {};
  const riderBranchOverrides = simState.riderBranchOverrides || {};
  const simClockHour = simState.simClockHour ?? 10;
  const completedTaskTimes = simState.completedTaskTimes || {};
  const riderLastLocations = simState.riderLastLocations || {};

  const getSimRiderBranchId = (
    rider: Rider,
    overrides: Record<string, string> = riderBranchOverrides
  ): string => {
    return overrides[rider.id] || rider.branchId || "shop-head";
  };

  const setSimRiderBranch = (riderId: string, nextBranchId: string) => {
    setSimState((prev) => ({
      ...prev,
      riderBranchOverrides: {
        ...(prev.riderBranchOverrides || {}),
        [riderId]: nextBranchId,
      },
    }));
  };

  const isSimRiderOnline = (rider: Rider, overrides: Record<string, boolean> = riderOnlineOverrides): boolean => {
    if (overrides[rider.id] !== undefined) return Boolean(overrides[rider.id]);
    return ["online", "busy"].includes((rider.status || "").toLowerCase());
  };

  const toggleSimRiderOnline = (rider: Rider) => {
    setSimState((prev) => {
      const currentOverrides = prev.riderOnlineOverrides || {};
      const nextVal = !isSimRiderOnline(rider, currentOverrides);
      return {
        ...prev,
        riderOnlineOverrides: {
          ...currentOverrides,
          [rider.id]: nextVal,
        },
      };
    });
  };

  const hydratedTasks = useMemo(
    () =>
      simState.simTasks
        .map((s) => hydrateSimTask(s, completedTaskTimes[s.taskId]))
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()),
    [simState.simTasks, completedTaskTimes]
  );

  const isSimTaskRunnable = (t: SimTaskItem): boolean =>
    t.legType === "delivery" ? t.isReady && t.isCsoPaid : t.isReady;

  const isManRiderObj = (r: Rider): boolean =>
    r.id === "RIDER-005" ||
    (r.nickname || "").trim().toLowerCase() === "man" ||
    (r.name || "").trim().toLowerCase().startsWith("man ");

  // Build candidate riders using their current recorded position (last completed stop or branch origin)
  // and ONLY their remaining uncompleted RUNNABLE tasks so Not-Ready/Unpaid staging jobs never distort active ETAs!
  const buildSimCandidates = (currentState: PersistedSimState) => {
    const compMap = currentState.completedTaskTimes || {};
    const lastLocMap = currentState.riderLastLocations || {};
    const curHour = currentState.simClockHour ?? 10;
    const simClockRef = getSimClockDate(curHour);

    const tasks = currentState.simTasks
      .map((s) => hydrateSimTask(s, compMap[s.taskId]))
      .sort((a, b) => {
        const tierA = a.expressInfo?.isExpress ? (a.expressInfo.is100 ? 2 : 1) : 0;
        const tierB = b.expressInfo?.isExpress ? (b.expressInfo.is100 ? 2 : 1) : 0;
        if (tierA !== tierB) return tierB - tierA;
        return a.scheduledAt.getTime() - b.scheduledAt.getTime();
      });

    const branchInfos = shopLocations.map((s) => ({
      id: s.id,
      name: s.name,
      coords: s.coords,
      area: s.area,
    }));

    const riderStackMap = new Map<string, SimTaskItem[]>();
    riders.forEach((r) => riderStackMap.set(r.id, []));
    for (const t of tasks) {
      const rec = currentState.assignments[t.taskId];
      if (rec) {
        const arr = riderStackMap.get(rec.simRiderId);
        if (arr) arr.push(t);
      }
    }

    const candidates: CandidateRiderForAutoAssign<SimTaskItem>[] = riders
      .filter((r) => isSimRiderOnline(r, currentState.riderOnlineOverrides || {}))
      .map((r) => {
        const fullStack = riderStackMap.get(r.id) || [];
        const remainingRunnable = fullStack.filter((t) => !t.isCompleted && isSimTaskRunnable(t));
        const pendingBlocked = fullStack.filter((t) => !t.isCompleted && !isSimTaskRunnable(t));
        const effBranchId = getSimRiderBranchId(r, currentState.riderBranchOverrides || {});
        const riderBranch = shopLocations.find((s) => s.id === effBranchId) || null;
        const origin = lastLocMap[r.id]?.coords || riderBranch?.coords || getRiderOriginCoords(r);
        return {
          riderId: r.id,
          riderName: r.name,
          riderNickname: r.nickname,
          status: "online",
          area: riderBranch?.area || null,
          homeBranchId: effBranchId,
          origin,
          hasLiveGps: Boolean(lastLocMap[r.id]?.coords),
          currentTasks: remainingRunnable,
          totalDayCount: fullStack.length,
          pendingTasksCount: pendingBlocked.length,
          isDedicatedReserveRider: isManRiderObj(r),
          baseEval: optimizeSmartRiderRoute(origin, remainingRunnable, {
            branches: branchInfos,
            referenceTime: simClockRef,
            fallbackOriginCoords: origin,
            respectStrictTimeWindows: currentState.settings.respectStrictTimeWindows,
            ignoreNonMeetupTimeWindows: Boolean(currentState.settings.ignoreNonMeetupTimeWindows),
            ignoreBranchRouting: Boolean(currentState.settings.ignoreBranchRouting),
          }),
        };
      });

    return { tasks, branchInfos, simClockRef, candidates, riderStackMap };
  };

  // Master 5-Wave Optimal Dispatch Engine:
  // Wave 1: Dedicated Corporate (Prime Syn / Evolve -> Rider Man only)
  // Wave 2: Express Runnable Jobs (EXP 100% -> EXP 50%, strict on-time ETA)
  // Wave 3: Zero-Idle Online Rider Seeding (Global best [IdleRider, Task] branch-matched pair)
  // Wave 4: Standard Runnable Jobs (Same-Condo/Branch-Sweep bundle -> Chronological best-fit -> Extended zone fallback)
  // Wave 5: Blocked Staging Jobs (Not Ready / Unpaid CSO -> Pre-assigned to matching branch & zone at bottom of stack)
  const assignOneNextTask = (
    currentState: PersistedSimState
  ): { nextState: PersistedSimState; assignedTaskId: string | null } => {
    const { tasks, branchInfos, simClockRef, candidates, riderStackMap } = buildSimCandidates(currentState);

    const unassigned = tasks.filter((t) => !currentState.assignments[t.taskId]);
    if (unassigned.length === 0 || candidates.length === 0) {
      return { nextState: currentState, assignedTaskId: null };
    }

    const manRider = riders.find(isManRiderObj);
    const manRiderIds = manRider ? [manRider.id] : ["RIDER-005"];

    const commitAssignment = (
      task: SimTaskItem,
      suggestion: RiderAutoAssignSuggestion,
      prefixTag?: string
    ): { nextState: PersistedSimState; assignedTaskId: string } => {
      const isManDedicated = isDedicatedCorporateManTask(task);
      const tags: string[] = [];
      if (isManDedicated) tags.push("Dedicated Rider (Man Only)");
      if (prefixTag) tags.push(prefixTag);
      tags.push(suggestion.reason);

      return {
        nextState: {
          ...currentState,
          assignments: {
            ...currentState.assignments,
            [task.taskId]: {
              taskId: task.taskId,
              jobId: task.job.id,
              legType: task.legType,
              simRiderId: suggestion.riderId,
              assignedAt: new Date().toISOString(),
              reason: tags.join(" • "),
              detourKm: suggestion.detourKm,
              distFromRiderKm: suggestion.distFromRiderKm,
              distToNearestStopKm: suggestion.distToNearestStopKm,
              score: Math.round(suggestion.score * 100) / 100,
              insertedStopNumber: suggestion.insertedStopNumber,
            },
          },
        },
        assignedTaskId: task.taskId,
      };
    };

    const evalTask = (
      task: SimTaskItem,
      poolCandidates: CandidateRiderForAutoAssign<SimTaskItem>[],
      ignoreRadius = false,
      allowLateIfUnavoidable = false
    ): RiderAutoAssignSuggestion | null => {
      const jobBranch = task.job.branchId
        ? shopLocations.find((s) => s.id === task.job.branchId)
        : null;
      const isManDedicated = isDedicatedCorporateManTask(task);
      return suggestBestRiderForTask(task, poolCandidates, {
        branches: branchInfos,
        referenceTime: simClockRef,
        maxRadiusKm: currentState.settings.maxRadiusKm,
        maxStopsPerRider: currentState.settings.maxDailyJobs,
        maxDailyTotalStops: currentState.settings.maxDailyJobs,
        shiftEndHour: currentState.settings.shiftEndHour,
        jobArea: jobBranch?.area || null,
        allowedRiderIds: isManDedicated ? manRiderIds : undefined,
        excludedRiderIds: currentState.rejectedRiderIdsByTask?.[task.taskId],
        respectStrictTimeWindows: currentState.settings.respectStrictTimeWindows,
        strictLateOnlyMeetup: true,
        ignoreNonMeetupTimeWindows: Boolean(currentState.settings.ignoreNonMeetupTimeWindows),
        disableWorkloadBalance: Boolean(currentState.settings.disableWorkloadBalance),
        ignoreBranchRouting: Boolean(currentState.settings.ignoreBranchRouting),
        ignoreRadiusLimit: ignoreRadius,
        allowLateIfUnavoidable,
      });
    };

    const runnableUnassigned = unassigned.filter(isSimTaskRunnable);
    const blockedUnassigned = unassigned.filter((t) => !isSimTaskRunnable(t));
    const hasPendingCorporate = unassigned.some((t) => isDedicatedCorporateManTask(t));

    // WAVE 1: Dedicated Corporate Runnable Jobs (Prime Syn / Evolve -> Man Only)
    const corporateRunnable = runnableUnassigned.filter((t) => isDedicatedCorporateManTask(t));
    for (const corpTask of corporateRunnable) {
      const sug =
        evalTask(corpTask, candidates, false, false) ||
        evalTask(corpTask, candidates, true, false) ||
        evalTask(corpTask, candidates, true, true);
      if (sug) return commitAssignment(corpTask, sug);
    }

    // WAVE 2: Express Runnable Jobs (EXP 100% -> EXP 50%, guaranteed on-time priority)
    const expressRunnable = runnableUnassigned.filter(
      (t) => Boolean(t.expressInfo?.isExpress) && !isDedicatedCorporateManTask(t)
    );
    for (const expTask of expressRunnable) {
      const sug =
        evalTask(expTask, candidates, false, false) ||
        evalTask(expTask, candidates, true, false) ||
        evalTask(expTask, candidates, true, true);
      if (sug) return commitAssignment(expTask, sug);
    }

    // WAVE 3A: Mandatory Start-At-Branch Laundry Load! (Skipped when ignoreBranchRouting is enabled)
    if (!currentState.settings.ignoreBranchRouting) {
      const ridersWithoutHomeBranchLoad = candidates.filter((c) => {
      if (c.isDedicatedReserveRider && hasPendingCorporate && (c.totalDayCount ?? 0) > 0) return false;
      const hasHomeDelivery = c.currentTasks.some(
        (ct) => ct.legType === "delivery" && ct.laundryBranchId === c.homeBranchId
      );
      return !hasHomeDelivery;
    });
    if (ridersWithoutHomeBranchLoad.length > 0) {
      const runnableDeliveries = runnableUnassigned.filter(
        (t) => t.legType === "delivery" && !isDedicatedCorporateManTask(t)
      );
      if (runnableDeliveries.length > 0) {
        for (const ignoreRad of [false, true]) {
          let bestStartTask: SimTaskItem | null = null;
          let bestStartSug: RiderAutoAssignSuggestion | null = null;
          for (const dTask of runnableDeliveries) {
            const sameBranchRiders = ridersWithoutHomeBranchLoad.filter(
              (c) => c.homeBranchId === dTask.laundryBranchId
            );
            if (sameBranchRiders.length === 0) continue;
            const sug = evalTask(dTask, sameBranchRiders, ignoreRad);
            if (sug && (!bestStartSug || sug.score < bestStartSug.score)) {
              bestStartSug = sug;
              bestStartTask = dTask;
            }
          }
          if (bestStartTask && bestStartSug) {
            return commitAssignment(bestStartTask, bestStartSug, "🏁 Start รับผ้าที่สาขาก่อน");
          }
        }
      }
    }
    }

    // WAVE 3B: Zero-Idle Online Rider Seeding (Fallback if a branch had fewer Deliveries than Riders)
    const idleCandidates = candidates.filter(
      (c) =>
        (c.totalDayCount ?? 0) === 0 &&
        !(c.isDedicatedReserveRider && hasPendingCorporate)
    );
    if (idleCandidates.length > 0 && runnableUnassigned.length > 0) {
      const nonCorpRunnable = runnableUnassigned.filter((t) => !isDedicatedCorporateManTask(t));
      for (const ignoreRad of [false, true]) {
        let bestSeedTask: SimTaskItem | null = null;
        let bestSeedSug: RiderAutoAssignSuggestion | null = null;
        for (const t of nonCorpRunnable) {
          const sug = evalTask(t, idleCandidates, ignoreRad);
          if (sug && (!bestSeedSug || sug.score < bestSeedSug.score)) {
            bestSeedSug = sug;
            bestSeedTask = t;
          }
        }
        if (bestSeedTask && bestSeedSug) {
          return commitAssignment(bestSeedTask, bestSeedSug, "Initial Branch Seed");
        }
      }
    }

    // WAVE 4: Standard Runnable Jobs
    const standardRunnable = runnableUnassigned.filter((t) => !isDedicatedCorporateManTask(t));
    if (standardRunnable.length > 0) {
      // 4A: Lock in Ultra-High Synergy Bundles first (Same-Condo <= 0.15km or balanced Home-Branch Sweep)
      let bestSynergyTask: SimTaskItem | null = null;
      let bestSynergySug: RiderAutoAssignSuggestion | null = null;
      for (const t of standardRunnable) {
        const sug = evalTask(t, candidates, false);
        if (!sug) continue;
        const isSameCondo = sug.distToNearestStopKm <= 0.15;
        const wonCand = candidates.find((c) => c.riderId === sug.riderId);
        const areaCands = candidates.filter((c) => !wonCand?.area || !c.area || c.area === wonCand.area);
        const minAreaCount = areaCands.length > 0 ? Math.min(...areaCands.map((c) => c.totalDayCount ?? 0)) : 0;
        const withinBalance =
          Boolean(currentState.settings.disableWorkloadBalance) ||
          (wonCand?.totalDayCount ?? 0) - minAreaCount <= 2;
        if ((isSameCondo || (sug.score <= -1.2 && withinBalance)) && (!bestSynergySug || sug.score < bestSynergySug.score)) {
          bestSynergySug = sug;
          bestSynergyTask = t;
        }
      }
      if (bestSynergyTask && bestSynergySug) {
        return commitAssignment(bestSynergyTask, bestSynergySug);
      }

      // 4B: Chronological Best-Fit within maxRadiusKm
      for (const t of standardRunnable) {
        const sug = evalTask(t, candidates, false);
        if (sug) return commitAssignment(t, sug);
      }

      // 4C: Extended Area Sweep Fallback (absorbs outlying stops in the same city while keeping Meetup/Express on-time!)
      let bestFallbackTask: SimTaskItem | null = null;
      let bestFallbackSug: RiderAutoAssignSuggestion | null = null;
      for (const t of standardRunnable) {
        const sug = evalTask(t, candidates, true, false) || evalTask(t, candidates, true, true);
        if (sug && (!bestFallbackSug || sug.score < bestFallbackSug.score)) {
          bestFallbackSug = sug;
          bestFallbackTask = t;
        }
      }
      if (bestFallbackTask && bestFallbackSug) {
        return commitAssignment(bestFallbackTask, bestFallbackSug, "Extended Zone Fit");
      }
    }

    // WAVE 5: Pre-Assign Blocked Jobs (Not Ready / Unpaid CSO -> Staged at bottom of best branch/zone rider)
    if (blockedUnassigned.length > 0) {
      const sortedBlocked = [...blockedUnassigned].sort((a, b) => {
        const corpA = isDedicatedCorporateManTask(a) ? 1 : 0;
        const corpB = isDedicatedCorporateManTask(b) ? 1 : 0;
        if (corpA !== corpB) return corpB - corpA;
        const expA = a.expressInfo?.isExpress ? (a.expressInfo.is100 ? 2 : 1) : 0;
        const expB = b.expressInfo?.isExpress ? (b.expressInfo.is100 ? 2 : 1) : 0;
        if (expA !== expB) return expB - expA;
        return a.scheduledAt.getTime() - b.scheduledAt.getTime();
      });

      for (const bTask of sortedBlocked) {
        const isManDedicated = isDedicatedCorporateManTask(bTask);
        const jobBranch = bTask.job.branchId
          ? shopLocations.find((s) => s.id === bTask.job.branchId)
          : null;
        const jobAreaUpper = (jobBranch?.area || "").toUpperCase();

        let bestCand: CandidateRiderForAutoAssign<SimTaskItem> | null = null;
        let bestStagingScore = Infinity;
        let bestDistKm = 0;

        for (const cand of candidates) {
          if (isManDedicated && !manRiderIds.includes(cand.riderId)) continue;
          if ((currentState.rejectedRiderIdsByTask?.[bTask.taskId] || []).includes(cand.riderId)) continue;
          const dayCount = cand.totalDayCount ?? 0;
          if (dayCount >= currentState.settings.maxDailyJobs) continue;
          if (jobAreaUpper && cand.area && cand.area.toUpperCase() !== jobAreaUpper) continue;

          const distOrigin = isValidLatLng(cand.origin) && isValidLatLng(bTask.targetCoords)
            ? calculateEstimatedDistanceKm(cand.origin, bTask.targetCoords)
            : 8;
          const fullStack = riderStackMap.get(cand.riderId) || [];
          let minStopDist = distOrigin;
          let sameLaundryBranchCount = 0;
          let sumLat = 0;
          let sumLng = 0;
          let coordCount = 0;
          for (const st of fullStack) {
            if (st.laundryBranchId === bTask.laundryBranchId) sameLaundryBranchCount++;
            if (isValidLatLng(st.targetCoords) && isValidLatLng(bTask.targetCoords)) {
              const d = calculateEstimatedDistanceKm(st.targetCoords, bTask.targetCoords);
              if (d < minStopDist) minStopDist = d;
              const w = coordCount === 0 ? 2 : 1;
              sumLat += st.targetCoords.lat * w;
              sumLng += st.targetCoords.lng * w;
              coordCount += w;
            }
          }
          const distFromZoneCentroid =
            coordCount > 0 && isValidLatLng(bTask.targetCoords)
              ? calculateEstimatedDistanceKm({ lat: sumLat / coordCount, lng: sumLng / coordCount }, bTask.targetCoords)
              : distOrigin;
          const zoneCohesionPenalty =
            coordCount > 0
              ? distFromZoneCentroid * 0.65 + (distFromZoneCentroid <= 2.5 ? -2.0 : 0)
              : 0;

          const areaEligible = candidates.filter(
            (c) =>
              (!isManDedicated || manRiderIds.includes(c.riderId)) &&
              !(currentState.rejectedRiderIdsByTask?.[bTask.taskId] || []).includes(c.riderId) &&
              (!jobAreaUpper || !c.area || c.area.toUpperCase() === jobAreaUpper)
          );
          const minDayInArea =
            areaEligible.length > 0 ? Math.min(...areaEligible.map((c) => c.totalDayCount ?? 0)) : 0;
          const excessJobs = Math.max(0, dayCount - minDayInArea);

          const balancePenalty = currentState.settings.disableWorkloadBalance
            ? 0
            : excessJobs * 2.0;

          let stagingScore = minStopDist * 0.35 + zoneCohesionPenalty + dayCount * (currentState.settings.disableWorkloadBalance ? 0.05 : 0.45) + balancePenalty;
          if (dayCount === 0) stagingScore -= 8.0;
          if (!currentState.settings.ignoreBranchRouting) {
            if (cand.homeBranchId === bTask.laundryBranchId) stagingScore -= 3.5;
            else if (sameLaundryBranchCount > 0) stagingScore -= 2.0;
          }
          if (cand.isDedicatedReserveRider && !isManDedicated && dayCount > 0) stagingScore += 1.2;

          if (stagingScore < bestStagingScore) {
            bestStagingScore = stagingScore;
            bestCand = cand;
            bestDistKm = Math.round(minStopDist * 10) / 10;
          }
        }

        if (bestCand) {
          const stagingSug: RiderAutoAssignSuggestion = {
            riderId: bestCand.riderId,
            riderName: bestCand.riderName,
            riderNickname: bestCand.riderNickname,
            detourKm: 0,
            distFromRiderKm: bestDistKm,
            distToNearestStopKm: bestDistKm,
            insertedStopNumber: (bestCand.totalDayCount ?? 0) + 1,
            score: bestStagingScore,
            reason: `⏳ Pre-staged @ ${bTask.laundryBranchLabel} (รอ Ready / CSO Paid • โซนห่าง ${bestDistKm} km)`,
          };
          return commitAssignment(bTask, stagingSug);
        }
      }
    }

    return { nextState: currentState, assignedTaskId: null };
  };

  // Staggered drip timer when "Auto Assign" is running (ทยอยกระจายงานทีละใบ)
  useEffect(() => {
    if (!isAutoAssignRunning) return;

    const timer = setInterval(() => {
      setSimState((prev) => {
        const { nextState, assignedTaskId } = assignOneNextTask(prev);
        if (!assignedTaskId) {
          setIsAutoAssignRunning(false);
          return prev;
        }
        return nextState;
      });
    }, 150);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoAssignRunning, riders, shopLocations]);

  // Sync Live Production Queue (for mode === "live_shadow", read-only pull from allJobs)
  const handleSyncLiveQueue = () => {
    setIsAutoAssignRunning(false);
    setIsTimePlaying(false);
    setSimState((prev) => ({
      ...prev,
      simTasks: liveProductionTasks,
      assignments: {},
      simClockHour: 10,
      completedTaskTimes: {},
      riderLastLocations: {},
      rejectedRiderIdsByTask: {},
      nextSeq: liveProductionTasks.length + 1,
    }));
    toast.success(`ดึงคิวงานจริงจาก Production จำนวน ${liveProductionTasks.length} งานเข้า Unassigned เรียบร้อย (โหมดดูอย่างเดียว ไม่ส่งงานจริง)`);
  };

  // Clear only the shadow assignments in Live Queue (returns all jobs to Unassigned without touching real jobs)
  const handleClearLiveAssignments = () => {
    setIsAutoAssignRunning(false);
    setIsTimePlaying(false);
    setSimState((prev) => ({
      ...prev,
      assignments: {},
      simClockHour: 10,
      completedTaskTimes: {},
      riderLastLocations: {},
      rejectedRiderIdsByTask: {},
    }));
    toast.success("เคลียร์งานที่จัดใน Auto-Assign Live Queue กลับไป Unassigned เรียบร้อยแล้ว");
  };

  // 1. Start Simulation: Generate selected number of random CRM jobs (mixed Pickup & Delivery) into Unassigned
  const handleStartSimulation = () => {
    if (eligibleCrmPool.length === 0) {
      toast.error("ไม่พบข้อมูลลูกค้าใน CRM ที่มีพิกัด GPS สำหรับโซนที่เลือก");
      return;
    }
    setIsAutoAssignRunning(false);
    setIsTimePlaying(false);
    const batchSize = Math.max(1, Math.min(300, simBatchSize || 35));
    const balancedDates = buildBalancedSimSlotDates(batchSize);
    const newTasks: SerializedSimTask[] = [];
    for (let i = 1; i <= batchSize; i++) {
      const t = createRandomSimTask(
        i,
        eligibleCrmPool,
        shopLocations,
        effectiveArea,
        undefined,
        balancedDates[i - 1]
      );
      if (t) newTasks.push(t);
    }

    // Ensure each online rider's starting branch has enough initial runnable Delivery bags so every rider starts by loading laundry at their branch!
    const onlineRidersNow = riders.filter((r) => isSimRiderOnline(r, simState.riderOnlineOverrides || {}));
    if (newTasks.length >= onlineRidersNow.length) {
      const neededByBranch = new Map<string, number>();
      for (const r of onlineRidersNow) {
        const hb = getSimRiderBranchId(r, simState.riderBranchOverrides || {});
        neededByBranch.set(hb, (neededByBranch.get(hb) || 0) + 1);
      }
      for (const [hb, neededCount] of neededByBranch.entries()) {
        const hbShop = shopLocations.find((s) => s.id === hb);
        const hbArea = (hbShop?.area || "BKK").toUpperCase();
        let currentReadyDeliv = newTasks.filter(
          (t) => t.legType === "delivery" && t.laundryBranchId === hb && t.isReady !== false && t.isCsoPaid !== false
        ).length;

        for (const t of newTasks) {
          if (currentReadyDeliv >= neededCount) break;
          const tShop = shopLocations.find((s) => s.id === t.branchId);
          const tArea = (tShop?.area || "BKK").toUpperCase();
          if (tArea !== hbArea) continue;
          if (t.legType === "delivery" && t.laundryBranchId === hb && t.isReady !== false && t.isCsoPaid !== false) {
            continue;
          }
          // Avoid stealing another branch's required ready delivery
          if (t.legType === "delivery" && t.isReady !== false && t.isCsoPaid !== false && t.laundryBranchId !== hb) {
            const otherCount = newTasks.filter(
              (x) => x.legType === "delivery" && x.laundryBranchId === t.laundryBranchId && x.isReady !== false && x.isCsoPaid !== false
            ).length;
            if (otherCount <= (neededByBranch.get(t.laundryBranchId || "") || 0)) continue;
          }
          t.legType = "delivery";
          t.taskId = `${t.jobId}-delivery`;
          t.laundryBranchId = hb;
          t.isReady = true;
          t.isCsoPaid = true;
          currentReadyDeliv++;
        }
      }
    }

    setSimState((prev) => ({
      ...prev,
      simTasks: newTasks,
      assignments: {},
      simClockHour: 10,
      completedTaskTimes: {},
      riderLastLocations: {},
      rejectedRiderIdsByTask: {},
      nextSeq: batchSize + 1,
    }));
    toast.success(`สุ่มงานจาก CRM จำนวน ${newTasks.length} งานเข้าคิว Unassigned เรียบร้อย`);
  };

  // 2. Add 1 Random Pickup Job from CRM
  const handleAddSinglePickupJob = () => {
    if (eligibleCrmPool.length === 0) {
      toast.error("ไม่พบข้อมูลลูกค้าใน CRM ที่มีพิกัด GPS สำหรับโซนที่เลือก");
      return;
    }
    setSimState((prev) => {
      const currentPlayHour = prev.simClockHour ?? 10;
      const targetHour = Math.min(20, currentPlayHour + 1);
      const scheduledDate = getSimClockDate(targetHour);
      const task = createRandomSimTask(
        prev.nextSeq,
        eligibleCrmPool,
        shopLocations,
        effectiveArea,
        "pickup",
        scheduledDate
      );
      if (!task) return prev;
      toast.success(
        `เพิ่มงานรับ #${task.jobId} (${task.customerName}) รอบ ${format(scheduledDate, "HH:mm")} เข้า Unassigned แล้ว`
      );
      return {
        ...prev,
        simTasks: [...prev.simTasks, task],
        nextSeq: prev.nextSeq + 1,
      };
    });
  };

  // 3. Clear All Jobs
  const handleClearAllJobs = () => {
    setIsAutoAssignRunning(false);
    setIsTimePlaying(false);
    setSimState((prev) => ({
      ...prev,
      simTasks: [],
      assignments: {},
      simClockHour: 10,
      completedTaskTimes: {},
      riderLastLocations: {},
      rejectedRiderIdsByTask: {},
      nextSeq: 1,
    }));
    toast.success("เคลียร์งาน Simulation ทั้งหมดเรียบร้อยแล้ว");
  };

  // Cancel an assigned job -> return it to Unassigned and exclude the cancelled rider from re-assignment
  const handleCancelAssignedTask = (taskId: string, riderId: string, jobId: string, riderLabel: string) => {
    setSimState((prev) => {
      const nextAssignments = { ...prev.assignments };
      delete nextAssignments[taskId];
      const prevRejected = prev.rejectedRiderIdsByTask?.[taskId] || [];
      const nextRejected = prevRejected.includes(riderId) ? prevRejected : [...prevRejected, riderId];
      return {
        ...prev,
        assignments: nextAssignments,
        rejectedRiderIdsByTask: {
          ...(prev.rejectedRiderIdsByTask || {}),
          [taskId]: nextRejected,
        },
      };
    });
    toast.info(`ยกเลิกงาน #${jobId} จาก ${riderLabel} → ส่งกลับ Unassigned แล้ว (จะไม่จ่ายกลับให้คนเดิม)`);
  };

  // 4. Step (+1)
  const handleStepOne = () => {
    setSimState((prev) => {
      const { nextState, assignedTaskId } = assignOneNextTask(prev);
      if (!assignedTaskId) {
        toast.info("ไม่มีงานที่เข้าเงื่อนไขจ่ายเพิ่มได้แล้ว (อาจเกินรัศมี / ครบโควตา / เกินเวลา)");
        return prev;
      }
      return nextState;
    });
  };

  // Advance Simulation Clock by +1 Hour: complete runnable stops arriving before new clock & record rider's last location
  const advanceSimulationOneHour = (currentState: PersistedSimState): PersistedSimState => {
    const curHour = currentState.simClockHour ?? 10;
    if (curHour >= 20) return currentState;
    const nextHour = Math.min(20, curHour + 1);
    const prevClockDate = getSimClockDate(curHour);
    const nextClockDate = getSimClockDate(nextHour);

    const compMap = { ...(currentState.completedTaskTimes || {}) };
    const lastLocMap = { ...(currentState.riderLastLocations || {}) };
    const branchInfos = shopLocations.map((s) => ({
      id: s.id,
      name: s.name,
      coords: s.coords,
      area: s.area,
    }));

    const tasks = currentState.simTasks.map((s) => hydrateSimTask(s, compMap[s.taskId]));

    for (const rider of riders) {
      const effBranchId = getSimRiderBranchId(rider, currentState.riderBranchOverrides || {});
      const riderBranch = shopLocations.find((s) => s.id === effBranchId) || null;
      const startOrigin = lastLocMap[rider.id]?.coords || riderBranch?.coords || getRiderOriginCoords(rider);

      const riderTasks = tasks.filter(
        (t) =>
          currentState.assignments[t.taskId]?.simRiderId === rider.id &&
          !compMap[t.taskId] &&
          (t.legType === "delivery" ? t.isReady && t.isCsoPaid : t.isReady)
      );
      if (riderTasks.length === 0) continue;

      const evalRes = optimizeSmartRiderRoute(startOrigin, riderTasks, {
        branches: branchInfos,
        referenceTime: prevClockDate,
        fallbackOriginCoords: startOrigin,
        respectStrictTimeWindows: currentState.settings.respectStrictTimeWindows,
        ignoreNonMeetupTimeWindows: Boolean(currentState.settings.ignoreNonMeetupTimeWindows),
        ignoreBranchRouting: Boolean(currentState.settings.ignoreBranchRouting),
      });

      for (const stop of evalRes.stops) {
        if (stop.estimatedArrivalAt.getTime() <= nextClockDate.getTime()) {
          const completedTimeStr = format(stop.estimatedArrivalAt, "HH:mm");
          compMap[stop.task.taskId] = completedTimeStr;
          if (isValidLatLng(stop.task.targetCoords)) {
            lastLocMap[rider.id] = {
              coords: stop.task.targetCoords,
              locationName: stop.task.targetLocation,
              jobId: stop.task.job.id,
              atTimeStr: completedTimeStr,
              atHour: nextHour,
            };
          }
        }
      }
    }

    return {
      ...currentState,
      simClockHour: nextHour,
      completedTaskTimes: compMap,
      riderLastLocations: lastLocMap,
    };
  };

  useEffect(() => {
    if (!isTimePlaying) return;
    const timer = setInterval(() => {
      setSimState((prev) => {
        if ((prev.simClockHour ?? 10) >= 20) {
          setIsTimePlaying(false);
          return prev;
        }
        return advanceSimulationOneHour(prev);
      });
    }, 1800);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimePlaying, riders, shopLocations]);

  const handleNextHour = () => {
    setSimState((prev) => advanceSimulationOneHour(prev));
  };

  const handleResetClock = () => {
    setIsTimePlaying(false);
    setSimState((prev) => ({
      ...prev,
      simClockHour: 10,
      completedTaskTimes: {},
      riderLastLocations: {},
    }));
    toast.info("รีเซ็ตเวลา Simulation กลับไปที่ 10:00 น. แล้ว");
  };

  // Re-evaluate a task when it becomes Ready + CSO Paid (it may re-route to a better qualified rider at current sim time)
  const maybeRerouteNewlyUnlockedTask = (nextState: PersistedSimState, taskId: string): PersistedSimState => {
    const compMap = nextState.completedTaskTimes || {};
    if (compMap[taskId]) return nextState; // Already completed

    const serialized = nextState.simTasks.find((s) => s.taskId === taskId);
    if (!serialized) return nextState;
    const task = hydrateSimTask(serialized, undefined);
    const isRunnable = task.legType === "delivery" ? task.isReady && task.isCsoPaid : task.isReady;
    if (!isRunnable) return nextState;

    const existingRec = nextState.assignments[taskId];
    const { branchInfos, simClockRef, candidates } = buildSimCandidates(nextState);
    // Exclude this task itself from candidates' baseEval before re-evaluating best rider
    const cleanCandidates = candidates.map((c) => {
      const filteredTasks = c.currentTasks.filter((t) => t.taskId !== taskId);
      const otherDayCount = nextState.simTasks.filter(
        (s) => s.taskId !== taskId && nextState.assignments[s.taskId]?.simRiderId === c.riderId
      ).length;
      return {
        ...c,
        currentTasks: filteredTasks,
        totalDayCount: otherDayCount,
        baseEval: optimizeSmartRiderRoute(c.origin, filteredTasks, {
          branches: branchInfos,
          referenceTime: simClockRef,
          fallbackOriginCoords: c.origin,
          respectStrictTimeWindows: nextState.settings.respectStrictTimeWindows,
          ignoreNonMeetupTimeWindows: Boolean(nextState.settings.ignoreNonMeetupTimeWindows),
          ignoreBranchRouting: Boolean(nextState.settings.ignoreBranchRouting),
        }),
      };
    });

    const isManDedicatedJob = isDedicatedCorporateManTask(task);
    let allowedRiderIds: string[] | undefined = undefined;
    if (isManDedicatedJob) {
      const manRider = riders.find(isManRiderObj);
      allowedRiderIds = manRider ? [manRider.id] : ["RIDER-005"];
    }

    const jobBranch = task.job.branchId ? shopLocations.find((s) => s.id === task.job.branchId) : null;
    const baseOpts = {
      branches: branchInfos,
      referenceTime: simClockRef,
      maxRadiusKm: nextState.settings.maxRadiusKm,
      maxStopsPerRider: nextState.settings.maxDailyJobs,
      maxDailyTotalStops: nextState.settings.maxDailyJobs,
      shiftEndHour: nextState.settings.shiftEndHour,
      jobArea: jobBranch?.area || null,
      allowedRiderIds,
      excludedRiderIds: nextState.rejectedRiderIdsByTask?.[taskId],
      respectStrictTimeWindows: nextState.settings.respectStrictTimeWindows,
      strictLateOnlyMeetup: true,
      ignoreNonMeetupTimeWindows: Boolean(nextState.settings.ignoreNonMeetupTimeWindows),
      disableWorkloadBalance: Boolean(nextState.settings.disableWorkloadBalance),
      ignoreBranchRouting: Boolean(nextState.settings.ignoreBranchRouting),
    };
    const suggestion =
      suggestBestRiderForTask(task, cleanCandidates, baseOpts) ||
      suggestBestRiderForTask(task, cleanCandidates, { ...baseOpts, ignoreRadiusLimit: true });

    if (!suggestion) return nextState;

    const changedRider = existingRec && existingRec.simRiderId !== suggestion.riderId;
    if (changedRider) {
      toast.success(
        `งาน #${task.job.id} พร้อมส่งแล้ว → เด้งไปหา ${suggestion.riderNickname || suggestion.riderName} (ใกล้จุดล่าสุด ${formatSimClockHour(nextState.simClockHour ?? 10)})`
      );
    }

    return {
      ...nextState,
      assignments: {
        ...nextState.assignments,
        [taskId]: {
          taskId,
          jobId: task.job.id,
          legType: task.legType,
          simRiderId: suggestion.riderId,
          assignedAt: new Date().toISOString(),
          reason: `${changedRider ? "Re-routed @ " + formatSimClockHour(nextState.simClockHour ?? 10) + " • " : ""}${
            isManDedicatedJob ? "Dedicated Rider (Man Only) • " : ""
          }${suggestion.reason}`,
          detourKm: suggestion.detourKm,
          distFromRiderKm: suggestion.distFromRiderKm,
          distToNearestStopKm: suggestion.distToNearestStopKm,
          score: Math.round(suggestion.score * 100) / 100,
          insertedStopNumber: suggestion.insertedStopNumber,
        },
      },
    };
  };

  const toggleTaskReady = (taskId: string) => {
    setSimState((prev) => {
      const updated = {
        ...prev,
        simTasks: prev.simTasks.map((t) =>
          t.taskId === taskId ? { ...t, isReady: !(t.isReady !== false) } : t
        ),
      };
      return maybeRerouteNewlyUnlockedTask(updated, taskId);
    });
  };

  const toggleTaskCsoPaid = (taskId: string) => {
    setSimState((prev) => {
      const updated = {
        ...prev,
        simTasks: prev.simTasks.map((t) =>
          t.taskId === taskId ? { ...t, isCsoPaid: !(t.isCsoPaid !== false) } : t
        ),
      };
      return maybeRerouteNewlyUnlockedTask(updated, taskId);
    });
  };

  const handleAllPaidAndReady = () => {
    setSimState((prev) => {
      if (prev.simTasks.length === 0) return prev;
      return {
        ...prev,
        simTasks: prev.simTasks.map((t) => ({
          ...t,
          isReady: true,
          isCsoPaid: true,
        })),
      };
    });
    toast.success("ตั้งค่าทุกงานเป็น Ready + CSO Paid เรียบร้อย (พร้อมทดสอบ Routing)");
  };

  const updateSetting = <K extends keyof SimSettings>(key: K, value: SimSettings[K]) => {
    setSimState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: value,
      },
    }));
  };

  const { simRiderColumns, unassignedTasks, kpis } = useMemo(() => {
    const branchInfos = shopLocations.map((s) => ({
      id: s.id,
      name: s.name,
      coords: s.coords,
      area: s.area,
    }));
    const simClockRef = new Date();
    simClockRef.setHours(10, 0, 0, 0);

    const cols = riders.map((rider) => {
      const stackEntries: Array<{ task: SimTaskItem; record: SimAssignmentRecord }> = [];
      for (const task of hydratedTasks) {
        const rec = assignments[task.taskId];
        if (rec && rec.simRiderId === rider.id) {
          stackEntries.push({ task, record: rec });
        }
      }

      const riderHomeBranchId = getSimRiderBranchId(rider, riderBranchOverrides);
      const riderHomeBranchLabel = getSimBranchShortLabel(riderHomeBranchId);

      const isTaskRunnable = (t: SimTaskItem) =>
        t.legType === "delivery" ? t.isReady && t.isCsoPaid : t.isReady;

      const activeTasks = stackEntries.map((e) => e.task);
      const readyUncompletedTasks = activeTasks.filter((t) => !t.isCompleted && isTaskRunnable(t));
      const riderBranchObj = shopLocations.find((s) => s.id === riderHomeBranchId) || null;
      const lastLoc = riderLastLocations[rider.id];
      const origin = lastLoc?.coords || riderBranchObj?.coords || getRiderOriginCoords(rider);
      const activeEval = optimizeSmartRiderRoute(origin, readyUncompletedTasks, {
        branches: branchInfos,
        referenceTime: getSimClockDate(simClockHour),
        fallbackOriginCoords: origin,
        respectStrictTimeWindows: settings.respectStrictTimeWindows,
        ignoreNonMeetupTimeWindows: Boolean(settings.ignoreNonMeetupTimeWindows),
        ignoreBranchRouting: Boolean(settings.ignoreBranchRouting),
      });

      const stopOrderMap = new Map<string, number>();
      activeEval.stops.forEach((s, idx) => {
        stopOrderMap.set(s.task.taskId, idx);
      });

      // Sort stack:
      // 1. Completed jobs stay on top as history
      // 2. Runnable (Ready+Paid) follow the exact optimized route order (Express prioritized on-time)
      // 3. Blocked (Not Ready / Unpaid CSO) stay at bottom (Express first, then scheduled time)
      stackEntries.sort((a, b) => {
        if (a.task.isCompleted !== b.task.isCompleted) {
          return a.task.isCompleted ? -1 : 1;
        }
        const aRun = isTaskRunnable(a.task);
        const bRun = isTaskRunnable(b.task);
        if (aRun !== bRun) {
          return aRun ? -1 : 1;
        }
        if (aRun && bRun && !a.task.isCompleted && !b.task.isCompleted) {
          const orderA = stopOrderMap.get(a.task.taskId) ?? Number.MAX_SAFE_INTEGER;
          const orderB = stopOrderMap.get(b.task.taskId) ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
        }
        const expA = a.task.expressInfo?.isExpress ? (a.task.expressInfo.is100 ? 2 : 1) : 0;
        const expB = b.task.expressInfo?.isExpress ? (b.task.expressInfo.is100 ? 2 : 1) : 0;
        if (expA !== expB) return expB - expA;
        return a.task.scheduledAt.getTime() - b.task.scheduledAt.getTime();
      });

      const soi15Count = stackEntries.filter((e) => e.task.laundryBranchLabel === "Soi 15").length;
      const pkCount = stackEntries.filter((e) => e.task.laundryBranchLabel === "PK").length;
      const completedCount = stackEntries.filter((e) => e.task.isCompleted).length;

      const pickupCount = activeTasks.filter((t) => t.legType === "pickup").length;
      const deliveryCount = activeTasks.filter((t) => t.legType === "delivery").length;
      const estFinishTime =
        readyUncompletedTasks.length > 0 && activeEval.stops.length > 0
          ? activeEval.stops[activeEval.stops.length - 1].estimatedArrivalAt
          : null;

      const areaCode = (riderBranchObj?.area || "").toUpperCase() === "PTY" ||
        (riderBranchObj?.name || "").toLowerCase().includes("pattaya") ||
        riderHomeBranchId.toLowerCase().includes("pty")
        ? "PTY"
        : "BKK";
      const isSimOnline = isSimRiderOnline(rider, riderOnlineOverrides);

      return {
        rider,
        riderHomeBranchId,
        riderHomeBranchLabel,
        soi15Count,
        pkCount,
        completedCount,
        lastLoc,
        areaCode,
        isSimOnline,
        stackEntries,
        pickupCount,
        deliveryCount,
        totalDistanceKm: activeEval.totalRealDistanceKm,
        estFinishTime,
      };
    });

    cols.sort((a, b) => {
      // 1. Online riders always move to the left first
      const aOnline = a.isSimOnline ? 1 : 0;
      const bOnline = b.isSimOnline ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;

      // 2. BKK before PTY
      const aBkk = a.areaCode === "BKK" ? 1 : 0;
      const bBkk = b.areaCode === "BKK" ? 1 : 0;
      if (aBkk !== bBkk) return bBkk - aBkk;

      // 3. Higher stack count, then name
      if (b.stackEntries.length !== a.stackEntries.length) {
        return b.stackEntries.length - a.stackEntries.length;
      }
      return a.rider.name.localeCompare(b.rider.name);
    });

    const unassigned = hydratedTasks.filter((t) => !assignments[t.taskId]);
    const assignedCount = hydratedTasks.length - unassigned.length;
    const pickupTotal = hydratedTasks.filter((t) => t.legType === "pickup").length;
    const deliveryTotal = hydratedTasks.filter((t) => t.legType === "delivery").length;

    return {
      simRiderColumns: cols,
      unassignedTasks: unassigned,
      kpis: {
        totalSimulatedJobs: hydratedTasks.length,
        assignedCount,
        unassignedCount: unassigned.length,
        pickupTotal,
        deliveryTotal,
      },
    };
  }, [riders, hydratedTasks, assignments, riderOnlineOverrides, riderBranchOverrides, riderLastLocations, simClockHour, shopLocations, getRiderOriginCoords, settings.respectStrictTimeWindows, settings.ignoreNonMeetupTimeWindows, settings.ignoreBranchRouting]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50/70 overflow-hidden">
      {/* Top Simulation Control Bar */}
      <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-col gap-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-sm">
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-slate-900">
                  {isLiveShadow ? "Auto-Assign Live Queue (Admin)" : "Auto-Assign Simulation Lab"}
                </h3>
                <Badge
                  className={
                    isLiveShadow
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold"
                      : "bg-violet-100 text-violet-700 border border-violet-200 text-[10px] font-extrabold"
                  }
                >
                  {isLiveShadow
                    ? "Production Queue • Read-Only (ไม่ส่งงานจริง)"
                    : "CRM Sandbox • No Real Jobs"}
                </Badge>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    syncStatus === "synced"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : syncStatus === "saving" || syncStatus === "loading"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  <Cloud size={10} />
                  {syncStatus === "synced"
                    ? "Synced"
                    : syncStatus === "saving"
                      ? "Saving..."
                      : syncStatus === "loading"
                        ? "Loading..."
                        : "Sync Error"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {isLiveShadow
                  ? `ดึงคิวงานจริงจาก Production (${liveProductionTasks.length.toLocaleString()} งาน) มาจำลอง Auto-Assign ด้วย Logic เดียวกันโดยไม่ส่งข้อมูลไปให้ Rider จริง`
                  : `ดึงลูกค้าจริงจาก CRM (${eligibleCrmPool.length.toLocaleString()} รายที่มีพิกัด) มาสุ่มจำลองงานโดยไม่ยุ่งกับงานจริงในระบบ`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isLiveShadow ? (
              <Button
                type="button"
                size="sm"
                onClick={handleSyncLiveQueue}
                className="h-8 text-xs font-bold gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
                title="ดึงคิวงานจริงล่าสุดจาก Production เข้า Unassigned ใหม่ (ไม่แก้ไขงานจริง)"
              >
                <RefreshCw size={13} />
                ดึงคิวงานจริงใหม่ ({liveProductionTasks.length})
              </Button>
            ) : (
              <>
                <div className="inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50/70 p-0.5 shadow-xs">
                  <select
                    value={simBatchSize}
                    onChange={(e) => setSimBatchSize(Number(e.target.value))}
                    className="h-7 bg-transparent px-2 text-xs font-black text-indigo-800 focus:outline-none cursor-pointer"
                    title="เลือกจำนวนงานที่จะสุ่มเมื่อกด Start Simulation"
                  >
                    <option value={10}>10 งาน</option>
                    <option value={20}>20 งาน</option>
                    <option value={35}>35 งาน</option>
                    <option value={50}>50 งาน</option>
                    <option value={80}>80 งาน</option>
                    <option value={100}>100 งาน</option>
                    <option value={150}>150 งาน</option>
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleStartSimulation}
                    className="h-7 text-xs font-bold gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  >
                    <Play size={13} />
                    Start Simulation
                  </Button>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddSinglePickupJob}
                  className="h-8 text-xs font-bold gap-1.5 rounded-xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 cursor-pointer"
                >
                  <Plus size={13} />
                  เพิ่มงานรับ (+1 สุ่มลูกค้า)
                </Button>
              </>
            )}

            <Button
              type="button"
              size="sm"
              onClick={() => setIsAutoAssignRunning((prev) => !prev)}
              disabled={!isAutoAssignRunning && unassignedTasks.length === 0}
              className={`h-8 text-xs font-bold gap-1.5 rounded-xl cursor-pointer shadow-xs ${
                isAutoAssignRunning
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : "bg-violet-600 hover:bg-violet-700 text-white"
              }`}
            >
              {isAutoAssignRunning ? <Pause size={13} /> : <Sparkles size={13} />}
              {isAutoAssignRunning
                ? "หยุด Auto Assign"
                : `Auto Assign (${unassignedTasks.length})`}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleStepOne}
              disabled={unassignedTasks.length === 0 || isAutoAssignRunning}
              className="h-8 text-xs font-bold gap-1.5 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
            >
              <StepForward size={13} />
              Step (+1)
            </Button>

            {!isLiveShadow ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAllPaidAndReady}
                  disabled={hydratedTasks.length === 0}
                  className="h-8 text-xs font-bold gap-1.5 rounded-xl border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                  title="ตั้งค่าทุกงานให้เป็น Ready และ CSO Paid เพื่อทดสอบ Routing อย่างเดียว"
                >
                  <CheckCircle2 size={13} />
                  All Paid, All Ready
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleClearAllJobs}
                  disabled={hydratedTasks.length === 0}
                  className="h-8 text-xs font-bold gap-1.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <Trash2 size={13} />
                  เคลียร์งาน
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleClearLiveAssignments}
                disabled={Object.keys(assignments).length === 0}
                className="h-8 text-xs font-bold gap-1.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                title="เคลียร์งานที่จัดในคอลัมน์ Rider กลับไป Unassigned (ไม่กระทบงานจริง)"
              >
                <Trash2 size={13} />
                เคลียร์งานที่จัด
              </Button>
            )}

            {/* Simulation Clock Controls (+1 Hr / Play Time) */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/70 p-0.5 shadow-xs">
              <span className="px-2 text-xs font-black text-emerald-800 inline-flex items-center gap-1">
                <Clock size={12} />
                {formatSimClockHour(simClockHour)}
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsTimePlaying((p) => !p)}
                disabled={hydratedTasks.length === 0 || simClockHour >= 20}
                className={`h-7 text-[11px] font-bold gap-1 rounded-lg cursor-pointer ${
                  isTimePlaying
                    ? "bg-amber-500 hover:bg-amber-600 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                }`}
              >
                {isTimePlaying ? <Pause size={11} /> : <Play size={11} />}
                {isTimePlaying ? "Pause" : "Play Time"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleNextHour}
                disabled={hydratedTasks.length === 0 || simClockHour >= 20 || isTimePlaying}
                className="h-7 text-[11px] font-bold gap-1 rounded-lg border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100 cursor-pointer"
              >
                +1 Hr
              </Button>
              {simClockHour > 10 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleResetClock}
                  className="h-7 px-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                  title="รีเซ็ตเวลาเป็น 10:00"
                >
                  10:00
                </Button>
              )}
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={loadFromDb}
              className="h-8 w-8 p-0 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              title="รีเฟรชข้อมูลจาก DB"
            >
              <RefreshCw size={13} className={syncStatus === "loading" ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* Tuning & KPI Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Tuning Parameters */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1 font-bold text-slate-600">
              <SlidersHorizontal size={13} className="text-violet-600" />
              Constraints:
            </span>

            <label className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg cursor-pointer select-none font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.respectStrictTimeWindows}
                onChange={(e) => updateSetting("respectStrictTimeWindows", e.target.checked)}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span>ห้ามแทรกจนงาน Meet up สาย</span>
            </label>

            <button
              type="button"
              onClick={() =>
                updateSetting(
                  "ignoreNonMeetupTimeWindows",
                  !Boolean(settings.ignoreNonMeetupTimeWindows)
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer select-none font-bold border transition-colors ${
                settings.ignoreNonMeetupTimeWindows
                  ? "bg-amber-100 text-amber-900 border-amber-300 shadow-2xs"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70"
              }`}
              title="ตัดเงื่อนไขเวลาของงาน Lobby ออกทั้งหมด (จัดเส้นทางตามระยะทาง/Zone ล้วนๆ) แต่ยังคุมเวลางาน Meet up อย่างเข้มงวด"
            >
              <Clock size={12} />
              <span>
                {settings.ignoreNonMeetupTimeWindows
                  ? "✓ ตัดเวลาออกแล้ว (สนแค่ Meet up)"
                  : "ตัดเวลาออก (สนแค่ Meet up)"}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateSetting(
                  "disableWorkloadBalance",
                  !Boolean(settings.disableWorkloadBalance)
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer select-none font-bold border transition-colors ${
                settings.disableWorkloadBalance
                  ? "bg-sky-100 text-sky-900 border-sky-300 shadow-2xs"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70"
              }`}
              title="ปิดการเฉลี่ยจำนวนงานให้เท่ากัน เพื่อให้ระบบจ่ายงานตาม Zone และระยะทางที่ใกล้ที่สุดเป็นหลัก"
            >
              <SlidersHorizontal size={12} />
              <span>
                {settings.disableWorkloadBalance
                  ? "✓ เอาการเฉลี่ยงานออกแล้ว (เน้นใกล้/Zone)"
                  : "เอาการเฉลี่ยงานออก"}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateSetting(
                  "ignoreBranchRouting",
                  !Boolean(settings.ignoreBranchRouting)
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer select-none font-bold border transition-colors ${
                settings.ignoreBranchRouting
                  ? "bg-purple-100 text-purple-900 border-purple-300 shadow-2xs"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70"
              }`}
              title="ตัดเงื่อนไขว่าผ้าอยู่สาขาไหนหรือต้องส่งคืนซักที่สาขาไหนออก เพื่อทดสอบการจัด Zone และเส้นทางล้วนๆ"
            >
              <span>🏭</span>
              <span>
                {settings.ignoreBranchRouting
                  ? "✓ ตัดเรื่องสาขาออกแล้ว (ไม่สนรับ/คืนสาขา)"
                  : "เอาเงื่อนไขสาขาออก"}
              </span>
            </button>

            <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg font-semibold text-slate-700">
              <span>Max Radius:</span>
              <select
                value={settings.maxRadiusKm}
                onChange={(e) => updateSetting("maxRadiusKm", Number(e.target.value))}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold text-indigo-700 cursor-pointer"
              >
                <option value={2.5}>2.5 km</option>
                <option value={3.5}>3.5 km</option>
                <option value={4.5}>4.5 km</option>
                <option value={6}>6.0 km</option>
                <option value={10}>10.0 km</option>
                <option value={999}>Unlimited (ไม่จำกัด)</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg font-semibold text-slate-700">
              <span>Max Daily:</span>
              <select
                value={settings.maxDailyJobs}
                onChange={(e) => updateSetting("maxDailyJobs", Number(e.target.value))}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold text-indigo-700 cursor-pointer"
              >
                <option value={20}>20 งาน/วัน</option>
                <option value={25}>25 งาน/วัน</option>
                <option value={30}>30 งาน/วัน</option>
                <option value={35}>35 งาน/วัน</option>
                <option value={40}>40 งาน/วัน</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg font-semibold text-slate-700">
              <span>Finish By:</span>
              <select
                value={settings.shiftEndHour ?? "none"}
                onChange={(e) =>
                  updateSetting(
                    "shiftEndHour",
                    e.target.value === "none" ? null : Number(e.target.value)
                  )
                }
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold text-emerald-700 cursor-pointer"
              >
                <option value={17.5}>17:30</option>
                <option value={18}>18:00</option>
                <option value={18.5}>18:30</option>
                <option value={19}>19:00</option>
                <option value="none">ไม่จำกัด</option>
              </select>
            </div>
          </div>

          {/* Live Simulation KPIs */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
              งานจำลองทั้งหมด: <strong className="text-slate-900">{kpis.totalSimulatedJobs}</strong>{" "}
              <span className="text-slate-500 font-medium">
                (P:{kpis.pickupTotal} / D:{kpis.deliveryTotal})
              </span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/70">
              Unassigned: <strong>{kpis.unassignedCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200/70">
              Assigned: <strong>{kpis.assignedCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Simulation Columns */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3.5">
        <div className="flex items-stretch gap-3.5 h-full min-h-0 min-w-max">
          {/* Column 1: Unassigned Queue */}
          <div className="w-[295px] h-full min-h-0 shrink-0 flex flex-col rounded-2xl border border-amber-200/90 bg-amber-50/40">
            <div className="px-3.5 py-3 bg-white rounded-t-2xl border-b border-amber-200/70 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h4 className="text-xs font-black text-slate-900 uppercase">
                    Unassigned Queue
                  </h4>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  งานที่สุ่มจาก CRM รอจ่ายให้ Rider
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                {unassignedTasks.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {unassignedTasks.length === 0 ? (
                <div className="text-center py-10 px-4 text-xs text-slate-400 font-medium">
                  <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                  {hydratedTasks.length === 0
                    ? "กดปุ่ม Start Simulation เพื่อสุ่มงานชุดแรก 35 งาน"
                    : "จ่ายงานออกจากคิว Unassigned ครบแล้ว"}
                </div>
              ) : (
                unassignedTasks.map((task) => (
                  <div
                    key={task.taskId}
                    className={`rounded-xl border border-l-4 p-2.5 shadow-2xs space-y-1.5 ${
                      task.legType === "pickup"
                        ? "border-amber-200 border-l-amber-500 bg-amber-50/45"
                        : "border-sky-200 border-l-sky-600 bg-sky-50/45"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[11px] font-black text-slate-800">
                        #{task.job.id}
                      </span>
                      <div className="flex items-center gap-1">
                        {task.expressInfo?.isExpress && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white inline-flex items-center gap-0.5">
                            <Zap size={8} className="fill-white" />
                            {task.expressInfo.label}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                            task.handoverMode === "meetup"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {task.handoverMode === "meetup" ? "Meet up" : "Lobby"}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase ${
                            task.legType === "pickup"
                              ? "bg-amber-500 text-white"
                              : "bg-sky-600 text-white"
                          }`}
                        >
                          {task.legType}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {task.job.customerName}
                    </p>
                    <div className="flex items-start gap-1.5 text-[13px] font-medium text-slate-700 leading-snug">
                      <MapPin size={13} className="shrink-0 mt-0.5 text-slate-500" />
                      <span className="line-clamp-2">{task.targetLocation}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold">
                      <span
                        className={`px-1.5 py-0.5 rounded border ${
                          task.laundryBranchLabel === "PK"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : task.laundryBranchLabel === "PTY"
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                        }`}
                      >
                        {task.legType === "delivery"
                          ? `📦 ผ้าอยู่: ${task.laundryBranchLabel}`
                          : `🏭 คืนผ้าที่: ${task.laundryBranchLabel}`}
                      </span>
                      {(simState.rejectedRiderIdsByTask?.[task.taskId]?.length || 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200">
                          🚫 เว้น:{" "}
                          {(simState.rejectedRiderIdsByTask?.[task.taskId] || [])
                            .map((rid) => {
                              const r = riders.find((x) => x.id === rid);
                              return r?.nickname || r?.name || rid;
                            })
                            .join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} />
                        {format(task.scheduledAt, "HH:mm")}
                      </span>
                      <div className="flex items-center gap-1">
                        {task.legType === "delivery" && (
                          <button
                            type="button"
                            onClick={() => toggleTaskCsoPaid(task.taskId)}
                            className={`px-1.5 py-0.5 rounded font-bold cursor-pointer border ${
                              task.isCsoPaid
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
                            }`}
                            title="คลิกเพื่อสลับสถานะ CSO Paid"
                          >
                            {task.isCsoPaid ? "✓ CSO Paid" : "💳 รอ CSO Paid"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleTaskReady(task.taskId)}
                          className={`px-1.5 py-0.5 rounded font-bold cursor-pointer border ${
                            task.isReady
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100"
                          }`}
                          title="คลิกเพื่อสลับสถานะ Ready / Not Ready"
                        >
                          {task.isReady ? "✓ Ready" : "⏳ Not Ready"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Rider Simulation Stack Columns */}
          {simRiderColumns.map((col) => {
            const isSimOnline = isSimRiderOnline(col.rider);

            return (
              <div
                key={col.rider.id}
                className={`w-[315px] h-full min-h-0 shrink-0 flex flex-col rounded-2xl border bg-white shadow-2xs transition-opacity ${
                  isSimOnline ? "border-slate-200/90" : "border-slate-200/70 opacity-65"
                }`}
              >
                {/* Rider Header */}
                <div className="px-3.5 py-3 border-b border-slate-200/80 space-y-2 shrink-0 bg-slate-50/70 rounded-t-2xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={col.rider.avatarUrl || "https://i.pravatar.cc/80"}
                          alt={col.rider.name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200"
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            isSimOnline ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-black text-slate-900 truncate">
                            {col.rider.nickname || col.rider.name}
                          </h4>
                          <span
                            className={`px-1 py-0.2 rounded text-[8.5px] font-black shrink-0 ${
                              col.areaCode === "BKK"
                                ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                                : "bg-orange-50 text-orange-700 border border-orange-200/80"
                            }`}
                          >
                            {col.areaCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSimRiderOnline(col.rider)}
                            className={`px-1.5 py-0.5 rounded-full text-[9px] font-black border cursor-pointer transition-colors shrink-0 ${
                              isSimOnline
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200"
                            }`}
                            title="คลิกเพื่อสลับ Online / Offline ใน Simulation"
                          >
                            {isSimOnline ? "● ONLINE" : "○ OFFLINE"}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {col.rider.name}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${
                          col.stackEntries.length >= settings.maxDailyJobs
                            ? "bg-rose-100 text-rose-700"
                            : col.stackEntries.length >= settings.maxDailyJobs - 5
                              ? "bg-amber-100 text-amber-800"
                              : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {col.stackEntries.length}/{settings.maxDailyJobs}
                      </span>
                      {col.estFinishTime && (
                        <span
                          className={`text-[9.5px] font-bold ${
                            settings.shiftEndHour !== null &&
                            col.estFinishTime.getHours() * 60 + col.estFinishTime.getMinutes() >
                              Math.round(settings.shiftEndHour * 60)
                              ? "text-rose-600"
                              : "text-emerald-600"
                          }`}
                        >
                          Est. {format(col.estFinishTime, "HH:mm")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rider Stack Metrics */}
                  <div className="grid grid-cols-4 gap-1 text-center text-[10px] bg-white rounded-xl border border-slate-200/80 p-1.5">
                    <div>
                      <div className="font-black text-amber-600">{col.pickupCount}</div>
                      <div className="text-slate-400 text-[9px]">Pickup</div>
                    </div>
                    <div className="border-l border-slate-100">
                      <div className="font-black text-sky-600">{col.deliveryCount}</div>
                      <div className="text-slate-400 text-[9px]">Delivery</div>
                    </div>
                    <div className="border-l border-slate-100">
                      <div className="font-black text-emerald-700">{col.completedCount}</div>
                      <div className="text-slate-400 text-[9px]">Done</div>
                    </div>
                    <div className="border-l border-slate-100">
                      <div className="font-black text-indigo-700">
                        {col.areaCode === "PTY" ? "PTY" : `15:${col.soi15Count} PK:${col.pkCount}`}
                      </div>
                      <div className="text-slate-400 text-[9px]">สาขา ({col.riderHomeBranchLabel})</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-1.5 text-[10px] bg-white/90 rounded-lg border border-slate-200/70 px-2 py-1">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-slate-400 font-semibold">เริ่ม:</span>
                      <select
                        value={col.riderHomeBranchId}
                        onChange={(e) => setSimRiderBranch(col.rider.id, e.target.value)}
                        className="bg-indigo-50 border border-indigo-200 rounded px-1 py-0.2 text-[10px] font-black text-indigo-800 cursor-pointer focus:outline-none"
                        title="เลือกสาขาเริ่มต้นของ Rider ใน Simulation"
                      >
                        {shopLocations.map((s) => (
                          <option key={s.id} value={s.id}>
                            {getSimBranchShortLabel(s.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span
                      className="text-slate-600 truncate"
                      title={
                        col.lastLoc
                          ? `${col.lastLoc.locationName} (#${col.lastLoc.jobId} @ ${col.lastLoc.atTimeStr})`
                          : `ประจำสาขา ${col.riderHomeBranchLabel}`
                      }
                    >
                      📍 {col.lastLoc ? `${col.lastLoc.locationName} (${col.lastLoc.atTimeStr})` : `สาขา ${col.riderHomeBranchLabel}`}
                    </span>
                    <span className="font-bold text-slate-700 shrink-0">{col.totalDistanceKm} km</span>
                  </div>
                </div>

                {/* Rider Stack Cards + Branch Hub Divider Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-slate-50/40">
                  {col.stackEntries.length === 0 ? (
                    <div className="text-center py-10 px-4 text-[11px] text-slate-400">
                      ยังไม่มีงานใน Stack
                    </div>
                  ) : (
                    (() => {
                      const isRunnable = (t: SimTaskItem) =>
                        t.legType === "delivery" ? t.isReady && t.isCsoPaid : t.isReady;

                      const runnableEntries = col.stackEntries.filter((e) => isRunnable(e.task));
                      const delivCountsByBranch = new Map<string, number>();
                      const pickupCountsByBranch = new Map<string, number>();
                      const lastPickupIndexByBranch = new Map<string, number>();

                      runnableEntries.forEach((e, i) => {
                        const b = e.task.laundryBranchLabel;
                        if (e.task.legType === "delivery") {
                          delivCountsByBranch.set(b, (delivCountsByBranch.get(b) || 0) + 1);
                        } else {
                          pickupCountsByBranch.set(b, (pickupCountsByBranch.get(b) || 0) + 1);
                          lastPickupIndexByBranch.set(b, i);
                        }
                      });

                      const shownPickupHubForDeliv = new Set<string>([col.riderHomeBranchLabel]);
                      const homeRunnableDelivCount = delivCountsByBranch.get(col.riderHomeBranchLabel) || 0;
                      const homePendingDelivCount = col.stackEntries.filter(
                        (e) =>
                          e.task.legType === "delivery" &&
                          e.task.laundryBranchLabel === col.riderHomeBranchLabel &&
                          !isRunnable(e.task)
                      ).length;
                      let runnableIdx = -1;

                      return (
                        <>
                          {/* Mandatory Step 0: Every Rider with jobs MUST Start at their Home Branch picking up laundry first! */}
                          {!settings.ignoreBranchRouting && (
                            <div className="rounded-xl border-2 border-indigo-400 bg-gradient-to-r from-indigo-600 to-sky-600 px-3 py-2 flex items-center justify-between shadow-xs text-white">
                              <div className="flex items-center gap-2">
                                <span className="text-base">🏁</span>
                                <div>
                                  <div className="text-[11px] font-black">
                                    START: รับผ้าที่สาขา {col.riderHomeBranchLabel} ไปส่ง
                                  </div>
                                  <div className="text-[9.5px] text-indigo-100 font-semibold">
                                    {homeRunnableDelivCount > 0
                                      ? `โหลดผ้าสะอาดขึ้นรถที่ ${col.riderHomeBranchLabel} ก่อนออกวิ่ง`
                                      : homePendingDelivCount > 0
                                        ? `รอผ้า Ready/CSO Paid ที่ ${col.riderHomeBranchLabel} (${homePendingDelivCount} งาน)`
                                        : `เริ่มออกวิ่งจากสาขา ${col.riderHomeBranchLabel}`}
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white text-indigo-700 shrink-0">
                                {homeRunnableDelivCount} งานส่ง
                              </span>
                            </div>
                          )}

                          {col.stackEntries.map(({ task, record }, idx) => {
                            const isBlockedDelivery = task.legType === "delivery" && (!task.isReady || !task.isCsoPaid);
                            const isBlockedPickup = task.legType === "pickup" && !task.isReady;
                            const isBlocked = !task.isCompleted && (isBlockedDelivery || isBlockedPickup);
                            const completedAtStr = completedTaskTimes[task.taskId];

                            const curRunnable = !isBlocked;
                            if (curRunnable) runnableIdx++;

                            let showBranchLoadBanner: string | null = null;
                            if (!settings.ignoreBranchRouting && curRunnable && task.legType === "delivery" && !shownPickupHubForDeliv.has(task.laundryBranchLabel)) {
                              shownPickupHubForDeliv.add(task.laundryBranchLabel);
                              showBranchLoadBanner = task.laundryBranchLabel;
                            }

                            const dropoffBranchesAfterThis: string[] = [];
                            if (!settings.ignoreBranchRouting && curRunnable && task.legType === "pickup") {
                              for (const [bLabel, lastIdx] of lastPickupIndexByBranch.entries()) {
                                if (lastIdx === runnableIdx) {
                                  dropoffBranchesAfterThis.push(bLabel);
                                }
                              }
                            }

                            return (
                              <React.Fragment key={task.taskId}>
                                {showBranchLoadBanner && (
                                  <div className="rounded-xl border border-indigo-300 bg-gradient-to-r from-indigo-50 to-sky-50 px-3 py-2 flex items-center justify-between shadow-2xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm">📦</span>
                                      <div>
                                        <div className="text-[11px] font-black text-indigo-900">
                                          แวะรับผ้าเพิ่มที่สาขา {showBranchLoadBanner} ไปส่ง
                                        </div>
                                        <div className="text-[9.5px] text-indigo-600 font-semibold">
                                          โหลดผ้าขึ้นรถระหว่างทางจากสาขา {showBranchLoadBanner}
                                        </div>
                                      </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                                      {delivCountsByBranch.get(showBranchLoadBanner) || 1} งาน
                                    </span>
                                  </div>
                                )}

                            <div
                              className={`rounded-xl border border-l-4 p-2.5 shadow-2xs space-y-1.5 transition-all ${
                                task.isCompleted
                                  ? "border-emerald-300 border-l-emerald-600 bg-emerald-50/55"
                                  : isBlocked
                                    ? "border-dashed border-slate-300 border-l-slate-400 bg-slate-100/80 opacity-75"
                                    : task.legType === "pickup"
                                      ? "border-amber-200 border-l-amber-500 bg-amber-50/45"
                                      : "border-sky-200 border-l-sky-600 bg-sky-50/45"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center text-white ${
                                      task.isCompleted
                                        ? "bg-emerald-600"
                                        : task.legType === "pickup"
                                          ? "bg-amber-500"
                                          : "bg-sky-600"
                                    }`}
                                  >
                                    {idx + 1}
                                  </span>
                                  <span className="font-mono text-[11px] font-black text-slate-800">
                                    #{task.job.id}
                                  </span>
                                  {task.isCompleted && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-600 text-white">
                                      ✓ Done {completedAtStr}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1">
                                  {task.expressInfo?.isExpress && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white">
                                      {task.expressInfo.label}
                                    </span>
                                  )}
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                      task.handoverMode === "meetup"
                                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {task.handoverMode === "meetup" ? "Meet up" : "Lobby"}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                      task.legType === "pickup"
                                        ? "bg-amber-500 text-white"
                                        : "bg-sky-600 text-white"
                                    }`}
                                  >
                                    {task.legType === "pickup" ? "P" : "D"}
                                  </span>
                                </div>
                              </div>

                              <p className="text-xs font-bold text-slate-900 truncate">
                                {task.job.customerName}
                              </p>
                              <div className="flex items-start gap-1.5 text-[13px] font-medium text-slate-700 leading-snug">
                                <MapPin size={13} className="shrink-0 mt-0.5 text-slate-500" />
                                <span className="line-clamp-2">{task.targetLocation}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] font-bold">
                                <span
                                  className={`px-1.5 py-0.5 rounded border ${
                                    task.laundryBranchLabel === "PK"
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : task.laundryBranchLabel === "PTY"
                                        ? "bg-orange-50 text-orange-700 border-orange-200"
                                        : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  }`}
                                >
                                  {task.legType === "delivery"
                                    ? `📦 ผ้าอยู่: ${task.laundryBranchLabel}`
                                    : `🏭 คืนผ้าที่: ${task.laundryBranchLabel}`}
                                </span>
                              </div>

                              <div className="pt-1.5 border-t border-slate-100 space-y-1 text-[10px]">
                                <div className="flex items-center justify-between text-slate-500 gap-1">
                                  <span className="inline-flex items-center gap-1 shrink-0">
                                    <Clock size={10} />
                                    {format(task.scheduledAt, "HH:mm")}
                                  </span>
                                  <div className="flex items-center gap-1 flex-wrap justify-end">
                                    {task.legType === "delivery" && (
                                      <button
                                        type="button"
                                        onClick={() => toggleTaskCsoPaid(task.taskId)}
                                        className={`px-1.5 py-0.5 rounded font-bold cursor-pointer border ${
                                          task.isCsoPaid
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                            : "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
                                        }`}
                                        title="คลิกเพื่อสลับสถานะ CSO Paid (ต้อง Paid ก่อนถึงจะส่งได้)"
                                      >
                                        {task.isCsoPaid ? "✓ CSO Paid" : "💳 รอ CSO Paid"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => toggleTaskReady(task.taskId)}
                                      className={`px-1.5 py-0.5 rounded font-bold cursor-pointer border ${
                                        task.isReady
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                          : "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200"
                                      }`}
                                      title="คลิกเพื่อสลับ Ready / Not Ready (Not Ready จะถูกย้ายไปล่างสุด)"
                                    >
                                      {task.isReady ? "✓ Ready" : "⏳ Not Ready"}
                                    </button>
                                    <span className="font-bold text-violet-700">
                                      +{record.detourKm} km
                                    </span>
                                    {!task.isCompleted && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleCancelAssignedTask(
                                            task.taskId,
                                            col.rider.id,
                                            task.job.id,
                                            col.rider.nickname || col.rider.name
                                          )
                                        }
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold cursor-pointer border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                        title="Cancel งานนี้กลับไป Unassigned (และไม่จ่ายกลับให้ Rider คนเดิม)"
                                      >
                                        <X size={10} />
                                        Cancel
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[10px] text-violet-700 bg-violet-50/80 px-2 py-1 rounded-md font-medium">
                                  {record.reason}
                                </div>
                              </div>
                            </div>

                            {dropoffBranchesAfterThis.map((bLabel) => (
                              <div
                                key={`dropoff-${task.taskId}-${bLabel}`}
                                className="rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 flex items-center justify-between shadow-2xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">🏭</span>
                                  <div>
                                    <div className="text-[11px] font-black text-amber-900">
                                      ส่งผ้ากลับมาซักที่สาขา {bLabel}
                                    </div>
                                    <div className="text-[9.5px] text-amber-700 font-semibold">
                                      นำผ้าที่รับมาส่งเข้าซักที่สาขา {bLabel}
                                    </div>
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-600 text-white">
                                  {pickupCountsByBranch.get(bLabel) || 1} งาน
                                </span>
                              </div>
                            ))}
                          </React.Fragment>
                            );
                          })}
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
