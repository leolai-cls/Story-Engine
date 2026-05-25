/**
 * Model catalog — single source of truth for LLM choices.
 *
 * Session 10 (2026-05-25) curation 10 → 7 + tier-pool abstraction per founder
 * rule "我哋冇必要畀咁多公司 LLM 用家去選擇, 不如 just change it to something
 * like standard, pro to let user to choose":
 *
 *   - Users pick a TIER (Standard / Pro / Pro Max / Adult), NOT a specific model
 *   - Each tier has a POOL of underlying models (vendor diversification)
 *   - `lib/ai/tier-router.ts` picks the actual model based on context
 *     (language detection, vendor availability, cost optimization)
 *   - Credit charge per turn = actual usage (computeCredits in credits.ts)
 *     so internal model swap is transparent in billing
 *
 * Catalog rationale (research backing in pm/memory-architecture-v2.html):
 *   - DROPPED: GPT-4o, GPT-4o mini, Grok 2, Grok 2 Mini, Gemini 3.1 Pro
 *     (outdated · not roleplay leaders per 2026 benchmarks)
 *   - ADDED: GLM-5.1 ("Best for roleplay & creative writing" per BenchLM ·
 *     中文 leaderboard #3), GPT-5.4 Pro (current flagship · replaces GPT-4o)
 *   - KEPT: Claude Sonnet 4.6 (中文 #1 narrative), Opus 4.7 (#1 EQ),
 *     Haiku 4.5 (Director · cheap), Gemini 3.5 Flash (free value),
 *     Llama 3.1 405B (only NSFW per Hard rule #5)
 *
 * Phase 3 will move this to DB (`llm_models` table) for runtime config.
 * For Phase 1 we hardcode to keep things simple.
 */

export type ModelRole = "director" | "narrator" | "general";
export type ModelProvider = "anthropic" | "openai" | "google" | "xai" | "openrouter";

/**
 * User-facing tier names (what they pick in the UI).
 * Pool model selection is internal — see lib/ai/tier-router.ts.
 */
export type ModelTier = "standard" | "pro" | "pro-max" | "adult";

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
  /** Which tier-pool this model serves (null = internal-only e.g. Director) */
  tier_pool: ModelTier | null;
};

export const MODELS: Record<string, ModelEntry> = {
  // ─── Anthropic · Director + Pro pool + Pro Max ──────────────────────
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    model_id: "claude-haiku-4-5",
    display_name: "Claude Haiku 4.5",
    role: "director",
    credit_multiplier: 1.0,
    allows_nsfw: false,
    min_tier: "free",
    description: "Director 仲裁專用 · 用戶見唔到。",
    tier_pool: null, // internal · Director only
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    model_id: "claude-sonnet-4-6",
    display_name: "Claude Sonnet 4.6",
    role: "narrator",
    credit_multiplier: 2.5,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "Pro tier · 中文敘事旗艦 · 情感細膩。",
    tier_pool: "pro",
  },
  "claude-opus-4-7": {
    id: "claude-opus-4-7",
    provider: "anthropic",
    model_id: "claude-opus-4-7",
    display_name: "Claude Opus 4.7",
    role: "narrator",
    credit_multiplier: 4.0,
    allows_nsfw: false,
    min_tier: "storyteller",
    description: "Pro Max · 最深層敘事 · 複雜情節 + 多角色互動。",
    tier_pool: "pro-max",
  },

  // ─── OpenAI · Pro pool (English narrative · structured) ──────────────
  "gpt-5-4-pro": {
    id: "gpt-5-4-pro",
    provider: "openrouter",
    model_id: "openai/gpt-5.4-pro",
    display_name: "GPT-5.4 Pro",
    role: "narrator",
    credit_multiplier: 2.5,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "Pro tier · OpenAI 旗艦 · 英文敘事強。",
    tier_pool: "pro",
  },

  // ─── Google · Standard pool (free tier value) ────────────────────────
  "gemini-3-5-flash": {
    id: "gemini-3-5-flash",
    provider: "openrouter",
    model_id: "google/gemini-3.5-flash",
    display_name: "Gemini 3.5 Flash",
    role: "narrator",
    credit_multiplier: 1.5,
    allows_nsfw: false,
    min_tier: "free",
    description: "Standard tier · 快 · 長 context · Free tier 可用。",
    tier_pool: "standard",
  },

  // ─── Z.ai · Standard pool · "Best for roleplay" per BenchLM ──────────
  "glm-5-1": {
    id: "glm-5-1",
    provider: "openrouter",
    model_id: "z-ai/glm-5.1",
    display_name: "GLM-5.1",
    role: "narrator",
    credit_multiplier: 1.0, // $0.024/turn ≈ same as Haiku base
    allows_nsfw: false,
    min_tier: "free",
    description: "Standard tier · 「Roleplay & 創意寫作最強」 · 中文 OK · Free tier 可用。",
    tier_pool: "standard",
  },

  // ─── Meta via OpenRouter · Adult pool ────────────────────────────────
  "llama-3-1-405b-uncensored": {
    id: "llama-3-1-405b-uncensored",
    provider: "openrouter",
    model_id: "meta-llama/llama-3.1-405b-instruct",
    display_name: "Llama 3.1 405B",
    role: "narrator",
    credit_multiplier: 1.5,
    allows_nsfw: true,
    min_tier: "storyteller",
    description: "Adult tier · 成人模式專用 (NSFW · 唔被 ban 嘅 vendor)。",
    tier_pool: "adult",
  },
};

