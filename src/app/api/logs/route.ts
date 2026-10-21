import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user } = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Valid staff session required" }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Forbidden: Account is deactivated" }, { status: 403 });
  }
  const role = (user.role || "").toLowerCase();
  if (role === "rider") {
    return NextResponse.json({ error: "Forbidden: Riders cannot access system activity logs" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const userId = searchParams.get("userId");
  const entityId = searchParams.get("entityId");

  const whereClause: any = {};

  if (start && end) {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    whereClause.createdAt = {
      gte: startDate,
      lte: endDate,
    };
  }

  if (userId) {
    whereClause.userId = userId;
  }

  if (entityId) {
    whereClause.entityId = { contains: entityId, mode: "insensitive" };
  }

  const q = searchParams.get("q");

  try {
    const branchScopeCustomer =
      user.allowedBranchIds !== "ALL"
        ? { OR: [{ branchId: { in: user.allowedBranchIds } }, { branchId: null }] }
        : {};
    const branchScopeJob =
      user.allowedBranchIds !== "ALL"
        ? { OR: [{ branchId: { in: user.allowedBranchIds } }, { branchId: null }] }
        : {};

    if (q) {
      const matchedCustomers = await prisma.customer.findMany({
        where: {
          AND: [
            branchScopeCustomer,
            {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { memberId: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      const matchedCustIds = matchedCustomers.map((c) => c.id);

      const matchedJobs = await prisma.job.findMany({
        where: {
          AND: [
            branchScopeJob,
            {
              OR: [
                { customerName: { contains: q, mode: "insensitive" } },
                { customerPhone: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      const matchedJobIds = matchedJobs.map((j) => j.id);

      const allTargetIds = Array.from(new Set([...matchedCustIds, ...matchedJobIds]));

      whereClause.OR = [
        { entityId: { contains: q, mode: "insensitive" } },
        { userName: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { details: { contains: q, mode: "insensitive" } },
        ...(allTargetIds.length > 0 ? [{ entityId: { in: allTargetIds } }] : []),
      ];
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam) || 200), 1000) : q ? 500 : 200;

    const logs = await prisma.activityLog.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const jobIds = logs.filter((l) => l.entityType === "job").map((l) => l.entityId);
    const custIds = logs.filter((l) => l.entityType === "customer").map((l) => l.entityId);

    const [jobs, customers, riders, users] = await Promise.all([
      prisma.job.findMany({
        where: { AND: [{ id: { in: jobIds } }, branchScopeJob] },
        select: { id: true, customerName: true },
      }),
      prisma.customer.findMany({
        where: { AND: [{ id: { in: custIds } }, branchScopeCustomer] },
        select: { id: true, name: true },
      }),
      prisma.rider.findMany({
        select: { id: true, name: true, nickname: true },
      }),
      prisma.adminUser.findMany({
        select: { id: true, name: true },
      }),
    ]);

    const jobMap = new Map(jobs.map((j) => [j.id, j.customerName]));
    const custMap = new Map(customers.map((c) => [c.id, c.name]));
    const riderMap: Record<string, string> = {};
    riders.forEach((r) => {
      riderMap[r.id] = r.nickname ? `${r.name} (${r.nickname})` : r.name;
    });
    users.forEach((u) => {
      if (!riderMap[u.id]) riderMap[u.id] = u.name;
    });

    const logsWithCustomer = logs.map((log) => {
      let cName = null;
      if (log.entityType === "job") {
        cName = jobMap.get(log.entityId) || null;
      } else if (log.entityType === "customer") {
        cName = custMap.get(log.entityId) || null;
      }
      return {
        ...log,
        customerName: cName,
        userName: log.userName || (log.userId ? riderMap[log.userId] || null : null),
      };
    });

    return NextResponse.json({
      logs: logsWithCustomer,
      riders: riderMap,
    });
  } catch (error) {
    console.error("Failed to fetch activity logs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
