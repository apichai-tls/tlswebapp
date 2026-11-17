"use client";

import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  Clock,
  Equal,
  ExternalLink,
  FlaskConical,
  Hourglass,
  MapPin,
  Navigation,
  Route,
  Sparkles,
  Truck,
  UserCheck,
  Zap,
} from "lucide-react";
import type { Job, LatLng, Rider, ShopLocation } from "@/lib/store";
import {
  optimizeRiderRoute,
  optimizeSmartRiderRoute,
  simulateRouteExecution,
  getTaskExpressPriorityTier,
  type SimulatedRouteEvaluation,
  type SimulatedStopDetail,
} from "@/lib/route-optimizer";

export interface CompareBoardTaskItem {
  taskId: string;
  job: Job;
  legType: "pickup" | "delivery";
  riderId: string | null;
  scheduledAt: Date;
  targetLocation: string;
  targetCoords?: LatLng | null;
  expressInfo?: {
    isExpress: boolean;
    label: string;
    is100: boolean;
  } | null;
}

interface RiderCompareInput {
  rider: Rider;
  rawTasks: CompareBoardTaskItem[];
}

interface AdminDispatchRouteCompareProps {
  riderColumns: RiderCompareInput[];
  shopLocations: ShopLocation[];
  getRiderOriginCoords: (rider: Rider) => LatLng;
  isTaskReadyForRouteOptimization: (task: any) => boolean;
  onOpenJobDetail?: (job: Job) => void;
  boardDateScope: "today" | "all_active";
  onChangeBoardDateScope: (scope: "today" | "all_active") => void;
  todayTaskCount: number;
  allActiveTaskCount: number;
}

const PK_DEFAULT_COORDS: LatLng = { lat: 13.7336, lng: 100.6208 }; // Phattanakarn Factory zone
const SOI15_DEFAULT_COORDS: LatLng = { lat: 13.7418, lng: 100.5583 }; // Sukhumvit Soi 15 zone

function formatMinsCompact(mins: number): string {
  const abs = Math.abs(Math.round(mins));
  if (abs < 60) return `${abs}m (${abs} นาที)`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m > 0 ? `${h}h ${m}m (${h} ชม. ${m} น.)` : `${h}h (${h} ชม.)`;
}

