import type { LatLng } from "@/lib/store";

export interface RouteTarget {
  id: string;
  jobId?: string;
  legType?: "pickup" | "delivery";
  title?: string;
  locationName?: string;
  coords: LatLng;
  [key: string]: any;
}

export interface OptimizedRouteItem<T = any> {
  task: T;
  stopNumber: number;
  targetCoords: LatLng;
  distanceFromPrevKm: number;
  cumulativeDistanceKm: number;
}

export interface OptimizedRouteResult<T = any> {
  orderedTasks: OptimizedRouteItem<T>[];
  totalDistanceKm: number;
  googleMapsUrl: string;
  routeCoordinates: LatLng[];
}

/**
 * Checks whether a delivery task has already been loaded onto the rider's vehicle
 * (confirmed with vehicle loading photo).
 */
export function isTaskLoadedOnVehicle(task: any): boolean {
  if (!task) return false;
  if (typeof task.isLoadedOnVehicle === "boolean") return task.isLoadedOnVehicle;

  const legType = task.legType || task.type;
  if (legType && legType !== "delivery") return false;

  const job = task.job || task;
  const adminNotesJson = job?.adminNotesJson;
  if (!adminNotesJson || typeof adminNotesJson !== "string") return false;

  try {
    const parsed = JSON.parse(adminNotesJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Boolean(
        parsed.deliveryLoadedOnVehicleAt ||
          (Array.isArray(parsed.deliveryLoadedImageUrls) && parsed.deliveryLoadedImageUrls.length > 0)
      );
    }
  } catch {}
  return false;
}

/**
 * Checks whether a task is ready to be run immediately in the primary active pool:
 * - Pickup tasks (`legType === "pickup"`) are always ready to run immediately.
 * - Delivery tasks (`legType === "delivery"`) are ready to run once the laundry has been
 *   loaded onto the vehicle (`isTaskLoadedOnVehicle(task)` is true).
 *   Unloaded delivery tasks wait in the secondary pool after Group 1 (Pickup + Loaded Delivery).
 */
export function isTaskReadyToRunNow(task: any): boolean {
  if (!task) return false;
  const legType = task.legType || task.type;
  if (legType === "pickup") return true;
  if (legType === "delivery") return isTaskLoadedOnVehicle(task);
  const job = task.job || task;
  if (["pending", "accepted", "pickup"].includes(job?.status)) return true;
  return isTaskLoadedOnVehicle(task);
}

/**
 * Returns the route priority tier for a task:
 * - Group 1 (+10 boost): Tasks ready to run immediately — ALL Pickup tasks AND Delivery tasks
 *   whose laundry is already loaded onto the rider's vehicle (ขึ้นรถแล้ว).
 *   Within Group 1, Pickup and Loaded Delivery tasks interleave and compete fairly using the
 *   normal priority logic (EXP 100% -> EXP 50% -> Standard, then shortest distance or scheduled time).
 * - Group 2 (+0 base): Unloaded Delivery tasks (รอถ่ายรูปขึ้นรถ) come after Group 1, and within
 *   Group 2 also follow the normal priority logic (EXP 100% -> EXP 50% -> Standard).
 */
export function getTaskExpressPriorityTier(task: any): number {
  if (!task) return 0;
  if (typeof task.priorityTier === "number") return task.priorityTier;

  const readyBoost = isTaskReadyToRunNow(task) ? 10 : 0;

  if (task.expressInfo?.isExpress) {
    return readyBoost + (task.expressInfo.is100 ? 2 : 1);
  }

  const job = task.job || task;
  const speed = String(job?.serviceSpeed || task?.serviceSpeed || "").toLowerCase();
  const remark = String(job?.remark || task?.remark || task?.title || "");

  if (speed === "express_100" || /express\s*100%|exp\s*100%/i.test(remark)) {
    return readyBoost + 2;
  }
  if (
    speed === "express_50" ||
    /express\s*50%|exp\s*50%|express\s*\d+%/i.test(remark) ||
    (speed && speed !== "standard" && speed.includes("express"))
  ) {
    return readyBoost + 1;
  }
  return readyBoost;
}

/**
 * Great-circle distance between two points in km, adjusted by ~1.25 road winding factor
 */
export function calculateEstimatedDistanceKm(p1: LatLng, p2: LatLng): number {
  if (!p1 || !p2 || !p1.lat || !p1.lng || !p2.lat || !p2.lng || (p1.lat === p2.lat && p1.lng === p2.lng)) return 0;
  const R = 6371; // Earth radius km
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;
  return Math.round(straightKm * 1.25 * 10) / 10;
}

function hasNonZeroCoords(coords?: LatLng | null): coords is LatLng {
  return Boolean(
    coords &&
      typeof coords.lat === "number" &&
      typeof coords.lng === "number" &&
      coords.lat !== 0 &&
      coords.lng !== 0
  );
}

/**
 * Optimizes a list of rider tasks from an origin point (rider live GPS or branch).
 * Strictly prioritizes Express orders first (EXP 100% -> EXP 50% -> Standard)
 * and solves the Traveling Salesperson Problem (TSP) within each priority tier
 * using Nearest-Neighbor + 2-Opt local search while guaranteeing Pickup precedes Delivery.
 */
