/**
 * Promotion Engine & Extensible Campaign System
 * TLS POS & CRM
 */

export type CampaignMode = "ISSUE_COUPON" | "INSTANT_DISCOUNT";
export type InstantDiscountMode = "SPECIAL_UNIT_PRICE" | "DISCOUNT_PER_UNIT" | "FIXED" | "PERCENTAGE";

export interface InstantRuleConfig {
  promoCode: string;                 // e.g. "WIF120"
  autoApply: boolean;                // e.g. true (auto-applies when cart meets conditions)
  targetServiceId?: string | null;   // e.g. "KIL-WIR-002" (WASH/IRON) or null for category/all
  targetServiceName?: string | null; // e.g. "WASH/IRON"
  targetCategory?: string | null;    // e.g. "KILO"
  minQuantity: number;               // e.g. 4 (Min 4 Kg)
  maxQuantity?: number | null;       // Optional max Kg cap
  discountMode: InstantDiscountMode; // e.g. "SPECIAL_UNIT_PRICE"
  promoUnitPrice?: number | null;    // e.g. 120 (120 THB/Kg)
  discountValue: number;             // Fallback or explicit discount value (e.g. 39 THB/Kg or fixed/%)
  disallowMemberWallet?: boolean;    // true = Member can join, but CANNOT pay via Deduct Member Wallet
}

export interface PromotionCampaign {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  campaignMode?: CampaignMode; // default "ISSUE_COUPON"
  startDate: string; // ISO date string
  endDate: string;   // ISO date string (End of campaign / coupon issuance)
  rewardCouponExpiryDate?: string; // ISO date string (End of coupon validity if FIXED_DATE)
  rewardCouponExpiryType?: "RELATIVE_DAYS" | "FIXED_DATE"; // default "RELATIVE_DAYS"
  rewardCouponValidityDays?: number; // e.g. 30 days from issuance
  conditions: {
    minOrderSubtotal: number;       // e.g. 1000 THB
    excludeDeliveryFee: boolean;     // e.g. true
    excludeCorporate: boolean;       // e.g. true
    excludeMember?: boolean;         // true = member not eligible
    excludeVIP?: boolean;            // true = VIP not eligible
    allowGeneral?: boolean;          // true = general walk-in eligible (default true)
    allowMember?: boolean;           // true = member eligible (default true)
    allowVIP?: boolean;              // true = VIP eligible (default true)
    allowCorporate?: boolean;        // true = corporate eligible (default false)
    disallowMemberWallet?: boolean;  // true = member cannot pay with Deduct Member credit
    limitPerCustomer: number;        // e.g. 1 (Max 1 per customer)
    requiredServiceCategories?: string[]; // null or empty = any laundry
    eligibleBrands?: string[];
  };
  instantRule?: InstantRuleConfig;
  reward: {
    templateId?: string;
    couponName: string;
    codePrefix: string;
    discountType: 'FIXED' | 'PERCENTAGE' | 'FREE_DELIVERY' | 'CASH_VOUCHER';
    discountValue: number;
    applicableCategory?: string | null; // e.g. "SHOES"
    minOrderAmount?: number | null;     // No min spend when redeeming
    maxDiscount?: number | null;
  };
  updatedAt?: string;
}

export const DEFAULT_PROMOTION_CAMPAIGNS: PromotionCampaign[] = [
  {
    id: "promo_wif120_nov26",
    name: "11.11 Wash Iron Fold 120 บาท/Kg (ขั้นต่ำ 4 Kg)",
    description: "โปรโมชั่น 11.11 ซัก อบ รีด พับ (WASH/IRON) ราคาพิเศษ 120 บาท/Kg จากปกติ 159 บาท/Kg เมื่อใช้บริการขั้นต่ำ 4 Kg ขึ้นไป (11–12 พ.ย. 2026, จำกัด 1 สิทธิ์/ท่าน, ลูกค้าสมาชิกร่วมรายการได้โดยชำระเงินสด/โอน/บัตร ไม่ใช้ Deduct Member)",
    enabled: true,
    campaignMode: "INSTANT_DISCOUNT",
    startDate: "2026-11-11",
    endDate: "2026-11-12",
    conditions: {
      minOrderSubtotal: 0,
      excludeDeliveryFee: true,
      excludeCorporate: true,
      allowGeneral: true,
      allowMember: true,
      allowVIP: true,
      allowCorporate: false,
      disallowMemberWallet: true,
      limitPerCustomer: 1,
      eligibleBrands: ["that_laundry_shop", "noname_laundry"],
    },
    instantRule: {
      promoCode: "WIF120",
      autoApply: true,
      targetServiceId: "KIL-WIR-002",
      targetServiceName: "WASH/IRON",
      targetCategory: "KILO",
      minQuantity: 4,
      maxQuantity: null,
      discountMode: "SPECIAL_UNIT_PRICE",
      promoUnitPrice: 120,
      discountValue: 39,
      disallowMemberWallet: true,
    },
    reward: {
      couponName: "ส่วนลด Wash Iron Fold เหลือ 120 บาท/Kg",
      codePrefix: "WIF120",
      discountType: "FIXED",
      discountValue: 39,
      applicableCategory: "KILO",
      minOrderAmount: null,
    },
  },
  {
    id: "promo_shoe100_oct26",
    name: "ซักครบ 1,000 รับวอยเชอร์ลดค่าซักรองเท้า 100 บาท",
    description: "โปรโมชั่นซักครบ 1,000 บาท (ไม่รวมค่ารับส่ง) รับวอยเชอร์ส่วนลดซักรองเท้า 100 บาท แจก 19/10/2026 ถึง 28/10/2026 ใช้ได้ถึง 31/12/2026 (จำกัด 1 สิทธิ์/ท่าน)",
    enabled: true,
    campaignMode: "ISSUE_COUPON",
    startDate: "2026-10-19T00:00:00.000Z",
    endDate: "2026-10-28T23:59:59.999Z",
    rewardCouponExpiryDate: "2026-12-31",
    conditions: {
      minOrderSubtotal: 1000,
      excludeDeliveryFee: true,
      excludeCorporate: true,
      limitPerCustomer: 1, // Option B: max 1 per customer
      eligibleBrands: ["that_laundry_shop", "noname_laundry"],
    },
    reward: {
      couponName: "ส่วนลดซักรองเท้า 100 บาท (โปรซักครบ 1,000)",
      codePrefix: "SHOE100",
      discountType: "FIXED",
      discountValue: 100,
      applicableCategory: "SHOES",
      minOrderAmount: null,
    },
  },
];

