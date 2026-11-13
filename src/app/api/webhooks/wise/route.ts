import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchWiseRecentTransactionsInternal,
  recordWiseJobPaymentInternal,
} from "@/lib/wise-internal";
import { checkRateLimit, getRequestClientIp } from "@/lib/rate-limit";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Wise Webhook Listener",
    timestamp: new Date().toISOString(),
  });
}

function verifyWiseWebhookSecret(req: NextRequest): boolean {
  const configured = (process.env.WISE_WEBHOOK_SECRET || "").trim();
  if (!configured) return false;
  const headerSecret =
    req.headers.get("x-wise-webhook-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (!headerSecret || headerSecret.length !== configured.length) return false;
  return crypto.timingSafeEqual(Buffer.from(headerSecret), Buffer.from(configured));
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = getRequestClientIp(req);
    const rate = checkRateLimit(`wise-webhook:${clientIp}`, 30, 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const eventType = payload.event_type || payload.eventType;

    if (eventType === "balances#credit" || eventType === "transfers#state-change") {
      const data = payload.data || {};
      const rawAmount = parseFloat(data.amount) || 0;
      const reference = String(data.payment_reference || data.reference || "").trim();
      const transferId = data.resource?.id || data.transfer_id || data.id || undefined;
      const senderName = String(data.sender_name || data.senderName || "Wise Webhook");

      // Prevent unauthenticated payment spoofing:
      // Require either a configured shared secret OR cross-verification against Wise's live API
      const hasSecretAuth = verifyWiseWebhookSecret(req);
      let verifiedAmount = rawAmount;
      let verifiedReference = reference;
      let verifiedTransferId = transferId ? String(transferId) : undefined;
      let verifiedSenderName = senderName;

      if (!hasSecretAuth) {
        const liveWise = await fetchWiseRecentTransactionsInternal(48);
        if (!liveWise.success || !liveWise.activities || liveWise.activities.length === 0) {
          return NextResponse.json(
            { error: "Unable to cross-verify webhook event against Wise API" },
            { status: 401 }
          );
        }

        const matchedTx = liveWise.activities.find((tx) => {
          if (tx.isIncoming === false) return false;
          if (
            verifiedTransferId &&
            ((tx.id && String(tx.id) === verifiedTransferId) ||
              (tx.resourceId && String(tx.resourceId) === verifiedTransferId))
          ) {
            return true;
          }
          const amountMatches =
            rawAmount > 0 && Math.abs(Number(tx.amount) - rawAmount) <= 1.0;
          if (!amountMatches) return false;
          if (reference) {
            const txRef = `${tx.reference || ""} ${tx.senderName || ""}`.toLowerCase();
            return txRef.includes(reference.toLowerCase());
          }
          return true;
        });

        if (!matchedTx) {
          return NextResponse.json(
            { error: "Rejected: No matching verified Wise credit found" },
            { status: 401 }
          );
        }

        verifiedAmount = matchedTx.amount;
        verifiedReference = matchedTx.reference || reference;
        verifiedTransferId = matchedTx.resourceId || matchedTx.id || verifiedTransferId;
        verifiedSenderName = matchedTx.senderName || senderName;
      }

      let matchedJob: any = null;

      // 1. Try matching by exact reference (Bill No / Job ID)
      if (verifiedReference && verifiedReference.length >= 4) {
        matchedJob = await prisma.job.findFirst({
          where: {
            OR: [
              { id: verifiedReference },
              { billNo: { equals: verifiedReference, mode: "insensitive" } },
            ],
            isPaid: false,
          },
        });
      }

      // 2. If not matched by reference, match by exact amount on pending Wise jobs in last 6 hours (only if unique)
      if (!matchedJob && verifiedAmount > 0) {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const candidates = await prisma.job.findMany({
          where: {
            isPaid: false,
            paymentChannel: { contains: "wise", mode: "insensitive" },
            totalAmount: verifiedAmount,
            updatedAt: { gte: sixHoursAgo },
          },
          orderBy: { updatedAt: "desc" },
          take: 2,
        });
        if (candidates.length === 1) {
          matchedJob = candidates[0];
        }
      }

      if (matchedJob) {
        const recordRes = await recordWiseJobPaymentInternal({
          jobId: matchedJob.id,
          paidAmount: verifiedAmount || matchedJob.totalAmount || 0,
          senderName: verifiedSenderName,
          transferId: verifiedTransferId,
          reference: verifiedReference || matchedJob.billNo || matchedJob.id,
        });

        if (recordRes.success) {
          return NextResponse.json({ success: true, matchedJobId: matchedJob.id });
        } else {
          return NextResponse.json({ error: recordRes.error }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, message: "Event received" });
  } catch (err: any) {
    console.error("[Wise Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
