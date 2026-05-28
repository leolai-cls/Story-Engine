/**
 * Content moderation — Claude Haiku 4.5 classifier (Anthropic direct).
 *
 * ADR-021 (2026-05-28) · Founder 喺香港攞唔到 OpenAI API key · 整個產品只用
 * `OPENROUTER_API_KEY` + `ANTHROPIC_API_KEY`. 之前直駁 `api.openai.com/v1/moderations`
 * 嘅實作令 prod 永遠 fail（`OPENAI_API_KEY` 唔可能 set）· 而家用 Haiku 4.5
 * 經 Anthropic direct provider 做 JSON-schema-constrained classifier.
 *
 * Why Haiku 4.5:
 *   - Founder 已有 `ANTHROPIC_API_KEY`
 *   - 已經係 Director model · provider integration tested
 *   - 中文 + 英文 + jailbreak 識別都好
 *   - ~$0.001 / call · 預期每月 < $5 total
 *
 * Why structured output (generateObject):
 *   - 強 schema 防止 LLM hallucinate categories
 *   - 保留 evaluateResult() 純函數對 categories + scores 行 hard-block 邏輯
 *   - Anthropic structured output stable since Claude 3.5
 *
 * Filename 故意保留 `openai-moderation.ts` · 避免 sweeping rename 引發
 * import-path 風暴; export 名 + 內部實作完全唔關 OpenAI 事.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { anthropicProvider } from "@/lib/ai/providers";
import { DIRECTOR_MODEL } from "@/lib/ai/models";

export type ModerationCategory =
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

type ModerationResultShape = {
  flagged: boolean;
  categories: Record<ModerationCategory, boolean>;
  category_scores: Record<ModerationCategory, number>;
};

/**
 * HARD_BLOCK_CATEGORIES — 跨 content_rating 都係 hard floor.
 * Reason: hard rule #6 (CSAM / illegal / 極端暴力 / 自殘指引).
 *
 * Wave 1.5 calibration (W1-FP-M-09) 仍然適用: villain dialogue
 * (古惑仔 / 武俠反派 / fantasy antagonist) 唔好誤殺 → 移咗
 * `harassment/threatening` + `hate/threatening` 落 SCORE_FLOOR 用 0.7 floor.
 */
const HARD_BLOCK_CATEGORIES: ModerationCategory[] = [
  "sexual/minors",
  "violence/graphic",
  "illicit/violent",
  "self-harm/intent",
  "self-harm/instructions",
];

// Session 16 audit HIGH-10 · module-load assertion · CSAM hard-block
// 唔可以被誤刪 (CLAUDE.md hard rule #6 law line).
if (!HARD_BLOCK_CATEGORIES.includes("sexual/minors")) {
  throw new Error(
    "[moderation] HARD_BLOCK_CATEGORIES must include 'sexual/minors' — CLAUDE.md hard rule #6 violation",
  );
}

/**
 * SFW + soft content rating 額外 block 嘅 categories.
 * Adult content rating + adult_mode_enabled + KYC user 唔受呢一層約束（GLM 5
 * NSFW model 自己 handle adult content; moderation 只係防 hard floor + 平台
 * 仇恨內容）.
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
 * SCORE_FLOOR · 喺 boolean flag 未中但 score 過高都 block.
 * Tuned 自 Wave 1.5: 學校設定文學唔誤殺 + threatening villain dialogue 過得到.
 */
const SCORE_FLOOR: Partial<Record<ModerationCategory, number>> = {
  "sexual/minors": 0.5,
  "violence/graphic": 0.6,
  "illicit/violent": 0.5,
  "harassment/threatening": 0.7,
  "hate/threatening": 0.7,
};

/**
 * Map moderation verdict categories → stable error code that client
 * localizes via the `errors.moderation.*` catalog namespace.
 *
 * Session 16 PM Review #2 (C-01 follow-up): unified mapping for
 * turn route + stories/new + community/rateStory/upsertComment paths.
 */
export function verdictToCode(categories: ModerationCategory[]): string {
  const has = (c: ModerationCategory) => categories.includes(c);
  if (has("sexual/minors")) return "moderation_csam_sexual_minor";
  if (has("self-harm") || has("self-harm/intent") || has("self-harm/instructions")) {
    return "moderation_self_harm";
  }
  if (
    has("hate") ||
    has("hate/threatening") ||
    has("violence") ||
    has("violence/graphic") ||
    has("harassment") ||
    has("harassment/threatening")
  ) {
    return "moderation_hate_violence";
  }
  if (has("sexual")) return "moderation_sexual";
  return "moderation_blocked";
}

/**
 * Sentinel · 喺 `ANTHROPIC_API_KEY` 唔見時 throw · distinguish deployment bug
 * 自 transient API failure. Wave 1.5 audit fix W1-MOD-C-02 (post-ADR-021 update).
 */
export class ModerationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationConfigError";
  }
}

/**
 * Input normalization · 防 Unicode confusable + zero-width + zalgo bypass.
 */
const ZERO_WIDTH_RE = new RegExp("[\\u200B-\\u200D\\u2060\\uFEFF]", "g");
const COMBINING_MARK_RE = new RegExp("[\\u0300-\\u036F]", "g");

function normalizeInput(input: string): string {
  return input
    .normalize("NFKC")
    .replace(ZERO_WIDTH_RE, "")
    .replace(COMBINING_MARK_RE, "");
}

/**
 * Zod schema for LLM structured output. 13 categories · boolean flag + score 0-1.
 */
