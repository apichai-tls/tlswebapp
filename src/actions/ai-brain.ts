"use server";

import { prisma } from "@/lib/prisma";
import { assertServerActionAuthorized } from "@/lib/server-auth";
import { DEFAULT_BUSINESS_MEMORIES } from "@/lib/ai-brain/default-memories";
import {
  collectOperationalTelemetry,
  generateDeterministicInsights,
  type OperationalTelemetry,
} from "@/lib/ai-brain/telemetry";
import {
  analyzeOperationsWithGemini,
  askAiBrainWithGemini,
  getGeminiConfigStatus,
  learnFromTextSampleWithGemini,
  studyBusinessWithGemini,
  type BrainChatTurn,
  type BusinessCoverageScores,
  type ClarifyingQuestionItem,
} from "@/lib/ai-brain/gemini";
import { collectBusinessStudyCorpus } from "@/lib/ai-brain/business-learner";
import {
  loadModelRoutingConfig,
  loadResolvedGeminiApiKey,
  saveModelRoutingConfig,
  saveStoredGeminiApiKey,
} from "@/lib/ai-brain/model-routing";
import type { AiModelRoutingConfig } from "@/lib/ai-brain/model-options";
import {
  checkAndSendManagementTelegramAlerts,
  discoverTelegramEnvironment,
  evaluateOrderDelayAlerts,
  getTelegramAlertHistory,
  loadTelegramAlertConfig,
  saveTelegramAlertConfig,
  sendTestManagementTelegramAlert,
} from "@/lib/ai-brain/telegram-alerts";
import type {
  TelegramAlertConfig,
  TelegramAlertHistoryEntry,
  TelegramAlertSummary,
  TelegramDiscoveredGroup,
} from "@/lib/ai-brain/telegram-alert-types";

