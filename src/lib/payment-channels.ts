export type PaymentChannelType = 'cash' | 'transfer' | 'card' | 'wallet' | 'credit' | 'other';

export interface PaymentChannelItem {
  id: string;
  name: string;
  type: PaymentChannelType;
  enabled: boolean;
  isSystem?: boolean;
  requiresMember?: boolean;
  description?: string;
}

export const DEFAULT_PAYMENT_CHANNELS: PaymentChannelItem[] = [
  { id: "cash_cod", name: "Cash / COD", type: "cash", enabled: true, isSystem: true },
  { id: "transfer", name: "Transfer", type: "transfer", enabled: true, isSystem: true },
  { id: "promptpay", name: "PromptPay", type: "transfer", enabled: true, isSystem: true },
  { id: "credit_card", name: "Credit Card", type: "card", enabled: true, isSystem: true },
  { id: "gateway", name: "Gateway", type: "card", enabled: true, isSystem: true },
  { id: "deduct_member", name: "Deduct Member", type: "wallet", enabled: true, isSystem: true, requiresMember: true },
  { id: "hq_credit", name: "HQ/Credit", type: "credit", enabled: true, isSystem: true },
];

export const PAYMENT_TYPE_LABELS: Record<PaymentChannelType, { label: string; color: string }> = {
  cash: { label: "เงินสด (Cash)", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  transfer: { label: "โอนเงิน (Transfer/QR)", color: "bg-blue-100 text-blue-800 border-blue-200" },
  card: { label: "บัตรเครดิต (Card)", color: "bg-purple-100 text-purple-800 border-purple-200" },
  wallet: { label: "วอลเล็ทสมาชิก (Wallet)", color: "bg-amber-100 text-amber-800 border-amber-200" },
  credit: { label: "เครดิต / ค้างชำระ (Credit)", color: "bg-rose-100 text-rose-800 border-rose-200" },
  other: { label: "อื่นๆ (Other)", color: "bg-slate-100 text-slate-800 border-slate-200" },
};

export function parsePaymentChannels(rawJson?: string | null): PaymentChannelItem[] {
  if (!rawJson) return DEFAULT_PAYMENT_CHANNELS;
  try {
    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.error("Failed to parse paymentChannels setting:", e);
  }
  return DEFAULT_PAYMENT_CHANNELS;
}

export function getPaymentChannels(systemSettings?: Record<string, string> | null): PaymentChannelItem[] {
  return parsePaymentChannels(systemSettings?.paymentChannels);
}

export function getActivePaymentChannels(
  systemSettings?: Record<string, string> | null,
  isMember: boolean = false
): PaymentChannelItem[] {
  const channels = getPaymentChannels(systemSettings);
  return channels.filter((ch) => {
    if (!ch.enabled) return false;
    if (ch.requiresMember && !isMember) return false;
    return true;
  });
}

export function mapChannelNameToMethod(
  channelName?: string,
  channels?: PaymentChannelItem[]
): "cash" | "transfer" | "card" | "credit" {
  if (!channelName) return "cash";

  const list = channels && channels.length > 0 ? channels : DEFAULT_PAYMENT_CHANNELS;
  const match = list.find((c) => c.name.toLowerCase() === channelName.trim().toLowerCase());

  if (match) {
    if (match.type === "transfer") return "transfer";
    if (match.type === "card") return "card";
    if (match.type === "wallet" || match.type === "credit") return "credit";
    return "cash";
  }

  // Fallback pattern matching
  const lower = channelName.toLowerCase();
  if (lower.includes("transfer") || lower.includes("promptpay") || lower.includes("โอน")) return "transfer";
  if (lower.includes("card") || lower.includes("gateway") || lower.includes("บัตร")) return "card";
  if (lower.includes("member") || lower.includes("wallet") || lower.includes("credit") || lower.includes("hq")) return "credit";
  return "cash";
}
