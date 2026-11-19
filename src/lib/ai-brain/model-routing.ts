import { prisma } from "@/lib/prisma";
import {
  AVAILABLE_AI_MODELS,
  RECOMMENDED_MODEL_ROUTING,
  type AiModelRoutingConfig,
} from "./model-options";

const SETTING_KEY = "ai_brain_model_routing";
const GEMINI_KEY_SETTING = "ai_brain_gemini_api_key_v1";

export async function loadResolvedGeminiApiKey(): Promise<{
  apiKey: string;
  source: "env" | "db" | "none";
}> {
  const envKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (envKey) return { apiKey: envKey, source: "env" };
  try {
    const row = await prisma.setting.findUnique({
      where: { key: GEMINI_KEY_SETTING },
      select: { value: true },
    });
    const dbKey = (row?.value || "").trim();
    if (dbKey) return { apiKey: dbKey, source: "db" };
  } catch {}
  return { apiKey: "", source: "none" };
}

export async function saveStoredGeminiApiKey(apiKey: string): Promise<void> {
  const clean = apiKey.trim();
  if (!clean) {
    await prisma.setting.deleteMany({ where: { key: GEMINI_KEY_SETTING } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: GEMINI_KEY_SETTING },
    create: { key: GEMINI_KEY_SETTING, value: clean },
    update: { value: clean },
  });
}

const ALLOWED_MODEL_IDS = new Set(AVAILABLE_AI_MODELS.map((m) => m.id));

function sanitizeModel(candidate: unknown, fallback: string): string {
  const clean = typeof candidate === "string" ? candidate.trim() : "";
  if (!clean) return fallback;
  if (ALLOWED_MODEL_IDS.has(clean)) return clean;
  // Allow valid gemini-* identifiers if user explicitly sets a newer model in .env
  if (/^gemini-[a-z0-9.\-]+$/i.test(clean)) return clean;
  return fallback;
}

export function getEnvDefaultModelRouting(): AiModelRoutingConfig {
  const baseModel = (process.env.GEMINI_MODEL || "").trim();
  return {
    study: sanitizeModel(process.env.GEMINI_MODEL_STUDY || baseModel, RECOMMENDED_MODEL_ROUTING.study),
    chat: sanitizeModel(process.env.GEMINI_MODEL_CHAT, RECOMMENDED_MODEL_ROUTING.chat),
    extract: sanitizeModel(process.env.GEMINI_MODEL_EXTRACT, RECOMMENDED_MODEL_ROUTING.extract),
    ops_scan: sanitizeModel(process.env.GEMINI_MODEL_OPS || baseModel, RECOMMENDED_MODEL_ROUTING.ops_scan),
    fallback: sanitizeModel(process.env.GEMINI_MODEL_FALLBACK, RECOMMENDED_MODEL_ROUTING.fallback),
  };
}

export async function loadModelRoutingConfig(): Promise<AiModelRoutingConfig> {
  const defaults = getEnvDefaultModelRouting();
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
      select: { value: true },
    });
    if (!row?.value) return defaults;
    const parsed = JSON.parse(row.value);
    return {
      study: sanitizeModel(parsed?.study, defaults.study),
      chat: sanitizeModel(parsed?.chat, defaults.chat),
      extract: sanitizeModel(parsed?.extract, defaults.extract),
      ops_scan: sanitizeModel(parsed?.ops_scan, defaults.ops_scan),
      fallback: sanitizeModel(parsed?.fallback, defaults.fallback),
    };
  } catch {
    return defaults;
  }
}

export async function saveModelRoutingConfig(
  input: Partial<AiModelRoutingConfig>
): Promise<AiModelRoutingConfig> {
  const current = await loadModelRoutingConfig();
  const next: AiModelRoutingConfig = {
    study: sanitizeModel(input.study, current.study),
    chat: sanitizeModel(input.chat, current.chat),
    extract: sanitizeModel(input.extract, current.extract),
    ops_scan: sanitizeModel(input.ops_scan, current.ops_scan),
    fallback: sanitizeModel(input.fallback, current.fallback),
  };

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      value: JSON.stringify(next),
    },
    update: {
      value: JSON.stringify(next),
    },
  });

  return next;
}
