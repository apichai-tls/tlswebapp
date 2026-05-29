import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  
  if (!start || !end) {
    return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
  }

  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);

  try {
    const jobs = await prisma.job.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        }
      },
      orderBy: { id: 'desc' },
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
        scheduledAt: true,
        completedAt: true,
        riderId: true,
        serviceType: true,
        source: true,
        totalAmount: true,
        paymentMethod: true,
        discount: true,
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
        adminNotesJson: true,
        bagImageUrl: true,
        billImageUrl: true,
        pickupProofImageUrl: true,
        deliveryProofImageUrl: true,
        branchId: true,
        paymentChannel: true,
        isPaid: true,
        createdBy: true,
      }
    });
    
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Failed to fetch historical jobs:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
