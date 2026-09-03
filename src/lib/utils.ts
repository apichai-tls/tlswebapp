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
 * Generate a receipt number from a job ID.
 * Format: RE-{jobId}  e.g. RE-2026002711
 */
export function generateReceiptNumber(jobId: string): string {
  return `RE-${jobId}`;
}

/**
 * Generate a proforma base number from a job ID.
 * Format: PR-{jobId}  e.g. PR-2026002711
 * Append -R{n} with formatProformaNumber() when revision > 0.
 */
export function generateProformaBaseNumber(jobId: string): string {
  return `PR-${jobId}`;
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