export const PROMO_SERVICE_CATEGORIES = [
  { id: "ALL", label: "ทุกหมวดบริการซักรีด (All Services)", labelEn: "All Laundry Services", icon: "✨" },
  { id: "SHOES", label: "ซักรองเท้า (Shoe Cleaning)", labelEn: "Shoe Cleaning", icon: "👟" },
  { id: "DRY CLEAN", label: "ซักแห้ง (Dry Clean)", labelEn: "Dry Clean", icon: "👔" },
  { id: "LINENS", label: "เครื่องนอน / ผ้าม่าน (Linens & Curtains)", labelEn: "Linens & Curtains", icon: "🛏️" },
  { id: "KILO", label: "ซักอบพับ (Wash & Fold)", labelEn: "Wash & Fold", icon: "🧺" },
  { id: "IRON", label: "รีดผ้า (Ironing)", labelEn: "Ironing", icon: "💨" },
] as const;

export function getCategoryLabel(category?: string | null, lang: string = "th"): string {
  if (!category || category.toUpperCase() === "ALL") {
    return lang === "en" ? "All Services" : "ทุกบริการ";
  }
  const upper = category.trim().toUpperCase();
  const found = PROMO_SERVICE_CATEGORIES.find(c => c.id === upper);
  if (found) {
    return lang === "en" ? found.labelEn : found.label;
  }
  return category;
}

export function getCategoryIcon(category?: string | null): string {
  if (!category || category.toUpperCase() === "ALL") return "✨";
  const upper = category.trim().toUpperCase();
  const found = PROMO_SERVICE_CATEGORIES.find(c => c.id === upper);
  return found?.icon || "🏷️";
}

/**
 * Resolves the effective category for a coupon or voucher.
 * If applicableCategory is explicitly set and not "ALL", returns it.
 * Otherwise inspects code and name for well-known prefixes or keywords (e.g. SHOE -> "SHOES").
 */
export function resolveEffectiveCategory(coupon?: {
  applicableCategory?: string | null;
  code?: string | null;
  name?: string | null;
} | null): string | null {
  if (!coupon) return null;
  if (coupon.applicableCategory && coupon.applicableCategory.toUpperCase() !== "ALL") {
    return coupon.applicableCategory.toUpperCase().trim();
  }
  const code = (coupon.code || "").toUpperCase();
  const name = (coupon.name || "").toLowerCase();

  if (code.startsWith("SHOE") || name.includes("รองเท้า") || name.includes("shoe")) {
    return "SHOES";
  }
  if (code.startsWith("DRY") || name.includes("ซักแห้ง") || name.includes("dry clean")) {
    return "DRY CLEAN";
  }
  if (code.startsWith("LINEN") || name.includes("เครื่องนอน") || name.includes("ผ้าม่าน")) {
    return "LINENS";
  }
  if (code.startsWith("IRON") || name.includes("รีด")) {
    return "IRON";
  }
  if (code.startsWith("KILO") || name.includes("ซักพับ") || name.includes("wash/fold")) {
    return "KILO";
  }
  return null;
}

/**
 * Checks if a specific item belongs to a target category (e.g. "SHOES")
 */
