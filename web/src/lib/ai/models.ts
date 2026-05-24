/**
 * Model catalog — single source of truth for LLM choices.
 *
 * Each entry maps a Story Engine internal model ID to:
 *   - provider: which Vercel AI SDK provider to call
 *   - model_id: the provider's actual model identifier
 *   - role hint: "director" (cheap) vs "narrator" (premium)
 *   - credit_multiplier: per ADR-003 + credit_meter — relative cost vs base
 *   - allows_nsfw: per ADR-004 — adult mode gating
 *   - min_tier: subscription tier gating
 *
 * Phase 3 will move this to DB (`llm_models` table) for runtime config.
 * For Phase 1 we hardcode to keep things simple.
 */

export type ModelRole = "director" | "narrator" | "general";
export type ModelProvider = "anthropic" | "openai" | "google" | "xai" | "openrouter";

export type ModelEntry = {
  id: string; // internal Story Engine id
  provider: ModelProvider;
  model_id: string; // provider's identifier
  display_name: string;
  role: ModelRole;
  /** Credits per typical turn (~5k in / 1k out). Base = 1.0 (Haiku-ish). */
  credit_multiplier: number;
  allows_nsfw: boolean;
  /** Subscription tier gate — null = available to all */
  min_tier: "free" | "adventurer" | "storyteller" | "legend" | null;
  description: string;
};

export const MODELS: Record<string, ModelEntry> = {
  // ─── Anthropic (direct API) ─────────────────────────────────────────
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    model_id: "claude-sonnet-4-6",
    display_name: "Claude Sonnet 4.6",
    role: "narrator",
    credit_multiplier: 3.0,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "中文敘事最強。情感細膩。預設 narrator。",
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    model_id: "claude-haiku-4-5",
    display_name: "Claude Haiku 4.5",
    role: "director",
    credit_multiplier: 1.0,
    allows_nsfw: false,
    min_tier: "free",
    description: "快、平。Director 仲裁專用。",
  },
  "claude-opus-4-7": {
    id: "claude-opus-4-7",
    provider: "anthropic",
    model_id: "claude-opus-4-7",
    display_name: "Claude Opus 4.7",
    role: "narrator",
    credit_multiplier: 5.0,
    allows_nsfw: false,
    min_tier: "storyteller",
    description: "最深層敘事。複雜情節 + 多角色互動。",
  },

  // ─── OpenAI (via OpenRouter) ────────────────────────────────────────
  "gpt-4o": {
    id: "gpt-4o",
    provider: "openrouter",
    model_id: "openai/gpt-4o",
    display_name: "GPT-4o",
    role: "narrator",
    credit_multiplier: 2.5,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "OpenAI 旗艦。對白自然、英文混雜寫得順。",
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "openrouter",
    model_id: "openai/gpt-4o-mini",
    display_name: "GPT-4o mini",
    role: "narrator",
    credit_multiplier: 0.5,
    allows_nsfw: false,
    min_tier: "free",
    description: "OpenAI 平價版。Free tier 可用。",
  },

  // ─── Google (via OpenRouter · 2.5 series · current latest) ─────────
  "gemini-2-5-pro": {
    id: "gemini-2-5-pro",
    provider: "openrouter",
    model_id: "google/gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    role: "narrator",
    credit_multiplier: 2.0,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "Google 旗艦。1M+ context · 適合長 playthrough · 強推理。",
  },
  "gemini-2-5-flash": {
    id: "gemini-2-5-flash",
    provider: "openrouter",
    model_id: "google/gemini-2.5-flash",
    display_name: "Gemini 2.5 Flash",
    role: "narrator",
    credit_multiplier: 0.5,
    allows_nsfw: false,
    min_tier: "free",
    description: "Google 平價版。快 · 長 context · Free tier 可用。",
  },

  // ─── xAI (via OpenRouter · 2 versions) ──────────────────────────────
  "grok-2": {
    id: "grok-2",
    provider: "openrouter",
    model_id: "x-ai/grok-2-1212",
    display_name: "Grok 2",
    role: "narrator",
    credit_multiplier: 2.5,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "xAI 旗艦。對話風格活潑 · 多元觀點。",
  },
  "grok-2-mini": {
    id: "grok-2-mini",
    provider: "openrouter",
    model_id: "x-ai/grok-2-mini",
    display_name: "Grok 2 Mini",
    role: "narrator",
    credit_multiplier: 0.8,
    allows_nsfw: false,
    min_tier: "free",
    description: "xAI 平價版。快 · 同 Grok 2 同 family。",
  },

  // ─── OpenRouter NSFW (Phase 6 adult mode · CLAUDE.md hard rule #5) ─
  "llama-3-1-405b-uncensored": {
    id: "llama-3-1-405b-uncensored",
    provider: "openrouter",
    model_id: "meta-llama/llama-3.1-405b-instruct",
    display_name: "Llama 3.1 405B",
    role: "narrator",
    credit_multiplier: 2.5,
    allows_nsfw: true,
    min_tier: "storyteller",
    description: "Open source · 成人模式可用 (NSFW)。",
  },
};

export const DEFAULT_NARRATOR = "claude-sonnet-4-6";
export const DEFAULT_DIRECTOR = "claude-haiku-4-5";

export function getModel(id: string): ModelEntry {
  const m = MODELS[id];
  if (!m) throw new Error(`Unknown model id: ${id}`);
  return m;
}

export function modelsForTier(tier: "free" | "adventurer" | "storyteller" | "legend"): ModelEntry[] {
  const tierOrder = ["free", "adventurer", "storyteller", "legend"] as const;
  const userIdx = tierOrder.indexOf(tier);
  return Object.values(MODELS).filter((m) => {
    if (!m.min_tier) return true;
    const modelIdx = tierOrder.indexOf(m.min_tier);
    return modelIdx <= userIdx;
  });
}

export function modelsAllowingNsfw(): ModelEntry[] {
  return Object.values(MODELS).filter((m) => m.allows_nsfw);
}