export interface AiBrainMemoryItem {
  id: string;
  category: string;
  title: string;
  content: string;
  tags: string | null;
  source: string;
  confidence: number;
  isActive: boolean;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiBrainInsightItem {
  id: string;
  runId: string | null;
  category: string;
  severity: string;
  title: string;
  summary: string;
  rootCause: string | null;
  recommendation: string;
  impactEstimate: string | null;
  evidenceJson: string | null;
  status: string;
  adminFeedback: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface AiBrainRunItem {
  id: string;
  windowDays: number;
  status: string;
  modelUsed: string;
  executiveSummary: string;
  metricsJson: string;
  insightsCount: number;
  triggeredByName: string | null;
  createdAt: Date;
}

async function assertAiBrainAuthorized(requireWrite: boolean = false) {
  const user = await assertServerActionAuthorized({
    requireWrite,
    forbidRoles: ["rider"],
  });
  const isAllowed =
    user.role === "admin" ||
    user.role === "superadmin" ||
    user.department === "management";
  if (!isAllowed) {
    throw new Error("Forbidden: AI Brain is restricted to Admin & Management only.");
  }
  return user;
}

let aiBrainSchemaEnsured = false;

async function ensureAiBrainSchemaReady() {
  if (aiBrainSchemaEnsured) return;
  // Strictly additive DDL: creates only the 3 isolated AiBrain tables if missing
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiBrainMemory" (
      "id" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "tags" TEXT,
      "source" TEXT NOT NULL DEFAULT 'admin_taught',
      "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdById" TEXT,
      "createdByName" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiBrainMemory_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiBrainRun" (
      "id" TEXT NOT NULL,
      "windowDays" INTEGER NOT NULL DEFAULT 7,
      "status" TEXT NOT NULL DEFAULT 'completed',
      "modelUsed" TEXT NOT NULL DEFAULT 'deterministic-telemetry',
      "executiveSummary" TEXT NOT NULL,
      "metricsJson" TEXT NOT NULL,
      "insightsCount" INTEGER NOT NULL DEFAULT 0,
      "triggeredById" TEXT,
      "triggeredByName" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiBrainRun_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiBrainInsight" (
      "id" TEXT NOT NULL,
      "runId" TEXT,
      "category" TEXT NOT NULL,
      "severity" TEXT NOT NULL DEFAULT 'warning',
      "title" TEXT NOT NULL,
      "summary" TEXT NOT NULL,
      "rootCause" TEXT,
      "recommendation" TEXT NOT NULL,
      "impactEstimate" TEXT,
      "evidenceJson" TEXT,
      "status" TEXT NOT NULL DEFAULT 'new',
      "adminFeedback" TEXT,
      "reviewedById" TEXT,
      "reviewedByName" TEXT,
      "reviewedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiBrainInsight_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "AiBrainInsight_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiBrainRun"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiBrainMemory_category_idx" ON "AiBrainMemory"("category");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiBrainMemory_isActive_idx" ON "AiBrainMemory"("isActive");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiBrainMemory_source_idx" ON "AiBrainMemory"("source");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiBrainRun_createdAt_idx" ON "AiBrainRun"("createdAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiBrainInsight_runId_idx" ON "AiBrainInsight"("runId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiBrainInsight_status_idx" ON "AiBrainInsight"("status");`);
  aiBrainSchemaEnsured = true;
}

async function ensureDefaultMemoriesSeeded() {
  await ensureAiBrainSchemaReady();
  const count = await prisma.aiBrainMemory.count();
  if (count > 0) return;

  await prisma.aiBrainMemory.createMany({
    data: DEFAULT_BUSINESS_MEMORIES.map((m) => ({
      category: m.category,
      title: m.title,
      content: m.content,
      tags: m.tags,
      source: "admin_taught",
      confidence: 1.0,
      isActive: true,
      createdByName: "System Seed (TLS Workflows)",
    })),
  });
}

export async function getAiBrainDashboardAction(windowDays: number = 7): Promise<{
  success: boolean;
  data?: {
    geminiStatus: { configured: boolean; model: string };
    modelRouting: AiModelRoutingConfig;
    liveTelemetry: OperationalTelemetry;
    runs: AiBrainRunItem[];
    insights: AiBrainInsightItem[];
    memories: AiBrainMemoryItem[];
    telegramAlerts: {
      config: TelegramAlertConfig;
      env: {
        hasSocialBotToken: boolean;
        hasEnvBotToken: boolean;
        groups: TelegramDiscoveredGroup[];
      };
      preview: TelegramAlertSummary;
      history: TelegramAlertHistoryEntry[];
    };
  };
  error?: string;
}> {
  try {
    await assertAiBrainAuthorized(false);
    await ensureDefaultMemoriesSeeded();

    const [
      liveTelemetry,
      runs,
      insights,
      memories,
      modelRouting,
      resolvedKey,
      tgConfig,
      tgEnv,
      tgHistory,
    ] = await Promise.all([
      collectOperationalTelemetry(windowDays),
      prisma.aiBrainRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.aiBrainInsight.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 60,
      }),
      prisma.aiBrainMemory.findMany({
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        take: 100,
      }),
      loadModelRoutingConfig(),
      loadResolvedGeminiApiKey(),
      loadTelegramAlertConfig(),
      discoverTelegramEnvironment(),
      getTelegramAlertHistory(),
    ]);

    const tgPreview = await evaluateOrderDelayAlerts(tgConfig);
    const baseGemini = getGeminiConfigStatus();

    return {
      success: true,
      data: {
        geminiStatus: {
          configured: Boolean(resolvedKey.apiKey),
          model: modelRouting.study || baseGemini.model,
        },
        modelRouting,
        liveTelemetry,
        runs: runs as AiBrainRunItem[],
        insights: insights as AiBrainInsightItem[],
        memories: memories as AiBrainMemoryItem[],
        telegramAlerts: {
          config: tgConfig,
          env: tgEnv,
          preview: tgPreview,
          history: tgHistory,
        },
      },
    };
  } catch (error: any) {
    console.error("getAiBrainDashboardAction failed:", error);
    return { success: false, error: error.message || "Failed to load AI Brain dashboard" };
  }
}

