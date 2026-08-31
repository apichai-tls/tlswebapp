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
