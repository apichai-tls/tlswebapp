import crypto from "crypto";
import { NextResponse } from "next/server";
import { checkAndSendManagementTelegramAlerts } from "@/lib/ai-brain/telegram-alerts";

export const dynamic = "force-dynamic";

function verifyCronToken(request: Request): boolean {
  const expectedToken = (process.env.CRON_SECRET || "TLSUpdateDeliveryCron6497!").trim();
  if (!expectedToken) return false;

  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const headerToken = request.headers.get("x-cron-secret")?.trim();
  const queryToken = searchParams.get("token")?.trim();
  const suppliedToken = bearerToken || headerToken || queryToken || "";

  if (!suppliedToken || suppliedToken.length !== expectedToken.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(expectedToken));
}

export async function GET(request: Request) {
  if (!verifyCronToken(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";

    const result = await checkAndSendManagementTelegramAlerts({ force });
    return NextResponse.json({
      success: result.success,
      sent: result.sent,
      notifiedCount: result.notifiedCount,
      skippedReason: result.skippedReason || null,
      totalIssues: result.summary.totalIssues,
      breakdown: {
        deliveryOverdue: result.summary.deliveryOverdueCount,
        processingDelay: result.summary.processingDelayCount,
        pickupOverdue: result.summary.pickupOverdueCount,
        stuckOrders: result.summary.stuckOrdersCount,
        urgentTasks: result.summary.urgentTasksCount,
      },
      error: result.error || null,
    });
  } catch (err: any) {
    console.error("[cron/ops-alerts] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to evaluate ops alerts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
