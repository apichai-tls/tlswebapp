/**
 * Wise (TransferWise) Business API Client
 */

export interface WiseProfile {
  id: number;
  type: "PERSONAL" | "BUSINESS" | string;
  fullName?: string;
  businessName?: string;
  email?: string;
  registrationNumber?: string;
}

export interface WiseBalanceAmount {
  value: number;
  currency: string;
}

export interface WiseBalanceItem {
  id: number;
  currency: string;
  amount: WiseBalanceAmount;
  cashAmount: WiseBalanceAmount;
  reservedAmount: WiseBalanceAmount;
  totalWorth: WiseBalanceAmount;
  type: string;
}

export interface WiseActivityItem {
  id: string;
  type: string;
  senderName: string;
  amount: number;
  currency: string;
  rawAmount: string;
  status: string;
  createdOn: string;
  updatedOn?: string;
  resourceId?: string;
  isIncoming: boolean;
  reference?: string;
  sourceCurrency?: string;
  sourceValue?: number;
  rate?: number;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").trim();
}

function parseWiseAmount(raw: string): { amount: number; currency: string; isIncoming: boolean } {
  if (!raw) return { amount: 0, currency: "THB", isIncoming: false };
  const isIncoming = raw.includes("<positive>") || raw.includes("+");
  const clean = stripHtml(raw).replace("+", "").replace("-", "").trim();
  // e.g. "651 THB" or "1,014 THB"
  const parts = clean.split(" ");
  if (parts.length >= 2) {
    const num = parseFloat(parts[0].replace(/,/g, "")) || 0;
    const cur = parts[1].trim().toUpperCase();
    return { amount: num, currency: cur, isIncoming };
  }
  const num = parseFloat(clean.replace(/,/g, "")) || 0;
  return { amount: num, currency: "THB", isIncoming };
}

/**
 * Fetch all available profiles for this API token
 */
export async function fetchWiseProfiles(token: string): Promise<WiseProfile[]> {
  const res = await fetch("https://api.wise.com/v2/profiles", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "ThatLaundryShop/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Wise API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((p: any) => ({
    id: p.id,
    type: p.type || (p.businessName ? "BUSINESS" : "PERSONAL"),
    fullName: p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
    businessName: p.businessName || p.fullName || "",
    email: p.email || p.contactDetails?.email,
    registrationNumber: p.registrationNumber,
  }));
}

/**
 * Fetch standard balances for a given profile
 */
export async function fetchWiseBalances(token: string, profileId: string | number): Promise<WiseBalanceItem[]> {
  const res = await fetch(`https://api.wise.com/v4/profiles/${profileId}/balances?types=STANDARD`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "ThatLaundryShop/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch Wise balances (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data;
}

/**
 * Fetch transfer detail (reference, sourceCurrency, sourceValue, rate) for a specific transfer ID
 */
export async function fetchWiseTransferDetail(
  token: string,
  transferId: string | number
): Promise<{
  reference?: string;
  sourceCurrency?: string;
  sourceValue?: number;
  targetCurrency?: string;
  targetValue?: number;
  rate?: number;
} | null> {
  try {
    const res = await fetch(`https://api.wise.com/v1/transfers/${transferId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "ThatLaundryShop/1.0",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      reference: (data?.details?.reference || data?.reference || "").trim() || undefined,
      sourceCurrency: data?.sourceCurrency || undefined,
      sourceValue: typeof data?.sourceValue === "number" ? data.sourceValue : undefined,
      targetCurrency: data?.targetCurrency || undefined,
      targetValue: typeof data?.targetValue === "number" ? data.targetValue : undefined,
      rate: typeof data?.rate === "number" ? data.rate : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch recent activities (incoming transfers and transactions)
 */
export async function fetchWiseActivities(
  token: string,
  profileId: string | number,
  limit: number = 20
): Promise<WiseActivityItem[]> {
  const res = await fetch(`https://api.wise.com/v1/profiles/${profileId}/activities?size=${limit}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "ThatLaundryShop/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch Wise activities (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawList: any[] = data?.activities || (Array.isArray(data) ? data : []);

  const mapped: WiseActivityItem[] = rawList.map((item: any) => {
    const parsed = parseWiseAmount(item.primaryAmount || "");
    return {
      id: item.id,
      type: item.type,
      senderName: stripHtml(item.title || "Wise Transfer"),
      amount: parsed.amount,
      currency: parsed.currency,
      rawAmount: stripHtml(item.primaryAmount || ""),
      status: item.status || "UNKNOWN",
      createdOn: item.createdOn,
      updatedOn: item.updatedOn || item.createdOn,
      resourceId: item.resource?.id ? String(item.resource.id) : undefined,
      isIncoming: parsed.isIncoming,
    };
  });

  // Enrich top 5 recent incoming TRANSFER items with transfer reference & fx details
  const enrichTargets = mapped.filter((m) => m.isIncoming && m.type === "TRANSFER" && m.resourceId).slice(0, 5);
  await Promise.all(
    enrichTargets.map(async (item) => {
      if (!item.resourceId) return;
      const detail = await fetchWiseTransferDetail(token, item.resourceId);
      if (detail) {
        item.reference = detail.reference;
        item.sourceCurrency = detail.sourceCurrency;
        item.sourceValue = detail.sourceValue;
        item.rate = detail.rate;
      }
    })
  );

  return mapped;
}
