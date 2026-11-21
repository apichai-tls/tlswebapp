"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Brain,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BookOpen,
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Send,
  Loader2,
  Activity,
  Building2,
  Truck,
  Receipt,
  ClipboardList,
  ShieldCheck,
  TrendingUp,
  Lightbulb,
  Check,
  Power,
  Search,
  GraduationCap,
  HelpCircle,
  FileText,
  MessagesSquare,
  CheckCheck,
  SlidersHorizontal,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getAiBrainDashboardAction,
  saveAiModelRoutingAction,
  saveTelegramAlertConfigAction,
  testTelegramAlertAction,
  runTelegramDelayAlertNowAction,
  runAiBrainScanAction,
  runBusinessStudyAction,
  learnFromTextSampleAction,
  verifyAiBrainMemoryAction,
  answerClarifyingQuestionAction,
  reviewAiBrainInsightAction,
  saveAiBrainMemoryAction,
  toggleAiBrainMemoryAction,
  deleteAiBrainMemoryAction,
  askAiBrainAction,
  type AiBrainInsightItem,
  type AiBrainMemoryItem,
  type AiBrainRunItem,
} from "@/actions/ai-brain";
import type { OperationalTelemetry } from "@/lib/ai-brain/telemetry";
import type {
  BusinessCoverageScores,
  ClarifyingQuestionItem,
} from "@/lib/ai-brain/gemini";
import {
  AVAILABLE_AI_MODELS,
  AI_TASK_DESCRIPTIONS,
  RECOMMENDED_MODEL_ROUTING,
  type AiModelRoutingConfig,
} from "@/lib/ai-brain/model-options";
import {
  DEFAULT_TELEGRAM_ALERT_CONFIG,
  type TelegramAlertConfig,
  type TelegramAlertHistoryEntry,
  type TelegramAlertSummary,
  type TelegramDiscoveredGroup,
} from "@/lib/ai-brain/telegram-alert-types";

const SEVERITY_STYLE: Record<
  string,
  { badge: string; border: string; label: string }
> = {
  critical: {
    badge: "bg-rose-100 text-rose-800 border-rose-300",
    border: "border-rose-200/90",
    label: "Critical",
  },
  warning: {
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    border: "border-amber-200/90",
    label: "Warning",
  },
  opportunity: {
    badge: "bg-indigo-100 text-indigo-800 border-indigo-300",
    border: "border-indigo-200/90",
    label: "Opportunity",
  },
  info: {
    badge: "bg-sky-100 text-sky-800 border-sky-300",
    border: "border-sky-200/90",
    label: "Info",
  },
};

const MEMORY_CATEGORIES = [
  { key: "business_profile", label: "Business Profile & Brands" },
  { key: "workflow", label: "Workflow & Handoffs" },
  { key: "customer_communication", label: "Customer Chat & Tone" },
  { key: "team_operations", label: "Team & Department Ops" },
  { key: "sop", label: "SOP & Quality Rules" },
  { key: "department", label: "Departments & Staff" },
  { key: "branch", label: "Branches & Multi-Brand" },
  { key: "customer_pattern", label: "Customer & CRM Patterns" },
  { key: "pricing", label: "Billing & Pricing" },
  { key: "correction", label: "Admin Corrections" },
];

const LEARNING_QUICK_PROMPTS = [
  "Summarize everything you understand about how That Laundry Shop works so far",
  "What do you know about our branches, services, and pricing?",
  "How do our staff currently handle customer complaints and garment issues?",
  "สรุปสิ่งที่ AI เข้าใจเกี่ยวกับการทำงานของร้านเราตอนนี้ และมีเรื่องไหนที่ยังไม่รู้บ้าง",
];

const OPS_QUICK_PROMPTS = [
  "Where are orders getting stuck right now and why?",
  "Summarize billing leaks (CSO Paid vs Shop Unpaid & missing bills)",
  "Which branch or rider is overloaded this week?",
  "สรุปปัญหาและข้อร้องเรียนลูกค้าที่ควรแก้ก่อนในสัปดาห์นี้",
];

const COVERAGE_META: Array<{
  key: keyof BusinessCoverageScores;
  label: string;
  hint: string;
}> = [
  { key: "organization", label: "Branches & Organization", hint: "Shop locations, areas, POS & fleet" },
  { key: "servicesAndPricing", label: "Services & Pricing", hint: "Catalog, member rates, vouchers, brands" },
  { key: "orderWorkflows", label: "Order Lifecycle", hint: "Channels, stages, billing & delivery flows" },
  { key: "teamOperations", label: "Team & Departments", hint: "Roles, shifts, task routing, riders" },
  { key: "customerCommunication", label: "Customer Chat & Tone", hint: "LINE/WhatsApp phrasing, CSO tone & style" },
  { key: "exceptionsAndQuality", label: "Complaints & Refunds", hint: "Garment issues, QC returns, refund policy" },
];