export async function saveTelegramAlertConfigAction(
  config: Partial<TelegramAlertConfig>
): Promise<{
  success: boolean;
  data?: {
    config: TelegramAlertConfig;
    preview: TelegramAlertSummary;
  };
  error?: string;
}> {
  try {
    await assertAiBrainAuthorized(true);
    const saved = await saveTelegramAlertConfig(config);
    const preview = await evaluateOrderDelayAlerts(saved);
    return { success: true, data: { config: saved, preview } };
  } catch (error: any) {
    console.error("saveTelegramAlertConfigAction failed:", error);
    return { success: false, error: error.message || "Failed to save Telegram alert settings" };
  }
}

export async function testTelegramAlertAction(): Promise<{
  success: boolean;
  history?: TelegramAlertHistoryEntry[];
  error?: string;
}> {
  try {
    await assertAiBrainAuthorized(true);
    const res = await sendTestManagementTelegramAlert();
    const history = await getTelegramAlertHistory();
    return { success: res.success, history, error: res.error };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to send test alert" };
  }
}

export async function runTelegramDelayAlertNowAction(force: boolean = true): Promise<{
  success: boolean;
  sent?: boolean;
  notifiedCount?: number;
  skippedReason?: string;
  preview?: TelegramAlertSummary;
  history?: TelegramAlertHistoryEntry[];
  error?: string;
}> {
  try {
    await assertAiBrainAuthorized(true);
    const res = await checkAndSendManagementTelegramAlerts({ force });
    const history = await getTelegramAlertHistory();
    return {
      success: res.success,
      sent: res.sent,
      notifiedCount: res.notifiedCount,
      skippedReason: res.skippedReason,
      preview: res.summary,
      history,
      error: res.error,
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to run delay alert check" };
  }
}

export async function saveAiModelRoutingAction(
  config: Partial<AiModelRoutingConfig> & { geminiApiKey?: string }
): Promise<{
  success: boolean;
  data?: AiModelRoutingConfig;
  geminiConfigured?: boolean;
  error?: string;
}> {
  try {
    await assertAiBrainAuthorized(true);
    const { geminiApiKey, ...routingFields } = config;
    const saved = await saveModelRoutingConfig(routingFields);
    if (typeof geminiApiKey === "string" && geminiApiKey.trim()) {
      await saveStoredGeminiApiKey(geminiApiKey.trim());
    }
    const resolved = await loadResolvedGeminiApiKey();
    return {
      success: true,
      data: saved,
      geminiConfigured: Boolean(resolved.apiKey),
    };
  } catch (error: any) {
    console.error("saveAiModelRoutingAction failed:", error);
    return { success: false, error: error.message || "Failed to save model routing" };
  }
}

export async function runAiBrainScanAction(windowDays: number = 7): Promise<{
  success: boolean;
  data?: {
    run: AiBrainRunItem;
    insights: AiBrainInsightItem[];
    learnedMemoriesCount: number;
    usedGemini: boolean;
    fallbackReason?: string | null;
  };
  error?: string;
}> {
  try {
    const actor = await assertAiBrainAuthorized(true);
    await ensureDefaultMemoriesSeeded();

    const [telemetry, activeMemories, previousRun] = await Promise.all([
      collectOperationalTelemetry(windowDays),
      prisma.aiBrainMemory.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
        take: 60,
      }),
      prisma.aiBrainRun.findFirst({
        orderBy: { createdAt: "desc" },
      }),
    ]);

    let previousMetrics: Record<string, any> | null = null;
    if (previousRun?.metricsJson) {
      try {
        previousMetrics = JSON.parse(previousRun.metricsJson)?.summary || null;
      } catch {}
    }

    let modelUsed = "deterministic-telemetry";
    let executiveSummary = "";
    let draftInsights = [] as ReturnType<typeof generateDeterministicInsights>["insights"];
    let suggestedMemories: Array<{
      category: string;
      title: string;
      content: string;
      tags?: string;
    }> = [];
    let usedGemini = false;
    let fallbackReason: string | null = null;

    const resolvedKey = await loadResolvedGeminiApiKey();
    if (resolvedKey.apiKey) {
      try {
        const routing = await loadModelRoutingConfig();
        const aiResult = await analyzeOperationsWithGemini({
          telemetry,
          memories: activeMemories.map((m) => ({
            id: m.id,
            category: m.category,
            title: m.title,
            content: m.content,
            source: m.source,
          })),
          previousSummary: previousRun?.executiveSummary || null,
          previousMetrics,
          modelOverride: routing.ops_scan,
          fallbackModel: routing.fallback,
          apiKeyOverride: resolvedKey.apiKey,
        });

        if (aiResult && aiResult.insights.length > 0) {
          modelUsed = aiResult.modelUsed;
          executiveSummary = aiResult.executiveSummary;
          draftInsights = aiResult.insights;
          suggestedMemories = aiResult.suggestedMemories;
          usedGemini = true;
        }
      } catch (err: any) {
        console.warn("Gemini scan failed, falling back to deterministic analyzer:", err);
        fallbackReason = err?.message || "Gemini API call failed; used deterministic telemetry.";
      }
    } else {
      fallbackReason = "GEMINI_API_KEY not set in .env — ran built-in deterministic telemetry analyzer.";
    }

    if (!usedGemini) {
      const det = generateDeterministicInsights(telemetry);
      executiveSummary = det.executiveSummary;
      draftInsights = det.insights;
    }

    const createdRun = await prisma.aiBrainRun.create({
      data: {
        windowDays,
        status: "completed",
        modelUsed,
        executiveSummary,
        metricsJson: JSON.stringify(telemetry),
        insightsCount: draftInsights.length,
        triggeredById: actor.id,
        triggeredByName: actor.name || actor.email || "Admin",
      },
    });

    const createdInsights: AiBrainInsightItem[] = [];
    for (const d of draftInsights) {
      const row = await prisma.aiBrainInsight.create({
        data: {
          runId: createdRun.id,
          category: d.category,
          severity: d.severity,
          title: d.title,
          summary: d.summary,
          rootCause: d.rootCause || null,
          recommendation: d.recommendation,
          impactEstimate: d.impactEstimate || null,
          evidenceJson: d.evidence ? JSON.stringify(d.evidence) : null,
          status: "new",
        },
      });
      createdInsights.push(row as AiBrainInsightItem);
    }

    let learnedMemoriesCount = 0;
    for (const sm of suggestedMemories) {
      const exists = await prisma.aiBrainMemory.findFirst({
        where: { title: { equals: sm.title.trim(), mode: "insensitive" } },
      });
      if (!exists) {
        await prisma.aiBrainMemory.create({
          data: {
            category: sm.category || "workflow",
            title: sm.title.trim(),
            content: sm.content.trim(),
            tags: sm.tags || "ai-learned",
            source: "ai_learned",
            confidence: 0.8,
            isActive: true,
            createdById: actor.id,
            createdByName: `AI Brain (${modelUsed})`,
          },
        });
        learnedMemoriesCount += 1;
      }
    }

    return {
      success: true,
      data: {
        run: createdRun as AiBrainRunItem,
        insights: createdInsights,
        learnedMemoriesCount,
        usedGemini,
        fallbackReason,
      },
    };
  } catch (error: any) {
    console.error("runAiBrainScanAction failed:", error);
    return { success: false, error: error.message || "Failed to run AI Brain scan" };
  }
}

