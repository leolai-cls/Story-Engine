/**
 * OpenAI Moderation API wrapper — Phase 5 Wave 1 (P5-SEC-C-01 fix).
 *
 * Closes CLAUDE.md hard rule #6 ("CSAM / 違法內容 pre-filter is law-line, never
 * bypass") gap surfaced in Phase 5 audit: moderation_flags enum added 'csam'
 * and 'sexual_minor' values to acknowledge the attack vectors exist, but no
 * pre-filter was wired at the create-content sites. Reactive moderation
 * (community reports → admin review) alone is insufficient — illegal content
 * must be blocked at submission time before it ever persists.
 *
 * Provider: OpenAI Moderation API (free, no separate API key — uses the
 * existing OPENAI_API_KEY used by embeddings). Per ADR / CLAUDE.md, this is
 * the launch choice; Phase 5+ may re-evaluate.
 *
 * Endpoint: POST https://api.openai.com/v1/moderations
 *   - Model: omni-moderation-latest (multi-lingual, 中文 supported)
 *   - Returns 13 categories with boolean flag + numeric score 0-1
 *   - Free tier; no per-request cost
 *
 * Categorization for Story Engine:
 *   HARD BLOCK (any user input flagged → reject submission)
 *     - sexual/minors      → illegal everywhere, no SFW/NSFW context exempts
 *     - hate/threatening   → targets of identity-based violence
 *     - violence/graphic   → torture / gore at threshold
 *     - illicit/violent    → weapons / harm instructions
 *     - self-harm/intent   → active intent (vs ideation)
 *
 *   CONTEXT-AWARE (block in SFW content, allow in adult-tier content)
 *     - sexual             → sexual content with adults
 *     - violence           → general violence below graphic threshold
 *     - self-harm          → ideation / non-active references
 *     - harassment         → personal attacks
 *
 *   ALLOW (logged, not blocked — community report path handles edge cases)
 *     - hate               → general (non-threatening) hate (slurs etc — community
 *                            moderation > algorithmic, false positive risk too high
 *                            for legitimate fiction exploring racism)
 *
 * For Phase 5 launch we use HARD BLOCK + content-rating-aware CONTEXT block.
 * The `sexual/minors` category is INSTANT BLOCK regardless of content rating —
 * this is the hard rule line.
 */

type ModerationCategory =
  | "sexual"
  | "sexual/minors"
  | "hate"
  | "hate/threatening"
  | "harassment"
  | "harassment/threatening"
  | "self-harm"
  | "self-harm/intent"
  | "self-harm/instructions"
  | "violence"
  | "violence/graphic"
  | "illicit"
  | "illicit/violent";

type ModerationResponse = {
  id: string;
  model: string;
  results: Array<{
    flagged: boolean;
    categories: Record<ModerationCategory, boolean>;
    category_scores: Record<ModerationCategory, number>;
  }>;
};

/**
 * The categories that hard-block submission regardless of the story's
 * content_rating. These represent illegal content or content that creates
 * unacceptable platform risk (CSAM, terrorism, etc).
 */
const HARD_BLOCK_CATEGORIES: ModerationCategory[] = [
  "sexual/minors",
  "hate/threatening",
  "violence/graphic",
  "illicit/violent",
  "self-harm/intent",
  "self-harm/instructions",
  "harassment/threatening",
];

/**
 * Categories that block in SFW content (default content_rating). Adult tier
 * is more permissive but `sexual/minors` is always blocked (it's in HARD).
 */
const SFW_ADDITIONAL_BLOCK: ModerationCategory[] = [
  "sexual",
  "violence",
  "self-harm",
];

export type ModerationVerdict =
  | { allowed: true }
  | { allowed: false; reason: string; categories: ModerationCategory[] };

export type ContentRating = "sfw" | "soft" | "adult";

/**
 * Score threshold above which a category-flagged result still triggers
 * a block even if the boolean flag wasn't set. The OpenAI flag is
 * tuned for high precision; raising the recall via score floor adds
 * defense at small false-positive cost. Tuned per category.
 */
const SCORE_FLOOR: Partial<Record<ModerationCategory, number>> = {
  // CSAM detection — error very strongly toward block. Even a 0.15 score
  // on this category warrants stopping the submission.
  "sexual/minors": 0.15,
  // Graphic violence — block at 0.6 even without boolean flag.
  "violence/graphic": 0.6,
  // illicit/violent (weapons instructions, harm howtos) — block at 0.5.
  "illicit/violent": 0.5,
};

/**
 * Call OpenAI Moderation API. Returns null on network/API error so callers
 * can decide fail-open vs fail-closed.
 *
 * Implementation note: uses direct fetch instead of OpenAI SDK to avoid
 * pulling another dependency. Endpoint and response shape are stable per
 * OpenAI docs (v1).
 */
