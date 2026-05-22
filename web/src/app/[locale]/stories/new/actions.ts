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
import { moderateText } from "@/lib/moderation/openai-moderation";

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

  // P5-SEC-C-01 — moderate prompt + protagonist hint BEFORE burning ~$0.20
  // on schema generation. CLAUDE.md hard rule #6: CSAM / illegal pre-filter
  // is law-line, never bypass. Moderation runs on the user-provided seeds
  // (prompt + protagonist_hint) — the AI-generated continuation is filtered
  // separately by the model's own RLHF + Director red lines.
  const seedText = [parsed.data.prompt, parsed.data.protagonist_hint]
    .filter((t): t is string => !!t && t.trim().length > 0)
    .join("\n\n");
  const seedVerdict = await moderateText(seedText, parsed.data.content_rating);
  if (!seedVerdict.allowed) {
    console.warn(
      `[createStory] moderation blocked seed for user ${user.id}: ${seedVerdict.categories.join(", ")}`,
    );
    return { ok: false, error: seedVerdict.reason };
  }

  // Load user's preferred narrator model (Phase 3 — wired through Settings).
  // Falls back to DEFAULT_NARRATOR if not set or no longer allowed for tier.
  //
  // AUDIT FIX (P3-SEC-H-02 / P3-LOGIC-H-06): re-validate tier here in case
  // user downgraded after setting a premium model. setDefaultModel blocks
  // future writes but stale default_model values can persist; revalidate
  // at every consumption point.
  const { data: prefProfile } = await supabase
    .from("profiles")
    .select("default_model")
    .eq("id", user.id)
    .single();
  const requestedModel = prefProfile?.default_model ?? DEFAULT_NARRATOR;
  const tierCheck = await userTierAllowsModel(supabase, user.id, requestedModel);
  const userNarratorModel = tierCheck.allowed ? requestedModel : DEFAULT_NARRATOR;
  if (!tierCheck.allowed) {
    console.log(
      `[createStory] user ${user.id} default_model ${requestedModel} not allowed for tier ${tierCheck.tier} — falling back to ${DEFAULT_NARRATOR}`,
    );
  }

  // AUDIT FIX (AI-H-03): pre-check credit balance before burning ~$0.20 on
  // 4 parallel Sonnet 4.6 calls. Friendly 402 UX if user can't afford.
  const estimatedCost = estimateStoryCreationCredits();
  const balance = await getBalanceAndCheck(supabase, {
    userId: user.id,
    estimatedCost,
  });
  if (!balance.sufficient) {
    return {
      ok: false,
      error: `Credit 唔夠創作故事（剩 ${balance.balance}，需要約 ${estimatedCost}）。Top-up 或 upgrade 之後再試。`,
    };
  }

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
