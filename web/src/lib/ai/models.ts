/**
 * Model catalog — single source of truth for LLM choices.
 *
 * ADR-022 (2026-05-28) Simplification 4 → 2 tier + GLM 5 NSFW
 *   - Founder rule: 2 model tiers only (Standard = Gemini 3.5 Flash · Pro = Sonnet 4.6/4.7)
 *   - Adult mode = cross-tier toggle · routes to GLM 5.1 with allows_nsfw=true
 *   - DROPPED: Pro Max (Opus 4.7) · Llama 3.1 405B
 *   - 訂閱 tier 仍維持 3 個 (Free + Standard $9.99 + Pro $19.99) · Standard 都可以開 adult
 *
 * ADR-021 (2026-05-29) HK founder constraint + provider switch:
 *   - 只可以用 CrazyRouter (aggregator) + Anthropic direct (founder 喺香港攞唔到 OpenAI key)
 *   - CrazyRouter 取代 OpenRouter (2026-05-29)：OpenRouter 封香港帳號用 US-trio
 *     (Gemini/GPT/Claude) → "provider Terms of Service" 403。CrazyRouter 有香港節點 ·
 *     CN 鏡像 · 唔 block US-trio · 容許成人內容 · 有 embedding。
 *   - Gemini / GLM / GPT / embedding 全部行 CrazyRouter (短 slug · 冇 provider/ prefix)
 *   - Claude Sonnet / Haiku 留 Anthropic 直駁 (prompt cache 慳錢 · 最信得過 · 做後備)
 *   - 任何直駁 OpenAI / Google / xAI / Vertex 嘅 code = bug
 *
 * Architecture:
 *   - Users pick a TIER (Standard / Pro), NOT a specific model
 *   - Adult mode = toggle inside Settings · 開 + KYC 後路由去 GLM 5.1
 *   - `lib/ai/tier-router.ts` picks the actual model based on context
 *   - Credit charge per turn = actual usage (computeCredits in credits.ts)
 */

