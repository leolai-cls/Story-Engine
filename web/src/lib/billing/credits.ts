import type { SupabaseClient } from "@supabase/supabase-js";
import { NPC_L3_CREDITS_PER_NPC } from "@/schemas/npc-agent";

/**
 * Credit meter — Phase 3 monetization foundation per ADR-009 / CLAUDE.md.
 *
 * 1 credit ≈ $0.001 USD (BASE = 1000 credits per USD).
 * Formula per LLM call:
 *   credits = ceil(
 *     (input_tokens × input_price + output_tokens × output_price) / 1M
 *     × STORY_ENGINE_MARKUP × BASE
 *   )
 *
 * STORY_ENGINE_MARKUP = 2.0 — covers infrastructure (Vercel + Supabase),
 * payment processing (~3% Stripe), refunds, and gross margin.
 *
 * ⚠️ REAL PER-TURN COST (2026-05-25 honest accounting · pm/pricing-v2):
 *   Orchestrator pipeline sends ~15K input tokens / turn (Bible 600 cached +
 *   Cards 2000 cached + last 20 turns 10K NOT cached + RAG 600 + summary 500
 *   + state 300 + verdict 300 + action 50 + sys 500). Output ~1K. Director
 *   adds another ~2750 input + 300 output via Haiku.
 *
 *   Effective per-turn raw cost (all-in · Narrator + Director + memory ops).
 *   Session 10 catalog curation 10 → 7 + tier-pool abstraction (founder rule
 *   2026-05-25): users pick tier (Standard / Pro / Pro Max / Adult) · we
 *   internally route to one of the pool models. Credit charge is computed
 *   from actual usage so internal model swaps are transparent in billing.
 *
 *   FULL-TURN cost (narrator + Director + lorebook + summarizer + embed),
 *   rates verified 2026-05-29 via CrazyRouter /api/pricing + Anthropic direct:
 *     Standard turn (GLM-5.1)              $0.026 → ~54 credits
 *     Pro turn (Claude Sonnet 4.6)         $0.037 → ~76 credits
 *     + deep-thinking ON: ~1.4-2× the above (reasoning tokens billed)
 *
 *   Tier allocations (2-tier · ADR-022 · 2026-05-29 founder re-balance ·
 *   source of truth lib/stripe/products.ts):
 *     Free        1,000 signup + 100/day (cap 1,000 wallet) · ~2 turns/day
 *     Standard    $9.99/mo · 8,000 cr · ~150 GLM turns/mo (5× free)
 *     Pro         $19.99/mo · 18,000 cr · ~235 Sonnet turns/mo
 *
 *   Margin (worst case user burns ALL credits): the credit allocation
 *   HARD-CAPS our model cost per user — max ~$4 (Standard) / ~$9 (Pro) of
 *   model cost vs $9.99 / $19.99 revenue → ~54% / ~51% gross margin after
 *   Stripe. We do NOT lose money. (Was 2,000/4,000 cr · bumped so paying
 *   clearly beats free, which is 1k + 100/day · founder 2026-05-29.)
 *
 * All balance changes route through `apply_credit_charge` Postgres RPC —
 * RLS blocks direct INSERT on `credit_ledger`, so this is the ONLY entry
 * point for credit movement. The RPC is atomic (row lock + write + ledger
 * entry in one transaction) and throws `insufficient_credits` if a charge
 * would push balance below 0.
 */

// ─── Pricing constants ──────────────────────────────────────────────────

export const BASE_CREDITS_PER_USD = 1000;
export const STORY_ENGINE_MARKUP = 2.0;

/**
 * Per-model token pricing — USD per 1M tokens.
 *
 * Source: Anthropic pricing page Jan 2026; OpenAI text-embedding pricing.
 * Update these when a vendor changes their rate card.
 */
export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Cached input token price (Anthropic prompt caching ~10% of input rate). */
  cachedInputPerMillion?: number;
};

