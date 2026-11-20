import crypto from "crypto";
import { NextResponse } from "next/server";
import { runAutoAssignLiveOnServer } from "@/lib/auto-assign-live-runner";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAutoAssignLiveOnServer();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
