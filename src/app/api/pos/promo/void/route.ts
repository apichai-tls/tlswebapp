import { NextRequest, NextResponse } from "next/server";

const PROMO_BASE = process.env.TLS_PROMO_API_BASE || "https://thatlaundryshop.com";
const PROMO_KEY  = process.env.TLS_PROMO_API_KEY  || "tls_pos_secret_key_dev_2026";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const upstream = await fetch(`${PROMO_BASE}/api/pos/promo/void`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tls-pos-key": PROMO_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: any) {
    console.error("[PromoProxy/void]", err);
    return NextResponse.json({ success: false, error: "ไม่สามารถเชื่อมต่อระบบโปรโมชั่นได้" }, { status: 502 });
  }
}
