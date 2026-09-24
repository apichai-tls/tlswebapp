import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanProformaNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  let cleaned = raw.trim();
  // Strip trailing repeated -R1, -R2, -R1-R1 suffixes
  cleaned = cleaned.replace(/(-R\d+)+$/i, "");
  // Replace invalid characters (brackets, parentheses etc.)
  cleaned = cleaned.replace(/[^A-Z0-9-]/gi, "");
  // Strip RF- if attached to PR- e.g. PR-RF-2026004284 -> PR-2026004284
  cleaned = cleaned.replace(/^PR-RF-/i, "PR-");
  // Collapse multiple hyphens
  cleaned = cleaned.replace(/-+/g, "-");
  return cleaned;
}

export function formatProformaNumber(rawBase: string | null | undefined, revision: number = 0): string {
  const cleanBase = cleanProformaNumber(rawBase);
  if (!cleanBase) return "PROFORMA";
  return revision > 0 ? `${cleanBase}-R${revision}` : cleanBase;
}

/**
 * Format a number as Thai Baht currency with two decimals.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "0.00";
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a job ID for display.
 * Handles RF- prefix, UUIDs (shows first 8 chars), and sequential annual IDs (shows full ID).
 * e.g. "RF-2026004284" -> "RF-2026004284"
 * e.g. "2026004284" -> "2026004284"
 * e.g. "891d5f55-xxxx" -> "891D5F55"
 * e.g. "RF-891d5f55-xxxx" -> "RF-891D5F55"
 */
export function formatJobDisplayId(id: string | null | undefined): string {
  if (!id) return "";
  const upper = String(id).toUpperCase();
  if (upper.startsWith("RF-")) {
    const withoutRf = upper.slice(3);
    const short = withoutRf.includes("-") ? withoutRf.split("-")[0] : withoutRf;
    return `RF-${short}`;
  }
  if (upper.startsWith("JOB-")) {
    return upper;
  }
  return upper.split("-")[0];
}

/**
 * Generate a receipt number from a job ID.
 * Format: RE-{jobId}  e.g. RE-2026002711
 */
export function generateReceiptNumber(jobId: string): string {
  return `RE-${jobId}`;
}

/**
 * Generate a proforma base number from a job ID.
 * Format: PR-{cleanJobId}  e.g. PR-2026002711 (always strips RF- prefix)
 * Append -R{n} with formatProformaNumber() when revision > 0.
 */
export function generateProformaBaseNumber(jobId: string): string {
  const cleanId = formatJobDisplayId(jobId).replace(/^RF-/i, "");
  return `PR-${cleanId}`;
}

/**
 * Compute a deterministic hash of the cart and order state to detect changes
 * between proforma revisions.
 */
