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
export function generateTopUpReceiptNumber(seq: number, date?: Date): string {
  const d = date || new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `TU-${yy}${mm}-${String(seq).padStart(5, "0")}`;
}
