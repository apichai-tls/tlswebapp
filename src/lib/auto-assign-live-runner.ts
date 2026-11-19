import { prisma } from "@/lib/prisma";
import { publishOrderEvent } from "@/lib/realtime-bus";
import {
  buildHistoricalDispatchAffinityProfile,
  CandidateRiderForAutoAssign,
  extractTaskHandoverMode,
  extractTaskJobProcessingBranchId,
  isDedicatedCorporateManTask,
  optimizeSmartRiderRoute,
  suggestBestRiderForTask,
} from "@/lib/route-optimizer";
import type { Job, LatLng } from "@/lib/store";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

interface ServerSimSettings {
  maxRadiusKm: number;
  maxActiveStops: number;
  maxDailyJobs: number;
  shiftEndHour: number | null;
  respectStrictTimeWindows: boolean;
  ignoreNonMeetupTimeWindows?: boolean;
  disableWorkloadBalance?: boolean;
  ignoreBranchRouting?: boolean;
  useHistoricalPatterns?: boolean;
}

const DEFAULT_SERVER_SIM_SETTINGS: ServerSimSettings = {
  maxRadiusKm: 4.5,
  maxActiveStops: 10,
  maxDailyJobs: 35,
  shiftEndHour: 18.5,
  respectStrictTimeWindows: true,
  ignoreNonMeetupTimeWindows: false,
  disableWorkloadBalance: false,
  ignoreBranchRouting: false,
  useHistoricalPatterns: false,
};

interface SerializedServerSimTask {
  taskId: string;
  jobId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  branchId: string;
  laundryBranchId: string;
  legType: "pickup" | "delivery";
  handoverMode?: "lobby" | "meetup";
  isReady?: boolean;
  isCsoPaid?: boolean;
  scheduledAtIso: string;
  targetLocation: string;
  targetCoords: LatLng;
  serviceSpeed?: "standard" | "express_50" | "express_100";
}

interface ServerSimAssignmentRecord {
  taskId: string;
  jobId: string;
  legType: "pickup" | "delivery";
  simRiderId: string;
  assignedAt: string;
  reason: string;
  detourKm: number;
  distFromRiderKm: number;
  insertedStopNumber: number;
}

interface ServerPersistedSimState {
  dateKey: string;
  simTasks: SerializedServerSimTask[];
  assignments: Record<string, ServerSimAssignmentRecord>;
  riderOnlineOverrides?: Record<string, boolean>;
  riderBranchOverrides?: Record<string, string>;
  simClockHour?: number;
  completedTaskTimes?: Record<string, string>;
  riderLastLocations?: Record<string, any>;
  rejectedRiderIdsByTask?: Record<string, string[]>;
  nextSeq: number;
  settings: ServerSimSettings;
  updatedAt?: string;
}

