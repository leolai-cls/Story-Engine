/**
 * Tier router — picks the actual underlying LLM for a user-facing tier.
 *
 * ADR-022 (2026-05-28) Simplification:
 *   - 2 user-facing tier (Standard / Pro) · 唔再有 Pro Max / Adult separate tier
 *   - Adult mode = adult_mode_enabled boolean toggle · cross-tier · 路由去 GLM 5
 *
 * Routing inputs:
 *   1. tier ("standard" | "pro")
 *   2. adultMode boolean (`adult_mode_enabled` self-attest 18+ · ADR-023 · NO KYC · 任何訂閱都可以開)
 *   3. context text (用嚟做 language detection)
 *
 * Decision:
 *   - adultMode=true → 一律 return ADULT_NSFW_MODEL ("grok-4-1" · ADR-024)
 *   - tier="standard" + 中文 dominant → "deepseek-v3-2" (2026-06-01 換 GLM)
 *   - tier="standard" + 英文 → "gemini-3-5-flash"
 *   - tier="pro" + 中文 dominant → "claude-sonnet-4-6"
 *   - tier="pro" + 英文 → "gpt-5-4-pro"
 *
 * Pool definitions live in lib/ai/models.ts TIER_POOLS const.
 */

import { TIER_POOLS, DIRECTOR_MODEL, ADULT_NSFW_MODEL, type ModelTier } from "./models";

/**
 * Detect whether content is primarily Chinese.
 *
 * Counts CJK Unified Ideographs (U+4E00–U+9FFF · covers 繁中 + 简中 + 日本漢字
 * subset relevant to us) vs total non-whitespace chars. ≥30% = Chinese-dominant.
 */
export function isChineseContent(text: string): boolean {
  if (!text) return false;
  const nonWhitespace = text.replace(/\s/g, "");
  if (nonWhitespace.length === 0) return false;
  const cjkCount = (nonWhitespace.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  return cjkCount / nonWhitespace.length >= 0.3;
}

/**
 * Pick the actual model id to call for a given tier + adult mode state.
 *
 * @param tier User-facing tier (standard / pro)
 * @param options Optional · text context for language detection + adult mode flag
 * @returns Internal model id (e.g. "claude-sonnet-4-6")
 */
export function pickModelForTier(
  tier: ModelTier,
  options?: { context?: string; adultMode?: boolean },
): string {
  // ADR-022: Adult mode 任何 tier 都用 GLM 5.1 (NSFW model)
  if (options?.adultMode) {
    return ADULT_NSFW_MODEL;
  }

  const pool = TIER_POOLS[tier];
  if (!pool || pool.length === 0) {
    throw new Error(`tier-router: empty pool for tier "${tier}"`);
  }
  if (pool.length === 1) return pool[0];

  const isCjk = options?.context ? isChineseContent(options.context) : true; // 繁中 default market

  if (tier === "standard") {
    // 中文 → DeepSeek V3.2 (2026-06-01 換 GLM · founder 試「個分別」· 強中文 + 平)
    // English → Gemini Flash (long context · vendor diversity)
    return isCjk ? "deepseek-v3-2" : "gemini-3-5-flash";
  }

  if (tier === "pro") {
    // 中文 → Sonnet 4.6 (中文 #1 narrative)
    // English → GPT-5.4 Pro (English #1 narrative · OpenRouter routed)
    return isCjk ? "claude-sonnet-4-6" : "gpt-5-4-pro";
  }

  return pool[0];
}

/**
 * Get a fallback chain for a tier · used when primary vendor is down.
 * Adult mode bypass: 只 return ADULT_NSFW_MODEL (Grok 4.1) · 冇 model-switch
 * fallback。Founder 2026-06-01 (ADR-024):「失敗用返同正常 model 一樣機制」——
 * 即 maxRetries=1 連接層自動再試 + onFinish 誠實失敗 + 前端 retry 掣 · 唔自動
 * 轉做另一隻 model (否決咗 Kimi 自動後備 · 避免特殊機制)。
 */
export function fallbackChainForTier(
  tier: ModelTier,
  options?: { context?: string; adultMode?: boolean },
): string[] {
  if (options?.adultMode) {
    return [ADULT_NSFW_MODEL];
  }
  const primary = pickModelForTier(tier, options);
  const pool = TIER_POOLS[tier];
  return [primary, ...pool.filter((id) => id !== primary)];
}

/**
 * Director always uses the dedicated DIRECTOR_MODEL · not affected by tier.
 */
export function getDirectorModel(): string {
  return DIRECTOR_MODEL;
}

/**
 * Support / prep model 路由 (single source of truth · 2026-06-01)。
 *
 * 俾「讀故事內容 + 生成自然語言」嘅輔助 LLM call 用：滾動摘要 (summarizer) ·
 * 角色經歷 (experience-writer) · lorebook 描述 · 生圖畫面 prompt · NPC L3 內心戲。
 *
 * - SFW / soft → DIRECTOR_MODEL (Haiku · 平 + 結構輸出穩定)。
 * - adult → ADULT_NSFW_MODEL (Grok)：因為 (a) Anthropic 寫嘢會自我審查 → 成人
 *   記憶 / 描述俾洗白變質 (founder 最 concern);(b) hard rule #5 — 成人內容唔可經
 *   Anthropic。
 *
 * ⚠️ 純結構抽取 (extractTurnState 狀態 ops · Director verdict) **唔用呢個** —
 *   佢哋出嘅係數字 / 標籤 (洗白風險細) + 喺每回合關鍵 path + 靠結構輸出可靠性 ·
 *   留 Haiku。將來若驗證 Grok 結構輸出夠穩 · 可以考慮埋。
 *
 * 全部 adult support 路由集中喺呢度 · 各 module 唔好再散開抄 ternary
 * (two-catalog drift bug class · 漏改一個就出事)。
 */
export function pickUtilityModel(contentRating: "sfw" | "soft" | "adult"): string {
  return contentRating === "adult" ? ADULT_NSFW_MODEL : DIRECTOR_MODEL;
}
