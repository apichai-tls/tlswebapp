import { prisma } from "@/lib/prisma";

export interface BusinessStudyCorpus {
  generatedAt: string;
  windowDays: number;
  organization: {
    branches: Array<{
      id: string;
      name: string;
      area: string;
      isPosEnabled: boolean;
      noCommission: boolean;
      staffCount: number;
      riderCount: number;
    }>;
    departments: Array<{
      key: string;
      name: string;
      nameTh: string | null;
      staffCount: number;
      heads: string[];
    }>;
    roles: Array<{
      key: string;
      name: string;
      nameTh: string | null;
      staffCount: number;
    }>;
    totalActiveStaff: number;
    totalActiveRiders: number;
  };
  catalog: {
    totalServiceItems: number;
    serviceCategories: Array<{
      category: string;
      itemCount: number;
      avgPrice: number;
      avgMemberPrice: number;
      sampleItems: string[];
    }>;
    priceLists: Array<{ name: string; isDefault: boolean }>;
    activeVoucherCampaigns: Array<{
      name: string;
      discountType: string;
      discountValue: number;
      applicableCategory: string | null;
      issuedReason: string | null;
      count: number;
    }>;
  };
  orderPatterns: {
    totalJobsInWindow: number;
    brandBreakdown: Record<string, number>;
    sourceBreakdown: Record<string, number>;
    statusBreakdown: Record<string, number>;
    subStatusBreakdown: Record<string, number>;
    paymentMethodBreakdown: Record<string, number>;
    paymentChannelBreakdown: Record<string, number>;
    serviceTypeBreakdown: Record<string, number>;
    laundryTypeBreakdown: Record<string, number>;
    branchJobCounts: Array<{ branchName: string; count: number; avgOrderValue: number }>;
    sampleJobRemarks: string[];
    sampleAdminNotes: string[];
  };
  customerProfile: {
    totalCustomers: number;
    memberCount: number;
    vipCount: number;
    corporateCount: number;
    languageBreakdown: Record<string, number>;
    sourceSystemBreakdown: Record<string, number>;
    sampleCustomerRemarks: string[];
  };
  staffAndCustomerComms: {
    totalTasksInWindow: number;
    taskStatusBreakdown: Record<string, number>;
    sampleTaskConversations: Array<{
      title: string;
      status: string;
      priority: string;
      description: string | null;
      jobId: string | null;
      notes: Array<{ author: string; text: string }>;
    }>;
    recentContactRequests: Array<{ message: string; status: string }>;
    recentBookings: Array<{ service: string; status: string }>;
  };
  operationsAudit: {
    topActivityActions: Array<{ entityType: string; action: string; count: number }>;
    recentRefundReasons: Array<{ reason: string; refundChannel: string; count: number }>;
    walletTxTypes: Record<string, number>;
    sampleWalletPackages: string[];
    shiftCountInWindow: number;
  };
}

function incrementMap(map: Record<string, number>, key: string | null | undefined, fallback = "Unknown") {
  const k = (key || "").trim() || fallback;
  map[k] = (map[k] || 0) + 1;
}