function getBangkokDateKey(d: Date = new Date()): string {
  const bkk = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  const y = bkk.getUTCFullYear();
  const m = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bkk.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getBangkokHourFloat(d: Date = new Date()): number {
  const bkk = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return bkk.getUTCHours() + bkk.getUTCMinutes() / 60;
}

function formatBangkokHHmm(d: Date = new Date()): string {
  const bkk = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return `${String(bkk.getUTCHours()).padStart(2, "0")}:${String(bkk.getUTCMinutes()).padStart(2, "0")}`;
}

function getClockDateForBangkokKey(dateKey: string, hourFloat: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const h = Math.floor(hourFloat);
  const min = Math.round((hourFloat - h) * 60);
  const utcMs = Date.UTC(y, m - 1, d, h, min, 0, 0) - BANGKOK_OFFSET_MS;
  return new Date(utcMs);
}

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

function isWalkInLocation(loc?: string | null): boolean {
  const l = String(loc || "").trim().toLowerCase();
  if (!l) return false;
  return (
    l.startsWith("walk-in") ||
    l.startsWith("walk in") ||
    l.includes("customer pickup at shop") ||
    l.includes("customer drop-off at shop") ||
    l.includes("customer dropoff at shop") ||
    l.includes("self pickup") ||
    l.includes("self-pickup")
  );
}

function isRealLegCompleted(j: any, legType: "pickup" | "delivery"): boolean {
  if (legType === "pickup") {
    return [
      "picked_up",
      "billing",
      "process",
      "active",
      "ready_to_wash",
      "washed",
      "delivery",
      "completed",
      "delivered",
      "cancel",
    ].includes(j.status);
  }
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
  let legsObj: any = null;
  if (j.legsJson) {
    try {
      legsObj = JSON.parse(j.legsJson);
    } catch {}
  }
  return (
    ["delivered", "completed", "cancel"].includes(j.status) ||
    isDeliveredStage ||
    hasDeliveryPhoto ||
    legsObj?.deliveryOutbound?.status === "completed"
  );
}

let inFlightPromise: Promise<any> | null = null;
let rerunQueued = false;

export async function runAutoAssignLiveOnServer(): Promise<{
  success: boolean;
  dateKey: string;
  onlineRiders: number;
  totalTasks: number;
  newlyAdded: number;
  newlyAssigned: number;
  markedDone: number;
  unassignedRemaining: number;
  error?: string;
}> {
  if (inFlightPromise) {
    rerunQueued = true;
    return inFlightPromise;
  }

  const execute = async () => {
    const now = new Date();
    const todayKey = getBangkokDateKey(now);
    const stateKey = `TLS_DISPATCH_AUTO_SIM_V1_${todayKey}_LIVE_SHADOW`;
    const settingsKey = `TLS_DISPATCH_AUTO_SIM_SETTINGS_LIVE_SHADOW`;

    try {
      const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const [stateRow, settingsRow, shops, riders, dbJobs] = await Promise.all([
        prisma.setting.findUnique({ where: { key: stateKey } }),
        prisma.setting.findUnique({ where: { key: settingsKey } }),
        prisma.shopLocation.findMany(),
        prisma.rider.findMany(),
        prisma.job.findMany({
          where: {
            status: { not: "cancel" },
            createdAt: { gte: since30 },
          },
          select: {
            id: true,
            type: true,
            status: true,
            subStatus: true,
            branchId: true,
            customerId: true,
            customerName: true,
            customerPhone: true,
            riderId: true,
            pickupRiderId: true,
            deliveryRiderId: true,
            pickupScheduledAt: true,
            deliveryScheduledAt: true,
            scheduledAt: true,
            createdAt: true,
            updatedAt: true,
            completedAt: true,
            pickupLocation: true,
            dropoffLocation: true,
            pickupLat: true,
            pickupLng: true,
            dropoffLat: true,
            dropoffLng: true,
            isPaid: true,
            isStuck: true,
            remark: true,
            adminNotesJson: true,
            legsJson: true,
            deliveryProofImageUrl: true,
          },
        }),
      ]);

      let persistedSettings: ServerSimSettings = { ...DEFAULT_SERVER_SIM_SETTINGS };
      if (settingsRow?.value) {
        try {
          persistedSettings = { ...DEFAULT_SERVER_SIM_SETTINGS, ...JSON.parse(settingsRow.value) };
        } catch {}
      }

      let state: ServerPersistedSimState = {
        dateKey: todayKey,
        simTasks: [],
        assignments: {},
        completedTaskTimes: {},
        riderOnlineOverrides: {},
        riderBranchOverrides: {},
        riderLastLocations: {},
        rejectedRiderIdsByTask: {},
        nextSeq: 1,
        settings: persistedSettings,
      };

      if (stateRow?.value) {
        try {
          const parsed = JSON.parse(stateRow.value);
          state = {
            ...state,
            ...parsed,
            settings: { ...persistedSettings, ...(parsed.settings || {}) },
          };
        } catch {}
      }

      const bkkTodayEnd = getClockDateForBangkokKey(todayKey, 23.99);
      const jobMap = new Map<string, any>();
      for (const j of dbJobs) jobMap.set(j.id, j);

      const candidateTodayTasks: SerializedServerSimTask[] = [];
      for (const j of dbJobs) {
        if (["cancel", "tba", "pending"].includes(j.status)) continue;
        if (j.type === "in_store" && !j.deliveryRiderId && !j.pickupRiderId) continue;

        const validP =
          j.pickupLat && j.pickupLng && j.pickupLat !== 0 && j.pickupLng !== 0
            ? { lat: j.pickupLat, lng: j.pickupLng }
            : j.dropoffLat && j.dropoffLng && j.dropoffLat !== 0 && j.dropoffLng !== 0
              ? { lat: j.dropoffLat, lng: j.dropoffLng }
              : null;
        const validD =
          j.dropoffLat && j.dropoffLng && j.dropoffLat !== 0 && j.dropoffLng !== 0
            ? { lat: j.dropoffLat, lng: j.dropoffLng }
            : validP;

        const remarkLower = String(j.remark || "").toLowerCase();
        const serviceSpeed: SerializedServerSimTask["serviceSpeed"] =
          /express\s*100%|exp\s*100%/i.test(remarkLower)
            ? "express_100"
            : /express\s*50%|exp\s*50%|express/i.test(remarkLower)
              ? "express_50"
              : "standard";
        const laundryBranchId =
          extractTaskJobProcessingBranchId({ job: j }) || j.branchId || "shop-head";

        if ((j.type === "pickup" || j.type === "full_service") && !isWalkInLocation(j.pickupLocation) && validP) {
          const sched = j.pickupScheduledAt
            ? new Date(j.pickupScheduledAt)
            : j.scheduledAt
              ? new Date(j.scheduledAt)
              : new Date(j.createdAt);
          if (sched <= bkkTodayEnd) {
            const legDone = isRealLegCompleted(j, "pickup");
            const schedKey = getBangkokDateKey(sched);
            if (schedKey === todayKey) {
              candidateTodayTasks.push({
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

        if ((j.type === "delivery" || j.type === "full_service" || Boolean(j.deliveryRiderId)) && validD) {
          const isWalkInDeliv =
            (j.type === "in_store" && !j.deliveryRiderId) ||
            isWalkInLocation(j.dropoffLocation);
          if (!isWalkInDeliv && !j.isStuck) {
            const sched = j.deliveryScheduledAt
              ? new Date(j.deliveryScheduledAt)
              : j.scheduledAt
                ? new Date(j.scheduledAt)
                : new Date(j.createdAt);
            const legDone = isRealLegCompleted(j, "delivery");
            const isReady = j.subStatus === "ready" || j.status === "delivery" || j.status === "washed";
            if (sched <= bkkTodayEnd) {
              const schedKey = getBangkokDateKey(sched);
              if (schedKey === todayKey) {
                candidateTodayTasks.push({
                  taskId: `${j.id}-delivery`,
                  jobId: j.id,
                  customerId: j.customerId || j.id,
                  customerName: j.customerName || "Customer",
                  customerPhone: j.customerPhone || "-",
                  branchId: j.branchId || "shop-head",
                  laundryBranchId,
                  legType: "delivery",
                  handoverMode: extractTaskHandoverMode({ job: j, legType: "delivery" }),
                  isReady: isReady || legDone,
                  isCsoPaid: j.isPaid !== false,
                  scheduledAtIso: sched.toISOString(),
                  targetLocation: j.dropoffLocation || j.pickupLocation || "-",
                  targetCoords: validD,
                  serviceSpeed,
                });
              }
            }
          }
        }
      }

      let changed = false;
      let newlyAdded = 0;
      let markedDone = 0;
      const existingIds = new Set(state.simTasks.map((t) => t.taskId));
      const completedTimes = { ...(state.completedTaskTimes || {}) };

      for (const t of state.simTasks) {
        const realJob = jobMap.get(t.jobId);
        if (!realJob) continue;
        if (t.legType === "delivery") {
          const liveReady =
            realJob.subStatus === "ready" ||
            realJob.status === "delivery" ||
            realJob.status === "washed" ||
            isRealLegCompleted(realJob, "delivery");
          const livePaid = realJob.isPaid !== false;
          if (Boolean(t.isReady) !== liveReady) {
            t.isReady = liveReady;
            changed = true;
          }
          if (Boolean(t.isCsoPaid) !== livePaid) {
            t.isCsoPaid = livePaid;
            changed = true;
          }
        }
        if (isRealLegCompleted(realJob, t.legType) && !completedTimes[t.taskId]) {
          const doneDt = realJob.completedAt || realJob.updatedAt || now;
          completedTimes[t.taskId] = formatBangkokHHmm(new Date(doneDt));
          markedDone++;
          changed = true;
        }
      }

      const wasInitiallyEmpty = state.simTasks.length === 0;
      for (const t of candidateTodayTasks) {
        if (existingIds.has(t.taskId)) continue;
        const realJob = jobMap.get(t.jobId);
        const legDone = realJob ? isRealLegCompleted(realJob, t.legType) : false;
        if (wasInitiallyEmpty || !legDone) {
          state.simTasks.push(t);
          existingIds.add(t.taskId);
          newlyAdded++;
          if (legDone && !completedTimes[t.taskId]) {
            const doneDt = realJob?.completedAt || realJob?.updatedAt || now;
            completedTimes[t.taskId] = formatBangkokHHmm(new Date(doneDt));
            markedDone++;
          }
          changed = true;
        }
      }
      state.completedTaskTimes = completedTimes;

      // Auto-assign runnable unassigned tasks whenever riders are online
      const onlineRiders = riders.filter((r) => {
        const ov = state.riderOnlineOverrides?.[r.id];
        return ov !== undefined ? ov : (r.status || "").toLowerCase() === "online";
      });

      let newlyAssigned = 0;
      if (onlineRiders.length > 0) {
        const branchInfos = shops.map((s) => ({
          id: s.id,
          name: s.name,
          coords: s.lat && s.lng ? { lat: s.lat, lng: s.lng } : null,
          area: s.area || undefined,
        }));
        const curHour = Math.max(10, Math.min(20, getBangkokHourFloat(now)));
        const simClockRef = getClockDateForBangkokKey(todayKey, curHour);
        const historicalProfile = state.settings.useHistoricalPatterns
          ? buildHistoricalDispatchAffinityProfile(dbJobs as unknown as Job[], 30)
          : null;

        const hydratedForOpt = state.simTasks.map((s) => ({
          ...s,
          job: {
            id: s.jobId,
            branchId: s.branchId,
            customerId: s.customerId,
            customerName: s.customerName,
            pickupLocation: s.targetLocation,
            dropoffLocation: s.targetLocation,
            scheduledAt: new Date(s.scheduledAtIso),
          } as unknown as Job,
          scheduledAt: new Date(s.scheduledAtIso),
          isCompleted: Boolean(completedTimes[s.taskId]),
          isReady: s.isReady !== false,
          isCsoPaid: s.isCsoPaid !== false,
        }));

        const assignments = { ...state.assignments };
        const unassigned = hydratedForOpt.filter(
          (t) => !assignments[t.taskId] && !t.isCompleted && (t.legType === "delivery" ? t.isReady && t.isCsoPaid : t.isReady)
        );

        const buildCandidates = (): CandidateRiderForAutoAssign<any>[] => {
          return onlineRiders.map((r) => {
            const homeBranchId =
              state.riderBranchOverrides?.[r.id] ||
              (r as any).branchId ||
              "shop-head";
            const branchObj = shops.find((s) => s.id === homeBranchId);
            const origin: LatLng =
              r.currentLat && r.currentLng && r.currentLat !== 0 && r.currentLng !== 0
                ? { lat: r.currentLat, lng: r.currentLng }
                : branchObj?.lat && branchObj?.lng
                  ? { lat: branchObj.lat, lng: branchObj.lng }
                  : { lat: 13.7437, lng: 100.5582 };
            const currentTasks = hydratedForOpt.filter(
              (t) => !t.isCompleted && assignments[t.taskId]?.simRiderId === r.id
            );
            const totalDayCount = hydratedForOpt.filter(
              (t) => assignments[t.taskId]?.simRiderId === r.id
            ).length;
            const nickname = (r as any).nickname || r.name;
            const isMan =
              nickname.toLowerCase() === "man" ||
              r.name.toLowerCase().startsWith("man ");
            return {
              riderId: r.id,
              riderName: r.name,
              riderNickname: nickname,
              status: "online",
              homeBranchId,
              area: branchObj?.area || undefined,
              origin,
              hasLiveGps: Boolean(r.currentLat && r.currentLng),
              currentTasks,
              totalDayCount,
              isDedicatedReserveRider: isMan,
            };
          });
        };

        const manIds = onlineRiders
          .filter((r) => {
            const nn = ((r as any).nickname || r.name || "").toLowerCase();
            return nn === "man" || nn.startsWith("man ");
          })
          .map((r) => r.id);

        for (const task of unassigned) {
          const cands = buildCandidates();
          const jobBranch = shops.find((s) => s.id === task.branchId);
          const isManCorp = isDedicatedCorporateManTask(task);
          const baseOpts = {
            branches: branchInfos,
            referenceTime: simClockRef,
            maxRadiusKm: state.settings.maxRadiusKm,
            maxStopsPerRider: state.settings.maxDailyJobs,
            maxDailyTotalStops: state.settings.maxDailyJobs,
            shiftEndHour: state.settings.shiftEndHour,
            jobArea: jobBranch?.area || null,
            allowedRiderIds: isManCorp && manIds.length > 0 ? manIds : undefined,
            excludedRiderIds: state.rejectedRiderIdsByTask?.[task.taskId],
            respectStrictTimeWindows: state.settings.respectStrictTimeWindows,
            strictLateOnlyMeetup: true,
            ignoreNonMeetupTimeWindows: Boolean(state.settings.ignoreNonMeetupTimeWindows),
            disableWorkloadBalance: Boolean(state.settings.disableWorkloadBalance),
            ignoreBranchRouting: Boolean(state.settings.ignoreBranchRouting),
            useHistoricalPatterns: Boolean(state.settings.useHistoricalPatterns),
            historicalPatternProfile: state.settings.useHistoricalPatterns ? historicalProfile : null,
          };

          const sug =
            suggestBestRiderForTask(task, cands, baseOpts) ||
            suggestBestRiderForTask(task, cands, { ...baseOpts, ignoreRadiusLimit: true }) ||
            suggestBestRiderForTask(task, cands, {
              ...baseOpts,
              ignoreRadiusLimit: true,
              allowLateIfUnavoidable: true,
            });

          if (sug) {
            assignments[task.taskId] = {
              taskId: task.taskId,
              jobId: task.jobId,
              legType: task.legType,
              simRiderId: sug.riderId,
              assignedAt: now.toISOString(),
              reason: sug.reason,
              detourKm: sug.detourKm,
              distFromRiderKm: sug.distFromRiderKm,
              insertedStopNumber: sug.insertedStopNumber,
            };
            newlyAssigned++;
            changed = true;
          }
        }
        state.assignments = assignments;
      }

      if (changed || !stateRow?.value) {
        state.nextSeq = Math.max(state.nextSeq || 1, state.simTasks.length + 1);
        state.updatedAt = now.toISOString();
        await prisma.setting.upsert({
          where: { key: stateKey },
          update: { value: JSON.stringify(state) },
          create: { key: stateKey, value: JSON.stringify(state) },
        });
        await publishOrderEvent({
          type: "job.updated",
          action: "auto_assign_live_server",
        }).catch(() => {});
      }

      const unassignedRemaining = state.simTasks.filter(
        (t) => !state.assignments[t.taskId] && !state.completedTaskTimes?.[t.taskId]
      ).length;

      return {
        success: true,
        dateKey: todayKey,
        onlineRiders: onlineRiders.length,
        totalTasks: state.simTasks.length,
        newlyAdded,
        newlyAssigned,
        markedDone,
        unassignedRemaining,
      };
    } catch (err: any) {
      console.error("[runAutoAssignLiveOnServer] Error:", err);
      return {
        success: false,
        dateKey: todayKey,
        onlineRiders: 0,
        totalTasks: 0,
        newlyAdded: 0,
        newlyAssigned: 0,
        markedDone: 0,
        unassignedRemaining: 0,
        error: err?.message || "Unknown error",
      };
    }
  };

  inFlightPromise = execute().finally(async () => {
    inFlightPromise = null;
    if (rerunQueued) {
      rerunQueued = false;
      triggerAutoAssignLiveBackground();
    }
  });

  return inFlightPromise;
}

export function triggerAutoAssignLiveBackground() {
  runAutoAssignLiveOnServer().catch((err) => {
    console.warn("[triggerAutoAssignLiveBackground] Error:", err?.message || err);
  });
}