export function isItemMatchingCategory(
  item: { name?: string | null; nameEn?: string | null; category?: string | null; serviceId?: string | null; id?: string | null },
  targetCategory?: string | null
): boolean {
  if (!targetCategory) return true;
  const upperTarget = targetCategory.trim().toUpperCase();
  if (upperTarget === "ALL") return true;

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

/**
 * Checks if a cart item matches an Instant Discount Campaign's target service or category.
 */
export function isItemMatchingInstantCampaign(
  item: { id?: string | null; serviceId?: string | null; name?: string | null; nameEn?: string | null; category?: string | null },
  campaign: PromotionCampaign
): boolean {
  const rule = campaign.instantRule;
  if (!rule) return false;

  const sid = (item.serviceId || item.id || "").trim().toUpperCase();
  const name = (item.name || "").trim().toUpperCase();
  const nameEn = (item.nameEn || "").trim().toUpperCase();

  // 1. Specific Service ID match (e.g. "KIL-WIR-002")
  if (rule.targetServiceId && rule.targetServiceId !== "ALL") {
    const targetSid = rule.targetServiceId.trim().toUpperCase();
    if (sid === targetSid) return true;
    if (rule.targetServiceName) {
      const targetName = rule.targetServiceName.trim().toUpperCase();
      if (name === targetName || nameEn === targetName) return true;
    }
    return false;
  }

  // 2. Service Name match if specified without ID
  if (rule.targetServiceName && rule.targetServiceName !== "ALL") {
    const targetName = rule.targetServiceName.trim().toUpperCase();
    if (name === targetName || nameEn === targetName || name.includes(targetName) || nameEn.includes(targetName)) {
      return true;
    }
    return false;
  }

  // 3. Category match
  if (rule.targetCategory && rule.targetCategory !== "ALL") {
    return isItemMatchingCategory(item, rule.targetCategory);
  }

  return true;
}

/**
 * Computes the instant discount amount for a cart under a given INSTANT_DISCOUNT campaign.
 */
export function calculateInstantCampaignDiscount(
  items: Array<{ id?: string | null; serviceId?: string | null; name?: string | null; nameEn?: string | null; category?: string | null; price?: number; quantity?: number }>,
  campaign: PromotionCampaign
): {
  matchedQuantity: number;
  eligibleQuantity: number;
  matchedSubtotal: number;
  discountAmount: number;
  meetsMinQuantity: boolean;
} {
  const rule = campaign.instantRule;
  if (!rule || !Array.isArray(items) || items.length === 0) {
    return { matchedQuantity: 0, eligibleQuantity: 0, matchedSubtotal: 0, discountAmount: 0, meetsMinQuantity: false };
  }

  const matchingItems = items.filter((it) => isItemMatchingInstantCampaign(it, campaign));
  const matchedQuantity = matchingItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const matchedSubtotal = matchingItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);

  const minQty = Number(rule.minQuantity) || 0;
  const meetsMinQuantity = matchedQuantity >= minQty && matchedQuantity > 0;

  if (!meetsMinQuantity) {
    return {
      matchedQuantity,
      eligibleQuantity: 0,
      matchedSubtotal,
      discountAmount: 0,
      meetsMinQuantity: false,
    };
  }

  const maxQty = rule.maxQuantity && Number(rule.maxQuantity) > 0 ? Number(rule.maxQuantity) : null;
  let remainingCap = maxQty != null ? maxQty : Infinity;
  let discountAmount = 0;

  if (rule.discountMode === "SPECIAL_UNIT_PRICE") {
    const targetPromoPrice = Number(rule.promoUnitPrice) || 0;
    for (const it of matchingItems) {
      if (remainingCap <= 0) break;
      const qty = Math.min(Number(it.quantity) || 0, remainingCap);
      const unitPrice = Number(it.price) || 0;
      const diffPerUnit = Math.max(0, unitPrice - targetPromoPrice);
      discountAmount += diffPerUnit * qty;
      remainingCap -= qty;
    }
  } else if (rule.discountMode === "DISCOUNT_PER_UNIT") {
    const discPerUnit = Number(rule.discountValue) || 0;
    const eligibleQty = maxQty != null ? Math.min(matchedQuantity, maxQty) : matchedQuantity;
    discountAmount = Math.min(matchedSubtotal, discPerUnit * eligibleQty);
  } else if (rule.discountMode === "PERCENTAGE") {
    const pct = Number(rule.discountValue) || 0;
    discountAmount = (matchedSubtotal * pct) / 100;
    if (campaign.reward?.maxDiscount && campaign.reward.maxDiscount > 0) {
      discountAmount = Math.min(discountAmount, campaign.reward.maxDiscount);
    }
  } else {
    // FIXED
    discountAmount = Math.min(matchedSubtotal, Number(rule.discountValue) || 0);
  }

  discountAmount = Math.round(Math.max(0, Math.min(discountAmount, matchedSubtotal)) * 100) / 100;
  const eligibleQuantity = maxQty != null ? Math.min(matchedQuantity, maxQty) : matchedQuantity;

  return {
    matchedQuantity,
    eligibleQuantity,
    matchedSubtotal,
    discountAmount,
    meetsMinQuantity: true,
  };
}

