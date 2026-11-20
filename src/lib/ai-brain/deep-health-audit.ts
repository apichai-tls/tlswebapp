import { prisma } from "@/lib/prisma";
import {
  evaluateOrderDelayAlerts,
  loadTelegramAlertConfig,
  sendTelegramBotMessage,
} from "./telegram-alerts";

export interface DeepHealthAuditResult {
  checkedAt: string;
  dbLatencyMs: number;
  dbHealthy: boolean;
  anomalies: Array<{
    severity: "critical" | "warning" | "info";
    area: string;
    title: string;
    count: number;
    detail: string;
  }>;
  delays: {
    deliveryOverdue: number;
    processingDelay: number;
    stuckOrders: number;
    pickupOverdue: number;
    urgentTasks: number;
  };
}

function formatBangkokNow(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export async function runDeepHealthAudit(): Promise<DeepHealthAuditResult> {
  const start = Date.now();
  let dbHealthy = true;
  let dbLatencyMs = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
  } catch {
    dbHealthy = false;
    dbLatencyMs = Date.now() - start;
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const anomalies: DeepHealthAuditResult["anomalies"] = [];

  if (!dbHealthy) {
    anomalies.push({
      severity: "critical",
      area: "Database",
      title: "Database Connectivity Failure",
      count: 1,
      detail: "SELECT 1 health probe failed against PostgreSQL.",
    });
    return {
      checkedAt: now.toISOString(),
      dbLatencyMs,
      dbHealthy: false,
      anomalies,
      delays: {
        deliveryOverdue: 0,
        processingDelay: 0,
        stuckOrders: 0,
        pickupOverdue: 0,
        urgentTasks: 0,
      },
    };
  }

  const [
    csoPaidShopUnpaidCount,
    negativeWalletCount,
    staleOpenShiftsCount,
    staleWalletApprovalsCount,
    missingBillActiveCount,
    delaySummary,
  ] = await Promise.all([
    prisma.job.count({
      where: {
        isPaid: true,
        isShopPaid: false,
        status: { notIn: ["cancelled", "CANCELLED"] },
      },
    }),
    prisma.customer.count({
      where: { creditBalance: { lt: -0.01 } },
    }),
    prisma.cashierShift.count({
      where: {
        status: "open",
        openedAt: { lt: twentyFourHoursAgo },
      },
    }),
    prisma.walletTransaction.count({
      where: {
        approvalStatus: "PENDING",
        createdAt: { lt: twentyFourHoursAgo },
      },
    }),
    prisma.job.count({
      where: {
        status: { in: ["process", "in_process", "delivery", "ready"] },
        OR: [{ billNo: null }, { billNo: "" }],
      },
    }),
    evaluateOrderDelayAlerts(),
  ]);

  if (dbLatencyMs > 1500) {
    anomalies.push({
      severity: "warning",
      area: "Performance",
      title: "High Database Latency",
      count: 1,
      detail: `PostgreSQL probe took ${dbLatencyMs}ms (threshold: 1500ms).`,
    });
  }

  if (csoPaidShopUnpaidCount > 0) {
    anomalies.push({
      severity: csoPaidShopUnpaidCount >= 10 ? "critical" : "warning",
      area: "Billing Sync",
      title: "CSO Paid + Shop Unpaid Mismatch",
      count: csoPaidShopUnpaidCount,
      detail: `${csoPaidShopUnpaidCount} order(s) marked paid by CSO but unpaid at shop POS.`,
    });
  }

  if (negativeWalletCount > 0) {
    anomalies.push({
      severity: "critical",
      area: "Wallet Integrity",
      title: "Negative Customer Wallet Balances",
      count: negativeWalletCount,
      detail: `${negativeWalletCount} customer(s) have a negative creditBalance (< ฿0).`,
    });
  }

  if (staleOpenShiftsCount > 0) {
    anomalies.push({
      severity: "warning",
      area: "POS Shifts",
      title: "Cashier Shifts Open > 24h",
      count: staleOpenShiftsCount,
      detail: `${staleOpenShiftsCount} cashier shift(s) have been open for over 24 hours without closing.`,
    });
  }

  if (staleWalletApprovalsCount > 0) {
    anomalies.push({
      severity: "warning",
      area: "Wallet Approvals",
      title: "Pending Wallet Approvals > 24h",
      count: staleWalletApprovalsCount,
      detail: `${staleWalletApprovalsCount} wallet top-up/adjustment(s) waiting for approval over 24h.`,
    });
  }

  if (missingBillActiveCount > 0) {
    anomalies.push({
      severity: "warning",
      area: "Billing Hygiene",
      title: "In-Process / Delivery Jobs Without Bill #",
      count: missingBillActiveCount,
      detail: `${missingBillActiveCount} active job(s) in process/delivery have no bill number issued.`,
    });
  }

  return {
    checkedAt: now.toISOString(),
    dbLatencyMs,
    dbHealthy,
    anomalies,
    delays: {
      deliveryOverdue: delaySummary.deliveryOverdueCount,
      processingDelay: delaySummary.processingDelayCount,
      stuckOrders: delaySummary.stuckOrdersCount,
      pickupOverdue: delaySummary.pickupOverdueCount,
      urgentTasks: delaySummary.urgentTasksCount,
    },
  };
}

export async function sendDeepHealthAuditToTelegram(
  audit: DeepHealthAuditResult,
  extraChecks?: {
    buildStatus?: string;
    websiteStatus?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const config = await loadTelegramAlertConfig();
  const botToken = config.botToken?.trim() || (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = config.managementChatId?.trim();

  if (!botToken || !chatId) {
    return { ok: false, error: "Telegram bot token or management chat ID not configured." };
  }

  const criticalCount = audit.anomalies.filter((a) => a.severity === "critical").length;
  const totalDelays =
    audit.delays.deliveryOverdue +
    audit.delays.processingDelay +
    audit.delays.stuckOrders +
    audit.delays.pickupOverdue +
    audit.delays.urgentTasks;

  const headerEmoji = criticalCount > 0 ? "🚨" : audit.anomalies.length > 0 || totalDelays > 0 ? "⚠️" : "✅";
  const lines: string[] = [
    `${headerEmoji} TLS DEEP WEBSITE & SYSTEM HEALTH CHECK`,
    `🕒 ${formatBangkokNow()} (Bangkok)`,
    `🗄️ DB Probe: ${audit.dbHealthy ? `OK (${audit.dbLatencyMs}ms)` : "FAILED"}`,
  ];

  if (extraChecks?.websiteStatus) {
    lines.push(`🌐 Website / API: ${extraChecks.websiteStatus}`);
  }
  if (extraChecks?.buildStatus) {
    lines.push(`🛠️ TypeScript Build: ${extraChecks.buildStatus}`);
  }

  lines.push(`--------------------------------`);

  if (audit.anomalies.length > 0) {
    lines.push(`🔍 SYSTEM & DATA ISSUES (${audit.anomalies.length}):`);
    for (const a of audit.anomalies) {
      const icon = a.severity === "critical" ? "🔴" : "🟡";
      lines.push(`${icon} [${a.area}] ${a.title}: ${a.detail}`);
    }
  } else {
    lines.push(`✅ No critical data or billing anomalies detected.`);
  }

  lines.push("");
  lines.push(
    `📦 ORDER DELAYS: Delivery ${audit.delays.deliveryOverdue} · Processing ${audit.delays.processingDelay} · Stuck ${audit.delays.stuckOrders} · Pickup ${audit.delays.pickupOverdue} · Urgent Tasks ${audit.delays.urgentTasks}`
  );

  const text = lines.join("\n");
  return sendTelegramBotMessage(botToken, chatId, text);
}