function formatTotalDuration(mins: number): string {
  const rounded = Math.max(0, Math.round(mins));
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildDemoCompareData(
  baseDate: Date,
  shopLocations: ShopLocation[]
): {
  rider: Rider;
  rawTasks: CompareBoardTaskItem[];
  branches: Array<{ id: string; name: string; coords: LatLng }>;
} {
  const pkBranch =
    shopLocations.find(
      (s) =>
        s.id === "SHOP-MOGWZ0X0" ||
        s.name.toLowerCase().includes("phattanakarn") ||
        s.name.toLowerCase().includes("pk")
    ) || null;
  const soi15Branch =
    shopLocations.find(
      (s) =>
        s.id === "shop-head" ||
        s.name.toLowerCase().includes("soi 15") ||
        s.name.toLowerCase().includes("sukhumvit")
    ) || null;

  const pkCoords: LatLng =
    pkBranch?.coords?.lat && pkBranch?.coords?.lng ? pkBranch.coords : PK_DEFAULT_COORDS;
  const s15Coords: LatLng =
    soi15Branch?.coords?.lat && soi15Branch?.coords?.lng ? soi15Branch.coords : SOI15_DEFAULT_COORDS;

  const pkId = pkBranch?.id || "SHOP-MOGWZ0X0";
  const s15Id = soi15Branch?.id || "shop-head";

  const branches = [
    { id: pkId, name: pkBranch?.name || "PK Factory (Phattanakarn)", coords: pkCoords },
    { id: s15Id, name: soi15Branch?.name || "Sukhumvit Soi 15", coords: s15Coords },
  ];

  const atTime = (hh: number, mm: number) => {
    const d = new Date(baseDate);
    d.setHours(hh, mm, 0, 0);
    return d;
  };

  const makeMockJob = (
    id: string,
    customerName: string,
    status: Job["status"],
    subStatus: Job["subStatus"],
    remark: string,
    processingBranchId: string,
    location: string,
    coords: LatLng,
    pickupSched: Date,
    deliverySched: Date
  ): Job =>
    ({
      id,
      customerName,
      customerPhone: "081-000-0000",
      type: "full_service",
      serviceType: "wash_fold",
      status,
      subStatus,
      remark,
      branchId: processingBranchId,
      pickupLocation: location,
      dropoffLocation: location,
      pickupCoords: coords,
      dropoffCoords: coords,
      scheduledAt: pickupSched,
      pickupScheduledAt: pickupSched,
      deliveryScheduledAt: deliverySched,
      createdAt: baseDate,
      items: [],
      totalAmount: 500,
      adminNotesJson: JSON.stringify({ processingBranchId }),
    }) as unknown as Job;

  const demoRider: Rider = {
    id: "demo-rider-pk",
    name: "Demo Rider (Start @ PK Factory / เริ่มที่โรงงาน PK)",
    nickname: "Demo-PK",
    phone: "080-000-0000",
    status: "online",
    branchId: pkId,
    currentLocation: pkCoords,
    completedJobs: 0,
  } as Rider;

  const rawTasks: CompareBoardTaskItem[] = [
    // 1) Delivery: Ready + Lobby on route out of PK (scheduled 16:00, but since Ready + Lobby, drops off right away at #1 in the morning!)
    {
      taskId: "DEMO-101-delivery",
      legType: "delivery",
      riderId: demoRider.id,
      scheduledAt: atTime(16, 0),
      targetLocation: "Phatthanakan 10 / Khlong Tan (Ready @ PK • Lobby Drop-off / แวะส่งก่อนเวลานัด 16:00 ได้ตั้งแต่เช้า)",
      targetCoords: { lat: 13.7385, lng: 100.6015 },
      job: makeMockJob(
        "DEMO-101",
        "Khun Pim (Lobby Drop-off • Ready @ PK / ส่ง Lobby)",
        "delivery",
        "ready",
        "Delivery: Leave at Lobby",
        pkId,
        "Condo Phatthanakan 10",
        { lat: 13.7385, lng: 100.6015 },
        atTime(9, 0),
        atTime(16, 0)
      ),
    },
    // 2) Delivery: Ready + Meet up near PK (scheduled 15:00 — MUST wait for 15:00 because Meet up!)
    {
      taskId: "DEMO-102-delivery",
      legType: "delivery",
      riderId: demoRider.id,
      scheduledAt: atTime(15, 0),
      targetLocation: "Phatthanakan 44 (Ready @ PK • Meet-up scheduled 15:00 / ส่งตรงเวลา 15:00)",
      targetCoords: { lat: 13.7278, lng: 100.6382 },
      job: makeMockJob(
        "DEMO-102",
        "Khun Karn (Meet-up 15:00 / ส่ง Meet up)",
        "delivery",
        "ready",
        "Delivery: Meet up",
        pkId,
        "Phatthanakan 44 Village",
        { lat: 13.7278, lng: 100.6382 },
        atTime(9, 0),
        atTime(15, 0)
      ),
    },
    // 3) Pickup: Leave at Lobby near PK (scheduled 15:30 — EVEN THOUGH LOBBY, it's Pickup so must be on time at 15:30!)
    {
      taskId: "DEMO-103-pickup",
      legType: "pickup",
      riderId: demoRider.id,
      scheduledAt: atTime(15, 30),
      targetLocation: "Phatthanakan 20 (Pickup Lobby scheduled 15:30 / รับที่ Lobby แต่นัด 15:30 ต้องรอตรงเวลา)",
      targetCoords: { lat: 13.7302, lng: 100.6085 },
      job: makeMockJob(
        "DEMO-103",
        "Khun May (Pickup Lobby 15:30 / ขารับ Lobby)",
        "pickup",
        undefined,
        "Pickup: Leave at Lobby",
        pkId,
        "Condo Phatthanakan 20",
        { lat: 13.7302, lng: 100.6085 },
        atTime(15, 30),
        atTime(19, 0)
      ),
    },
    // 4) Pickup: Morning Meet up at Rama 9 (scheduled 10:15 — must arrive on time in the morning!)
    {
      taskId: "DEMO-104-pickup",
      legType: "pickup",
      riderId: demoRider.id,
      scheduledAt: atTime(10, 15),
      targetLocation: "Belle Grand Rama 9 (Pickup Meet-up 10:15 AM / ขารับเช้า 10:15)",
      targetCoords: { lat: 13.7582, lng: 100.5688 },
      job: makeMockJob(
        "DEMO-104",
        "Khun Non (Morning Pickup / ขารับเช้า 10:15)",
        "pickup",
        undefined,
        "Pickup: Meet up",
        pkId,
        "Belle Grand Rama 9",
        { lat: 13.7582, lng: 100.5688 },
        atTime(10, 15),
        atTime(18, 0)
      ),
    },
    // 5) Delivery: Ready at Soi 15 + Meet up at Asoke (scheduled 13:30)
    {
      taskId: "DEMO-105-delivery",
      legType: "delivery",
      riderId: demoRider.id,
      scheduledAt: atTime(13, 30),
      targetLocation: "Ashton Asoke (Ready @ Soi 15 • Meet-up 13:30 / ผ้า Ready อยู่ที่ ซอย 15)",
      targetCoords: { lat: 13.7382, lng: 100.5609 },
      job: makeMockJob(
        "DEMO-105",
        "Mr. Alex (Delivery Meet-up / ส่ง Meet up)",
        "delivery",
        "ready",
        "Delivery: Meet up",
        s15Id,
        "Ashton Asoke Sukhumvit 21",
        { lat: 13.7382, lng: 100.5609 },
        atTime(10, 0),
        atTime(13, 30)
      ),
    },
    // 6) Pickup: Same Condo Ashton Asoke (scheduled 13:45 Lobby)
    {
      taskId: "DEMO-106-pickup",
      legType: "pickup",
      riderId: demoRider.id,
      scheduledAt: atTime(13, 45),
      targetLocation: "Ashton Asoke (Same condo as Mr. Alex • Pickup Lobby 13:45 / ตึกเดียวกัน)",
      targetCoords: { lat: 13.7383, lng: 100.561 },
      job: makeMockJob(
        "DEMO-106",
        "Khun Praew (Pickup Lobby 13:45 / ขารับ Lobby)",
        "pickup",
        undefined,
        "Pickup: Leave at Lobby",
        s15Id,
        "Ashton Asoke Sukhumvit 21",
        { lat: 13.7383, lng: 100.561 },
        atTime(13, 45),
        atTime(18, 0)
      ),
    },
    // 7) Delivery: NOT READY YET (`subStatus: "wash"`) even though Lobby & near PK!
    {
      taskId: "DEMO-107-delivery",
      legType: "delivery",
      riderId: demoRider.id,
      scheduledAt: atTime(14, 0),
      targetLocation: "On Nut 17 (Lobby but Not Ready yet / subStatus=wash ยังไม่ Ready)",
      targetCoords: { lat: 13.7165, lng: 100.6152 },
      job: makeMockJob(
        "DEMO-107",
        "Khun Ton (Not Ready yet / ผ้ายังไม่ Ready)",
        "delivery",
        "wash",
        "Delivery: Leave at Lobby",
        pkId,
        "Condo On Nut 17",
        { lat: 13.7165, lng: 100.6152 },
        atTime(9, 0),
        atTime(14, 0)
      ),
    },
  ];

  return { rider: demoRider, rawTasks, branches };
}

function StopComparisonCard({
  stop,
  mode,
  counterpartStopNumber,
  isDemo,
  onOpenJobDetail,
}: {
  stop: SimulatedStopDetail<CompareBoardTaskItem>;
  mode: "legacy" | "smart";
  counterpartStopNumber?: number;
  isDemo: boolean;
  onOpenJobDetail?: (job: Job) => void;
}) {
  const task = stop.task;
  const isPickup = task.legType === "pickup";
  const exp = task.expressInfo;
  const isDeferredNotReady = mode === "smart" && !stop.isLaundryReady;

  const rankDelta =
    mode === "smart" && typeof counterpartStopNumber === "number"
      ? counterpartStopNumber - stop.stopNumber
      : 0;

  return (
    <div className="space-y-1.5">
      {/* Branch Hub Visit Banner when this stop requires picking up bags at a branch first */}
      {stop.viaBranch && (
        <div
          className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold ${
            mode === "smart"
              ? "bg-teal-50/90 border-teal-300 text-teal-900"
              : "bg-amber-50/90 border-amber-300 text-amber-900"
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2
              size={13}
              className={mode === "smart" ? "text-teal-600 shrink-0" : "text-amber-600 shrink-0"}
            />
            <span className="truncate">
              {mode === "smart"
                ? `Stop @ ${stop.viaBranch.shortName} Branch: Pick up ${stop.viaBranch.loadedTaskCount} ready orders (แวะรับผ้า Ready ที่สาขา ${stop.viaBranch.shortName})`
                : `Must pick up laundry at ${stop.viaBranch.shortName} Branch before delivery (ต้องแวะไปเอาผ้าที่สาขา ${stop.viaBranch.shortName} ก่อนส่ง)`}
            </span>
          </div>
          <span className="font-mono text-[10.5px] font-black shrink-0">
            {stop.viaBranch.distanceToBranchKm <= 0.3
              ? "At branch already (0 km / อยู่ที่สาขาแล้ว)"
              : `+${stop.viaBranch.distanceToBranchKm} km to branch (ไปสาขา)`}
          </span>
        </div>
      )}

      {/* Main Stop Card */}
      <div
        className={`rounded-xl border p-2.5 shadow-2xs transition-all ${
          isDeferredNotReady
            ? "bg-slate-100/80 border-dashed border-slate-300 opacity-80"
            : mode === "smart" && rankDelta !== 0
              ? "bg-white border-indigo-300 ring-1 ring-indigo-200/70"
              : "bg-white border-slate-200/90"
        } border-l-4 ${
          isDeferredNotReady
            ? "border-l-slate-400"
            : isPickup
              ? "border-l-amber-500"
              : "border-l-indigo-600"
        }`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              className={`w-5.5 h-5.5 rounded-full text-[10.5px] font-black flex items-center justify-center text-white shrink-0 ${
                isDeferredNotReady
                  ? "bg-slate-400"
                  : isPickup
                    ? "bg-amber-500"
                    : "bg-indigo-600"
              }`}
            >
              {isDeferredNotReady ? "⏳" : stop.stopNumber}
            </span>

            <span
              className={`px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase ${
                isPickup
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-indigo-50 text-indigo-800 border border-indigo-200"
              }`}
            >
              {isPickup ? "Pickup" : "Delivery"}
            </span>

            {/* Handover Mode Badge (Lobby vs Meet up) */}
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-extrabold border ${
                stop.handoverMode === "lobby"
                  ? isPickup
                    ? "bg-orange-50 text-orange-800 border-orange-200"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-sky-50 text-sky-800 border-sky-200"
              }`}
            >
              {stop.handoverMode === "lobby" ? (
                <>
                  <Building2 size={9} />
                  <span>{isPickup ? "Pickup: Lobby (On-Time / ต้องตรงเวลา)" : "Delivery: Lobby (ส่ง Lobby)"}</span>
                </>
              ) : (
                <>
                  <UserCheck size={9} />
                  <span>Meet-up (On-Time / ตรงเวลา)</span>
                </>
              )}
            </span>

            {/* Delivery Ready Status + Branch Location */}
            {!isPickup && (
              <>
                {stop.isLaundryReady ? (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold border ${
                      stop.laundryStateAtStart === "on_vehicle"
                        ? "bg-teal-50 text-teal-800 border-teal-200"
                        : "bg-purple-50 text-purple-800 border-purple-200"
                    }`}
                  >
                    {stop.laundryStateAtStart === "on_vehicle"
                      ? "✓ Ready • On Vehicle (บนรถแล้ว)"
                      : `✓ Ready @ ${stop.sourceBranchShortName || "Branch"} (สาขา)`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                    <Hourglass size={9} />
                    <span>Not Ready: {task.job.subStatus || "wash"} (ยังไม่ Ready)</span>
                  </span>
                )}
              </>
            )}

            {exp?.isExpress && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black text-white ${
                  exp.is100 ? "bg-rose-600" : "bg-orange-500"
                }`}
              >
                <Zap size={9} className="fill-white" />
                {exp.label}
              </span>
            )}

            {/* Rank Change Indicator on Smart Side */}
            {mode === "smart" && !isDeferredNotReady && typeof counterpartStopNumber === "number" && (
              <>
                {rankDelta > 0 ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <ArrowUp size={10} />
                    Up from #{counterpartStopNumber} (ขยับขึ้น)
                  </span>
                ) : rankDelta < 0 ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                    <ArrowDown size={10} />
                    Down from #{counterpartStopNumber} (เลื่อนลง)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold bg-slate-100 text-slate-500">
                    <Equal size={9} />
                    Same rank (ลำดับเดิม)
                  </span>
                )}
              </>
            )}
          </div>

          {!isDeferredNotReady && (
            <span className="font-mono text-[10.5px] font-black text-slate-600 shrink-0">
              +{stop.realDistanceFromPrevKm} km
              {stop.viaBranch && stop.realDistanceFromPrevKm !== stop.directDistanceFromPrevKm && (
                <span className="text-[9.5px] font-normal text-slate-400 ml-1">
                  (direct {stop.directDistanceFromPrevKm} km / ตรง)
                </span>
              )}
            </span>
          )}
        </div>

        {/* Customer & Address */}
        <div
          onClick={() => {
            if (!isDemo && onOpenJobDetail) onOpenJobDetail(task.job);
          }}
          className={`mt-1.5 ${!isDemo && onOpenJobDetail ? "cursor-pointer group" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-900 group-hover:text-indigo-600 truncate">
              {task.job.customerName || "Guest"}
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
              #{task.job.id}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 truncate mt-0.5">{task.targetLocation}</div>
        </div>

        {/* Time SLA & Reason Footer */}
        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          {stop.slaStatus === "not_ready" ? (
            <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold text-rose-700">
              <Hourglass size={11} />
              {mode === "legacy" ? (
                <span>⚠️ Legacy Logic routes order even though laundry is Not Ready! (Logic เดิมดึงมาจัดสายทั้งที่ผ้ายังไม่ Ready!)</span>
              ) : (
                <span>Deferred to end — Awaiting staff to mark Ready before departure (Sched {format(stop.scheduledAt, "HH:mm")}) / พักไว้ท้ายสาย — รอพนักงานกด Ready ก่อนออกจัดส่ง</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold flex-wrap">
              <span className="inline-flex items-center gap-1 text-slate-700">
                <Clock size={11} className="text-slate-400" />
                Sched {format(stop.scheduledAt, "HH:mm")} (นัด)
              </span>
              <span className="text-slate-300">➔</span>
              <span className="text-slate-800">ETA ~{format(stop.estimatedArrivalAt, "HH:mm")} (ถึง)</span>

              {stop.slaStatus === "late" ? (
                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                  Late +{formatMinsCompact(stop.minutesDiffFromSchedule)} (ช้า)
                </span>
              ) : stop.slaStatus === "early_ok" ? (
                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-teal-100 text-teal-900 border border-teal-300">
                  ✓ Early Lobby Drop-off OK ({formatMinsCompact(stop.minutesDiffFromSchedule)}) / ส่งฝาก Lobby ก่อนเวลาได้
                </span>
              ) : stop.slaStatus === "too_early" ? (
                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  ⚠️ Too Early: {formatMinsCompact(stop.minutesDiffFromSchedule)} (ไปก่อนนัด: {isPickup ? "Customer bag not ready / ลูกค้ายังไม่วางผ้า" : "Meet-up"})
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ On Time (ตรงเวลานัด)
                </span>
              )}
            </div>
          )}

          {mode === "smart" && stop.reasonTag && (
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100">
              {stop.reasonTag}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminDispatchRouteCompare({
  riderColumns,
  shopLocations,
  getRiderOriginCoords,
  isTaskReadyForRouteOptimization,
  onOpenJobDetail,
  boardDateScope,
  onChangeBoardDateScope,
  todayTaskCount,
  allActiveTaskCount,
}: AdminDispatchRouteCompareProps) {
  const realRidersWithReadyTasks = useMemo(() => {
    return riderColumns
      .map((col) => ({
        rider: col.rider,
        readyTasks: col.rawTasks.filter(isTaskReadyForRouteOptimization),
      }))
      .filter((col) => col.readyTasks.length > 0);
  }, [riderColumns, isTaskReadyForRouteOptimization]);

  const [dataSourceMode, setDataSourceMode] = useState<"real" | "demo">("real");
  const effectiveSourceMode =
    dataSourceMode === "demo" || realRidersWithReadyTasks.length === 0 ? "demo" : "real";
  const isUserForcedRealEmpty = dataSourceMode === "real" && realRidersWithReadyTasks.length === 0;

  const [timePreset, setTimePreset] = useState<"now" | "09:00" | "13:00">("09:00");
  const [originPreset, setOriginPreset] = useState<"actual" | "pk" | "soi15">("actual");
  const [focusedRiderId, setFocusedRiderId] = useState<string>("ALL");

  const referenceTime = useMemo(() => {
    const now = new Date();
    if (effectiveSourceMode === "demo" && timePreset === "now") {
      const d = new Date(now);
      d.setHours(9, 30, 0, 0);
      return d;
    }
    if (timePreset === "09:00") {
      const d = new Date(now);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    if (timePreset === "13:00") {
      const d = new Date(now);
      d.setHours(13, 0, 0, 0);
      return d;
    }
    return now;
  }, [timePreset, effectiveSourceMode]);

  const pkCoords = useMemo<LatLng>(() => {
    const pk = shopLocations.find(
      (s) =>
        s.id === "SHOP-MOGWZ0X0" ||
        s.name.toLowerCase().includes("phattanakarn") ||
        s.name.toLowerCase().includes("pk")
    );
    return pk?.coords?.lat && pk?.coords?.lng ? pk.coords : PK_DEFAULT_COORDS;
  }, [shopLocations]);

  const soi15Coords = useMemo<LatLng>(() => {
    const s15 = shopLocations.find(
      (s) =>
        s.id === "shop-head" ||
        s.name.toLowerCase().includes("soi 15") ||
        s.name.toLowerCase().includes("sukhumvit")
    );
    return s15?.coords?.lat && s15?.coords?.lng ? s15.coords : SOI15_DEFAULT_COORDS;
  }, [shopLocations]);

  const comparisons = useMemo(() => {
    const demoBundle = buildDemoCompareData(new Date(), shopLocations);

    const activeList =
      effectiveSourceMode === "demo"
        ? [{ rider: demoBundle.rider, readyTasks: demoBundle.rawTasks }]
        : realRidersWithReadyTasks;

    const branchInfos =
      effectiveSourceMode === "demo"
        ? demoBundle.branches
        : shopLocations.map((s) => ({
            id: s.id,
            name: s.name,
            coords: s.coords,
            area: s.area,
          }));

    return activeList.map(({ rider, readyTasks }) => {
      const baseOrigin =
        effectiveSourceMode === "demo" ? demoBundle.rider.currentLocation! : getRiderOriginCoords(rider);
      const origin: LatLng =
        originPreset === "pk"
          ? pkCoords
          : originPreset === "soi15"
            ? soi15Coords
            : baseOrigin;

      const originLabel =
        originPreset === "pk"
          ? "Simulated Start @ PK Factory (Phattanakarn) / จำลองเริ่มที่สาขา PK"
          : originPreset === "soi15"
            ? "Simulated Start @ Sukhumvit Soi 15 / จำลองเริ่มที่สาขา สุขุมวิท ซอย 15"
            : effectiveSourceMode === "demo"
              ? "PK Factory (Phattanakarn) / โรงงาน PK"
              : rider.currentLocation?.lat
                ? "Rider Live GPS / พิกัด GPS ปัจจุบันของไรเดอร์"
                : "Rider Assigned Branch / พิกัดสาขาประจำของไรเดอร์";

      // 1) Legacy Auto Route (exact logic used in Rider Route Board today — ignores Ready subStatus if status=delivery, ignores Lobby/Meetup & Time)
      const sortedForLegacy = [...readyTasks].sort((a, b) => {
        const tierDiff = getTaskExpressPriorityTier(b) - getTaskExpressPriorityTier(a);
        if (tierDiff !== 0) return tierDiff;
        return a.scheduledAt.getTime() - b.scheduledAt.getTime();
      });
      const legacyRaw = optimizeRiderRoute(origin, sortedForLegacy, origin);
      const legacyOrderedTasks = legacyRaw.orderedTasks.map((it) => it.task);
      const legacyEval: SimulatedRouteEvaluation<CompareBoardTaskItem> = simulateRouteExecution(
        origin,
        legacyOrderedTasks,
        {
          branches: branchInfos,
          referenceTime,
          fallbackOriginCoords: origin,
          respectStrictTimeWindows: false,
        }
      );

      // 2) New Smart Multi-Factor Route (Ready Check + Delivery Lobby Early-OK vs Meetup On-Time + Pickup Always On-Time + Branch Location)
      const smartEval: SimulatedRouteEvaluation<CompareBoardTaskItem> = optimizeSmartRiderRoute(
        origin,
        readyTasks,
        {
          branches: branchInfos,
          referenceTime,
          fallbackOriginCoords: origin,
          respectStrictTimeWindows: true,
        }
      );

      const legacyStopRankMap = new Map<string, number>();
      legacyEval.stops.forEach((st) => {
        legacyStopRankMap.set(st.task.taskId, st.stopNumber);
      });

      const changedCount = smartEval.stops.filter(
        (st) => legacyStopRankMap.get(st.task.taskId) !== st.stopNumber
      ).length;

      return {
        rider,
        origin,
        originLabel,
        tasksCount: readyTasks.length,
        legacyEval,
        smartEval,
        legacyStopRankMap,
        changedCount,
      };
    });
  }, [
    effectiveSourceMode,
    realRidersWithReadyTasks,
    shopLocations,
    getRiderOriginCoords,
    originPreset,
    pkCoords,
    soi15Coords,
    referenceTime,
  ]);

  const visibleComparisons = useMemo(() => {
    if (effectiveSourceMode === "demo" || focusedRiderId === "ALL") return comparisons;
    return comparisons.filter((c) => c.rider.id === focusedRiderId);
  }, [comparisons, focusedRiderId, effectiveSourceMode]);

  const summaryTotals = useMemo(() => {
    let legacyRealKm = 0;
    let smartRealKm = 0;
    let legacyLate = 0;
    let smartLate = 0;
    let legacyTooEarly = 0;
    let smartTooEarly = 0;
    let smartDeferredNotReady = 0;
    let changedStops = 0;

    for (const c of visibleComparisons) {
      legacyRealKm += c.legacyEval.totalRealDistanceKm;
      smartRealKm += c.smartEval.totalRealDistanceKm;
      legacyLate += c.legacyEval.lateStopsCount;
      smartLate += c.smartEval.lateStopsCount;
      legacyTooEarly += c.legacyEval.tooEarlyStopsCount;
      smartTooEarly += c.smartEval.tooEarlyStopsCount;
      smartDeferredNotReady += c.smartEval.notReadyStopsCount;
      changedStops += c.changedCount;
    }

    return {
      legacyRealKm: Math.round(legacyRealKm * 10) / 10,
      smartRealKm: Math.round(smartRealKm * 10) / 10,
      legacyLate,
      smartLate,
      legacyTooEarly,
      smartTooEarly,
      smartDeferredNotReady,
      changedStops,
    };
  }, [visibleComparisons]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      {/* Lab Control Strip */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FlaskConical size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-black text-slate-900">
                  Route Optimization Comparison: Legacy Logic vs Smart Route (Ready + Lobby/Meet-up + Branch + Time) / เปรียบเทียบ Auto Route: Logic เดิม vs Logic ใหม่
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  Local Preview Only (ทดสอบบน Local ยังไม่กระทบแอปไรเดอร์)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Delivery checks <b>Ready</b> first (<b>Lobby</b> can drop off early • <b>Meet-up</b> must be on time) • Pickup strictly <b>on-time</b> for all types (including Lobby) / ขาส่งเช็คผ้า Ready ก่อนเสมอ (ถ้า Lobby เข้าส่งก่อนเวลาได้ทันที • ถ้า Meet up ต้องตรงเวลา) • ขารับ ตรงเวลานัดทุกกรณี
              </p>
            </div>
          </div>

          {/* Data Source Switcher */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setDataSourceMode("real")}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                effectiveSourceMode === "real"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Truck size={13} />
              <span>Live DB Tasks ({realRidersWithReadyTasks.length} routes) / งานจริงในระบบ ({realRidersWithReadyTasks.length} สาย)</span>
            </button>
            <button
              type="button"
              onClick={() => setDataSourceMode("demo")}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                effectiveSourceMode === "demo"
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sparkles size={13} />
              <span>Demo Scenario (Lobby / Meet-up / Ready cases) / จำลองโจทย์ตัวอย่าง (ครบทุกเคส)</span>
            </button>
          </div>
        </div>

        {isUserForcedRealEmpty && (
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2 flex-wrap">
            <span>
              No active assigned rider tasks found in Local DB for <b>"{boardDateScope === "today" ? "Today" : "All Pending"}"</b>. Showing <b>Demo Scenario</b> for comparison. Switch to <b>All Pending ({allActiveTaskCount})</b> or assign tasks to riders in Rider Route tab. / ขณะนี้ใน Local DB ยังไม่มีงานที่ผูกไรเดอร์ในมุมมอง "{boardDateScope === "today" ? "Today" : "All Pending"}" ระบบจึงแสดงโจทย์จำลองตัวอย่างให้ดูเปรียบเทียบก่อน
            </span>
            {boardDateScope === "today" && allActiveTaskCount > 0 && (
              <button
                type="button"
                onClick={() => onChangeBoardDateScope("all_active")}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs cursor-pointer shrink-0"
              >
                Switch to All Pending ({allActiveTaskCount}) / สลับดู All Pending
              </button>
            )}
          </div>
        )}

        {/* Simulation Parameters Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {effectiveSourceMode === "real" && (
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => onChangeBoardDateScope("today")}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer ${
                    boardDateScope === "today"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Today ({todayTaskCount}) / วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => onChangeBoardDateScope("all_active")}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer ${
                    boardDateScope === "all_active"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All Pending ({allActiveTaskCount}) / ค้างทั้งหมด
                </button>
              </div>
            )}

            {/* Origin Override */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <MapPin size={13} className="text-indigo-600" />
              <span className="text-[11px] font-bold text-slate-600">Start Point (จุดเริ่มไรเดอร์):</span>
              {(
                [
                  { id: "actual", label: "Live GPS (พิกัดจริง)" },
                  { id: "pk", label: "Start @ PK (เริ่มที่ PK)" },
                  { id: "soi15", label: "Start @ Soi 15 (เริ่มที่ ซอย 15)" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOriginPreset(opt.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-extrabold cursor-pointer transition-all ${
                    originPreset === opt.id
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Start Clock Preset */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <Clock size={13} className="text-emerald-600" />
              <span className="text-[11px] font-bold text-slate-600">Start Time (เวลาเริ่มออกวิ่ง):</span>
              {(
                [
                  { id: "09:00", label: "09:00 AM (เช้า)" },
                  { id: "13:00", label: "01:00 PM (บ่าย)" },
                  { id: "now", label: `Current Time: ${format(new Date(), "HH:mm")} (ตอนนี้)` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTimePreset(opt.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-extrabold cursor-pointer transition-all ${
                    timePreset === opt.id
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {effectiveSourceMode === "real" && comparisons.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Filter Rider (เลือกไรเดอร์):</span>
              <select
                value={focusedRiderId}
                onChange={(e) => setFocusedRiderId(e.target.value)}
                className="text-xs font-bold border border-slate-200 rounded-lg px-2.5 py-1 bg-white text-slate-800 cursor-pointer"
              >
                <option value="ALL">All Active Riders ({comparisons.length}) / ทุกคนที่มีงาน ({comparisons.length} คน)</option>
                {comparisons.map((c) => (
                  <option key={c.rider.id} value={c.rider.id}>
                    {c.rider.nickname || c.rider.name} ({c.tasksCount} stops/จุด)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* High-Level KPI Delta Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500">
              Real Travel Distance (with branch pickup) / ระยะวิ่งจริง (รวมแวะรับผ้าที่สาขา)
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-xs font-bold text-slate-400 line-through">
                Legacy {summaryTotals.legacyRealKm} km (เดิม)
              </span>
              <span className="text-sm font-black text-indigo-700">
                Smart {summaryTotals.smartRealKm} km (ใหม่)
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500">Late Arrival Risk (&gt;15m) / งานเสี่ยงไปสาย (&gt;15 นาที)</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-xs font-bold text-slate-500">Legacy {summaryTotals.legacyLate} (เดิม)</span>
              <span className="text-slate-300">➔</span>
              <span
                className={`text-sm font-black ${
                  summaryTotals.smartLate <= summaryTotals.legacyLate
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                Smart {summaryTotals.smartLate} (ใหม่)
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold text-slate-500">
              Arriving Too Early (Pickup / Meet-up) / ไปเก้อก่อนเวลานัด
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-xs font-bold text-slate-500">
                Legacy {summaryTotals.legacyTooEarly} (เดิม)
              </span>
              <span className="text-slate-300">➔</span>
              <span
                className={`text-sm font-black ${
                  summaryTotals.smartTooEarly <= summaryTotals.legacyTooEarly
                    ? "text-emerald-700"
                    : "text-amber-700"
                }`}
              >
                Smart {summaryTotals.smartTooEarly} (ใหม่)
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
            <div className="text-[11px] font-bold text-indigo-700">
              Sequence Changes / Not Ready / จุดเปลี่ยนลำดับ • กั้นผ้ายังไม่ Ready
            </div>
            <div className="mt-0.5 text-sm font-black text-indigo-950">
              Changed {summaryTotals.changedStops} stops (เปลี่ยน {summaryTotals.changedStops} จุด)
              {summaryTotals.smartDeferredNotReady > 0
                ? ` • Deferred Not Ready: ${summaryTotals.smartDeferredNotReady} (พักยังไม่ Ready ${summaryTotals.smartDeferredNotReady} งาน)`
                : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Comparison Cards per Rider */}
      {visibleComparisons.map((comp) => (
        <div
          key={comp.rider.id}
          className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
        >
          <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white font-black text-xs flex items-center justify-center">
                {(comp.rider.nickname || comp.rider.name).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-black flex items-center gap-2 flex-wrap">
                  <span>{comp.rider.nickname || comp.rider.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/15">
                    {comp.tasksCount} stops (จุดแวะ)
                  </span>
                  {comp.changedCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
                      Sequence differs by {comp.changedCount} stops (ลำดับต่างกัน {comp.changedCount} จุด)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                      Identical sequence (ลำดับตรงกัน)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-300 flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>📍 Start Point (จุดเริ่มต้น): {comp.originLabel}</span>
                  <span>•</span>
                  <span>🕒 Simulated Start Time (เริ่มคำนวณเวลา): {format(referenceTime, "HH:mm")}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* LEFT COLUMN: LEGACY AUTO ROUTE */}
            <div className="p-3.5 bg-slate-50/60 flex flex-col gap-3">
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Route size={14} className="text-slate-500" />
                      <span>Legacy Logic (Current Auto Route) / Logic เดิม</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      No Lobby vs Meet-up distinction • Afternoon pickups pulled to morning if close • Laundry branch location not tracked / ไม่แยก Lobby vs Meet-up • ดึงงานรับช่วงเย็นมาวิ่งเช้าหากอยู่ใกล้ • ไม่เช็คสาขาที่ผ้าอยู่
                    </p>
                  </div>
                  {comp.legacyEval.googleMapsUrl && (
                    <a
                      href={comp.legacyEval.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[10.5px] font-extrabold shrink-0"
                    >
                      <Navigation size={11} />
                      <span>Legacy Map (Map เดิม)</span>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-slate-100 text-slate-800 border border-slate-200">
                    Real Distance (with branch pickup): {comp.legacyEval.totalRealDistanceKm} km (ระยะวิ่งจริงรวมแวะสาขา)
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-slate-100 text-slate-700">
                    ~{formatTotalDuration(comp.legacyEval.estimatedTotalMinutes)}
                  </span>
                  {comp.legacyEval.lateStopsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                      Late: {comp.legacyEval.lateStopsCount} stops (สาย {comp.legacyEval.lateStopsCount} งาน)
                    </span>
                  )}
                  {comp.legacyEval.tooEarlyStopsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                      Arrive Too Early: {comp.legacyEval.tooEarlyStopsCount} stops (ไปเก้อก่อนเวลา: {comp.legacyEval.tooEarlyStopsCount} งาน)
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {comp.legacyEval.stops.map((stop) => (
                  <StopComparisonCard
                    key={`legacy-${stop.task.taskId}`}
                    stop={stop}
                    mode="legacy"
                    isDemo={effectiveSourceMode === "demo"}
                    onOpenJobDetail={onOpenJobDetail}
                  />
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN: NEW SMART ROUTE */}
            <div className="p-3.5 bg-indigo-50/25 flex flex-col gap-3">
              <div className="p-3 rounded-xl bg-white border border-indigo-200 ring-1 ring-indigo-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-600" />
                      <span>Smart Route (Ready + Lobby/Meet-up + Branch + Time) / Logic ใหม่</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Delivery Ready+Lobby can deliver early • Meet-up & all Pickups scheduled on-time • Multi-branch location tracked / ขาส่ง Ready+Lobby ส่งก่อนได้ทันที • ขาส่ง Meet up และขารับทุกแบบ (รวม Lobby) จัดเข้าตรงเวลานัด
                    </p>
                  </div>
                  {comp.smartEval.googleMapsUrl && (
                    <a
                      href={comp.smartEval.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-extrabold shrink-0"
                    >
                      <Navigation size={11} />
                      <span>Smart Map (Map ใหม่รวมแวะสาขา)</span>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-indigo-50 text-indigo-900 border border-indigo-200">
                    Real Distance (with branch pickup): {comp.smartEval.totalRealDistanceKm} km (ระยะวิ่งจริงรวมแวะสาขา)
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-indigo-50 text-indigo-800">
                    ~{formatTotalDuration(comp.smartEval.estimatedTotalMinutes)}
                  </span>
                  {comp.smartEval.lateStopsCount === 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={11} />
                      0 Late Stops (ไม่สายเลย)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertTriangle size={11} />
                      Late: {comp.smartEval.lateStopsCount} stops (สาย {comp.smartEval.lateStopsCount} งาน)
                    </span>
                  )}
                  {comp.smartEval.tooEarlyStopsCount === 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-teal-50 text-teal-800 border border-teal-200">
                      <CheckCircle2 size={11} />
                      0 Too-Early Stops (ไม่ไปเก้อก่อนนัด)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                      Arrive Too Early: {comp.smartEval.tooEarlyStopsCount} stops (ไปก่อนนัด: {comp.smartEval.tooEarlyStopsCount} งาน)
                    </span>
                  )}
                  {comp.smartEval.notReadyStopsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">
                      Deferred Not Ready: {comp.smartEval.notReadyStopsCount} tasks (กั้นงานยังไม่ Ready: {comp.smartEval.notReadyStopsCount} งาน)
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {comp.smartEval.stops.map((stop) => (
                  <StopComparisonCard
                    key={`smart-${stop.task.taskId}`}
                    stop={stop}
                    mode="smart"
                    counterpartStopNumber={comp.legacyStopRankMap.get(stop.task.taskId)}
                    isDemo={effectiveSourceMode === "demo"}
                    onOpenJobDetail={onOpenJobDetail}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
