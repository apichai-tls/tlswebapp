import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PROMO_BASE = process.env.TLS_PROMO_API_BASE || "https://thatlaundryshop.com";
const PROMO_KEY  = process.env.TLS_PROMO_API_KEY  || "tls_pos_live_4cd242ae264a906fd734de04396617407bdb59f74d67bcac";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, orderTotal, customerId, customerPhone, customerName, currentJobId } = body;

    const promoCode = (code || "").trim().toUpperCase();
    if (!promoCode) {
      return NextResponse.json({ valid: false, error: "กรุณาระบุรหัสส่วนลด" }, { status: 400 });
    }

    // 1. Check if this is a CustomerCoupon in the local database
    const localCoupon = await prisma.customerCoupon.findFirst({
      where: {
        code: { equals: promoCode, mode: "insensitive" },
      },
      include: {
        customer: true,
      },
    });

    if (localCoupon) {
      const now = new Date();
      if (localCoupon.status === "USED") {
        return NextResponse.json({
          valid: false,
          error: `คูปองนี้ถูกใช้งานไปแล้ว${localCoupon.usedJobId ? ` (บิล #${localCoupon.usedJobId})` : ""}`,
        }, { status: 200 });
      }

      if (localCoupon.status === "VOID") {
        return NextResponse.json({ valid: false, error: "คูปองนี้ถูกยกเลิกการใช้งานแล้ว (VOID)" }, { status: 200 });
      }

      if (localCoupon.status === "EXPIRED" || (localCoupon.expiryDate && new Date(localCoupon.expiryDate) < now)) {
        if (localCoupon.status !== "EXPIRED") {
          await prisma.customerCoupon.update({ where: { id: localCoupon.id }, data: { status: "EXPIRED" } }).catch(() => {});
        }
        return NextResponse.json({ valid: false, error: "คูปองนี้หมดอายุการใช้งานแล้ว" }, { status: 200 });
      }

      // Check customer matching if coupon was issued to a specific customer
      if (localCoupon.customerId) {
        const phoneDigits = (customerPhone || "").replace(/\D/g, "");
        const localCustPhoneDigits = (localCoupon.customerPhone || localCoupon.customer?.phone || "").replace(/\D/g, "");
        
        const matchesId = Boolean(customerId && localCoupon.customerId === customerId);
        const matchesPhone = Boolean(phoneDigits.length >= 8 && localCustPhoneDigits.length >= 8 && phoneDigits.slice(-8) === localCustPhoneDigits.slice(-8));

        if (customerId && !matchesId && !matchesPhone) {
          const ownerName = localCoupon.customerName || localCoupon.customer?.name || "ลูกค้าท่านอื่น";
          return NextResponse.json({
            valid: false,
            error: `คูปองนี้เป็นของลูกค้า "${ownerName}" เท่านั้น`,
          }, { status: 200 });
        }
      }

      // Check minimum order amount
      if (localCoupon.minOrderAmount != null && localCoupon.minOrderAmount > 0) {
        if ((orderTotal || 0) < localCoupon.minOrderAmount) {
          return NextResponse.json({
            valid: false,
            error: `ยอดสั่งซื้อขั้นต่ำสำหรับคูปองนี้คือ ฿${localCoupon.minOrderAmount.toLocaleString()} (ยอดปัจจุบัน ฿${(orderTotal || 0).toLocaleString()})`,
          }, { status: 200 });
        }
      }

      // Calculate discount amount
      let calcDiscount = 0;
      const isDeliveryOnly = localCoupon.discountType === "FREE_DELIVERY";
      const discountType = localCoupon.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
      const discountTarget = isDeliveryOnly ? "DELIVERY" : "ALL";

      if (isDeliveryOnly) {
        const feeVal = Number(body.deliveryFee) || 0;
        calcDiscount = feeVal > 0 ? (localCoupon.discountValue ? Math.min(localCoupon.discountValue, feeVal) : feeVal) : 0;
      } else if (localCoupon.discountType === "PERCENTAGE") {
        calcDiscount = ((orderTotal || 0) * localCoupon.discountValue) / 100;
        if (localCoupon.maxDiscount != null && localCoupon.maxDiscount > 0) {
          calcDiscount = Math.min(calcDiscount, localCoupon.maxDiscount);
        }
      } else {
        // FIXED or CASH_VOUCHER
        calcDiscount = Math.min(localCoupon.discountValue, orderTotal || 0);
      }
      calcDiscount = Math.round(calcDiscount * 100) / 100;

      return NextResponse.json({
        valid: true,
        isCustomerCoupon: true,
        couponId: localCoupon.id,
        code: localCoupon.code,
        name: localCoupon.name,
        description: localCoupon.description || localCoupon.name,
        discountType,
        discountTarget,
        discountValue: localCoupon.discountValue,
        discountAmount: calcDiscount,
        maxDiscount: localCoupon.maxDiscount ?? null,
        minOrderAmount: localCoupon.minOrderAmount ?? null,
      });
    }

    // 2. Anti-Reuse Validation for general marketing promo codes: Check if this customer has already used this promo code in any non-canceled job
    const searchConditions: any[] = [];
    if (customerId) {
      searchConditions.push({ customerId });
    }

    // Only match by phone if it contains at least 8 digits (ignoring placeholder/dummy numbers like '+66 --', '--', etc.)
    const phoneDigits = (customerPhone || "").replace(/\D/g, "");
    if (phoneDigits.length >= 8) {
      searchConditions.push({ customerPhone: customerPhone.trim() });
    }

    // Only fallback to customerName if customerId is NOT provided, avoiding collisions across different customers
    if (!customerId && customerName && typeof customerName === "string" && customerName.trim().length >= 3) {
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
