"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateStory } from "@/lib/ai/schema-generator";
import { initialStateFromSchema } from "@/schemas/state-schema";
import type { Disposition } from "@/schemas/character";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { DEFAULT_NARRATOR, MODELS, type ModelTier } from "@/lib/ai/models";
import { pickModelForTier } from "@/lib/ai/tier-router";
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
 * disposition record covering all 4 standard axes.
 *
 * Phase 1.5/2 polish: seed all 4 axes explicitly (trust mapped from the
 * 6-level enum · romance / respect / fear at 0). Previously only `trust`
 * was set — Narrator updates on `romance`/`respect`/`fear` worked via
 * default-zero behavior but reading the disposition jsonb gave undefined
 * for those axes (UI display awkward · math edge cases on first turn).
 * Now: predictable {trust, romance, respect, fear} starting state.
 *
 * Director can still add story-specific axes (e.g., "loyalty", "envy") via
 * update_character_disposition tool — DispositionSchema is open-ended.
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
  return {
    trust: trustMap[defaultDisp] ?? 0,
    romance: 0,
    respect: 0,
    fear: 0,
  };
}

/**
 * Wave 1 audit fix (2026-05-27): switched from raw `error` string to an
 * i18n-aware shape. Client component renders the message via next-intl with
 * the user's locale — so EN / zh-Hans users no longer see Cantonese strings.
 *
 * `errorCode` is a dot-path into `messages.json#errors.*`.
 * `errorParams` are optional ICU MessageFormat params (e.g. {balance, needed}).
 * `errorRaw` is kept ONLY for moderation reasons (which are LLM-generated
 * per-input and can't be looked up in a static catalog).
 */
