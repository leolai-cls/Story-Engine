"use server";

import { createClient } from "@/lib/supabase/server";
import { MODELS, DEFAULT_NARRATOR } from "@/lib/ai/models";
import { userTierAllowsModel } from "@/lib/billing/credits";
import { revalidatePath } from "next/cache";

/**
 * Phase 6 non-money function — toggle adult_mode_enabled.
 *
 * DB layer (Migration 0002) already enforces hard rules:
 *   - CHECK constraint: adult_mode_enabled=true requires is_age_verified=true
 *   - protect_sensitive_profile_columns trigger reverts unauthorized self-
 *     elevation (user can flip toggle but only sticks if is_age_verified)
 *
 * This action is the friendly UI path. It checks is_age_verified server-side
 * first to give a clear error message, instead of relying on the DB trigger
 * to silently revert.
 *
 * is_age_verified is set ONLY by service role (Stripe Identity webhook ·
 * Phase 6 money tier KYC). For now (pre-KYC), only test profiles manually
 * flipped via service-role would have is_age_verified=true.
 */
export async function setAdultMode(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  // Load profile state once · need is_age_verified for enable path + current
  // default_model to detect NSFW model that needs auto-reset on disable.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_age_verified, default_model")
    .eq("id", user.id)
    .single();

  // If enabling, verify user is age-verified
  if (enabled) {
    if (!profile?.is_age_verified) {
      return {
        ok: false,
        error: "需要先完成年齡驗證 (KYC) — Phase 6 money tier 嚟緊先可以開啟。",
      };
    }
  }

  // P6-UX-M-02 audit fix: if disabling adult mode AND current default_model
  // is NSFW (allows_nsfw=true) → also reset default_model to DEFAULT_NARRATOR.
  // Otherwise ModelPicker hides the user's current selection (filter `(adult
  // || !allows_nsfw)` drops NSFW), creation form + turn route would 403 on
  // next interaction, user has no visible way to recover. Atomic reset
  // keeps the user in a working state.
  const currentModel = profile?.default_model;
  const currentModelEntry = currentModel ? MODELS[currentModel] : undefined;
  const needsModelReset =
    !enabled && currentModelEntry?.allows_nsfw === true;

  const update: { adult_mode_enabled: boolean; default_model?: string; default_llm_provider?: string } = {
    adult_mode_enabled: enabled,
  };
  if (needsModelReset) {
    update.default_model = DEFAULT_NARRATOR;
    update.default_llm_provider = MODELS[DEFAULT_NARRATOR]?.provider ?? "anthropic";
    console.log(
      `[setAdultMode] reset NSFW default_model "${currentModel}" → "${DEFAULT_NARRATOR}" for user ${user.id} (adult mode disabled)`,
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    console.error("[settings] setAdultMode failed:", error.message);
    return { ok: false, error: "save_failed" };
  }

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Update the user's default narrator model preference.
 *
 * AUDIT FIX (P3-SEC-H-02): now enforces tier gate. Previously a Free user
 * could POST setDefaultModel('claude-opus-4-7') and the API would happily
 * persist it — they'd then burn Opus on every turn at 5× cost while still
 * paying $0/mo. Now: reject with 403-equivalent if user's tier can't
 * access the requested model.
 */
export async function setDefaultModel(
  modelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  const model = MODELS[modelId];
  if (!model) {
    return { ok: false, error: "unknown_model" };
  }

  // Tier gate
  const tierCheck = await userTierAllowsModel(supabase, user.id, modelId);
  if (!tierCheck.allowed) {
    return {
      ok: false,
      error:
        tierCheck.reason === "tier_too_low"
          ? `${model.display_name} 需要 ${model.min_tier} tier — 你而家係 ${tierCheck.tier}`
          : "tier_not_allowed",
    };
  }

  // Phase 6 non-money function: adult mode gate.
  // CLAUDE.md hard rule #5: NSFW traffic must NOT hit Anthropic / OpenAI direct
  // providers — only OpenRouter-routed models (allows_nsfw=true). Setting an
  // NSFW model without adult mode = potentially routing NSFW intent to the
  // wrong provider. Block at action layer in addition to UI hiding.
  if (model.allows_nsfw) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("adult_mode_enabled")
      .eq("id", user.id)
      .single();
    if (!profile?.adult_mode_enabled) {
      return {
        ok: false,
        error: `${model.display_name} 需要先開啟「成人模式」(Settings page top)。`,
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      default_model: modelId,
      default_llm_provider: model.provider,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[settings] setDefaultModel failed:", error.message);
    return { ok: false, error: "save_failed" };
  }

  revalidatePath("/settings");
  return { ok: true };
}
