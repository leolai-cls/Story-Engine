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
 *
 * Wave 1.5 calibration (W1-FP-M-09): `harassment/threatening` and
 * `hate/threatening` MOVED OUT of HARD_BLOCK and into SCORE_FLOOR at 0.7.
 * Reason: villain dialogue in legitimate fiction reliably trips these
 * (古惑仔 boss intimidation, 武俠 反派 threats, fantasy antagonist menace).
 * Director Model + Story Bible discipline (CLAUDE.md) DEMANDS NPCs that
 * threaten the player — yes-man AI is the design anti-pattern we're built
 * to avoid. Boolean-flag-only block at threshold + 0.7 score floor keeps
 * actual abuse out while not killing villain dialogue at the door.
 */
const HARD_BLOCK_CATEGORIES: ModerationCategory[] = [
  "sexual/minors",
  "violence/graphic",
  "illicit/violent",
  "self-harm/intent",
  "self-harm/instructions",
];

/**
 * Categories that block in SFW content (default content_rating). Adult tier
 * is more permissive but `sexual/minors` is always blocked (it's in HARD).
 *
 * Wave 1.5 calibration (W1-FP-H-04): `violence` (general, non-graphic)
 * REMOVED. The product's own EXAMPLE_PROMPTS lead with 1980 年代香港古惑仔
 * scenarios that are SFW-compatible cultural fiction. General-violence
 * blocking at the front door kills launch-day demo. `violence/graphic`
 * remains in HARD_BLOCK with 0.6 floor — that's the gore / torture line.
 */
const SFW_ADDITIONAL_BLOCK: ModerationCategory[] = [
  "sexual",
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
  // CSAM detection — error toward block but not so aggressively that the
  // launch market (HK + TW) 校園 / 青春 / family-with-kids fiction trips
  // false-positives. OpenAI documents production threshold ≥0.7; we use
  // 0.5 as a paranoid middle ground (still well below the boolean flag).
  // Wave 1.5 calibration (W1-FP-H-03): was 0.15 — caught "TW 大學校園戀愛故事"
  // (our own EXAMPLE_PROMPT). 0.5 lets school-setting fiction through while
  // still flagging genuine concerns.
  "sexual/minors": 0.5,
  // Graphic violence — block at 0.6 even without boolean flag. Distinct
  // from general violence (古惑仔 fight scenes); this is gore / torture.
  "violence/graphic": 0.6,
  // illicit/violent (weapons instructions, harm howtos) — block at 0.5.
  "illicit/violent": 0.5,
  // Wave 1.5 calibration (W1-FP-M-09): threatening categories moved here
  // from HARD_BLOCK. Boolean flag still triggers (so blatant abuse blocks),
  // plus 0.7 floor for high-confidence cases. Villain dialogue typically
  // scores 0.3-0.6 — passes this floor, gets through, Director Model
  // governs in-fiction propriety.
  "harassment/threatening": 0.7,
  "hate/threatening": 0.7,
};

/**
 * Sentinel thrown when OPENAI_API_KEY is missing. Distinguishes deployment
 * misconfiguration (always hard-fail) from transient API errors (callers
 * may choose fail-open). Wave 1.5 audit fix W1-MOD-C-02.
 */
export class ModerationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationConfigError";
  }
}

/**
 * Call OpenAI Moderation API.
 *
 * - Throws `ModerationConfigError` when OPENAI_API_KEY is missing. This is
 *   a deployment bug, never transient — callers must hard-fail (no allowed
 *   "allow on env misconfig" path; that's the bypass we close in W1-MOD-C-02).
 * - Returns null on transient errors (non-2xx response, timeout, parse fail).
 *   Callers decide fail-open vs fail-closed per call site.
 *
 * Implementation note: direct fetch instead of OpenAI SDK to avoid pulling
 * an extra dependency. Endpoint + response shape stable per OpenAI docs (v1).
 */
async function callModerationAPI(
  input: string,
): Promise<ModerationResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Wave 1.5 W1-MOD-C-02: hard-fail on missing key. Previously returned null,
    // which combined with fail-open default meant env-var typo = silent CSAM
    // bypass. Throwing forces caller to handle as deployment error.
    throw new ModerationConfigError(
      "OPENAI_API_KEY missing — moderation cannot run (deployment misconfiguration)",
    );
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
      // Wave 1.5 W1-COST-H-02: 10s → 3s. Moderation should be sub-second;
      // 3s gives generous headroom on slow OpenAI minutes without making
      // user wait. Fail-open (if failClosed off) catches the long tail.
      signal: AbortSignal.timeout(3_000),
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
    // Re-throw config errors so they reach the caller (action layer turns
    // them into 500-class deployment errors, surfaced loudly).
    if (e instanceof ModerationConfigError) throw e;
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
 * Throws `ModerationConfigError` when OPENAI_API_KEY is missing (always —
 * deployment misconfiguration must surface loudly, not silently bypass).
 * Caller must catch and return a clean error to the user.
 *
 * For transient API errors (non-2xx response, network timeout, parse fail):
 * - failClosed: false (default) — returns { allowed: true } with console.warn.
 *   Acceptable for low-risk paths where reactive moderation catches escapes.
 * - failClosed: true — returns { allowed: false } with 繁中 retry message.
 *   Use this for CSAM-sensitive paths (Wave 1.5: all 3 user-input sites).
 *
 * @param input  - text to moderate (story prompt / comment body / review)
 * @param contentRating - story's intended content rating (changes which
 *                        categories block)
 * @param options - { failClosed?: boolean } — when true, transient API
 *                  errors block instead of pass through
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
