import { GoogleGenAI } from "@google/genai";
import type { GeneratedInsightDraft, OperationalTelemetry } from "./telemetry";
import type { BusinessStudyCorpus } from "./business-learner";

export interface BusinessCoverageScores {
  organization: number;
  servicesAndPricing: number;
  orderWorkflows: number;
  teamOperations: number;
  customerCommunication: number;
  exceptionsAndQuality: number;
}

export interface ClarifyingQuestionItem {
  id: string;
  category: string;
  question: string;
  whyItMatters: string;
  observedContext: string;
}

export interface GeminiBusinessStudyResult {
  modelUsed: string;
  understandingSummary: string;
  coverageScores: BusinessCoverageScores;
  learnedMemories: Array<{
    category: string;
    title: string;
    content: string;
    tags?: string;
    confidence?: number;
  }>;
  clarifyingQuestions: ClarifyingQuestionItem[];
}

export interface GeminiTextLearningResult {
  modelUsed: string;
  summary: string;
  learnedMemories: Array<{
    category: string;
    title: string;
    content: string;
    tags?: string;
  }>;
}

export interface BrainMemoryInput {
  id: string;
  category: string;
  title: string;
  content: string;
  source: string;
}

export interface GeminiScanResult {
  modelUsed: string;
  executiveSummary: string;
  insights: GeneratedInsightDraft[];
  suggestedMemories: Array<{
    category: string;
    title: string;
    content: string;
    tags?: string;
  }>;
}

export interface BrainChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function getGeminiConfigStatus() {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  const model = (process.env.GEMINI_MODEL || "gemini-4-neon").trim();
  return {
    configured: Boolean(apiKey),
    model,
  };
}

function createGeminiClient(modelOverride?: string): { client: GoogleGenAI; model: string } | null {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) return null;
  const model = (modelOverride || process.env.GEMINI_MODEL || "gemini-4-neon").trim();
  return {
    client: new GoogleGenAI({ apiKey }),
    model,
  };
}

async function runInteractionWithFallback(params: {
  client: GoogleGenAI;
  primaryModel: string;
  fallbackModel?: string;
  system_instruction: string;
  input: string;
  response_format?: Record<string, any>;
}): Promise<{ outputText: string; modelUsed: string } | null> {
  const tryModel = async (modelName: string) => {
    const interaction = await params.client.interactions.create({
      model: modelName,
      system_instruction: params.system_instruction,
      input: params.input,
      ...(params.response_format ? { response_format: params.response_format } : {}),
      store: false,
    });
    const text = interaction.output_text?.trim() || "";
    if (!text) return null;
    return { outputText: text, modelUsed: modelName };
  };

  try {
    const res = await tryModel(params.primaryModel);
    if (res) return res;
  } catch (err) {
    const fb = params.fallbackModel?.trim();
    if (fb && fb !== params.primaryModel) {
      console.warn(
        `[AI Brain] Primary model "${params.primaryModel}" failed; retrying with fallback "${fb}":`,
        err instanceof Error ? err.message : err
      );
      return await tryModel(fb);
    }
    throw err;
  }

  const fb = params.fallbackModel?.trim();
  if (fb && fb !== params.primaryModel) {
    return await tryModel(fb);
  }
  return null;
}

const SCAN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: {
      type: "string",
      description:
        "Concise executive summary (3-5 sentences) of operational health, key trends vs previous run, and top priority actions. Bilingual-friendly English with Thai terms where helpful.",
    },
    insights: {
      type: "array",
      description: "3 to 7 concrete, evidence-backed operational insights or workflow improvement proposals.",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "bottleneck",
              "sla_delay",
              "department",
              "rider",
              "billing",
              "complaint_pattern",
              "workflow_improvement",
            ],
          },
          severity: {
            type: "string",
            enum: ["critical", "warning", "opportunity", "info"],
          },
          title: { type: "string" },
          summary: { type: "string" },
          rootCause: { type: "string" },
          recommendation: { type: "string" },
          impactEstimate: { type: "string" },
          evidence: {
            type: "object",
            properties: {
              jobIds: { type: "array", items: { type: "string" } },
              taskIds: { type: "array", items: { type: "string" } },
              departments: { type: "array", items: { type: "string" } },
            },
          },
        },
        required: [
          "category",
          "severity",
          "title",
          "summary",
          "rootCause",
          "recommendation",
          "impactEstimate",
        ],
      },
    },
    suggestedMemories: {
      type: "array",
      description:
        "0 to 2 new operational patterns learned from this data that are NOT already in Business Memory.",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["workflow", "sop", "department", "branch", "customer_pattern", "pricing"],
          },
          title: { type: "string" },
          content: { type: "string" },
          tags: { type: "string" },
        },
        required: ["category", "title", "content"],
      },
    },
  },
  required: ["executiveSummary", "insights"],
};

