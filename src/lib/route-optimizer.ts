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
 * Solves the Traveling Salesperson Problem (TSP) using Nearest-Neighbor + 2-Opt local search,
 * while strictly guaranteeing that Pickup for an order precedes Delivery if both exist.
 */
export function optimizeRiderRoute<T extends { targetCoords?: LatLng | null; legType?: string; job?: { id: string } }>(
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

  // Partition tasks into those with valid coordinates vs missing coordinates
  const validTasks = tasks.filter((t) => hasNonZeroCoords(t.targetCoords));
  const fallbackTasks = tasks.filter((t) => !hasNonZeroCoords(t.targetCoords));

  if (validTasks.length <= 1) {
    const single = validTasks[0];
    const dist = single ? calculateEstimatedDistanceKm(start, single.targetCoords!) : 0;
    const items: OptimizedRouteItem<T>[] = single
      ? [
          {
            task: single,
            stopNumber: 1,
            targetCoords: single.targetCoords!,
            distanceFromPrevKm: dist,
            cumulativeDistanceKm: dist,
          },
        ]
      : [];

    fallbackTasks.forEach((ft) => {
      items.push({
        task: ft,
        stopNumber: items.length + 1,
        targetCoords: single ? single.targetCoords! : start,
        distanceFromPrevKm: 0,
        cumulativeDistanceKm: dist,
      });
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

  // Step 1: Nearest-Neighbor Heuristic from start point
  const unvisited = [...validTasks];
  const route: T[] = [];
  let currentPos = start;

  while (unvisited.length > 0) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const candidate = unvisited[i];
      // Check precedence constraint: if candidate is delivery and its pickup is in unvisited, cannot visit delivery yet!
      if (
        candidate.legType === "delivery" &&
        candidate.job?.id &&
        unvisited.some((u) => u.legType === "pickup" && u.job?.id === candidate.job?.id)
      ) {
        continue;
      }

      const dist = calculateEstimatedDistanceKm(currentPos, candidate.targetCoords!);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      bestIdx = 0;
    }

    const nextStop = unvisited.splice(bestIdx, 1)[0];
    route.push(nextStop);
    currentPos = nextStop.targetCoords!;
  }

  // Step 2: 2-Opt local search refinement (uncross paths while respecting precedence)
  function isPrecedenceValid(candidateRoute: T[]): boolean {
    const visitedJobPickups = new Set<string>();
    for (const t of candidateRoute) {
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

        if (isPrecedenceValid(candidate)) {
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

  // Build sequential metadata
  let cumulative = 0;
  let prevPos = start;
  const orderedTasks: OptimizedRouteItem<T>[] = route.map((task, idx) => {
    const distFromPrev = calculateEstimatedDistanceKm(prevPos, task.targetCoords!);
    cumulative += distFromPrev;
    prevPos = task.targetCoords!;

    return {
      task,
      stopNumber: idx + 1,
      targetCoords: task.targetCoords!,
      distanceFromPrevKm: distFromPrev,
      cumulativeDistanceKm: Math.round(cumulative * 10) / 10,
    };
  });

  // Append any tasks without valid coordinates so they are never lost from the column
  const totalDist = Math.round(cumulative * 10) / 10;
  fallbackTasks.forEach((ft) => {
    orderedTasks.push({
      task: ft,
      stopNumber: orderedTasks.length + 1,
      targetCoords: prevPos,
      distanceFromPrevKm: 0,
      cumulativeDistanceKm: totalDist,
    });
  });

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