/**
 * Pricing source-of-truth · all rates verified 2026-05-25 via:
 *   · anthropic.com/pricing (direct API)
 *   · openrouter.ai/{provider}/{model} pages (aggregate)
 *
 * ⚠️ Founder rule (2026-05-25 · per pm/pricing-v2-comprehensive.html):
 * MUST verify these rates before each tier/pricing change. Old values were
 * sometimes 5× off real cost (e.g. Gemini Flash old $0.30/$2.5 vs actual
 * $1.50/$9 · system was undercharging credits silently).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ─── Anthropic (direct · prompt caching: cached input @ 10% of input rate) ─
  "claude-sonnet-4-6": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.3,
  },
  "claude-haiku-4-5": {
    // RATE FIX 2026-05-25: was $0.80/$4 (old Haiku 3.5 era) · now $1/$5 for 4.5
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cachedInputPerMillion: 0.1,
  },
  "claude-opus-4-7": {
    // RATE FIX 2026-05-25: was $15/$75 (old Opus 3 era) · 4.7 dropped to $5/$25
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cachedInputPerMillion: 0.5,
  },
  // ─── OpenAI Embeddings ─────────────────────────────────────────────
  "text-embedding-3-small": {
    inputPerMillion: 0.02,
    outputPerMillion: 0, // embeddings have no output tokens
  },
  // ─── Curated narrators (Session 10 · founder model curation · 10 → 7) ─
  // DROPPED: GPT-4o, GPT-4o mini (outdated · GPT-5 era now) · Grok 2 / Grok 2
  // Mini (not roleplay leaders) · Gemini 3.1 Pro (overlap with Flash + Sonnet).
  // KEPT entries below preserved for back-compat with existing playthroughs
  // (locked at creation per Hard rule) · BUT removed from MODELS catalog so
  // new playthroughs can't pick them. computeCredits still works on old
  // playthroughs because MODEL_PRICING lookup unchanged.
  "gpt-4o": {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
  },
  "gpt-4o-mini": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
  "gemini-3-1-pro": {
    inputPerMillion: 2.0,
    outputPerMillion: 12.0,
  },
  "gemini-3-5-flash": {
    // ⚠️ Rate verified 2026-05-25: was $0.30/$2.5 · actual $1.50/$9
    inputPerMillion: 1.5,
    outputPerMillion: 9.0,
  },
  "grok-2": {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
  },
  "grok-2-mini": {
    inputPerMillion: 0.5,
    outputPerMillion: 1.5,
  },
  // ─── NEW Session 10 (verified via OpenRouter pricing pages 2026-05-25) ─
  "glm-5-1": {
    // GLM-5.1 (Z.ai) · Standard 中文/roleplay + adult-mode model.
    // RATE FIX 2026-05-29: verified via CrazyRouter /api/pricing (model_ratio
    // 0.70 → $1.40/1M in · completion_ratio ~3.14 → $4.40/1M out · discount 1.0
    // = no promo). Was $0.98/$3.08 (stale OpenRouter z-ai/glm-5.1 rate) which
    // UNDER-charged ~43% → effective markup had dropped to ~1.4×. This is our
    // most-used Standard model, so the fix matters most here.
    inputPerMillion: 1.4,
    outputPerMillion: 4.4,
  },
  "gpt-5-4-pro": {
    // GPT-5.4 (Pro pool · English alt). CrazyRouter slug `gpt-5.4`.
    // RATE FIX 2026-05-29: CrazyRouter base $1.75/$14 (model_ratio 0.875 ·
    // completion_ratio 8); a 0.65 promo discount currently nets ~$1.14/$9.10,
    // but we price at the UN-discounted base so margin survives if the promo
    // ends (conservative · still below the old $2.50/$15).
    inputPerMillion: 1.75,
    outputPerMillion: 14.0,
  },
  "grok-4-1": {
    // Grok 4.1 (xAI · 成人向 narrator · ADR-024). CrazyRouter slug `grok-4.1`.
    // 🚑 HOTFIX 2026-06-01: PR #56 加咗 grok-4-1 入 MODELS 但漏咗呢個 MODEL_PRICING
    // entry → computeCredits 拋 "no MODEL_PRICING entry" → 成人向 play 頁 / turn
    // 即時 500 (launch blocker · founder 開新成人故事撞到)。
    // 價格 2026-06-01 (founder 提供 CrazyRouter grok-4.1 詳細頁 · 已確認)：
    //   詳細頁 auto 分組 = 提示(input) $1.65/M · 补全(output) $8.25/M。
    //   呢啲係 -45% promo 價：$1.65 = $3.00×0.55 · $8.25 = $15.00×0.55。
    //   → un-discounted 原价 = $3.00 / $15.00 (ratio 5×)。
    // 我哋 price at un-discounted 原价 (跟 gpt-5-4-pro 保守慣例 · promo 完都唔蝕
    // margin)。如果 founder 想用返 promo 價 ($1.65/$8.25) 令成人向平啲 = money-tier
    // 決定。(我之前一度誤用 grok-4.2 嘅 3× ratio 估 output=$9 · 錯 · 詳細數據糾正返。)
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  "deepseek-v3-2": {
    // DeepSeek V3.2 (Standard 中文 roleplay · 取代 GLM · 2026-06-01)。
    // Founder 提供 CrazyRouter grok-style 詳細頁確認: 提示(input) $0.252 /
    // 补全(output) $0.378 = 原价 $0.28/$0.42 嘅 -10% promo 價。
    // Price at un-discounted 原价 (跟 gpt-5-4-pro / grok 保守慣例)。
    // 平過 GLM ($1.40/$4.40) 約 5×。
    inputPerMillion: 0.28,
    outputPerMillion: 0.42,
  },
  // ─── OpenRouter NSFW (Phase 6 adult mode · Hard rule #5 LLM isolation) ─
  // Llama 3.1 405B · only NSFW-allowed narrator · uncensored variant.
  // P6-CRIT-01 fix: key MUST match the internal MODELS id, NOT provider id.
  // Rate from OpenRouter cheapest-provider (re-verify · est based on Hermes
  // 405B at $1/$1 + base Llama at $1.5/$2 mid-range estimate).
  "llama-3-1-405b-uncensored": {
    inputPerMillion: 1.5,
    outputPerMillion: 2.0,
  },
};

/**
 * Compute credit cost for a single LLM call. Always positive integer (use
 * negative when passing to `apply_credit_charge` as a debit).
 *
 * `cachedInputTokens` is INCLUDED in `inputTokens` per Anthropic's usage
 * shape — we subtract them and re-price at the cached rate. If cached count
 * is missing or model has no cached rate, the full input price applies.
 */
