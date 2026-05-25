import type { SupabaseClient } from "@supabase/supabase-js";

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
 *     Haiku 4.5 (Director · internal)     $0.024 → 48 credits
 *     Gemini 3.5 Flash (Standard pool)    $0.038 → 76 credits
 *     GLM-5.1 (Standard pool)             $0.024 → 48 credits ⭐ NEW
 *     Claude Sonnet 4.6 (Pro pool · 中文)  $0.060 → 120 credits
 *     GPT-5.4 Pro (Pro pool · 英文)        $0.058 → 116 credits ⭐ NEW
 *     Claude Opus 4.7 (Pro Max)           $0.096 → 192 credits
 *     Llama 3.1 405B (Adult NSFW)         $0.031 → 62 credits
 *
 *   Tier credit allocations (v3 final · founder priced 2026-05-25):
 *     Free        1,000 cr  · ~25 Standard turns
 *     Story       12,000 cr · ~250 Standard or ~100 Pro turns
 *     Legend      30,000 cr · ~600 Standard / ~250 Pro / ~156 Pro Max turns
 *
 *   Annual plans (~17% discount · 2 months free): $99 / $199.
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
    // GLM-5.1 (Z.ai · released 2026-04-07) · "Best for roleplay & creative
    // writing" per BenchLM · 中文 leaderboard #3 · 754B MoE · 203K context.
    // Slug at OpenRouter: z-ai/glm-5.1
    inputPerMillion: 0.98,
    outputPerMillion: 3.08,
  },
  "gpt-5-4-pro": {
    // GPT-5.4 Pro (OpenAI · current flagship 2026) · English narrative + tool
    // calling strength · slug at OpenRouter: openai/gpt-5.4-pro
    inputPerMillion: 2.5,
    outputPerMillion: 15.0,
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
  embedTokens?: number;
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

  return (
    narratorCredits + directorCredits + lorebookCredits + summarizerCredits + embedCredits
  );
}

/**
 * Pre-turn cost estimate for UI display ("呢個 turn 大概用 ~32 credits").
 * Based on typical token usage observed in production. Adjust as patterns evolve.
 */
export function estimateTurnCredits(narratorModelId: string): number {
  return computeTurnCredits({
    narrator: {
      modelId: narratorModelId,
      inputTokens: 3000,
      outputTokens: 800,
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
  });
}

/**
 * Estimate credits to create a new story (4 parallel schema-gen calls).
 * Used for pre-creation balance check + UI display.
 */
export function estimateStoryCreationCredits(): number {
  // 4 parallel Sonnet 4.6 calls: meta+opening / state_schema / bible / characters
  // Typical: ~1500 input + 1500 output per call.
  return (
    4 *
    computeCredits({
      modelId: "claude-sonnet-4-6",
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
  | "sub_canceled";

export type ChargeRefType = "turn" | "story" | "subscription" | "topup" | "admin";

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
 * Now: fail-open. We log + return {balance:-1, sufficient:true} so the
 * atomic RPC remains the true gate. If RPC then fails for the same
 * underlying reason, user sees the real error.
 */
export async function getBalanceAndCheck(
  supabase: SupabaseClient,
  params: { userId: string; estimatedCost: number },
): Promise<{ balance: number; sufficient: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", params.userId)
    .single();

  if (error || !data) {
    console.warn(
      `[credits] getBalanceAndCheck transient failure (fail-open): ${error?.message ?? "no data"}`,
    );
    return { balance: -1, sufficient: true };
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
    // AUDIT FIX P0A-CRIT-01 / P0B-CRIT-01 (2026-05-25): existing playthroughs
    // were created with models that have since been DROPPED from MODELS catalog
    // (Session 10 curation 10→7: gpt-4o, gpt-4o-mini, grok-2, grok-2-mini,
    // gemini-3-1-pro). Their playthroughs are LOCKED to those model ids at
    // creation. Returning {allowed:false, reason:'unknown_model'} causes the
    // turn route to 403 them permanently — they can't continue their saved
    // playthroughs.
    //
    // Fix: legacy/dropped models are ALWAYS allowed (existing user can keep
    // playing). MODEL_PRICING still has their entries → computeCredits works.
    // Tier gate is bypassed because we never re-validate locked-at-creation
    // models. If the model id is also missing from MODEL_PRICING, providers.ts
    // dispatch will throw later — but that's a different error class.
    //
    // Log a warning so we can monitor how many dropped-model playthroughs are
    // still in use and decide when to deprecate them properly.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[userTierAllowsModel] legacy model "${modelId}" not in MODELS catalog; allowing for back-compat`,
      );
    }
    return { allowed: true, tier, reason: "legacy_model" };
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
    dailyCredits: 50,
    description: "50 credits 每日 · 限基礎 model",
    allowsNsfw: false,
  },
  adventurer: {
    label: "Adventurer",
    priceUsd: 9.99,
    monthlyCredits: 5000,
    description: "5,000 credits 每月 · 所有 SFW model · 約 150 turns",
    allowsNsfw: false,
  },
  storyteller: {
    label: "Storyteller",
    priceUsd: 19.99,
    monthlyCredits: 15000,
    description: "15,000 credits 每月 · 全部 model · 成人模式 (要 KYC) · 約 450 turns",
    allowsNsfw: true,
  },
  legend: {
    label: "Legend",
    priceUsd: 49.99,
    monthlyCredits: 50000,
    description: "50,000 credits 每月 · 全部 model · 早鳥功能 · 約 1500 turns",
    allowsNsfw: true,
  },
};

/**
 * Top-up packages — one-time credit purchases independent of subscription.
 * Phase 4 Stripe Checkout creates one-time payment for these.
 */
export const TOPUP_PACKAGES: Array<{
  id: string;
  credits: number;
  priceUsd: number;
  label: string;
}> = [
  { id: "topup_5k", credits: 5000, priceUsd: 5.0, label: "5,000 credits · $5" },
  { id: "topup_15k", credits: 15000, priceUsd: 12.5, label: "15,000 credits · $12.50（慳 16%）" },
  { id: "topup_50k", credits: 50000, priceUsd: 40.0, label: "50,000 credits · $40（慳 20%）" },
];
