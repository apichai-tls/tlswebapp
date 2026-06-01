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

  try {
    const logs = await prisma.activityLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 1000 // Limit to 1000 recent logs to prevent huge payloads
    });
    
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Failed to fetch activity logs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