export async function reviewAiBrainInsightAction(params: {
  insightId: string;
  status: "approved" | "implemented" | "dismissed" | "new";
  adminFeedback?: string;
  teachMemory?: boolean;
}): Promise<{
  success: boolean;
  data?: { insight: AiBrainInsightItem; createdMemory?: AiBrainMemoryItem | null };
  error?: string;
}> {
  try {
    const actor = await assertAiBrainAuthorized(true);
    const existing = await prisma.aiBrainInsight.findUnique({
      where: { id: params.insightId },
    });
    if (!existing) return { success: false, error: "Insight not found" };

    const cleanFeedback = params.adminFeedback?.trim() || null;
    const updated = await prisma.aiBrainInsight.update({
      where: { id: params.insightId },
      data: {
        status: params.status,
        adminFeedback: cleanFeedback ?? existing.adminFeedback,
        reviewedById: actor.id,
        reviewedByName: actor.name || actor.email || "Admin",
        reviewedAt: new Date(),
      },
    });

    // Feedback-to-Memory Learning: save admin correction or approved workflow rule into AiBrainMemory
    let createdMemory: AiBrainMemoryItem | null = null;
    const shouldLearn =
      params.teachMemory !== false &&
      (Boolean(cleanFeedback) || params.status === "implemented");

    if (shouldLearn) {
      const isCorrection = params.status === "dismissed" && Boolean(cleanFeedback);
      const memTitle = isCorrection
        ? `Admin Correction: ${existing.title.slice(0, 75)}`
        : params.status === "implemented"
        ? `Implemented Workflow: ${existing.title.slice(0, 75)}`
        : `Admin Guidance: ${existing.title.slice(0, 75)}`;

      const memContent = cleanFeedback
        ? `Regarding "${existing.title}" (${existing.category}): ${cleanFeedback}`
        : `Management implemented recommendation for "${existing.title}": ${existing.recommendation}`;

      const row = await prisma.aiBrainMemory.create({
        data: {
          category: isCorrection ? "correction" : "workflow",
          title: memTitle,
          content: memContent,
          tags: `${existing.category},${params.status}`,
          source: isCorrection ? "feedback_corrected" : "admin_taught",
          confidence: 1.0,
          isActive: true,
          createdById: actor.id,
          createdByName: actor.name || actor.email || "Admin",
        },
      });
      createdMemory = row as AiBrainMemoryItem;
    }

    return {
      success: true,
      data: {
        insight: updated as AiBrainInsightItem,
        createdMemory,
      },
    };
  } catch (error: any) {
    console.error("reviewAiBrainInsightAction failed:", error);
    return { success: false, error: error.message || "Failed to review insight" };
  }
}