function cleanSnippet(text: string | null | undefined, maxLen = 220): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\[META:[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
}

export async function collectBusinessStudyCorpus(windowDays = 30): Promise<BusinessStudyCorpus> {
  const days = Math.max(7, Math.min(90, Math.round(windowDays || 30)));
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [
    branches,
    departments,
    roles,
    staff,
    riders,
    serviceItems,
    priceLists,
    vouchers,
    jobs,
    customersTotal,
    customersMember,
    customersVip,
    customersCorp,
    recentCustomers,
    tasks,
    contactRequests,
    bookings,
    activityLogs,
    refunds,
    walletTxs,
    shiftCount,
  ] = await Promise.all([
    prisma.shopLocation.findMany({
      select: { id: true, name: true, area: true, isPosEnabled: true, noCommission: true },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { key: true, name: true, nameTh: true },
    }),
    prisma.roleDefinition.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { key: true, name: true, nameTh: true },
    }),
    prisma.adminUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, department: true, branchId: true, isDepartmentHead: true },
    }),
    prisma.rider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, branchId: true },
    }),
    prisma.serviceItem.findMany({
      select: { name: true, nameEn: true, category: true, price: true, memberPrice: true, unit: true },
    }),
    prisma.priceList.findMany({
      select: { name: true, isDefault: true },
    }),
    prisma.customerVoucher.findMany({
      take: 150,
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        discountType: true,
        discountValue: true,
        applicableCategory: true,
        issuedReason: true,
      },
    }),
    prisma.job.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 600,
      select: {
        id: true,
        brand: true,
        source: true,
        status: true,
        subStatus: true,
        paymentMethod: true,
        paymentChannel: true,
        serviceType: true,
        laundryTypes: true,
        branchId: true,
        totalAmount: true,
        remark: true,
        adminNotesJson: true,
      },
    }),
    prisma.customer.count(),
    prisma.customer.count({ where: { isMember: true } }),
    prisma.customer.count({ where: { isVIP: true } }),
    prisma.customer.count({ where: { isCorporate: true } }),
    prisma.customer.findMany({
      orderBy: { updatedAt: "desc" },
      take: 250,
      select: { language: true, sourceSystem: true, remark: true },
    }),
    prisma.task.findMany({
      where: { isArchived: false, createdAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 120,
      select: {
        title: true,
        description: true,
        status: true,
        priority: true,
        jobId: true,
        notesJson: true,
      },
    }),
    prisma.contactRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { message: true, status: true },
    }),
    prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { service: true, status: true },
    }),
    prisma.activityLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { entityType: true, action: true },
    }),
    prisma.jobRefund.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { reason: true, refundChannel: true },
    }),
    prisma.walletTransaction.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { type: true, packageName: true },
    }),
    prisma.cashierShift.count({
      where: { openedAt: { gte: since } },
    }),
  ]);

  const branchNameMap = new Map(branches.map((b) => [b.id, b.name]));

  // Organization summary
  const orgBranches = branches.map((b) => ({
    id: b.id,
    name: b.name,
    area: b.area,
    isPosEnabled: b.isPosEnabled,
    noCommission: b.noCommission,
    staffCount: staff.filter((s) => s.branchId === b.id).length,
    riderCount: riders.filter((r) => r.branchId === b.id).length,
  }));

  const orgDepartments = departments.map((d) => {
    const members = staff.filter((s) => (s.department || "").toLowerCase() === d.key.toLowerCase());
    return {
      key: d.key,
      name: d.name,
      nameTh: d.nameTh,
      staffCount: members.length,
      heads: members.filter((m) => m.isDepartmentHead).map((m) => m.name),
    };
  });

  const orgRoles = roles.map((r) => ({
    key: r.key,
    name: r.name,
    nameTh: r.nameTh,
    staffCount: staff.filter((s) => (s.role || "").toLowerCase() === r.key.toLowerCase()).length,
  }));

  // Catalog summary
  const catMap = new Map<
    string,
    { count: number; priceSum: number; memberSum: number; samples: string[] }
  >();
  for (const item of serviceItems) {
    const cat = (item.category || "General").trim();
    const entry = catMap.get(cat) || { count: 0, priceSum: 0, memberSum: 0, samples: [] };
    entry.count++;
    entry.priceSum += Number(item.price || 0);
    entry.memberSum += Number(item.memberPrice || 0);
    if (entry.samples.length < 5) {
      const label = item.nameEn ? `${item.name} (${item.nameEn})` : item.name;
      entry.samples.push(`${label} ฿${item.price}/${item.memberPrice}`);
    }
    catMap.set(cat, entry);
  }
  const serviceCategories = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      itemCount: v.count,
      avgPrice: Math.round(v.priceSum / Math.max(1, v.count)),
      avgMemberPrice: Math.round(v.memberSum / Math.max(1, v.count)),
      sampleItems: v.samples,
    }))
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, 15);

  const voucherMap = new Map<
    string,
    {
      name: string;
      discountType: string;
      discountValue: number;
      applicableCategory: string | null;
      issuedReason: string | null;
      count: number;
    }
  >();
  for (const v of vouchers) {
    const key = `${v.name}|${v.discountType}|${v.discountValue}`;
    const existing = voucherMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      voucherMap.set(key, { ...v, count: 1 });
    }
  }
  const activeVoucherCampaigns = Array.from(voucherMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Order patterns
  const brandBreakdown: Record<string, number> = {};
  const sourceBreakdown: Record<string, number> = {};
  const statusBreakdown: Record<string, number> = {};
  const subStatusBreakdown: Record<string, number> = {};
  const paymentMethodBreakdown: Record<string, number> = {};
  const paymentChannelBreakdown: Record<string, number> = {};
  const serviceTypeBreakdown: Record<string, number> = {};
  const laundryTypeBreakdown: Record<string, number> = {};
  const branchAgg = new Map<string, { count: number; totalSum: number }>();
  const sampleJobRemarks: string[] = [];
  const sampleAdminNotes: string[] = [];

  for (const j of jobs) {
    incrementMap(brandBreakdown, j.brand, "that_laundry_shop");
    incrementMap(sourceBreakdown, j.source, "Direct");
    incrementMap(statusBreakdown, j.status, "unknown");
    if (j.subStatus) incrementMap(subStatusBreakdown, j.subStatus);
    if (j.paymentMethod) incrementMap(paymentMethodBreakdown, j.paymentMethod);
    if (j.paymentChannel) incrementMap(paymentChannelBreakdown, j.paymentChannel);
    if (j.serviceType) incrementMap(serviceTypeBreakdown, j.serviceType);
    if (j.laundryTypes) {
      for (const lt of j.laundryTypes.split(",").map((x) => x.trim()).filter(Boolean)) {
        incrementMap(laundryTypeBreakdown, lt);
      }
    }

    const bName = (j.branchId && branchNameMap.get(j.branchId)) || "Unassigned";
    const bEntry = branchAgg.get(bName) || { count: 0, totalSum: 0 };
    bEntry.count++;
    bEntry.totalSum += Number(j.totalAmount || 0);
    branchAgg.set(bName, bEntry);

    if (sampleJobRemarks.length < 20) {
      const r = cleanSnippet(j.remark, 160);
      if (r && !sampleJobRemarks.includes(r)) sampleJobRemarks.push(r);
    }

    if (sampleAdminNotes.length < 25 && j.adminNotesJson) {
      try {
        const parsed = JSON.parse(j.adminNotesJson);
        if (Array.isArray(parsed)) {
          for (const n of parsed.slice(-2)) {
            const txt = cleanSnippet(typeof n === "string" ? n : n?.text || n?.note || n?.message, 180);
            if (txt && sampleAdminNotes.length < 25) {
              const author = typeof n === "object" && n?.author ? `${n.author}: ` : "";
              sampleAdminNotes.push(`${author}${txt}`);
            }
          }
        }
      } catch {
        // ignore malformed json
      }
    }
  }

  const branchJobCounts = Array.from(branchAgg.entries())
    .map(([branchName, v]) => ({
      branchName,
      count: v.count,
      avgOrderValue: Math.round(v.totalSum / Math.max(1, v.count)),
    }))
    .sort((a, b) => b.count - a.count);

  // Customer profile
  const languageBreakdown: Record<string, number> = {};
  const sourceSystemBreakdown: Record<string, number> = {};
  const sampleCustomerRemarks: string[] = [];
  for (const c of recentCustomers) {
    incrementMap(languageBreakdown, c.language, "Unspecified");
    incrementMap(sourceSystemBreakdown, c.sourceSystem, "pos_store");
    if (sampleCustomerRemarks.length < 15) {
      const r = cleanSnippet(c.remark, 150);
      if (r && !sampleCustomerRemarks.includes(r)) sampleCustomerRemarks.push(r);
    }
  }

  // Tasks & internal/customer conversations
  const taskStatusBreakdown: Record<string, number> = {};
  const sampleTaskConversations: BusinessStudyCorpus["staffAndCustomerComms"]["sampleTaskConversations"] = [];

  for (const t of tasks) {
    incrementMap(taskStatusBreakdown, t.status, "todo");
    if (sampleTaskConversations.length < 25) {
      const notes: Array<{ author: string; text: string }> = [];
      if (t.notesJson) {
        try {
          const parsed = JSON.parse(t.notesJson);
          if (Array.isArray(parsed)) {
            for (const n of parsed.slice(-4)) {
              const txt = cleanSnippet(n?.text || n?.content || n?.message, 220);
              if (txt) {
                notes.push({
                  author: String(n?.authorName || n?.author || "Staff"),
                  text: txt,
                });
              }
            }
          }
        } catch {
          // ignore
        }
      }
      sampleTaskConversations.push({
        title: cleanSnippet(t.title, 120) || t.title,
        status: t.status,
        priority: t.priority,
        description: cleanSnippet(t.description, 200),
        jobId: t.jobId,
        notes,
      });
    }
  }

  // Activity logs
  const actMap = new Map<string, { entityType: string; action: string; count: number }>();
  for (const a of activityLogs) {
    const key = `${a.entityType}|${a.action}`;
    const existing = actMap.get(key);
    if (existing) existing.count++;
    else actMap.set(key, { entityType: a.entityType, action: a.action, count: 1 });
  }
  const topActivityActions = Array.from(actMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Refunds
  const refMap = new Map<string, { reason: string; refundChannel: string; count: number }>();
  for (const r of refunds) {
    const reasonClean = cleanSnippet(r.reason, 120) || "Unspecified";
    const key = `${reasonClean}|${r.refundChannel}`;
    const existing = refMap.get(key);
    if (existing) existing.count++;
    else refMap.set(key, { reason: reasonClean, refundChannel: r.refundChannel, count: 1 });
  }
  const recentRefundReasons = Array.from(refMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Wallet
  const walletTxTypes: Record<string, number> = {};
  const walletPackageSet = new Set<string>();
  for (const w of walletTxs) {
    incrementMap(walletTxTypes, w.type, "OTHER");
    if (w.packageName && walletPackageSet.size < 10) {
      walletPackageSet.add(w.packageName.trim());
    }
  }

  return {
    generatedAt: now.toISOString(),
    windowDays: days,
    organization: {
      branches: orgBranches,
      departments: orgDepartments,
      roles: orgRoles,
      totalActiveStaff: staff.length,
      totalActiveRiders: riders.length,
    },
    catalog: {
      totalServiceItems: serviceItems.length,
      serviceCategories,
      priceLists,
      activeVoucherCampaigns,
    },
    orderPatterns: {
      totalJobsInWindow: jobs.length,
      brandBreakdown,
      sourceBreakdown,
      statusBreakdown,
      subStatusBreakdown,
      paymentMethodBreakdown,
      paymentChannelBreakdown,
      serviceTypeBreakdown,
      laundryTypeBreakdown,
      branchJobCounts,
      sampleJobRemarks,
      sampleAdminNotes,
    },
    customerProfile: {
      totalCustomers: customersTotal,
      memberCount: customersMember,
      vipCount: customersVip,
      corporateCount: customersCorp,
      languageBreakdown,
      sourceSystemBreakdown,
      sampleCustomerRemarks,
    },
    staffAndCustomerComms: {
      totalTasksInWindow: tasks.length,
      taskStatusBreakdown,
      sampleTaskConversations,
      recentContactRequests: contactRequests
        .map((c) => ({ message: cleanSnippet(c.message, 180) || "", status: c.status }))
        .filter((c) => Boolean(c.message)),
      recentBookings: bookings.map((b) => ({ service: b.service, status: b.status })),
    },
    operationsAudit: {
      topActivityActions,
      recentRefundReasons,
      walletTxTypes,
      sampleWalletPackages: Array.from(walletPackageSet),
      shiftCountInWindow: shiftCount,
    },
  };
}
