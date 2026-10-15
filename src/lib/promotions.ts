/**
 * Promotion Engine & Extensible Campaign System
 * TLS POS & CRM
 */

export interface PromotionCampaign {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string (End of coupon issuance)
  rewardCouponExpiryDate: string; // ISO date string (End of coupon validity)
  conditions: {
    minOrderSubtotal: number;       // e.g. 1000 THB
    excludeDeliveryFee: boolean;     // e.g. true
    excludeCorporate: boolean;       // e.g. true
    limitPerCustomer: number;        // e.g. 1 (Max 1 per customer)
    requiredServiceCategories?: string[]; // null or empty = any laundry
    eligibleBrands?: string[];
  };
  reward: {
    couponName: string;
    codePrefix: string;
    discountType: 'FIXED' | 'PERCENTAGE' | 'FREE_DELIVERY' | 'CASH_VOUCHER';
    discountValue: number;
    applicableCategory?: string | null; // e.g. "SHOES"
    minOrderAmount?: number | null;     // No min spend when redeeming
    maxDiscount?: number | null;
  };
}

export const DEFAULT_PROMOTION_CAMPAIGNS: PromotionCampaign[] = [
  {
    id: "promo_shoe100_oct26",
    name: "ซักครบ 1,000 รับวอยเชอร์ลดค่าซักรองเท้า 100 บาท",
    description: "โปรโมชั่นซักครบ 1,000 บาท (ไม่รวมค่ารับส่ง) รับวอยเชอร์ส่วนลดซักรองเท้า 100 บาท แจก 19/10/2026 ถึง 28/10/2026 ใช้ได้ถึง 31/12/2026 (จำกัด 1 สิทธิ์/ท่าน)",
    enabled: true,
    startDate: "2026-10-19T00:00:00.000Z",
    endDate: "2026-10-28T23:59:59.999Z",
    rewardCouponExpiryDate: "2026-12-31T23:59:59.999Z",
    conditions: {
      minOrderSubtotal: 1000,
      excludeDeliveryFee: true,
      excludeCorporate: true,
      limitPerCustomer: 1, // Option B: max 1 per customer
      eligibleBrands: ["that_laundry_shop", "noname_laundry"],
    },
    reward: {
      couponName: "ส่วนลดซักรองเท้า 100 บาท (โปรซักครบ 1,000)",
      codePrefix: "SHOE",
      discountType: "FIXED",
      discountValue: 100,
      applicableCategory: "SHOES",
      minOrderAmount: null,
    },
  },
];

/**
 * Checks if a specific item belongs to a target category (e.g. "SHOES")
 */
export function isItemMatchingCategory(
  item: { name?: string | null; nameEn?: string | null; category?: string | null; serviceId?: string | null; id?: string | null },
  targetCategory: string
): boolean {
  if (!targetCategory) return true;
  const upperTarget = targetCategory.trim().toUpperCase();

  const itemCat = (item.category || "").trim().toUpperCase();
  if (itemCat === upperTarget) return true;

  const sid = (item.serviceId || item.id || "").toUpperCase();
  const name = (item.name || "").toLowerCase();
  const nameEn = (item.nameEn || "").toLowerCase();

  if (upperTarget === "SHOES" || upperTarget === "SHOE") {
    if (sid.startsWith("SHO-") || sid.startsWith("SHOE-")) return true;
    if (name.includes("รองเท้า") || name.includes("shoe") || name.includes("sneaker")) return true;
    if (nameEn.includes("shoe") || nameEn.includes("sneaker")) return true;
    return false;
  }

  if (upperTarget === "DRY CLEAN") {
    if (sid.startsWith("DRY-")) return true;
    if (name.includes("ซักแห้ง") || name.includes("dry clean")) return true;
    return false;
  }

  if (upperTarget === "IRON") {
    if (sid.startsWith("IRO-")) return true;
    if (name.includes("รีด") || name.includes("iron")) return true;
    return false;
  }

  if (upperTarget === "KILO") {
    if (sid.startsWith("KIL-")) return true;
    if (name.includes("ซักพับ") || name.includes("kilo") || name.includes("wash/fold")) return true;
    return false;
  }

  if (upperTarget === "LINENS") {
    if (sid.startsWith("LIN-")) return true;
    if (name.includes("เครื่องนอน") || name.includes("ผ้าม่าน") || name.includes("linen") || name.includes("curtain")) return true;
    return false;
  }

  return false;
}

/**
 * Generate a unique coupon code with prefix and random alphanumeric string
 * e.g. SHOE100-8K2N
 */
export function generateCouponCode(prefix: string = "COUPON"): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude 0, 1, I, O for clarity
  let randomPart = "";
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const cleanPrefix = prefix.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `${cleanPrefix}-${randomPart}`;
}
