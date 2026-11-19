import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TELEGRAM_ALERT_CONFIG,
  type DetectedAlertItem,
  type TelegramAlertConfig,
  type TelegramAlertHistoryEntry,
  type TelegramAlertSummary,
  type TelegramDiscoveredGroup,
} from "./telegram-alert-types";

const ALERT_CONFIG_KEY = "ai_brain_telegram_alerts_v1";
const ALERT_STATE_KEY = "ai_brain_telegram_alert_state_v1";

interface AlertDedupeState {
  lastSentByKey: Record<string, number>;
  history: TelegramAlertHistoryEntry[];
}

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function formatDurationMinutes(mins: number): string {
  const total = Math.max(1, Math.round(mins));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const remH = h % 24;
    return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
  }
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatBangkokTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function loadTelegramAlertConfig(): Promise<TelegramAlertConfig> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: ALERT_CONFIG_KEY },
      select: { value: true },
    });
    if (!row?.value) return { ...DEFAULT_TELEGRAM_ALERT_CONFIG };
    const p = JSON.parse(row.value);
    return {
      enabled: Boolean(p?.enabled),
      botToken: typeof p?.botToken === "string" ? p.botToken.trim() : "",
      managementChatId: typeof p?.managementChatId === "string" ? p.managementChatId.trim() : "",
      processingDelayHours: clampNum(p?.processingDelayHours, 2, 168, 24),
      deliveryOverdueMinutes: clampNum(p?.deliveryOverdueMinutes, 5, 1440, 30),
      pickupOverdueMinutes: clampNum(p?.pickupOverdueMinutes, 5, 1440, 45),
      includeStuckFlag: p?.includeStuckFlag !== false,
      includeUrgentComplaints: p?.includeUrgentComplaints !== false,
      cooldownMinutes: clampNum(p?.cooldownMinutes, 5, 1440, 120),
    };
  } catch {
    return { ...DEFAULT_TELEGRAM_ALERT_CONFIG };
  }
}

export async function saveTelegramAlertConfig(
  input: Partial<TelegramAlertConfig>
): Promise<TelegramAlertConfig> {
  const current = await loadTelegramAlertConfig();
  const next: TelegramAlertConfig = {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : current.enabled,
    botToken: input.botToken !== undefined ? String(input.botToken).trim() : current.botToken,
    managementChatId:
      input.managementChatId !== undefined
        ? String(input.managementChatId).trim()
        : current.managementChatId,
    processingDelayHours:
      input.processingDelayHours !== undefined
        ? clampNum(input.processingDelayHours, 2, 168, current.processingDelayHours)
        : current.processingDelayHours,
    deliveryOverdueMinutes:
      input.deliveryOverdueMinutes !== undefined
        ? clampNum(input.deliveryOverdueMinutes, 5, 1440, current.deliveryOverdueMinutes)
        : current.deliveryOverdueMinutes,
    pickupOverdueMinutes:
      input.pickupOverdueMinutes !== undefined
        ? clampNum(input.pickupOverdueMinutes, 5, 1440, current.pickupOverdueMinutes)
        : current.pickupOverdueMinutes,
    includeStuckFlag:
      input.includeStuckFlag !== undefined
        ? Boolean(input.includeStuckFlag)
        : current.includeStuckFlag,
    includeUrgentComplaints:
      input.includeUrgentComplaints !== undefined
        ? Boolean(input.includeUrgentComplaints)
        : current.includeUrgentComplaints,
    cooldownMinutes:
      input.cooldownMinutes !== undefined
        ? clampNum(input.cooldownMinutes, 5, 1440, current.cooldownMinutes)
        : current.cooldownMinutes,
  };

  await prisma.setting.upsert({
    where: { key: ALERT_CONFIG_KEY },
    create: { key: ALERT_CONFIG_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });

  return next;
}

export async function discoverTelegramEnvironment(): Promise<{
  hasSocialBotToken: boolean;
  hasEnvBotToken: boolean;
  groups: TelegramDiscoveredGroup[];
}> {
  const [cfgRow, convRow] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "TLS_SOCIAL_CONFIG_V1" }, select: { value: true } }),
    prisma.setting.findUnique({ where: { key: "TLS_SOCIAL_CONVERSATIONS_V1" }, select: { value: true } }),
  ]);

  let hasSocialBotToken = false;
  try {
    if (cfgRow?.value) {
      const parsed = JSON.parse(cfgRow.value);
      hasSocialBotToken = Boolean(parsed?.telegram?.botToken?.trim());
    }
  } catch {}

  const groups: TelegramDiscoveredGroup[] = [];
  const seen = new Set<string>();
  try {
    if (convRow?.value) {
      const convs = JSON.parse(convRow.value);
      if (Array.isArray(convs)) {
        for (const c of convs) {
          if (c?.channel === "telegram" && c?.externalContactId) {
            const cid = String(c.externalContactId).trim();
            if (cid && cid !== "-1000000000000" && !seen.has(cid)) {
              seen.add(cid);
              groups.push({
                chatId: cid,
                name: String(c.contactName || c.contactHandle || cid),
              });
            }
          }
        }
      }
    }
  } catch {}

  return {
    hasSocialBotToken,
    hasEnvBotToken: Boolean((process.env.TELEGRAM_BOT_TOKEN || "").trim()),
    groups,
  };
}

