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
 * payment processing (~3% Stripe), refunds, and gross margin. At 2× markup
 * on Sonnet 4.6 narrator (~$0.015/turn raw → $0.030/turn billed in credits),
 * Adventurer $9.99/mo 5000 credits gives ~167 turns; Storyteller $19.99
 * gives ~500 turns. See `pm/DECISIONS.md` for the pricing audit history
 * (memory layer added 35% overhead vs. originally modeled 2%).
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

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ─── Anthropic ─────────────────────────────────────────────────────
  "claude-sonnet-4-6": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.3, // ~10% of input rate per Anthropic prompt-cache pricing
  },
  "claude-haiku-4-5": {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cachedInputPerMillion: 0.08,
  },
  "claude-opus-4-7": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cachedInputPerMillion: 1.5,
  },
  // ─── OpenAI Embeddings ─────────────────────────────────────────────
  "text-embedding-3-small": {
    inputPerMillion: 0.02,
    outputPerMillion: 0, // embeddings have no output tokens
  },
  // ─── OpenRouter (Phase 6 adult mode) ───────────────────────────────
  // Llama 3.1 405B via OpenRouter — pricing varies; using upper bound.
  "meta-llama/llama-3.1-405b-instruct": {
    inputPerMillion: 2.5,
    outputPerMillion: 2.5,
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
    // Unknown model — log + return 0. Fail safe (don't charge) until pricing added.
    console.warn(`[credits] no pricing for model "${params.modelId}", returning 0 credits`);
    return 0;
  }
  const markup = params.markup ?? STORY_ENGINE_MARKUP;
  const totalInput = params.inputTokens ?? 0;
  const cachedInput = pricing.cachedInputPerMillion ? params.cachedInputTokens ?? 0 : 0;
  const freshInput = Math.max(0, totalInput - cachedInput);
  const outputTokens = params.outputTokens ?? 0;

  const usdCost =
    (freshInput * pricing.inputPerMillion +
      cachedInput * (pricing.cachedInputPerMillion ?? pricing.inputPerMillion) +
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
  | { ok: false; error: "other"; message: string };

/**
 * Apply a credit movement via the SECURITY DEFINER RPC.
 *
 * `delta` is signed: negative for charges, positive for grants/refunds.
 * Returns structured result so caller can branch on insufficient_credits.
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
    const msg = error.message ?? "";
    if (/insufficient_credits/i.test(msg)) {
      // Best-effort parse of "current=X delta=Y would_be=Z" detail
      const m = msg.match(/current=(-?\d+)\s+delta=(-?\d+)/);
      const currentBalance = m ? parseInt(m[1], 10) : 0;
      const needed = m ? Math.abs(parseInt(m[2], 10)) : Math.abs(params.delta);
      return { ok: false, error: "insufficient_credits", currentBalance, needed };
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
    return { balance: 0, sufficient: false };
  }
  const balance = data.credit_balance as number;
  return { balance, sufficient: balance >= params.estimatedCost };
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
