import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  runDeepHealthAudit,
  sendDeepHealthAuditToTelegram,
} from "@/lib/ai-brain/deep-health-audit";

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
    const notify = searchParams.get("notify") !== "0";

    const audit = await runDeepHealthAudit();
    let telegramSent = false;
    let telegramError: string | null = null;

    if (notify) {
      const tg = await sendDeepHealthAuditToTelegram(audit, {
        websiteStatus: "API Healthy (HTTP 200)",
      });
      telegramSent = tg.ok;
      telegramError = tg.error || null;
    }

    return NextResponse.json({
      success: true,
      telegramSent,
      telegramError,
      audit,
    });
  } catch (err: any) {
    console.error("[cron/deep-health-check] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Deep health check failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
