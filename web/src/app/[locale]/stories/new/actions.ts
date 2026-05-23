"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateStory } from "@/lib/ai/schema-generator";
import { initialStateFromSchema } from "@/schemas/state-schema";
import type { Disposition } from "@/schemas/character";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { DEFAULT_NARRATOR } from "@/lib/ai/models";
import {
  chargeCredits,
  computeCredits,
  estimateStoryCreationCredits,
  getBalanceAndCheck,
  userTierAllowsModel,
} from "@/lib/billing/credits";
import { ModerationConfigError, moderateText } from "@/lib/moderation/openai-moderation";

const InputSchema = z.object({
  prompt: z.string().min(20).max(2000),
  protagonist_hint: z.string().max(280).optional(),
  content_rating: z.enum(["sfw", "soft", "adult"]).default("sfw"),
});

/**
 * Map a NPC's default_disposition_toward_protagonist to an initial
 * disposition record. Director can extend with story-specific axes later.
 */
function dispositionFromDefault(
  defaultDisp: string,
): Disposition {
  const trustMap: Record<string, number> = {
    hostile: -60,
    wary: -20,
    neutral: 0,
    friendly: 30,
    warm: 60,
    devoted: 90,
  };
  return { trust: trustMap[defaultDisp] ?? 0 };
}

export type CreateStoryResult = { ok: false; error: string };

/**
 * Returns an error object on failure; on success it calls `redirect()`
 * which throws, so the function never returns the success case. Return
 * type is therefore only the error shape.
 */