export function optimizeRiderRoute<T extends { targetCoords?: LatLng | null; legType?: string; job?: { id: string; serviceSpeed?: string; remark?: string }; expressInfo?: { isExpress: boolean; is100: boolean } | null }>(
  origin: LatLng,
  tasks: T[],
  fallbackOriginCoords: LatLng = { lat: 13.736717, lng: 100.523186 }
): OptimizedRouteResult<T> {
  const start: LatLng = hasNonZeroCoords(origin) ? origin : fallbackOriginCoords;

  if (!tasks || tasks.length === 0) {
    return {
      orderedTasks: [],
      totalDistanceKm: 0,
      googleMapsUrl: "",
      routeCoordinates: [start],
    };
  }

  // Ensure if a job has both pickup and delivery in the route, the pickup inherits at least the delivery's priority tier
  const jobMaxTier = new Map<string, number>();
  for (const t of tasks) {
    const tier = getTaskExpressPriorityTier(t);
    const jid = t.job?.id;
    if (jid) {
      jobMaxTier.set(jid, Math.max(jobMaxTier.get(jid) ?? 0, tier));
    }
  }
  const getEffectiveTier = (t: T): number => {
    const base = getTaskExpressPriorityTier(t);
    const jid = t.job?.id;
    const legType = t.legType || (t as any).type;
    if (legType === "pickup" && jid) {
      return Math.max(base, jobMaxTier.get(jid) ?? base);
    }
    return base;
  };

  // Partition tasks into those with valid coordinates vs missing coordinates
  const validTasks = tasks.filter((t) => hasNonZeroCoords(t.targetCoords));
  const fallbackTasks = [...tasks.filter((t) => !hasNonZeroCoords(t.targetCoords))].sort(
    (a, b) => getEffectiveTier(b) - getEffectiveTier(a)
  );

  if (validTasks.length <= 1) {
    const single = validTasks[0];
    const dist = single ? calculateEstimatedDistanceKm(start, single.targetCoords!) : 0;

    // Combine single valid task and fallback tasks in priority order (EXP 100% -> EXP 50% -> Standard)
    const combined = [...validTasks, ...fallbackTasks].sort(
      (a, b) => getEffectiveTier(b) - getEffectiveTier(a)
    );

    let cumulative = 0;
    let prevPos = start;
    const items: OptimizedRouteItem<T>[] = combined.map((t, idx) => {
      const hasCoords = hasNonZeroCoords(t.targetCoords);
      const coords = hasCoords ? t.targetCoords! : prevPos;
      const stepDist = hasCoords ? calculateEstimatedDistanceKm(prevPos, coords) : 0;
      cumulative = Math.round((cumulative + stepDist) * 10) / 10;
      prevPos = coords;
      return {
        task: t,
        stopNumber: idx + 1,
        targetCoords: coords,
        distanceFromPrevKm: stepDist,
        cumulativeDistanceKm: cumulative,
      };
    });

    const gmUrl = single
      ? `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${single.targetCoords!.lat},${single.targetCoords!.lng}&travelmode=driving`
      : "";

    return {
      orderedTasks: items,
      totalDistanceKm: dist,
      googleMapsUrl: gmUrl,
      routeCoordinates: single ? [start, single.targetCoords!] : [start],
    };
  }

  // Step 1: Priority-Tiered Nearest-Neighbor Heuristic from start point
  // Always serves the highest remaining Express tier (EXP 100% -> EXP 50% -> Standard) first
  const unvisited = [...validTasks];
  const route: T[] = [];
  let currentPos = start;

  const isPickupSatisfied = (candidate: T, remaining: T[]): boolean => {
    if (
      candidate.legType === "delivery" &&
      candidate.job?.id &&
      remaining.some((u) => u.legType === "pickup" && u.job?.id === candidate.job?.id)
    ) {
      return false;
    }
    return true;
  };

  while (unvisited.length > 0) {
    // Find all eligible candidates whose pickup-before-delivery constraint is satisfied
    const eligibleIndices: number[] = [];
    for (let i = 0; i < unvisited.length; i++) {
      if (isPickupSatisfied(unvisited[i], unvisited)) {
        eligibleIndices.push(i);
      }
    }

    const candidateIndices = eligibleIndices.length > 0 ? eligibleIndices : unvisited.map((_, idx) => idx);

    // Determine the highest Express priority tier among eligible stops
    let maxTier = -1;
    for (const idx of candidateIndices) {
      const tier = getEffectiveTier(unvisited[idx]);
      if (tier > maxTier) maxTier = tier;
    }

    // Pick the closest stop within that highest priority tier
    let bestIdx = -1;
    let bestDist = Infinity;

    for (const idx of candidateIndices) {
      const candidate = unvisited[idx];
      if (getEffectiveTier(candidate) !== maxTier) continue;

      const dist = calculateEstimatedDistanceKm(currentPos, candidate.targetCoords!);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }

    if (bestIdx === -1) {
      bestIdx = candidateIndices[0] ?? 0;
    }

    const nextStop = unvisited.splice(bestIdx, 1)[0];
    route.push(nextStop);
    currentPos = nextStop.targetCoords!;
  }

  // Step 2: 2-Opt local search refinement (uncross paths within each priority tier while respecting precedence)
  function isRouteValid(candidateRoute: T[]): boolean {
    const visitedJobPickups = new Set<string>();
    for (let idx = 0; idx < candidateRoute.length; idx++) {
      const t = candidateRoute[idx];
      // Enforce Express priority order: higher priority tier must never be placed after a lower priority tier
      if (idx > 0 && getEffectiveTier(t) > getEffectiveTier(candidateRoute[idx - 1])) {
        return false;
      }
      if (t.legType === "pickup" && t.job?.id) {
        visitedJobPickups.add(t.job.id);
      } else if (t.legType === "delivery" && t.job?.id) {
        const hasPickupInRoute = candidateRoute.some((c) => c.legType === "pickup" && c.job?.id === t.job?.id);
        if (hasPickupInRoute && !visitedJobPickups.has(t.job.id)) {
          return false;
        }
      }
    }
    return true;
  }

  function calculateRouteLength(candidateRoute: T[]): number {
    let len = 0;
    let prev = start;
    for (const t of candidateRoute) {
      len += calculateEstimatedDistanceKm(prev, t.targetCoords!);
      prev = t.targetCoords!;
    }
    return len;
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 50;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, k + 1).reverse(),
          ...route.slice(k + 1),
        ];

        if (isRouteValid(candidate)) {
          const currentTotal = calculateRouteLength(route);
          const candidateTotal = calculateRouteLength(candidate);
          if (candidateTotal < currentTotal - 0.05) {
            route.splice(0, route.length, ...candidate);
            improved = true;
            break;
          }
        }
      }
      if (improved) break;
    }
  }

  // Insert any fallbackTasks (missing coordinates) at the end of their respective priority tier
  const finalSequence: T[] = [];
  if (fallbackTasks.length === 0) {
    finalSequence.push(...route);
  } else {
    const distinctTiers = Array.from(
      new Set([...route, ...fallbackTasks].map((t) => getEffectiveTier(t)))
    ).sort((a, b) => b - a);
    for (const tier of distinctTiers) {
      finalSequence.push(...route.filter((t) => getEffectiveTier(t) === tier));
      finalSequence.push(...fallbackTasks.filter((t) => getEffectiveTier(t) === tier));
    }
  }

  // Build sequential metadata
  let cumulative = 0;
  let prevPos = start;
  const orderedTasks: OptimizedRouteItem<T>[] = finalSequence.map((task, idx) => {
    const hasCoords = hasNonZeroCoords(task.targetCoords);
    const targetCoords = hasCoords ? task.targetCoords! : prevPos;
    const distFromPrev = hasCoords ? calculateEstimatedDistanceKm(prevPos, targetCoords) : 0;
    cumulative += distFromPrev;
    prevPos = targetCoords;

    return {
      task,
      stopNumber: idx + 1,
      targetCoords,
      distanceFromPrevKm: distFromPrev,
      cumulativeDistanceKm: Math.round(cumulative * 10) / 10,
    };
  });

  const totalDist = Math.round(cumulative * 10) / 10;
  const routeCoordinates: LatLng[] = [start, ...route.map((t) => t.targetCoords!)];

  const lastStop = route[route.length - 1];
  const intermediateStops = route.slice(0, route.length - 1);

  let googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${lastStop.targetCoords!.lat},${lastStop.targetCoords!.lng}&travelmode=driving`;
  if (intermediateStops.length > 0) {
    const waypointsParam = intermediateStops
      .map((s) => `${s.targetCoords!.lat},${s.targetCoords!.lng}`)
      .join("|");
    googleMapsUrl += `&waypoints=${encodeURIComponent(waypointsParam)}`;
  }

  return {
    orderedTasks,
    totalDistanceKm: totalDist,
    googleMapsUrl,
    routeCoordinates,
  };
}

// ============================================================================
// SMART ROUTE OPTIMIZER (LAB / COMPARE):
// 1) Delivery: Must check `Ready` (`subStatus === "ready"` or loaded on vehicle).
//    - Ready + Lobby (`Delivery: Leave at Lobby`) -> Can drop off anytime early!
//    - Ready + Meet up (`Delivery: Meet up`) -> Must arrive on time!
//    - Not Ready (`wash`/`dry`/`iron`/`billing`) -> Deferred to end (cannot deliver yet).
// 2) Pickup: Must arrive on time ALWAYS (even `Pickup: Leave at Lobby`, because
//    the customer may not have placed their laundry at the lobby before scheduled time).
// 3) Branch Laundry Location Awareness (PK / Soi 15 / On Vehicle) + Same-Condo Grouping.
// ============================================================================

export type HandoverMode = "lobby" | "meetup";

export interface RouteBranchInfo {
  id: string;
  name: string;
  coords?: LatLng | null;
  area?: string | null;
}

export interface SmartBranchVisitInfo {
  branchId: string;
  branchName: string;
  shortName: string;
  coords: LatLng;
  distanceToBranchKm: number;
  loadedTaskCount: number;
}

export interface SimulatedStopDetail<T = any> {
  task: T;
  stopNumber: number;
  targetCoords: LatLng;
  directDistanceFromPrevKm: number;
  realDistanceFromPrevKm: number;
  cumulativeDirectDistanceKm: number;
  cumulativeRealDistanceKm: number;
  estimatedArrivalAt: Date;
  scheduledAt: Date;
  /** Positive = arriving AFTER scheduled time (late); Negative = arriving BEFORE scheduled time (early) */
  minutesDiffFromSchedule: number;
  slaStatus: "on_time" | "early_ok" | "late" | "too_early" | "not_ready";
  isLaundryReady: boolean;
  handoverMode: HandoverMode;
  canArriveEarlyAnytime: boolean;
  waitBeforeStopMinutes: number;
  laundryStateAtStart: "pickup_leg" | "on_vehicle" | "at_branch" | "not_ready";
  sourceBranchId: string | null;
  sourceBranchName: string | null;
  sourceBranchShortName: string | null;
  viaBranch: SmartBranchVisitInfo | null;
  reasonTag: string;
}

export interface SimulatedRouteEvaluation<T = any> {
  stops: SimulatedStopDetail<T>[];
  totalDirectDistanceKm: number;
  totalRealDistanceKm: number;
  estimatedTotalMinutes: number;
  lateStopsCount: number;
  tooEarlyStopsCount: number;
  onTimeStopsCount: number;
  notReadyStopsCount: number;
  branchVisitsCount: number;
  googleMapsUrl: string;
  routeCoordinates: LatLng[];
}

export interface SmartRouteOptions {
  branches?: RouteBranchInfo[];
  referenceTime?: Date;
  fallbackOriginCoords?: LatLng;
  /**
   * When true (used by Smart Route), rider departs/waits so Time-Strict stops
   * (ALL Pickups + Delivery Meet up) are entered within ~20 mins of scheduled time
   * instead of showing up hours before the customer is ready.
   */
  respectStrictTimeWindows?: boolean;
  /**
   * When true, ignore time windows for non-Meetup (Lobby) tasks so routing optimizes purely by distance/zone,
   * while STILL strictly enforcing scheduled times for Meet up stops.
   */
  ignoreNonMeetupTimeWindows?: boolean;
  /**
   * When true, ignore laundry source/return branch hubs (Soi 15 / PK) in distance, detour, and scoring.
   */
  ignoreBranchRouting?: boolean;
}

/**
 * Checks whether a Delivery task's laundry is genuinely finished & ready to send (`subStatus === "ready"` or already loaded).
 * Jobs still in `wash`, `dry`, `iron`, or `billing` are NOT ready even if `status === "delivery"` or a rider is pre-assigned.
 */
export function isDeliveryTaskLaundryReady(task: any): boolean {
  if (!task) return false;
  const legType = task?.legType || task?.type;
  if (legType === "pickup") return true;
  if (isTaskLoadedOnVehicle(task)) return true;

  const job = task?.job || task;
  if (job?.isStuck) return false;
  if (job?.subStatus === "ready") return true;
  if (job?.status === "washed" && !job?.subStatus) return true;
  return false;
}

/**
 * Extracts handover mode (`"lobby"` vs `"meetup"`) for Pickup or Delivery leg.
 * Defaults to `"meetup"` unless Lobby/Juristic drop-off is explicitly indicated for that leg,
 * ensuring we never assume early unattended handover unless permitted.
 */
export function extractTaskHandoverMode(task: any): HandoverMode {
  const legType: "pickup" | "delivery" =
    (task?.legType || task?.type) === "delivery" ? "delivery" : "pickup";
  const job = task?.job || task;
  const remark = String(job?.remark || task?.remark || "");
  const loc = String(
    legType === "delivery"
      ? job?.dropoffLocation || task?.targetLocation || ""
      : job?.pickupLocation || task?.targetLocation || ""
  );

  if (legType === "delivery") {
    if (/delivery:\s*meet\s*up/i.test(remark)) return "meetup";
    if (
      /delivery:\s*leave\s*at\s*lobby/i.test(remark) ||
      /ฝากนิติ|ส่งนิติ|ส่งห้องนิติ|วางที่\s*lobby|ฝากไว้ที่\s*lobby/i.test(`${remark} ${loc}`)
    ) {
      return "lobby";
    }
    return "meetup";
  } else {
    if (/pickup:\s*meet\s*up/i.test(remark)) return "meetup";
    if (
      /pickup:\s*leave\s*at\s*lobby/i.test(remark) ||
      /รับที่นิติ|รับห้องนิติ|รับที่\s*lobby/i.test(`${remark} ${loc}`)
    ) {
      return "lobby";
    }
    return "meetup";
  }
}

function getBranchShortLabel(branchId?: string | null, branchName?: string | null): string {
  const id = (branchId || "").trim();
  const name = (branchName || "").trim();
  const lower = `${id} ${name}`.toLowerCase();

  if (id === "SHOP-MOGWZ0X0" || lower.includes("phattanakarn") || lower.includes("พัฒนาการ") || /\bpk\b/i.test(name)) {
    return "PK";
  }
  if (id === "shop-head" || lower.includes("soi 15") || lower.includes("sukhumvit 15") || lower.includes("ซอย 15")) {
    return "Soi 15";
  }
  if (lower.includes("pattaya") || lower.includes("พัทยา") || lower.includes("pty")) {
    return "PTY";
  }
  if (name) {
    return name.length > 14 ? name.slice(0, 14).trim() : name;
  }
  return id || "Branch";
}

export function extractTaskJobProcessingBranchId(task: any): string | null {
  const job = task?.job || task;
  const adminNotesJson = job?.adminNotesJson;
  if (adminNotesJson && typeof adminNotesJson === "string") {
    try {
      const parsed = JSON.parse(adminNotesJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.processingBranchId) {
        const val = String(parsed.processingBranchId).trim();
        if (val) return val;
      }
    } catch {}
  }
  return job?.branchId ? String(job.branchId).trim() : null;
}

function extractTaskScheduledDate(task: any, fallbackTime: Date): Date {
  if (task?.scheduledAt instanceof Date && !isNaN(task.scheduledAt.getTime())) {
    return task.scheduledAt;
  }
  if (task?.scheduledAt) {
    const d = new Date(task.scheduledAt);
    if (!isNaN(d.getTime())) return d;
  }
  const job = task?.job || task;
  const legType = task?.legType || task?.type;
  const raw =
    legType === "pickup"
      ? job?.pickupScheduledAt || job?.scheduledAt || job?.createdAt
      : job?.deliveryScheduledAt || job?.scheduledAt || job?.createdAt;
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return fallbackTime;
}

function getExpressLevel(task: any): 0 | 1 | 2 {
  if (!task) return 0;
  if (task.expressInfo?.isExpress) {
    return task.expressInfo.is100 ? 2 : 1;
  }
  const job = task.job || task;
  const speed = String(job?.serviceSpeed || task?.serviceSpeed || "").toLowerCase();
  const remark = String(job?.remark || task?.remark || task?.title || "");
  if (speed === "express_100" || /express\s*100%|exp\s*100%/i.test(remark)) return 2;
  if (
    speed === "express_50" ||
    /express\s*50%|exp\s*50%|express\s*\d+%/i.test(remark) ||
    (speed && speed !== "standard" && speed.includes("express"))
  ) {
    return 1;
  }
  return 0;
}

interface InternalSmartMeta<T> {
  task: T;
  taskKey: string;
  jobId: string | null;
  legType: "pickup" | "delivery";
  hasCoords: boolean;
  targetCoords: LatLng | null;
  scheduledAt: Date;
  scheduledMs: number;
  expLevel: 0 | 1 | 2;
  isLaundryReady: boolean;
  handoverMode: HandoverMode;
  /**
   * TRUE only when `legType === "delivery" && isLaundryReady && handoverMode === "lobby"`.
   * FALSE for ALL `pickup` legs (even Lobby, since customer hasn't dropped bag early)
   * and FALSE for `delivery` Meet up legs!
   */
  canArriveEarlyAnytime: boolean;
  isLoadedAtStart: boolean;
  sourceBranchId: string | null;
  sourceBranchName: string | null;
  sourceBranchShortName: string | null;
  sourceBranchCoords: LatLng | null;
}

function buildInternalSmartMeta<T>(
  tasks: T[],
  branches: RouteBranchInfo[],
  referenceTime: Date,
  ignoreNonMeetupTimeWindows = false,
  ignoreBranchRouting = false
): InternalSmartMeta<T>[] {
  const branchMap = new Map<string, RouteBranchInfo>();
  for (const b of branches) {
    if (b?.id) branchMap.set(b.id, b);
  }

  // Propagate Express level from delivery to pickup of same job if both are present
  const maxJobExp = new Map<string, 0 | 1 | 2>();
  tasks.forEach((t: any) => {
    const jid = t?.job?.id || t?.jobId || null;
    const lvl = getExpressLevel(t);
    if (jid) {
      const prev = maxJobExp.get(jid) ?? 0;
      if (lvl > prev) maxJobExp.set(jid, lvl);
    }
  });

  return tasks.map((t: any, i) => {
    const legType: "pickup" | "delivery" =
      (t?.legType || t?.type) === "delivery" ? "delivery" : "pickup";
    const jobId: string | null = t?.job?.id || t?.jobId || null;
    const taskKey = String(t?.taskId || t?.id || `${jobId || "task"}-${legType}-${i}`);
    const coordsCandidate = t?.targetCoords || t?.coords || null;
    const hasCoords = hasNonZeroCoords(coordsCandidate);
    const scheduledAt = extractTaskScheduledDate(t, referenceTime);
    const baseExp = getExpressLevel(t);
    const expLevel: 0 | 1 | 2 =
      legType === "pickup" && jobId
        ? ((Math.max(baseExp, maxJobExp.get(jobId) ?? baseExp) as 0 | 1 | 2))
        : baseExp;

    const isLoadedAtStart = legType === "pickup" ? true : isTaskLoadedOnVehicle(t);
    const isLaundryReady = legType === "pickup" ? true : isDeliveryTaskLaundryReady(t);
    const handoverMode = extractTaskHandoverMode(t);
    // Core Business Rule:
    // - Normally, neither Pickup nor Delivery (even Lobby) should be served hours early.
    // - When `ignoreNonMeetupTimeWindows` is true, Lobby jobs ignore time windows (route purely by distance/zone),
    //   while Meet up jobs STILL strictly enforce their scheduled time windows.
    const canArriveEarlyAnytime = ignoreNonMeetupTimeWindows && handoverMode !== "meetup";

    const sourceBranchId = ignoreBranchRouting ? null : extractTaskJobProcessingBranchId(t);
    const branchObj = sourceBranchId ? branchMap.get(sourceBranchId) : undefined;
    const sourceBranchCoords = hasNonZeroCoords(branchObj?.coords) ? branchObj!.coords! : null;
    const sourceBranchName = branchObj?.name || sourceBranchId || null;
    const sourceBranchShortName = sourceBranchId
      ? getBranchShortLabel(sourceBranchId, branchObj?.name)
      : null;

    return {
      task: t,
      taskKey,
      jobId,
      legType,
      hasCoords,
      targetCoords: hasCoords ? coordsCandidate : null,
      scheduledAt,
      scheduledMs: scheduledAt.getTime(),
      expLevel,
      isLaundryReady,
      handoverMode,
      canArriveEarlyAnytime,
      isLoadedAtStart,
      sourceBranchId,
      sourceBranchName,
      sourceBranchShortName,
      sourceBranchCoords,
    };
  });
}

function buildWaypointsGoogleMapsUrl(start: LatLng, waypoints: LatLng[]): string {
  if (waypoints.length === 0) return "";
  const deduped: LatLng[] = [];
  for (const pt of waypoints) {
    if (!hasNonZeroCoords(pt)) continue;
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(prev.lat - pt.lat) > 0.00005 || Math.abs(prev.lng - pt.lng) > 0.00005) {
      deduped.push(pt);
    }
  }
  if (deduped.length === 0) return "";
  const destination = deduped[deduped.length - 1];
  const intermediates = deduped.slice(0, deduped.length - 1);
  let url = `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
  if (intermediates.length > 0) {
    const wp = intermediates.map((p) => `${p.lat},${p.lng}`).join("|");
    url += `&waypoints=${encodeURIComponent(wp)}`;
  }
  return url;
}

