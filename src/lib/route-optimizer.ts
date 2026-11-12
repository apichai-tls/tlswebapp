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
