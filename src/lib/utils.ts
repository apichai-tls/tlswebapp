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
 * Global proforma sequence key — shared across all branches.
 * Stored in the Setting table under this key.
 */
export const PROFORMA_SEQ_KEY = "proformaSeq_global";

/**
 * Generate a proforma number in the format: PR-TLS{YYMM}-{00001}
 * e.g. PR-TLS2608-00001
 */
export function generateProformaBaseNumber(seq: number, date?: Date): string {
  const d = date || new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `PR-TLS${yy}${mm}-${String(seq).padStart(5, "0")}`;
}