/**
 * Pool of models that serve each user-facing tier.
 * tier-router picks one based on language detection + vendor availability.
 */
export const TIER_POOLS: Record<ModelTier, string[]> = {
  standard: ["gemini-3-5-flash", "glm-5-1"],
  pro: ["claude-sonnet-4-6", "gpt-5-4-pro"],
  "pro-max": ["claude-opus-4-7"],
  adult: ["llama-3-1-405b-uncensored"],
};

/**
 * Director model always used internally (never user-visible).
 * Cheapest acceptable Claude for verdict + npc_updates extraction.
 */
export const DIRECTOR_MODEL = "claude-haiku-4-5";

/**
 * Default tier for new accounts (also fallback when user has no preference).
 * "pro" picked as default because Sonnet 4.6 is our 中文 narrative leader and
 * matches the founder's pre-Session-10 default (DEFAULT_NARRATOR = sonnet).
 */
export const DEFAULT_TIER: ModelTier = "pro";

/** Back-compat exports for code that hasn't migrated to tier abstraction. */
export const DEFAULT_NARRATOR = "claude-sonnet-4-6";
export const DEFAULT_DIRECTOR = DIRECTOR_MODEL;

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

/**
 * What subscription tier unlocks each user-facing model tier?
 * Used by ModelPicker UI to grey out tiers above user's plan.
 */
export const TIER_GATE: Record<ModelTier, "free" | "adventurer" | "storyteller" | "legend"> = {
  standard: "free",
  pro: "adventurer",
  "pro-max": "storyteller",
  adult: "storyteller", // PLUS adult_mode_enabled + is_age_verified
};

/**
 * Resolve which user-facing tier serves a given narrator model id.
 * Falls back to DEFAULT_TIER if model unknown · used by turn route to
 * scale memory window size per tier (Phase 1 P1.7).
 */
export function tierForModel(modelId: string | null | undefined): ModelTier {
  if (!modelId) return DEFAULT_TIER;
  const m = MODELS[modelId];
  return m?.tier_pool ?? DEFAULT_TIER;
}

/**
 * Phase 1 — recent turns window size per tier.
 *
 * Cheaper tiers get fewer recent turns in the context (saves tokens) ·
 * higher tiers get fuller recent context. Phase 2 long-term memory (RAG +
 * summaries) compensates for the smaller window via vector recall.
 *
 * AUDIT FIX P1-UX-H-02 (Wave 2): bumped standard from 8 → 12. Pre-Phase 1
 * default was 20 · cutting to 8 would silently regress existing Standard
 * players' mid-scene continuity (Narrator drops turns 9-20 ago). 12 matches
 * Pro · still saves ~8 turns of input tokens vs the prior 20-turn baseline ·
 * preserves emotional callbacks across the typical confession/conflict arc.
 *
 * Tuning rationale (post-Wave 2):
 *   - standard (12) — Gemini Flash / GLM cheap enough to afford same as Pro
 *   - pro (12) — middle ground for Sonnet/GPT
 *   - pro-max (20) — Opus deserves the full context window
 *   - adult (12) — Llama 405B context isn't free either
 */
export function recentTurnsLimitForTier(tier: ModelTier): number {
  switch (tier) {
    case "standard":
      return 12;
    case "pro":
      return 12;
    case "pro-max":
      return 20;
    case "adult":
      return 12;
  }
}