export async function saveAiBrainMemoryAction(params: {
  id?: string;
  category: string;
  title: string;
  content: string;
  tags?: string;
}): Promise<{ success: boolean; data?: AiBrainMemoryItem; error?: string }> {
  try {
    const actor = await assertAiBrainAuthorized(true);
    const title = params.title.trim();
    const content = params.content.trim();
    if (!title || !content) {
      return { success: false, error: "Title and content are required" };
    }

    if (params.id) {
      const updated = await prisma.aiBrainMemory.update({
        where: { id: params.id },
        data: {
          category: params.category || "workflow",
          title,
          content,
          tags: params.tags?.trim() || null,
        },
      });
      return { success: true, data: updated as AiBrainMemoryItem };
    }

    const created = await prisma.aiBrainMemory.create({
      data: {
        category: params.category || "workflow",
        title,
        content,
        tags: params.tags?.trim() || null,
        source: "admin_taught",
        confidence: 1.0,
        isActive: true,
        createdById: actor.id,
        createdByName: actor.name || actor.email || "Admin",
      },
    });
    return { success: true, data: created as AiBrainMemoryItem };
  } catch (error: any) {
    console.error("saveAiBrainMemoryAction failed:", error);
    return { success: false, error: error.message || "Failed to save memory" };
  }
}

export async function toggleAiBrainMemoryAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; data?: AiBrainMemoryItem; error?: string }> {
  try {
    await assertAiBrainAuthorized(true);
    const updated = await prisma.aiBrainMemory.update({
      where: { id },
      data: { isActive },
    });
    return { success: true, data: updated as AiBrainMemoryItem };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update memory" };
  }
}

export async function deleteAiBrainMemoryAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAiBrainAuthorized(true);
    await prisma.aiBrainMemory.delete({ where: { id } });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to delete memory" };
  }
}