export function AdminAiBrain() {
  const [brainMode, setBrainMode] = useState<"learning" | "ops">("learning");
  const [subTab, setSubTab] = useState<"learn" | "overview" | "insights" | "memory" | "chat">("learn");
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(30);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [studying, setStudying] = useState(false);

  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; model: string }>({
    configured: false,
    model: "gemini-4-neon",
  });
  const [modelRouting, setModelRouting] = useState<AiModelRoutingConfig>(RECOMMENDED_MODEL_ROUTING);
  const [routingDraft, setRoutingDraft] = useState<AiModelRoutingConfig>(RECOMMENDED_MODEL_ROUTING);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [routingPanelOpen, setRoutingPanelOpen] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);

  // Telegram Management Alert state
  const [tgPanelOpen, setTgPanelOpen] = useState(false);
  const [tgConfig, setTgConfig] = useState<TelegramAlertConfig>(DEFAULT_TELEGRAM_ALERT_CONFIG);
  const [tgDraft, setTgDraft] = useState<TelegramAlertConfig>(DEFAULT_TELEGRAM_ALERT_CONFIG);
  const [tgEnv, setTgEnv] = useState<{
    hasSocialBotToken: boolean;
    hasEnvBotToken: boolean;
    groups: TelegramDiscoveredGroup[];
  }>({ hasSocialBotToken: false, hasEnvBotToken: false, groups: [] });
  const [tgPreview, setTgPreview] = useState<TelegramAlertSummary | null>(null);
  const [tgHistory, setTgHistory] = useState<TelegramAlertHistoryEntry[]>([]);
  const [savingTg, setSavingTg] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const [sendingAlertNow, setSendingAlertNow] = useState(false);

  const [telemetry, setTelemetry] = useState<OperationalTelemetry | null>(null);
  const [runs, setRuns] = useState<AiBrainRunItem[]>([]);
  const [insights, setInsights] = useState<AiBrainInsightItem[]>([]);
  const [memories, setMemories] = useState<AiBrainMemoryItem[]>([]);

  // Learning mode state
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedDrafts = sessionStorage.getItem("tls_ai_brain_question_drafts");
        if (savedDrafts) return JSON.parse(savedDrafts);
      } catch {}
    }
    return {};
  });
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, string>>({});
  const [editingQuestionIds, setEditingQuestionIds] = useState<Record<string, boolean>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [textLearnerOpen, setTextLearnerOpen] = useState(false);
  const [textSourceType, setTextSourceType] = useState<"customer_chat" | "sop_doc" | "staff_note">("customer_chat");
  const [textTitle, setTextTitle] = useState("");
  const [textRaw, setTextRaw] = useState("");
  const [learningText, setLearningText] = useState(false);
  const [memorySourceFilter, setMemorySourceFilter] = useState<"all" | "ai_learned" | "verified">("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Insight filters & feedback drafts
  const [insightFilter, setInsightFilter] = useState<"all" | "new" | "approved" | "implemented" | "dismissed">("all");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Memory form state
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryCatFilter, setMemoryCatFilter] = useState<string>("all");
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memCategory, setMemCategory] = useState("workflow");
  const [memTitle, setMemTitle] = useState("");
  const [memContent, setMemContent] = useState("");
  const [memTags, setMemTags] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string; model?: string }>
  >(() => {
    if (typeof window !== "undefined") {
      try {
        const savedChat = sessionStorage.getItem("tls_ai_brain_chat_history");
        if (savedChat) {
          const parsed = JSON.parse(savedChat);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [
      {
        role: "assistant",
        content:
          "Hello! I am currently in **Business Learning Mode** 🧠. My job right now is simply to study how That Laundry Shop works — your branches, services, order flows, internal notes, and how you chat with customers — before proposing any changes.\n\nTest what I understand so far, or teach me how you handle customers in English or Thai!",
      },
    ];
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tls_ai_brain_mode");
      const savedSubTab = sessionStorage.getItem("tls_ai_brain_subtab") as any;
      if (saved === "ops") {
        setBrainMode("ops");
        setSubTab(
          savedSubTab && ["overview", "insights", "memory", "chat"].includes(savedSubTab)
            ? savedSubTab
            : "overview"
        );
      } else if (savedSubTab && ["learn", "memory", "chat"].includes(savedSubTab)) {
        setSubTab(savedSubTab);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("tls_ai_brain_subtab", subTab);
    } catch {}
  }, [subTab]);

  useEffect(() => {
    try {
      sessionStorage.setItem("tls_ai_brain_chat_history", JSON.stringify(chatMessages));
    } catch {}
  }, [chatMessages]);

  const switchBrainMode = (nextMode: "learning" | "ops") => {
    setBrainMode(nextMode);
    try {
      localStorage.setItem("tls_ai_brain_mode", nextMode);
    } catch {}
    if (nextMode === "learning") {
      if (subTab === "overview" || subTab === "insights") setSubTab("learn");
    } else {
      if (subTab === "learn") setSubTab("overview");
    }
  };

  const loadDashboard = async (days: number = windowDays) => {
    setLoading(true);
    try {
      const res = await getAiBrainDashboardAction(days);
      if (res.success && res.data) {
        setGeminiStatus(res.data.geminiStatus);
        if (res.data.modelRouting) {
          setModelRouting(res.data.modelRouting);
          setRoutingDraft(res.data.modelRouting);
        }
        if (res.data.telegramAlerts) {
          setTgConfig(res.data.telegramAlerts.config);
          setTgDraft(res.data.telegramAlerts.config);
          setTgEnv(res.data.telegramAlerts.env);
          setTgPreview(res.data.telegramAlerts.preview);
          setTgHistory(res.data.telegramAlerts.history);
        }
        setTelemetry(res.data.liveTelemetry);
        setRuns(res.data.runs);
        setInsights(res.data.insights);
        setMemories(res.data.memories);
      } else {
        toast.error(res.error || "Failed to load AI Brain data");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load AI Brain");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveModelRouting = async () => {
    setSavingRouting(true);
    try {
      const res = await saveAiModelRoutingAction({
        ...routingDraft,
        ...(geminiApiKeyInput.trim() ? { geminiApiKey: geminiApiKeyInput.trim() } : {}),
      });
      if (res.success && res.data) {
        setModelRouting(res.data);
        setRoutingDraft(res.data);
        if (res.geminiConfigured) {
          setGeminiStatus({ configured: true, model: res.data.study });
        }
        setGeminiApiKeyInput("");
        toast.success("AI Model Routing & Gemini connection saved!");
        setRoutingPanelOpen(false);
      } else {
        toast.error(res.error || "Failed to save model routing");
      }
    } finally {
      setSavingRouting(false);
    }
  };

  const handleSaveTgConfig = async () => {
    setSavingTg(true);
    try {
      const res = await saveTelegramAlertConfigAction(tgDraft);
      if (res.success && res.data) {
        setTgConfig(res.data.config);
        setTgDraft(res.data.config);
        setTgPreview(res.data.preview);
        toast.success("Management Telegram Alert settings saved!");
      } else {
        toast.error(res.error || "Failed to save Telegram alert settings");
      }
    } finally {
      setSavingTg(false);
    }
  };

  const handleTestTg = async () => {
    setTestingTg(true);
    try {
      // Save draft first so test uses the latest chatId/token
      const saveRes = await saveTelegramAlertConfigAction(tgDraft);
      if (saveRes.success && saveRes.data) {
        setTgConfig(saveRes.data.config);
        setTgPreview(saveRes.data.preview);
      }
      const res = await testTelegramAlertAction();
      if (res.history) setTgHistory(res.history);
      if (res.success) {
        toast.success("Test alert delivered to Management Telegram!");
      } else {
        toast.error(res.error || "Telegram test failed");
      }
    } finally {
      setTestingTg(false);
    }
  };

  const handleSendTgAlertNow = async () => {
    setSendingAlertNow(true);
    try {
      const saveRes = await saveTelegramAlertConfigAction(tgDraft);
      if (saveRes.success && saveRes.data) {
        setTgConfig(saveRes.data.config);
        setTgPreview(saveRes.data.preview);
      }
      const res = await runTelegramDelayAlertNowAction(true);
      if (res.preview) setTgPreview(res.preview);
      if (res.history) setTgHistory(res.history);
      if (res.success && res.sent) {
        toast.success(`Sent Management Telegram alert (${res.notifiedCount} active issue(s))!`);
      } else if (res.success && !res.sent) {
        toast.info(res.skippedReason || "No delays detected to alert right now.");
      } else {
        toast.error(res.error || "Failed to send Telegram delay alert");
      }
    } finally {
      setSendingAlertNow(false);
    }
  };

  useEffect(() => {
    loadDashboard(windowDays);
  }, [windowDays]);

  const handleRunScan = async () => {
    setScanning(true);
    try {
      const res = await runAiBrainScanAction(windowDays);
      if (res.success && res.data) {
        toast.success(
          res.data.usedGemini
            ? `AI Brain scan complete via ${res.data.run.modelUsed} (${res.data.insights.length} insights${res.data.learnedMemoriesCount > 0 ? `, +${res.data.learnedMemoriesCount} new memories` : ""})`
            : `Telemetry scan complete (${res.data.insights.length} insights generated)`
        );
        await loadDashboard(windowDays);
        setSubTab("insights");
      } else {
        toast.error(res.error || "Scan failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleReviewInsight = async (
    insightId: string,
    status: "approved" | "implemented" | "dismissed"
  ) => {
    setReviewingId(insightId);
    try {
      const note = (feedbackDrafts[insightId] || "").trim();
      const res = await reviewAiBrainInsightAction({
        insightId,
        status,
        adminFeedback: note || undefined,
        teachMemory: Boolean(note) || status === "implemented",
      });
      if (res.success && res.data) {
        setInsights((prev) =>
          prev.map((i) => (i.id === insightId ? res.data!.insight : i))
        );
        if (res.data.createdMemory) {
          setMemories((prev) => [res.data!.createdMemory!, ...prev]);
          toast.success(`Insight marked ${status} & learned into Business Memory!`);
        } else {
          toast.success(`Insight marked ${status}`);
        }
        setFeedbackDrafts((prev) => ({ ...prev, [insightId]: "" }));
      } else {
        toast.error(res.error || "Failed to update insight");
      }
    } finally {
      setReviewingId(null);
    }
  };

  const openNewMemory = () => {
    setEditingMemoryId(null);
    setMemCategory("workflow");
    setMemTitle("");
    setMemContent("");
    setMemTags("");
    setMemoryModalOpen(true);
  };

  const openEditMemory = (m: AiBrainMemoryItem) => {
    setEditingMemoryId(m.id);
    setMemCategory(m.category);
    setMemTitle(m.title);
    setMemContent(m.content);
    setMemTags(m.tags || "");
    setMemoryModalOpen(true);
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memTitle.trim() || !memContent.trim()) {
      toast.error("Please enter both title and rule/knowledge details");
      return;
    }
    setSavingMemory(true);
    try {
      const res = await saveAiBrainMemoryAction({
        id: editingMemoryId || undefined,
        category: memCategory,
        title: memTitle,
        content: memContent,
        tags: memTags,
      });
      if (res.success && res.data) {
        if (editingMemoryId) {
          setMemories((prev) => prev.map((m) => (m.id === editingMemoryId ? res.data! : m)));
          toast.success("Updated Business Memory");
        } else {
          setMemories((prev) => [res.data!, ...prev]);
          toast.success("Taught new rule to AI Brain Memory!");
        }
        setMemoryModalOpen(false);
      } else {
        toast.error(res.error || "Failed to save memory");
      }
    } finally {
      setSavingMemory(false);
    }
  };

  const handleToggleMemory = async (m: AiBrainMemoryItem) => {
    const res = await toggleAiBrainMemoryAction(m.id, !m.isActive);
    if (res.success && res.data) {
      setMemories((prev) => prev.map((item) => (item.id === m.id ? res.data! : item)));
      toast.success(res.data.isActive ? "Memory activated" : "Memory paused");
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm("Delete this Business Brain Memory entry?")) return;
    const res = await deleteAiBrainMemoryAction(id);
    if (res.success) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast.success("Memory removed");
    }
  };

  const handleRunBusinessStudy = async () => {
    setStudying(true);
    try {
      const res = await runBusinessStudyAction(windowDays);
      if (res.success && res.data) {
        toast.success(
          `Business Study complete via ${res.data.modelUsed}! Learned +${res.data.newMemories.length} new facts & prepared ${res.data.clarifyingQuestions.length} questions.`
        );
        await loadDashboard(windowDays);
        setSubTab("learn");
      } else {
        toast.error(res.error || "Business study failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "Business study failed");
    } finally {
      setStudying(false);
    }
  };

  const handleLearnFromText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (textRaw.trim().length < 20) {
      toast.error("Please paste at least 20 characters of customer chat or SOP notes.");
      return;
    }
    setLearningText(true);
    try {
      const res = await learnFromTextSampleAction({
        sourceType: textSourceType,
        title: textTitle,
        rawText: textRaw,
      });
      if (res.success && res.data) {
        setMemories((prev) => [...res.data!.newMemories, ...prev]);
        toast.success(
          `AI learned ${res.data.newMemories.length} new rules from your ${textSourceType === "customer_chat" ? "customer chat" : "document"}!`
        );
        setTextTitle("");
        setTextRaw("");
        setTextLearnerOpen(false);
      } else {
        toast.error(res.error || "Failed to learn from sample");
      }
    } finally {
      setLearningText(false);
    }
  };

  const handleVerifyMemory = async (id: string) => {
    setVerifyingId(id);
    try {
      const res = await verifyAiBrainMemoryAction(id);
      if (res.success && res.data) {
        setMemories((prev) => prev.map((m) => (m.id === id ? res.data! : m)));
        toast.success("Confirmed as verified business knowledge!");
      } else {
        toast.error(res.error || "Failed to verify");
      }
    } finally {
      setVerifyingId(null);
    }
  };

  useEffect(() => {
    try {
      sessionStorage.setItem("tls_ai_brain_question_drafts", JSON.stringify(questionAnswers));
    } catch {}
  }, [questionAnswers]);

  const handleAnswerQuestion = async (q: ClarifyingQuestionItem) => {
    const answer = (questionAnswers[q.id] || "").trim();
    if (!answer) {
      toast.error("Please type your answer first");
      return;
    }
    setSavingQuestionId(q.id);
    try {
      const res = await answerClarifyingQuestionAction({
        questionId: q.id,
        runId: latestLearningRun?.id,
        question: q.question,
        answer,
        category: q.category,
      });
      if (res.success && res.data) {
        setMemories((prev) => {
          const exists = prev.some((m) => m.id === res.data!.id);
          return exists
            ? prev.map((m) => (m.id === res.data!.id ? res.data! : m))
            : [res.data!, ...prev];
        });
        setAnsweredQuestions((prev) => ({ ...prev, [q.id]: answer }));
        setEditingQuestionIds((prev) => ({ ...prev, [q.id]: false }));
        setQuestionAnswers((prev) => {
          const next = { ...prev };
          delete next[q.id];
          return next;
        });
        toast.success("Saved to AI Brain Memory! The AI now knows this.");
      } else {
        toast.error(res.error || "Failed to save answer");
      }
    } finally {
      setSavingQuestionId(null);
    }
  };

  const handleAskBrain = async (customQuestion?: string) => {
    const q = (customQuestion ?? chatInput).trim();
    if (!q || chatLoading) return;
    const nextHistory = [...chatMessages, { role: "user" as const, content: q }];
    setChatMessages(nextHistory);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await askAiBrainAction({
        question: q,
        history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        windowDays,
        mode: brainMode,
      });
      if (res.success && res.data) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.data!.answer,
            model: res.data!.modelUsed,
          },
        ]);
      } else {
        toast.error(res.error || "AI Brain query failed");
      }
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveChatToMemory = (content: string) => {
    setEditingMemoryId(null);
    setMemCategory("workflow");
    setMemTitle("");
    setMemContent(content);
    setMemTags("from-chat");
    setMemoryModalOpen(true);
    setSubTab("memory");
  };

  const filteredInsights = useMemo(() => {
    if (insightFilter === "all") return insights;
    return insights.filter((i) => i.status === insightFilter);
  }, [insights, insightFilter]);

  const filteredMemories = useMemo(() => {
    const q = memorySearch.trim().toLowerCase();
    return memories.filter((m) => {
      if (memoryCatFilter !== "all" && m.category !== memoryCatFilter) return false;
      if (memorySourceFilter === "ai_learned" && m.source !== "ai_learned") return false;
      if (memorySourceFilter === "verified" && m.source === "ai_learned") return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        (m.tags || "").toLowerCase().includes(q)
      );
    });
  }, [memories, memorySearch, memoryCatFilter, memorySourceFilter]);

  const latestLearningRun = useMemo(() => {
    return runs.find((r) => r.status === "learning_completed") || null;
  }, [runs]);

  const latestLearningPayload = useMemo(() => {
    if (!latestLearningRun?.metricsJson) return null;
    try {
      const parsed = JSON.parse(latestLearningRun.metricsJson);
      if (parsed?.mode === "learning") {
        return parsed as {
          mode: "learning";
          corpusStats?: {
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
          coverageScores?: BusinessCoverageScores;
          clarifyingQuestions?: ClarifyingQuestionItem[];
        };
      }
    } catch {}
    return null;
  }, [latestLearningRun]);

  // Match clarifying questions against both persisted run metadata AND existing AiBrainMemory rows
  // so previously answered questions remain marked as "Taught to AI" even after switching tabs or reloading.
  const resolvedAnswersByQuestionId = useMemo(() => {
    const map: Record<string, string> = {};
    const questions = latestLearningPayload?.clarifyingQuestions || [];
    for (const q of questions) {
      if (answeredQuestions[q.id]) {
        map[q.id] = answeredQuestions[q.id];
        continue;
      }
      if (q.answered && q.answer) {
        map[q.id] = q.answer;
        continue;
      }
      const cleanQ = (q.question || "").trim();
      if (!cleanQ) continue;
      const shortPrefix = cleanQ.length > 85 ? cleanQ.slice(0, 82).toLowerCase() : cleanQ.toLowerCase();
      const matchedMem = memories.find((m) => {
        const content = (m.content || "").trim();
        if (content.startsWith(`Q: ${cleanQ}\n`)) return true;
        if ((m.tags || "").includes("owner-answer") && (m.title || "").trim().toLowerCase().startsWith(shortPrefix)) {
          return true;
        }
        return false;
      });
      if (matchedMem) {
        const marker = "\nA (Management):";
        const idx = matchedMem.content.indexOf(marker);
        map[q.id] = idx !== -1 ? matchedMem.content.slice(idx + marker.length).trim() : matchedMem.content;
      }
    }
    return map;
  }, [latestLearningPayload, answeredQuestions, memories]);

  const latestRun = runs.find((r) => r.status !== "learning_completed") || runs[0] || null;
  const newInsightsCount = insights.filter((i) => i.status === "new").length;
  const activeMemoriesCount = memories.filter((m) => m.isActive).length;
  const unverifiedLearnedCount = memories.filter((m) => m.source === "ai_learned" && m.isActive).length;
  const overallCoveragePct = useMemo(() => {
    const cs = latestLearningPayload?.coverageScores;
    if (!cs) return 0;
    const vals = Object.values(cs);
    return Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length));
  }, [latestLearningPayload]);

  return (
    <div className="space-y-5 pb-10">
      {/* Top Executive Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-md border border-indigo-900/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
                {brainMode === "learning" ? (
                  <GraduationCap className="w-5 h-5 text-emerald-300" />
                ) : (
                  <Brain className="w-5 h-5 text-indigo-300" />
                )}
              </div>
              <h1 className="text-xl font-black tracking-tight">
                {brainMode === "learning" ? "TLS AI Business Brain" : "TLS AI Operations Brain"}
              </h1>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  brainMode === "learning"
                    ? "bg-sky-500/20 text-sky-200 border-sky-400/40"
                    : "bg-violet-500/20 text-violet-200 border-violet-400/40"
                }`}
              >
                {brainMode === "learning" ? "Learning Mode First" : "Ops Proposals Mode"}
              </span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  geminiStatus.configured
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/40"
                    : "bg-amber-500/20 text-amber-200 border-amber-400/40"
                }`}
              >
                {geminiStatus.configured
                  ? `Study: ${modelRouting.study} · Chat: ${modelRouting.chat}`
                  : "Telemetry Mode (Add GEMINI_API_KEY in .env)"}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-indigo-100 border border-white/15 flex items-center gap-1">
                <ShieldCheck size={11} /> Admin &amp; Management Only
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl">
              {brainMode === "learning"
                ? "Pure observation & learning mode: studies your real Orders, Job Notes, Task Chats, Services, Branches & Staff to understand how That Laundry Shop works before proposing changes."
                : "Operational analyst mode: detects workflow bottlenecks, billing leaks, rider/branch imbalances, and proposes workflow improvements."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switcher */}
            <div className="flex items-center bg-white/10 rounded-xl p-1 border border-white/15 text-[11px]">
              <button
                type="button"
                onClick={() => switchBrainMode("learning")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  brainMode === "learning"
                    ? "bg-emerald-500 text-white shadow-xs"
                    : "text-slate-200 hover:text-white"
                }`}
              >
                <GraduationCap size={12} />
                <span>Learn First</span>
              </button>
              <button
                type="button"
                onClick={() => switchBrainMode("ops")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  brainMode === "ops"
                    ? "bg-indigo-500 text-white shadow-xs"
                    : "text-slate-200 hover:text-white"
                }`}
              >
                <Lightbulb size={12} />
                <span>Ops Proposals</span>
              </button>
            </div>

            <div className="flex items-center bg-white/10 rounded-xl p-1 border border-white/15 text-xs">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setWindowDays(d)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    windowDays === d
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-200 hover:text-white"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {brainMode === "learning" ? (
              <Button
                type="button"
                size="sm"
                disabled={studying}
                onClick={handleRunBusinessStudy}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl h-9 px-4 gap-1.5 cursor-pointer shadow-sm"
              >
                {studying ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <GraduationCap size={14} />
                )}
                <span>{studying ? "Studying System Data..." : "Study System Data"}</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={scanning}
                onClick={handleRunScan}
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl h-9 px-4 gap-1.5 cursor-pointer shadow-sm"
              >
                {scanning ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                <span>{scanning ? "Analyzing Business..." : "Run AI Ops Scan"}</span>
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setTgDraft(tgConfig);
                setTgPanelOpen((v) => !v);
                setRoutingPanelOpen(false);
              }}
              className={`rounded-xl h-9 px-3 text-xs font-bold gap-1.5 cursor-pointer border ${
                tgPanelOpen
                  ? "bg-white text-slate-900 border-white"
                  : "text-slate-100 hover:text-white hover:bg-white/10 border-white/15"
              }`}
              title="Management Telegram alerts for processing & delivery delays"
            >
              <BellRing size={13} className={tgConfig.enabled ? "text-emerald-300" : ""} />
              <span>Telegram Alerts</span>
              {(tgPreview?.totalIssues ?? 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white">
                  {tgPreview!.totalIssues}
                </span>
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRoutingDraft(modelRouting);
                setRoutingPanelOpen((v) => !v);
                setTgPanelOpen(false);
              }}
              className={`rounded-xl h-9 px-3 text-xs font-bold gap-1.5 cursor-pointer border ${
                routingPanelOpen
                  ? "bg-white text-slate-900 border-white"
                  : "text-slate-100 hover:text-white hover:bg-white/10 border-white/15"
              }`}
              title="Configure AI models per task"
            >
              <SlidersHorizontal size={13} />
              <span>Models</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => loadDashboard(windowDays)}
              className="text-slate-200 hover:text-white hover:bg-white/10 rounded-xl h-9 px-3 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
      </div>

      {/* Collapsible Multi-Model Routing Panel */}
      {routingPanelOpen && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                <SlidersHorizontal size={15} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  AI Model Routing (Different Models for Different Tasks)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Assign flagship reasoning models to deep analysis and fast high-quota models to chat &amp; extraction. Changes apply immediately with zero restart.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRoutingPanelOpen(false)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold px-2 py-1 cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="text-xs font-black text-emerald-950">
                Gemini API Key {geminiStatus.configured ? "(Connected ✓)" : "(Required for Live AI)"}
              </div>
              <div className="text-[11px] text-emerald-900/75">
                {geminiStatus.configured
                  ? "Already configured. Leave blank to keep your existing key, or paste a new key to update."
                  : "Paste your Google AI Studio / Gemini API key here to activate Gemini 4 Neon & Hydrogen on this server."}
              </div>
            </div>
            <Input
              type="password"
              value={geminiApiKeyInput}
              onChange={(e) => setGeminiApiKeyInput(e.target.value)}
              placeholder={geminiStatus.configured ? "•••••••••••••••• (keep existing)" : "Paste Gemini API Key..."}
              className="h-9 text-xs bg-white font-mono sm:w-80"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {AI_TASK_DESCRIPTIONS.map((task) => (
              <div
                key={task.key}
                className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-2"
              >
                <div>
                  <div className="text-xs font-black text-slate-900">{task.label}</div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{task.hint}</div>
                </div>
                <select
                  value={routingDraft[task.key]}
                  onChange={(e) =>
                    setRoutingDraft((prev) => ({
                      ...prev,
                      [task.key]: e.target.value,
                    }))
                  }
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {AVAILABLE_AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} [{m.tier}] — {m.id}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRoutingDraft(RECOMMENDED_MODEL_ROUTING)}
              className="rounded-xl text-xs font-bold cursor-pointer"
            >
              Reset to Recommended (Neon + Hydrogen)
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRoutingPanelOpen(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={savingRouting}
                onClick={handleSaveModelRouting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold px-4 gap-1.5 cursor-pointer"
              >
                {savingRouting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>{savingRouting ? "Saving..." : "Save Model Routing"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Management Telegram Delay & Issue Alerts Panel */}
      {tgPanelOpen && (
        <div className="bg-white border border-sky-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center">
                <BellRing size={15} className="text-sky-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-slate-900">
                    Management Telegram Alerts (Order Processing &amp; Delivery Delays)
                  </h2>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      tgDraft.enabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                  >
                    {tgDraft.enabled ? "AUTO-ALERTS ON" : "PAUSED"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Automatically notifies Management on Telegram when orders get delayed in processing, miss delivery/pickup windows, are flagged STUCK, or have urgent complaints.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTgPanelOpen(false)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold px-2 py-1 cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* Left: Telegram Destination & Thresholds */}
            <div className="space-y-3 bg-slate-50/70 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-800">1. Telegram Bot &amp; Management Group</span>
                <label className="inline-flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tgDraft.enabled}
                    onChange={(e) => setTgDraft((p) => ({ ...p, enabled: e.target.checked }))}
                    className="rounded border-slate-300"
                  />
                  <span>Enable Auto-Alerts</span>
                </label>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Management Telegram Chat / Group ID *
                </label>
                <Input
                  value={tgDraft.managementChatId}
                  onChange={(e) => setTgDraft((p) => ({ ...p, managementChatId: e.target.value }))}
                  placeholder="e.g. -1001234567890 (Group ID) or your personal Telegram ID"
                  className="h-9 text-xs bg-white font-mono"
                />
                {tgEnv.groups.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-500 font-semibold">Detected groups:</span>
                    {tgEnv.groups.map((g) => (
                      <button
                        key={g.chatId}
                        type="button"
                        onClick={() => setTgDraft((p) => ({ ...p, managementChatId: g.chatId }))}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer ${
                          tgDraft.managementChatId === g.chatId
                            ? "bg-sky-600 text-white border-sky-600"
                            : "bg-white text-sky-700 border-sky-200 hover:bg-sky-50"
                        }`}
                      >
                        {g.name} ({g.chatId})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Telegram Bot Token (Optional Override)
                </label>
                <Input
                  type="password"
                  value={tgDraft.botToken}
                  onChange={(e) => setTgDraft((p) => ({ ...p, botToken: e.target.value }))}
                  placeholder={
                    tgEnv.hasSocialBotToken || tgEnv.hasEnvBotToken
                      ? "Leave blank to reuse your existing Social Inbox / env Bot Token ✓"
                      : "Paste Bot Token from @BotFather (e.g. 123456:ABC...)"
                  }
                  className="h-9 text-xs bg-white font-mono"
                />
                {(tgEnv.hasSocialBotToken || tgEnv.hasEnvBotToken) && !tgDraft.botToken && (
                  <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                    ✓ Existing Telegram Bot Token detected automatically ({tgEnv.hasSocialBotToken ? "Social Inbox Config" : ".env"}).
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Processing &gt; (hrs)
                  </label>
                  <Input
                    type="number"
                    min={2}
                    max={168}
                    value={tgDraft.processingDelayHours}
                    onChange={(e) =>
                      setTgDraft((p) => ({ ...p, processingDelayHours: Number(e.target.value) || 24 }))
                    }
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Delivery late (min)
                  </label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={tgDraft.deliveryOverdueMinutes}
                    onChange={(e) =>
                      setTgDraft((p) => ({ ...p, deliveryOverdueMinutes: Number(e.target.value) || 30 }))
                    }
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Pickup late (min)
                  </label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={tgDraft.pickupOverdueMinutes}
                    onChange={(e) =>
                      setTgDraft((p) => ({ ...p, pickupOverdueMinutes: Number(e.target.value) || 45 }))
                    }
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Cooldown (min)
                  </label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={tgDraft.cooldownMinutes}
                    onChange={(e) =>
                      setTgDraft((p) => ({ ...p, cooldownMinutes: Number(e.target.value) || 120 }))
                    }
                    className="h-8 text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px]">
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tgDraft.includeStuckFlag}
                    onChange={(e) => setTgDraft((p) => ({ ...p, includeStuckFlag: e.target.checked }))}
                  />
                  <span>Alert on STUCK / QC-returned orders</span>
                </label>
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tgDraft.includeUrgentComplaints}
                    onChange={(e) =>
                      setTgDraft((p) => ({ ...p, includeUrgentComplaints: e.target.checked }))
                    }
                  />
                  <span>Alert on Urgent / Overdue Tasks</span>
                </label>
              </div>
            </div>

            {/* Right: Live Detected Delays Preview + Recent History */}
            <div className="space-y-3 bg-slate-50/70 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800">2. Live Delay &amp; Issue Radar</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    {tgPreview?.totalIssues ?? 0} Active Issue(s)
                  </span>
                </div>

                {tgPreview && (
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    {[
                      { label: "Delivery", val: tgPreview.deliveryOverdueCount, tone: "text-rose-600" },
                      { label: "Processing", val: tgPreview.processingDelayCount, tone: "text-amber-600" },
                      { label: "Stuck", val: tgPreview.stuckOrdersCount, tone: "text-rose-700" },
                      { label: "Pickup", val: tgPreview.pickupOverdueCount, tone: "text-orange-600" },
                      { label: "Urgent Task", val: tgPreview.urgentTasksCount, tone: "text-indigo-600" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white border border-slate-200 rounded-lg py-1.5 px-1">
                        <div className={`text-sm font-black ${s.val > 0 ? s.tone : "text-slate-400"}`}>
                          {s.val}
                        </div>
                        <div className="text-[9px] font-bold text-slate-500">{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {tgPreview && tgPreview.items.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {tgPreview.items.slice(0, 6).map((item) => (
                      <div
                        key={item.key}
                        className="bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="truncate">
                          <span className="font-black text-slate-800">
                            {item.orderId ? `#${item.orderId}` : "Task"}
                          </span>{" "}
                          <span className="text-slate-600">
                            {item.customerName ? `(${item.customerName})` : item.detail}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.severity === "critical"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {item.delayLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-[11px] text-emerald-800 font-semibold">
                    ✓ All clear! No orders are currently exceeding your processing or delivery thresholds.
                  </div>
                )}

                {tgHistory.length > 0 && (
                  <div className="pt-1 border-t border-slate-200/80 space-y-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Recent Sent Alerts</div>
                    {tgHistory.slice(0, 3).map((h) => (
                      <div key={h.id} className="flex items-center justify-between text-[10px] text-slate-600">
                        <span className="truncate">
                          {h.delivered ? "✅" : "❌"} {h.preview}
                          {h.error ? ` (${h.error})` : ""}
                        </span>
                        <span className="shrink-0 text-slate-400 ml-2">
                          {new Date(h.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[10px] text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono">
                Auto-Cron Endpoint: GET /api/cron/ops-alerts?token=CRON_SECRET
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={testingTg || !tgDraft.managementChatId.trim()}
                onClick={handleTestTg}
                className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
              >
                {testingTg ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                <span>{testingTg ? "Sending Test..." : "Send Test Ping"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={sendingAlertNow || !tgDraft.managementChatId.trim()}
                onClick={handleSendTgAlertNow}
                className="rounded-xl text-xs font-bold border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 gap-1.5 cursor-pointer"
              >
                {sendingAlertNow ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />}
                <span>{sendingAlertNow ? "Checking & Sending..." : "Send Delay Alert Now"}</span>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setTgPanelOpen(false)}
                className="rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={savingTg}
                onClick={handleSaveTgConfig}
                className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold px-4 gap-1.5 cursor-pointer"
              >
                {savingTg ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>{savingTg ? "Saving..." : "Save Alert Settings"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        {(brainMode === "learning"
          ? [
              { id: "learn", label: "Business Understanding", icon: GraduationCap },
              {
                id: "memory",
                label: `Learned Knowledge (${activeMemoriesCount}${unverifiedLearnedCount > 0 ? ` · ${unverifiedLearnedCount} to review` : ""})`,
                icon: BookOpen,
              },
              { id: "chat", label: "Test & Teach AI Chat", icon: MessageSquare },
            ]
          : [
              { id: "overview", label: "Overview & Bottlenecks", icon: Activity },
              {
                id: "insights",
                label: `Improvement Proposals (${newInsightsCount} new)`,
                icon: Lightbulb,
              },
              {
                id: "memory",
                label: `Business Brain Memory (${activeMemoriesCount})`,
                icon: BookOpen,
              },
              { id: "chat", label: "Ask AI Brain", icon: MessageSquare },
            ]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as any)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                active
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading && !telemetry ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={18} className="animate-spin text-indigo-600" />
          <span>Loading AI Brain knowledge &amp; system data...</span>
        </div>
      ) : null}

      {/* ===================================================================== */}
      {/* LEARNING TAB: BUSINESS UNDERSTANDING & CLARIFYING QUESTIONS           */}
      {/* ===================================================================== */}
      {subTab === "learn" && (
        <div className="space-y-5">
          {!latestLearningRun ? (
            <div className="bg-white border border-emerald-200 rounded-2xl p-8 text-center space-y-4 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
                <GraduationCap className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="space-y-1.5 max-w-xl mx-auto">
                <h2 className="text-lg font-black text-slate-900">
                  Ready to Study That Laundry Shop&apos;s System Data
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Click <strong>&ldquo;Study System Data&rdquo;</strong> to let <strong>{geminiStatus.model}</strong> read your real Branches, Services, Pricing, Staff, Departments, recent Orders, Job Notes, Task Conversations, Refunds, and Activity Logs ({windowDays}-day window). It will build your initial Business Knowledge Base and ask you clarifying questions — without pitching unsolicited changes yet.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  disabled={studying}
                  onClick={handleRunBusinessStudy}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-6 h-10 text-xs gap-2 cursor-pointer shadow-sm"
                >
                  {studying ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <GraduationCap size={15} />
                  )}
                  <span>{studying ? "Studying Your Business Data..." : `Study Last ${windowDays} Days of System Data`}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setTextLearnerOpen(true);
                    setSubTab("memory");
                  }}
                  className="rounded-xl h-10 px-4 text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <MessagesSquare size={14} />
                  <span>Paste Customer Chat / SOP</span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Top Learning Progress & Corpus Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GraduationCap size={17} className="text-emerald-600" />
                      <h2 className="text-sm font-black text-slate-900">
                        What the AI Understands About Your Business
                      </h2>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">
                      Studied {new Date(latestLearningRun.createdAt).toLocaleString()} · {latestLearningRun.modelUsed}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                    {latestLearningRun.executiveSummary}
                  </p>
                  {latestLearningPayload?.corpusStats && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {[
                        { label: "Branches", val: latestLearningPayload.corpusStats.branches },
                        { label: "Departments", val: latestLearningPayload.corpusStats.departments },
                        { label: "Active Staff", val: latestLearningPayload.corpusStats.activeStaff },
                        { label: "Riders", val: latestLearningPayload.corpusStats.activeRiders },
                        { label: "Services", val: latestLearningPayload.corpusStats.serviceItems },
                        { label: `Jobs (${latestLearningRun.windowDays}d)`, val: latestLearningPayload.corpusStats.jobsStudied },
                        { label: "Task Chats", val: latestLearningPayload.corpusStats.tasksStudied },
                        { label: "Customers", val: latestLearningPayload.corpusStats.customersTotal },
                      ].map((stat) => (
                        <span
                          key={stat.label}
                          className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-700"
                        >
                          <strong className="text-slate-900">{stat.val.toLocaleString()}</strong> {stat.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Business Understanding Meter */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900">Business Knowledge Meter</h3>
                    <span className="text-lg font-black text-emerald-600">{overallCoveragePct}%</span>
                  </div>
                  <div className="space-y-2.5">
                    {COVERAGE_META.map((item) => {
                      const pct = latestLearningPayload?.coverageScores?.[item.key] ?? 0;
                      const barColor =
                        pct >= 75
                          ? "bg-emerald-500"
                          : pct >= 50
                          ? "bg-sky-500"
                          : "bg-amber-400";
                      return (
                        <div key={item.key} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-700">{item.label}</span>
                            <span className="font-black text-slate-900">{pct}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 pt-1">
                    Answer the AI&apos;s questions below or paste real LINE/WhatsApp chat samples to raise Customer Chat &amp; Tone understanding.
                  </p>
                </div>
              </div>

              {/* Clarifying Questions from AI to Management */}
              {latestLearningPayload?.clarifyingQuestions &&
                latestLearningPayload.clarifyingQuestions.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <HelpCircle size={17} className="text-indigo-600" />
                        <div>
                          <h3 className="text-sm font-black text-slate-900">
                            Questions the AI Wants to Ask You
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Things the database alone cannot explain — answer any of these to permanently teach the AI Brain.
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTextLearnerOpen(true);
                          setSubTab("memory");
                        }}
                        className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                      >
                        <MessagesSquare size={13} />
                        <span>Paste LINE / WhatsApp Chat Sample</span>
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {latestLearningPayload.clarifyingQuestions.map((q) => {
                        const savedAnswer = resolvedAnswersByQuestionId[q.id];
                        const isAnswered = Boolean(savedAnswer);
                        const isEditingAnswer = Boolean(editingQuestionIds[q.id]);
                        return (
                          <div
                            key={q.id}
                            className={`rounded-2xl border p-4 space-y-2.5 transition-all ${
                              isAnswered
                                ? "bg-emerald-50/60 border-emerald-200"
                                : "bg-slate-50/60 border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {q.category.replace(/_/g, " ")}
                              </span>
                              {isAnswered && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                    <CheckCircle2 size={12} /> Taught to AI
                                  </span>
                                  {!isEditingAnswer && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuestionAnswers((prev) => ({ ...prev, [q.id]: savedAnswer }));
                                        setEditingQuestionIds((prev) => ({ ...prev, [q.id]: true }));
                                      }}
                                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                    >
                                      Edit
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <p className="text-xs font-black text-slate-900 leading-snug">
                              {q.question}
                            </p>
                            {q.observedContext && (
                              <p className="text-[11px] text-slate-500">
                                <strong>Observed:</strong> {q.observedContext}
                              </p>
                            )}
                            {isAnswered && !isEditingAnswer && (
                              <div className="rounded-xl bg-white/90 border border-emerald-200/80 px-3 py-2 text-xs text-slate-800">
                                <span className="font-bold text-emerald-700">Your Answer: </span>
                                <span className="whitespace-pre-line">{savedAnswer}</span>
                              </div>
                            )}
                            {(!isAnswered || isEditingAnswer) && (
                              <div className="flex items-center gap-2 pt-1">
                                <Input
                                  value={questionAnswers[q.id] || ""}
                                  onChange={(e) =>
                                    setQuestionAnswers((prev) => ({
                                      ...prev,
                                      [q.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Type how your business handles this (Thai or English)..."
                                  className="h-8 text-xs bg-white flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAnswerQuestion(q);
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={savingQuestionId === q.id || !(questionAnswers[q.id] || "").trim()}
                                  onClick={() => handleAnswerQuestion(q)}
                                  className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shrink-0"
                                >
                                  {savingQuestionId === q.id ? "Saving..." : "Teach AI"}
                                </Button>
                                {isEditingAnswer && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingQuestionIds((prev) => ({ ...prev, [q.id]: false }))}
                                    className="h-8 px-2 text-[11px] text-slate-500 cursor-pointer shrink-0"
                                  >
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: OVERVIEW & WORKFLOW HEALTH                                     */}
      {/* ===================================================================== */}
      {subTab === "overview" && telemetry && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Ops Health Score
              </div>
              <div
                className={`text-2xl font-black mt-1 ${
                  telemetry.healthScore >= 80
                    ? "text-emerald-600"
                    : telemetry.healthScore >= 60
                    ? "text-amber-600"
                    : "text-rose-600"
                }`}
              >
                {telemetry.healthScore}/100
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Avg turnaround: {telemetry.summary.avgCompletionHours}h
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Active Pipeline
              </div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {telemetry.summary.activeOrdersNow}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {telemetry.summary.totalOrdersInWindow} orders ({windowDays}d)
              </div>
            </div>

            <div className="bg-white border border-rose-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                Stuck / Stale (&gt;36h)
              </div>
              <div className="text-2xl font-black text-rose-600 mt-1">
                {telemetry.summary.stuckOrdersNow}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {telemetry.summary.overdueDeliveryNow} past delivery slot
              </div>
            </div>

            <div className="bg-white border border-amber-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-600">
                Billing Leaks
              </div>
              <div className="text-2xl font-black text-amber-700 mt-1">
                {telemetry.summary.csoPaidShopUnpaid + telemetry.summary.noBillActive}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {telemetry.summary.csoPaidShopUnpaid} CSO/Shop gap · {telemetry.summary.noBillActive} no bill
              </div>
            </div>

            <div className="bg-white border border-indigo-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                Open Tasks &amp; CRM
              </div>
              <div className="text-2xl font-black text-indigo-700 mt-1">
                {telemetry.summary.openTasksCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {telemetry.summary.overdueTasksCount} overdue · {telemetry.summary.customerComplaintsInWindow} complaints
              </div>
            </div>

            <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                Revenue ({windowDays}d)
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                ฿{telemetry.summary.totalRevenueInWindow.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {telemetry.summary.completedOrdersInWindow} completed
              </div>
            </div>
          </div>

          {/* Latest Executive Scan Summary */}
          {latestRun && (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-900">
                  <Sparkles size={15} className="text-indigo-600" />
                  <span>Latest AI Brain Executive Summary</span>
                </div>
                <span className="text-[11px] text-indigo-700 font-medium">
                  Model: <strong>{latestRun.modelUsed}</strong> ·{" "}
                  {new Date(latestRun.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                {latestRun.executiveSummary}
              </p>
            </div>
          )}

          {/* Stage Bottleneck Funnel + Branch Load */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <TrendingUp size={15} className="text-indigo-600" />
                  Live Workflow Stage Bottlenecks
                </h3>
                <span className="text-[11px] text-slate-400">Active orders by stage</span>
              </div>
              <div className="space-y-2.5">
                {telemetry.stageBreakdown.map((st) => {
                  const pct = Math.min(
                    100,
                    Math.round((st.count / Math.max(telemetry.summary.activeOrdersNow, 1)) * 100)
                  );
                  return (
                    <div key={st.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{st.stage}</span>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-bold text-slate-700">{st.count} orders</span>
                          {st.stuckCount > 0 && (
                            <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded font-bold">
                              {st.stuckCount} stuck
                            </span>
                          )}
                          <span className="text-slate-400">avg {st.avgAgeHours}h</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            st.stuckCount > 0 ? "bg-rose-500" : "bg-indigo-500"
                          }`}
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Building2 size={15} className="text-sky-600" />
                  Branch Workload &amp; Stuck Orders ({windowDays}d)
                </h3>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {telemetry.branchBreakdown.map((b) => (
                  <div
                    key={b.branchId}
                    className="flex items-center justify-between bg-slate-50 border border-slate-200/70 rounded-xl px-3.5 py-2.5 text-xs"
                  >
                    <div>
                      <div className="font-black text-slate-900">{b.branchName}</div>
                      <div className="text-[11px] text-slate-500">
                        {b.totalOrders} orders · {b.activeOrders} active · ฿{b.revenue.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {b.stuckOrders > 0 && (
                        <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          {b.stuckOrders} stuck
                        </span>
                      )}
                      {b.unpaidOrders > 0 && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          {b.unpaidOrders} unpaid
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Stuck Jobs & Rider Workload */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-rose-500" />
                Longest-Waiting / Stuck Orders
              </h3>
              {telemetry.topStuckJobIds.length > 0 ? (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {telemetry.topStuckJobIds.map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between text-xs bg-rose-50/40 border border-rose-200/60 rounded-xl px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-black text-slate-900">#{j.id}</span>{" "}
                        <span className="font-semibold text-slate-700">{j.customerName}</span>
                        <div className="text-[10px] text-slate-500">
                          {j.branchName} · Stage: {j.status}
                          {j.subStatus ? ` (${j.subStatus})` : ""}
                        </div>
                      </div>
                      <span className="text-[11px] font-black text-rose-700 shrink-0">
                        {j.ageHours}h old
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No stuck orders right now.</p>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Truck size={15} className="text-emerald-600" />
                Rider Pickup &amp; Delivery Load ({windowDays}d)
              </h3>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {telemetry.riderWorkload.map((r) => (
                  <div
                    key={r.riderId}
                    className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200/70 rounded-xl px-3 py-2"
                  >
                    <span className="font-bold text-slate-900">{r.riderName}</span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-600">Pickup: <strong>{r.pickups}</strong></span>
                      <span className="text-slate-600">Delivery: <strong>{r.deliveries}</strong></span>
                      {r.overdueActive > 0 && (
                        <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                          {r.overdueActive} overdue
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: INSIGHTS & IMPROVEMENT PROPOSALS                               */}
      {/* ===================================================================== */}
      {subTab === "insights" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "new", "approved", "implemented", "dismissed"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setInsightFilter(st)}
                  className={`px-3 py-1 rounded-full text-xs font-bold capitalize border transition-all cursor-pointer ${
                    insightFilter === st
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={scanning}
              onClick={handleRunScan}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
            >
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              <span>Generate Fresh Insights</span>
            </Button>
          </div>

          {filteredInsights.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
              <Lightbulb size={28} className="mx-auto text-slate-300" />
              <div className="text-sm font-bold text-slate-600">No insights in this filter yet</div>
              <p className="text-xs text-slate-400">
                Click &quot;Run AI Learning Scan&quot; above to analyze your live business workflows.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInsights.map((ins) => {
                const sev = SEVERITY_STYLE[ins.severity] || SEVERITY_STYLE.info;
                let evidence: { jobIds?: string[]; taskIds?: string[]; departments?: string[] } = {};
                try {
                  if (ins.evidenceJson) evidence = JSON.parse(ins.evidenceJson);
                } catch {}
                const isReviewing = reviewingId === ins.id;
                const draft = feedbackDrafts[ins.id] || "";

                return (
                  <div
                    key={ins.id}
                    className={`bg-white border ${sev.border} rounded-2xl p-5 shadow-2xs space-y-3`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${sev.badge}`}>
                            {sev.label}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {ins.category.replace(/_/g, " ")}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(ins.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="text-sm font-black text-slate-900">{ins.title}</h3>
                      </div>

                      <Badge
                        variant="outline"
                        className={`uppercase text-[10px] font-black ${
                          ins.status === "implemented"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : ins.status === "approved"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                            : ins.status === "dismissed"
                            ? "bg-slate-100 text-slate-500 border-slate-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}
                      >
                        {ins.status}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">{ins.summary}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {ins.rootCause && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Root Cause Diagnosis
                          </div>
                          <p className="text-slate-700 leading-relaxed">{ins.rootCause}</p>
                        </div>
                      )}
                      <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          Recommended Workflow Improvement
                        </div>
                        <p className="text-emerald-950 font-medium leading-relaxed">
                          {ins.recommendation}
                        </p>
                        {ins.impactEstimate && (
                          <div className="text-[11px] text-emerald-700 pt-1">
                            <strong>Expected Impact:</strong> {ins.impactEstimate}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Evidence Pills */}
                    {((evidence.jobIds && evidence.jobIds.length > 0) ||
                      (evidence.taskIds && evidence.taskIds.length > 0) ||
                      (evidence.departments && evidence.departments.length > 0)) && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">Evidence:</span>
                        {evidence.departments?.map((d) => (
                          <span key={d} className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-md font-bold">
                            Dept: {d}
                          </span>
                        ))}
                        {evidence.jobIds?.map((jid) => (
                          <span key={jid} className="font-mono bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-bold">
                            Order #{jid}
                          </span>
                        ))}
                        {evidence.taskIds?.map((tid) => (
                          <span key={tid} className="font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold">
                            Task #{tid}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Admin Feedback-to-Memory Learning Controls */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      {ins.adminFeedback && (
                        <div className="text-xs bg-indigo-50/60 border border-indigo-200 rounded-xl px-3 py-2 text-indigo-900">
                          <strong>Admin Note ({ins.reviewedByName || "Admin"}):</strong> {ins.adminFeedback}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <Input
                          value={draft}
                          disabled={isReviewing}
                          onChange={(e) =>
                            setFeedbackDrafts((prev) => ({ ...prev, [ins.id]: e.target.value }))
                          }
                          placeholder="Teach / correct the AI Brain (e.g. 'This branch batches bills every Friday')..."
                          className="h-8 text-xs flex-1"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isReviewing}
                            onClick={() => handleReviewInsight(ins.id, "approved")}
                            className="h-8 px-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg gap-1 cursor-pointer"
                          >
                            <Check size={12} /> Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isReviewing}
                            onClick={() => handleReviewInsight(ins.id, "implemented")}
                            className="h-8 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-1 cursor-pointer"
                          >
                            <CheckCircle2 size={12} /> Implemented
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isReviewing}
                            onClick={() => handleReviewInsight(ins.id, "dismissed")}
                            className="h-8 px-2.5 text-xs font-bold text-slate-600 rounded-lg gap-1 cursor-pointer"
                          >
                            <XCircle size={12} /> Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: BUSINESS BRAIN MEMORY (SOPs, LEARNED RULES & CHAT TRAINER)     */}
      {/* ===================================================================== */}
      {subTab === "memory" && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  placeholder="Search learned rules, SOPs, tone..."
                  className="pl-8 h-9 text-xs bg-white"
                />
              </div>
              <select
                value={memoryCatFilter}
                onChange={(e) => setMemoryCatFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
              >
                <option value="all">All Categories</option>
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-[11px]">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "ai_learned", label: `AI Learned (${unverifiedLearnedCount})` },
                    { id: "verified", label: "Verified / Taught" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMemorySourceFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      memorySourceFilter === f.id
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setTextLearnerOpen((v) => !v);
                  setMemoryModalOpen(false);
                }}
                className="border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl h-9 px-3.5 text-xs font-bold gap-1.5 cursor-pointer"
              >
                <MessagesSquare size={14} />
                <span>Paste Customer Chat / SOP</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setTextLearnerOpen(false);
                  openNewMemory();
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-9 px-4 text-xs font-bold gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Teach Rule Manually</span>
              </Button>
            </div>
          </div>

          {textLearnerOpen && (
            <form
              onSubmit={handleLearnFromText}
              className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessagesSquare size={16} className="text-emerald-700" />
                  <h3 className="font-black text-emerald-950 text-sm">
                    Teach AI from Customer Chat Transcript or SOP Document
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setTextLearnerOpen(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-emerald-900/80">
                Paste a real LINE OA / WhatsApp customer conversation or internal SOP below. <strong>{geminiStatus.model}</strong> will extract your tone of voice, greetings, Q&amp;A patterns, and business rules into Business Brain Memory.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Source Type</label>
                  <select
                    value={textSourceType}
                    onChange={(e) => setTextSourceType(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-xl border border-emerald-300 bg-white text-xs font-semibold"
                  >
                    <option value="customer_chat">Customer Chat (LINE OA / WhatsApp / Messenger)</option>
                    <option value="sop_doc">Internal SOP / Training Manual / Price Rules</option>
                    <option value="staff_note">Management / Staff Explanation</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Optional Label</label>
                  <Input
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="e.g. LINE OA pricing inquiry & pickup booking chat"
                    className="h-9 text-xs bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Paste Conversation or Document Text *
                </label>
                <textarea
                  value={textRaw}
                  onChange={(e) => setTextRaw(e.target.value)}
                  rows={5}
                  placeholder="Paste chat transcript or SOP here (Thai, English, or mixed)..."
                  className="w-full p-3 rounded-xl border border-emerald-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTextLearnerOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={learningText || textRaw.trim().length < 20}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold px-4 gap-1.5 cursor-pointer"
                >
                  {learningText ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  <span>{learningText ? "Extracting Knowledge..." : "Extract & Learn"}</span>
                </Button>
              </div>
            </form>
          )}

          {memoryModalOpen && (
            <form
              onSubmit={handleSaveMemory}
              className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-indigo-950 text-sm">
                  {editingMemoryId ? "Edit Business Memory" : "Teach AI Brain a New Business Rule / Workflow"}
                </h3>
                <button
                  type="button"
                  onClick={() => setMemoryModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={memCategory}
                    onChange={(e) => setMemCategory(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs"
                  >
                    {MEMORY_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tags (comma-separated)</label>
                  <Input
                    value={memTags}
                    onChange={(e) => setMemTags(e.target.value)}
                    placeholder="e.g. checker, vip, sukhumvit, billing"
                    className="h-9 text-xs bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Rule / Workflow Title *</label>
                <Input
                  value={memTitle}
                  onChange={(e) => setMemTitle(e.target.value)}
                  placeholder="e.g. Express 24h Orders Must Bypass Standard Queue"
                  className="h-9 text-xs bg-white"
                  required
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Detailed Business Knowledge / SOP *
                </label>
                <textarea
                  value={memContent}
                  onChange={(e) => setMemContent(e.target.value)}
                  rows={3}
                  placeholder="Describe how your business handles this workflow, exceptions, targets, or rules..."
                  className="w-full p-3 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMemoryModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingMemory}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold px-4 cursor-pointer"
                >
                  {savingMemory ? "Saving..." : "Save to AI Brain Memory"}
                </Button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredMemories.map((m) => (
              <div
                key={m.id}
                className={`bg-white border rounded-2xl p-4 shadow-2xs space-y-2 transition-opacity ${
                  m.isActive ? "border-slate-200" : "border-slate-200/60 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {m.category.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          m.source === "feedback_corrected"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : m.source === "ai_learned"
                            ? "bg-violet-50 text-violet-700 border-violet-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {m.source === "feedback_corrected"
                          ? "Admin Correction"
                          : m.source === "ai_learned"
                          ? "AI Learned (Review)"
                          : "Verified / Taught"}
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900">{m.title}</h4>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {m.source === "ai_learned" && (
                      <button
                        type="button"
                        disabled={verifyingId === m.id}
                        onClick={() => handleVerifyMemory(m.id)}
                        className="px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        title="Confirm this learned fact is accurate"
                      >
                        <CheckCheck size={12} />
                        <span>{verifyingId === m.id ? "..." : "Confirm"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleMemory(m)}
                      className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                        m.isActive
                          ? "text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                          : "text-slate-400 border-slate-200 bg-slate-50 hover:bg-slate-100"
                      }`}
                      title={m.isActive ? "Active (click to pause)" : "Paused (click to activate)"}
                    >
                      <Power size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditMemory(m)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                      title="Edit / Correct"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(m.id)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {m.content}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  <span>By: {m.createdByName || "System"}</span>
                  <span>{new Date(m.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: TEST & TEACH CHAT / ASK AI BRAIN                               */}
      {/* ===================================================================== */}
      {subTab === "chat" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs flex flex-col h-[620px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-black text-slate-800">
              {brainMode === "learning" ? (
                <GraduationCap size={15} className="text-emerald-600" />
              ) : (
                <Brain size={15} className="text-indigo-600" />
              )}
              <span>
                {brainMode === "learning"
                  ? "Test & Teach AI Business Brain (English / ภาษาไทย)"
                  : "Ask TLS AI Operations Brain (English / ภาษาไทย)"}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Grounded in {activeMemoriesCount} learned business rules + {windowDays}-day system data
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-line ${
                    msg.role === "user"
                      ? "bg-slate-900 text-white"
                      : "bg-indigo-50/70 border border-indigo-200/80 text-slate-800"
                  }`}
                >
                  <div>{msg.content}</div>
                  <div className="flex items-center justify-between gap-3 mt-1.5">
                    {msg.model ? (
                      <div className="text-[10px] text-indigo-500 font-semibold">
                        Answered via {msg.model}
                      </div>
                    ) : (
                      <span />
                    )}
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSaveChatToMemory(msg.content)}
                        className={`text-[10px] font-bold underline cursor-pointer ${
                          msg.role === "user"
                            ? "text-emerald-300 hover:text-emerald-200"
                            : "text-indigo-600 hover:text-indigo-800"
                        }`}
                      >
                        + Save to Brain Memory
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 px-2">
                <Loader2 size={14} className="animate-spin" />
                <span>
                  {brainMode === "learning"
                    ? "AI Brain is checking its business memory..."
                    : "AI Brain is analyzing live database telemetry..."}
                </span>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(brainMode === "learning" ? LEARNING_QUICK_PROMPTS : OPS_QUICK_PROMPTS).map((qp) => (
                <button
                  key={qp}
                  type="button"
                  disabled={chatLoading}
                  onClick={() => handleAskBrain(qp)}
                  className="text-[11px] font-semibold bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 rounded-full px-2.5 py-1 transition-colors cursor-pointer"
                >
                  {qp}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskBrain();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={chatInput}
                disabled={chatLoading}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  brainMode === "learning"
                    ? "Test what the AI knows or explain how your business / customer chat works..."
                    : "Ask about bottlenecks, departments, riders, billing, complaints, or workflow improvements..."
                }
                className="flex-1 h-9 text-xs bg-white"
              />
              <Button
                type="submit"
                size="sm"
                disabled={chatLoading || !chatInput.trim()}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
              >
                <Send size={13} />
                <span>{brainMode === "learning" ? "Send" : "Ask"}</span>
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
