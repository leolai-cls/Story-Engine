/**
 * Tier router — picks the actual underlying LLM for a user-facing tier.
 *
 * Founder rule (2026-05-25): users pick TIER (Standard / Pro / Pro Max /
 * Adult), not a specific vendor model. We internally route based on:
 *   1. Content language (中文 → favor 中文-strong models · English → English-strong)
 *   2. Vendor availability (fallback chain if primary down)
 *   3. Cost optimization (within tier · pick cheapest acceptable)
 *
 * This gives us:
 *   - Vendor diversification (one outage doesn't take us down)
 *   - Future-proof (swap GPT-5.4 → GPT-6 inside Pro pool · zero user churn)
 *   - Cleaner UX (3 tier choices vs 7 vendor model names)
 *
 * Pool definitions live in lib/ai/models.ts TIER_POOLS const.
 */

import { TIER_POOLS, DIRECTOR_MODEL, type ModelTier } from "./models";

/**
 * Detect whether content is primarily Chinese.
 *
 * Counts CJK Unified Ideographs (U+4E00–U+9FFF · covers 繁中 + 简中 + 日本漢字
 * subset relevant to us) vs total non-whitespace chars. ≥30% = Chinese-dominant.
 *
 * 30% threshold (not 50%) because Story Engine narrative often interleaves
 * Chinese with English brand names, English dialogue snippets, code-switching.
 * 30% catches "中文 dominant" cases without false-negatives on bilingual text.
 */
export function isChineseContent(text: string): boolean {
  if (!text) return false;
  const nonWhitespace = text.replace(/\s/g, "");
  if (nonWhitespace.length === 0) return false;
  // CJK Unified Ideographs (most common) + CJK Extension A
  const cjkCount = (nonWhitespace.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  return cjkCount / nonWhitespace.length >= 0.3;
}

/**
 * Pick the actual model id to call for a given tier.
 *
 * @param tier User-facing tier (standard / pro / pro-max / adult)
 * @param context Optional · text sample (last few turns + new action) for
 *                language detection. Pass at least the new user input for
 *                accurate Chinese-vs-English routing.
 * @returns Internal model id (e.g. "claude-sonnet-4-6"). Caller passes this
 *          to providers.ts getProviderModel() to get the actual SDK instance.
 */
export function pickModelForTier(tier: ModelTier, context?: string): string {
  const pool = TIER_POOLS[tier];
  if (!pool || pool.length === 0) {
    // Shouldn't happen if tier is validated · throw loudly so misconfig surfaces.
    throw new Error(`tier-router: empty pool for tier "${tier}"`);
  }

  // Single-model tiers (pro-max · adult): no routing decision.
  if (pool.length === 1) return pool[0];

  const isCjk = context ? isChineseContent(context) : true; // 繁中 default market

  // Standard pool: Gemini Flash + GLM-5.1
  // 中文 → GLM-5.1 ("Best for roleplay & creative writing" per BenchLM ·
  //         中文 #3 leaderboard · also cheaper)
  // English → Gemini Flash (long context · vendor diversity)
  if (tier === "standard") {
    return isCjk ? "glm-5-1" : "gemini-3-5-flash";
  }

  // Pro pool: Claude Sonnet 4.6 + GPT-5.4 Pro
  // 中文 → Sonnet 4.6 (中文 #1 narrative per EQ-Bench)
  // English → GPT-5.4 Pro (English #1 narrative · structured output strong)
  if (tier === "pro") {
    return isCjk ? "claude-sonnet-4-6" : "gpt-5-4-pro";
  }

  // Fallback — shouldn't reach here if tier validated.
  return pool[0];
}

/**
 * Get a fallback chain for a tier · used when primary vendor is down.
 * First element = primary (from pickModelForTier) · rest = ordered fallbacks.
 *
 * Example: Pro pool with Claude down → ["claude-sonnet-4-6", "gpt-5-4-pro"]
 * Caller retries with next on 5xx / timeout / rate-limit.
 */
export function fallbackChainForTier(tier: ModelTier, context?: string): string[] {
  const primary = pickModelForTier(tier, context);
  const pool = TIER_POOLS[tier];
  return [primary, ...pool.filter((id) => id !== primary)];
}

/**
 * Director always uses the dedicated DIRECTOR_MODEL · not affected by tier.
 * Exported for symmetry · callers can also import DIRECTOR_MODEL directly.
 */
export function getDirectorModel(): string {
  return DIRECTOR_MODEL;
}
