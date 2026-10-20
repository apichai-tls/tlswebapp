import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PROMO_BASE = process.env.TLS_PROMO_API_BASE || "https://thatlaundryshop.com";
const PROMO_KEY  = process.env.TLS_PROMO_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, receiptNo } = body;
    const promoCode = (code || "").trim().toUpperCase();

    // 1. Atomically restore local CustomerVoucher to ACTIVE if it was marked as USED for this job
    if (promoCode) {
      const localCoupon = await prisma.customerVoucher.findFirst({
        where: {
          code: { equals: promoCode, mode: "insensitive" },
        },
      });

      if (localCoupon) {
        const targetJobId = receiptNo ? String(receiptNo) : null;
        if (targetJobId && localCoupon.usedJobId && localCoupon.usedJobId !== targetJobId) {
          return NextResponse.json(
            {
              success: false,
              isCustomerCoupon: true,
              error: "คูปองนี้ถูกใช้กับออเดอร์อื่น ไม่สามารถยกเลิกข้ามใบงานได้ (Voucher is bound to a different order)",
            },
            { status: 409 }
          );
        }

        const restoreRes = await prisma.customerVoucher.updateMany({
          where: {
            id: localCoupon.id,
            status: "USED",
            ...(targetJobId && localCoupon.usedJobId ? { usedJobId: targetJobId } : {}),
          },
          data: {
            status: "ACTIVE",
            usedAt: null,
            usedJobId: null,
            discountAmountUsed: null,
          },
        });

        if (restoreRes.count > 0) {
          await prisma.activityLog.create({
            data: {
              entityId: localCoupon.customerId,
              entityType: "customer",
              action: "COUPON_RESTORED",
              details: JSON.stringify({
                couponId: localCoupon.id,
                code: localCoupon.code,
                reason: `Restored to ACTIVE on POS void/cancel (receiptNo: ${receiptNo || "N/A"})`,
              }),
              userId: null,
              userName: "POS System",
            },
          }).catch(() => {});

          console.log(`[CustomerVoucher/void] Successfully restored ${promoCode} to ACTIVE`);
        }
        return NextResponse.json({ success: true, isCustomerCoupon: true, restored: restoreRes.count > 0 });
      }
    }

    // 2. Otherwise forward to upstream marketing server
    const promoKey = process.env.TLS_PROMO_API_KEY || PROMO_KEY;
    if (!promoKey) {
      return NextResponse.json({ success: false, error: "Missing TLS_PROMO_API_KEY configuration" }, { status: 503 });
    }
    const upstream = await fetch(`${PROMO_BASE}/api/pos/promo/void`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tls-pos-key": promoKey,
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