async function resolveBotToken(config: TelegramAlertConfig): Promise<string | null> {
  if (config.botToken?.trim()) return config.botToken.trim();
  const envToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (envToken) return envToken;
  try {
    const cfgRow = await prisma.setting.findUnique({
      where: { key: "TLS_SOCIAL_CONFIG_V1" },
      select: { value: true },
    });
    if (cfgRow?.value) {
      const parsed = JSON.parse(cfgRow.value);
      const token = parsed?.telegram?.botToken?.trim();
      if (token) return token;
    }
  } catch {}
  return null;
}

async function loadAlertState(): Promise<AlertDedupeState> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: ALERT_STATE_KEY },
      select: { value: true },
    });
    if (!row?.value) return { lastSentByKey: {}, history: [] };
    const parsed = JSON.parse(row.value);
    return {
      lastSentByKey:
        parsed?.lastSentByKey && typeof parsed.lastSentByKey === "object"
          ? parsed.lastSentByKey
          : {},
      history: Array.isArray(parsed?.history) ? parsed.history.slice(0, 20) : [],
    };
  } catch {
    return { lastSentByKey: {}, history: [] };
  }
}

async function saveAlertState(state: AlertDedupeState): Promise<void> {
  // Prune old dedupe keys (> 7 days) so setting stays compact
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const prunedKeys: Record<string, number> = {};
  for (const [k, ts] of Object.entries(state.lastSentByKey)) {
    if (typeof ts === "number" && ts >= cutoff) {
      prunedKeys[k] = ts;
    }
  }
  const cleanState: AlertDedupeState = {
    lastSentByKey: prunedKeys,
    history: state.history.slice(0, 20),
  };
  await prisma.setting.upsert({
    where: { key: ALERT_STATE_KEY },
    create: { key: ALERT_STATE_KEY, value: JSON.stringify(cleanState) },
    update: { value: JSON.stringify(cleanState) },
  });
}

export async function getTelegramAlertHistory(): Promise<TelegramAlertHistoryEntry[]> {
  const state = await loadAlertState();
  return state.history;
}

