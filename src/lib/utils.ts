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
