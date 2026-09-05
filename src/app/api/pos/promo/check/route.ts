import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PROMO_BASE = process.env.TLS_PROMO_API_BASE || "https://thatlaundryshop.com";
const PROMO_KEY  = process.env.TLS_PROMO_API_KEY  || "tls_pos_secret_key_dev_2026";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, orderTotal, customerId, customerPhone, customerName, currentJobId } = body;

    const promoCode = (code || "").trim().toUpperCase();
    if (!promoCode) {
      return NextResponse.json({ valid: false, error: "กรุณาระบุรหัสส่วนลด" }, { status: 400 });
    }

    // 1. Anti-Reuse Validation: Check if this customer has already used this promo code in any non-canceled job
    const searchConditions: any[] = [];
    if (customerId) searchConditions.push({ customerId });
    if (customerPhone && typeof customerPhone === "string" && customerPhone.trim()) {
      searchConditions.push({ customerPhone: customerPhone.trim() });
    }
    if (customerName && typeof customerName === "string" && customerName.trim()) {
      searchConditions.push({ customerName: { equals: customerName.trim(), mode: "insensitive" } });
    }

    if (searchConditions.length > 0) {
      const existingJob = await prisma.job.findFirst({
        where: {
          status: { not: "cancel" },
          ...(currentJobId ? { id: { not: currentJobId } } : {}),
          OR: searchConditions,
          remark: {
            contains: `Promo: ${promoCode} (`,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          billNo: true,
          createdAt: true,
        },
      });

      if (existingJob) {
        const refNo = existingJob.billNo || existingJob.id;
        return NextResponse.json({
          valid: false,
          error: `ลูกค้ารายนี้เคยใช้โค้ด ${promoCode} ไปแล้ว (บิล #${refNo}) ไม่สามารถใช้ซ้ำได้`,
        }, { status: 200 });
      }
    }

    // 2. Forward to upstream promo server for validity & discount calculation
    const upstream = await fetch(`${PROMO_BASE}/api/pos/promo/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tls-pos-key": PROMO_KEY,
      },
      body: JSON.stringify({ code: promoCode, orderTotal }),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: any) {
    console.error("[PromoProxy/check]", err);
    return NextResponse.json({ valid: false, error: "ไม่สามารถเชื่อมต่อระบบโปรโมชั่นได้" }, { status: 502 });
  }
}
