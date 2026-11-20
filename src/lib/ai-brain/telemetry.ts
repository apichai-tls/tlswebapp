import { prisma } from "@/lib/prisma";
import { extractTaskMetaFromNotesJson } from "@/lib/task-meta";

export interface StageMetric {
  stage: string;
  count: number;
  stuckCount: number;
  avgAgeHours: number;
}

export interface BranchMetric {
  branchId: string;
  branchName: string;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  stuckOrders: number;
  unpaidOrders: number;
  revenue: number;
}

export interface RiderMetric {
  riderId: string;
  riderName: string;
  pickups: number;
  deliveries: number;
  overdueActive: number;
}

export interface DepartmentTaskMetric {
  department: string;
  totalTasks: number;
  openTasks: number;
  stuckTasks: number;
  overdueTasks: number;
  doneTasks: number;
}

export interface ComplaintSample {
  taskId: string;
  title: string;
  status: string;
  jobId: string | null;
  customerName: string | null;
  category: string;
  createdAt: string;
}

export interface OperationalTelemetry {
  generatedAt: string;
  windowDays: number;
  healthScore: number; // 0-100
  summary: {
    totalOrdersInWindow: number;
    activeOrdersNow: number;
    completedOrdersInWindow: number;
    cancelledOrdersInWindow: number;
    stuckOrdersNow: number;
    overdueDeliveryNow: number;
    noBillActive: number;
    csoPaidShopUnpaid: number;
    unpaidCompleted: number;
    missingBagOrBillPhotoActive: number;
    avgCompletionHours: number;
    totalRevenueInWindow: number;
    refundsCountInWindow: number;
    refundAmountInWindow: number;
    openTasksCount: number;
    overdueTasksCount: number;
    stuckTasksCount: number;
    customerComplaintsInWindow: number;
    pendingWalletApprovals: number;
  };
  stageBreakdown: StageMetric[];
  branchBreakdown: BranchMetric[];
  riderWorkload: RiderMetric[];
  departmentTasks: DepartmentTaskMetric[];
  topStuckJobIds: Array<{
    id: string;
    status: string;
    subStatus: string | null;
    branchName: string;
    customerName: string;
    ageHours: number;
    isStuck: boolean;
  }>;
  recentComplaints: ComplaintSample[];
  topActivityActions: Array<{ entityType: string; action: string; count: number }>;
  brandBreakdown: Array<{ brand: string; orders: number; revenue: number }>;
}

export interface GeneratedInsightDraft {
  category:
    | "bottleneck"
    | "sla_delay"
    | "department"
    | "rider"
    | "billing"
    | "complaint_pattern"
    | "workflow_improvement";
  severity: "critical" | "warning" | "opportunity" | "info";
  title: string;
  summary: string;
  rootCause: string;
  recommendation: string;
  impactEstimate: string;
  evidence: {
    jobIds?: string[];
    taskIds?: string[];
    departments?: string[];
    metrics?: Record<string, number | string>;
  };
}

function classifyOrderStage(status: string | null, subStatus: string | null): string {
  const s = (status || "").toLowerCase();
  const sub = (subStatus || "").toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "cancel" || s === "cancelled") return "Cancelled";
  if (s === "tba") return "TBA";
  if (s === "pending") return "Pending";
  if (s === "accepted" || s === "pickup" || s === "picking_up") return "Pickup";
  if (s === "billing" || sub.includes("bill")) return "Billing";
  if (s === "delivery" || s === "delivering" || sub.includes("deliver")) return "Delivery";
  if (sub.includes("checker") || sub.includes("qc") || sub.includes("ready")) return "Checker / Ready";
  if (s === "picked_up" || s === "processing" || s === "process" || s === "active") return "Process";
  return status || "Other";
}