/**
 * Simulates physical execution of ANY ordered task sequence from `origin`,
 * tracking:
 * - Ready status (`not_ready` deliveries cannot be loaded/delivered yet)
 * - Branch hub visits needed to pick up unloaded Ready clean laundry (e.g. PK / Soi 15)
 * - Handover rules (`Delivery Ready + Lobby` early-OK vs `Pickup` / `Delivery Meet up` strict time window)
 */
export function simulateRouteExecution<T>(
  origin: LatLng,
  orderedTasks: T[],
  options: SmartRouteOptions = {}
): SimulatedRouteEvaluation<T> {
  const fallback = options.fallbackOriginCoords || { lat: 13.736717, lng: 100.523186 };
  const start: LatLng = hasNonZeroCoords(origin) ? origin : fallback;
  const refTime = options.referenceTime || new Date();
  const branches = options.branches || [];
  const respectStrictWindows = Boolean(options.respectStrictTimeWindows);
  const ignoreNonMeetupTimeWindows = Boolean(options.ignoreNonMeetupTimeWindows);
  const ignoreBranchRouting = Boolean(options.ignoreBranchRouting);

  if (!orderedTasks || orderedTasks.length === 0) {
    return {
      stops: [],
      totalDirectDistanceKm: 0,
      totalRealDistanceKm: 0,
      estimatedTotalMinutes: 0,
      lateStopsCount: 0,
      tooEarlyStopsCount: 0,
      onTimeStopsCount: 0,
      notReadyStopsCount: 0,
      branchVisitsCount: 0,
      googleMapsUrl: "",
      routeCoordinates: [start],
    };
  }

  const metas = buildInternalSmartMeta(orderedTasks, branches, refTime, ignoreNonMeetupTimeWindows, ignoreBranchRouting);

  // Count how many READY unloaded deliveries exist per branch
  const unloadedCountByBranch = new Map<string, number>();
  for (const m of metas) {
    if (
      m.legType === "delivery" &&
      m.isLaundryReady &&
      !m.isLoadedAtStart &&
      m.sourceBranchId &&
      m.sourceBranchCoords
    ) {
      unloadedCountByBranch.set(m.sourceBranchId, (unloadedCountByBranch.get(m.sourceBranchId) || 0) + 1);
    }
  }

  const visitedBranches = new Set<string>();
  const preloadedAtOriginBranches = new Set<string>();
  let prevPos = start;
  let clockMs = refTime.getTime();
  let cumDirectKm = 0;
  let cumRealKm = 0;
  let totalMinutes = 0;
  let lateStopsCount = 0;
  let tooEarlyStopsCount = 0;
  let onTimeStopsCount = 0;
  let notReadyStopsCount = 0;
  let branchVisitsCount = 0;

  const branchCoordsById = new Map<string, { name: string; shortName: string; coords: LatLng }>();
  for (const m of metas) {
    if (m.sourceBranchId && m.sourceBranchCoords && !branchCoordsById.has(m.sourceBranchId)) {
      branchCoordsById.set(m.sourceBranchId, {
        name: m.sourceBranchName || m.sourceBranchId,
        shortName: m.sourceBranchShortName || "Branch",
        coords: m.sourceBranchCoords,
      });
    }
  }
  for (const [bId, bInfo] of branchCoordsById.entries()) {
    const count = unloadedCountByBranch.get(bId) || 0;
    if (count > 0 && calculateEstimatedDistanceKm(start, bInfo.coords) <= 0.45) {
      visitedBranches.add(bId);
      preloadedAtOriginBranches.add(bId);
      const preloadMins = 3 + Math.min(4, count);
      clockMs += preloadMins * 60_000;
      totalMinutes += preloadMins;
      branchVisitsCount++;
    }
  }
  const reportedPreloadBranches = new Set<string>();

  const routeCoordinates: LatLng[] = [start];
  const stops: SimulatedStopDetail<T>[] = [];

  metas.forEach((m, idx) => {
    // Handle NOT READY delivery tasks cleanly (deferred / blocked until laundry is Ready)
    if (m.legType === "delivery" && !m.isLaundryReady) {
      notReadyStopsCount++;
      const sub = (m.task as any)?.job?.subStatus || (m.task as any)?.subStatus || "process";
      stops.push({
        task: m.task,
        stopNumber: idx + 1,
        targetCoords: m.targetCoords || prevPos,
        directDistanceFromPrevKm: 0,
        realDistanceFromPrevKm: 0,
        cumulativeDirectDistanceKm: cumDirectKm,
        cumulativeRealDistanceKm: cumRealKm,
        estimatedArrivalAt: new Date(clockMs),
        scheduledAt: m.scheduledAt,
        minutesDiffFromSchedule: 0,
        slaStatus: "not_ready",
        isLaundryReady: false,
        handoverMode: m.handoverMode,
        canArriveEarlyAnytime: false,
        waitBeforeStopMinutes: 0,
        laundryStateAtStart: "not_ready",
        sourceBranchId: m.sourceBranchId,
        sourceBranchName: m.sourceBranchName,
        sourceBranchShortName: m.sourceBranchShortName,
        viaBranch: null,
        reasonTag: `⏳ Not Ready (${sub}) — Deferred until wash/pack complete (รอซัก/แพ็คเสร็จก่อนจัดส่ง)`,
      });
      return;
    }

    const targetCoords = m.targetCoords || prevPos;
    const directDist = m.hasCoords ? calculateEstimatedDistanceKm(prevPos, targetCoords) : 0;

    let viaBranch: SmartBranchVisitInfo | null = null;
    let realDist = directDist;
    let stepLoadMinutes = 0;

    const isFirstUseOfOriginPreload =
      m.legType === "delivery" &&
      m.isLaundryReady &&
      !m.isLoadedAtStart &&
      Boolean(m.sourceBranchId) &&
      preloadedAtOriginBranches.has(m.sourceBranchId!) &&
      !reportedPreloadBranches.has(m.sourceBranchId!);

    const needsBranchVisit =
      m.legType === "delivery" &&
      m.isLaundryReady &&
      !m.isLoadedAtStart &&
      Boolean(m.sourceBranchId && m.sourceBranchCoords) &&
      !visitedBranches.has(m.sourceBranchId!);

    if (isFirstUseOfOriginPreload && m.sourceBranchId && m.sourceBranchCoords) {
      reportedPreloadBranches.add(m.sourceBranchId);
      viaBranch = {
        branchId: m.sourceBranchId,
        branchName: m.sourceBranchName || m.sourceBranchId,
        shortName: m.sourceBranchShortName || "Branch",
        coords: m.sourceBranchCoords,
        distanceToBranchKm: 0,
        loadedTaskCount: unloadedCountByBranch.get(m.sourceBranchId) || 1,
      };
    } else if (needsBranchVisit && m.sourceBranchId && m.sourceBranchCoords) {
      const distToBranch = calculateEstimatedDistanceKm(prevPos, m.sourceBranchCoords);
      const distBranchToCustomer = m.hasCoords
        ? calculateEstimatedDistanceKm(m.sourceBranchCoords, targetCoords)
        : 0;
      realDist = Math.round((distToBranch + distBranchToCustomer) * 10) / 10;
      const batchCount = unloadedCountByBranch.get(m.sourceBranchId) || 1;
      stepLoadMinutes = (distToBranch <= 0.35 ? 3 : 5) + Math.min(5, batchCount);

      viaBranch = {
        branchId: m.sourceBranchId,
        branchName: m.sourceBranchName || m.sourceBranchId,
        shortName: m.sourceBranchShortName || "Branch",
        coords: m.sourceBranchCoords,
        distanceToBranchKm: distToBranch,
        loadedTaskCount: batchCount,
      };
      visitedBranches.add(m.sourceBranchId);
      branchVisitsCount++;
      routeCoordinates.push(m.sourceBranchCoords);
    }

    for (const [bId, bInfo] of branchCoordsById.entries()) {
      if (!visitedBranches.has(bId) && (unloadedCountByBranch.get(bId) || 0) > 0) {
        if (m.hasCoords && calculateEstimatedDistanceKm(targetCoords, bInfo.coords) <= 0.35) {
          visitedBranches.add(bId);
        }
      }
    }

    const driveMinutes = realDist * 2.4;
    const rawArrivalMs = clockMs + (stepLoadMinutes + driveMinutes) * 60_000;

    // For Time-Strict stops (`Pickup` & `Delivery Lobby` -> up to 1 hr early; `Delivery Meet up` -> 20m early):
    // When `respectStrictWindows` is enabled, the rider paces departure so they arrive
    // no earlier than `scheduled - 60m` (or `scheduled - 20m` for Delivery Meet up).
    let arrivalMs = rawArrivalMs;
    let waitBeforeStopMinutes = 0;
    const earlyAllowanceMins = m.legType === "delivery" && m.handoverMode === "meetup" ? 20 : 60;
    const earliestStrictWindowMs = m.scheduledMs - earlyAllowanceMins * 60_000;
    if (respectStrictWindows && !m.canArriveEarlyAnytime && rawArrivalMs < earliestStrictWindowMs) {
      waitBeforeStopMinutes = Math.round((earliestStrictWindowMs - rawArrivalMs) / 60_000);
      arrivalMs = earliestStrictWindowMs;
    }

    const estimatedArrivalAt = new Date(arrivalMs);
    const isSameBuilding = idx > 0 && !viaBranch && realDist <= 0.12;
    const serviceMinutes = isSameBuilding ? 2 : 6;
    clockMs = arrivalMs + serviceMinutes * 60_000;
    // Driving + stop service time (active rider work time)
    totalMinutes += stepLoadMinutes + driveMinutes + serviceMinutes;

    cumDirectKm = Math.round((cumDirectKm + directDist) * 10) / 10;
    cumRealKm = Math.round((cumRealKm + realDist) * 10) / 10;

    if (m.hasCoords) {
      routeCoordinates.push(targetCoords);
    }

    const minutesDiffFromSchedule = Math.round((arrivalMs - m.scheduledMs) / 60_000);
    let slaStatus: "on_time" | "early_ok" | "late" | "too_early" = "on_time";

    const tooEarlyCutoffMins = m.legType === "delivery" && m.handoverMode === "meetup" ? -35 : -65;
    if (ignoreNonMeetupTimeWindows && m.handoverMode !== "meetup") {
      // Time windows disabled for non-Meetup (Lobby) stops: always treat as on_time
      slaStatus = "on_time";
      onTimeStopsCount++;
    } else if (minutesDiffFromSchedule > 15) {
      slaStatus = "late";
      lateStopsCount++;
    } else if (m.canArriveEarlyAnytime) {
      // Delivery + Ready + Lobby: arriving early is 100% valid and desirable!
      slaStatus = minutesDiffFromSchedule < -25 ? "early_ok" : "on_time";
      onTimeStopsCount++;
    } else if (minutesDiffFromSchedule < tooEarlyCutoffMins) {
      // Pickup: arriving >1 hr early means customer/bag may not be ready; Delivery Meet up: >35m early
      slaStatus = "too_early";
      tooEarlyStopsCount++;
    } else {
      onTimeStopsCount++;
    }

    const laundryStateAtStart: "pickup_leg" | "on_vehicle" | "at_branch" =
      m.legType === "pickup"
        ? "pickup_leg"
        : m.isLoadedAtStart
          ? "on_vehicle"
          : "at_branch";

    let reasonTag = "";
    if (m.expLevel === 2) {
      reasonTag = "⚡ Express 100% (ด่วนพิเศษ)";
    } else if (m.expLevel === 1) {
      reasonTag = "⚡ Express 50% (ด่วน)";
    } else if (m.canArriveEarlyAnytime && minutesDiffFromSchedule < -25) {
      reasonTag = viaBranch
        ? `🏢 Ready @ ${viaBranch.shortName} • Lobby Drop-off (ส่งก่อนเวลาได้เลย)`
        : "🏢 Ready • Lobby Drop-off (ส่งก่อนเวลาได้เลย)";
    } else if (viaBranch) {
      reasonTag =
        viaBranch.distanceToBranchKm <= 1.2
          ? `🏭 Pick up Ready bags from ${viaBranch.shortName} (รับผ้าส่งโซนใกล้เคียง)`
          : `🏭 Branch Hub Stop @ ${viaBranch.shortName} (${viaBranch.loadedTaskCount} orders/งาน)`;
    } else if (isSameBuilding) {
      reasonTag = "🏢 Same Building Stop (รวบตึกเดียวกันในรอบเดียว)";
    } else if (m.legType === "pickup" && m.handoverMode === "lobby") {
      reasonTag = "⏰ Pickup at Lobby: Must arrive on time (รอลูกค้าวางผ้าตามเวลานัด)";
    } else if (m.legType === "delivery" && m.handoverMode === "meetup") {
      reasonTag = "🤝 Meet-up Delivery: Scheduled on time (ส่งตรงเวลานัดลูกค้า)";
    } else if (m.legType === "pickup") {
      reasonTag = "⏰ Scheduled Pickup (รับผ้าตามเวลานัด)";
    } else {
      reasonTag = "📍 Optimized Waypoint (จุดใกล้ตามเส้นทาง)";
    }

    prevPos = targetCoords;

    stops.push({
      task: m.task,
      stopNumber: idx + 1,
      targetCoords,
      directDistanceFromPrevKm: directDist,
      realDistanceFromPrevKm: realDist,
      cumulativeDirectDistanceKm: cumDirectKm,
      cumulativeRealDistanceKm: cumRealKm,
      estimatedArrivalAt,
      scheduledAt: m.scheduledAt,
      minutesDiffFromSchedule,
      slaStatus,
      isLaundryReady: true,
      handoverMode: m.handoverMode,
      canArriveEarlyAnytime: m.canArriveEarlyAnytime,
      waitBeforeStopMinutes,
      laundryStateAtStart,
      sourceBranchId: m.sourceBranchId,
      sourceBranchName: m.sourceBranchName,
      sourceBranchShortName: m.sourceBranchShortName,
      viaBranch,
      reasonTag,
    });
  });

  return {
    stops,
    totalDirectDistanceKm: cumDirectKm,
    totalRealDistanceKm: cumRealKm,
    estimatedTotalMinutes: Math.round(totalMinutes),
    lateStopsCount,
    tooEarlyStopsCount,
    onTimeStopsCount,
    notReadyStopsCount,
    branchVisitsCount,
    googleMapsUrl: buildWaypointsGoogleMapsUrl(start, routeCoordinates.slice(1)),
    routeCoordinates,
  };
}