export async function analyzeOperationsWithGemini(params: {
  telemetry: OperationalTelemetry;
  memories: BrainMemoryInput[];
  previousSummary?: string | null;
  previousMetrics?: Record<string, any> | null;
  modelOverride?: string;
  fallbackModel?: string;
}): Promise<GeminiScanResult | null> {
  const conn = createGeminiClient(params.modelOverride);
  if (!conn) return null;

  const { client, model } = conn;

  const systemInstruction = `You are the internal AI Operations & Workflow Brain for "That Laundry Shop" (and sister brand "NoName Laundry") in Thailand.
Your job is to continuously learn how this laundry & logistics business operates, detect workflow bottlenecks, billing leaks, rider/branch imbalances, and customer complaint patterns, and propose practical, high-impact improvements for Management.

STRICT RULES:
1. Ground every finding in the exact numbers, Order/Job IDs, Task IDs, branches, and departments provided in the live telemetry JSON. Never invent IDs or numbers.
2. Respect and apply the Admin's Business Brain Memory (SOPs, branch rules, and prior admin corrections). Never contradict a memory marked source="feedback_corrected" or source="admin_taught".
3. Prioritize actionable, concrete workflow improvements over generic advice.
4. Return valid JSON matching the requested schema.`;

  const promptPayload = {
    businessMemories: params.memories.map((m) => ({
      category: m.category,
      source: m.source,
      title: m.title,
      content: m.content,
    })),
    previousRunComparison: params.previousSummary
      ? {
          previousSummary: params.previousSummary,
          previousSummaryMetrics: params.previousMetrics || null,
        }
      : null,
    liveTelemetry: params.telemetry,
  };

  const result = await runInteractionWithFallback({
    client,
    primaryModel: model,
    fallbackModel: params.fallbackModel,
    system_instruction: systemInstruction,
    input: `Analyze the following live operational telemetry and business memory for That Laundry Shop, compare against the previous run if provided, and return structured workflow insights and any newly learned operational patterns.\n\n${JSON.stringify(promptPayload)}`,
    response_format: SCAN_RESPONSE_SCHEMA,
  });

  if (!result) return null;
  const rawText = result.outputText;
  const actualModel = result.modelUsed;

  const parsed = JSON.parse(rawText);
  const insights: GeneratedInsightDraft[] = Array.isArray(parsed.insights)
    ? parsed.insights.map((item: any) => ({
        category: item.category || "workflow_improvement",
        severity: item.severity || "warning",
        title: String(item.title || "Operational Observation"),
        summary: String(item.summary || ""),
        rootCause: String(item.rootCause || ""),
        recommendation: String(item.recommendation || ""),
        impactEstimate: String(item.impactEstimate || ""),
        evidence: {
          jobIds: Array.isArray(item.evidence?.jobIds) ? item.evidence.jobIds.slice(0, 10) : [],
          taskIds: Array.isArray(item.evidence?.taskIds) ? item.evidence.taskIds.slice(0, 10) : [],
          departments: Array.isArray(item.evidence?.departments)
            ? item.evidence.departments.slice(0, 6)
            : [],
        },
      }))
    : [];

  const suggestedMemories = Array.isArray(parsed.suggestedMemories)
    ? parsed.suggestedMemories
        .filter((m: any) => m?.title && m?.content)
        .slice(0, 2)
        .map((m: any) => ({
          category: String(m.category || "workflow"),
          title: String(m.title),
          content: String(m.content),
          tags: m.tags ? String(m.tags) : "ai-learned",
        }))
    : [];

  return {
    modelUsed: actualModel,
    executiveSummary: String(parsed.executiveSummary || ""),
    insights,
    suggestedMemories,
  };
}

