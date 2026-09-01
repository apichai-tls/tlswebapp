import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
    // support partial match for job ID
    whereClause.entityId = { contains: entityId, mode: 'insensitive' };
  }

  const q = searchParams.get("q");

  try {

    if (q) {
      // Find customers matching q by name, phone, or memberId
      const matchedCustomers = await prisma.customer.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
            { memberId: { contains: q, mode: 'insensitive' } },
          ]
        },
        select: { id: true }
      });
      const matchedCustIds = matchedCustomers.map(c => c.id);

      // Find jobs matching q by customerName or customerPhone
      const matchedJobs = await prisma.job.findMany({
        where: {
          OR: [
            { customerName: { contains: q, mode: 'insensitive' } },
            { customerPhone: { contains: q, mode: 'insensitive' } },
          ]
        },
        select: { id: true }
      });
      const matchedJobIds = matchedJobs.map(j => j.id);

      const allTargetIds = Array.from(new Set([...matchedCustIds, ...matchedJobIds]));

      whereClause.OR = [
        { entityId: { contains: q, mode: 'insensitive' } },
        { userName: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { details: { contains: q, mode: 'insensitive' } },
        ...(allTargetIds.length > 0 ? [{ entityId: { in: allTargetIds } }] : []),
      ];
    }

    const logs = await prisma.activityLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 1000 // Limit to 1000 recent logs to prevent huge payloads
    });


    const jobIds = logs.filter(l => l.entityType === 'job').map(l => l.entityId);
    const custIds = logs.filter(l => l.entityType === 'customer').map(l => l.entityId);

    const [jobs, customers] = await Promise.all([
      prisma.job.findMany({
        where: { id: { in: jobIds } },
        select: { id: true, customerName: true }
      }),
      prisma.customer.findMany({
        where: { id: { in: custIds } },
        select: { id: true, name: true }
      })
    ]);

    const jobMap = new Map(jobs.map(j => [j.id, j.customerName]));
    const custMap = new Map(customers.map(c => [c.id, c.name]));

    const logsWithCustomer = logs.map(log => {
      if (log.entityType === 'job') {
        return {
          ...log,
          customerName: jobMap.get(log.entityId) || null
        };
      }
      if (log.entityType === 'customer') {
        return {
          ...log,
          customerName: custMap.get(log.entityId) || null
        };
      }
      return log;
    });
    
    return NextResponse.json(logsWithCustomer);

  } catch (error) {
    console.error("Failed to fetch activity logs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
