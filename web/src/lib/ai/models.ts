/**
 * Model catalog — single source of truth for LLM choices.
 *
 * ADR-022 (2026-05-28) Simplification 4 → 2 tier + GLM 5 NSFW
 *   - Founder rule: 2 model tiers only (Standard = Gemini 3.5 Flash · Pro = Sonnet 4.6/4.7)
 *   - Adult mode = cross-tier toggle · routes to GLM 5.1 with allows_nsfw=true
 *   - DROPPED: Pro Max (Opus 4.7) · Llama 3.1 405B
 *   - 訂閱 tier 仍維持 3 個 (Free + Standard $9.99 + Pro $19.99) · Standard 都可以開 adult
 *
 * ADR-021 (2026-05-28) HK founder constraint:
 *   - 只可以用 OpenRouter + Anthropic direct (founder 攞唔到 OpenAI API key)
 *   - 任何直駁 OpenAI / Google / xAI / Vertex 嘅 code = bug
 *
 * Architecture:
 *   - Users pick a TIER (Standard / Pro), NOT a specific model
 *   - Adult mode = toggle inside Settings · 開 + KYC 後路由去 GLM 5.1
 *   - `lib/ai/tier-router.ts` picks the actual model based on context
 *   - Credit charge per turn = actual usage (computeCredits in credits.ts)
 */

export type ModelRole = "director" | "narrator" | "general";
/** Per ADR-021: 只可以係 anthropic (direct) 或者 openrouter (aggregator). */
export type ModelProvider = "anthropic" | "openrouter";

/**
 * User-facing tier names (what they pick in the UI). Per ADR-022: 2 tier only.
 * Adult mode 唔係獨立 tier · 係 model-level allows_nsfw flag + adult_mode_enabled toggle.
 */
export type ModelTier = "standard" | "pro";

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
  // ─── Anthropic direct · Director + Pro pool narrator ────────────────
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    model_id: "claude-haiku-4-5",
    display_name: "Claude Haiku 4.5",
    role: "director",
    credit_multiplier: 1.0,
    allows_nsfw: false,
    min_tier: "free",
    description: "Director 仲裁 + 內容審核專用 · 用戶見唔到。",
    tier_pool: null, // internal · Director / moderation only
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

  // ─── OpenRouter · Pro pool English alternative ──────────────────────
  "gpt-5-4-pro": {
    id: "gpt-5-4-pro",
    provider: "openrouter",
    model_id: "openai/gpt-5.4-pro",
    display_name: "GPT-5.4 Pro",
    role: "narrator",
    credit_multiplier: 2.5,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "Pro tier · 英文敘事強 · 經 OpenRouter 路由。",
    tier_pool: "pro",
  },

  // ─── OpenRouter · Standard pool · free tier value ───────────────────
  // W4 fix 2026-05-28: model_id 由 google/gemini-3.5-flash 改 google/gemini-2.5-flash.
  // 3.5-flash 雖然喺 OpenRouter 上市 · 但 retest 揾到 streamText silent fail
  // (POST /turn 返 200 OK 但 narrator output 從未 stream out). 2.5-flash 喺 OpenRouter
  // battle-tested 同 tool calling 完整支援. Cost 都更平 ($0.30/$2.50 per 1M vs $1.50/$9).
  // 內部 Story Engine id 暫時保留 "gemini-3-5-flash" 避免 break existing playthroughs.
  "gemini-3-5-flash": {
    id: "gemini-3-5-flash",
    provider: "openrouter",
    model_id: "google/gemini-2.5-flash",
    display_name: "Gemini Flash",
    role: "narrator",
    credit_multiplier: 1.0,
    allows_nsfw: false,
    min_tier: "free",
    description: "Standard tier · 快 · 平 · 長 context · Free tier 可用。",
    tier_pool: "standard",
  },

  // ─── OpenRouter · Standard pool 中文 roleplay + NSFW model ──────────
  // ADR-022: GLM 5.1 同時係 (a) Standard pool 中文/roleplay 模型 (b) Adult mode
  // 統一 model · adult_mode_enabled + KYC user 路由去呢個 model with allows_nsfw=true
  "glm-5-1": {
    id: "glm-5-1",
    provider: "openrouter",
    model_id: "z-ai/glm-5.1",
    display_name: "GLM-5.1",
    role: "narrator",
    credit_multiplier: 1.0,
    allows_nsfw: true, // ADR-022: GLM 5 做 cross-tier NSFW model
    min_tier: "free",
    description: "Standard tier · 「Roleplay & 創意寫作最強」 · 中文 OK · 成人模式統一 model。",
    tier_pool: "standard",
  },
};

/**
 * Pool of models that serve each user-facing tier. ADR-022: 2 tier only.
 * Adult mode (cross-tier) 路由唔經呢度 · 直接 return GLM 5 via pickModelForTier
 * 嗰個 adult-aware path.
 */
export const TIER_POOLS: Record<ModelTier, string[]> = {
  standard: ["gemini-3-5-flash", "glm-5-1"],
  pro: ["claude-sonnet-4-6", "gpt-5-4-pro"],
};

/**
 * Director model · 內容審核 + Director verdict 都用呢個 (Anthropic direct · cheap).
 */
export const DIRECTOR_MODEL = "claude-haiku-4-5";

/**
 * Adult mode NSFW narrator model (ADR-022).
 * 任何 adult_mode_enabled=true + is_age_verified=true user 喺任何 tier 都用呢個.
 */
export const ADULT_NSFW_MODEL = "glm-5-1";

/**
 * Default tier for new accounts. "standard" 確保 free user 唔會撞到 Pro tier-gate 失敗 ·
 * 跟住 createStory action 用 tier-router pick model · turn route 直接接受.
 * (ADR-022 fix: 之前 default="pro" 令 free user 第一個 turn 即時 403.)
 */
export const DEFAULT_TIER: ModelTier = "standard";

/** Back-compat exports · 漸進 migration 期間用. */
export const DEFAULT_NARRATOR = "gemini-3-5-flash";
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
 * What subscription tier unlocks each user-facing model tier? (ADR-022 simplified)
 *   Standard model = Free signup user OK (gate `free`)
 *   Pro model = $9.99 Standard subscription unlocks (gate `adventurer`)
 *
 * Adult mode = orthogonal flag (adult_mode_enabled + is_age_verified) ·
 * 任何訂閱 tier user 都可以開（Standard $9.99 + KYC 都得 · Pro 一樣）·
 * 開咗就路由去 ADULT_NSFW_MODEL (GLM 5.1).
 */
export const TIER_GATE: Record<ModelTier, "free" | "adventurer" | "storyteller" | "legend"> = {
  standard: "free",
  pro: "adventurer",
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
 * Phase 1 — recent turns window size per tier (ADR-022 simplified).
 *
 * Cheaper tiers get fewer recent turns in the context (saves tokens) ·
 * higher tiers get fuller recent context. Phase 2 long-term memory (RAG +
 * summaries) compensates for the smaller window via vector recall.
 *
 * AUDIT FIX P1-UX-H-02 (Wave 2): bumped standard from 8 → 12. 仍然 align Pro ·
 * 喺 12 平衡 cost + 連續性. Adult mode user 用 GLM 5 跟 Standard 一樣 12 turn.
 */
export function recentTurnsLimitForTier(tier: ModelTier): number {
  switch (tier) {
    case "standard":
      return 12;
    case "pro":
      return 12;
  }
}