export async function evaluateOrderDelayAlerts(
  configOverride?: TelegramAlertConfig
): Promise<TelegramAlertSummary> {
  const config = configOverride || (await loadTelegramAlertConfig());
  const now = new Date();
  const nowMs = now.getTime();

  const [activeJobs, branches, riders, urgentTasks] = await Promise.all([
    prisma.job.findMany({
      where: {
        status: { notIn: ["completed", "cancelled", "CANCELLED", "COMPLETED"] },
      },
      orderBy: { updatedAt: "asc" },
      take: 500,
      select: {
        id: true,
        customerName: true,
        status: true,
        subStatus: true,
        isStuck: true,
        branchId: true,
        pickupRiderId: true,
        deliveryRiderId: true,
        riderId: true,
        createdAt: true,
        updatedAt: true,
        pickupScheduledAt: true,
        pickupScheduledEndAt: true,
        deliveryScheduledAt: true,
        deliveryScheduledEndAt: true,
      },
    }),
    prisma.shopLocation.findMany({ select: { id: true, name: true } }),
    prisma.rider.findMany({ select: { id: true, name: true, nickname: true } }),
    config.includeUrgentComplaints
      ? prisma.task.findMany({
          where: {
            isArchived: false,
            status: { notIn: ["done", "completed"] },
            OR: [
              { priority: { in: ["urgent", "high"] } },
              { dueDate: { lt: now } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 40,
          select: {
            id: true,
            title: true,
            priority: true,
            status: true,
            jobId: true,
            dueDate: true,
            assignedToName: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const riderMap = new Map(riders.map((r) => [r.id, r.nickname || r.name]));

  const items: DetectedAlertItem[] = [];
  let deliveryOverdueCount = 0;
  let processingDelayCount = 0;
  let pickupOverdueCount = 0;
  let stuckOrdersCount = 0;
  let urgentTasksCount = 0;

  const processingLimitMs = config.processingDelayHours * 60 * 60 * 1000;
  const deliveryOverdueMs = config.deliveryOverdueMinutes * 60 * 1000;
  const pickupOverdueMs = config.pickupOverdueMinutes * 60 * 1000;

  for (const job of activeJobs) {
    const statusLower = (job.status || "").toLowerCase();
    const branchName = (job.branchId && branchMap.get(job.branchId)) || "Unassigned Branch";
    const deliveryRider =
      (job.deliveryRiderId && riderMap.get(job.deliveryRiderId)) ||
      (job.riderId && riderMap.get(job.riderId)) ||
      undefined;
    const pickupRider =
      (job.pickupRiderId && riderMap.get(job.pickupRiderId)) ||
      (job.riderId && riderMap.get(job.riderId)) ||
      undefined;
    const customer = job.customerName || "Unknown Customer";

    // 1. Overdue Delivery
    const deliveryDeadline = job.deliveryScheduledEndAt || job.deliveryScheduledAt;
    if (deliveryDeadline && nowMs - deliveryDeadline.getTime() >= deliveryOverdueMs) {
      const lateMins = (nowMs - deliveryDeadline.getTime()) / 60000;
      deliveryOverdueCount++;
      items.push({
        key: `delivery_overdue:${job.id}`,
        type: "delivery_overdue",
        severity: "critical",
        orderId: job.id,
        customerName: customer,
        branchName,
        riderName: deliveryRider,
        stage: job.status,
        delayLabel: `${formatDurationMinutes(lateMins)} overdue`,
        detail: `Past scheduled delivery (${job.status}${job.subStatus ? ` / ${job.subStatus}` : ""})`,
      });
      continue; // Don't double-count the same job as processing delay
    }

    // 2. Explicitly flagged Stuck order
    if (config.includeStuckFlag && job.isStuck) {
      const ageMins = (nowMs - job.updatedAt.getTime()) / 60000;
      stuckOrdersCount++;
      items.push({
        key: `stuck_order:${job.id}`,
        type: "stuck_order",
        severity: "critical",
        orderId: job.id,
        customerName: customer,
        branchName,
        stage: job.status,
        delayLabel: `Stuck (${formatDurationMinutes(ageMins)} since update)`,
        detail: `Flagged STUCK in ${job.status}${job.subStatus ? ` / ${job.subStatus}` : ""}`,
      });
      continue;
    }

    // 3. Overdue Pickup (still in TBA / pending / pickup)
    const isPrePickup = ["tba", "pending", "pickup", "assigned", "pickup_assigned"].includes(statusLower);
    const pickupDeadline = job.pickupScheduledEndAt || job.pickupScheduledAt;
    if (isPrePickup && pickupDeadline && nowMs - pickupDeadline.getTime() >= pickupOverdueMs) {
      const lateMins = (nowMs - pickupDeadline.getTime()) / 60000;
      pickupOverdueCount++;
      items.push({
        key: `pickup_overdue:${job.id}`,
        type: "pickup_overdue",
        severity: "warning",
        orderId: job.id,
        customerName: customer,
        branchName,
        riderName: pickupRider,
        stage: job.status,
        delayLabel: `${formatDurationMinutes(lateMins)} late pickup`,
        detail: `Pickup overdue (still in ${job.status})`,
      });
      continue;
    }

    // 4. Processing / Stage Delay (sitting in billing/process/washing/delivery > processingDelayHours)
    const isProcessingStage = [
      "billing",
      "process",
      "in_process",
      "processing",
      "washing",
      "ironing",
      "checking",
      "qc",
      "delivery",
      "ready",
    ].includes(statusLower);

    if (isProcessingStage && nowMs - job.updatedAt.getTime() >= processingLimitMs) {
      const idleMins = (nowMs - job.updatedAt.getTime()) / 60000;
      processingDelayCount++;
      items.push({
        key: `processing_delay:${job.id}`,
        type: "processing_delay",
        severity: idleMins >= processingLimitMs * 1.5 ? "critical" : "warning",
        orderId: job.id,
        customerName: customer,
        branchName,
        stage: job.status,
        delayLabel: `${formatDurationMinutes(idleMins)} in ${job.status}`,
        detail: `No stage progress for ${formatDurationMinutes(idleMins)}`,
      });
    }
  }

  // 5. Urgent / Overdue Tasks & Customer Complaints
  for (const t of urgentTasks) {
    const isOverdue = Boolean(t.dueDate && t.dueDate.getTime() < nowMs);
    const isUrgent = t.priority === "urgent" || t.status === "stuck";
    if (!isOverdue && !isUrgent) continue;
    urgentTasksCount++;
    const lateMins = t.dueDate && isOverdue ? (nowMs - t.dueDate.getTime()) / 60000 : 0;
    items.push({
      key: `urgent_task:${t.id}`,
      type: "urgent_task",
      severity: isUrgent ? "critical" : "warning",
      taskId: t.id,
      orderId: t.jobId || undefined,
      delayLabel: isOverdue ? `${formatDurationMinutes(lateMins)} overdue` : `${t.priority.toUpperCase()} / ${t.status}`,
      detail: `${t.title}${t.assignedToName ? ` (${t.assignedToName})` : ""}`,
    });
  }

  // Sort critical first
  items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return 0;
  });

  return {
    checkedAt: now.toISOString(),
    totalIssues: items.length,
    deliveryOverdueCount,
    processingDelayCount,
    pickupOverdueCount,
    stuckOrdersCount,
    urgentTasksCount,
    items,
  };
}

export function formatManagementTelegramAlert(
  summary: TelegramAlertSummary,
  itemsToSend: DetectedAlertItem[]
): string {
  const lines: string[] = [
    `🚨 TLS MANAGEMENT OPS ALERT`,
    `🕒 ${formatBangkokTime()} (Bangkok)`,
    `📊 Active Issues Detected: ${itemsToSend.length} (Total open: ${summary.totalIssues})`,
    `--------------------------------`,
  ];

  const groups: Array<{ type: DetectedAlertItem["type"]; heading: string }> = [
    { type: "delivery_overdue", heading: "🚚 OVERDUE DELIVERY" },
    { type: "stuck_order", heading: "🛑 STUCK / FLAGGED ORDERS" },
    { type: "processing_delay", heading: "⏳ PROCESSING DELAYS" },
    { type: "pickup_overdue", heading: "🛵 OVERDUE PICKUP" },
    { type: "urgent_task", heading: "🎫 URGENT / OVERDUE TASKS" },
  ];

  for (const g of groups) {
    const groupItems = itemsToSend.filter((i) => i.type === g.type);
    if (groupItems.length === 0) continue;
    lines.push("");
    lines.push(`${g.heading} (${groupItems.length})`);
    for (const item of groupItems.slice(0, 8)) {
      if (item.orderId) {
        const riderPart = item.riderName ? ` · Rider: ${item.riderName}` : "";
        const branchPart = item.branchName ? ` · ${item.branchName}` : "";
        lines.push(
          `• #${item.orderId} (${item.customerName || "Customer"})${branchPart}${riderPart} — ${item.delayLabel}`
        );
      } else {
        lines.push(`• ${item.detail} — ${item.delayLabel}`);
      }
    }
    if (groupItems.length > 8) {
      lines.push(`  …and ${groupItems.length - 8} more`);
    }
  }

  lines.push("");
  lines.push(`🔗 Open Admin Dashboard → All Jobs / AI Brain to follow up.`);

  // Telegram max message length is 4096 chars
  const full = lines.join("\n");
  return full.length > 3950 ? `${full.slice(0, 3920)}\n…(truncated)` : full;
}

export async function sendTelegramBotMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.description) errText = body.description;
      } catch {}
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error contacting Telegram" };
  }
}

export async function sendTestManagementTelegramAlert(): Promise<{
  success: boolean;
  error?: string;
}> {
  const config = await loadTelegramAlertConfig();
  const botToken = await resolveBotToken(config);
  if (!botToken) {
    return {
      success: false,
      error: "No Telegram Bot Token found. Add one in Telegram Alert Settings or Social Inbox Config.",
    };
  }
  if (!config.managementChatId) {
    return {
      success: false,
      error: "Please set a Management Telegram Chat ID first and save settings.",
    };
  }

  const text = [
    `✅ TLS AI Brain — Telegram Alert Test`,
    `🕒 ${formatBangkokTime()} (Bangkok)`,
    `This chat is now connected to receive automatic Management alerts for order processing delays, overdue deliveries, stuck jobs, and urgent complaints.`,
    `Thresholds: Processing > ${config.processingDelayHours}h · Delivery > ${config.deliveryOverdueMinutes}m late · Pickup > ${config.pickupOverdueMinutes}m late · Cooldown ${config.cooldownMinutes}m.`,
  ].join("\n");

  const result = await sendTelegramBotMessage(botToken, config.managementChatId, text);
  const state = await loadAlertState();
  state.history.unshift({
    id: `test_${Date.now()}`,
    sentAt: new Date().toISOString(),
    chatId: config.managementChatId,
    issueCount: 0,
    delivered: result.ok,
    error: result.error || null,
    preview: "Test connection message",
  });
  await saveAlertState(state);

  return result.ok ? { success: true } : { success: false, error: result.error };
}

export async function checkAndSendManagementTelegramAlerts(options?: {
  force?: boolean;
}): Promise<{
  success: boolean;
  sent: boolean;
  skippedReason?: string;
  notifiedCount: number;
  summary: TelegramAlertSummary;
  error?: string;
}> {
  const force = Boolean(options?.force);
  const config = await loadTelegramAlertConfig();
  const summary = await evaluateOrderDelayAlerts(config);

  if (!force && !config.enabled) {
    return {
      success: true,
      sent: false,
      skippedReason: "Telegram alerts are disabled in settings.",
      notifiedCount: 0,
      summary,
    };
  }

  if (summary.totalIssues === 0) {
    return {
      success: true,
      sent: false,
      skippedReason: "No processing or delivery delays detected right now.",
      notifiedCount: 0,
      summary,
    };
  }

  const botToken = await resolveBotToken(config);
  if (!botToken) {
    return {
      success: false,
      sent: false,
      notifiedCount: 0,
      summary,
      error: "No Telegram Bot Token configured.",
    };
  }
  if (!config.managementChatId) {
    return {
      success: false,
      sent: false,
      notifiedCount: 0,
      summary,
      error: "No Management Telegram Chat ID configured.",
    };
  }

  const state = await loadAlertState();
  const nowMs = Date.now();
  const cooldownMs = config.cooldownMinutes * 60 * 1000;

  const itemsToSend = force
    ? summary.items
    : summary.items.filter((item) => {
        const lastSent = state.lastSentByKey[item.key] || 0;
        return nowMs - lastSent >= cooldownMs;
      });

  if (itemsToSend.length === 0) {
    return {
      success: true,
      sent: false,
      skippedReason: `All ${summary.totalIssues} issue(s) were already alerted within the ${config.cooldownMinutes}m cooldown window.`,
      notifiedCount: 0,
      summary,
    };
  }

  const messageText = formatManagementTelegramAlert(summary, itemsToSend);
  const sendRes = await sendTelegramBotMessage(botToken, config.managementChatId, messageText);

  if (sendRes.ok) {
    for (const item of itemsToSend) {
      state.lastSentByKey[item.key] = nowMs;
    }
  }

  state.history.unshift({
    id: `alert_${nowMs}`,
    sentAt: new Date(nowMs).toISOString(),
    chatId: config.managementChatId,
    issueCount: itemsToSend.length,
    delivered: sendRes.ok,
    error: sendRes.error || null,
    preview: `${summary.deliveryOverdueCount} delivery · ${summary.processingDelayCount} processing · ${summary.stuckOrdersCount} stuck · ${summary.pickupOverdueCount} pickup · ${summary.urgentTasksCount} urgent tasks`,
  });
  await saveAlertState(state);

  if (!sendRes.ok) {
    return {
      success: false,
      sent: false,
      notifiedCount: 0,
      summary,
      error: sendRes.error || "Telegram send failed",
    };
  }

  return {
    success: true,
    sent: true,
    notifiedCount: itemsToSend.length,
    summary,
  };
}
