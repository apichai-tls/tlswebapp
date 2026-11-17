"use client";

import React, { Suspense, useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import { useJobs } from "@/lib/use-jobs";
import { shopStore, settingsStore, type Job } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { formatJobDisplayId } from "@/lib/utils";
import { FitScreenToggle } from "@/components/fit-screen-toggle";
import {
  LaundryChecklistWorkspace,
  parseJobChecklist,
  getStageMeta,
  detectJobRequiresIroning,
  useChecklistStaffDirectory,
  claimAndStartChecklistOrder,
  getStageDepartmentKey,
  getDepartmentStageLabel,
  type ChecklistStage,
} from "@/components/admin-laundry-checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ClipboardCheck,
  Search,
  RefreshCw,
  LogOut,
  Camera,
  LayoutDashboard,
  ChevronRight,
  AlertTriangle,
  UserCheck,
  Play,
  Droplets,
  Shirt,
  PackageCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export type DedicatedDepartmentSlug = "checker" | "washing" | "ironing" | "delivery-prep";

const DEPARTMENT_PAGE_META: Record<
  DedicatedDepartmentSlug,
  {
    title: string;
    titleTh: string;
    subtitle: string;
    headerColor: string;
    badgeColor: string;
    defaultTab: "checker" | "washing" | "ironing" | "packing";
  }
> = {
  checker: {
    title: "1. Checker Department Page",
    titleTh: "แผนกตรวจนับผ้า (Checker Station)",
    subtitle: "Pour out laundry bags, count garments & treatments, or recheck returned loads.",
    headerColor: "bg-amber-600",
    badgeColor: "bg-amber-500/30 text-amber-100 border-amber-400/40",
    defaultTab: "checker",
  },
  washing: {
    title: "2. Washing Department Page",
    titleTh: "แผนกซักและอบผ้า (Washing Dept Station)",
    subtitle: "Counter-check Checker's item count, start washing, and pass to Ironing or back to Checker.",
    headerColor: "bg-blue-600",
    badgeColor: "bg-blue-500/30 text-blue-100 border-blue-400/40",
    defaultTab: "washing",
  },
  ironing: {
    title: "3. Ironing Department Page",
    titleTh: "แผนกรีดผ้า (Ironing Dept Station)",
    subtitle: "Counter-check items needing ironing/pressing, complete ironing, and return to Checker.",
    headerColor: "bg-violet-600",
    badgeColor: "bg-violet-500/30 text-violet-100 border-violet-400/40",
    defaultTab: "ironing",
  },
  "delivery-prep": {
    title: "4. Checker Delivery Prep Page",
    titleTh: "แผนกตรวจนับรวมก่อนส่ง (Checker Delivery Prep)",
    subtitle: "Consolidate finished items from all departments, verify final piece count, and prepare for Rider.",
    headerColor: "bg-teal-600",
    badgeColor: "bg-teal-500/30 text-teal-100 border-teal-400/40",
    defaultTab: "packing",
  },
};

export function ItemCheckDepartmentStation({
  fixedDepartment,
}: {
  fixedDepartment?: DedicatedDepartmentSlug;
}) {
  const { user, logout } = useAuth();
  const jobs = useJobs();
  const router = useRouter();
  const searchParams = useSearchParams();

  const shops = useSyncExternalStore(
    shopStore.subscribe,
    shopStore.getSnapshot,
    shopStore.getSnapshot
  );
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot
  );

  const fallbackActor = user?.name || user?.email?.split("@")[0] || "Staff";
  const { staffOptions, activeOperator, selectOperator } = useChecklistStaffDirectory(fallbackActor);

  const deptMeta = fixedDepartment ? DEPARTMENT_PAGE_META[fixedDepartment] : null;
  const baseRoute = fixedDepartment ? `/item-check/${fixedDepartment}` : "/item-check";

  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    () => searchParams.get("jobId") || null
  );
  const [selectedStageTab, setSelectedStageTab] = useState<
    "all" | "recheck" | "checker" | "washing" | "ironing" | "packing" | "ready"
  >(() => (deptMeta ? deptMeta.defaultTab : "all"));
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startingJobId, setStartingJobId] = useState<string | null>(null);

  // Remember preferred APK landing route when opened on a department tablet/phone
  useEffect(() => {
    try {
      localStorage.setItem("tls_apk_default_route", baseRoute);
    } catch {}
  }, [baseRoute]);

  useEffect(() => {
    if (deptMeta) {
      setSelectedStageTab(deptMeta.defaultTab);
    }
  }, [fixedDepartment]);

  useEffect(() => {
    const paramJobId = searchParams.get("jobId");
    if (paramJobId) {
      setSelectedJobId(paramJobId);
    }
  }, [searchParams]);

  const activeLaundryJobs = useMemo(() => {
    return jobs
      .filter((j) => {
        if (j.status === "cancel" || j.status === "return" || j.status === "topup") return false;
        return j.status === "billing" || j.status === "delivery" || j.status === "pickup";
      })
      .map((job) => {
        const checklist = parseJobChecklist(job, settings);
        const effectiveStage: ChecklistStage =
          checklist?.stage ||
          (job.subStatus === "ready"
            ? "ready_for_delivery"
            : job.subStatus === "iron"
            ? "ironing"
            : job.subStatus === "wash"
            ? "washing"
            : "checking");
        return { job, checklist, effectiveStage };
      });
  }, [jobs, settings]);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return (
      jobs.find(
        (j) =>
          j.id === selectedJobId ||
          (j.billNo && j.billNo.toLowerCase() === selectedJobId.toLowerCase())
      ) || null
    );
  }, [jobs, selectedJobId]);

  const counts = useMemo(() => {
    const c = { all: 0, recheck: 0, checker: 0, washing: 0, ironing: 0, packing: 0, ready: 0 };
    for (const row of activeLaundryJobs) {
      if (branchFilter !== "all" && row.job.branchId !== branchFilter) continue;
      c.all++;
      if (row.effectiveStage === "recheck_required") c.recheck++;
      else if (row.effectiveStage === "checking") c.checker++;
      else if (row.effectiveStage === "washing_verify" || row.effectiveStage === "washing") c.washing++;
      else if (row.effectiveStage === "ironing_verify" || row.effectiveStage === "ironing") c.ironing++;
      else if (row.effectiveStage === "packing_verify") c.packing++;
      else if (row.effectiveStage === "ready_for_delivery") c.ready++;
    }
    return c;
  }, [activeLaundryJobs, branchFilter]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeLaundryJobs.filter(({ job, checklist, effectiveStage }) => {
      if (branchFilter !== "all" && job.branchId !== branchFilter) return false;

      // When on a dedicated department page, scope the work to that department!
      if (fixedDepartment === "checker") {
        if (
          effectiveStage !== "checking" &&
          effectiveStage !== "recheck_required" &&
          !(selectedStageTab === "packing" && effectiveStage === "packing_verify")
        ) {
          return false;
        }
      } else if (fixedDepartment === "washing") {
        if (effectiveStage !== "washing_verify" && effectiveStage !== "washing") return false;
      } else if (fixedDepartment === "ironing") {
        if (effectiveStage !== "ironing_verify" && effectiveStage !== "ironing") return false;
      } else if (fixedDepartment === "delivery-prep") {
        if (effectiveStage !== "packing_verify" && effectiveStage !== "ready_for_delivery") return false;
      } else {
        if (selectedStageTab === "recheck" && effectiveStage !== "recheck_required") return false;
        if (selectedStageTab === "checker" && effectiveStage !== "checking" && effectiveStage !== "recheck_required")
          return false;
        if (selectedStageTab === "washing" && effectiveStage !== "washing_verify" && effectiveStage !== "washing")
          return false;
        if (selectedStageTab === "ironing" && effectiveStage !== "ironing_verify" && effectiveStage !== "ironing")
          return false;
        if (selectedStageTab === "packing" && effectiveStage !== "packing_verify") return false;
        if (selectedStageTab === "ready" && effectiveStage !== "ready_for_delivery") return false;
      }

      if (!q) return true;
      const billMatch = (job.billNo || formatJobDisplayId(job.id)).toLowerCase().includes(q);
      const custMatch =
        (job.customerName || "").toLowerCase().includes(q) || (job.customerPhone || "").includes(q);
      const staffMatch =
        (checklist?.activeAssignee?.staffName || "").toLowerCase().includes(q);
      const itemMatch = (checklist?.items || []).some(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.brand || "").toLowerCase().includes(q) ||
          (it.color || "").toLowerCase().includes(q)
      );
      return billMatch || custMatch || staffMatch || itemMatch;
    });
  }, [activeLaundryJobs, branchFilter, selectedStageTab, searchQuery, fixedDepartment]);

  const handleSelectJob = (job: Job | null) => {
    if (job) {
      setSelectedJobId(job.id);
      router.replace(`${baseRoute}?jobId=${encodeURIComponent(job.id)}`, { scroll: false });
    } else {
      setSelectedJobId(null);
      router.replace(baseRoute, { scroll: false });
    }
  };

  const handleClickStartOrder = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    setStartingJobId(job.id);
    try {
      await claimAndStartChecklistOrder(job, settings, activeOperator);
      toast.success(
        `${activeOperator.name} (${activeOperator.department || activeOperator.role}) is now managing order ${
          job.billNo || formatJobDisplayId(job.id)
        }!`
      );
      handleSelectJob(job);
    } catch (err: any) {
      toast.error(err?.message || "Failed to start order");
    } finally {
      setStartingJobId(null);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetch("/api/db?force=1", { cache: "no-store" });
      window.location.reload();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* Standalone Department Top Bar */}
      <header className="h-14 px-3 sm:px-5 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg ${
              deptMeta ? deptMeta.headerColor : "bg-indigo-600"
            } flex items-center justify-center shrink-0`}
          >
            <ClipboardCheck size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-tight truncate">
                {deptMeta ? deptMeta.title : "TLS Department Stations Hub"}
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                  deptMeta
                    ? deptMeta.badgeColor
                    : "bg-indigo-500/30 text-indigo-200 border-indigo-400/30"
                }`}
              >
                {deptMeta ? deptMeta.titleTh : "All Depts"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              Active Employee:{" "}
              <strong className="text-emerald-300">
                {activeOperator.name} ({activeOperator.department || activeOperator.role})
              </strong>
            </p>
          </div>
        </div>

        {/* Right Controls: Employee Switcher + Department Links */}
        <div className="flex items-center gap-2">
          {/* Employee Profile Selector */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
            <UserCheck size={13} className="text-emerald-400 shrink-0" />
            <select
              value={activeOperator.id}
              onChange={(e) => selectOperator(e.target.value)}
              className="bg-transparent text-white text-xs font-bold outline-none max-w-[170px]"
              title="Select Employee Operating This Department"
            >
              {staffOptions.map((op) => (
                <option key={op.id} value={op.id} className="text-slate-900">
                  👤 {op.name} ({op.department || op.role})
                </option>
              ))}
            </select>
          </div>

          <Link
            href="/item-check"
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
            title="Switch Department Station"
          >
            <Users size={13} />
            <span className="hidden md:inline">Departments</span>
          </Link>

          <Link
            href="/billing"
            className="hidden lg:inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
            title="Switch to Billing Camera APK"
          >
            <Camera size={13} />
            <span>Billing</span>
          </Link>

          <Link
            href="/admin#item-check"
            className="hidden md:inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
            title="Open Admin Dashboard"
          >
            <LayoutDashboard size={13} />
            <span>Admin</span>
          </Link>

          <FitScreenToggle />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleManualRefresh}
            className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-800"
            title="Refresh"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => Promise.resolve(logout()).finally(() => window.location.replace("/login"))}
            className="h-8 px-2 text-rose-400 hover:text-rose-300 hover:bg-slate-800 text-xs font-bold gap-1"
            title="Logout"
          >
            <LogOut size={14} />
          </Button>
        </div>
      </header>

      {/* Main Content: Either Disabled Notice, Full-Screen LaundryChecklistWorkspace, OR Department Order Queue */}
      {settings.enableItemCountQc === "false" ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
            <ClipboardCheck size={42} className="mx-auto text-slate-300" />
            <h2 className="text-base font-black text-slate-900">
              Item Count &amp; Department QC is Disabled
            </h2>
            <p className="text-xs text-slate-500">
              This module is currently deactivated in Admin Settings. An administrator can activate it under{" "}
              <strong>Settings → System → Laundry Item Count &amp; Department QC</strong>.
            </p>
            <Link
              href="/admin#settings"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
            >
              Open Admin Settings
            </Link>
          </div>
        </div>
      ) : selectedJob ? (
        <LaundryChecklistWorkspace
          job={selectedJob}
          actorName={activeOperator.name}
          isStandalonePage={true}
          onBackToQueue={() => handleSelectJob(null)}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {/* Dedicated Department Switcher Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              {
                slug: "checker" as DedicatedDepartmentSlug,
                href: "/item-check/checker",
                title: "1. Checker Dept",
                sub: "Initial Count & Recheck",
                count: counts.checker + counts.recheck,
                icon: <ClipboardCheck size={18} />,
                activeRing: "ring-2 ring-amber-500 border-amber-400 bg-amber-50/90",
                badge: "bg-amber-600 text-white",
              },
              {
                slug: "washing" as DedicatedDepartmentSlug,
                href: "/item-check/washing",
                title: "2. Washing Dept",
                sub: "Verify Count & Wash",
                count: counts.washing,
                icon: <Droplets size={18} />,
                activeRing: "ring-2 ring-blue-500 border-blue-400 bg-blue-50/90",
                badge: "bg-blue-600 text-white",
              },
              {
                slug: "ironing" as DedicatedDepartmentSlug,
                href: "/item-check/ironing",
                title: "3. Ironing Dept",
                sub: "Verify Count & Iron",
                count: counts.ironing,
                icon: <Shirt size={18} />,
                activeRing: "ring-2 ring-violet-500 border-violet-400 bg-violet-50/90",
                badge: "bg-violet-600 text-white",
              },
              {
                slug: "delivery-prep" as DedicatedDepartmentSlug,
                href: "/item-check/delivery-prep",
                title: "4. Checker Delivery Prep",
                sub: "Final Count & Pack for Rider",
                count: counts.packing,
                icon: <PackageCheck size={18} />,
                activeRing: "ring-2 ring-teal-500 border-teal-400 bg-teal-50/90",
                badge: "bg-teal-600 text-white",
              },
            ].map((card) => {
              const isCurrentPage = fixedDepartment === card.slug;
              return (
                <Link
                  key={card.slug}
                  href={card.href}
                  className={`rounded-2xl border p-3 flex items-center justify-between gap-2 transition-all shadow-2xs ${
                    isCurrentPage
                      ? card.activeRing
                      : "bg-white border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{card.title}</p>
                    <p className="text-[10.5px] font-medium text-slate-500 truncate">{card.sub}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${card.badge}`}
                  >
                    {card.count}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Search, Employee Selector & Stage Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5">
                <UserCheck size={16} className="text-indigo-600 shrink-0" />
                <span className="text-xs font-extrabold text-indigo-950">
                  Working as Employee:
                </span>
                <select
                  value={activeOperator.id}
                  onChange={(e) => selectOperator(e.target.value)}
                  className="h-7 rounded-lg bg-white border border-indigo-300 px-2.5 text-xs font-black text-slate-900 outline-none"
                >
                  {staffOptions.map((op) => (
                    <option key={op.id} value={op.id}>
                      👤 {op.name} — {op.department || op.role} ({op.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Bill No, Customer, Employee Name, or Brand..."
                  className="pl-9 h-10 text-sm font-medium bg-slate-50"
                />
              </div>

              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
              >
                <option value="all">All Branches</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {!fixedDepartment && (
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: `All Active (${counts.all})` },
                  ...(counts.recheck > 0
                    ? [{ id: "recheck", label: `⚠️ Recheck (${counts.recheck})` }]
                    : []),
                  { id: "checker", label: `1. Checker Count (${counts.checker + counts.recheck})` },
                  { id: "washing", label: `2. Washing (${counts.washing})` },
                  { id: "ironing", label: `3. Ironing (${counts.ironing})` },
                  { id: "packing", label: `4. Back to Checker — Delivery Prep (${counts.packing})` },
                  { id: "ready", label: `5. Ready for Rider (${counts.ready})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedStageTab(tab.id as any)}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                      selectedStageTab === tab.id
                        ? "bg-indigo-600 text-white shadow-xs"
                        : tab.id === "recheck"
                        ? "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Touch-Friendly Department Order Cards */}
          {filteredRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
              <ClipboardCheck size={36} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-700">
                No orders currently waiting in {deptMeta ? deptMeta.title : "this stage"}
              </p>
              <p className="text-xs text-slate-400">
                Orders will appear here automatically as soon as they reach this department.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredRows.map(({ job, checklist, effectiveStage }) => {
                const meta = getStageMeta(effectiveStage);
                const totalPieces = (checklist?.items || []).reduce(
                  (sum, it) => sum + (Number(it.checkerQty) || 0),
                  0
                );
                const requiresIron = checklist
                  ? checklist.requiresIroning
                  : detectJobRequiresIroning(job);

                const deptKey = getStageDepartmentKey(effectiveStage);
                const deptLabelMeta = getDepartmentStageLabel(deptKey);
                const activeAssignee =
                  checklist?.activeAssignee && checklist.activeAssignee.departmentStage === deptKey
                    ? checklist.activeAssignee
                    : checklist?.departmentAssignees?.[deptKey] || null;
                const isStartedInCurrentDept = Boolean(
                  checklist?.activeAssignee && checklist.activeAssignee.departmentStage === deptKey
                );
                const assignees = checklist?.departmentAssignees || {};

                return (
                  <div
                    key={job.id}
                    onClick={() => handleSelectJob(job)}
                    className={`w-full text-left bg-white rounded-2xl border p-4 flex flex-col justify-between gap-3 shadow-2xs transition-all cursor-pointer ${
                      effectiveStage === "recheck_required"
                        ? "border-rose-400 ring-2 ring-rose-500/20"
                        : isStartedInCurrentDept
                        ? "border-indigo-300 ring-1 ring-indigo-500/20"
                        : "border-slate-200 hover:border-indigo-300"
                    }`}
                  >
                    <div className="space-y-2.5 w-full">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-black text-indigo-700">
                              {job.billNo || formatJobDisplayId(job.id)}
                            </span>
                            <span
                              className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border ${meta.badgeClass}`}
                            >
                              {meta.labelTh}
                            </span>
                          </div>
                          <p className="text-base font-black text-slate-900 mt-1">
                            {job.customerName || "Walk-in Customer"}
                          </p>
                          <p className="text-xs text-slate-500 font-medium">
                            {job.weight ? `${job.weight} kg • ` : ""}
                            {requiresIron ? "👔 Ironing Required" : "📦 Wash & Fold"}
                          </p>
                        </div>

                        <div className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-center shrink-0">
                          <p className="text-[10px] font-bold uppercase leading-none">Pieces</p>
                          <p className="text-lg font-black leading-tight">{totalPieces}</p>
                        </div>
                      </div>

                      {/* Employee Ownership Status Box */}
                      <div
                        className={`p-2.5 rounded-xl border space-y-1 ${
                          activeAssignee
                            ? "bg-indigo-50/70 border-indigo-200"
                            : "bg-amber-50/80 border-amber-200"
                        }`}
                      >
                        {activeAssignee ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-900">
                              <UserCheck size={14} className="text-indigo-600 shrink-0" />
                              <span>
                                Managed by: <strong>{activeAssignee.staffName}</strong>
                                {activeAssignee.staffDepartment
                                  ? ` (${activeAssignee.staffDepartment})`
                                  : activeAssignee.staffRole
                                  ? ` (${activeAssignee.staffRole})`
                                  : ""}
                              </span>
                            </span>
                            <span className="text-[10px] font-bold text-indigo-700">
                              {new Date(activeAssignee.startedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                            <Play size={13} className="text-amber-700 shrink-0" />
                            <span>Waiting for {deptLabelMeta.title} staff to click &amp; start</span>
                          </p>
                        )}

                        {(assignees.checker ||
                          assignees.washing ||
                          assignees.ironing ||
                          assignees.delivery_prep) && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/60 text-[10px] font-bold text-slate-600">
                            {assignees.checker && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                1. Checker: <strong>{assignees.checker.staffName}</strong>
                              </span>
                            )}
                            {assignees.washing && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                2. Wash: <strong>{assignees.washing.staffName}</strong>
                              </span>
                            )}
                            {assignees.ironing && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                3. Iron: <strong>{assignees.ironing.staffName}</strong>
                              </span>
                            )}
                            {assignees.delivery_prep && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                                4. Prep: <strong>{assignees.delivery_prep.staffName}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {checklist?.discrepancyAlert && (
                        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-bold flex items-center gap-1.5">
                          <AlertTriangle size={14} className="shrink-0 text-rose-600" />
                          <span className="truncate">{checklist.discrepancyAlert.reason}</span>
                        </div>
                      )}

                      {checklist && checklist.items.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {checklist.items.slice(0, 6).map((it) => (
                            <span
                              key={it.id}
                              className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-800"
                            >
                              {it.name} ×{it.checkerQty}
                            </span>
                          ))}
                          {checklist.items.length > 6 && (
                            <span className="text-[11px] font-bold text-slate-400 px-1">
                              +{checklist.items.length - 6} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Bar: Click to Start Process with User Details */}
                    <div className="w-full pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      {!isStartedInCurrentDept && effectiveStage !== "ready_for_delivery" ? (
                        <Button
                          type="button"
                          disabled={startingJobId === job.id}
                          onClick={(e) => handleClickStartOrder(e, job)}
                          className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black gap-1.5 rounded-xl shadow-xs cursor-pointer"
                        >
                          <Play size={14} />
                          <span>
                            Start Process as {activeOperator.name} (คลิกเริ่มรับงาน)
                          </span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectJob(job);
                          }}
                          className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black gap-1.5 rounded-xl cursor-pointer"
                        >
                          <span>
                            Continue Order ({activeAssignee?.staffName || activeOperator.name})
                          </span>
                          <ChevronRight size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ItemCheckApkPage() {
  return (
    <ProtectedRoute allowedRole="non-rider">
      <Suspense
        fallback={
          <div className="h-[100dvh] flex items-center justify-center bg-slate-50 text-sm font-bold text-slate-500">
            Loading Department Stations...
          </div>
        }
      >
        <ItemCheckDepartmentStation />
      </Suspense>
    </ProtectedRoute>
  );
}
