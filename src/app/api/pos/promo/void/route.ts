import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PROMO_BASE = process.env.TLS_PROMO_API_BASE || "https://thatlaundryshop.com";
const PROMO_KEY  = process.env.TLS_PROMO_API_KEY  || "tls_pos_live_4cd242ae264a906fd734de04396617407bdb59f74d67bcac";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, receiptNo } = body;
    const promoCode = (code || "").trim().toUpperCase();

    // 1. Restore local CustomerCoupon to ACTIVE if it was marked as USED
    if (promoCode) {
      const localCoupon = await prisma.customerCoupon.findFirst({
        where: {
          code: { equals: promoCode, mode: "insensitive" },
          status: "USED",
        },
      });

      if (localCoupon) {
        await prisma.customerCoupon.update({
          where: { id: localCoupon.id },
          data: {
            status: "ACTIVE",
            usedAt: null,
            usedJobId: null,
          },
        });
        console.log(`[CustomerCoupon/void] Successfully restored ${promoCode} to ACTIVE`);
        return NextResponse.json({ success: true, isCustomerCoupon: true });
      }
    }

    // 2. Otherwise forward to upstream marketing server
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