export async function runBusinessStudyAction(windowDays: number = 30): Promise<{
  success: boolean;
  data?: {
    run: AiBrainRunItem;
    understandingSummary: string;
    coverageScores: BusinessCoverageScores;
    clarifyingQuestions: ClarifyingQuestionItem[];
    newMemories: AiBrainMemoryItem[];
    corpusStats: {
      branches: number;
      departments: number;
      activeStaff: number;
      activeRiders: number;
      serviceItems: number;
      jobsStudied: number;
      tasksStudied: number;
      customersTotal: number;
      activityActions: number;
    };
    modelUsed: string;
  };
  error?: string;
}> {
  try {
    const actor = await assertAiBrainAuthorized(true);
    await ensureDefaultMemoriesSeeded();

    const [corpus, existingMemories] = await Promise.all([
      collectBusinessStudyCorpus(windowDays),
      prisma.aiBrainMemory.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
        take: 80,
      }),
    ]);

    const corpusStats = {
      branches: corpus.organization.branches.length,
      departments: corpus.organization.departments.length,
      activeStaff: corpus.organization.totalActiveStaff,
      activeRiders: corpus.organization.totalActiveRiders,
      serviceItems: corpus.catalog.totalServiceItems,
      jobsStudied: corpus.orderPatterns.totalJobsInWindow,
      tasksStudied: corpus.staffAndCustomerComms.totalTasksInWindow,
      customersTotal: corpus.customerProfile.totalCustomers,
      activityActions: corpus.operationsAudit.topActivityActions.reduce((s, a) => s + a.count, 0),
    };

    const resolvedKey = await loadResolvedGeminiApiKey();
    if (!resolvedKey.apiKey) {
      return {
        success: false,
        error: "Gemini API key is not configured yet — click 'Models' in the top right to paste your Gemini API key.",
      };
    }

    const routing = await loadModelRoutingConfig();
    const studyResult = await studyBusinessWithGemini({
      corpus,
      existingMemories: existingMemories.map((m) => ({
        id: m.id,
        category: m.category,
        title: m.title,
        content: m.content,
        source: m.source,
      })),
      modelOverride: routing.study,
      fallbackModel: routing.fallback,
      apiKeyOverride: resolvedKey.apiKey,
    });

    if (!studyResult) {
      return { success: false, error: "Gemini returned an empty study result." };
    }

    const newMemories: AiBrainMemoryItem[] = [];
    for (const lm of studyResult.learnedMemories) {
      const exists = await prisma.aiBrainMemory.findFirst({
        where: { title: { equals: lm.title.trim(), mode: "insensitive" } },
      });
      if (!exists) {
        const created = await prisma.aiBrainMemory.create({
          data: {
            category: lm.category || "workflow",
            title: lm.title.trim(),
            content: lm.content.trim(),
            tags: lm.tags || "system-study",
            source: "ai_learned",
            confidence: lm.confidence ?? 0.85,
            isActive: true,
            createdById: actor.id,
            createdByName: `AI Study (${studyResult.modelUsed})`,
          },
        });
        newMemories.push(created as AiBrainMemoryItem);
      }
    }

    const createdRun = await prisma.aiBrainRun.create({
      data: {
        windowDays,
        status: "learning_completed",
        modelUsed: studyResult.modelUsed,
        executiveSummary: studyResult.understandingSummary,
        metricsJson: JSON.stringify({
          mode: "learning",
          corpusStats,
          coverageScores: studyResult.coverageScores,
          clarifyingQuestions: studyResult.clarifyingQuestions,
        }),
        insightsCount: newMemories.length,
        triggeredById: actor.id,
        triggeredByName: actor.name || actor.email || "Admin",
      },
    });

    return {
      success: true,
      data: {
        run: createdRun as AiBrainRunItem,
        understandingSummary: studyResult.understandingSummary,
        coverageScores: studyResult.coverageScores,
        clarifyingQuestions: studyResult.clarifyingQuestions,
        newMemories,
        corpusStats,
        modelUsed: studyResult.modelUsed,
      },
    };
  } catch (error: any) {
    console.error("runBusinessStudyAction failed:", error);
    return { success: false, error: error.message || "Failed to study business data" };
  }
}

