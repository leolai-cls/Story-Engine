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
 * Decision (Session 17 · 2026-06-02 light-core pivot · 非成人全轉 Claude 直連):
 *   - adultMode=true → 一律 return ADULT_NSFW_MODEL ("grok-4-1" · ADR-024)
 *   - tier="standard" (非成人) → "claude-sonnet-4-6" (Anthropic 直連 · 真串流 + cache)
 *   - tier="pro" (非成人) → "claude-opus-4-7" (Anthropic 直連 · 旗艦)
 *   - (舊 gemini/deepseek/gpt 中英分流已退役 · 留 MODELS 做 back-compat)
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

  // Session 17 (2026-06-02 · light-core): 非成人 pools 各得一隻 Claude，上面
  // length===1 已經 return 咗。唔再分中/英（Claude 中英都掂）。保留呢個 fallback
  // 應付將來 pool 有多隻嘅情況。
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

export type UtilityPurpose = "text" | "structured";

/**
 * Support / prep model 路由 (single source of truth · 2026-06-01)。
 *
 * 俾「讀故事內容 + 生成自然語言」嘅輔助 LLM call 用：滾動摘要 (summarizer · text) ·
 * 角色經歷 (experience-writer · structured) · lorebook (structured) · 生圖畫面
 * prompt (text) · NPC L3 內心戲 (structured)。
 *
 * - SFW / soft → DIRECTOR_MODEL (Haiku · 平 + 結構輸出穩定)。
 * - adult → ADULT_NSFW_MODEL (Grok)：因為 (a) Anthropic 寫嘢會自我審查 → 成人
 *   記憶 / 描述俾洗白變質 (founder 最 concern);(b) hard rule #5 — 成人內容唔可經
 *   Anthropic。
 *
 * @param purpose `"text"` (generateText) vs `"structured"` (generateObject)。目前
 *   adult 兩者都 → Grok。分開個 param 係為咗將來可以淨係 rollback `structured` ·
 *   唔影響 `text` (摘要 / 生圖 prompt)。
 *
 *   🚨 成人 structured 後備設計 (founder lock · 2026-06-01 · PR #63 QC)：
 *     • 若 adult structured Grok 變唔穩 (CrazyRouter structured 歷史上 fragile ·
 *       見 npc-agents audit note) · 候選後備 = **Kimi K2 via CrazyRouter** ·
 *       但**只可以喺驗證咗 slug / pricing / adult-tolerance / structured JSON
 *       可靠性 (benchmark) 之後**先用。而家未驗證 · 亦未入 catalog (唔好預埋)。
 *     • **永不**將成人 structured rollback 去 Haiku / DIRECTOR_MODEL / Anthropic
 *       — 成人內容唔可上 Anthropic (hard rule #5)。
 *     • **永不** default 用 GLM 做成人 structured 後備 — 真實 adult playthrough
 *       證實佢短期 grounding 弱 / 會 retcon (阿俊→阿輝) · 唔信得過做記憶 / 抽取。
 *
 * ⚠️ 純結構抽取 (extractTurnState 狀態 ops · Director verdict) **唔用呢個** —
 *   出數字 / 標籤 (洗白風險細) + 每回合關鍵 path + 靠結構輸出可靠性 · 留 Haiku。
 *
 * 全部 adult support 路由 + **計費** (credits.ts computeTurnCredits) 都行呢個 ·
 * 確保「跑邊隻」同「收邊隻」唔會 drift (two-catalog drift bug class)。
 */
export function pickUtilityModel(
  contentRating: "sfw" | "soft" | "adult",
  purpose: UtilityPurpose,
): string {
  if (contentRating !== "adult") return DIRECTOR_MODEL;
  const adultByPurpose: Record<UtilityPurpose, string> = {
    text: ADULT_NSFW_MODEL,
    // 🔧 後備候選 = Kimi K2 via CrazyRouter (驗證 slug/pricing/adult-tolerance/結構
    //    可靠性後先用 · 未入 catalog)。⚠️ 永不改去 DIRECTOR_MODEL/Haiku/Anthropic
    //    (hard rule #5) · 永不 default GLM (證實弱/retcon)。詳見上面 @param 說明。
    structured: ADULT_NSFW_MODEL,
  };
  return adultByPurpose[purpose];
}
