import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordWiseJobPaymentAction } from "@/actions/wise";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Wise Webhook Listener",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const eventType = payload.event_type || payload.eventType;
    console.log(`[Wise Webhook] Received event: ${eventType}`);

    if (eventType === "balances#credit" || eventType === "transfers#state-change") {
      const data = payload.data || {};
      const amount = parseFloat(data.amount) || 0;
      const currency = data.currency || "THB";
      const reference = (data.payment_reference || data.reference || "").trim();
      const transferId = data.resource?.id || data.transfer_id || data.id || undefined;
      const senderName = data.sender_name || data.senderName || "Wise Webhook";

      console.log(`[Wise Webhook] Credit: ${amount} ${currency}, Ref: "${reference}", TransferId: ${transferId}`);

      let matchedJob: any = null;

      // 1. Try matching by reference (Bill No / Job ID)
      if (reference) {
        matchedJob = await prisma.job.findFirst({
          where: {
            OR: [
              { id: reference },
              { id: { startsWith: reference } },
              { billNo: { contains: reference, mode: "insensitive" } },
            ],
            isPaid: false,
          },
        });
      }

      // 2. If not matched by reference, try matching by exact amount on pending Wise jobs in last 6 hours
      if (!matchedJob && amount > 0) {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        matchedJob = await prisma.job.findFirst({
          where: {
            isPaid: false,
            paymentChannel: { contains: "wise", mode: "insensitive" },
            totalAmount: amount,
            updatedAt: { gte: sixHoursAgo },
          },
          orderBy: { updatedAt: "desc" },
        });
      }

      if (matchedJob) {
        const recordRes = await recordWiseJobPaymentAction({
          jobId: matchedJob.id,
          paidAmount: amount || matchedJob.totalAmount || 0,
          senderName,
          transferId: transferId ? String(transferId) : undefined,
          reference: reference || matchedJob.billNo || matchedJob.id,
        });

        if (recordRes.success) {
          console.log(`[Wise Webhook] Successfully marked Job ${matchedJob.billNo || matchedJob.id} as PAID!`);
          return NextResponse.json({ success: true, matchedJobId: matchedJob.id });
        } else {
          return NextResponse.json({ error: recordRes.error }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, message: "Event received" });
  } catch (err: any) {
    console.error("[Wise Webhook] Error:", err);
    return NextResponse.json({ error: err.message || "Webhook processing error" }, { status: 500 });
  }
}