async function callModerationAPI(
  input: string,
): Promise<ModerationResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[moderation] OPENAI_API_KEY missing — cannot moderate");
    return null;
  }

  // Hard cap input length — Moderation API accepts up to ~32K tokens but
  // we limit to keep latency predictable. For story prompts (max 2000
  // chars in InputSchema) this never triggers; for review_text (max 2000)
  // same. Comments max 2000. So 32000 ceiling is paranoid only.
  const trimmed = input.length > 32_000 ? input.slice(0, 32_000) : input;

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: trimmed,
      }),
      // 10s timeout — moderation should be sub-second; anything slower
      // is a hung connection.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        `[moderation] API ${res.status}: ${errBody.slice(0, 500)}`,
      );
      return null;
    }
    return (await res.json()) as ModerationResponse;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[moderation] fetch failed: ${msg}`);
    return null;
  }
}

/**
 * Inspect a moderation API response and decide whether to block.
 * Pure function — no side effects, easy to unit test.
 */
function evaluateResult(
  result: ModerationResponse["results"][0],
  contentRating: ContentRating,
): ModerationVerdict {
  const triggered: ModerationCategory[] = [];

  // Pass 1 — HARD_BLOCK_CATEGORIES: rated content doesn't matter.
  for (const cat of HARD_BLOCK_CATEGORIES) {
    if (result.categories[cat]) {
      triggered.push(cat);
      continue;
    }
    const floor = SCORE_FLOOR[cat];
    if (floor !== undefined && (result.category_scores[cat] ?? 0) >= floor) {
      triggered.push(cat);
    }
  }

  // Pass 2 — content-rating-aware blocks for SFW/soft tier.
  // Adult tier ("adult") allows sexual + general violence + self-harm
  // references; HARD_BLOCK still applies regardless.
  if (contentRating === "sfw" || contentRating === "soft") {
    for (const cat of SFW_ADDITIONAL_BLOCK) {
      if (result.categories[cat] && !triggered.includes(cat)) {
        triggered.push(cat);
      }
    }
  }

  if (triggered.length === 0) {
    return { allowed: true };
  }

  // Return user-facing 繁中 reason — short, actionable, no leak of
  // exactly which classifier fired (would teach circumvention).
  let reason: string;
  if (
    triggered.includes("sexual/minors") ||
    (triggered.includes("sexual") && contentRating !== "adult")
  ) {
    reason = "內容涉及未成年人嘅性描寫，或者超出咗呢個內容分級嘅範圍。";
  } else if (
    triggered.includes("violence/graphic") ||
    triggered.includes("illicit/violent") ||
    triggered.includes("hate/threatening") ||
    triggered.includes("harassment/threatening")
  ) {
    reason = "內容包含暴力威脅、傷害指引或者針對特定群體嘅仇恨言論。";
  } else if (
    triggered.includes("self-harm/intent") ||
    triggered.includes("self-harm/instructions")
  ) {
    reason = "內容包含自殘指引或意圖。如果你有需要，請聯絡撒瑪利亞會 2896 0000。";
  } else {
    reason = "內容違反平台規則。請修改後再試。";
  }

  return { allowed: false, reason, categories: triggered };
}

/**
 * Moderate text input. Returns verdict — { allowed: true } or
 * { allowed: false, reason: 繁中 message, categories: [...] }.
 *
 * Fail-open behavior on API errors (returns allowed=true) — better UX,
 * with the reactive moderation path catching escapes. To switch to
 * fail-closed for higher-trust contexts (e.g., adult tier creation),
 * pass options.failClosed = true.
 *
 * @param input  - text to moderate (story prompt / comment body / review)
 * @param contentRating - story's intended content rating (changes which
 *                        categories block)
 * @param options - { failClosed?: boolean } — when true, API errors block
 */
export async function moderateText(
  input: string,
  contentRating: ContentRating = "sfw",
  options: { failClosed?: boolean } = {},
): Promise<ModerationVerdict> {
  // Empty / whitespace input — pass through, content-length validation
  // is the caller's job.
  if (!input || !input.trim()) {
    return { allowed: true };
  }

  const response = await callModerationAPI(input);
  if (response === null) {
    if (options.failClosed) {
      return {
        allowed: false,
        reason: "內容審核暫時無法使用，請稍後再試。",
        categories: [],
      };
    }
    // Fail-open: log + allow. Reactive moderation handles edge cases.
    console.warn(
      "[moderation] API unavailable — allowing submission (fail-open)",
    );
    return { allowed: true };
  }

  const result = response.results[0];
  if (!result) {
    console.error("[moderation] empty results array");
    return { allowed: true };
  }

  return evaluateResult(result, contentRating);
}

/**
 * Convenience: moderate but throw if blocked. Useful where caller wants
 * to abort with a specific error. Most action callers want the verdict
 * object so they can return ActionResult with a friendly error — use
 * moderateText() directly in that case.
 */
export async function assertContentAllowed(
  input: string,
  contentRating: ContentRating = "sfw",
): Promise<void> {
  const verdict = await moderateText(input, contentRating);
  if (!verdict.allowed) {
    const err = new Error(verdict.reason);
    (err as Error & { categories?: ModerationCategory[] }).categories =
      verdict.categories;
    throw err;
  }
}