export function computeCredits(params: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  /** Optional per-call markup override (e.g., for premium tier upcharge). */
  markup?: number;
}): number {
  const pricing = MODEL_PRICING[params.modelId];
  if (!pricing) {
    // AUDIT FIX (P3-LOGIC-L-14): unknown model THROWS instead of silently
    // returning 0. Previously a typo or missing pricing entry would have
    // let users play free until someone noticed the warning. Now: hard
    // failure surfaces the misconfiguration immediately.
    throw new Error(
      `computeCredits: no MODEL_PRICING entry for "${params.modelId}". ` +
        `Add the model to MODEL_PRICING before using it in production.`,
    );
  }
  const markup = params.markup ?? STORY_ENGINE_MARKUP;

  // AUDIT FIX (P3-COST-M-07): inputTokens from Vercel AI SDK is ALREADY
  // exclusive of cachedInputTokens (Anthropic's `usage.input_tokens` is
  // fresh + cache_creation; `cache_read_input_tokens` is the cached
  // count). Previously this function subtracted cached from input, which
  // double-counted and undercharged ~10% on every cached turn. Fix:
  // input = full input rate, cached = separate cached rate, no subtraction.
  const freshInput = Math.max(0, params.inputTokens ?? 0);
  const cachedInput = Math.max(0, params.cachedInputTokens ?? 0);
  const outputTokens = Math.max(0, params.outputTokens ?? 0);
  const cachedRate = pricing.cachedInputPerMillion ?? pricing.inputPerMillion;

  const usdCost =
    (freshInput * pricing.inputPerMillion +
      cachedInput * cachedRate +
      outputTokens * pricing.outputPerMillion) /
    1_000_000;

  const credits = Math.ceil(usdCost * markup * BASE_CREDITS_PER_USD);
  return credits;
}

