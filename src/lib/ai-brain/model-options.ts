export type AiTaskKey = "study" | "chat" | "extract" | "ops_scan" | "fallback";

export interface AiModelRoutingConfig {
  study: string;
  chat: string;
  extract: string;
  ops_scan: string;
  fallback: string;
}

export interface AiModelOption {
  id: string;
  label: string;
  tier: "Flagship" | "Fast" | "Pro" | "Lite";
  description: string;
}

export const AVAILABLE_AI_MODELS: AiModelOption[] = [
  {
    id: "gemini-4-neon",
    label: "Gemini 4 Neon",
    tier: "Flagship",
    description: "Highest reasoning depth — ideal for Deep Business Study & Ops Analysis",
  },
  {
    id: "gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen",
    tier: "Fast",
    description: "Fast Gemini 4 with 1K RPM quota — ideal for Chat & SOP Extraction",
  },
  {
    id: "gemini-4-argon",
    label: "Gemini 4 Argon",
    tier: "Flagship",
    description: "Gemini 4 series alternative reasoning model",
  },
  {
    id: "gemini-4-carbon",
    label: "Gemini 4 Carbon",
    tier: "Fast",
    description: "Gemini 4 series alternative throughput model",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    tier: "Fast",
    description: "Ultra-fast next-gen flash model for snappy chat & extraction",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    tier: "Pro",
    description: "Proven deep-thinking Pro model for complex root-cause analysis",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tier: "Fast",
    description: "Reliable balanced speed & quality — great as Auto-Fallback",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    tier: "Lite",
    description: "Lowest cost & fastest latency for high-volume lightweight tasks",
  },
];

export const RECOMMENDED_MODEL_ROUTING: AiModelRoutingConfig = {
  study: "gemini-4-neon",
  chat: "gemini-4-hydrogen",
  extract: "gemini-4-hydrogen",
  ops_scan: "gemini-4-neon",
  fallback: "gemini-2.5-flash",
};

export const AI_TASK_DESCRIPTIONS: Array<{
  key: AiTaskKey;
  label: string;
  hint: string;
}> = [
  {
    key: "study",
    label: "Deep Business Study",
    hint: "Reads Orders, Task Chats, Branches & Services to build Business Memory",
  },
  {
    key: "chat",
    label: "Test & Teach AI Chat",
    hint: "Interactive Q&A and teaching conversation in English / Thai",
  },
  {
    key: "extract",
    label: "Customer Chat / SOP Extractor",
    hint: "Distills pasted LINE OA / WhatsApp chats & SOP docs into rules",
  },
  {
    key: "ops_scan",
    label: "Ops Bottleneck Scan & Proposals",
    hint: "Root-cause analysis of delays, billing leaks, and workflow proposals",
  },
  {
    key: "fallback",
    label: "Auto-Fallback Backup Model",
    hint: "Automatically used if the primary model hits rate limit or errors",
  },
];
