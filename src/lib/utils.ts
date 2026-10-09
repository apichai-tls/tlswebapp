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
 * Format currency with Thai Baht sign, properly placing negative sign before the ฿ symbol.
 * e.g. -1549.00 -> "-฿1,549.00", 1549.00 -> "฿1,549.00"
 */
export function formatBaht(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "฿0.00";
  const abs = Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `-฿${abs}` : `฿${abs}`;
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
  if (upper.startsWith("JOB-") || upper.startsWith("NNL-")) {
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
 * Calculate Wallet Expiration Date (6 months minus 1 day from given date, set to 23:59:59.999).
 * E.g., Topup: 2026-10-01 -> Expiry: 2027-03-31 23:59:59.999
 */
export function calculateWalletExpiryDate(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  const targetMonth = date.getMonth() + 6;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const originalDay = date.getDate();
  const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const clampedDay = Math.min(originalDay, daysInTargetMonth);
  const expiry = new Date(targetYear, normalizedMonth, clampedDay);
  expiry.setDate(expiry.getDate() - 1);
  expiry.setHours(23, 59, 59, 999);
  return expiry;
}

/**
 * Compute membership expiry date (6 months minus 1 day from start date).
 * E.g., Start: 2026-10-07 -> Expiry: 2027-04-06
 */
export function computeMembershipExpiryDate(startDateInput: Date | string = new Date()): string {
  let date: Date;
  if (typeof startDateInput === 'string') {
    const parts = startDateInput.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      date = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      date = new Date(startDateInput);
    }
  } else {
    date = new Date(startDateInput);
  }
  if (isNaN(date.getTime())) return '';
  const expiry = calculateWalletExpiryDate(date);
  const yyyy = expiry.getFullYear();
  const mm = String(expiry.getMonth() + 1).padStart(2, '0');
  const dd = String(expiry.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
export interface JobPaymentEntry {
  id?: string;
  amount: number;
  channel?: string;
  method?: string;
  timestamp: string;
  shiftId?: string | null;
  paidBy?: string;
  slipUrl?: string | null;
  note?: string | null;
}

export interface JobPaymentBreakdown {
  total: number;
  totalPaid: number;
  remaining: number;
  isFullyPaid: boolean;
  isPartial: boolean;
  isSplit: boolean;
  payments: JobPaymentEntry[];
  channels: string[];
}

export function getJobPaymentBreakdown(job?: {
  totalAmount?: number | null;
  isPaid?: boolean | null;
  isShopPaid?: boolean | null;
  paymentChannel?: string | null;
  paymentMethod?: string | null;
  adminNotesJson?: string | null;
} | null): JobPaymentBreakdown {
  const total = Math.max(0, Number(job?.totalAmount) || 0);
  let payments: JobPaymentEntry[] = [];
  
  if (job?.adminNotesJson) {
    try {
      const parsed = typeof job.adminNotesJson === "string" ? JSON.parse(job.adminNotesJson) : job.adminNotesJson;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.payments)) {
        payments = parsed.payments
          .filter((p: any) => p && typeof p === "object" && Number(p.amount) > 0)
          .map((p: any) => ({
            id: p.id || undefined,
            amount: Number(p.amount) || 0,
            channel: p.channel || undefined,
            method: p.method || undefined,
            timestamp: p.timestamp || new Date().toISOString(),
            shiftId: p.shiftId || null,
            paidBy: p.paidBy || undefined,
            slipUrl: p.slipUrl || null,
            note: p.note || null,
          }));
      }
    } catch {}
  }
  
  let totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  
  // Fallback for legacy jobs marked paid without payments array
  if (payments.length === 0 && (job?.isShopPaid || job?.isPaid) && total > 0) {
    totalPaid = total;
    payments = [{
      amount: total,
      channel: job?.paymentChannel || "Unspecified",
      method: job?.paymentMethod || "cash",
      timestamp: new Date().toISOString(),
      paidBy: "Legacy Record",
    }];
  }

  const remaining = Math.max(0, Math.round((total - totalPaid) * 100) / 100);
  const isFullyPaid = (job?.isShopPaid === true) || (total > 0 && totalPaid >= total - 0.01);
  const isPartial = !isFullyPaid && totalPaid > 0 && remaining > 0;
  
  const channels = Array.from(new Set(payments.map(p => p.channel || p.method || "Unspecified").filter(Boolean)));
  const isSplit = channels.length > 1;

  return {
    total,
    totalPaid,
    remaining,
    isFullyPaid,
    isPartial,
    isSplit,
    payments,
    channels,
  };
}

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
 * Normalizes a Thai phone number into standard 10-digit mobile or 9-digit landline format.
 * Examples:
 * - "838181944" -> "0838181944"
 * - "+66 838181944" -> "0838181944"
 * - "+66 0855355636" -> "0855355636"
 * - "93-060-4517" -> "0930604517"
 * - "26901900" -> "026901900"
 */
export function normalizeThaiPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (trimmed === "-" || trimmed === "--" || trimmed === "+66 --" || trimmed.toLowerCase() === "n/a" || trimmed.toLowerCase() === "null") return "";

  const digits = trimmed.replace(/\D/g, "");
  // Malformed +66 08x... (12 digits)
  if (digits.startsWith("660") && digits.length >= 11) {
    return "0" + digits.slice(3);
  }
  // Standard +66 8x... (11 digits)
  if (digits.startsWith("66") && digits.length === 11) {
    return "0" + digits.slice(2);
  }
  // 9 digits starting with 6, 8, 9 (Thai mobile typed without leading 0)
  if (digits.length === 9 && /^[689]/.test(digits)) {
    return "0" + digits;
  }
  // 8 digits starting with 2, 3, 4, 5, 7 (Thai landline typed without leading 0)
  if (digits.length === 8 && /^[2-57]/.test(digits)) {
    return "0" + digits;
  }
  // Standard 10 digits starting with 0
  if (digits.length === 10 && digits.startsWith("0")) {
    return digits;
  }
  // Standard 9 digits landline starting with 0
  if (digits.length === 9 && digits.startsWith("0")) {
    return digits;
  }
  return trimmed;
}

