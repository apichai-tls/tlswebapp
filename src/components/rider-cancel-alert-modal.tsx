"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useRiders } from "@/lib/use-riders";
import { jobStore, shopStore, type Job } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { getUserAssignedBranchIds } from "@/components/branch-filter-dropdown";
import { useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Truck, Package, MapPin, Phone, UserCheck, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export interface RiderCancelAlertItem {
  alertId: string;
  job: Job;
  legType: "pickup" | "delivery";
  riderId: string;
  riderName: string;
  reason: string;
  cancelledAt: string;
  targetLocation: string;
}

export function RiderCancelAlertModal({
  onOpenJobDetail,
}: {
  onOpenJobDetail?: (job: Job) => void;
}) {
  const allJobs = useJobs();
  const allRiders = useRiders();
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // Only show Rider Cancellation Alert Popup to Dispatchers / Operations / CSO / Admin
  // Never interrupt Accounting or Marketing users
  const canReceiveDispatchAlerts = useMemo(() => {
    if (!user) return false;
    const roleLower = String(user.role || "").toLowerCase();
    const deptLower = String(user.department || "").toLowerCase();

    // Explicitly exclude Accounting & Marketing roles/departments
    if (
      roleLower === "accounting" ||
      roleLower === "marketing" ||
      roleLower === "rider" ||
      deptLower === "accounting" ||
      deptLower === "marketing" ||
      deptLower.includes("บัญชี") ||
      deptLower.includes("การตลาด")
    ) {
      return false;
    }

    if (roleLower === "admin" || roleLower === "superadmin") return true;

    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return (
      perms.includes("dispatch") ||
      perms.includes("riders") ||
      perms.includes("cso") ||
      roleLower === "cso" ||
      roleLower === "manager" ||
      roleLower === "branch_manager" ||
      roleLower === "dispatcher"
    );
  }, [user]);

  const isAreaRestricted = Boolean(
    user &&
      user.role !== "admin" &&
      ((user.area && user.area !== "ALL") || (user.branchId && user.branchId !== "all" && user.branchId !== "ALL"))
  );
  const allowedBranchIds = useMemo(
    () => new Set(getUserAssignedBranchIds(user, shopLocations)),
    [user, shopLocations]
  );
  const userArea =
    user?.area && user.area !== "ALL"
      ? user.area
      : user?.branchId && user.branchId !== "all"
        ? user.branchId
        : null;

  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const [selectedNewRiderId, setSelectedNewRiderId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Extract all unacknowledged rider cancellation alerts in user's area
  const allUnacknowledgedAlerts = useMemo<RiderCancelAlertItem[]>(() => {
    if (!canReceiveDispatchAlerts) return [];
    const items: RiderCancelAlertItem[] = [];

    for (const j of allJobs) {
      if (["cancel", "completed", "delivered"].includes(j.status)) continue;

      if (isAreaRestricted && userArea) {
        const branch = shopLocations.find((s) => s.id === j.branchId);
        if (shopLocations.length > 0 && j.branchId && !allowedBranchIds.has(j.branchId)) {
          const branchAreaMatch = (branch?.area || "").toUpperCase() === userArea.toUpperCase();
          if (!branchAreaMatch) continue;
        }
      }

      if (!j.adminNotesJson) continue;
      try {
        const parsed = JSON.parse(j.adminNotesJson);
        const alertObj = parsed?.riderCancelAlert;
        if (!alertObj || alertObj.acknowledged === true) continue;

        const legType: "pickup" | "delivery" = alertObj.legType === "delivery" ? "delivery" : "pickup";
        // Verify that the leg is still unassigned (if someone already reassigned it, no need to alert)
        const currentAssignedRider = legType === "pickup" ? j.pickupRiderId : j.deliveryRiderId;
        if (currentAssignedRider && currentAssignedRider !== alertObj.riderId) continue;

        const alertId = String(alertObj.id || `${j.id}-${legType}-${alertObj.cancelledAt || ""}`);

        items.push({
          alertId,
          job: j,
          legType,
          riderId: alertObj.riderId || "",
          riderName: alertObj.riderName || "Rider",
          reason: alertObj.reason || "No reason specified (ไม่ระบุเหตุผล)",
          cancelledAt: alertObj.cancelledAt || new Date().toISOString(),
          targetLocation:
            alertObj.targetLocation ||
            (legType === "pickup" ? j.pickupLocation : j.dropoffLocation) ||
            "-",
        });
      } catch {}
    }

    return items.sort(
      (a, b) => new Date(b.cancelledAt).getTime() - new Date(a.cancelledAt).getTime()
    );
  }, [canReceiveDispatchAlerts, allJobs, isAreaRestricted, userArea, shopLocations, allowedBranchIds]);

  const pendingCancelAlerts = useMemo(
    () => allUnacknowledgedAlerts.filter((a) => !dismissedAlertIds.has(a.alertId)),
    [allUnacknowledgedAlerts, dismissedAlertIds]
  );

  const activeAlert = pendingCancelAlerts[0] || null;

  // Candidate riders for the job's area/branch
  const availableRiders = useMemo(() => {
    const activeList = allRiders.filter((r) => r.branchId && r.isActive !== false);
    if (!activeAlert) return activeList;

    const jobBranch = shopLocations.find((s) => s.id === activeAlert.job.branchId);
    const jobArea = (jobBranch?.area || "").toUpperCase();

    return [...activeList].sort((a, b) => {
      // Put online/busy riders in the same area first, and put the rider who cancelled at the bottom
      const aIsCanceller = a.id === activeAlert.riderId ? 1 : 0;
      const bIsCanceller = b.id === activeAlert.riderId ? 1 : 0;
      if (aIsCanceller !== bIsCanceller) return aIsCanceller - bIsCanceller;

      const aBranch = shopLocations.find((s) => s.id === a.branchId);
      const bBranch = shopLocations.find((s) => s.id === b.branchId);
      const aSameArea = jobArea && (aBranch?.area || "").toUpperCase() === jobArea ? 1 : 0;
      const bSameArea = jobArea && (bBranch?.area || "").toUpperCase() === jobArea ? 1 : 0;
      if (aSameArea !== bSameArea) return bSameArea - aSameArea;

      const aOnline = a.status === "online" || a.status === "busy" ? 1 : 0;
      const bOnline = b.status === "online" || b.status === "busy" ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;

      return a.name.localeCompare(b.name);
    });
  }, [allRiders, activeAlert, shopLocations]);

  // Reset selected rider when active alert changes
  useEffect(() => {
    if (!activeAlert) {
      setSelectedNewRiderId("");
      return;
    }
    const recommended = availableRiders.find(
      (r) => r.id !== activeAlert.riderId && (r.status === "online" || r.status === "busy")
    );
    setSelectedNewRiderId(recommended?.id || "");
  }, [activeAlert?.alertId, availableRiders]);

  if (!canReceiveDispatchAlerts) return null;

  if (!activeAlert) {
    if (allUnacknowledgedAlerts.length === 0) return null;
    return (
      <div className="fixed bottom-5 right-5 z-[115]">
        <button
          type="button"
          onClick={() => setDismissedAlertIds(new Set())}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-xl border-2 border-white animate-pulse cursor-pointer"
        >
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            {allUnacknowledgedAlerts.length} Rider Cancelled Task(s) (งานถูกยกเลิกรอจัดคิว)
          </span>
        </button>
      </div>
    );
  }

  const handleAssignNewRider = async () => {
    if (!selectedNewRiderId) {
      toast.error("Please select a new rider to assign (กรุณาเลือก Rider คนใหม่)");
      return;
    }

    setIsSubmitting(true);
    try {
      const { job, legType } = activeAlert;
      const schedDate =
        legType === "pickup"
          ? job.pickupScheduledAt
            ? new Date(job.pickupScheduledAt)
            : job.scheduledAt
              ? new Date(job.scheduledAt)
              : new Date()
          : job.deliveryScheduledAt
            ? new Date(job.deliveryScheduledAt)
            : job.scheduledAt
              ? new Date(job.scheduledAt)
              : new Date();

      const actorDetails = {
        actorId: user?.id,
        actorName: (user as any)?.name || user?.email || "Dispatcher",
        actorRole: user?.role,
      };

      if (legType === "pickup") {
        await jobStore.assignPickupRider(job.id, selectedNewRiderId, schedDate, actorDetails);
      } else {
        await jobStore.assignDeliveryRider(job.id, selectedNewRiderId, schedDate, actorDetails);
      }

      const assignedRider = allRiders.find((r) => r.id === selectedNewRiderId);
      const assignedName = assignedRider ? assignedRider.nickname || assignedRider.name : "Rider";
      toast.success(
        `Assigned ${legType === "pickup" ? "Pickup" : "Delivery"} #${job.id.split("-")[0].toUpperCase()} to ${assignedName} (มอบหมาย Rider ใหม่แล้ว)`
      );
      setDismissedAlertIds((prev) => new Set(prev).add(activeAlert.alertId));
    } catch (err: any) {
      console.error(err);
      toast.error(`Assignment failed (มอบหมายไม่สำเร็จ): ${err?.message || "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcknowledgeWaitInQueue = async () => {
    setIsSubmitting(true);
    try {
      const { job } = activeAlert;
      let nextAdminNotesJson = job.adminNotesJson;
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.riderCancelAlert) {
            parsed.riderCancelAlert = {
              ...parsed.riderCancelAlert,
              acknowledged: true,
              acknowledgedAt: new Date().toISOString(),
              acknowledgedBy: (user as any)?.name || user?.email || "Dispatcher",
            };
            nextAdminNotesJson = JSON.stringify(parsed);
          }
        } catch {}
      }

      await jobStore.updateJobDetails(
        job.id,
        { adminNotesJson: nextAdminNotesJson },
        {
          actorId: user?.id,
          actorName: (user as any)?.name || user?.email || "Dispatcher",
          actorRole: user?.role,
        }
      );

      setDismissedAlertIds((prev) => new Set(prev).add(activeAlert.alertId));
      toast("Acknowledged — Task moved to Unassigned queue (รับทราบแล้ว อยู่ในคิว Unassigned)", { icon: "📌" });
    } catch {
      setDismissedAlertIds((prev) => new Set(prev).add(activeAlert.alertId));
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelledTimeFormatted = (() => {
    try {
      const d = new Date(activeAlert.cancelledAt);
      if (!isNaN(d.getTime())) return format(d, "dd MMM yyyy HH:mm");
    } catch {}
    return "";
  })();

  return (
    <Dialog
      open={Boolean(activeAlert)}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          setDismissedAlertIds((prev) => new Set(prev).add(activeAlert.alertId));
        }
      }}
    >
      <DialogContent className="sm:max-w-xl w-[94vw] max-w-[94vw] p-0 overflow-hidden bg-white border-2 border-rose-500 rounded-2xl shadow-2xl z-[120] [&>button]:text-white [&>button]:opacity-90 [&>button:hover]:opacity-100">
        <div className="min-w-0 w-full flex flex-col max-h-[90vh]">
          <DialogHeader className="px-5 py-3.5 pr-11 bg-gradient-to-r from-rose-600 to-red-600 text-white shrink-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <DialogTitle className="text-sm sm:text-base font-black flex items-center gap-2 text-white min-w-0">
                <span className="p-1.5 rounded-xl bg-white/20 shrink-0">
                  <AlertTriangle size={18} className="text-white" />
                </span>
                <span className="truncate">Rider Cancelled Task! (แจ้งเตือน Rider ยกเลิกงาน)</span>
              </DialogTitle>
              {pendingCancelAlerts.length > 1 && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-white text-rose-700 shrink-0">
                  1 / {pendingCancelAlerts.length}
                </span>
              )}
            </div>
            <DialogDescription className="text-xs text-rose-100 font-medium mt-0.5 text-left">
              Review reason and assign a replacement rider (ตรวจสอบเหตุผลและมอบหมาย Rider ใหม่)
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 space-y-3.5 overflow-y-auto min-w-0">
            {/* Reason Banner */}
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-black text-rose-900 flex items-center gap-1.5 flex-wrap">
                  <span>Cancelled by (ยกเลิกโดย):</span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-xs font-extrabold">
                    {activeAlert.riderName}
                  </span>
                </span>
                {cancelledTimeFormatted && (
                  <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <Clock size={11} />
                    {cancelledTimeFormatted}
                  </span>
                )}
              </div>
              <div className="pt-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-500">
                  Cancellation Reason (เหตุผลที่ยกเลิก):
                </p>
                <p className="text-sm font-black text-rose-950 mt-0.5 bg-white/95 p-2.5 rounded-lg border border-rose-200/80 break-words">
                  “{activeAlert.reason}”
                </p>
              </div>
            </div>

            {/* Job Summary Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black uppercase shrink-0 ${
                      activeAlert.legType === "pickup"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-indigo-100 text-indigo-800 border border-indigo-300"
                    }`}
                  >
                    {activeAlert.legType === "pickup" ? <Package size={12} /> : <Truck size={12} />}
                    {activeAlert.legType === "pickup" ? "PICKUP (ขารับผ้า)" : "DELIVERY (ขาส่งผ้า)"}
                  </span>
                  <span className="font-mono text-xs font-black text-slate-600">
                    #{activeAlert.job.id.split("-")[0].toUpperCase()}
                  </span>
                </div>

                {onOpenJobDetail && (
                  <button
                    type="button"
                    onClick={() => onOpenJobDetail(activeAlert.job)}
                    className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 underline cursor-pointer shrink-0"
                  >
                    View Order (ดูงาน)
                  </button>
                )}
              </div>

              <div className="space-y-1 min-w-0">
                <div className="text-sm font-black text-slate-900 flex items-center gap-2 flex-wrap">
                  <span className="truncate">{activeAlert.job.customerName || "Customer Guest"}</span>
                  {activeAlert.job.customerPhone && (
                    <a
                      href={`tel:${activeAlert.job.customerPhone}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 hover:bg-slate-100 shrink-0"
                    >
                      <Phone size={11} />
                      {activeAlert.job.customerPhone}
                    </a>
                  )}
                </div>
                <div className="flex items-start gap-1.5 text-xs text-slate-600 font-medium min-w-0">
                  <MapPin size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span className="break-words min-w-0">{activeAlert.targetLocation}</span>
                </div>
              </div>
            </div>

            {/* Direct Rider Assignment Selector */}
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <UserCheck size={15} className="text-indigo-600 shrink-0" />
                <span>Assign New Rider (เลือกมอบหมาย Rider ใหม่) *</span>
              </label>
              <select
                value={selectedNewRiderId}
                onChange={(e) => setSelectedNewRiderId(e.target.value)}
                className="w-full h-11 rounded-xl border-2 border-indigo-200 bg-white px-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-600 cursor-pointer"
              >
                <option value="">-- Select Rider (เลือก Rider) --</option>
                {availableRiders.map((r) => {
                  const branchObj = shopLocations.find((s) => s.id === r.branchId);
                  const shortBranch = branchObj?.name?.replace("That Laundry Shop ", "") || "";
                  const isPrevRider = r.id === activeAlert.riderId;
                  return (
                    <option key={r.id} value={r.id}>
                      {r.status === "online" ? "🟢" : r.status === "busy" ? "🟡" : "⚪"}{" "}
                      {r.nickname ? `${r.nickname} (${r.name})` : r.name} — {r.status.toUpperCase()}
                      {shortBranch ? ` [${shortBranch}]` : ""}
                      {isPrevRider ? " (Cancelled / เพิ่งยกเลิก)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <DialogFooter className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={handleAcknowledgeWaitInQueue}
              className="w-full sm:w-auto h-10 px-4 rounded-xl text-xs font-bold text-slate-700 bg-white border-slate-200 hover:bg-slate-100 cursor-pointer"
            >
              Keep in Unassigned (เก็บไว้ในคิวก่อน)
            </Button>
            <Button
              type="button"
              disabled={!selectedNewRiderId || isSubmitting}
              onClick={handleAssignNewRider}
              className="w-full sm:flex-1 h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm shadow-md cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="mr-1.5 animate-spin shrink-0" />
              ) : (
                <CheckCircle2 size={16} className="mr-1.5 shrink-0" />
              )}
              <span>Assign New Rider (มอบหมายทันที)</span>
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