export async function collectOperationalTelemetry(
  windowDays: number = 7
): Promise<OperationalTelemetry> {
  const safeDays = Math.min(Math.max(Number(windowDays) || 7, 1), 90);
  const now = new Date();
  const since = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);

  const [
    recentJobs,
    activeJobs,
    shops,
    riders,
    tasks,
    refunds,
    pendingWalletCount,
    activityLogs,
  ] = await Promise.all([
    prisma.job.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        status: true,
        subStatus: true,
        branchId: true,
        brand: true,
        customerName: true,
        totalAmount: true,
        fee: true,
        isPaid: true,
        isShopPaid: true,
        isStuck: true,
        billNo: true,
        billImageUrl: true,
        bagImageUrl: true,
        pickupRiderId: true,
        deliveryRiderId: true,
        riderId: true,
        deliveryScheduledAt: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 2500,
    }),
    prisma.job.findMany({
      where: {
        status: { notIn: ["completed", "cancel", "cancelled"] },
      },
      select: {
        id: true,
        status: true,
        subStatus: true,
        branchId: true,
        brand: true,
        customerName: true,
        totalAmount: true,
        fee: true,
        isPaid: true,
        isShopPaid: true,
        isStuck: true,
        billNo: true,
        billImageUrl: true,
        bagImageUrl: true,
        pickupRiderId: true,
        deliveryRiderId: true,
        riderId: true,
        deliveryScheduledAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 1500,
    }),
    prisma.shopLocation.findMany({
      select: { id: true, name: true },
    }),
    prisma.rider.findMany({
      select: { id: true, name: true, nickname: true },
    }),
    prisma.task.findMany({
      where: {
        OR: [{ isArchived: false }, { createdAt: { gte: since } }],
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        jobId: true,
        dueDate: true,
        notesJson: true,
        isArchived: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.jobRefund.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, refundAmount: true },
    }),
    prisma.walletTransaction.count({
      where: { approvalStatus: "PENDING" },
    }),
    prisma.activityLog.findMany({
      where: { createdAt: { gte: since } },
      select: { entityType: true, action: true },
      take: 2500,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const shopNameMap = new Map<string, string>();
  shops.forEach((s) => shopNameMap.set(s.id, s.name));
  const riderNameMap = new Map<string, string>();
  riders.forEach((r) => riderNameMap.set(r.id, r.nickname || r.name));

  // Stage funnel & age analysis for active jobs
  const stageAcc = new Map<string, { count: number; stuckCount: number; ageHoursSum: number }>();
  let stuckOrdersNow = 0;
  let overdueDeliveryNow = 0;
  let noBillActive = 0;
  let csoPaidShopUnpaid = 0;
  let missingBagOrBillPhotoActive = 0;

  const stuckCandidates: OperationalTelemetry["topStuckJobIds"] = [];

  for (const j of activeJobs) {
    const stage = classifyOrderStage(j.status, j.subStatus);
    const ageHours = Math.max(0, (now.getTime() - new Date(j.createdAt).getTime()) / 3600000);
    const staleHours = Math.max(0, (now.getTime() - new Date(j.updatedAt).getTime()) / 3600000);
    const isEffectivelyStuck = Boolean(j.isStuck) || staleHours >= 36;

    const entry = stageAcc.get(stage) || { count: 0, stuckCount: 0, ageHoursSum: 0 };
    entry.count += 1;
    if (isEffectivelyStuck) entry.stuckCount += 1;
    entry.ageHoursSum += ageHours;
    stageAcc.set(stage, entry);

    if (isEffectivelyStuck) {
      stuckOrdersNow += 1;
      stuckCandidates.push({
        id: j.id,
        status: j.status,
        subStatus: j.subStatus || null,
        branchName: (j.branchId && shopNameMap.get(j.branchId)) || j.branchId || "Unassigned",
        customerName: j.customerName || "Unknown",
        ageHours: Math.round(ageHours),
        isStuck: Boolean(j.isStuck),
      });
    }

    if (j.deliveryScheduledAt && new Date(j.deliveryScheduledAt).getTime() < now.getTime()) {
      overdueDeliveryNow += 1;
    }

    const stageNeedsBill = ["Billing", "Process", "Checker / Ready", "Delivery"].includes(stage);
    if (stageNeedsBill && (!j.billNo || j.billNo === "--" || j.billNo === "-")) {
      noBillActive += 1;
    }
    if (j.isPaid && !j.isShopPaid) {
      csoPaidShopUnpaid += 1;
    }
    if (stageNeedsBill && !j.billImageUrl && !j.bagImageUrl) {
      missingBagOrBillPhotoActive += 1;
    }
  }

  // Recent window jobs stats (completed, cancelled, revenue, turnaround, branch, brand)
  let completedOrdersInWindow = 0;
  let cancelledOrdersInWindow = 0;
  let unpaidCompleted = 0;
  let totalRevenueInWindow = 0;
  let completionHoursSum = 0;
  let completionHoursCount = 0;

  const branchMap = new Map<string, BranchMetric>();
  const brandMap = new Map<string, { brand: string; orders: number; revenue: number }>();
  const riderMap = new Map<string, RiderMetric>();

  const ensureBranch = (branchId: string | null) => {
    const key = branchId || "unassigned";
    let b = branchMap.get(key);
    if (!b) {
      b = {
        branchId: key,
        branchName: (branchId && shopNameMap.get(branchId)) || branchId || "Unassigned",
        totalOrders: 0,
        activeOrders: 0,
        completedOrders: 0,
        stuckOrders: 0,
        unpaidOrders: 0,
        revenue: 0,
      };
      branchMap.set(key, b);
    }
    return b;
  };

  const ensureRider = (rid: string) => {
    let r = riderMap.get(rid);
    if (!r) {
      r = {
        riderId: rid,
        riderName: riderNameMap.get(rid) || rid.slice(0, 8),
        pickups: 0,
        deliveries: 0,
        overdueActive: 0,
      };
      riderMap.set(rid, r);
    }
    return r;
  };

  for (const j of recentJobs) {
    const s = (j.status || "").toLowerCase();
    const amount = Number(j.totalAmount || j.fee || 0);
    const b = ensureBranch(j.branchId);
    b.totalOrders += 1;

    const brandKey = j.brand || "that_laundry_shop";
    const br = brandMap.get(brandKey) || { brand: brandKey, orders: 0, revenue: 0 };
    br.orders += 1;

    if (s === "cancel" || s === "cancelled") {
      cancelledOrdersInWindow += 1;
    } else if (s === "completed") {
      completedOrdersInWindow += 1;
      b.completedOrders += 1;
      totalRevenueInWindow += amount;
      b.revenue += amount;
      br.revenue += amount;
      if (!j.isPaid && !j.isShopPaid) {
        unpaidCompleted += 1;
        b.unpaidOrders += 1;
      }
      if (j.completedAt) {
        const hrs =
          (new Date(j.completedAt).getTime() - new Date(j.createdAt).getTime()) / 3600000;
        if (hrs > 0 && hrs < 720) {
          completionHoursSum += hrs;
          completionHoursCount += 1;
        }
      }
    } else {
      if (!j.isPaid && !j.isShopPaid) {
        b.unpaidOrders += 1;
      }
    }
    brandMap.set(brandKey, br);

    const pRider = j.pickupRiderId || j.riderId;
    if (pRider) ensureRider(pRider).pickups += 1;
    if (j.deliveryRiderId) ensureRider(j.deliveryRiderId).deliveries += 1;
  }

  for (const j of activeJobs) {
    const b = ensureBranch(j.branchId);
    b.activeOrders += 1;
    const staleHours = (now.getTime() - new Date(j.updatedAt).getTime()) / 3600000;
    if (j.isStuck || staleHours >= 36) b.stuckOrders += 1;

    if (j.deliveryScheduledAt && new Date(j.deliveryScheduledAt).getTime() < now.getTime()) {
      const dRider = j.deliveryRiderId || j.riderId;
      if (dRider) ensureRider(dRider).overdueActive += 1;
    }
  }

  // Tasks & Customer Complaints analysis
  let openTasksCount = 0;
  let overdueTasksCount = 0;
  let stuckTasksCount = 0;
  let customerComplaintsInWindow = 0;

  const deptTaskMap = new Map<string, DepartmentTaskMetric>();
  const recentComplaints: ComplaintSample[] = [];

  for (const t of tasks) {
    const meta = extractTaskMetaFromNotesJson(t.notesJson);
    const deptKey = meta.departmentLabel || meta.department || "Unassigned Dept";
    const dm = deptTaskMap.get(deptKey) || {
      department: deptKey,
      totalTasks: 0,
      openTasks: 0,
      stuckTasks: 0,
      overdueTasks: 0,
      doneTasks: 0,
    };
    dm.totalTasks += 1;

    if (!t.isArchived) {
      if (t.status === "done") {
        dm.doneTasks += 1;
      } else {
        openTasksCount += 1;
        dm.openTasks += 1;
        if (t.status === "stuck") {
          stuckTasksCount += 1;
          dm.stuckTasks += 1;
        }
        if (t.dueDate && new Date(t.dueDate).getTime() < now.getTime()) {
          overdueTasksCount += 1;
          dm.overdueTasks += 1;
        }
      }
    } else if (t.status === "done") {
      dm.doneTasks += 1;
    }
    deptTaskMap.set(deptKey, dm);

    const isComplaint =
      Boolean(meta.isCustomerFeedback) ||
      meta.taskType === "complaint" ||
      meta.taskType === "feedback" ||
      /complain|feedback|shrink|stain|damage|missing|lost|ร้องเรียน|คอมเพลน|ผ้าหาย|ผ้าเสียหาย/i.test(
        `${t.title} ${t.description || ""}`
      );
    if (isComplaint && new Date(t.createdAt).getTime() >= since.getTime()) {
      customerComplaintsInWindow += 1;
      if (recentComplaints.length < 15) {
        recentComplaints.push({
          taskId: t.id,
          title: t.title,
          status: t.status,
          jobId: t.jobId,
          customerName: meta.customerName || null,
          category: meta.issueCategory || "Customer Complaint / Feedback",
          createdAt: new Date(t.createdAt).toISOString(),
        });
      }
    }
  }

  // Activity Log hotspots
  const actMap = new Map<string, { entityType: string; action: string; count: number }>();
  for (const a of activityLogs) {
    const key = `${a.entityType}:${a.action}`;
    const cur = actMap.get(key) || { entityType: a.entityType, action: a.action, count: 0 };
    cur.count += 1;
    actMap.set(key, cur);
  }

  const refundAmountInWindow = refunds.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);
  const avgCompletionHours =
    completionHoursCount > 0 ? Math.round((completionHoursSum / completionHoursCount) * 10) / 10 : 0;

  // Health score (0-100): penalize stuck ratio, overdue deliveries, billing leaks, overdue tasks
  let score = 100;
  const activeDenom = Math.max(activeJobs.length, 1);
  score -= Math.min(25, Math.round((stuckOrdersNow / activeDenom) * 100));
  score -= Math.min(20, overdueDeliveryNow * 2);
  score -= Math.min(15, csoPaidShopUnpaid * 1.5);
  score -= Math.min(15, overdueTasksCount * 2);
  score -= Math.min(15, noBillActive * 1.5);
  score -= Math.min(10, Math.min(pendingWalletCount, 10));
  const healthScore = Math.max(15, Math.min(100, Math.round(score)));

  const stageBreakdown: StageMetric[] = Array.from(stageAcc.entries())
    .map(([stage, val]) => ({
      stage,
      count: val.count,
      stuckCount: val.stuckCount,
      avgAgeHours: val.count > 0 ? Math.round((val.ageHoursSum / val.count) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: now.toISOString(),
    windowDays: safeDays,
    healthScore,
    summary: {
      totalOrdersInWindow: recentJobs.length,
      activeOrdersNow: activeJobs.length,
      completedOrdersInWindow,
      cancelledOrdersInWindow,
      stuckOrdersNow,
      overdueDeliveryNow,
      noBillActive,
      csoPaidShopUnpaid,
      unpaidCompleted,
      missingBagOrBillPhotoActive,
      avgCompletionHours,
      totalRevenueInWindow: Math.round(totalRevenueInWindow),
      refundsCountInWindow: refunds.length,
      refundAmountInWindow: Math.round(refundAmountInWindow),
      openTasksCount,
      overdueTasksCount,
      stuckTasksCount,
      customerComplaintsInWindow,
      pendingWalletApprovals: pendingWalletCount,
    },
    stageBreakdown,
    branchBreakdown: Array.from(branchMap.values()).sort((a, b) => b.totalOrders - a.totalOrders),
    riderWorkload: Array.from(riderMap.values())
      .sort((a, b) => b.pickups + b.deliveries - (a.pickups + a.deliveries))
      .slice(0, 12),
    departmentTasks: Array.from(deptTaskMap.values()).sort((a, b) => b.openTasks - a.openTasks),
    topStuckJobIds: stuckCandidates.sort((a, b) => b.ageHours - a.ageHours).slice(0, 12),
    recentComplaints,
    topActivityActions: Array.from(actMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    brandBreakdown: Array.from(brandMap.values()).sort((a, b) => b.orders - a.orders),
  };
}

/**
 * Deterministic operations analyzer used as both ground-truth baseline
 * and automatic fallback when GEMINI_API_KEY is not configured yet.
 */
export function generateDeterministicInsights(
  telemetry: OperationalTelemetry
): { executiveSummary: string; insights: GeneratedInsightDraft[] } {
  const s = telemetry.summary;
  const insights: GeneratedInsightDraft[] = [];

  if (s.stuckOrdersNow > 0) {
    const worstStage = [...telemetry.stageBreakdown].sort((a, b) => b.stuckCount - a.stuckCount)[0];
    insights.push({
      category: "bottleneck",
      severity: s.stuckOrdersNow >= 10 ? "critical" : "warning",
      title: `${s.stuckOrdersNow} Active Orders Stuck or Stale (>36h without progress)`,
      summary: `Currently ${s.stuckOrdersNow} of ${s.activeOrdersNow} active orders are flagged stuck or have not moved in over 36 hours${worstStage ? `, concentrated most heavily in "${worstStage.stage}" (${worstStage.stuckCount} orders, avg age ${worstStage.avgAgeHours}h)` : ""}.`,
      rootCause:
        "Orders stall when department handoffs are not claimed promptly, items wait for Checker QC confirmation, or customer billing/payment approval blocks delivery release.",
      recommendation:
        "Review the top stuck Order IDs below, assign an owner in the bottleneck stage, and trigger a daily 10:00 AM stuck-order standup for Branch Operations & Checker leads.",
      impactEstimate: `Unblocking these orders protects customer satisfaction and accelerates turnaround across ${s.stuckOrdersNow} active jobs.`,
      evidence: {
        jobIds: telemetry.topStuckJobIds.slice(0, 8).map((j) => j.id),
        metrics: {
          stuckOrdersNow: s.stuckOrdersNow,
          activeOrdersNow: s.activeOrdersNow,
          topStage: worstStage?.stage || "N/A",
        },
      },
    });
  }

  if (s.overdueDeliveryNow > 0) {
    const overloadedRiders = telemetry.riderWorkload
      .filter((r) => r.overdueActive > 0)
      .slice(0, 4);
    insights.push({
      category: "rider",
      severity: s.overdueDeliveryNow >= 5 ? "critical" : "warning",
      title: `${s.overdueDeliveryNow} Active Orders Past Scheduled Delivery Time`,
      summary: `${s.overdueDeliveryNow} orders have passed their scheduled delivery window and are still not completed.`,
      rootCause:
        "Either processing/Checker QC finished late, or delivery dispatch is unevenly loaded across riders during peak slots.",
      recommendation:
        "Rebalance delivery assignments in Dispatch for overdue slots and proactively notify affected customers via WhatsApp/LINE before they follow up.",
      impactEstimate: "Reduces inbound 'Where is my laundry?' CSO messages and late-delivery complaints.",
      evidence: {
        metrics: {
          overdueDeliveryNow: s.overdueDeliveryNow,
          affectedRiders: overloadedRiders.map((r) => `${r.riderName} (${r.overdueActive})`).join(", ") || "Unassigned",
        },
      },
    });
  }

  if (s.csoPaidShopUnpaid > 0 || s.noBillActive > 0 || s.unpaidCompleted > 0) {
    insights.push({
      category: "billing",
      severity: s.csoPaidShopUnpaid >= 5 || s.unpaidCompleted >= 3 ? "critical" : "warning",
      title: `Billing & Payment Reconciliation Gaps Detected`,
      summary: `Found ${s.csoPaidShopUnpaid} orders marked CSO Paid + Shop Unpaid, ${s.noBillActive} active orders past pickup without a Bill No., and ${s.unpaidCompleted} completed orders in the last ${telemetry.windowDays} days still marked unpaid.`,
      rootCause:
        "Online CSO payment confirmation and branch POS/Shop settlement are not being reconciled on the same shift, or bills are not generated immediately upon intake.",
      recommendation:
        "Have Accounting & CSO run a daily end-of-shift filter on 'CSO Paid + Shop Unpaid' and 'No Bill Issued' before closing cashier shifts.",
      impactEstimate: "Eliminates cash/transfer reconciliation discrepancies and speeds up Accounting close.",
      evidence: {
        departments: ["Accounting & CSO"],
        metrics: {
          csoPaidShopUnpaid: s.csoPaidShopUnpaid,
          noBillActive: s.noBillActive,
          unpaidCompleted: s.unpaidCompleted,
          pendingWalletApprovals: s.pendingWalletApprovals,
        },
      },
    });
  }

  if (s.customerComplaintsInWindow > 0) {
    insights.push({
      category: "complaint_pattern",
      severity: s.customerComplaintsInWindow >= 4 ? "warning" : "opportunity",
      title: `${s.customerComplaintsInWindow} Customer Complaints / Feedbacks Logged (${telemetry.windowDays}d)`,
      summary: `Recent customer complaints include: ${telemetry.recentComplaints
        .slice(0, 3)
        .map((c) => `"${c.title}"`)
        .join(", ")}.`,
      rootCause:
        "Recurring garment care issues (shrinkage, stains, missing items) typically stem from care-label / special-instruction visibility at sorting and Checker QC.",
      recommendation:
        "Ensure Checker & Washing teams review Customer CRM notes/allergies/shrinkage warnings before processing, and track resolution SLA in the Task Board.",
      impactEstimate: "Lower rewash/refund costs and stronger repeat retention for VIP & regular customers.",
      evidence: {
        taskIds: telemetry.recentComplaints.slice(0, 6).map((c) => c.taskId),
        jobIds: telemetry.recentComplaints
          .map((c) => c.jobId)
          .filter((id): id is string => Boolean(id))
          .slice(0, 6),
        metrics: {
          customerComplaintsInWindow: s.customerComplaintsInWindow,
          refundsCount: s.refundsCountInWindow,
          refundAmount: s.refundAmountInWindow,
        },
      },
    });
  }

  if (s.overdueTasksCount > 0 || s.stuckTasksCount > 0) {
    const worstDept = telemetry.departmentTasks[0];
    insights.push({
      category: "department",
      severity: s.overdueTasksCount >= 5 ? "warning" : "info",
      title: `Task Backlog: ${s.overdueTasksCount} Overdue & ${s.stuckTasksCount} Stuck Tasks`,
      summary: `There are ${s.openTasksCount} open tasks across departments (${s.overdueTasksCount} overdue, ${s.stuckTasksCount} stuck)${worstDept ? `, with "${worstDept.department}" holding ${worstDept.openTasks} open tasks` : ""}.`,
      rootCause:
        "Cross-department follow-ups (tax invoices, overdue payments, missing item checks) stall when tickets lack a clear next-step owner or SLA escalation.",
      recommendation:
        "Use Department auto-assignment for Accounting & Branch tickets and escalate any task stuck >48 hours to the Department Head.",
      impactEstimate: "Faster internal resolution and fewer dropped follow-ups.",
      evidence: {
        departments: telemetry.departmentTasks.slice(0, 3).map((d) => d.department),
        metrics: {
          openTasksCount: s.openTasksCount,
          overdueTasksCount: s.overdueTasksCount,
          stuckTasksCount: s.stuckTasksCount,
        },
      },
    });
  }

  if (insights.length === 0) {
    insights.push({
      category: "workflow_improvement",
      severity: "info",
      title: "Operations Flowing Smoothly",
      summary: `All ${s.activeOrdersNow} active orders and ${s.openTasksCount} open tasks are progressing within normal thresholds over the last ${telemetry.windowDays} days.`,
      rootCause: "No critical SLA breaches or billing leaks detected in this window.",
      recommendation:
        "Continue teaching the AI Brain your branch SOPs and run weekly scans to benchmark turnaround speed.",
      impactEstimate: "Maintains high operational baseline.",
      evidence: {
        metrics: {
          healthScore: telemetry.healthScore,
          avgCompletionHours: s.avgCompletionHours,
        },
      },
    });
  }

  const executiveSummary = `Operations Health Score: ${telemetry.healthScore}/100 over the last ${telemetry.windowDays} days (${s.totalOrdersInWindow} orders, ${s.completedOrdersInWindow} completed, ฿${s.totalRevenueInWindow.toLocaleString()} revenue, avg completion ${s.avgCompletionHours}h). Active pipeline holds ${s.activeOrdersNow} orders with ${s.stuckOrdersNow} stuck/stale, ${s.overdueDeliveryNow} past scheduled delivery, ${s.csoPaidShopUnpaid} CSO-paid/Shop-unpaid gaps, and ${s.customerComplaintsInWindow} customer complaints logged.`;

  return { executiveSummary, insights };
}