export type CreateStoryResult = {
  ok: false;
  errorCode?: string;
  errorParams?: Record<string, string | number>;
  errorRaw?: string;
};

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
    return { ok: false, errorCode: "common.notLoggedIn" };
  }

  const locale = await getLocale();
  const parsed = InputSchema.safeParse({
    prompt: formData.get("prompt"),
    protagonist_hint: formData.get("protagonist_hint") || undefined,
    content_rating: formData.get("content_rating") || "sfw",
  });
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "createStory.promptInvalid",
      errorRaw: parsed.error.issues[0]?.message,
    };
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
        errorCode: "createStory.adultRequiresVerification",
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
      .select("default_model, default_tier")
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

  // AUDIT FIX P0A-HIGH-02 / P0B-CRIT-02 (2026-05-25): wire default_tier into
  // creation. Session 10 introduced tier abstraction (TierPicker writes
  // default_tier). Before this fix, createStoryFromPrompt only read
  // default_model · TierPicker selection had ZERO effect on the model locked
  // at playthrough creation.
  //
  // Resolution order:
  //   1. If user has default_tier → call pickModelForTier(tier, seedText) to
  //      pick the actual underlying model (language-routed within tier pool)
  //   2. Else (legacy users · pre-Session 10) → fall back to default_model
  //   3. Else (brand new users) → DEFAULT_NARRATOR
  //
  // Tier-routed models are guaranteed in TIER_GATE-respecting pools · so the
  // userTierAllowsModel check is mostly a no-op when tier-routed · but kept
  // as defense-in-depth (covers data corruption / future-tier conflicts).
  const prefData = prefProfileResult.data;
  const tierPref = prefData?.default_tier as ModelTier | null | undefined;
  let requestedModel: string;
  if (tierPref) {
    requestedModel = pickModelForTier(tierPref, seedText);
  } else if (prefData?.default_model) {
    requestedModel = prefData.default_model;
  } else {
    requestedModel = DEFAULT_NARRATOR;
  }
  const tierCheck = await userTierAllowsModel(supabase, user.id, requestedModel);
  const userNarratorModel = tierCheck.allowed ? requestedModel : DEFAULT_NARRATOR;
  if (!tierCheck.allowed) {
    console.log(
      `[createStory] user ${user.id} model ${requestedModel} (from tier=${tierPref ?? "legacy"}) not allowed for sub-tier ${tierCheck.tier} — falling back to ${DEFAULT_NARRATOR}`,
    );
  }

  // Balance check — fail-fast if broke (cheap, do this even if moderation passed).
  // Session 16 audit HIGH-04: getBalanceAndCheck now returns null on transient
  // RLS / network failure (fail-open). null only when sufficient=true → safe
  // to coalesce to 0 here since we only enter this branch on sufficient=false.
  if (!balanceResult.sufficient) {
    return {
      ok: false,
      errorCode: "createStory.insufficientCredits",
      errorParams: {
        balance: balanceResult.balance ?? 0,
        needed: estimateStoryCreationCredits(),
      },
    };
  }

  // Moderation result handling.
  if (!seedVerdictResult.ok) {
    const err = seedVerdictResult.error;
    if (err instanceof ModerationConfigError) {
      console.error("[createStory] moderation config error:", err.message);
      return { ok: false, errorCode: "createStory.moderationConfigError" };
    }
    // Unexpected throw — log + treat as block (defensive).
    console.error("[createStory] moderation threw unexpected:", err);
    return { ok: false, errorCode: "createStory.moderationUnavailable" };
  }
  if (!seedVerdictResult.verdict.allowed) {
    console.warn(
      `[createStory] moderation blocked seed for user ${user.id}: ${seedVerdictResult.verdict.categories.join(", ")}`,
    );
    // Moderation reason is LLM-generated per input — can't be a static i18n key.
    // Surface as errorRaw so the client renders it as-is (it's the reason
    // string from OpenAI Moderation, not Cantonese static copy).
    return {
      ok: false,
      errorRaw: seedVerdictResult.verdict.reason,
    };
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
    // the client. Wave 1 follow-up (2026-05-27): switched from hardcoded 繁中
    // strings to i18n error codes so EN / zh-Hans users see localized copy.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[createStory] schema-generator failed", e);
    let errorCode = "createStory.aiBusy";
    if (/\b(401|403)\b|invalid[_-]api[_-]key|authentication/i.test(msg)) {
      errorCode = "createStory.aiUnavailable";
    } else if (/\b400\b|invalid|schema/i.test(msg)) {
      errorCode = "createStory.promptInvalid";
    }
    return { ok: false, errorCode };
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
    // AUDIT FIX (SEC-M-04): generic client message; detailed server log.
    // Wave 1: switched to i18n error code (was hardcoded 繁中).
    console.error("[createStory] story insert failed", storyErr);
    return { ok: false, errorCode: "createStory.storyInsertFailed" };
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
    return { ok: false, errorCode: "createStory.characterInsertFailed" };
  }

  // Create playthrough (immediately starts playing — no separate "save then play" step)
  const initialState = initialStateFromSchema(generated.state_schema);
  // P6-HIGH-01 fix: derive llm_provider from MODELS catalog · accurate
  // attribution for Llama (openrouter) vs Anthropic playthroughs.
  const narratorProvider = MODELS[userNarratorModel]?.provider ?? "anthropic";
  // Wave 1 audit fix (2026-05-27): default protagonist label per locale
  // (previously always "主角" — looked wrong inside English stories).
  const defaultProtagonist =
    locale === "en"
      ? "Protagonist"
      : locale === "zh-Hans"
        ? "主角"
        : "主角";
  const { data: playthrough, error: ptErr } = await supabase
    .from("playthroughs")
    .insert({
      user_id: user.id,
      story_id: story.id,
      character_name: parsed.data.protagonist_hint?.slice(0, 40) ?? defaultProtagonist,
      current_state: initialState,
      llm_provider: narratorProvider,
      llm_model: userNarratorModel,
      turn_count: 1, // opening narrative counts as turn 0 below
      status: "active",
    })
    .select()
    .single();

  if (ptErr || !playthrough) {
    console.error("[createStory] playthrough insert failed", ptErr);
    await cleanup(story.id);
    return { ok: false, errorCode: "createStory.playthroughInsertFailed" };
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

  // Insert opening narrative as turn 0 (P6-HIGH-01: derive provider)
  const { error: turnErr } = await supabase.from("turns").insert({
    playthrough_id: playthrough.id,
    turn_index: 0,
    role: "ai",
    text: generated.opening_narrative,
    llm_provider: narratorProvider,
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