// ─── Aggregate cost helpers ─────────────────────────────────────────────

export type TurnUsage = {
  narrator: {
    modelId: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
  director?: {
    modelId: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
  lorebook?: { inputTokens?: number; outputTokens?: number };
  summarizer?: { inputTokens?: number; outputTokens?: number };
  /**
   * Character Soul (Audit HIGH-1 fix) · 經歷日誌 + 信念抽取背景 Haiku call ·
   * 只喺有升級角色 (interaction_count>=3) 嘅 turn 跑。固定 reserve (似 lorebook ·
   * 因為 call 喺 charge 之後先 fire · 用估計 token · 2× markup 吸收 variance)。
   */
  experience?: { inputTokens?: number; outputTokens?: number };
  embedTokens?: number;
  /**
   * Phase 1.5 · NPC L3 Agents (Storyteller tier exclusive · founder Q3).
   * Count of successful NPC agent calls this turn (failed agents are free per
   * UX policy). Each successful agent charges NPC_L3_CREDITS_PER_NPC (=6)
   * credits ON TOP of the actual model usage cost which also flows through
   * narrator usage (NPC inner streams block adds ~450 tokens to Narrator input).
   *
   * Pattern: flat-rate add-on per NPC. Real cost ~$0.0044/NPC (GLM-5.1 no cache
   * + Narrator overhead share). At 1 credit = $0.001 + 2× markup ≈ 8.8 credits
   * raw · founder Q3 rounded to 6 for value perception. ~9% credit burn add-on
   * for 3-NPC scene · ~8% reduction in monthly turn budget for Storyteller.
   */
  npcL3SuccessfulAgents?: number;
};

/**
 * Sum all per-call costs for one turn into total credits to charge.
 * Background work (lorebook + summarizer) uses Haiku; embed is text-embedding-3-small.
 */
export function computeTurnCredits(usage: TurnUsage): number {
  const narratorCredits = computeCredits({
    modelId: usage.narrator.modelId,
    inputTokens: usage.narrator.inputTokens ?? 0,
    outputTokens: usage.narrator.outputTokens ?? 0,
    cachedInputTokens: usage.narrator.cachedInputTokens,
  });

  const directorCredits = usage.director
    ? computeCredits({
        modelId: usage.director.modelId,
        inputTokens: usage.director.inputTokens ?? 0,
        outputTokens: usage.director.outputTokens ?? 0,
        cachedInputTokens: usage.director.cachedInputTokens,
      })
    : 0;

  const lorebookCredits = usage.lorebook
    ? computeCredits({
        modelId: "claude-haiku-4-5",
        inputTokens: usage.lorebook.inputTokens ?? 0,
        outputTokens: usage.lorebook.outputTokens ?? 0,
      })
    : 0;

  const summarizerCredits = usage.summarizer
    ? computeCredits({
        modelId: "claude-haiku-4-5",
        inputTokens: usage.summarizer.inputTokens ?? 0,
        outputTokens: usage.summarizer.outputTokens ?? 0,
      })
    : 0;

  const embedCredits = usage.embedTokens
    ? computeCredits({
        modelId: "text-embedding-3-small",
        inputTokens: usage.embedTokens,
        outputTokens: 0,
      })
    : 0;

  // Character Soul (Audit HIGH-1 fix) · 經歷日誌 + 信念抽取 Haiku call
  const experienceCredits = usage.experience
    ? computeCredits({
        modelId: "claude-haiku-4-5",
        inputTokens: usage.experience.inputTokens ?? 0,
        outputTokens: usage.experience.outputTokens ?? 0,
      })
    : 0;

  // Phase 1.5 · NPC L3 Agents flat-rate add-on (founder Q3 sign-off)
  // 6 credits per successful agent · 0 for failed (UX: don't charge on failure)
  const npcL3Credits = (usage.npcL3SuccessfulAgents ?? 0) * NPC_L3_CREDITS_PER_NPC;

  return (
    narratorCredits +
    directorCredits +
    lorebookCredits +
    summarizerCredits +
    embedCredits +
    experienceCredits +
    npcL3Credits
  );
}

// NPC_L3_CREDITS_PER_NPC imported from @/schemas/npc-agent (single source of truth)

/**
 * Pre-turn cost estimate for UI display ("呢個 turn 大概用 ~32 credits").
 * Based on typical token usage observed in production. Adjust as patterns evolve.
 *
 * Phase 1.5: optional `npcL3ExpectedAgents` projects NPC L3 add-on
 * (~6 credits per active NPC). UI passes 2-3 when L3 enabled · 0 otherwise.
 */
export function estimateTurnCredits(
  narratorModelId: string,
  npcL3ExpectedAgents: number = 0,
  thinkingEnabled: boolean = false,
): number {
  return computeTurnCredits({
    narrator: {
      modelId: narratorModelId,
      inputTokens: 3000,
      // 2026-05-29: deep-thinking mode runs a reasoning pass before the story
      // text, so the turn route bumps maxOutputTokens 1500→4000. The pre-charge
      // estimate must reserve more or a low-balance user passes the gate then
      // hits post-stream insufficient_credits (free turn + reconciliation debt).
      // Over-estimate on purpose (same rationale as the L3 add-on projection).
      outputTokens: thinkingEnabled ? 3500 : 800,
      cachedInputTokens: 2000, // assume 67% cache hit in steady state
    },
    director: {
      modelId: "claude-haiku-4-5",
      inputTokens: 8000,
      outputTokens: 400,
      cachedInputTokens: 5000,
    },
    lorebook: { inputTokens: 2000, outputTokens: 500 },
    summarizer: { inputTokens: 250, outputTokens: 40 }, // amortized 1/20
    embedTokens: 400,
    // Audit LOW fix: 對稱於 actual charge 嘅 experience reserve。中後期 turn 通常
    // 有升級角色 → 經歷 Haiku call。pre-charge 估算唔加會令 low-balance user 過 gate
    // 後少收 ~6 credit (方向安全·唔會多收·但對稱性更乾淨)。保守當有 (略高估)。
    experience: { inputTokens: 1500, outputTokens: 300 },
    npcL3SuccessfulAgents: npcL3ExpectedAgents,
  });
}

/**
 * Estimate credits to create a new story (4 parallel schema-gen calls).
 * Used for pre-creation balance check + UI display.
 */
export function estimateStoryCreationCredits(): number {
  // 4 parallel Claude Haiku 4.5 calls (2026-05-29 · switched from Sonnet for
  // ~2× faster creation): meta+opening / state_schema / bible / characters.
  // Typical: ~1500 input + 1500 output per call.
  return (
    4 *
    computeCredits({
      modelId: "claude-haiku-4-5",
      inputTokens: 1500,
      outputTokens: 1500,
    })
  );
}

// ─── RPC wrappers ───────────────────────────────────────────────────────

export type ChargeReason =
  | "turn_charge"
  | "story_charge"
  | "embed_charge"
  | "sub_grant"
  | "topup"
  | "refund"
  | "admin_adjust"
  | "free_tier_refresh"
  | "sub_renewal"
  | "sub_canceled"
  // Phase 8 scene visualization (Migration 0041)
  | "scene_image_charge"
  | "portrait_charge";

export type ChargeRefType =
  | "turn"
  | "story"
  | "subscription"
  | "topup"
  | "admin"
  | "scene_image"           // Phase 8 · ref_id = scene_images.id
  | "character_portrait";   // Phase 8 · ref_id = story_characters.id

export type ChargeResult =
  | { ok: true; newBalance: number; ledgerId: string }
  | { ok: false; error: "insufficient_credits"; currentBalance: number; needed: number }
  | { ok: false; error: "profile_not_found"; message: string }
  | { ok: false; error: "forbidden"; message: string }
  | { ok: false; error: "other"; message: string };

/**
 * Apply a credit movement via the SECURITY DEFINER RPC.
 *
 * `delta` is signed: negative for charges, positive for grants/refunds.
 * Returns structured result so caller can branch on insufficient_credits.
 *
 * AUDIT FIX (P3-LOGIC-M-09): now uses Postgres errcode for branching
 * instead of regex-matching error message. RPC raises:
 *   - 'P0001' on insufficient_credits (with detail "current=X delta=Y...")
 *   - 'P0002' on profile_not_found
 *   - '42501' on forbidden (caller not allowed to charge target)
 *
 * AUDIT FIX (P3-LOGIC-M-11): explicit profile_not_found branch surfaces
 * the case where signup trigger didn't fire (rare but possible).
 */
export async function chargeCredits(
  supabase: SupabaseClient,
  params: {
    userId: string;
    delta: number;
    reason: ChargeReason;
    refType?: ChargeRefType;
    refId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ChargeResult> {
  const { data, error } = await supabase.rpc("apply_credit_charge", {
    p_user_id: params.userId,
    p_delta: params.delta,
    p_reason: params.reason,
    p_ref_type: params.refType ?? null,
    p_ref_id: params.refId ?? null,
    p_metadata: (params.metadata ?? null) as never,
  });

  if (error) {
    // Postgres error code branching (preferred over message regex)
    const code = (error as { code?: string }).code ?? "";
    const msg = error.message ?? "";
    const details = (error as { details?: string }).details ?? "";

    if (code === "P0001" || /insufficient_credits/i.test(msg)) {
      // Parse detail "current=X delta=Y would_be=Z" — sits on error.details
      // when the RPC raises with `USING DETAIL`, not on error.message.
      const haystack = `${details} ${msg}`;
      const m = haystack.match(/current=(-?\d+)\s+delta=(-?\d+)/);
      const currentBalance = m ? parseInt(m[1], 10) : 0;
      const needed = m ? Math.abs(parseInt(m[2], 10)) : Math.abs(params.delta);
      return { ok: false, error: "insufficient_credits", currentBalance, needed };
    }
    if (code === "P0002" || /profile_not_found/i.test(msg)) {
      return { ok: false, error: "profile_not_found", message: msg };
    }
    if (code === "42501" || /forbidden/i.test(msg)) {
      return { ok: false, error: "forbidden", message: msg };
    }
    return { ok: false, error: "other", message: msg };
  }

  // RPC returns table(new_balance int, ledger_id uuid) — Supabase returns array of rows
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: "other", message: "apply_credit_charge returned empty" };
  }
  return {
    ok: true,
    newBalance: row.new_balance as number,
    ledgerId: row.ledger_id as string,
  };
}

/**
 * Cheap balance check before starting a turn / story creation. Returns
 * current balance and whether it covers the estimated cost. Doesn't lock
 * the row — final atomic check is in the post-call charge.
 *
 * Pattern: pre-check (cheap, friendly UX error) + post-charge (atomic, source of truth).
 *
 * AUDIT FIX (P3-LOGIC-H-05): on transient errors (network blip, RLS deny,
 * lock timeout), this used to return {balance:0, sufficient:false} —
 * showing the user "Credit 唔夠（剩 0）" even when they had 50k credits.
 * Now: fail-open. We log + return {balance:null, sufficient:true} so the
 * atomic RPC remains the true gate. If RPC then fails for the same
 * underlying reason, user sees the real error.
 *
 * Session 16 audit HIGH-04 fix: was returning balance=-1 (sentinel) which
 * leaked into UI as「-1 credits」on settings/turn. Now returns null so the
 * UI can render "—" / spinner instead.
 */
export async function getBalanceAndCheck(
  supabase: SupabaseClient,
  params: { userId: string; estimatedCost: number },
): Promise<{ balance: number | null; sufficient: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", params.userId)
    .single();

  if (error || !data) {
    console.warn(
      `[credits] getBalanceAndCheck transient failure (fail-open): ${error?.message ?? "no data"}`,
    );
    return { balance: null, sufficient: true };
  }
  const balance = data.credit_balance as number;
  return { balance, sufficient: balance >= params.estimatedCost };
}

/**
 * Tier gate helper — does the user's tier allow them to use this model?
 *
 * AUDIT FIX (P3-SEC-H-02): without this check, a Free user could call
 * setDefaultModel('claude-opus-4-7') (Legend-only) then run Opus turns
 * forever. Used by setDefaultModel server action + turn route at the
 * pt.llm_model boundary.
 */
export async function userTierAllowsModel(
  supabase: SupabaseClient,
  userId: string,
  modelId: string,
): Promise<{ allowed: boolean; tier: Tier; reason?: string }> {
  // Read profile.subscription_tier AND active subscription row.
  // AUDIT FIX (P3-LOGIC-H-06): canceled subs lose tier access. Only
  // 'active' or 'trialing' subscription rows count as live tier;
  // otherwise fall back to profile.subscription_tier (which may still
  // say 'storyteller' from before cancellation, but we override to free).
  const [profileRes, subRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", userId)
      .single(),
    supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  let tier: Tier;
  if (subRes.data && (subRes.data.status === "active" || subRes.data.status === "trialing")) {
    tier = subRes.data.tier as Tier;
  } else if (profileRes.data?.subscription_tier && (profileRes.data.subscription_tier as Tier) === "free") {
    tier = "free";
  } else if (!subRes.data && profileRes.data?.subscription_tier) {
    // No subscription row at all but profile says paid tier — treat as
    // misconfiguration; fall back to free.
    tier = (profileRes.data.subscription_tier as Tier) === "free"
      ? "free"
      : "free"; // defensive
  } else {
    tier = "free";
  }

  // Look up the model in MODELS catalog via dynamic import to avoid a
  // circular-import edge case.
  const { MODELS } = await import("@/lib/ai/models");
  const model = MODELS[modelId];
  if (!model) {
    // AUDIT FIX P0AW4-CRIT-01 (Wave 4 · 2026-05-25): REMOVED the
    // LEGACY_NARRATORS bypass entirely. Three reasons:
    //
    //   1. DB query confirmed 0 playthroughs locked to legacy ids today.
    //      The bypass was protecting zero users.
    //   2. The bypass let LEGACY ids skip the min_tier check · a Free user
    //      could direct-DB-write llm_model='gpt-4o' (was min_tier='adventurer'
    //      before Phase 0 drop) and get GPT-4o quality for free. Paid-tier
    //      bypass = lost revenue.
    //   3. Migration 0022 added a BEFORE UPDATE trigger that blocks any
    //      change to llm_model post-create. So even if a future user
    //      created a playthrough with a legacy id, they couldn't direct-
    //      write to escalate. Defense in depth.
    //
    // Net result: truly unknown ids 403 again (back to pre-Wave-1 behavior
    // for the unknown-model case · without the security regression of the
    // permissive bypass that Wave 1/2/3 wrestled with).
    return { allowed: false, tier, reason: "unknown_model" };
  }
  if (!model.min_tier) {
    return { allowed: true, tier };
  }
  const order = ["free", "adventurer", "storyteller", "legend"] as const;
  const userIdx = order.indexOf(tier);
  const modelIdx = order.indexOf(model.min_tier);
  if (userIdx < modelIdx) {
    return { allowed: false, tier, reason: "tier_too_low" };
  }
  return { allowed: true, tier };
}

/**
 * Resolve the user's CURRENTLY-ACTIVE tier · respecting subscription status.
 *
 * Returns 'free' when subscription is canceled / past_due / unpaid even if
 * profile.subscription_tier still says paid (sync lag possible). Used by
 * Phase 8 scene-image gen which is tier-gated independent of any specific
 * LLM model (so userTierAllowsModel isn't the right helper).
 *
 * Hard rule #4 (credits absolutely right) · CR-HIGH-02 fix.
 */
export async function getActiveTier(
  supabase: SupabaseClient,
  userId: string,
): Promise<"free" | "adventurer" | "storyteller" | "legend"> {
  const [profileRes, subRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", userId)
      .single(),
    supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (
    subRes.data &&
    (subRes.data.status === "active" || subRes.data.status === "trialing")
  ) {
    return subRes.data.tier as "adventurer" | "storyteller" | "legend";
  }
  // No active sub → return "free" regardless of profile.subscription_tier
  // (stale paid tier from canceled subscription should NOT grant access).
  return "free";
}

// ─── Tier definitions (Phase 4 will move these to DB) ───────────────────

export type Tier = "free" | "adventurer" | "storyteller" | "legend";

export const TIER_CONFIG: Record<
  Tier,
  {
    label: string;
    priceUsd: number; // 0 for free
    monthlyCredits: number;
    dailyCredits?: number; // free tier only
    description: string;
    allowsNsfw: boolean;
  }
> = {
  free: {
    label: "Free",
    priceUsd: 0,
    monthlyCredits: 0,
    dailyCredits: 100,
    description: "100 credits 每日 · 限基礎 model",
    allowsNsfw: false,
  },
  // Pricing v3 locked (2026-05-26 · superseded earlier 5k/15k/50k draft).
  // Standard = adventurer · Pro = storyteller · legend deprecated but kept
  // for backward-compat with existing TIER_GATE references.
  adventurer: {
    label: "Standard",
    priceUsd: 9.99,
    monthlyCredits: 8000,
    description: "8,000 credits 每月 · 無 turn 上限 · Standard + Pro AI model · 成人模式",
    allowsNsfw: true,
  },
  storyteller: {
    label: "Pro",
    priceUsd: 19.99,
    monthlyCredits: 18000,
    description: "18,000 credits 每月 · 全部功能 · NPC 內心戲無限 · 成人模式",
    allowsNsfw: true,
  },
  legend: {
    label: "Legend (deprecated)",
    priceUsd: 49.99,
    monthlyCredits: 18000,
    description: "已下架 · 同 Pro 一樣",
    allowsNsfw: true,
  },
};

/**
 * @deprecated Use TOPUP_DISPLAY from @/lib/stripe/products instead.
 * Kept temporarily for legacy references — Stripe Top-up flow uses the
 * Stripe Price IDs configured in env (Pricing v3 locked: $5/1k · $15/3.5k
 * · $30/8k). This array is no longer the source of truth.
 */
export const TOPUP_PACKAGES: Array<{
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
}> = [
  { id: "topup_small", credits: 1000, priceUsd: 5.0, label: "Starter · 1,000 credits · $5" },
  { id: "topup_medium", credits: 3500, priceUsd: 15.0, label: "Standard · 3,500 credits · $15（+17%）" },
  { id: "topup_large", credits: 8000, priceUsd: 30.0, label: "Bulk · 8,000 credits · $30（+33%）" },
];
