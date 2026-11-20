import { prisma } from "@/lib/prisma";
import { publishOrderEvent } from "@/lib/realtime-bus";
import {
  BkkRiderZone,
  buildHistoricalDispatchAffinityProfile,
  calculateEstimatedDistanceKm,
  CandidateRiderForAutoAssign,
  classifyBkkTaskZone,
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
  balanceCommission?: boolean;
  ignoreBranchRouting?: boolean;
  useHistoricalPatterns?: boolean;
}

const DEFAULT_SERVER_SIM_SETTINGS: ServerSimSettings = {
  maxRadiusKm: 6,
  maxActiveStops: 10,
  maxDailyJobs: 40,
  shiftEndHour: null,
  respectStrictTimeWindows: true,
  ignoreNonMeetupTimeWindows: false,
  disableWorkloadBalance: true,
  balanceCommission: false,
  ignoreBranchRouting: false,
  useHistoricalPatterns: true,
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
  riderZoneOverrides?: Record<string, BkkRiderZone>;
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
      const candidateTaskById = new Map<string, SerializedServerSimTask>();
      for (const ct of candidateTodayTasks) candidateTaskById.set(ct.taskId, ct);

      for (const t of state.simTasks) {
        const realJob = jobMap.get(t.jobId);
        if (!realJob) continue;
        const freshTask = candidateTaskById.get(t.taskId);
        const latestSchedRaw =
          t.legType === "delivery"
            ? realJob.deliveryScheduledAt || realJob.scheduledAt
            : realJob.pickupScheduledAt || realJob.scheduledAt;
        const latestSchedDate = latestSchedRaw ? new Date(latestSchedRaw) : null;
        const latestSchedIso =
          freshTask?.scheduledAtIso ||
          (latestSchedDate && !isNaN(latestSchedDate.getTime())
            ? latestSchedDate.toISOString()
            : t.scheduledAtIso);
        if (t.scheduledAtIso !== latestSchedIso) {
          t.scheduledAtIso = latestSchedIso;
          changed = true;
        }
        if (freshTask?.serviceSpeed && t.serviceSpeed !== freshTask.serviceSpeed) {
          t.serviceSpeed = freshTask.serviceSpeed;
          changed = true;
        }
        if (freshTask?.handoverMode && t.handoverMode !== freshTask.handoverMode) {
          t.handoverMode = freshTask.handoverMode;
          changed = true;
        }
        if (freshTask?.laundryBranchId && t.laundryBranchId !== freshTask.laundryBranchId) {
          t.laundryBranchId = freshTask.laundryBranchId;
          changed = true;
        }
        if (freshTask?.targetLocation && t.targetLocation !== freshTask.targetLocation) {
          t.targetLocation = freshTask.targetLocation;
          changed = true;
        }

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
        } else {
          const livePickupReady =
            ["accepted", "pickup"].includes(realJob.status) ||
            isRealLegCompleted(realJob, "pickup");
          if (Boolean(t.isReady) !== livePickupReady) {
            t.isReady = livePickupReady;
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
            const nn = ((r as any).nickname || r.name || "").toLowerCase();
            const defaultBranch =
              nn === "jub" || nn.startsWith("jub ") || nn === "toei" || nn.startsWith("toei ")
                ? "SHOP-MOGWZ0X0"
                : (r as any).branchId || "shop-head";
            const homeBranchId =
              state.riderBranchOverrides?.[r.id] || defaultBranch;
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
              assignedBkkZone: state.riderZoneOverrides?.[r.id] || "AUTO",
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

        // Wave 5: Pre-stage Not Ready / Blocked unassigned tasks at the bottom of the best matching rider's route
        const blockedUnassigned = hydratedForOpt.filter(
          (t) => !assignments[t.taskId] && !t.isCompleted && !(t.legType === "delivery" ? t.isReady && t.isCsoPaid : t.isReady)
        );
        for (const bTask of blockedUnassigned) {
          const cands = buildCandidates();
          const isManDedicated = isDedicatedCorporateManTask(bTask);
          const jobBranch = shops.find((s) => s.id === bTask.branchId);
          const jobAreaUpper = (jobBranch?.area || "").toUpperCase();

          let bestCand: CandidateRiderForAutoAssign<any> | null = null;
          let bestStagingScore = Infinity;
          let bestDistKm = 0;

          for (const cand of cands) {
            if (isManDedicated && !manIds.includes(cand.riderId)) continue;
            if ((state.rejectedRiderIdsByTask?.[bTask.taskId] || []).includes(cand.riderId)) continue;
            const dayCount = cand.totalDayCount ?? 0;
            if (dayCount >= state.settings.maxDailyJobs) continue;
            if (jobAreaUpper && cand.area && cand.area.toUpperCase() !== jobAreaUpper) continue;

            const distOrigin = calculateEstimatedDistanceKm(cand.origin, bTask.targetCoords);
            let minStopDist = distOrigin;
            let sameLaundryBranchCount = 0;
            for (const st of cand.currentTasks || []) {
              if (st.laundryBranchId === bTask.laundryBranchId) sameLaundryBranchCount++;
              const d = calculateEstimatedDistanceKm(st.targetCoords, bTask.targetCoords);
              if (d < minStopDist) minStopDist = d;
            }

            const bTaskZone = classifyBkkTaskZone(bTask);
            const candAssignedZone = cand.assignedBkkZone || "AUTO";
            const bkkZoneBonus =
              bTaskZone && candAssignedZone === bTaskZone
                ? -6.5
                : bTaskZone && candAssignedZone !== "AUTO" && candAssignedZone !== bTaskZone
                  ? 9.0
                  : 0;

            let stagingScore =
              minStopDist * 0.4 +
              bkkZoneBonus +
              dayCount * (state.settings.disableWorkloadBalance ? 0.05 : 0.65);
            if (dayCount === 0) stagingScore -= 8.0;
            if (!state.settings.ignoreBranchRouting) {
              if (cand.homeBranchId === bTask.laundryBranchId) stagingScore -= 3.5;
              else if (sameLaundryBranchCount > 0) stagingScore -= 2.0;
            }

            if (stagingScore < bestStagingScore) {
              bestStagingScore = stagingScore;
              bestCand = cand;
              bestDistKm = Math.round(minStopDist * 10) / 10;
            }
          }

          if (bestCand) {
            const laundryBranchObj = shops.find((s) => s.id === bTask.laundryBranchId);
            assignments[bTask.taskId] = {
              taskId: bTask.taskId,
              jobId: bTask.jobId,
              legType: bTask.legType,
              simRiderId: bestCand.riderId,
              assignedAt: now.toISOString(),
              reason: `⏳ Pre-staged @ ${laundryBranchObj?.name || bTask.laundryBranchId} (รอ Ready / CSO Paid • โซนห่าง ${bestDistKm} km)`,
              detourKm: 0,
              distFromRiderKm: bestDistKm,
              insertedStopNumber: (bestCand.totalDayCount ?? 0) + 1,
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