export async function createStoryFromPrompt(
  formData: FormData,
): Promise<CreateStoryResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "你要先登入" };
  }

  const locale = await getLocale();
  const parsed = InputSchema.safeParse({
    prompt: formData.get("prompt"),
    protagonist_hint: formData.get("protagonist_hint") || undefined,
    content_rating: formData.get("content_rating") || "sfw",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input invalid" };
  }

  // Phase 6 non-money function — adult mode gate.
  // CLAUDE.md hard rule #5: adult content rating requires adult_mode_enabled
  // (which itself requires is_age_verified via DB CHECK constraint).
  // Block at action layer in addition to UI button disabling.
  if (parsed.data.content_rating === "adult") {
    const { data: profileAdult } = await supabase
      .from("profiles")
      .select("adult_mode_enabled")
      .eq("id", user.id)
      .single();
    if (!profileAdult?.adult_mode_enabled) {
      return {
        ok: false,
        error:
          "Adult-rated 故事需要先喺 Settings 開啟「成人模式」(KYC 驗證後)。請揀 SFW 或 Soft rating。",
      };
    }
  }

  // Wave 1.5 W1-COST-C-01 reorder: cheap checks first (DB ~20ms each),
  // moderation in parallel with model lookup, then the expensive schema-gen.
  // Previously moderation ran before balance check — broke users waited
  // ~2-10s for moderation just to see "you have no credits".
  //
  // Sequence:
  //   1. Auth (already done above)
  //   2. Input parse (already done above)
  //   3. PARALLEL: balance check + tier check + moderation
  //   4. If any reject → return early
  //   5. schema-gen (expensive, ~30-60s, ~$0.20)

  const seedText = [parsed.data.prompt, parsed.data.protagonist_hint]
    .filter((t): t is string => !!t && t.trim().length > 0)
    .join("\n\n");

  // Pre-resolve all the cheap checks in parallel.
  const [prefProfileResult, balanceResult, seedVerdictResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("default_model")
      .eq("id", user.id)
      .single(),
    getBalanceAndCheck(supabase, {
      userId: user.id,
      estimatedCost: estimateStoryCreationCredits(),
    }),
    // W1-MOD-C-02 + W1-FP-* — failClosed:true + tuned thresholds (sexual/minors
    // floor 0.5, no general violence, threatening categories require ≥0.7 score).
    // ModerationConfigError caught below as 500-class.
    moderateText(seedText, parsed.data.content_rating, { failClosed: true })
      .then((verdict) => ({ ok: true as const, verdict }))
      .catch((e: unknown) => ({ ok: false as const, error: e })),
  ]);

  // Tier resolution (uses prefProfile result; same DB hit otherwise).
  const requestedModel = prefProfileResult.data?.default_model ?? DEFAULT_NARRATOR;
  const tierCheck = await userTierAllowsModel(supabase, user.id, requestedModel);
  const userNarratorModel = tierCheck.allowed ? requestedModel : DEFAULT_NARRATOR;
  if (!tierCheck.allowed) {
    console.log(
      `[createStory] user ${user.id} default_model ${requestedModel} not allowed for tier ${tierCheck.tier} — falling back to ${DEFAULT_NARRATOR}`,
    );
  }

  // Balance check — fail-fast if broke (cheap, do this even if moderation passed).
  if (!balanceResult.sufficient) {
    return {
      ok: false,
      error: `Credit 唔夠創作故事（剩 ${balanceResult.balance}，需要約 ${estimateStoryCreationCredits()}）。Top-up 或 upgrade 之後再試。`,
    };
  }

  // Moderation result handling.
  if (!seedVerdictResult.ok) {
    const err = seedVerdictResult.error;
    if (err instanceof ModerationConfigError) {
      console.error("[createStory] moderation config error:", err.message);
      return { ok: false, error: "內容審核系統設定問題，請稍後再試。" };
    }
    // Unexpected throw — log + treat as block (defensive).
    console.error("[createStory] moderation threw unexpected:", err);
    return { ok: false, error: "內容審核暫時無法使用，請稍後再試。" };
  }
  if (!seedVerdictResult.verdict.allowed) {
    console.warn(
      `[createStory] moderation blocked seed for user ${user.id}: ${seedVerdictResult.verdict.categories.join(", ")}`,
    );
    return { ok: false, error: seedVerdictResult.verdict.reason };
  }
  const estimatedCost = estimateStoryCreationCredits();

  let generated;
  try {
    generated = await generateStory({
      prompt: parsed.data.prompt,
      locale: locale as "zh-Hant" | "zh-Hans" | "en",
      content_rating: parsed.data.content_rating,
      protagonist_hint: parsed.data.protagonist_hint,
    });
  } catch (e) {
    // AUDIT FIX (SEC-M-04): don't leak raw Anthropic / model error text to
    // the client (rate-limit hints, model ids, request_id headers, schema
    // info). Log details server-side, return categorized 繁中 message.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[createStory] schema-generator failed", e);
    let friendly = "AI 而家好忙，請 30 秒後再試一次";
    if (/\b(401|403)\b|invalid[_-]api[_-]key|authentication/i.test(msg)) {
      friendly = "AI 服務暫時無法使用，請稍後再試";
    } else if (/\b400\b|invalid|schema/i.test(msg)) {
      friendly = "你嘅故事概念有少少問題 — 試下講多啲背景或者換個角度";
    }
    return { ok: false, error: friendly };
  }

  // Helper: best-effort cleanup if a later step fails. Supabase JS client
  // has no native transactions, so we manually rollback created rows.
  async function cleanup(storyId?: string) {
    if (storyId) {
      // story has CASCADE on characters / playthroughs / etc, so deleting
      // the story row tears everything down.
      await supabase.from("stories").delete().eq("id", storyId);
    }
  }

  // Insert story
  const { data: story, error: storyErr } = await supabase
    .from("stories")
    .insert({
      owner_id: user.id,
      title: generated.title,
      description: generated.description,
      prompt_seed: parsed.data.prompt,
      state_schema: generated.state_schema,
      story_bible: generated.story_bible,
      opening_narrative: generated.opening_narrative,
      genre: generated.genre,
      tags: generated.tags,
      language: locale,
      content_rating: parsed.data.content_rating,
      visibility: "private",
      origin: "user",
    })
    .select()
    .single();

  if (storyErr || !story) {
    // AUDIT FIX (SEC-M-04): generic 繁中 client message; detailed server log.
    console.error("[createStory] story insert failed", storyErr);
    return { ok: false, error: "建立故事失敗，請稍後再試" };
  }

  // Insert characters
  const characterRows = generated.characters.map((c) => ({
    story_id: story.id,
    name: c.name,
    role: c.role,
    personality_traits: c.personality_traits,
    backstory: c.backstory,
    core_motivation: c.core_motivation,
    red_lines: c.red_lines,
    voice_sample: c.voice_sample,
    arc_description: c.arc_description,
    default_disposition_toward_protagonist:
      c.default_disposition_toward_protagonist,
  }));

  const { data: insertedChars, error: charsErr } = await supabase
    .from("story_characters")
    .insert(characterRows)
    .select();

  if (charsErr || !insertedChars) {
    console.error("[createStory] character insert failed", charsErr);
    await cleanup(story.id);
    return { ok: false, error: "建立角色失敗，請稍後再試" };
  }

  // Create playthrough (immediately starts playing — no separate "save then play" step)
  const initialState = initialStateFromSchema(generated.state_schema);
  const { data: playthrough, error: ptErr } = await supabase
    .from("playthroughs")
    .insert({
      user_id: user.id,
      story_id: story.id,
      character_name: parsed.data.protagonist_hint?.slice(0, 40) ?? "主角",
      current_state: initialState,
      llm_provider: "anthropic",
      llm_model: userNarratorModel,
      turn_count: 1, // opening narrative counts as turn 0 below
      status: "active",
    })
    .select()
    .single();

  if (ptErr || !playthrough) {
    console.error("[createStory] playthrough insert failed", ptErr);
    await cleanup(story.id);
    return { ok: false, error: "建立遊玩進度失敗，請稍後再試" };
  }

  // Initialize per-character disposition states
  const charStates = insertedChars.map((c) => ({
    playthrough_id: playthrough.id,
    character_id: c.id,
    disposition: dispositionFromDefault(
      c.default_disposition_toward_protagonist,
    ),
    permanent_flags: [],
  }));
  if (charStates.length > 0) {
    const { error: csErr } = await supabase
      .from("playthrough_character_states")
      .insert(charStates);
    if (csErr) {
      console.error("[createStory] character_states insert failed", csErr);
    }
  }

  // Insert opening narrative as turn 0
  const { error: turnErr } = await supabase.from("turns").insert({
    playthrough_id: playthrough.id,
    turn_index: 0,
    role: "ai",
    text: generated.opening_narrative,
    llm_provider: "anthropic",
    model: userNarratorModel,
    credits_charged: 0, // story creation charged separately on stories ref below
  });
  if (turnErr) {
    console.error("[createStory] opening turn insert failed", turnErr);
  }

  // AUDIT FIX (P3-LOGIC-H-04 / P3-COST-M-06): charge ACTUAL schema-gen
  // cost using real token usage returned from generateStory. Previously
  // charged a flat estimate that was 30-50% off depending on prompt
  // complexity and retry behavior. Now: real input/output/cached tokens
  // flow into computeCredits → fair charge to user, accurate margin to us.
  const actualStoryCost = computeCredits({
    modelId: "claude-sonnet-4-6",
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    cachedInputTokens: generated.usage.cachedInputTokens,
  });
  const storyChargeResult = await chargeCredits(supabase, {
    userId: user.id,
    delta: -actualStoryCost,
    reason: "story_charge",
    refType: "story",
    refId: story.id,
    metadata: {
      prompt_length: parsed.data.prompt.length,
      input_tokens: generated.usage.inputTokens,
      output_tokens: generated.usage.outputTokens,
      cached_input_tokens: generated.usage.cachedInputTokens,
      estimated_cost: estimatedCost,
      actual_cost: actualStoryCost,
    },
  });
  if (storyChargeResult.ok) {
    console.log(
      `[createStory] charged ${actualStoryCost} credits (estimate was ${estimatedCost}) for story ${story.id} — new balance: ${storyChargeResult.newBalance}`,
    );
  } else if (storyChargeResult.error === "insufficient_credits") {
    // Shouldn't happen — pre-check passed earlier and actualCost should be
    // <= estimate. Defensive log + continue (story already created).
    console.error(
      `[createStory] post-charge insufficient_credits — current=${storyChargeResult.currentBalance}, needed=${storyChargeResult.needed}`,
    );
  } else {
    console.error("[createStory] charge failed:", storyChargeResult.message);
  }

  revalidatePath("/library");
  redirect({
    href: `/play/${playthrough.id}` as never,
    locale,
  });
  // unreachable — redirect() throws
  throw new Error("unreachable");
}