/**
 * Checks whether a phone string represents a valid Thai phone number.
 * Supports:
 * - Starts with +66 or 66 (10-12 digits)
 * - Starts with 0 (9-10 digits)
 * - 9 digits starting with 6, 8, 9 (Thai mobile typed without leading 0)
 * - 8 digits starting with 2, 3, 4, 5, 7 (Thai landline typed without leading 0)
 */
export function isThaiPhoneNumber(phone: string | null | undefined): boolean {
  if (!isValidPhoneNumber(phone)) return false;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (/^0+$/.test(digits)) return false;

  if (trimmed.startsWith("+66") || trimmed.startsWith("66")) return true;
  if (digits.startsWith("66") && (digits.length === 10 || digits.length === 11 || digits.length === 12)) return true;
  if (digits.startsWith("0") && (digits.length === 9 || digits.length === 10)) return true;
  if (digits.length === 9 && /^[689]/.test(digits)) return true;
  if (digits.length === 8 && /^[2-57]/.test(digits)) return true;
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

    // Fallback: match by normalized phone digits (handles +66 vs 0, hyphens, spaces)
    const targetNorm = normalizePhone(targetPhone);
    if (targetNorm && targetNorm.length >= 8) {
      const byNormPhone = customers.find(c => {
        const pNorm = normalizePhone(c.phone);
        const secNorm = normalizePhone(c.secondaryPhone);
        return (pNorm && pNorm === targetNorm) || (secNorm && secNorm === targetNorm);
      });
      if (byNormPhone) return byNormPhone;
    }
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

  // 1. Candidate Thai phone (normalize to standard 08x/02x format):
  let thaiPhone = "";
  if (isThaiPhoneNumber(rawPhone)) thaiPhone = normalizeThaiPhone(rawPhone);
  else if (isThaiPhoneNumber(profilePhone)) thaiPhone = normalizeThaiPhone(profilePhone);
  else if (isThaiPhoneNumber(secPhone)) thaiPhone = normalizeThaiPhone(secPhone);
  else if (isThaiPhoneNumber(addrPhone)) thaiPhone = normalizeThaiPhone(addrPhone);

  // 2. Candidate International/Other phone (must NOT be Thai):
  let intlPhone = "";
  if (secPhone && !isThaiPhoneNumber(secPhone)) intlPhone = secPhone;
  else if (profilePhone && !isThaiPhoneNumber(profilePhone)) intlPhone = profilePhone;
  else if (rawPhone && !isThaiPhoneNumber(rawPhone)) intlPhone = rawPhone;
  else if (addrPhone && !isThaiPhoneNumber(addrPhone)) intlPhone = addrPhone;

  // 3. Alternate phone (if different from primary/thaiPhone)
  let alternatePhone: string | null = null;
  if (intlPhone && intlPhone !== thaiPhone) {
    alternatePhone = intlPhone;
  } else if (secPhone && secPhone !== thaiPhone && !isThaiPhoneNumber(secPhone)) {
    alternatePhone = secPhone;
  } else if (profilePhone && profilePhone !== thaiPhone && !isThaiPhoneNumber(profilePhone)) {
    alternatePhone = profilePhone;
  } else if (addrPhone && addrPhone !== thaiPhone) {
    alternatePhone = addrPhone;
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
 * Safely appends customer's room number to a location string if the location is not a shop
 * and does not already contain room information.
 */
export function formatLocationWithRoom(
  location: string | null | undefined,
  customer?: { roomNo?: string | null; secondaryAddress?: string | null } | null,
  shopLocations?: Array<{ address?: string | null; name?: string | null }>
): string {
  if (!location || !location.trim() || location === "-") return location || "-";
  const loc = location.trim();

  // If this is a shop / POS counter location, do not append customer room
  if (
    loc.includes("POS Counter") ||
    shopLocations?.some(s => (s.address && s.address.trim() === loc) || (s.name && s.name.trim() === loc))
  ) {
    return loc;
  }

  // If location already contains room information (e.g. "(Room 101)", "Room 101", "ห้อง 101", "#101")
  if (/\(Room\s*.*?\)/i.test(loc) || /\b(room|ห้อง|#)\s*\w+/i.test(loc)) {
    return loc;
  }

  // Extract room from customer
  const cleanRoom = customer?.roomNo?.trim() || 
    (customer?.secondaryAddress ? customer.secondaryAddress.replace(/^Room\s*/i, '').trim() : "");

  if (cleanRoom) {
    return `${loc} (Room ${cleanRoom})`;
  }

  return loc;
}

/**
 * Returns customer's default address formatted with room number if present.
 */
export function formatCustomerFullAddress(
  customer?: { defaultAddress?: string | null; roomNo?: string | null; secondaryAddress?: string | null } | null
): string {
  if (!customer) return "";
  const base = customer.defaultAddress?.trim() || "";
  const room = customer.roomNo?.trim() || (customer.secondaryAddress ? customer.secondaryAddress.replace(/^Room\s*/i, '').trim() : "");

  if (!base && !room) return "";
  if (!base) return room.toLowerCase().startsWith("room") ? room : `Room ${room}`;
  if (!room) return base;

  // If base already contains room
  if (/\(Room\s*.*?\)/i.test(base) || /\b(room|ห้อง|#)\s*\w+/i.test(base)) {
    return base;
  }

  const cleanRoom = room.replace(/^Room\s*/i, '').trim();
  return cleanRoom ? `${base} (Room ${cleanRoom})` : base;
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

/**
 * Normalizes a phone number for duplicate detection and comparison.
 * Extracts digits only and standardizes Thailand country code (66 -> 0).
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("660") && digits.length >= 11) {
    digits = "0" + digits.slice(3);
  } else if (digits.startsWith("66") && digits.length >= 10) {
    digits = "0" + digits.slice(2);
  }
  return digits;
}

/**
 * Universal search matcher for customers.
 * Supports:
 * - Customer Name & Nickname (case-insensitive, multi-word matching)
 * - Member ID (case-insensitive, stripped prefix '#' or spaces, alphanumeric matching)
 * - Phone & Secondary Phone & Address Contact Phone:
 *   - Direct substring match
 *   - Clean digits matching (ignores hyphens, spaces, parentheses, +)
 *   - Thai country-code normalization (+66 / 66 <-> 0, and handling malformed +66 0...)
 *   - International country-code normalization (e.g. domestic 0-prefixed <-> intl +41, +44, +1, +61, etc.)
 *   - Partial digit matching (e.g. last 4+ digits)
 * - Email and Line ID
 * - Company Name and Tax ID
 */
export function matchCustomerSearch(
  customer: {
    id?: string | null;
    name?: string | null;
    nickName?: string | null;
    phone?: string | null;
    secondaryPhone?: string | null;
    memberId?: string | null;
    email?: string | null;
    lineId?: string | null;
    companyName?: string | null;
    taxId?: string | null;
    addresses?: Array<{ contactPhone?: string | null }> | null;
  } | null | undefined,
  rawQuery: string | null | undefined
): boolean {
  if (!customer || !rawQuery) return false;
  const q = rawQuery.trim().toLowerCase();
  if (!q) return false;

  // 1. Name & Nickname match (direct or all-words match)
  const name = (customer.name || "").toLowerCase();
  const nick = (customer.nickName || "").toLowerCase();
  const comp = (customer.companyName || "").toLowerCase();
  if (name.includes(q) || (nick && nick.includes(q)) || (comp && comp.includes(q))) {
    return true;
  }

  const qWords = q.split(/\s+/).filter(Boolean);
  if (qWords.length > 1) {
    const combinedName = `${name} ${nick} ${comp}`.trim();
    if (qWords.every(w => combinedName.includes(w))) {
      return true;
    }
  }

  // 2. Member ID match
  if (customer.memberId) {
    const mId = customer.memberId.trim().toLowerCase();
    const cleanQ = q.replace(/^#/, "").trim();
    if (mId.includes(q) || mId.includes(cleanQ)) {
      return true;
    }
    const mIdAlnum = mId.replace(/[^a-z0-9]/g, "");
    const cleanQAlnum = cleanQ.replace(/[^a-z0-9]/g, "");
    if (mIdAlnum && cleanQAlnum && mIdAlnum.includes(cleanQAlnum)) {
      return true;
    }
    if (mIdAlnum.length >= 3 && cleanQAlnum && cleanQAlnum.includes(mIdAlnum)) {
      return true;
    }
  }

  // 3. Tax ID match
  if (customer.taxId) {
    const tId = customer.taxId.replace(/\D/g, "");
    const qDigits = q.replace(/\D/g, "");
    if (qDigits && tId.includes(qDigits)) return true;
  }

  // 4. Email & Line ID match
  if (customer.email && customer.email.toLowerCase().includes(q)) return true;
  if (customer.lineId && customer.lineId.toLowerCase().includes(q)) return true;

  // 5. Phone Numbers Matching (Thai & International)
  const phonesToCheck: string[] = [];
  if (customer.phone) phonesToCheck.push(customer.phone);
  if (customer.secondaryPhone) phonesToCheck.push(customer.secondaryPhone);
  if (customer.addresses && Array.isArray(customer.addresses)) {
    for (const addr of customer.addresses) {
      if (addr.contactPhone) phonesToCheck.push(addr.contactPhone);
    }
  }

  const qDigits = q.replace(/\D/g, "");

  for (const rawPhone of phonesToCheck) {
    if (!rawPhone) continue;
    const pLower = rawPhone.toLowerCase().trim();
    if (pLower.includes(q)) return true;

    const pDigits = rawPhone.replace(/\D/g, "");
    if (!pDigits || pDigits.length < 4) continue;

    if (qDigits) {
      // Build candidate variants for stored phone
      const variants = new Set<string>();
      variants.add(pDigits);

      // Thai / country-code 66 normalization
      if (pDigits.startsWith("660") && pDigits.length >= 11) {
        variants.add("0" + pDigits.slice(3));
        variants.add("66" + pDigits.slice(3));
        variants.add(pDigits.slice(3));
      } else if (pDigits.startsWith("66") && pDigits.length >= 10) {
        variants.add("0" + pDigits.slice(2));
        variants.add(pDigits.slice(2));
      } else if (pDigits.startsWith("0") && pDigits.length >= 9) {
        variants.add("66" + pDigits.slice(1));
        variants.add(pDigits.slice(1));
      }

      // International domestic/country-code variations
      // (e.g. UK: 447806818431 -> 7806818431 & 07806818431, Switzerland: 41788858009 -> 788858009 & 0788858009)
      if (pDigits.length >= 10 && !pDigits.startsWith("0")) {
        for (const ccLen of [1, 2, 3]) {
          if (pDigits.length > ccLen + 6) {
            const localPart = pDigits.slice(ccLen);
            variants.add(localPart);
            variants.add("0" + localPart);
          }
        }
      }

      // Check matching against variants
      let matched = false;
      for (const variant of variants) {
        if (qDigits.length < 3) {
          // If query is very short digits (1-2 digits), only match if variant starts with it
          if (variant.startsWith(qDigits)) {
            matched = true;
            break;
          }
        } else {
          if (variant.includes(qDigits)) {
            matched = true;
            break;
          }
        }
      }
      if (matched) return true;

      // If user typed domestic 0-prefixed international number (e.g. '0788858009' -> '788858009')
      if (qDigits.startsWith("0") && qDigits.length >= 8) {
        const withoutZero = qDigits.slice(1);
        for (const variant of variants) {
          if (variant.includes(withoutZero)) return true;
        }
      }
    }
  }

  return false;
}

/**
 * Gets base system rider commission rate per km (default 2 THB/km)
 */
export function getCommissionRate(settings?: Record<string, string> | null): number {
  return parseFloat(settings?.riderCommissionPerKm || "2") || 2;
}

/**
 * Calculates Rider Commission for Pickup and Delivery based on customer profile rules
 * (supports Corporate B2B contract rules: None, Fixed per trip, Custom Rate/km, or Standard)
 */
export function calculateRiderCommission({
  customer,
  isPickup,
  pickupDist,
  isDelivery,
  deliveryDist,
  systemSettings,
  isVIP = false,
  isFreeDelivery = false,
}: {
  customer?: any | null;
  isPickup: boolean;
  pickupDist: number;
  isDelivery: boolean;
  deliveryDist: number;
  systemSettings?: Record<string, string> | null;
  isVIP?: boolean;
  isFreeDelivery?: boolean;
}): {
  pickupCommission: number;
  deliveryCommission: number;
  isCorporateRule: boolean;
  ruleLabel: string;
} {
  const isCorp = Boolean(customer?.isCorporate || customer?.tier === "corporate");
  const commType = isCorp ? (customer?.corporateCommissionType || "default") : "default";

  // Corporate rules take precedence over Free Delivery and VIP
  if (isCorp) {
    // 1. None: No commission
    if (commType === "none") {
      return {
        pickupCommission: 0,
        deliveryCommission: 0,
        isCorporateRule: true,
        ruleLabel: "Corporate: No Comm (฿0)",
      };
    }

    // 2. Fixed: Flat rate per trip (preserved even if Free Delivery is active)
    if (commType === "fixed") {
      const pComm = isPickup ? (Number(customer?.corporatePickupCommission) || 0) : 0;
      const dComm = isDelivery ? (Number(customer?.corporateDeliveryCommission) || 0) : 0;
      return {
        pickupCommission: pComm,
        deliveryCommission: dComm,
        isCorporateRule: true,
        ruleLabel: `Corporate: Fixed (P:฿${pComm} / D:฿${dComm})`,
      };
    }

    // 3. Custom Rate per KM (preserved even if Free Delivery is active)
    if (commType === "custom_km") {
      const customRate = Number(customer?.corporateCommissionRatePerKm) || getCommissionRate(systemSettings);
      const pComm = isPickup ? Math.floor(pickupDist) * customRate : 0;
      const dComm = isDelivery ? Math.floor(deliveryDist) * customRate : 0;
      return {
        pickupCommission: pComm,
        deliveryCommission: dComm,
        isCorporateRule: true,
        ruleLabel: `Corporate: ฿${customRate}/km`,
      };
    }

    // 4. Default for Corporate: Standard system rate (preserved even if Free Delivery is active)
    const defaultRate = getCommissionRate(systemSettings);
    const pComm = isPickup ? Math.floor(pickupDist) * defaultRate : 0;
    const dComm = isDelivery ? Math.floor(deliveryDist) * defaultRate : 0;
    return {
      pickupCommission: pComm,
      deliveryCommission: dComm,
      isCorporateRule: true,
      ruleLabel: `Corporate: Standard (฿${defaultRate}/km)`,
    };
  }

  // Non-corporate customers: VIP or Free Delivery zeros out commission
  if (isVIP || isFreeDelivery) {
    return {
      pickupCommission: 0,
      deliveryCommission: 0,
      isCorporateRule: false,
      ruleLabel: isVIP ? "VIP (฿0)" : "Free Delivery (฿0)",
    };
  }

  // Standard non-corporate rate
  const defaultRate = getCommissionRate(systemSettings);
  const pComm = isPickup ? Math.floor(pickupDist) * defaultRate : 0;
  const dComm = isDelivery ? Math.floor(deliveryDist) * defaultRate : 0;
  return {
    pickupCommission: pComm,
    deliveryCommission: dComm,
    isCorporateRule: false,
    ruleLabel: `Standard (฿${defaultRate}/km)`,
  };
}

/**
 * Compares two phone strings to determine if they represent the same phone number.
 * Supports:
 * - Direct match (trimmed)
 * - Thai mobile & landline formats (08x, +66 8x, 668x, +66 08x, hyphens/spaces)
 * - International formats (+1, +44, +65, etc. with or without spaces/symbols)
 * - Domestic zero vs country code (e.g. +44 79... vs 079...)
 */
export function isSamePhoneNumber(phoneA: string | null | undefined, phoneB: string | null | undefined): boolean {
  if (!phoneA || !phoneB) return false;
  const pA = phoneA.trim();
  const pB = phoneB.trim();
  if (!pA || !pB) return false;

  // Direct exact match
  if (pA.toLowerCase() === pB.toLowerCase()) return true;

  // Both Thai
  const isThaiA = isThaiPhoneNumber(pA);
  const isThaiB = isThaiPhoneNumber(pB);
  if (isThaiA && isThaiB) {
    return normalizeThaiPhone(pA) === normalizeThaiPhone(pB);
  }

  // Normalized digits comparison (handles Thai +66 vs 0, and clean international digits)
  const normA = normalizePhone(pA);
  const normB = normalizePhone(pB);
  if (normA && normB && normA === normB) return true;

  const digitsA = pA.replace(/\D/g, "");
  const digitsB = pB.replace(/\D/g, "");
  if (!digitsA || !digitsB) return false;
  if (digitsA === digitsB) return true;

  // International country code handling (e.g. +44 7911123456 vs 07911123456 or 7911123456)
  const checkIntlPair = (intlDigits: string, nationalDigits: string) => {
    if (intlDigits.length < 9 || nationalDigits.length < 7) return false;
    for (const ccLen of [1, 2, 3, 4]) {
      if (intlDigits.length > ccLen + 6) {
        const localPart = intlDigits.slice(ccLen);
        if (localPart === nationalDigits) return true;
        if ("0" + localPart === nationalDigits) return true;
        if (nationalDigits.startsWith("0") && nationalDigits.slice(1) === localPart) return true;
      }
    }
    return false;
  };

  if (checkIntlPair(digitsA, digitsB)) return true;
  if (checkIntlPair(digitsB, digitsA)) return true;

  return false;
}

/**
 * Searches a list of customers to see if any customer already uses the given phone number(s).
 * Checks against both primary phone and secondary phone.
 */
export function findDuplicateCustomerByPhone({
  phone,
  secondaryPhone,
  customers,
  excludeCustomerId,
}: {
  phone?: string | null;
  secondaryPhone?: string | null;
  customers: { id: string; name?: string | null; phone?: string | null; secondaryPhone?: string | null; memberId?: string | null }[];
  excludeCustomerId?: string | null;
}): {
  customer: { id: string; name?: string | null; phone?: string | null; secondaryPhone?: string | null; memberId?: string | null };
  matchedOn: "primary" | "secondary";
  matchedPhone: string;
} | null {
  if (!customers || customers.length === 0) return null;

  const candidatePhones: { value: string; type: "primary" | "secondary" }[] = [];
  if (isValidPhoneNumber(phone)) {
    candidatePhones.push({ value: phone.trim(), type: "primary" });
  }
  if (isValidPhoneNumber(secondaryPhone)) {
    candidatePhones.push({ value: secondaryPhone.trim(), type: "secondary" });
  }

  if (candidatePhones.length === 0) return null;

  for (const c of customers) {
    if (excludeCustomerId && c.id === excludeCustomerId) continue;

    for (const cand of candidatePhones) {
      if (c.phone && isSamePhoneNumber(cand.value, c.phone)) {
        return { customer: c, matchedOn: cand.type, matchedPhone: c.phone };
      }
      if (c.secondaryPhone && isSamePhoneNumber(cand.value, c.secondaryPhone)) {
        return { customer: c, matchedOn: cand.type, matchedPhone: c.secondaryPhone };
      }
    }
  }

  return null;
}


