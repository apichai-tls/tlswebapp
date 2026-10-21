import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestUser, buildJobAuthWhereClause } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { user } = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Valid staff session required" }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Forbidden: Account is deactivated" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const requestedRiderId = searchParams.get("riderId");
  const role = (user.role || "").toLowerCase();

  // Riders can only query their own historical jobs
  if (role === "rider" && requestedRiderId && requestedRiderId !== user.id) {
    return NextResponse.json({ error: "Forbidden: Riders can only view their own job history" }, { status: 403 });
  }
  const riderId = role === "rider" ? user.id : requestedRiderId;

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
  }

  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  try {
    const dateRangeCondition = {
      OR: [
        { createdAt: { gte: startDate, lte: endDate } },
        { shopPaidAt: { gte: startDate, lte: endDate } },
        { csoPaidAt: { gte: startDate, lte: endDate } },
      ],
    };

    const andConditions: any[] = [dateRangeCondition];

    if (riderId) {
      andConditions.push({
        OR: [
          { pickupRiderId: riderId },
          { deliveryRiderId: riderId },
          { riderId: riderId },
        ],
      });
    }

    const authWhere = buildJobAuthWhereClause(user);
    if (authWhere) {
      andConditions.push(authWhere);
    }

    const whereClause: any = andConditions.length === 1 ? andConditions[0] : { AND: andConditions };

    const jobs = await prisma.job.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        type: true,
        customerId: true,
        customerName: true,
        customerPhone: true,
        pickupLocation: true,
        dropoffLocation: true,
        pickupLat: true,
        pickupLng: true,
        dropoffLat: true,
        dropoffLng: true,
        distance: true,
        fee: true,
        status: true,
        subStatus: true,
        createdAt: true,
        updatedAt: true,
        scheduledAt: true,
        completedAt: true,
        riderId: true,
        serviceType: true,
        laundryTypes: true,
        source: true,
        totalAmount: true,
        paymentMethod: true,
        discount: true,
        discountPercent: true,
        pickupDistance: true,
        deliveryDistance: true,
        deliveryRiderId: true,
        pickupRiderId: true,
        pickupCommission: true,
        deliveryCommission: true,
        pickupScheduledAt: true,
        pickupScheduledEndAt: true,
        deliveryScheduledAt: true,
        deliveryScheduledEndAt: true,
        remark: true,
        itemsJson: true,
        legsJson: true,
        adminNotesJson: role === "rider" ? false : true,
        bagImageUrl: true,
        billImageUrl: true,
        pickupProofImageUrl: true,
        deliveryProofImageUrl: true,
        branchId: true,
        paymentChannel: true,
        isPaid: true,
        createdBy: true,
        cashPlaced: true,
        isStuck: true,
        shiftId: true,
        billNo: true,
        isShopPaid: true,
        csoPaidAt: true,
        shopPaidAt: true,
        proformaNumber: true,
        proformaRevision: true,
        proformaCartHash: true,
        refundId: true,
        refundedFromId: true,
        walletBalanceAfter: true,
      },
    });

    const mappedJobs = jobs.map((j) => ({
      ...j,
      laundryTypes: j.laundryTypes ? j.laundryTypes.split(",") : [],
      items: j.itemsJson ? JSON.parse(j.itemsJson) : [],
      legs: j.legsJson ? JSON.parse(j.legsJson) : undefined,
      pickupCoords: { lat: j.pickupLat, lng: j.pickupLng },
      dropoffCoords: { lat: j.dropoffLat, lng: j.dropoffLng },
    }));

    return NextResponse.json(mappedJobs);
  } catch (error) {
    console.error("Failed to fetch historical jobs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
