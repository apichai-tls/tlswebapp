"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  StepForward,
  Truck,
  Package,
  Zap,
  ArrowRight,
  GitCompare,
} from "lucide-react";
import { Job, LatLng, Rider, ShopLocation } from "@/lib/store";
import {
  calculateEstimatedDistanceKm,
  optimizeSmartRiderRoute,
  suggestBestRiderForTask,
  CandidateRiderForAutoAssign,
} from "@/lib/route-optimizer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function getJobExpressInfo(job: Job): { isExpress: boolean; label: string; is100: boolean } | null {
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

export interface SimTaskItem {
  taskId: string;
  job: Job;
  legType: "pickup" | "delivery";
  actualRiderId: string | null;
  scheduledAt: Date;
  targetLocation: string;
  targetCoords: LatLng | null;
  expressInfo: ReturnType<typeof getJobExpressInfo>;
  isCompleted: boolean;
  isCancelled: boolean;
  isReadyForDispatch: boolean;
}

export interface SimAssignmentRecord {
  taskId: string;
  jobId: string;
  legType: "pickup" | "delivery";
  simRiderId: string;
  source: "anchor" | "auto_sim";
  assignedAt: string;
  reason: string;
  detourKm: number;
  distFromRiderKm: number;
  distToNearestStopKm: number;
  score: number;
  insertedStopNumber?: number;
}

interface SimSettings {
  autoRunEnabled: boolean;
  requireAnchorJob: boolean;
  maxRadiusKm: number;
  maxActiveStops: number;
  respectStrictTimeWindows: boolean;
}

interface PersistedSimState {
  dateKey: string;
  assignments: Record<string, SimAssignmentRecord>;
  settings: SimSettings;
}