export function computeCartHash(data: {
  items?: Array<{ id?: string; serviceId?: string; name?: string; quantity?: number; price?: number }>;
  serviceSpeed?: string | null;
  fee?: number;
  discountPercent?: number;
  promoCode?: string | null;
  promoDiscount?: number;
  vatType?: string | null;
  vatRate?: number;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAt?: string | Date | null;
}): string {
  const vatType = (data.vatType || "none").toLowerCase();
  const vatRate = vatType === "none" ? 0 : (Number(data.vatRate) || 0);

  return JSON.stringify({
    items: (data.items || [])
      .map(i => ({
        key: String(i.serviceId || i.name || i.id || "").trim(),
        qty: Number(i.quantity) || 1,
        price: Number(i.price) || 0,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    speed: data.serviceSpeed || "standard",
    fee: Number(data.fee) || 0,
    disc: Number(data.discountPercent) || 0,
    promo: data.promoCode ? `${data.promoCode}:${Number(data.promoDiscount) || 0}` : "",
    vatType,
    vatRate,
  });
}

/**
 * Global Top-Up sequence key stored in the Setting table.
 */
export const TOPUP_SEQ_KEY = "topUpSeq_global";

/**
 * Generate a Top-Up receipt number from a sequential counter.
 * Format: TU-{YYMM}-{00001}  e.g. TU-2608-00001
 */
export const generateTopUpReceiptNumber = (counter: number, date: Date = new Date()): string => {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(counter).padStart(5, '0');
  return `TU-${yy}${mm}-${seq}`;
};

/**
 * Global Credit Note sequence key stored in the Setting table.
 */
export const CREDIT_NOTE_SEQ_KEY = "creditNoteSeq_global";

/**
 * Generate a Credit Note number.
 * If a job/receipt ID is passed: Format: CN-{jobId} e.g. CN-2026004284
 * If a sequential counter is passed: Format: CN-{YYMM}-{00001} e.g. CN-2609-00001
 */
export const generateCreditNoteNumber = (counterOrJobId: number | string, date: Date = new Date()): string => {
  if (typeof counterOrJobId === "string") {
    const cleanId = formatJobDisplayId(counterOrJobId).replace(/^RF-/i, "");
    return `CN-${cleanId}`;
  }
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(counterOrJobId).padStart(5, '0');
  return `CN-${yy}${mm}-${seq}`;
};

export interface TransportFeeItem {
  name: string;
  nameTh: string;
  price: number;
  qty: number;
  total: number;
}

/**
 * Split or format delivery/pickup transport fee for receipt display.
 * If 2-way (full_service or default): splits final fee into Pickup Fee (50%) and Delivery Fee (50%).
 * If delivery-only or pickup-only: displays single line item.
 */
export function getTransportFeeBreakdown(deliveryFee?: number, jobType?: string): TransportFeeItem[] {
  const fee = Number(deliveryFee) || 0;
  if (fee <= 0) {
    return [];
  }

  if (jobType === "delivery") {
    return [
      { name: "Delivery Fee", nameTh: "ค่าจัดส่ง", price: fee, qty: 1, total: fee }
    ];
  }

  if (jobType === "pickup") {
    return [
      { name: "Pickup Fee", nameTh: "ค่าบริการรับผ้า", price: fee, qty: 1, total: fee }
    ];
  }

  // Default for 2-way jobs (full_service or default): Split fee by 2
  const pickupAmount = Math.round((fee / 2) * 100) / 100;
  const deliveryAmount = Math.round((fee - pickupAmount) * 100) / 100;

  return [
    { name: "Pickup Fee", nameTh: "ค่าบริการรับผ้า", price: pickupAmount, qty: 1, total: pickupAmount },
    { name: "Delivery Fee", nameTh: "ค่าบริการจัดส่งผ้า", price: deliveryAmount, qty: 1, total: deliveryAmount },
  ];
}

/**
 * Clean floating point arithmetic noise (e.g. 11.3 * 90 = 1017.0000000000001)
 * before rounding up with Math.ceil.
 */
export function safeCeil(val: number): number {
  if (isNaN(val) || !val) return 0;
  return Math.ceil(Math.round(val * 10000) / 10000);
}

/**
 * Calculate Wallet Expiration Date (6 months from given date, set to 23:59:59.999).
 */
export function calculateWalletExpiryDate(fromDate: Date = new Date()): Date {
  const expiry = new Date(fromDate);
  expiry.setMonth(expiry.getMonth() + 6);
  expiry.setHours(23, 59, 59, 999);
  return expiry;
}

/**
 * Check if customer's member wallet is expired.
 */
export function isWalletExpired(customer?: { memberExpiryDate?: Date | string | null; isMember?: boolean } | null): boolean {
  if (!customer || !customer.isMember) return false;
  if (!customer.memberExpiryDate) return false;
  const expiryTime = new Date(customer.memberExpiryDate).getTime();
  return expiryTime < Date.now();
}

export type WalletStatusType = 'active' | 'expiring_soon' | 'expired' | 'non_member';

/**
 * Get comprehensive wallet status and remaining days.
 */
export function getWalletStatus(customer?: { memberExpiryDate?: Date | string | null; isMember?: boolean; creditBalance?: number } | null): {
  status: WalletStatusType;
  daysRemaining: number;
  expiryDate: Date | null;
  isExpired: boolean;
} {
  if (!customer || !customer.isMember) {
    return { status: 'non_member', daysRemaining: 0, expiryDate: null, isExpired: false };
  }
  if (!customer.memberExpiryDate) {
    return { status: 'active', daysRemaining: 180, expiryDate: null, isExpired: false };
  }

  const expiry = new Date(customer.memberExpiryDate);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const isExpired = diffMs < 0;

  if (isExpired) {
    return { status: 'expired', daysRemaining: 0, expiryDate: expiry, isExpired: true };
  }
  if (daysRemaining <= 15) {
    return { status: 'expiring_soon', daysRemaining, expiryDate: expiry, isExpired: false };
  }
  return { status: 'active', daysRemaining, expiryDate: expiry, isExpired: false };
}

/**
 * Check if a job is fully paid based on isShopPaid, or adminNotesJson.payments >= totalAmount.
 */
export function isJobFullyPaid(job?: {
  isPaid?: boolean | null;
  isShopPaid?: boolean | null;
  totalAmount?: number | null;
  adminNotesJson?: string | null;
} | null): boolean {
  if (!job) return false;
  if (job.isShopPaid === true) return true;
  if (job.adminNotesJson) {
    try {
      const parsed = JSON.parse(job.adminNotesJson);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.payments) && parsed.payments.length > 0) {
        const totalPaid = parsed.payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
        const jobTotal = Number(job.totalAmount) || 0;
        if (totalPaid >= jobTotal && jobTotal > 0) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

/**
 * Checks whether a phone string represents a valid, real phone number
 * (i.e. not a dummy placeholder like '+66 --', '--', 'N/A', etc. and has at least 8 digits)
 */
export function isValidPhoneNumber(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (!trimmed || trimmed === "-" || trimmed === "--" || trimmed === "+66 --" || trimmed === "+66 -" || trimmed.toLowerCase() === "n/a" || trimmed.toLowerCase() === "null") return false;
  const digits = trimmed.replace(/\D/g, "");
  if (/^0+$/.test(digits)) return false; // reject dummy like "0000000000"
  return digits.length >= 8;
}

/**
 * Checks whether a phone string represents a valid Thai phone number.
 * (Starts with 0, +66, or 66, and has 9-10 digits)
 */
export function isThaiPhoneNumber(phone: string | null | undefined): boolean {
  if (!isValidPhoneNumber(phone)) return false;
  const trimmed = phone.trim();
  if (trimmed.startsWith("+66") || trimmed.startsWith("66")) return true;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("66") && (digits.length === 11 || digits.length === 10)) return true;
  if (digits.startsWith("0") && (digits.length === 9 || digits.length === 10)) return true;
  return false;
}

/**
 * Finds the best matching customer for a job or search parameters.
 * Prioritizes ID match (with name validation fallback), then Name match, then valid Phone/secondaryPhone match.
 */
export function findMatchingCustomer<T extends { id: string; name?: string | null; phone?: string | null; secondaryPhone?: string | null }>(
  customers: T[],
  lookup: { customerId?: string | null; customerName?: string | null; customerPhone?: string | null }
): T | null {
  if (!customers || customers.length === 0) return null;

  const targetId = lookup.customerId?.trim();
  const targetName = lookup.customerName?.trim().toLowerCase();
  const targetPhone = lookup.customerPhone?.trim();

  // 1. If customerId is provided, check if it matches
  if (targetId) {
    const byId = customers.find(c => c.id === targetId);
    if (byId) {
      // If no name is provided, or names match / overlap, use it
      const cName = (byId.name || "").trim().toLowerCase();
      if (!targetName || cName === targetName || targetName.includes(cName) || cName.includes(targetName)) {
        return byId;
      }
      // If customerId points to a completely mismatched name (e.g. MELISSA vs VIRAKUMARA LIE),
      // look for the customer by exact name first
      if (targetName) {
        const byName = customers.find(c => (c.name || "").trim().toLowerCase() === targetName);
        if (byName) return byName;
      }
      return byId;
    }
  }

  // 2. Match by exact Name
  if (targetName) {
    const byName = customers.find(c => (c.name || "").trim().toLowerCase() === targetName);
    if (byName) return byName;
  }

  // 3. Match by Phone or Secondary Phone (ONLY if phone is a valid real phone number)
  if (isValidPhoneNumber(targetPhone)) {
    const byPhone = customers.find(c => 
      (c.phone && c.phone.trim() === targetPhone) || 
      (c.secondaryPhone && c.secondaryPhone.trim() === targetPhone)
    );
    if (byPhone) return byPhone;
  }

  return null;
}

/**
 * Resolves the primary and secondary/alternate phone numbers for a customer/job.
 * In case customer has an international number and no Thai number, it looks for
 * secondaryPhone or address contactPhone to display.
 */
export function resolveCustomerPhones(params: {
  customerPhone?: string | null;
  customer?: {
    phone?: string | null;
    secondaryPhone?: string | null;
    isSecondaryWhatsapp?: boolean;
    addresses?: Array<{ contactPhone?: string | null }>;
  } | null;
}): {
  primaryPhone: string;
  secondaryPhone: string | null;
  hasThaiPhone: boolean;
  isIntlPrimary: boolean;
  isSecondaryWhatsapp: boolean;
} {
  const { customerPhone, customer } = params;

  const rawPhone = isValidPhoneNumber(customerPhone) ? customerPhone.trim() : "";
  const profilePhone = isValidPhoneNumber(customer?.phone) ? customer?.phone!.trim() : "";
  const secPhone = isValidPhoneNumber(customer?.secondaryPhone) ? customer?.secondaryPhone!.trim() : "";
  const addrPhone = customer?.addresses?.map(a => a.contactPhone?.trim()).find(p => isValidPhoneNumber(p)) || "";

  // 1. Candidate Thai phone:
  let thaiPhone = "";
  if (isThaiPhoneNumber(rawPhone)) thaiPhone = rawPhone;
  else if (isThaiPhoneNumber(profilePhone)) thaiPhone = profilePhone;
  else if (isThaiPhoneNumber(addrPhone)) thaiPhone = addrPhone;

  // 2. Candidate International/Other phone:
  let intlPhone = "";
  if (secPhone) intlPhone = secPhone;
  else if (rawPhone && !isThaiPhoneNumber(rawPhone)) intlPhone = rawPhone;
  else if (profilePhone && !isThaiPhoneNumber(profilePhone)) intlPhone = profilePhone;
  else if (addrPhone && !isThaiPhoneNumber(addrPhone)) intlPhone = addrPhone;

  // 3. Alternate phone (if different from primary)
  let alternatePhone: string | null = null;
  if (intlPhone && intlPhone !== thaiPhone) {
    alternatePhone = intlPhone;
  } else if (addrPhone && addrPhone !== thaiPhone) {
    alternatePhone = addrPhone;
  } else if (profilePhone && profilePhone !== thaiPhone) {
    alternatePhone = profilePhone;
  }

  // If customer has NO Thai phone:
  if (!thaiPhone) {
    const fallback = intlPhone || addrPhone || rawPhone || profilePhone || "";
    return {
      primaryPhone: fallback,
      secondaryPhone: (alternatePhone && alternatePhone !== fallback) ? alternatePhone : null,
      hasThaiPhone: false,
      isIntlPrimary: Boolean(fallback && !isThaiPhoneNumber(fallback)),
      isSecondaryWhatsapp: Boolean(customer?.isSecondaryWhatsapp),
    };
  }

  // Customer has Thai phone:
  return {
    primaryPhone: thaiPhone,
    secondaryPhone: alternatePhone,
    hasThaiPhone: true,
    isIntlPrimary: false,
    isSecondaryWhatsapp: Boolean(customer?.isSecondaryWhatsapp),
  };
}

/**
 * Checks whether a payment date falls on today or yesterday (in Thailand timezone UTC+7).
 */
export function isPaidTodayOrYesterday(paidAt: Date | string | number | null | undefined): boolean {
  if (!paidAt) return false;
  const targetDate = new Date(paidAt);
  if (isNaN(targetDate.getTime())) return false;

  // Convert current time to Thailand timezone (UTC+7)
  const nowUtc = Date.now();
  const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;
  const thTime = new Date(nowUtc + THAILAND_OFFSET_MS);

  // Start of yesterday in Thailand (00:00:00.000):
  const thYear = thTime.getUTCFullYear();
  const thMonth = thTime.getUTCMonth();
  const thDate = thTime.getUTCDate();

  // Midnight of yesterday in Thailand, converted back to UTC timestamp:
  const startOfYesterdayThUtc = Date.UTC(thYear, thMonth, thDate - 1, 0, 0, 0, 0) - THAILAND_OFFSET_MS;

  return targetDate.getTime() >= startOfYesterdayThUtc;
}

/**
 * Extracts the effective payment date from a Job object or adminNotesJson
 */
export function getJobPaymentDate(job: any): Date | null {
  if (!job) return null;
  if (job.csoPaidAt) return new Date(job.csoPaidAt);
  if (job.shopPaidAt) return new Date(job.shopPaidAt);
  if (job.adminNotesJson) {
    try {
      const parsed = typeof job.adminNotesJson === "string" ? JSON.parse(job.adminNotesJson) : job.adminNotesJson;
      if (Array.isArray(parsed?.payments) && parsed.payments.length > 0) {
        const lastPay = parsed.payments[parsed.payments.length - 1];
        if (lastPay?.timestamp) return new Date(lastPay.timestamp);
      }
    } catch {}
  }
  if (job.completedAt) return new Date(job.completedAt);
  if (job.updatedAt) return new Date(job.updatedAt);
  if (job.createdAt) return new Date(job.createdAt);
  return null;
}