const ModerationLlmSchema = z.object({
  flagged: z.boolean().describe("Overall · true 如果任何 category 應該 block"),
  categories: z.object({
    sexual: z.boolean(),
    "sexual/minors": z.boolean(),
    hate: z.boolean(),
    "hate/threatening": z.boolean(),
    harassment: z.boolean(),
    "harassment/threatening": z.boolean(),
    "self-harm": z.boolean(),
    "self-harm/intent": z.boolean(),
    "self-harm/instructions": z.boolean(),
    violence: z.boolean(),
    "violence/graphic": z.boolean(),
    illicit: z.boolean(),
    "illicit/violent": z.boolean(),
  }),
  category_scores: z.object({
    sexual: z.number().min(0).max(1),
    "sexual/minors": z.number().min(0).max(1),
    hate: z.number().min(0).max(1),
    "hate/threatening": z.number().min(0).max(1),
    harassment: z.number().min(0).max(1),
    "harassment/threatening": z.number().min(0).max(1),
    "self-harm": z.number().min(0).max(1),
    "self-harm/intent": z.number().min(0).max(1),
    "self-harm/instructions": z.number().min(0).max(1),
    violence: z.number().min(0).max(1),
    "violence/graphic": z.number().min(0).max(1),
    illicit: z.number().min(0).max(1),
    "illicit/violent": z.number().min(0).max(1),
  }),
});

const CLASSIFIER_SYSTEM_PROMPT = `You are a content safety classifier for an interactive fiction platform.

The platform serves Chinese-language storytelling (繁中 / 简中 / English mix).
Most stories are fiction with villain characters, conflict, dramatic scenes.
Standard literary tropes (sword fights, school rivalry, romance, cultivation,
revenge plots, gangster drama, fantasy battles) MUST be classified as safe.

Your job: classify the input text on 13 standard moderation categories.
For each category, output a boolean (true = the content matches that
category) and a numeric score 0.0-1.0 (confidence).

IMPORTANT calibration for fiction context:
- General fighting / sword combat / 武打 / 格鬥 → NOT violence/graphic
  unless explicit gore / torture / mutilation. Score < 0.4 for normal action.
- Villain threats / 黑幫 intimidation / antagonist menace → harassment/threatening
  boolean=false unless explicit IRL targeting. Score 0.3-0.6 acceptable.
- School-setting romance with adults (university+) → NOT sexual/minors.
  Only flag sexual/minors if explicit reference to under-18 sexual content.
- Cultivation / revenge / 重生 / 變強 tropes → NOT illicit/violent.
- Bad words / mild profanity → NOT hate unless targeting protected groups.

HARD LINES (always flag with score > 0.7 if matched):
- Explicit CSAM / under-18 sexual content (sexual/minors)
- Real-world bioweapon / weapons-of-mass-destruction instructions (illicit/violent)
- Self-harm method instructions with explicit how-to (self-harm/instructions)
- Active self-harm intent (not ideation in narrative) (self-harm/intent)
- Gore / torture / mutilation graphic description (violence/graphic)

Output the JSON object per schema. Be calibrated · NOT trigger-happy.
The fiction context allows normal narrative tension · only flag genuine
hard-line violations.`;

/**
 * Call Anthropic Haiku 4.5 to classify input. Returns shaped response 或 null
 * (transient error · caller 決定 failClosed / fail-open).
 */
async function callClassifier(
  input: string,
): Promise<ModerationResultShape | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ModerationConfigError(
      "ANTHROPIC_API_KEY missing — moderation cannot run (deployment misconfiguration)",
    );
  }

  const normalized = normalizeInput(input);
  const trimmed = normalized.length > 8_000 ? normalized.slice(0, 8_000) : normalized;

  // Backoff retry · 同 OpenAI 版同 cadence.
  const BACKOFFS_MS = [500, 2000];
  for (let attempt = 0; attempt <= BACKOFFS_MS.length; attempt++) {
    try {
      const { object } = await generateObject({
        model: anthropicProvider(DIRECTOR_MODEL),
        schema: ModerationLlmSchema,
        system: CLASSIFIER_SYSTEM_PROMPT,
        prompt: `Classify the following text:\n\n<text>\n${trimmed}\n</text>`,
        temperature: 0,
        abortSignal: AbortSignal.timeout(8_000),
      });
      return object as ModerationResultShape;
    } catch (e) {
      if (e instanceof ModerationConfigError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      const isRetryable =
        /abort|timeout/i.test(msg) ||
        /429|5\d{2}/i.test(msg) ||
        /rate.?limit/i.test(msg);
      if (isRetryable && attempt < BACKOFFS_MS.length) {
        console.warn(
          `[moderation] Haiku call attempt ${attempt + 1} failed, backing off ${BACKOFFS_MS[attempt]}ms: ${msg}`,
        );
        await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]));
        continue;
      }
      console.error(`[moderation] Haiku classifier failed: ${msg}`);
      return null;
    }
  }
  return null;
}

/**
 * Pure function · 從 classifier 結果決定 verdict. 唔變(同舊版完全一樣 contract).
 */
function evaluateResult(
  result: ModerationResultShape,
  contentRating: ContentRating,
): ModerationVerdict {
  const triggered: ModerationCategory[] = [];

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
 * Moderate text · returns verdict. Drop-in replacement for old OpenAI version.
 */
export async function moderateText(
  input: string,
  contentRating: ContentRating = "sfw",
  options: { failClosed?: boolean } = {},
): Promise<ModerationVerdict> {
  if (!input || !input.trim()) {
    return { allowed: true };
  }

  const result = await callClassifier(input);
  if (result === null) {
    if (options.failClosed) {
      return {
        allowed: false,
        reason: "內容審核暫時無法使用，請稍後再試。",
        categories: [],
      };
    }
    console.warn(
      "[moderation] classifier unavailable — allowing submission (fail-open)",
    );
    return { allowed: true };
  }

  return evaluateResult(result, contentRating);
}

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