/**
 * Smart Multi-Factor Rider Route Optimizer (Lab / Compare Mode):
 * 1) Delivery Check:
 *    - Must be `Ready` (`subStatus === "ready"` or loaded on vehicle). Unready deliveries wait at the end.
 *    - `Ready + Lobby` (`Delivery: Leave at Lobby`) -> Can deliver immediately/early when passing nearby!
 *    - `Ready + Meet up` -> Must arrive on time around `deliveryScheduledAt`!
 * 2) Pickup Check:
 *    - ALL Pickups (even `Pickup: Leave at Lobby`) MUST arrive on time around `pickupScheduledAt`
 *      because the customer may not place laundry at the lobby early!
 * 3) Branch Laundry Location Awareness (PK / Soi 15 / On Vehicle) + Same-Condo Bundling.
 */
export function optimizeSmartRiderRoute<T>(
  origin: LatLng,
  tasks: T[],
  options: SmartRouteOptions = {}
): SimulatedRouteEvaluation<T> {
  const fallback = options.fallbackOriginCoords || { lat: 13.736717, lng: 100.523186 };
  const start: LatLng = hasNonZeroCoords(origin) ? origin : fallback;
  const refTime = options.referenceTime || new Date();
  const branches = options.branches || [];
  const ignoreNonMeetupTimeWindows = Boolean(options.ignoreNonMeetupTimeWindows);
  const ignoreBranchRouting = Boolean(options.ignoreBranchRouting);
  const smartEvalOptions: SmartRouteOptions = {
    ...options,
    respectStrictTimeWindows: options.respectStrictTimeWindows ?? true,
    ignoreNonMeetupTimeWindows,
    ignoreBranchRouting,
  };

  if (!tasks || tasks.length === 0) {
    return simulateRouteExecution(start, [], smartEvalOptions);
  }

  const allMetas = buildInternalSmartMeta(tasks, branches, refTime, ignoreNonMeetupTimeWindows, ignoreBranchRouting);

  // Rule 1: Separate out Delivery tasks whose laundry is NOT Ready yet (`wash`, `dry`, `iron`, `billing`)
  const readyRoutableMetas = allMetas.filter((m) => m.isLaundryReady);
  const notReadyDeliveryMetas = allMetas
    .filter((m) => !m.isLaundryReady)
    .sort((a, b) => {
      if (b.expLevel !== a.expLevel) return b.expLevel - a.expLevel;
      return a.scheduledMs - b.scheduledMs;
    });

  const validMetas = readyRoutableMetas.filter((m) => m.hasCoords);
  const missingCoordMetas = readyRoutableMetas
    .filter((m) => !m.hasCoords)
    .sort((a, b) => {
      if (b.expLevel !== a.expLevel) return b.expLevel - a.expLevel;
      return a.scheduledMs - b.scheduledMs;
    });

  if (validMetas.length <= 1) {
    const combined = [
      ...validMetas,
      ...missingCoordMetas,
      ...notReadyDeliveryMetas,
    ].map((m) => m.task);
    return simulateRouteExecution(start, combined, smartEvalOptions);
  }

  const isPickupSatisfiedMeta = (
    candidate: InternalSmartMeta<T>,
    remaining: InternalSmartMeta<T>[]
  ): boolean => {
    if (
      candidate.legType === "delivery" &&
      candidate.jobId &&
      remaining.some((u) => u.legType === "pickup" && u.jobId === candidate.jobId)
    ) {
      return false;
    }
    return true;
  };

  // Step 1: Constructive Multi-Factor Greedy + Time-Window / Branch Lookahead
  const unvisited = [...validMetas];
  const orderedValid: InternalSmartMeta<T>[] = [];
  const visitedBranches = new Set<string>();
  let currentPos = start;
  let clockMs = refTime.getTime();

  // Preload READY bags at starting branch if rider starts right at that branch (<= 0.45 km, e.g. at PK)
  const startBranchesChecked = new Set<string>();
  for (const m of validMetas) {
    if (
      m.legType === "delivery" &&
      m.isLaundryReady &&
      !m.isLoadedAtStart &&
      m.sourceBranchId &&
      m.sourceBranchCoords &&
      !startBranchesChecked.has(m.sourceBranchId)
    ) {
      startBranchesChecked.add(m.sourceBranchId);
      if (calculateEstimatedDistanceKm(start, m.sourceBranchCoords) <= 0.45) {
        visitedBranches.add(m.sourceBranchId);
        clockMs += 5 * 60_000;
      }
    }
  }

  while (unvisited.length > 0) {
    const eligible = unvisited.filter((u) => isPickupSatisfiedMeta(u, unvisited));
    const pool = eligible.length > 0 ? eligible : unvisited;

    const remainingBranchCounts = new Map<string, number>();
    for (const u of unvisited) {
      if (
        u.legType === "delivery" &&
        u.isLaundryReady &&
        !u.isLoadedAtStart &&
        u.sourceBranchId &&
        u.sourceBranchCoords &&
        !visitedBranches.has(u.sourceBranchId)
      ) {
        remainingBranchCounts.set(
          u.sourceBranchId,
          (remainingBranchCounts.get(u.sourceBranchId) || 0) + 1
        );
      }
    }

    let bestCandidate: InternalSmartMeta<T> = pool[0];
    let bestScore = Infinity;

    for (const cand of pool) {
      const needsBranch =
        cand.legType === "delivery" &&
        !cand.isLoadedAtStart &&
        Boolean(cand.sourceBranchId && cand.sourceBranchCoords) &&
        !visitedBranches.has(cand.sourceBranchId!);

      const distToBranch =
        needsBranch && cand.sourceBranchCoords
          ? calculateEstimatedDistanceKm(currentPos, cand.sourceBranchCoords)
          : 0;
      const distLeg2 =
        needsBranch && cand.sourceBranchCoords
          ? calculateEstimatedDistanceKm(cand.sourceBranchCoords, cand.targetCoords!)
          : calculateEstimatedDistanceKm(currentPos, cand.targetCoords!);
      const stepKm = distToBranch + distLeg2;

      const batchAtBranch =
        needsBranch && cand.sourceBranchId
          ? remainingBranchCounts.get(cand.sourceBranchId) || 1
          : 0;
      const loadMins = needsBranch ? (distToBranch <= 0.35 ? 3 : 5) + Math.min(5, batchAtBranch) : 0;
      const driveMins = stepKm * 2.4;
      const rawArrivalMs = clockMs + (loadMins + driveMins) * 60_000;

      // Time-Strict stops (`Pickup` & `Delivery Lobby` -> up to 1 hr early; `Delivery Meet up` -> 20m early)
      // cannot be served hours early (e.g. a 16:30 job cannot be done at 10:00)!
      const candEarlyAllowanceMins = cand.legType === "delivery" && cand.handoverMode === "meetup" ? 20 : 60;
      const earliestStrictMs = cand.scheduledMs - candEarlyAllowanceMins * 60_000;
      const waitMins =
        !cand.canArriveEarlyAnytime && rawArrivalMs < earliestStrictMs
          ? (earliestStrictMs - rawArrivalMs) / 60_000
          : 0;
      const effectiveArrivalMs = cand.canArriveEarlyAnytime
        ? rawArrivalMs
        : Math.max(rawArrivalMs, earliestStrictMs);

      const isSameSpot = orderedValid.length > 0 && !needsBranch && stepKm <= 0.14;
      const serviceMins = isSameSpot ? 2 : 6;
      const departMs = effectiveArrivalMs + serviceMins * 60_000;

      // 1) Base physical travel cost (km)
      let score = stepKm;

      // 2) Express priority pull (stronger when scheduled time is approaching/due so Express arrives on time)
      const slackMins = (cand.scheduledMs - rawArrivalMs) / 60_000;
      if (cand.expLevel === 2) {
        score -= slackMins <= 75 ? 20.0 : 12.0;
      } else if (cand.expLevel === 1) {
        score -= slackMins <= 75 ? 12.0 : 6.5;
      }

      // 3) Same-building / same-condo bundling bonus
      //    Note: Only bundle same-building immediately if the second task is either Early-OK (Delivery Lobby)
      //    OR within ~35 mins of its scheduled time (so we don't try to pick up a 17:00 Pickup at 10:00!).
      if (isSameSpot && (cand.canArriveEarlyAnytime || waitMins <= 35)) {
        score -= 3.2;
      }

      // 4) Branch Hub Synergy + Mandatory Start-At-Branch Outbound Sweep + Ready Lobby Early Drop-Off Synergy:
      const isAlreadyPreloadedDelivery =
        cand.legType === "delivery" &&
        !needsBranch &&
        Boolean(cand.sourceBranchId && visitedBranches.has(cand.sourceBranchId));
      if (isAlreadyPreloadedDelivery) {
        // Rider starts at the branch and loads clean laundry first -> Stop #1+ sweeps out loaded deliveries first!
        score -= orderedValid.length === 0 ? 5.5 : 2.4;
      } else if (needsBranch && distToBranch <= 1.5) {
        score -= Math.min(2.6, 0.7 + batchAtBranch * 0.45);
      }
      if (cand.canArriveEarlyAnytime && stepKm <= 4.5) {
        // Ready + Lobby nearby: encourage clearing it along the current zone right away!
        score -= 1.5;
      }

      // 5) Handover-Aware Time Alignment:
      if (cand.canArriveEarlyAnytime) {
        // Delivery + Ready + Lobby: NO penalty for going early! Only pull harder if deadline is approaching.
        if (slackMins <= 45) {
          const imminentPull = (45 - Math.max(0, slackMins)) * 0.05;
          const overduePull = Math.min(90, Math.max(0, -slackMins)) * 0.12;
          score -= imminentPull + overduePull;
        }
        // If this is an Express Lobby delivery scheduled much later than another Express stop, keep earlier Express first
        if (cand.expLevel > 0) {
          for (const other of pool) {
            if (other.taskKey === cand.taskKey) continue;
            if (other.expLevel < cand.expLevel) continue;
            const diffMins = (cand.scheduledMs - other.scheduledMs) / 60_000;
            if (diffMins > 30) {
              score += (diffMins - 30) * 0.08;
            }
          }
        }
      } else {
        // Time-Strict (`Pickup` [Lobby & Meet up] + `Delivery Meet up`):
        // - Mild wait cost (`0.055 / min` -> 2.4m = 0.13 << 1.0/km, so NEVER zig-zags to waste km,
        //   while deferring afternoon Pickups / Meet-ups behind Ready+Lobby deliveries and morning stops!)
        score += waitMins * 0.055;

        if (slackMins <= 50) {
          const imminentPull = (50 - Math.max(0, slackMins)) * 0.075;
          const overdueMins = Math.max(0, -slackMins);
          const overduePull = Math.min(90, overdueMins) * 0.15;
          const expUrgencyMult = cand.expLevel === 2 ? 1.6 : cand.expLevel === 1 ? 1.3 : 1.0;
          score -= (imminentPull + overduePull) * expUrgencyMult;
        }

        // Pairwise schedule-inversion cost against earlier-scheduled Time-Strict stops
        for (const other of pool) {
          if (other.taskKey === cand.taskKey) continue;
          if (cand.expLevel > other.expLevel) continue;
          // Only compare against stops that actually have an earlier deadline
          const diffMins = (cand.scheduledMs - other.scheduledMs) / 60_000;
          if (diffMins > 30) {
            score += (diffMins - 30) * 0.095;
          }
        }
      }

      // 6) 1-Step SLA Lookahead Protection:
      let inflictedLatenessKm = 0;
      for (const other of pool) {
        if (other.taskKey === cand.taskKey) continue;
        if (ignoreNonMeetupTimeWindows && other.handoverMode !== "meetup") continue;

        const otherNeedsBranchNow =
          other.legType === "delivery" &&
          !other.isLoadedAtStart &&
          Boolean(other.sourceBranchId && other.sourceBranchCoords) &&
          !visitedBranches.has(other.sourceBranchId!);
        const otherDirectKm =
          otherNeedsBranchNow && other.sourceBranchCoords
            ? calculateEstimatedDistanceKm(currentPos, other.sourceBranchCoords) +
              calculateEstimatedDistanceKm(other.sourceBranchCoords, other.targetCoords!)
            : calculateEstimatedDistanceKm(currentPos, other.targetCoords!);
        const etaOtherNowMs = clockMs + otherDirectKm * 2.4 * 60_000;

        const branchUnlockedByCand = needsBranch && cand.sourceBranchId === other.sourceBranchId;
        const otherNeedsBranchAfter = otherNeedsBranchNow && !branchUnlockedByCand;
        const otherAfterKm =
          otherNeedsBranchAfter && other.sourceBranchCoords
            ? calculateEstimatedDistanceKm(cand.targetCoords!, other.sourceBranchCoords) +
              calculateEstimatedDistanceKm(other.sourceBranchCoords, other.targetCoords!)
            : calculateEstimatedDistanceKm(cand.targetCoords!, other.targetCoords!);
        const etaOtherAfterMs = departMs + otherAfterKm * 2.4 * 60_000;

        const lateNowMins = Math.max(0, (etaOtherNowMs - other.scheduledMs - 10 * 60_000) / 60_000);
        const lateAfterMins = Math.max(0, (etaOtherAfterMs - other.scheduledMs - 10 * 60_000) / 60_000);
        const addedLateMins = Math.max(0, lateAfterMins - lateNowMins);

        if (addedLateMins > 0) {
          const otherWeight = other.expLevel === 2 ? 1.5 : other.expLevel === 1 ? 1.0 : 0.26;
          const maxCap = other.expLevel > 0 ? 60.0 : 25.0;
          inflictedLatenessKm += Math.min(maxCap, addedLateMins * otherWeight);
        }
      }
      score += inflictedLatenessKm;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    // Advance state with chosen `bestCandidate`
    const idxInUnvisited = unvisited.findIndex((u) => u.taskKey === bestCandidate.taskKey);
    if (idxInUnvisited >= 0) unvisited.splice(idxInUnvisited, 1);

    const chosenNeedsBranch =
      bestCandidate.legType === "delivery" &&
      !bestCandidate.isLoadedAtStart &&
      Boolean(bestCandidate.sourceBranchId && bestCandidate.sourceBranchCoords) &&
      !visitedBranches.has(bestCandidate.sourceBranchId!);

    const chosenDistToBranch =
      chosenNeedsBranch && bestCandidate.sourceBranchCoords
        ? calculateEstimatedDistanceKm(currentPos, bestCandidate.sourceBranchCoords)
        : 0;
    const chosenLeg2 =
      chosenNeedsBranch && bestCandidate.sourceBranchCoords
        ? calculateEstimatedDistanceKm(bestCandidate.sourceBranchCoords, bestCandidate.targetCoords!)
        : calculateEstimatedDistanceKm(currentPos, bestCandidate.targetCoords!);
    const chosenStepKm = chosenDistToBranch + chosenLeg2;
    const chosenBatch =
      chosenNeedsBranch && bestCandidate.sourceBranchId
        ? (remainingBranchCounts.get(bestCandidate.sourceBranchId) || 1)
        : 0;
    const chosenLoadMins = chosenNeedsBranch
      ? (chosenDistToBranch <= 0.35 ? 3 : 5) + Math.min(5, chosenBatch)
      : 0;
    const chosenRawArrivalMs = clockMs + (chosenLoadMins + chosenStepKm * 2.4) * 60_000;
    const chosenEarlyAllowanceMins = bestCandidate.legType === "delivery" && bestCandidate.handoverMode === "meetup" ? 20 : 60;
    const chosenEarliestStrictMs = bestCandidate.scheduledMs - chosenEarlyAllowanceMins * 60_000;
    const chosenEffectiveArrivalMs = bestCandidate.canArriveEarlyAnytime
      ? chosenRawArrivalMs
      : Math.max(chosenRawArrivalMs, chosenEarliestStrictMs);

    const chosenSameSpot = orderedValid.length > 0 && !chosenNeedsBranch && chosenStepKm <= 0.14;
    const chosenServiceMins = chosenSameSpot ? 2 : 6;

    if (chosenNeedsBranch && bestCandidate.sourceBranchId) {
      visitedBranches.add(bestCandidate.sourceBranchId);
    }

    clockMs = chosenEffectiveArrivalMs + chosenServiceMins * 60_000;
    currentPos = bestCandidate.targetCoords!;
    orderedValid.push(bestCandidate);
  }

  // Step 2: Handover- & Branch-Aware Local Relocation Refinement
  const isSequencePrecedenceValid = (seq: InternalSmartMeta<T>[]): boolean => {
    const seenPickupJobs = new Set<string>();
    for (const item of seq) {
      if (item.legType === "pickup" && item.jobId) {
        seenPickupJobs.add(item.jobId);
      } else if (item.legType === "delivery" && item.jobId) {
        const hasPickup = seq.some((s) => s.legType === "pickup" && s.jobId === item.jobId);
        if (hasPickup && !seenPickupJobs.has(item.jobId)) return false;
      }
    }
    return true;
  };

  const evaluateSequenceObjective = (seq: InternalSmartMeta<T>[]): number => {
    const sim = simulateRouteExecution(
      start,
      seq.map((s) => s.task),
      smartEvalOptions
    );
    let penalty = sim.totalRealDistanceKm;

    sim.stops.forEach((st, idx) => {
      const meta = seq[idx];
      const expMult = meta.expLevel === 2 ? 2.4 : meta.expLevel === 1 ? 1.6 : 1.0;
      if (meta.expLevel === 2) penalty += idx * 3.0;
      else if (meta.expLevel === 1) penalty += idx * 1.4;

      // Lateness SLA penalty (arriving >15m past scheduled time)
      const enforceSlaForStop = !ignoreNonMeetupTimeWindows || meta.handoverMode === "meetup";
      if (enforceSlaForStop && st.minutesDiffFromSchedule > 15) {
        const overMins = st.minutesDiffFromSchedule - 15;
        penalty += (overMins * 0.28 + (overMins / 30) * (overMins / 30) * 1.8) * expMult;
      }

      // Mild wait / too-early penalty for Time-Strict stops so a 16:30 Pickup stays in the afternoon!
      if (!meta.canArriveEarlyAnytime && st.waitBeforeStopMinutes > 0) {
        penalty += st.waitBeforeStopMinutes * 0.035;
      }
      if (!meta.canArriveEarlyAnytime && st.slaStatus === "too_early") {
        const earlyLimit = meta.legType === "delivery" && meta.handoverMode === "meetup" ? 20 : 60;
        const tooEarlyMins = Math.max(0, -st.minutesDiffFromSchedule - earlyLimit);
        penalty += tooEarlyMins * 0.045;
      }
    });

    // Pairwise Schedule-Inversion Penalty ONLY when an earlier position `i` is Time-Strict
    // (`Pickup` [Lobby/Meetup] or `Delivery Meetup`), NEVER penalizing `Delivery Ready + Lobby` going early!
    for (let i = 0; i < seq.length; i++) {
      if (seq[i].canArriveEarlyAnytime) continue;
      for (let j = i + 1; j < seq.length; j++) {
        if (seq[i].expLevel > seq[j].expLevel) continue;
        if (seq[j].canArriveEarlyAnytime) continue;
        const inversionMins = (seq[i].scheduledMs - seq[j].scheduledMs) / 60_000;
        if (inversionMins > 30) {
          penalty += (inversionMins - 30) * 0.085;
        }
      }
    }

    // Enforce Start-At-Branch Delivery First:
    // If rider starts at a branch (`<= 0.45 km`) and has preloaded clean laundry from that branch,
    // Stop #1 must deliver from that branch load first (unless Stop #1 is an Express order!).
    if (seq.length > 1) {
      const isOriginPreloaded = (m: InternalSmartMeta<T>) =>
        m.legType === "delivery" &&
        Boolean(
          m.sourceBranchCoords &&
            hasNonZeroCoords(m.sourceBranchCoords) &&
            calculateEstimatedDistanceKm(start, m.sourceBranchCoords) <= 0.45
        );
      const hasOriginPreloadedInSeq = seq.some(isOriginPreloaded);
      if (hasOriginPreloadedInSeq && !isOriginPreloaded(seq[0]) && seq[0].expLevel === 0) {
        penalty += 4.5;
      }
    }

    // Return-to-Branch Stem Awareness:
    // Any Pickup laundry still on board at the end of `seq` must return to its `sourceBranchCoords` to be washed.
    // Sweeping outward on Deliveries and inward toward the return branch on Pickups minimizes return deadhead km!
    if (sim.stops.length > 0) {
      const lastCoords = sim.stops[sim.stops.length - 1].targetCoords;
      if (hasNonZeroCoords(lastCoords)) {
        const pendingReturnCoords = new Map<string, LatLng>();
        seq.forEach((m, idx) => {
          if (m.legType === "pickup" && m.sourceBranchId && m.sourceBranchCoords) {
            pendingReturnCoords.set(m.sourceBranchId, m.sourceBranchCoords);
          }
          // If a later stop visits that branch via `viaBranch` or ends right at it, dirty bags can be dropped there
          const st = sim.stops[idx];
          if (st?.viaBranch?.branchId && pendingReturnCoords.has(st.viaBranch.branchId)) {
            pendingReturnCoords.delete(st.viaBranch.branchId);
          }
        });
        let returnStemKm = 0;
        let prevRet = lastCoords;
        for (const retCoords of pendingReturnCoords.values()) {
          returnStemKm += calculateEstimatedDistanceKm(prevRet, retCoords);
          prevRet = retCoords;
        }
        penalty += returnStemKm * 0.55;
      }
    }

    return penalty;
  };

  let currentSeq = [...orderedValid];
  let currentObj = evaluateSequenceObjective(currentSeq);
  let improved = true;
  let pass = 0;

  while (improved && pass < 25) {
    improved = false;
    pass++;

    for (let i = 0; i < currentSeq.length; i++) {
      const minJ = Math.max(0, i - 6);
      const maxJ = Math.min(currentSeq.length - 1, i + 6);
      for (let j = minJ; j <= maxJ; j++) {
        if (i === j) continue;
        const candidate = [...currentSeq];
        const [moved] = candidate.splice(i, 1);
        candidate.splice(j, 0, moved);
        if (!isSequencePrecedenceValid(candidate)) continue;

        const candObj = evaluateSequenceObjective(candidate);
        if (candObj < currentObj - 0.08) {
          currentSeq = candidate;
          currentObj = candObj;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  const finalOrderedTasks: T[] = [
    ...currentSeq.map((m) => m.task),
    ...missingCoordMetas.map((m) => m.task),
    ...notReadyDeliveryMetas.map((m) => m.task),
  ];

  return simulateRouteExecution(start, finalOrderedTasks, smartEvalOptions);
}

// ============================================================================
// SMART AUTO-SUGGEST / AUTO-ASSIGN ENGINE
// Matches unassigned tasks to nearby active riders based on live GPS,
// existing route proximity, detour km, laundry branch, and SLA safety.
// ============================================================================

export function isDedicatedCorporateManTask(task: any): boolean {
  const customerName = String(task?.job?.customerName || task?.customerName || "").toLowerCase();
  const targetLoc = String(
    task?.targetLocation || task?.job?.pickupLocation || task?.job?.dropoffLocation || ""
  ).toLowerCase();
  const combined = `${customerName} ${targetLoc}`;
  return (
    combined.includes("prime syn") ||
    combined.includes("prime fitness") ||
    combined.includes("evolve")
  );
}

export interface CandidateRiderForAutoAssign<T = any> {
  riderId: string;
  riderName: string;
  riderNickname?: string | null;
  status: string;
  area?: string | null;
  homeBranchId?: string | null;
  origin: LatLng;
  hasLiveGps?: boolean;
  currentTasks: T[];
  totalDayCount?: number;
  pendingTasksCount?: number;
  isDedicatedReserveRider?: boolean;
  baseEval?: SimulatedRouteEvaluation<T>;
}

export interface RiderAutoAssignSuggestion {
  riderId: string;
  riderName: string;
  riderNickname?: string | null;
  detourKm: number;
  distFromRiderKm: number;
  distToNearestStopKm: number;
  insertedStopNumber: number;
  score: number;
  reason: string;
}

export interface SuggestRiderOptions {
  branches?: RouteBranchInfo[];
  referenceTime?: Date;
  maxRadiusKm?: number;
  maxStopsPerRider?: number;
  maxDailyTotalStops?: number;
  shiftEndHour?: number | null;
  jobArea?: string | null;
  allowedRiderIds?: string[];
  excludedRiderIds?: string[];
  respectStrictTimeWindows?: boolean;
  strictLateOnlyMeetup?: boolean;
  ignoreNonMeetupTimeWindows?: boolean;
  disableWorkloadBalance?: boolean;
  ignoreBranchRouting?: boolean;
  ignoreRadiusLimit?: boolean;
  allowLateIfUnavoidable?: boolean;
}

export function suggestBestRiderForTask<T extends { taskId?: string; targetCoords?: LatLng | null; legType?: string }>(
  task: T,
  candidates: CandidateRiderForAutoAssign<T>[],
  options: SuggestRiderOptions = {}
): RiderAutoAssignSuggestion | null {
  if (!task || !hasNonZeroCoords(task.targetCoords)) return null;
  if (task.legType === "delivery" && !isDeliveryTaskLaundryReady(task)) return null;

  const maxRadiusKm = options.maxRadiusKm ?? 3.5;
  const ignoreRadiusLimit = Boolean(options.ignoreRadiusLimit);
  const maxStops = options.maxStopsPerRider ?? 10;
  const maxDailyTotal = options.maxDailyTotalStops ?? Infinity;
  const shiftEndHour = options.shiftEndHour ?? null;
  const refTime = options.referenceTime || new Date();
  const branches = options.branches || [];
  const jobAreaUpper = (options.jobArea || "").toUpperCase();
  const taskExpLevel = getExpressLevel(task);

  let shiftCutoffMs: number | null = null;
  if (shiftEndHour !== null && shiftEndHour > 0) {
    const cutoff = new Date(refTime);
    const wholeHour = Math.floor(shiftEndHour);
    const mins = Math.round((shiftEndHour - wholeHour) * 60);
    cutoff.setHours(wholeHour, mins, 0, 0);
    shiftCutoffMs = cutoff.getTime();
  }

  // Compute minimum dayCount among eligible online riders in the same area for fair workload balancing
  let minDayCountInArea = Infinity;
  for (const cand of candidates) {
    if (options.allowedRiderIds && options.allowedRiderIds.length > 0 && !options.allowedRiderIds.includes(cand.riderId)) {
      continue;
    }
    if (options.excludedRiderIds && options.excludedRiderIds.includes(cand.riderId)) continue;
    if (!["online", "busy"].includes((cand.status || "").toLowerCase())) continue;
    if (cand.currentTasks.length >= maxStops) continue;
    const dc = cand.totalDayCount ?? cand.currentTasks.length;
    if (dc >= maxDailyTotal) continue;
    if (jobAreaUpper && cand.area && cand.area.toUpperCase() !== jobAreaUpper) continue;
    if (dc < minDayCountInArea) minDayCountInArea = dc;
  }
  if (!Number.isFinite(minDayCountInArea)) minDayCountInArea = 0;

  let best: RiderAutoAssignSuggestion | null = null;

  for (const cand of candidates) {
    if (options.allowedRiderIds && options.allowedRiderIds.length > 0 && !options.allowedRiderIds.includes(cand.riderId)) {
      continue;
    }
    if (options.excludedRiderIds && options.excludedRiderIds.includes(cand.riderId)) {
      continue;
    }
    if (!["online", "busy"].includes((cand.status || "").toLowerCase())) continue;
    if (cand.currentTasks.length >= maxStops) continue;
    const dayCount = cand.totalDayCount ?? cand.currentTasks.length;
    if (dayCount >= maxDailyTotal) continue;
    if (jobAreaUpper && cand.area && cand.area.toUpperCase() !== jobAreaUpper) continue;

    const distFromRiderKm = hasNonZeroCoords(cand.origin)
      ? calculateEstimatedDistanceKm(cand.origin, task.targetCoords)
      : Infinity;

    let distToNearestStopKm = Infinity;
    let sumLat = 0;
    let sumLng = 0;
    let coordCount = 0;
    for (const t of cand.currentTasks) {
      if (hasNonZeroCoords(t.targetCoords)) {
        const d = calculateEstimatedDistanceKm(t.targetCoords, task.targetCoords);
        if (d < distToNearestStopKm) distToNearestStopKm = d;
        // Weight first anchor stop x2 so the rider's initial zone (e.g. Sukhumvit) stays anchored
        const w = coordCount === 0 ? 2 : 1;
        sumLat += t.targetCoords.lat * w;
        sumLng += t.targetCoords.lng * w;
        coordCount += w;
      }
    }
    const zoneCentroid: LatLng | null =
      coordCount > 0 ? { lat: sumLat / coordCount, lng: sumLng / coordCount } : null;
    const distFromZoneCentroidKm = zoneCentroid
      ? calculateEstimatedDistanceKm(zoneCentroid, task.targetCoords)
      : distFromRiderKm;

    // Fast spatial pre-filter before running route simulation (unless fallback/corporate/express override)
    const minDirectDist =
      cand.currentTasks.length > 0
        ? Math.min(distToNearestStopKm, distFromZoneCentroidKm)
        : distFromRiderKm;
    if (!ignoreRadiusLimit && minDirectDist > maxRadiusKm * 1.35) continue;

    const baseEval =
      cand.baseEval ||
      optimizeSmartRiderRoute(cand.origin, cand.currentTasks, {
        branches,
        referenceTime: refTime,
        fallbackOriginCoords: cand.origin,
        respectStrictTimeWindows: true,
        ignoreNonMeetupTimeWindows: options.ignoreNonMeetupTimeWindows,
        ignoreBranchRouting: options.ignoreBranchRouting,
      });

    const afterEval = optimizeSmartRiderRoute(cand.origin, [...cand.currentTasks, task], {
      branches,
      referenceTime: refTime,
      fallbackOriginCoords: cand.origin,
      respectStrictTimeWindows: true,
      ignoreNonMeetupTimeWindows: options.ignoreNonMeetupTimeWindows,
      ignoreBranchRouting: options.ignoreBranchRouting,
    });

    const detourKm = Math.max(0, Math.round((afterEval.totalRealDistanceKm - baseEval.totalRealDistanceKm) * 10) / 10);
    const shouldCheckLate = options.respectStrictTimeWindows !== false;
    const addedSoftLate = Math.max(0, afterEval.lateStopsCount - baseEval.lateStopsCount);
    const isTaskMatch = (s: SimulatedStopDetail<T>) =>
      (task.taskId && (s.task as any)?.taskId === task.taskId) || s.task === task;
    if (shouldCheckLate) {
      const isProtectedStop = (s: SimulatedStopDetail<T>) =>
        options.ignoreNonMeetupTimeWindows
          ? s.slaStatus === "late" && s.handoverMode === "meetup"
          : options.strictLateOnlyMeetup
            ? s.slaStatus === "late" && (s.handoverMode === "meetup" || getExpressLevel(s.task) > 0)
            : s.slaStatus === "late";
      const addedHardLate = options.strictLateOnlyMeetup
        ? Math.max(
            0,
            afterEval.stops.filter(isProtectedStop).length -
              baseEval.stops.filter(isProtectedStop).length
          )
        : addedSoftLate;
      const addedExistingHardLate = options.strictLateOnlyMeetup
        ? Math.max(
            0,
            afterEval.stops.filter((s) => !isTaskMatch(s) && isProtectedStop(s)).length -
              baseEval.stops.filter(isProtectedStop).length
          )
        : Math.max(
            0,
            afterEval.stops.filter((s) => !isTaskMatch(s) && s.slaStatus === "late").length -
              baseEval.lateStopsCount
          );

      if (!options.allowLateIfUnavoidable) {
        if (addedHardLate > 0) continue; // Hard SLA block: NEVER make Meetup or Express stops late!
      } else {
        // Fallback when this task itself is inherently late from all riders: still protect existing Meetup/Express stops!
        if (addedExistingHardLate > 0) continue;
      }
    }

    if (shiftCutoffMs !== null) {
      const estFinishMs = refTime.getTime() + afterEval.estimatedTotalMinutes * 60_000;
      const lastStopArrivalMs =
        afterEval.stops.length > 0
          ? afterEval.stops[afterEval.stops.length - 1].estimatedArrivalAt.getTime()
          : estFinishMs;
      const effectiveFinishMs = Math.max(estFinishMs, lastStopArrivalMs);
      if (effectiveFinishMs > shiftCutoffMs) continue; // Must finish within shift cutoff (e.g. 18:00 / 18:30)
    }

    const isNearby =
      ignoreRadiusLimit ||
      (cand.currentTasks.length === 0
        ? distFromRiderKm <= maxRadiusKm
        : distToNearestStopKm <= maxRadiusKm ||
          distFromZoneCentroidKm <= maxRadiusKm * 1.15 ||
          (detourKm <= Math.min(2.2, maxRadiusKm * 0.6) && distFromZoneCentroidKm <= maxRadiusKm * 1.4));

    if (!isNearby) continue;

    const insertedStopDetail = afterEval.stops.find(
      (s) => (s.task as any)?.taskId === task.taskId || s.task === task
    );
    const insertedStop = insertedStopDetail?.stopNumber || afterEval.stops.length;

    // Full Branch Cycle Synergy (Outbound Sweep + Inbound Return Laundry Branch):
    // 1. Delivery: strongly prefer rider starting at / already loading from `taskLaundryBranchId` (0 extra branch stop!)
    //    and penalize forcing a rider who is sweeping Branch A to detour across town to Branch B.
    // 2. Pickup: strongly prefer rider whose existing Pickups or Home Branch already return to `taskLaundryBranchId`,
    //    and penalize splitting a single rider's return Pickups across BOTH Soi 15 and PK!
    const taskLaundryBranchId = extractTaskJobProcessingBranchId(task) || (task as any)?.job?.branchId || null;
    let branchSweepBonus = 0;
    let branchSynergyTag = "";
    if (!options.ignoreBranchRouting && taskLaundryBranchId) {
      const branchInfo = branches.find((b) => b.id === taskLaundryBranchId);
      const branchShort = getBranchShortLabel(taskLaundryBranchId, branchInfo?.name);
      const riderAtSameBranch = Boolean(
        (branchInfo &&
          hasNonZeroCoords(branchInfo.coords) &&
          hasNonZeroCoords(cand.origin) &&
          calculateEstimatedDistanceKm(cand.origin, branchInfo.coords) <= 0.65) ||
          (!cand.hasLiveGps && cand.homeBranchId === taskLaundryBranchId)
      );

      const deliveryBranchesInStack = new Set<string>();
      const pickupReturnBranchesInStack = new Set<string>();
      for (const ct of cand.currentTasks) {
        const ctBranch = extractTaskJobProcessingBranchId(ct) || (ct as any)?.job?.branchId || null;
        if (!ctBranch) continue;
        if ((ct as any)?.legType === "delivery") {
          deliveryBranchesInStack.add(ctBranch);
        } else {
          pickupReturnBranchesInStack.add(ctBranch);
        }
      }

      if ((task as any)?.legType === "delivery") {
        if (riderAtSameBranch && !deliveryBranchesInStack.has(taskLaundryBranchId)) {
          // Top priority: Rider starts at this branch and still needs their first outbound laundry load!
          branchSweepBonus -= 4.5;
          branchSynergyTag = `Start load @ ${branchShort} (เริ่มงานรับผ้าที่สาขา ${branchShort} ออกส่งก่อน)`;
        } else if (riderAtSameBranch) {
          branchSweepBonus -= 2.8;
          branchSynergyTag = `Sweep from ${branchShort} (กวาดผ้าส่งจาก ${branchShort})`;
        } else if (deliveryBranchesInStack.has(taskLaundryBranchId)) {
          branchSweepBonus -= 1.8;
          branchSynergyTag = `Batch load @ ${branchShort} (รวบรับผ้าที่ ${branchShort})`;
        } else if (pickupReturnBranchesInStack.has(taskLaundryBranchId)) {
          branchSweepBonus -= 1.0;
          branchSynergyTag = `Drop & Reload @ ${branchShort} (ส่งผ้าซัก+รับผ้าส่งที่ ${branchShort})`;
        } else if (deliveryBranchesInStack.size > 0) {
          // Cross-branch delivery penalty when rider is already sweeping another branch
          branchSweepBonus += 1.4;
        }
      } else {
        // Pickup leg: check where dirty laundry must return!
        if (pickupReturnBranchesInStack.has(taskLaundryBranchId)) {
          branchSweepBonus -= 2.2;
          branchSynergyTag = `Return batch -> ${branchShort} (ขากลับส่งซัก ${branchShort} รอบเดียว)`;
        } else if (pickupReturnBranchesInStack.size === 0 && cand.homeBranchId === taskLaundryBranchId) {
          branchSweepBonus -= 1.5;
          branchSynergyTag = `Return to home ${branchShort} (ขากลับเข้าสาขา ${branchShort})`;
        } else if (deliveryBranchesInStack.has(taskLaundryBranchId)) {
          branchSweepBonus -= 0.9;
        }
        if (pickupReturnBranchesInStack.size > 0 && !pickupReturnBranchesInStack.has(taskLaundryBranchId)) {
          // Avoid forcing one rider to drop dirty bags at BOTH Soi 15 and PK!
          branchSweepBonus += 2.8;
        }
      }
    }

    const sameBuildingBonus = distToNearestStopKm <= 0.15 ? -3.5 : 0;
    const idleRiderBonus = dayCount === 0 && cand.currentTasks.length === 0 ? -7.0 : 0;
    // Zone Cohesion: keep all stops of a rider within their anchored zone (e.g. Sukhumvit stays in Sukhumvit)
    const zoneCohesionScore =
      cand.currentTasks.length > 0
        ? distFromZoneCentroidKm * 0.65 +
          (distFromZoneCentroidKm <= 2.5 ? -2.2 : 0) +
          (distFromZoneCentroidKm > maxRadiusKm * 1.35 ? 6.0 : 0)
        : 0;
    const excessJobs = Math.max(0, dayCount - minDayCountInArea);
    // Progressive workload balance: allow +/-1 job for natural clustering, strongly steer jobs to under-loaded riders beyond >= 2 gap
    const workloadBalancePenalty = options.disableWorkloadBalance
      ? 0
      : excessJobs <= 1
        ? excessJobs * 0.45
        : excessJobs * 1.45 + (excessJobs - 1) * 1.35;
    const softLobbyLatePenalty =
      options.strictLateOnlyMeetup && addedSoftLate > 0 ? addedSoftLate * 1.6 : 0;
    const manReserveBuffer =
      cand.isDedicatedReserveRider && (!options.allowedRiderIds || options.allowedRiderIds.length === 0) && dayCount > 0
        ? 1.2
        : 0;
    const expressOnTimePenalty =
      taskExpLevel > 0 && insertedStopDetail
        ? Math.max(0, (insertedStopDetail.estimatedArrivalAt.getTime() - refTime.getTime()) / 60_000) * 0.045 +
          (insertedStop - 1) * 0.7
        : 0;
    const unavoidableLatePenalty =
      options.allowLateIfUnavoidable && insertedStopDetail && insertedStopDetail.minutesDiffFromSchedule > 15
        ? (insertedStopDetail.minutesDiffFromSchedule - 15) * 0.45
        : 0;

    const stackCountWeight = options.disableWorkloadBalance ? 0.04 : 0.32;
    const dayCountWeight = options.disableWorkloadBalance ? 0.02 : 0.28;

    const score =
      detourKm * 1.0 +
      Math.min(distFromRiderKm, distToNearestStopKm) * 0.30 +
      zoneCohesionScore +
      cand.currentTasks.length * stackCountWeight +
      dayCount * dayCountWeight +
      workloadBalancePenalty +
      branchSweepBonus +
      sameBuildingBonus +
      idleRiderBonus +
      softLobbyLatePenalty +
      manReserveBuffer +
      expressOnTimePenalty +
      unavoidableLatePenalty;

    let reason = "";
    if (distToNearestStopKm <= 0.15) {
      reason = "Same building/condo bundle (รวบตึกเดียวกัน +0 กม.)";
    } else if (taskExpLevel > 0 && insertedStopDetail) {
      reason = `Express On-Time ETA ${insertedStopDetail.estimatedArrivalAt.toTimeString().slice(0, 5)} (+${detourKm} km)`;
    } else if (branchSynergyTag && detourKm <= 3.5) {
      reason = `${branchSynergyTag} • +${detourKm} km`;
    } else if (cand.hasLiveGps && distFromRiderKm <= 1.8) {
      reason = `Near Rider GPS (${distFromRiderKm} km / ใกล้พิกัดล่าสุด)`;
    } else if (detourKm <= 1.5 && cand.currentTasks.length > 0) {
      reason = `On current route (+${detourKm} km / ทางผ่านพอดี)`;
    } else if (distToNearestStopKm <= 2.5) {
      reason = `Cluster stop (${distToNearestStopKm} km / กลุ่มโซนเดียวกัน)`;
    } else {
      reason = branchSynergyTag || `Optimal zone fit (+${detourKm} km)`;
    }

    if (!best || score < best.score) {
      best = {
        riderId: cand.riderId,
        riderName: cand.riderName,
        riderNickname: cand.riderNickname,
        detourKm,
        distFromRiderKm: Number.isFinite(distFromRiderKm) ? distFromRiderKm : 0,
        distToNearestStopKm: Number.isFinite(distToNearestStopKm) ? distToNearestStopKm : 0,
        insertedStopNumber: insertedStop,
        score,
        reason,
      };
    }
  }

  return best;
}