const DEFAULT_SETTINGS: SimSettings = {
  autoRunEnabled: true,
  requireAnchorJob: true,
  maxRadiusKm: 4.5,
  maxActiveStops: 10,
  respectStrictTimeWindows: true,
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

function buildTodaySimTasks(
  allJobs: Job[],
  effectiveArea: string,
  shopLocations: ShopLocation[],
  isAreaRestricted: boolean,
  allowedBranchIds: Set<string>
): SimTaskItem[] {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  let jobs = allJobs.filter((j) => !["tba", "pending", "cancel"].includes(j.status));

  if (effectiveArea !== "ALL") {
    jobs = jobs.filter((j) => {
      const branch = shopLocations.find((s) => s.id === j.branchId);
      if (isAreaRestricted && shopLocations.length > 0) {
        return Boolean(j.branchId && allowedBranchIds.has(j.branchId));
      }
      return (
        (branch?.area || "").toUpperCase() === effectiveArea.toUpperCase() ||
        j.branchId === effectiveArea
      );
    });
  }

  const tasks: SimTaskItem[] = [];

  for (const j of jobs) {
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

    // 1. Pickup Leg (include both active AND completed today so stack persists!)
    if (j.type === "pickup" || j.type === "full_service") {
      const sched = j.pickupScheduledAt
        ? new Date(j.pickupScheduledAt)
        : j.scheduledAt
          ? new Date(j.scheduledAt)
          : new Date(j.createdAt);
      const assignedRiderId = j.pickupRiderId || j.riderId || null;
      const isPickupDone =
        ["picked_up", "billing", "process", "active", "ready_to_wash", "washed", "delivery", "completed"].includes(
          j.status
        ) || j.legs?.pickupOutbound?.status === "completed";
      const isPickupReady = ["accepted", "pickup"].includes(j.status) && !isPickupDone;

      if (isSameDay(sched, now) && sched <= todayEnd) {
        tasks.push({
          taskId: `${j.id}-pickup`,
          job: j,
          legType: "pickup",
          actualRiderId: assignedRiderId,
          scheduledAt: sched,
          targetLocation: j.pickupLocation || j.dropoffLocation || "-",
          targetCoords: validPickupCoords,
          expressInfo,
          isCompleted: isPickupDone,
          isCancelled: false,
          isReadyForDispatch: isPickupReady,
        });
      }
    }

    // 2. Delivery Leg (include both ready-for-delivery AND completed/delivered today so stack persists!)
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
        ["delivered", "completed"].includes(j.status) ||
        isDeliveredStage ||
        hasDeliveryPhoto ||
        j.legs?.deliveryOutbound?.status === "completed";
      const isDeliveryReady =
        !isDeliveryDone &&
        (["washed", "delivery"].includes(j.status) || j.subStatus === "ready") &&
        !j.isStuck;

      if (isDeliveryReady || isDeliveryDone) {
        const sched = j.deliveryScheduledAt
          ? new Date(j.deliveryScheduledAt)
          : j.scheduledAt
            ? new Date(j.scheduledAt)
            : new Date(j.createdAt);
        if (isSameDay(sched, now) && sched <= todayEnd) {
          tasks.push({
            taskId: `${j.id}-delivery`,
            job: j,
            legType: "delivery",
            actualRiderId: j.deliveryRiderId || null,
            scheduledAt: sched,
            targetLocation: j.dropoffLocation || j.pickupLocation || "-",
            targetCoords: validDropoffCoords,
            expressInfo,
            isCompleted: isDeliveryDone,
            isCancelled: false,
            isReadyForDispatch: isDeliveryReady,
          });
        }
      }
    }
  }

  return tasks.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export function AdminDispatchAutoSim({
  allJobs,
  riders,
  shopLocations,
  effectiveArea,
  isAreaRestricted,
  allowedBranchIds,
  getRiderOriginCoords,
  onOpenJobDetail,
}: {
  allJobs: Job[];
  riders: Rider[];
  shopLocations: ShopLocation[];
  effectiveArea: string;
  isAreaRestricted: boolean;
  allowedBranchIds: Set<string>;
  getRiderOriginCoords: (rider: Rider) => LatLng;
  onOpenJobDetail: (job: Job) => void;
}) {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const storageKey = `tls_dispatch_auto_sim_v1_${todayKey}`;

  const [simState, setSimState] = useState<PersistedSimState>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.dateKey === todayKey && parsed?.assignments) {
            return {
              dateKey: todayKey,
              assignments: parsed.assignments,
              settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
            };
          }
        }
      } catch {}
    }
    return {
      dateKey: todayKey,
      assignments: {},
      settings: DEFAULT_SETTINGS,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(simState));
    } catch {}
  }, [simState, storageKey]);

  const settings = simState.settings;
  const assignments = simState.assignments;

  const todayTasks = useMemo(
    () =>
      buildTodaySimTasks(
        allJobs,
        effectiveArea,
        shopLocations,
        isAreaRestricted,
        allowedBranchIds
      ),
    [allJobs, effectiveArea, shopLocations, isAreaRestricted, allowedBranchIds]
  );

  const taskMap = useMemo(() => {
    const m = new Map<string, SimTaskItem>();
    todayTasks.forEach((t) => m.set(t.taskId, t));
    return m;
  }, [todayTasks]);

  const riderNameById = useMemo(() => {
    const m = new Map<string, string>();
    riders.forEach((r) => m.set(r.id, r.nickname || r.name));
    return m;
  }, [riders]);

  // Helper to run 1 step or all steps of Simulation Assignment on current state
  const computeNextAssignments = (
    currentAssignments: Record<string, SimAssignmentRecord>,
    currentSettings: SimSettings,
    mode: "seed_only" | "step_one" | "run_all"
  ): { next: Record<string, SimAssignmentRecord>; addedCount: number } => {
    const next: Record<string, SimAssignmentRecord> = { ...currentAssignments };
    let addedCount = 0;
    const nowIso = new Date().toISOString();

    // 1. Seed any real assigned jobs from Prod/Real board that are NOT yet in Sim
    // Rule: If Sim already assigned it earlier ("auto_sim"), keep Sim's decision locked!
    for (const task of todayTasks) {
      if (task.actualRiderId && !next[task.taskId]) {
        const riderExists = riders.some((r) => r.id === task.actualRiderId);
        if (riderExists) {
          next[task.taskId] = {
            taskId: task.taskId,
            jobId: task.job.id,
            legType: task.legType,
            simRiderId: task.actualRiderId,
            source: "anchor",
            assignedAt: nowIso,
            reason: "Anchor / Real Manual Assign from Board",
            detourKm: 0,
            distFromRiderKm: 0,
            distToNearestStopKm: 0,
            score: 0,
          };
          addedCount++;
        }
      }
    }

    if (mode === "seed_only") {
      return { next, addedCount };
    }

    // 2. Build candidate pool from active riders (online/busy, or already holding an anchor/sim task)
    const branchInfos = shopLocations.map((s) => ({
      id: s.id,
      name: s.name,
      coords: s.coords,
      area: s.area,
    }));
    const refTime = new Date();

    const riderStackMap = new Map<string, SimTaskItem[]>();
    riders.forEach((r) => riderStackMap.set(r.id, []));

    for (const [tId, rec] of Object.entries(next)) {
      const task = taskMap.get(tId);
      if (!task) continue;
      const list = riderStackMap.get(rec.simRiderId);
      if (list) list.push(task);
    }

    const candidates: CandidateRiderForAutoAssign<SimTaskItem>[] = riders
      .filter((r) => {
        const stack = riderStackMap.get(r.id) || [];
        const isOnlineOrBusy = ["online", "busy"].includes((r.status || "").toLowerCase());
        if (currentSettings.requireAnchorJob) {
          return stack.length > 0;
        }
        return isOnlineOrBusy || stack.length > 0;
      })
      .map((r) => {
        const stack = riderStackMap.get(r.id) || [];
        // Use the last completed task's location if rider doesn't have live GPS, else live GPS/branch
        const completedInStack = stack.filter((t) => t.isCompleted && isValidLatLng(t.targetCoords));
        const lastCompleted =
          completedInStack.length > 0 ? completedInStack[completedInStack.length - 1] : null;
        const baseOrigin = isValidLatLng(r.currentLocation)
          ? r.currentLocation
          : lastCompleted?.targetCoords || getRiderOriginCoords(r);

        const activeTasksInStack = stack.filter((t) => !t.isCompleted && t.isReadyForDispatch);
        const riderBranch = r.branchId ? shopLocations.find((s) => s.id === r.branchId) : null;

        return {
          riderId: r.id,
          riderName: r.name,
          riderNickname: r.nickname,
          status: stack.length > 0 ? "busy" : r.status || "online",
          area: riderBranch?.area || null,
          origin: baseOrigin,
          hasLiveGps: isValidLatLng(r.currentLocation),
          currentTasks: activeTasksInStack,
          baseEval: optimizeSmartRiderRoute(baseOrigin, activeTasksInStack, {
            branches: branchInfos,
            referenceTime: refTime,
            fallbackOriginCoords: baseOrigin,
            respectStrictTimeWindows: currentSettings.respectStrictTimeWindows,
          }),
        };
      });

    if (candidates.length === 0) {
      return { next, addedCount };
    }

    // 3. Find all unassigned & ready tasks not yet in Sim
    const pendingUnassigned = todayTasks.filter(
      (t) => t.isReadyForDispatch && !t.actualRiderId && !next[t.taskId]
    );

    // Prioritize Express -> Scheduled Time
    pendingUnassigned.sort((a, b) => {
      const tierA = a.expressInfo?.isExpress ? (a.expressInfo.is100 ? 2 : 1) : 0;
      const tierB = b.expressInfo?.isExpress ? (b.expressInfo.is100 ? 2 : 1) : 0;
      if (tierA !== tierB) return tierB - tierA;
      return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    });

    for (const task of pendingUnassigned) {
      const jobBranch = task.job.branchId
        ? shopLocations.find((s) => s.id === task.job.branchId)
        : null;

      const suggestion = suggestBestRiderForTask(task, candidates, {
        branches: branchInfos,
        referenceTime: refTime,
        maxRadiusKm: currentSettings.maxRadiusKm,
        maxStopsPerRider: currentSettings.maxActiveStops,
        jobArea: jobBranch?.area || null,
      });

      if (suggestion) {
        next[task.taskId] = {
          taskId: task.taskId,
          jobId: task.job.id,
          legType: task.legType,
          simRiderId: suggestion.riderId,
          source: "auto_sim",
          assignedAt: new Date().toISOString(),
          reason: suggestion.reason,
          detourKm: suggestion.detourKm,
          distFromRiderKm: suggestion.distFromRiderKm,
          distToNearestStopKm: suggestion.distToNearestStopKm,
          score: Math.round(suggestion.score * 100) / 100,
          insertedStopNumber: suggestion.insertedStopNumber,
        };
        addedCount++;

        const chosen = candidates.find((c) => c.riderId === suggestion.riderId);
        if (chosen) {
          chosen.currentTasks = [...chosen.currentTasks, task];
          chosen.baseEval = optimizeSmartRiderRoute(chosen.origin, chosen.currentTasks, {
            branches: branchInfos,
            referenceTime: refTime,
            fallbackOriginCoords: chosen.origin,
            respectStrictTimeWindows: currentSettings.respectStrictTimeWindows,
          });
        }

        if (mode === "step_one") {
          break;
        }
      }
    }

    return { next, addedCount };
  };

  // Auto-seed real anchors + reactive auto-assign whenever new tasks arrive and autoRunEnabled is ON
  useEffect(() => {
    const mode = settings.autoRunEnabled ? "run_all" : "seed_only";
    setSimState((prev) => {
      const { next, addedCount } = computeNextAssignments(prev.assignments, prev.settings, mode);
      if (addedCount === 0) return prev;
      return {
        ...prev,
        assignments: next,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayTasks, riders, settings.autoRunEnabled, settings.requireAnchorJob, settings.maxRadiusKm, settings.maxActiveStops, settings.respectStrictTimeWindows]);

  const handleResetSimulation = () => {
    setSimState((prev) => {
      const { next } = computeNextAssignments({}, prev.settings, prev.settings.autoRunEnabled ? "run_all" : "seed_only");
      return {
        ...prev,
        assignments: next,
      };
    });
  };

  const handleStepOne = () => {
    setSimState((prev) => {
      const { next } = computeNextAssignments(prev.assignments, prev.settings, "step_one");
      return { ...prev, assignments: next };
    });
  };

  const handleRunAll = () => {
    setSimState((prev) => {
      const { next } = computeNextAssignments(prev.assignments, prev.settings, "run_all");
      return { ...prev, assignments: next };
    });
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

  // Build Rider Columns + Remaining Unassigned for display
  const { simRiderColumns, remainingUnassigned, kpis } = useMemo(() => {
    const branchInfos = shopLocations.map((s) => ({
      id: s.id,
      name: s.name,
      coords: s.coords,
      area: s.area,
    }));

    const cols = riders.map((rider) => {
      const stackEntries: Array<{ task: SimTaskItem; record: SimAssignmentRecord }> = [];
      for (const task of todayTasks) {
        const rec = assignments[task.taskId];
        if (rec && rec.simRiderId === rider.id) {
          stackEntries.push({ task, record: rec });
        }
      }

      // Sort stack chronologically by assignedAt / scheduledAt so completed + active stay in a clear sequence
      stackEntries.sort((a, b) => {
        if (a.task.isCompleted !== b.task.isCompleted) {
          return a.task.isCompleted ? -1 : 1; // Completed on top (history stack), Active below
        }
        return a.task.scheduledAt.getTime() - b.task.scheduledAt.getTime();
      });

      const activeTasks = stackEntries.filter((e) => !e.task.isCompleted).map((e) => e.task);
      const completedTasks = stackEntries.filter((e) => e.task.isCompleted).map((e) => e.task);
      const origin = getRiderOriginCoords(rider);
      const activeEval = optimizeSmartRiderRoute(origin, activeTasks, {
        branches: branchInfos,
        referenceTime: new Date(),
        fallbackOriginCoords: origin,
        respectStrictTimeWindows: settings.respectStrictTimeWindows,
      });

      // Calculate total stack distance (completed + active)
      let fullStackKm = 0;
      let prevCoord = origin;
      for (const entry of stackEntries) {
        if (isValidLatLng(entry.task.targetCoords)) {
          fullStackKm += calculateEstimatedDistanceKm(prevCoord, entry.task.targetCoords);
          prevCoord = entry.task.targetCoords;
        }
      }
      fullStackKm = Math.round(fullStackKm * 10) / 10;

      const anchorCount = stackEntries.filter((e) => e.record.source === "anchor").length;
      const autoCount = stackEntries.filter((e) => e.record.source === "auto_sim").length;

      return {
        rider,
        stackEntries,
        activeCount: activeTasks.length,
        completedCount: completedTasks.length,
        anchorCount,
        autoCount,
        activeDistanceKm: activeEval.totalRealDistanceKm,
        fullStackKm,
      };
    });

    cols.sort((a, b) => {
      if (b.stackEntries.length !== a.stackEntries.length) {
        return b.stackEntries.length - a.stackEntries.length;
      }
      const aOnline = a.rider.status === "online" || a.rider.status === "busy" ? 1 : 0;
      const bOnline = b.rider.status === "online" || b.rider.status === "busy" ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return a.rider.name.localeCompare(b.rider.name);
    });

    const unassigned = todayTasks.filter(
      (t) => t.isReadyForDispatch && !assignments[t.taskId]
    );

    const allSimRecords = Object.values(assignments).filter((r) => taskMap.has(r.taskId));
    const autoRecords = allSimRecords.filter((r) => r.source === "auto_sim");
    const anchorRecords = allSimRecords.filter((r) => r.source === "anchor");

    let comparedCount = 0;
    let matchedActualCount = 0;
    for (const rec of autoRecords) {
      const t = taskMap.get(rec.taskId);
      if (t?.actualRiderId) {
        comparedCount++;
        if (t.actualRiderId === rec.simRiderId) matchedActualCount++;
      }
    }

    const totalCompletedInStack = todayTasks.filter(
      (t) => t.isCompleted && assignments[t.taskId]
    ).length;

    return {
      simRiderColumns: cols,
      remainingUnassigned: unassigned,
      kpis: {
        totalInStacks: allSimRecords.length,
        anchorCount: anchorRecords.length,
        autoAssignedCount: autoRecords.length,
        completedInStackCount: totalCompletedInStack,
        unassignedCount: unassigned.length,
        comparedCount,
        matchedActualCount,
      },
    };
  }, [riders, todayTasks, assignments, shopLocations, getRiderOriginCoords, settings.respectStrictTimeWindows, taskMap]);

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
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900">
                  Auto-Assign Simulation Lab
                </h3>
                <Badge className="bg-violet-100 text-violet-700 border border-violet-200 text-[10px] font-extrabold">
                  Virtual Sandbox • No DB Write
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500">
                ยึดงานแรกจริงจาก User เป็น Anchor แล้วจำลอง Auto-Assign งานใหม่ที่เด้งเข้า Unassigned ระหว่างวัน (งานที่ Completed จะยังค้างใน Stack เพื่อสรุปผล)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={settings.autoRunEnabled ? "default" : "outline"}
              onClick={() => updateSetting("autoRunEnabled", !settings.autoRunEnabled)}
              className={`h-8 text-xs font-bold gap-1.5 rounded-xl cursor-pointer ${
                settings.autoRunEnabled
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "border-slate-300 text-slate-700"
              }`}
            >
              {settings.autoRunEnabled ? <Pause size={13} /> : <Play size={13} />}
              {settings.autoRunEnabled ? "Live Auto-Sim: ON" : "Live Auto-Sim: PAUSED"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleStepOne}
              disabled={remainingUnassigned.length === 0}
              className="h-8 text-xs font-bold gap-1.5 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
            >
              <StepForward size={13} />
              Step (+1)
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRunAll}
              disabled={remainingUnassigned.length === 0}
              className="h-8 text-xs font-bold gap-1.5 rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50 cursor-pointer"
            >
              <Sparkles size={13} />
              Run All ({remainingUnassigned.length})
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleResetSimulation}
              className="h-8 text-xs font-bold gap-1.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              <RotateCcw size={13} />
              Reset Sim
            </Button>
          </div>
        </div>

        {/* Tuning & KPI Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Tuning Parameters */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 font-bold text-slate-600">
              <SlidersHorizontal size={13} className="text-violet-600" />
              Logic Tuning:
            </span>

            <label className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg cursor-pointer select-none font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.requireAnchorJob}
                onChange={(e) => updateSetting("requireAnchorJob", e.target.checked)}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span>รอมีงานแรกจริง (Anchor) ก่อน</span>
            </label>

            <label className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg cursor-pointer select-none font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.respectStrictTimeWindows}
                onChange={(e) => updateSetting("respectStrictTimeWindows", e.target.checked)}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span>ห้ามแทรกจนงานอื่นสาย</span>
            </label>

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
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg font-semibold text-slate-700">
              <span>Max Active:</span>
              <select
                value={settings.maxActiveStops}
                onChange={(e) => updateSetting("maxActiveStops", Number(e.target.value))}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold text-indigo-700 cursor-pointer"
              >
                <option value={5}>5 stops</option>
                <option value={8}>8 stops</option>
                <option value={10}>10 stops</option>
                <option value={15}>15 stops</option>
              </select>
            </div>
          </div>

          {/* Live Simulation KPIs */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
              Stack Total: <strong className="text-slate-900">{kpis.totalInStacks}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/70">
              Anchor (จริง): <strong>{kpis.anchorCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200/70">
              Auto-Sim: <strong>{kpis.autoAssignedCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              Completed in Stack: <strong>{kpis.completedInStackCount}</strong>
            </span>
            {kpis.comparedCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/70 inline-flex items-center gap-1">
                <GitCompare size={12} />
                Match Manual: <strong>{kpis.matchedActualCount}/{kpis.comparedCount}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Simulation Columns */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3.5">
        <div className="flex items-stretch gap-3.5 h-full min-h-0 min-w-max">
          {/* Column 1: Unassigned / Waiting Queue */}
          <div className="w-[290px] h-full min-h-0 shrink-0 flex flex-col rounded-2xl border border-amber-200/90 bg-amber-50/40">
            <div className="px-3.5 py-3 bg-white rounded-t-2xl border-b border-amber-200/70 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h4 className="text-xs font-black text-slate-900 uppercase">
                    Unassigned Queue
                  </h4>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  งานที่ยังไม่เข้าเงื่อนไข หรือรอไรเดอร์มีงานแรก
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                {remainingUnassigned.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {remainingUnassigned.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400 font-medium">
                  <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                  ไม่มีงานค้างใน Unassigned
                </div>
              ) : (
                remainingUnassigned.map((task) => (
                  <div
                    key={task.taskId}
                    onClick={() => onOpenJobDetail(task.job)}
                    className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs hover:border-amber-400 transition-all cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[11px] font-black text-slate-800">
                        #{task.job.id}
                      </span>
                      <div className="flex items-center gap-1">
                        {task.expressInfo?.isExpress && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white inline-flex items-center gap-0.5">
                            <Zap size={8} className="fill-white" />
                            EXP
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase ${
                            task.legType === "pickup"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {task.legType}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {task.job.customerName}
                    </p>
                    <div className="flex items-start gap-1 text-[11px] text-slate-500">
                      <MapPin size={11} className="shrink-0 mt-0.5 text-slate-400" />
                      <span className="line-clamp-2">{task.targetLocation}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} />
                        {format(task.scheduledAt, "HH:mm")}
                      </span>
                      {!isValidLatLng(task.targetCoords) ? (
                        <span className="text-rose-500 font-bold">No GPS</span>
                      ) : (
                        <span className="text-amber-600 font-semibold">Waiting / Out of radius</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Rider Simulation Stack Columns */}
          {simRiderColumns.map((col) => {
            const isOnlineOrBusy =
              col.rider.status === "online" || col.rider.status === "busy";

            return (
              <div
                key={col.rider.id}
                className="w-[315px] h-full min-h-0 shrink-0 flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
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
                            isOnlineOrBusy ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-900 truncate">
                          {col.rider.nickname || col.rider.name}
                        </h4>
                        <p className="text-[10px] text-slate-500 truncate">
                          {col.rider.name}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                        {col.stackEntries.length} Stack
                      </span>
                    </div>
                  </div>

                  {/* Rider Stack Metrics */}
                  <div className="grid grid-cols-4 gap-1 text-center text-[10px] bg-white rounded-xl border border-slate-200/80 p-1.5">
                    <div>
                      <div className="font-black text-blue-600">{col.anchorCount}</div>
                      <div className="text-slate-400 text-[9px]">Anchor</div>
                    </div>
                    <div className="border-l border-slate-100">
                      <div className="font-black text-violet-600">{col.autoCount}</div>
                      <div className="text-slate-400 text-[9px]">Auto-Sim</div>
                    </div>
                    <div className="border-l border-slate-100">
                      <div className="font-black text-emerald-600">{col.completedCount}</div>
                      <div className="text-slate-400 text-[9px]">Done</div>
                    </div>
                    <div className="border-l border-slate-100">
                      <div className="font-black text-slate-800">{col.fullStackKm}km</div>
                      <div className="text-slate-400 text-[9px]">Est.Dist</div>
                    </div>
                  </div>
                </div>

                {/* Rider Stack Cards (Completed + Active Persisted) */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-slate-50/40">
                  {col.stackEntries.length === 0 ? (
                    <div className="text-center py-10 px-4 text-[11px] text-slate-400">
                      {settings.requireAnchorJob
                        ? "รอ User Assign งานแรกจริง (Anchor) ให้ไรเดอร์คนนี้..."
                        : "ยังไม่มีงานใน Stack"}
                    </div>
                  ) : (
                    col.stackEntries.map(({ task, record }, idx) => {
                      const isAnchor = record.source === "anchor";
                      const actualName = task.actualRiderId
                        ? riderNameById.get(task.actualRiderId) || task.actualRiderId
                        : null;
                      const hasMismatchWithManual =
                        !isAnchor &&
                        Boolean(task.actualRiderId) &&
                        task.actualRiderId !== record.simRiderId;
                      const isMatchedManual =
                        !isAnchor &&
                        Boolean(task.actualRiderId) &&
                        task.actualRiderId === record.simRiderId;

                      return (
                        <div
                          key={task.taskId}
                          onClick={() => onOpenJobDetail(task.job)}
                          className={`rounded-xl border p-2.5 transition-all cursor-pointer space-y-1.5 ${
                            task.isCompleted
                              ? "bg-emerald-50/50 border-emerald-200/80 opacity-85"
                              : isAnchor
                                ? "bg-white border-blue-300 shadow-2xs ring-1 ring-blue-100"
                                : "bg-white border-violet-300 shadow-2xs ring-1 ring-violet-100"
                          }`}
                        >
                          {/* Stack Step Header */}
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${
                                  task.isCompleted
                                    ? "bg-emerald-600 text-white"
                                    : isAnchor
                                      ? "bg-blue-600 text-white"
                                      : "bg-violet-600 text-white"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <span className="font-mono text-[11px] font-black text-slate-800">
                                #{task.job.id}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              {task.isCompleted && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 inline-flex items-center gap-0.5">
                                  <CheckCircle2 size={9} />
                                  Done
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                  isAnchor
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-violet-100 text-violet-800"
                                }`}
                              >
                                {isAnchor ? "ANCHOR" : "AUTO-SIM"}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                  task.legType === "pickup"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                {task.legType === "pickup" ? "P" : "D"}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs font-bold text-slate-900 truncate">
                            {task.job.customerName}
                          </p>
                          <div className="flex items-start gap-1 text-[10.5px] text-slate-500">
                            <MapPin size={11} className="shrink-0 mt-0.5 text-slate-400" />
                            <span className="line-clamp-2">{task.targetLocation}</span>
                          </div>

                          {/* Reason & Comparison Footer */}
                          <div className="pt-1.5 border-t border-slate-100 space-y-1 text-[10px]">
                            <div className="flex items-center justify-between text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock size={10} />
                                {format(task.scheduledAt, "HH:mm")}
                              </span>
                              {!isAnchor && (
                                <span className="font-bold text-violet-700">
                                  +{record.detourKm} km (Score {record.score})
                                </span>
                              )}
                            </div>

                            {!isAnchor && (
                              <div className="text-[10px] text-violet-700 bg-violet-50/80 px-2 py-1 rounded-md font-medium">
                                {record.reason}
                              </div>
                            )}

                            {hasMismatchWithManual && (
                              <div className="flex items-center justify-between text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md font-bold">
                                <span>Manual จริงจ่ายให้:</span>
                                <span>{actualName}</span>
                              </div>
                            )}

                            {isMatchedManual && (
                              <div className="flex items-center justify-between text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-md font-bold">
                                <span>ตรงกับ Manual จริง ✓</span>
                                <span>{actualName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
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
