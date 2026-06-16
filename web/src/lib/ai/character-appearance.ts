/**
 * Character appearance anchor (Wave 3 · B1 · 2026-06-14).
 *
 * 解決「角色每次生圖樣都唔同」。Root cause: `story_characters.visual_description`
 * 一直係 NULL —— 建故事時根本冇生成外貌 (見 stories/new/actions.ts character
 * insert · 冇 visual_description)，而 lazy 頭像 gen 從未起 (見 visualize-actions
 * 舊註「Wave 2 adds the lazy portrait gen flow」)。結果生圖 prompt 淨係收到角色
 * 個**名**，外貌每次靠生成商即興 → 樣樣唔同。
 *
 * 呢度補返「鎖定外貌描述」:第一次要將某角色畫入場景時，用佢嘅 backstory + 性格
 * + 角色推導出一段**穩定外貌**(年齡感 / 髮 / 眼 / 身形 / 標誌特徵 / 預設衫)，
 * 生成一次、cache 落 `story_characters.visual_description`，之後永遠用返同一段
 * → 任何生成商都一致 (純文字錨 · 唔靠生成商認唔認參考圖)。
 *
 *   - 一次性 · 一個角色一世只生成一次 (cache hit 之後即返)。
 *   - 平 (~$0.001 utility model · 一個 call)。
 *   - 成人故事 → Grok (令外貌可含成熟身體細節而唔俾 Anthropic 洗白 · 對齊
 *     summarizeTurnForScene · hard rule #5 keep NSFW off Anthropic)。
 *   - Fail-safe:生成或寫入失敗 → 返角色個名 (同舊 fallback 一樣 · 唔阻生圖)。
 *
 * 純外貌 facts · 唔描述性格 / 情緒 / 場景 / pose / 畫風 (嗰啲下游另外加)。
 */

import { generateText } from "ai";
import { getProviderModel } from "./providers";
import { pickUtilityModel } from "./tier-router";

export type CharacterForAppearance = {
  id: string;
  name: string;
  role?: string | null;
  visual_description?: string | null;
  backstory?: string | null;
  personality_traits?: string[] | null;
  core_motivation?: string | null;
};

/**
 * Minimal shape we need from a Supabase client to cache the result.
 * The caller passes the USER-scoped client so RLS is the tenant guard (only the
 * story owner's write persists · a non-owner playing a public story no-ops).
 */
type AppearanceWriter = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        is: (column: string, value: null) => PromiseLike<unknown>;
      };
    };
  };
};

const MAX_DESC = 600;

/**
 * Return a STABLE visual-appearance sheet for a character, generating + caching
 * it on first use. Idempotent: if `visual_description` already exists, returns
 * it untouched (no LLM call, no write).
 */
export async function ensureCharacterVisualDescription(opts: {
  serviceClient: AppearanceWriter;
  character: CharacterForAppearance;
  storyTitle: string;
  storyDescription: string | null;
  contentRating: "sfw" | "soft" | "adult";
}): Promise<string> {
  const c = opts.character;
  const existing = c.visual_description?.trim();
  if (existing) return existing;

  const name = (c.name ?? "").trim() || "Character";
  const traits = Array.isArray(c.personality_traits)
    ? c.personality_traits.filter(Boolean).join(", ")
    : "";
  const ctx = [
    `Story: ${opts.storyTitle}`,
    opts.storyDescription
      ? `Setting: ${opts.storyDescription.slice(0, 400)}`
      : "",
    `Character name: ${name}`,
    c.role ? `Role: ${c.role}` : "",
    traits ? `Personality: ${traits}` : "",
    c.backstory ? `Backstory: ${c.backstory.slice(0, 600)}` : "",
    c.core_motivation ? `Motivation: ${c.core_motivation.slice(0, 280)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let description = name;
  try {
    const model = getProviderModel(pickUtilityModel(opts.contentRating, "text"));
    const adultDirection =
      opts.contentRating === "adult"
        ? "This is an adult story; you may include mature physical detail (body type etc.) faithfully — do not sanitize."
        : null;
    const { text } = await generateText({
      model,
      system: [
        "You are a character designer locking a CONSISTENT visual appearance for a story character.",
        "Output ONE fixed appearance sheet that will be reused for EVERY illustration of this character, so they always look the same.",
        "Describe ONLY stable visual facts: apparent age range, build / height, skin tone, hair (color, length, style), eye color, face shape, a signature default outfit, and any distinguishing marks.",
        "Keep it appropriate to the story's era and setting.",
        ...(adultDirection ? [adultDirection] : []),
        "Do NOT describe personality, emotions, scene, pose, mood, lighting, or art style — those are applied separately downstream.",
        "Output 30-70 English words, plain prose. No markdown, no labels, no bullet points.",
      ].join("\n"),
      prompt: ctx,
      temperature: 0.5,
      maxOutputTokens: 180,
      // Bound the call: the scene-image chain already runs near the 300s lambda
      // ceiling (audit), so a stalling appearance gen must degrade to name-only
      // (handled by the catch) rather than eat the image-gen budget.
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(15_000),
    });
    const cleaned = text.trim().replace(/\s+/g, " ").slice(0, MAX_DESC);
    if (cleaned.length >= 10) description = cleaned;
  } catch (e) {
    console.warn(
      `[char-appearance] gen failed for ${c.id} (${name}) — using name only:`,
      e instanceof Error ? e.message : String(e),
    );
    return name;
  }

  // Cache best-effort · a write failure must not block scene gen. The
  // `.is(..., null)` guard makes a concurrent first-gen race a no-op for the
  // second writer (first-write-wins · no clobber). RLS still scopes the row to
  // the owner; a non-owner's write simply matches 0 rows.
  try {
    await opts.serviceClient
      .from("story_characters")
      .update({ visual_description: description })
      .eq("id", c.id)
      .is("visual_description", null);
  } catch (e) {
    console.warn(
      `[char-appearance] cache write failed for ${c.id}:`,
      e instanceof Error ? e.message : String(e),
    );
  }

  return description;
}