export async function learnFromTextSampleAction(params: {
  sourceType: "customer_chat" | "sop_doc" | "staff_note";
  title?: string;
  rawText: string;
}): Promise<{
  success: boolean;
  data?: {
    summary: string;
    newMemories: AiBrainMemoryItem[];
    modelUsed: string;
  };
  error?: string;
}> {
  try {
    const actor = await assertAiBrainAuthorized(true);
    const rawText = params.rawText.trim();
    if (rawText.length < 20) {
      return { success: false, error: "Please paste at least 20 characters of conversation or notes." };
    }

    await ensureAiBrainSchemaReady();
    const existingMemories = await prisma.aiBrainMemory.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    });

    const [routing, resolvedKey] = await Promise.all([
      loadModelRoutingConfig(),
      loadResolvedGeminiApiKey(),
    ]);
    const result = await learnFromTextSampleWithGemini({
      sourceType: params.sourceType,
      title: params.title?.trim(),
      rawText,
      existingMemories: existingMemories.map((m) => ({
        id: m.id,
        category: m.category,
        title: m.title,
        content: m.content,
        source: m.source,
      })),
      modelOverride: routing.extract,
      fallbackModel: routing.fallback,
      apiKeyOverride: resolvedKey.apiKey || undefined,
    });

    if (!result) {
      return { success: false, error: "Gemini is not configured or returned an empty result." };
    }

    const newMemories: AiBrainMemoryItem[] = [];
    for (const lm of result.learnedMemories) {
      const created = await prisma.aiBrainMemory.create({
        data: {
          category: lm.category || "customer_communication",
          title: lm.title.trim(),
          content: lm.content.trim(),
          tags: lm.tags || params.sourceType,
          source: "ai_learned",
          confidence: 0.9,
          isActive: true,
          createdById: actor.id,
          createdByName: `Learned from ${params.sourceType === "customer_chat" ? "Chat Sample" : params.sourceType === "sop_doc" ? "SOP Doc" : "Staff Note"}`,
        },
      });
      newMemories.push(created as AiBrainMemoryItem);
    }

    return {
      success: true,
      data: {
        summary: result.summary,
        newMemories,
        modelUsed: result.modelUsed,
      },
    };
  } catch (error: any) {
    console.error("learnFromTextSampleAction failed:", error);
    return { success: false, error: error.message || "Failed to learn from text sample" };
  }
}

export async function verifyAiBrainMemoryAction(
  id: string
): Promise<{ success: boolean; data?: AiBrainMemoryItem; error?: string }> {
  try {
    const actor = await assertAiBrainAuthorized(true);
    const updated = await prisma.aiBrainMemory.update({
      where: { id },
      data: {
        source: "admin_taught",
        confidence: 1.0,
        isActive: true,
        createdByName: `${actor.name || actor.email || "Admin"} (Verified)`,
      },
    });
    return { success: true, data: updated as AiBrainMemoryItem };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to verify memory" };
  }
}

export async function answerClarifyingQuestionAction(params: {
  question: string;
  answer: string;
  category?: string;
}): Promise<{ success: boolean; data?: AiBrainMemoryItem; error?: string }> {
  try {
    const actor = await assertAiBrainAuthorized(true);
    const q = params.question.trim();
    const a = params.answer.trim();
    if (!q || !a) return { success: false, error: "Please enter an answer." };

    const shortTitle = q.length > 85 ? `${q.slice(0, 82)}...` : q;
    const created = await prisma.aiBrainMemory.create({
      data: {
        category: params.category || "workflow",
        title: shortTitle,
        content: `Q: ${q}\nA (Management): ${a}`,
        tags: "owner-answer,verified",
        source: "admin_taught",
        confidence: 1.0,
        isActive: true,
        createdById: actor.id,
        createdByName: actor.name || actor.email || "Admin",
      },
    });
    return { success: true, data: created as AiBrainMemoryItem };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to save answer" };
  }
}