export type ModelRole = "director" | "narrator" | "general";
/** Per ADR-021 (2026-05-29): 只可以係 anthropic (direct) 或者 crazyrouter (aggregator). */
export type ModelProvider = "anthropic" | "crazyrouter";

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

  // ─── CrazyRouter · Pro pool English alternative ─────────────────────
  // Slug at CrazyRouter is the bare `gpt-5.4` (no provider/ prefix · no -pro variant).
  "gpt-5-4-pro": {
    id: "gpt-5-4-pro",
    provider: "crazyrouter",
    model_id: "gpt-5.4",
    display_name: "GPT-5.4",
    role: "narrator",
    credit_multiplier: 2.5,
    allows_nsfw: false,
    min_tier: "adventurer",
    description: "Pro tier · 英文敘事強 · 經 CrazyRouter 路由。",
    tier_pool: "pro",
  },

  // ─── CrazyRouter · Standard pool · free tier value ──────────────────
  // Founder explicit (2026-05-28): use Gemini 3.5 Flash · 唔好換做 2.5 Flash.
  // CrazyRouter slug = bare `gemini-3.5-flash`. NOTE: Gemini on CrazyRouter
  // defaults to a thinking pass that eats the whole token budget → empty prose;
  // providers.ts injects thinking_budget=0 (unless the user opts into thinking).
  "gemini-3-5-flash": {
    id: "gemini-3-5-flash",
    provider: "crazyrouter",
    model_id: "gemini-3.5-flash",
    display_name: "Gemini 3.5 Flash",
    role: "narrator",
    credit_multiplier: 1.5,
    allows_nsfw: false,
    min_tier: "free",
    description: "Standard tier · 快 · 長 context · Free tier 可用。",
    tier_pool: "standard",
  },

  // ─── CrazyRouter · Standard pool 中文 roleplay model ─────────────────
  // ADR-022: GLM 5.1 = Standard pool 中文/roleplay 模型。
  // ADR-024 (2026-06-01): 成人向 narrator 由 GLM 換做 Grok 4.1 (見下) · GLM 唔再
  // 做 adult model · 留返做 Standard 中文 SFW。allows_nsfw 留 true (佢的確識做) ·
  // 但 adultMode 路由唔再指向佢。
  // CrazyRouter slug = bare `glm-5.1`.
  "glm-5-1": {
    id: "glm-5-1",
    provider: "crazyrouter",
    model_id: "glm-5.1",
    display_name: "GLM-5.1",
    role: "narrator",
    credit_multiplier: 1.0,
    allows_nsfw: true, // 識做 NSFW · 但 adult 路由已改去 Grok (ADR-024)
    min_tier: "free",
    description: "Standard tier · 中文 roleplay · 長 context。",
    tier_pool: "standard",
  },

  // ─── CrazyRouter · 成人向唯一 narrator model (ADR-024 · 2026-06-01) ────
  // Founder 決定 (research-backed: Reddit/JanitorAI 社群 + EQ-Bench 寫作評測):
  // 成人向由 GLM-5.1 (偏弱 · 會 retcon 即興角色名 · 真實 playthrough「阿俊」bug)
  // 換做 Grok 4.1。理由:
  //   - 前沿級一致性遠勝 GLM → 直接修 retcon (記唔牢一閃名 → 自己作新名嘅病)
  //   - xAI 最 permissive (辛辣模式 · 唔拒絕成人內容)
  //   - 經 CrazyRouter (本身容許成人內容) · 唔會累 Anthropic 帳號 (hard rule #5)
  // 失敗處理 = 通用機制 (maxRetries=1 連接層自動再試 + onFinish 誠實失敗 + 前端
  //   retry 掣) · 同所有 model 一樣 · 唔自動轉 model (founder 2026-06-01:「用返
  //   同正常 model 一樣機制」· 否決 Kimi 自動後備)。
  // CrazyRouter slug = bare `grok-4.1` (非 -thinking variant · 直接寫 prose ·
  //   理論上冇 Gemini 嗰個 thinking-budget 食晒 budget 出空白嘅 footgun · 但
  //   founder 實測時若見空白回合 → 查 xAI reasoning param 加入 providers.ts 攔截)。
  "grok-4-1": {
    id: "grok-4-1",
    provider: "crazyrouter",
    model_id: "grok-4.1",
    display_name: "Grok 4.1",
    role: "narrator",
    // ⚠️ credit_multiplier 係 legacy / charge path 根本冇用到嘅 field — 實際扣費
    // 純粹經 credits.ts MODEL_PRICING token rate。grok MODEL_PRICING = $3/$9 ≈ glm
    // ($1.40/$4.40) 嘅 ~2 倍 (典型回合) → 成人向每回合 credit 實際係升咗 (Grok 貴)。
    // pricing 策略 (要唔要 subsidize 成人向) 屬 money-tier 再議。
    credit_multiplier: 1.0,
    allows_nsfw: true,
    // 成人向任何訂閱 tier 都可開 · 真正 gate 喺 content_rating='adult' +
    // adult_mode_enabled (turn route) · 唔靠 min_tier。
    min_tier: "free",
    description: "成人模式 narrator · 前沿級一致性 + 最 permissive · 經 CrazyRouter。",
    // adult-only · 經 pickModelForTier 嘅 adultMode branch 路由 · 唔入 TIER_POOLS
    // 正常輪換 (tierForModel null → DEFAULT_TIER standard → 12-turn 記憶窗 · 同
    // 之前 GLM adult 一致)。
    tier_pool: null,
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
 * Adult mode NSFW narrator model.
 * ADR-022: 任何 adult_mode_enabled=true user 喺任何 tier 都用呢個。
 * ADR-024 (2026-06-01): GLM-5.1 → Grok 4.1 (research-backed · 修 retcon · 最
 *   permissive · 經 CrazyRouter 唔累 Anthropic 帳號)。成人向 NPC L3 agent
 *   (npc-agents.ts) 都跟住用呢個 (NSFW context 唔可上 Anthropic · hard rule #5)。
 */
export const ADULT_NSFW_MODEL = "grok-4-1";

/**
 * Default tier for new accounts. "standard" 確保 free user 唔會撞到 Pro tier-gate 失敗 ·
 * 跟住 createStory action 用 tier-router pick model · turn route 直接接受.
 * (ADR-022 fix: 之前 default="pro" 令 free user 第一個 turn 即時 403.)
 */
export const DEFAULT_TIER: ModelTier = "standard";

/** Back-compat exports · 漸進 migration 期間用.
 *  Founder explicit (2026-05-28): keep gemini-3-5-flash · agent 上次將
 *  「provider TOS violation」誤判做 Gemini safety filter · 未 verify 真正
 *  root cause. Plain Gemini fiction usage 玩戀愛 / 黑道題材本身冇問題.
 *  真正 root cause 可能係 OpenRouter privacy setting / request body
 *  param incompat / @ai-sdk middleware · 要直接 reproduce 同 inspect SSE
 *  error 先知.
 */
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