const BUSINESS_STUDY_SCHEMA = {
  type: "object",
  properties: {
    understandingSummary: {
      type: "string",
      description:
        "Clear, structured executive summary (4-7 sentences) describing how That Laundry Shop operates based on observed system data. Purely descriptive and learning-focused — do NOT criticize or pitch unsolicited redesigns.",
    },
    coverageScores: {
      type: "object",
      properties: {
        organization: { type: "number", description: "0-100 score of how well branches, areas, and org structure are understood" },
        servicesAndPricing: { type: "number", description: "0-100 score of how well services, pricing, vouchers, and brands are understood" },
        orderWorkflows: { type: "number", description: "0-100 score of how well real order lifecycle, channels, and payment flows are understood" },
        teamOperations: { type: "number", description: "0-100 score of how well departments, roles, shifts, and riders are understood" },
        customerCommunication: { type: "number", description: "0-100 score of how well customer chat tone, LINE/WhatsApp phrasing, and CSO communication style are understood (should stay lower until real customer chat transcripts are provided)" },
        exceptionsAndQuality: { type: "number", description: "0-100 score of how well complaints, garment issues, and refunds are understood" },
      },
      required: [
        "organization",
        "servicesAndPricing",
        "orderWorkflows",
        "teamOperations",
        "customerCommunication",
        "exceptionsAndQuality",
      ],
    },
    learnedMemories: {
      type: "array",
      description:
        "5 to 8 concrete, factual business knowledge entries learned directly from the database corpus. Do NOT duplicate existing businessMemories.",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "business_profile",
              "workflow",
              "team_operations",
              "customer_communication",
              "customer_pattern",
              "pricing",
              "sop",
            ],
          },
          title: { type: "string" },
          content: { type: "string" },
          tags: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["category", "title", "content"],
      },
    },
    clarifyingQuestions: {
      type: "array",
      description:
        "4 to 6 specific, practical questions for the owner/management about things the database alone cannot explain (e.g., how CSOs greet and chat with customers on LINE/WhatsApp, branch transfer rules, complaint compensation policy, VIP handling).",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "customer_communication",
              "workflow",
              "team_operations",
              "pricing",
              "sop",
              "customer_pattern",
            ],
          },
          question: { type: "string" },
          whyItMatters: { type: "string" },
          observedContext: { type: "string" },
        },
        required: ["category", "question", "whyItMatters", "observedContext"],
      },
    },
  },
  required: ["understandingSummary", "coverageScores", "learnedMemories", "clarifyingQuestions"],
};

const TEXT_LEARNING_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-3 sentence summary of what was learned from the pasted customer chat or SOP.",
    },
    learnedMemories: {
      type: "array",
      description: "1 to 5 structured knowledge entries extracted from the text (tone of voice, greetings, Q&A patterns, SOP rules).",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "customer_communication",
              "sop",
              "workflow",
              "pricing",
              "customer_pattern",
              "team_operations",
            ],
          },
          title: { type: "string" },
          content: { type: "string" },
          tags: { type: "string" },
        },
        required: ["category", "title", "content"],
      },
    },
  },
  required: ["summary", "learnedMemories"],
};

