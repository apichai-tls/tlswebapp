import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const SETTING_KEY = "marketing_tracking_links";

function detectDevice(userAgent: string): "ios" | "android" | "desktop" | "other" {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/windows|macintosh|linux/.test(ua) && !/mobile/.test(ua)) return "desktop";
  return "other";
}

function detectReferrer(ref: string | null): string {
  if (!ref) return "direct_qr";
  const r = ref.toLowerCase();
  if (r.includes("line")) return "line";
  if (r.includes("facebook") || r.includes("fb.me")) return "facebook";
  if (r.includes("instagram")) return "instagram";
  if (r.includes("tiktok")) return "tiktok";
  if (r.includes("google")) return "google";
  return "web_referral";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    if (!code) {
      return NextResponse.redirect(new URL("/", req.url), 302);
    }

    const setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!setting?.value) {
      return NextResponse.redirect(new URL("/", req.url), 302);
    }

    let links: any[] = [];
    try {
      links = JSON.parse(setting.value);
    } catch {
      return NextResponse.redirect(new URL("/", req.url), 302);
    }

    const targetSlug = code.trim().toLowerCase();
    const linkIndex = links.findIndex(
      (l) => l.slug?.toLowerCase() === targetSlug
    );

    if (linkIndex === -1) {
      // Link not found
      return new NextResponse(
        `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>Link Not Found - That Laundry Shop</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; padding: 20px; }
              .card { background: white; padding: 40px 30px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 420px; width: 100%; }
              h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; color: #0f172a; }
              p { font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 24px; }
              a { display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Link Not Found (ไม่พบลิงก์นี้)</h1>
              <p>The short link or QR code you scanned does not exist or may have expired.<br/>(ลิงก์หรือ QR Code นี้ไม่มีในระบบหรืออาจหมดอายุแล้ว)</p>
              <a href="/">Go to Home (กลับหน้าหลัก)</a>
            </div>
          </body>
        </html>`,
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const link = links[linkIndex];

    if (!link.isActive) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>Campaign Paused</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; padding: 20px; }
              .card { background: white; padding: 40px 30px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 420px; width: 100%; }
              h1 { font-size: 22px; font-weight: 800; margin-bottom: 8px; color: #0f172a; }
              p { font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 24px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Campaign Paused (แคมเปญถูกระงับชั่วคราว)</h1>
              <p>This promotional link has been temporarily paused by the organizer.<br/>(ลิงก์โปรโมชั่นนี้ถูกระงับชั่วคราวโดยผู้ดูแลระบบ)</p>
            </div>
          </body>
        </html>`,
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // Record Stats Asynchronously
    const userAgent = req.headers.get("user-agent") || "";
    const referrer = detectReferrer(req.headers.get("referer"));
    const device = detectDevice(userAgent);

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const ipHash = crypto
      .createHash("md5")
      .update(clientIp + userAgent)
      .digest("hex")
      .substring(0, 12);

    const now = new Date().toISOString();

    const newLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: now,
      ipHash,
      device,
      referrer,
    };

    // Update click count & logs
    link.totalClicks = (link.totalClicks || 0) + 1;
    link.lastClickedAt = now;

    if (!Array.isArray(link.clickLogs)) link.clickLogs = [];
    link.clickLogs.unshift(newLog);

    // Keep max 500 recent logs per link to keep storage clean
    if (link.clickLogs.length > 500) {
      link.clickLogs = link.clickLogs.slice(0, 500);
    }

    // Calculate Unique Clicks based on distinct ipHash
    const uniqueHashes = new Set(link.clickLogs.map((l: any) => l.ipHash));
    link.uniqueClicks = uniqueHashes.size;

    links[linkIndex] = link;

    // Save updated analytics back to DB
    prisma.setting
      .upsert({
        where: { key: SETTING_KEY },
        update: { value: JSON.stringify(links) },
        create: { key: SETTING_KEY, value: JSON.stringify(links) },
      })
      .catch((err) => console.error("Error saving link click stats:", err));

    // Ensure targetUrl has protocol
    let finalTarget = link.targetUrl.trim();
    if (!/^https?:\/\//i.test(finalTarget)) {
      finalTarget = "https://" + finalTarget;
    }

    // Perform Fast 307 Redirect
    return NextResponse.redirect(finalTarget, 307);
  } catch (error: any) {
    console.error("Redirect tracking error:", error);
    return NextResponse.redirect(new URL("/", req.url), 302);
  }
}