export async function askAiBrainAction(params: {
  question: string;
  history?: BrainChatTurn[];
  windowDays?: number;
  mode?: "learning" | "ops";
}): Promise<{
  success: boolean;
  data?: { answer: string; modelUsed: string; usedGemini: boolean };
  error?: string;
}> {
  try {
    await assertAiBrainAuthorized(false);
    const question = params.question.trim();
    if (!question) return { success: false, error: "Please enter a question" };

    await ensureAiBrainSchemaReady();
    const [telemetry, activeMemories, recentInsights, resolvedKey] = await Promise.all([
      collectOperationalTelemetry(params.windowDays || 7),
      prisma.aiBrainMemory.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
        take: 60,
      }),
      prisma.aiBrainInsight.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      loadResolvedGeminiApiKey(),
    ]);

    if (resolvedKey.apiKey) {
      try {
        const routing = await loadModelRoutingConfig();
        const res = await askAiBrainWithGemini({
          question,
          history: params.history || [],
          telemetry,
          memories: activeMemories.map((m) => ({
            id: m.id,
            category: m.category,
            title: m.title,
            content: m.content,
            source: m.source,
          })),
          recentInsights: recentInsights.map((i) => ({
            title: i.title,
            severity: i.severity,
            category: i.category,
            status: i.status,
            recommendation: i.recommendation,
          })),
          mode: params.mode || "learning",
          modelOverride: routing.chat,
          fallbackModel: routing.fallback,
          apiKeyOverride: resolvedKey.apiKey,
        });
        if (res) {
          return {
            success: true,
            data: { answer: res.answer, modelUsed: res.modelUsed, usedGemini: true },
          };
        }
      } catch (err: any) {
        console.warn("Gemini Q&A failed, falling back to telemetry summary:", err);
      }
    }

    // Deterministic telemetry answer fallback when GEMINI_API_KEY is not set
    const s = telemetry.summary;
    const topStages = telemetry.stageBreakdown
      .slice(0, 4)
      .map((st) => `• **${st.stage}**: ${st.count} active (${st.stuckCount} stuck, avg age ${st.avgAgeHours}h)`)
      .join("\n");
    const topBranches = telemetry.branchBreakdown
      .slice(0, 4)
      .map((b) => `• **${b.branchName}**: ${b.totalOrders} orders (${b.activeOrders} active, ${b.stuckOrders} stuck, ฿${b.revenue.toLocaleString()})`)
      .join("\n");

    const fallbackAnswer = `*(Built-in Telemetry Mode — add \`GEMINI_API_KEY\` in \`.env\` to enable full Gemini conversational reasoning)*

Here is the live operational snapshot for the last **${telemetry.windowDays} days** (Health Score: **${telemetry.healthScore}/100**):
• **Orders**: ${s.totalOrdersInWindow} total · ${s.activeOrdersNow} active · ${s.completedOrdersInWindow} completed (avg ${s.avgCompletionHours}h turnaround) · ฿${s.totalRevenueInWindow.toLocaleString()} revenue
• **Bottlenecks**: ${s.stuckOrdersNow} stuck/stale orders · ${s.overdueDeliveryNow} past scheduled delivery
• **Billing**: ${s.csoPaidShopUnpaid} CSO Paid + Shop Unpaid · ${s.noBillActive} active without bill · ${s.pendingWalletApprovals} pending wallet approvals
• **Tasks & Complaints**: ${s.openTasksCount} open tasks (${s.overdueTasksCount} overdue) · ${s.customerComplaintsInWindow} customer complaints logged

**Active Stage Funnel:**
${topStages || "• No active orders"}

**Branch Breakdown:**
${topBranches || "• No branch activity"}`;

    return {
      success: true,
      data: {
        answer: fallbackAnswer,
        modelUsed: "deterministic-telemetry",
        usedGemini: false,
      },
    };
  } catch (error: any) {
    console.error("askAiBrainAction failed:", error);
    return { success: false, error: error.message || "Failed to query AI Brain" };
  }
}