export async function studyBusinessWithGemini(params: {
  corpus: BusinessStudyCorpus;
  existingMemories: BrainMemoryInput[];
  modelOverride?: string;
  fallbackModel?: string;
}): Promise<GeminiBusinessStudyResult | null> {
  const conn = createGeminiClient(params.modelOverride);
  if (!conn) return null;

  const { client, model } = conn;

  const systemInstruction = `You are the internal AI Business Brain for "That Laundry Shop" (and sister brand "NoName Laundry") in Thailand.
RIGHT NOW YOU ARE STRICTLY IN LEARNING MODE.
Your goal is NOT to criticize, audit, or propose changes yet. Your ONLY goal is to deeply study the real database snapshot provided, understand how this business actually works day-to-day, capture accurate factual knowledge into Business Brain Memory, and ask smart clarifying questions for Management about anything the data alone cannot tell you (especially how CSOs chat with customers on LINE OA / WhatsApp, tone of voice, and unwritten operational rules).

RULES:
1. Ground every learned fact in real numbers, branch names, service categories, payment methods, channels, task conversations, and activity logs from the corpus. Never invent facts.
2. Do NOT duplicate memories that already exist in existingMemories — instead build deeper, complementary knowledge.
3. For coverageScores.customerCommunication: be honest! If you only have internal task notes/remarks and no actual LINE/WhatsApp customer chat transcripts yet, score it realistically (e.g. 25-45) and ask Management to teach or paste chat examples.
4. Keep titles clear and concise. Use English with Thai terms where natural for That Laundry Shop staff.
5. Return valid JSON matching the requested schema.`;

  const payload = {
    existingMemories: params.existingMemories.map((m) => ({
      category: m.category,
      source: m.source,
      title: m.title,
      content: m.content,
    })),
    businessCorpus: params.corpus,
  };

  const result = await runInteractionWithFallback({
    client,
    primaryModel: model,
    fallbackModel: params.fallbackModel,
    system_instruction: systemInstruction,
    input: `Study this real system snapshot of That Laundry Shop over the last ${params.corpus.windowDays} days. Synthesize what you understand about how the business works, extract factual business memories not already known, score your current understanding coverage, and ask clarifying questions for Management.\n\n${JSON.stringify(payload)}`,
    response_format: BUSINESS_STUDY_SCHEMA,
  });

  if (!result) return null;

  const parsed = JSON.parse(result.outputText);
  const clamp = (n: unknown, fallback = 40) =>
    Math.max(0, Math.min(100, Math.round(Number(n ?? fallback) || 0)));

  const cs = parsed.coverageScores || {};
  const coverageScores: BusinessCoverageScores = {
    organization: clamp(cs.organization, 60),
    servicesAndPricing: clamp(cs.servicesAndPricing, 55),
    orderWorkflows: clamp(cs.orderWorkflows, 55),
    teamOperations: clamp(cs.teamOperations, 50),
    customerCommunication: clamp(cs.customerCommunication, 30),
    exceptionsAndQuality: clamp(cs.exceptionsAndQuality, 45),
  };

  const learnedMemories = Array.isArray(parsed.learnedMemories)
    ? parsed.learnedMemories
        .filter((m: any) => m?.title && m?.content)
        .slice(0, 8)
        .map((m: any) => ({
          category: String(m.category || "workflow"),
          title: String(m.title),
          content: String(m.content),
          tags: m.tags ? String(m.tags) : "system-study",
          confidence:
            typeof m.confidence === "number"
              ? Math.max(0.3, Math.min(1, m.confidence))
              : 0.85,
        }))
    : [];

  const clarifyingQuestions: ClarifyingQuestionItem[] = Array.isArray(parsed.clarifyingQuestions)
    ? parsed.clarifyingQuestions
        .filter((q: any) => q?.question)
        .slice(0, 6)
        .map((q: any, idx: number) => ({
          id: `q-${Date.now()}-${idx}`,
          category: String(q.category || "workflow"),
          question: String(q.question),
          whyItMatters: String(q.whyItMatters || ""),
          observedContext: String(q.observedContext || ""),
        }))
    : [];

  return {
    modelUsed: result.modelUsed,
    understandingSummary: String(parsed.understandingSummary || ""),
    coverageScores,
    learnedMemories,
    clarifyingQuestions,
  };
}

export async function learnFromTextSampleWithGemini(params: {
  sourceType: "customer_chat" | "sop_doc" | "staff_note";
  title?: string;
  rawText: string;
  existingMemories: BrainMemoryInput[];
  modelOverride?: string;
  fallbackModel?: string;
}): Promise<GeminiTextLearningResult | null> {
  const conn = createGeminiClient(params.modelOverride);
  if (!conn) return null;

  const { client, model } = conn;

  const focusMap = {
    customer_chat:
      "This is a real customer conversation (LINE OA / WhatsApp / Messenger). Extract: (1) Tone & voice style (Thai/English mix, politeness particles, greeting/closing style, emojis), (2) How CSOs answer pricing, scheduling, billing, or complaint questions, and (3) Any implied business rules.",
    sop_doc:
      "This is an internal SOP, price rule, or training note. Extract clear, reusable operational rules and step-by-step workflows.",
    staff_note:
      "This is a management explanation or internal staff discussion. Extract concrete business rules, exceptions, and team responsibilities.",
  };

  const systemInstruction = `You are the AI Business Brain for "That Laundry Shop" in Learning Mode.
${focusMap[params.sourceType]}
Do NOT invent rules that aren't in the text. Avoid duplicating existingMemories. Return valid JSON matching the schema.`;

  const result = await runInteractionWithFallback({
    client,
    primaryModel: model,
    fallbackModel: params.fallbackModel,
    system_instruction: systemInstruction,
    input: `TITLE: ${params.title || params.sourceType}\n\nEXISTING MEMORIES (avoid duplicating):\n${JSON.stringify(
      params.existingMemories.slice(0, 25).map((m) => ({ title: m.title, category: m.category }))
    )}\n\nRAW CONTENT TO LEARN FROM:\n${params.rawText.slice(0, 15000)}`,
    response_format: TEXT_LEARNING_SCHEMA,
  });

  if (!result) return null;

  const parsed = JSON.parse(result.outputText);
  return {
    modelUsed: result.modelUsed,
    summary: String(parsed.summary || ""),
    learnedMemories: Array.isArray(parsed.learnedMemories)
      ? parsed.learnedMemories
          .filter((m: any) => m?.title && m?.content)
          .slice(0, 5)
          .map((m: any) => ({
            category: String(m.category || (params.sourceType === "customer_chat" ? "customer_communication" : "sop")),
            title: String(m.title),
            content: String(m.content),
            tags: m.tags ? String(m.tags) : params.sourceType,
          }))
      : [],
  };
}

