export interface TelegramAlertConfig {
  enabled: boolean;
  botToken: string; // Optional override; falls back to TLS_SOCIAL_CONFIG_V1 or TELEGRAM_BOT_TOKEN
  managementChatId: string;
  processingDelayHours: number;
  deliveryOverdueMinutes: number;
  pickupOverdueMinutes: number;
  includeStuckFlag: boolean;
  includeUrgentComplaints: boolean;
  cooldownMinutes: number;
}

export const DEFAULT_TELEGRAM_ALERT_CONFIG: TelegramAlertConfig = {
  enabled: false,
  botToken: "",
  managementChatId: "",
  processingDelayHours: 24,
  deliveryOverdueMinutes: 30,
  pickupOverdueMinutes: 45,
  includeStuckFlag: true,
  includeUrgentComplaints: true,
  cooldownMinutes: 120,
};

export interface DetectedAlertItem {
  key: string;
  type: "delivery_overdue" | "processing_delay" | "pickup_overdue" | "stuck_order" | "urgent_task";
  severity: "critical" | "warning";
  orderId?: string;
  taskId?: string;
  customerName?: string;
  branchName?: string;
  riderName?: string;
  stage?: string;
  delayLabel: string;
  detail: string;
}

export interface TelegramAlertSummary {
  checkedAt: string;
  totalIssues: number;
  deliveryOverdueCount: number;
  processingDelayCount: number;
  pickupOverdueCount: number;
  stuckOrdersCount: number;
  urgentTasksCount: number;
  items: DetectedAlertItem[];
}

export interface TelegramAlertHistoryEntry {
  id: string;
  sentAt: string;
  chatId: string;
  issueCount: number;
  delivered: boolean;
  error?: string | null;
  preview: string;
}

export interface TelegramDiscoveredGroup {
  chatId: string;
  name: string;
}