export async function askAiBrainWithGemini(params: {
  question: string;
  history: BrainChatTurn[];
  telemetry: OperationalTelemetry;
  memories: BrainMemoryInput[];
  recentInsights: Array<{
    title: string;
    severity: string;
    category: string;
    status: string;
    recommendation: string;
  }>;
  mode?: "learning" | "ops";
  modelOverride?: string;
  fallbackModel?: string;
}): Promise<{ answer: string; modelUsed: string } | null> {
  const conn = createGeminiClient(params.modelOverride);
  if (!conn) return null;

  const { client, model } = conn;
  const isLearningMode = params.mode !== "ops";

  const systemInstruction = isLearningMode
    ? `You are the AI Business Brain for "That Laundry Shop" (and "NoName Laundry") in Thailand — currently in **LEARNING MODE**.
You are speaking directly to the Owner / Management to learn how the business works and verify your understanding.
- Answer in the same language the user writes in (Thai, English, or natural Thai/English mix).
- Do NOT push unsolicited redesigns or criticize processes unless the user specifically asks for suggestions.
- When asked "how do we work..." or "what do you know about...", explain clearly what you have learned from Business Brain Memory and live system data, and honestly point out any gaps you haven't learned yet.
- When the user teaches you a rule, explains a workflow, or shows how they chat with customers, summarize what you understood in 1-2 crisp bullet points so they can click "Save to Memory", and optionally ask 1 short follow-up question to deepen your understanding.
- Be warm, sharp, concise, and grounded in real data.`
    : `You are the AI Operations & Workflow Brain for "That Laundry Shop" (multi-brand laundry, dry cleaning, rider logistics, POS, and CRM in Thailand).
You are speaking directly to Admin / Management.
- Answer in the same language the user asks in (Thai or English, or mixed Thai/English naturally).
- Always ground your answer in the live telemetry JSON, Business Brain Memory, and recent insights provided.
- Cite concrete numbers, Order IDs (#...), branches, riders, or departments when relevant.
- If the user teaches you a new business rule in chat, acknowledge it and suggest saving it to Business Brain Memory.
- Be concise, structured (bullet points), and practical.`;

  const contextBlock = JSON.stringify({
    liveTelemetry: params.telemetry,
    businessMemory: params.memories.map((m) => ({
      category: m.category,
      source: m.source,
      title: m.title,
      content: m.content,
    })),
    ...(isLearningMode ? {} : { recentInsights: params.recentInsights.slice(0, 10) }),
  });

  const conversationTranscript = params.history
    .slice(-8)
    .map((h) => `${h.role === "user" ? "Management" : "AI Brain"}: ${h.content}`)
    .join("\n\n");

  const fullInput = `LIVE BUSINESS CONTEXT:\n${contextBlock}\n\n${
    conversationTranscript ? `CONVERSATION SO FAR:\n${conversationTranscript}\n\n` : ""
  }MANAGEMENT MESSAGE:\n${params.question}`;

  const result = await runInteractionWithFallback({
    client,
    primaryModel: model,
    fallbackModel: params.fallbackModel,
    system_instruction: systemInstruction,
    input: fullInput,
  });

  if (!result) return null;

  return { answer: result.outputText, modelUsed: result.modelUsed };
}
