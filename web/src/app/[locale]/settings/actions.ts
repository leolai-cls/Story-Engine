"use server";

import { createClient } from "@/lib/supabase/server";
import { MODELS, DEFAULT_NARRATOR, TIER_GATE, type ModelTier } from "@/lib/ai/models";
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
/**
 * Wave 1 audit fix (2026-05-27): switched to i18n error codes. Two hardcoded
 * 繁中 strings ("需要先完成身份驗證..." and "Adult tier 需要先...") were
 * leaking to EN / zh-Hans users via the settings adult-mode toggle path.
 */
export type SetAdultModeResult =
  | { ok: true }
  | { ok: false; error: string; errorCode?: string };

export async function setAdultMode(
  enabled: boolean,
): Promise<SetAdultModeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  // Load profile state once · need is_age_verified for enable path + current
  // default_model + default_tier to detect NSFW model/tier that needs auto-
  // reset on disable.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_age_verified, default_model, default_tier")
    .eq("id", user.id)
    .single();

  // If enabling, verify user is age-verified
  if (enabled) {
    if (!profile?.is_age_verified) {
      return {
        ok: false,
        // Wave 1 audit fix: i18n error code (was hardcoded 繁中).
        error: "adult_requires_kyc",
        errorCode: "settings.adultRequiresKyc",
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

  // ADR-022: tier 已簡化 standard / pro · adult 唔再係獨立 tier ·
  // disable adult mode 唔需要 reset tier (legacy "adult" / "pro-max" 值
  // 喺 lib/ai/tier-router 入面會 narrow 落 standard fallback).
  const currentTier = profile?.default_tier as string | null | undefined;
  const needsTierReset = !enabled && (currentTier === "adult" || currentTier === "pro-max");

  const update: {
    adult_mode_enabled: boolean;
    default_model?: string;
    default_llm_provider?: string;
    default_tier?: ModelTier;
  } = {
    adult_mode_enabled: enabled,
  };
  if (needsModelReset) {
    update.default_model = DEFAULT_NARRATOR;
    update.default_llm_provider = MODELS[DEFAULT_NARRATOR]?.provider ?? "anthropic";
    console.log(
      `[setAdultMode] reset NSFW default_model "${currentModel}" → "${DEFAULT_NARRATOR}" for user ${user.id} (adult mode disabled)`,
    );
  }
  if (needsTierReset) {
    update.default_tier = "pro";
    console.log(
      `[setAdultMode] reset default_tier 'adult' → 'pro' for user ${user.id} (adult mode disabled)`,
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
  // Wave 2 i18n cycle-6 fix (2026-05-28): dropped hardcoded 廣東話 strings.
  // setDefaultModel is currently dead code (replaced by TierPicker · per
  // tier-picker.tsx header comment) but cleaned up here for hygiene in case
  // it's revived. Caller would need to render localized body via i18n catalog.
  const tierCheck = await userTierAllowsModel(supabase, user.id, modelId);
  if (!tierCheck.allowed) {
    return {
      ok: false,
      error: tierCheck.reason === "tier_too_low" ? "tier_too_low" : "tier_not_allowed",
    };
  }

  // W4 fix · 2026-05-28 (ADR-022 follow-up): drop model-level allows_nsfw gate.
  // `allows_nsfw=true` 而家代表 "呢個 model 識做 NSFW" 唔係 "ONLY NSFW".
  // GLM-5.1 同時做 SFW Standard pool 默認 + NSFW cross-tier · 都應該俾 default.
  // 真正 NSFW gate 喺 story.content_rating='adult' check 度做 (turn route).

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

/**
 * Session 10 · set user-facing model tier (Standard / Pro / Pro Max / Adult).
 *
 * Replaces direct model selection per founder rule (2026-05-25 · "唔需要畀
 * 咁多 LLM 用家揀 · just standard/pro"). The actual underlying LLM is picked
 * by lib/ai/tier-router.ts at turn time based on content language + vendor
 * availability.
 *
 * Gating:
 *   - subscription tier must be ≥ TIER_GATE[tier] (Free can't pick Pro etc.)
 *   - 'adult' tier additionally requires adult_mode_enabled + is_age_verified
 *     (CLAUDE.md hard rule #5 LLM isolation enforced at DB CHECK constraint)
 *
 * NOTE: depends on Migration 0019 (profiles.default_tier column) being
 * applied. Until then this action will fail with "save_failed" — apply
 * via Supabase dashboard SQL Editor.
 */
/**
 * Wave 2 i18n cycle-6 fix (2026-05-28): added optional errorParams · tier-picker
 * client uses these to render localized "Pro tier requires Adventurer · you're
 * on Free" body via settings.tierSubscriptionGate.
 */
export type SetDefaultTierResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      errorParams?: Record<string, string | number>;
    };

export async function setDefaultTier(
  tier: ModelTier,
): Promise<SetDefaultTierResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "unauthorized" };
  }

  // Validate tier enum (ADR-022: simplified to 2 tier).
  const validTiers: ModelTier[] = ["standard", "pro"];
  if (!validTiers.includes(tier)) {
    return { ok: false, error: "unknown_tier" };
  }

  // Subscription gate.
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, adult_mode_enabled, is_age_verified")
    .eq("id", user.id)
    .single();
  const userSubTier = profile?.subscription_tier ?? "free";
  const requiredSubTier = TIER_GATE[tier];
  const tierOrder = ["free", "adventurer", "storyteller", "legend"] as const;
  if (tierOrder.indexOf(userSubTier as (typeof tierOrder)[number]) < tierOrder.indexOf(requiredSubTier)) {
    // Wave 2 i18n cycle-6 fix (2026-05-28): drop hardcoded 廣東話 error string.
    // Client (tier-picker) renders body via tier-picker.requiresSubTier with
    // {tier} param. Server only sends code + structured data.
    return {
      ok: false,
      error: "subscription_gate",
      errorCode: "settings.tierSubscriptionGate",
      errorParams: { tier, required: requiredSubTier, current: userSubTier },
    } as SetDefaultTierResult;
  }

  // ADR-022: adult mode 唔再係獨立 tier · 係 cross-tier toggle (adult_mode_enabled
  // + is_age_verified). Story-level + turn-level 路由喺 tier-router 處理 ·
  // setDefaultTier 唔再需要 special-case "adult".
  void profile;

  const { error } = await supabase
    .from("profiles")
    .update({ default_tier: tier })
    .eq("id", user.id);

  if (error) {
    console.error("[settings] setDefaultTier failed:", error.message);
    return { ok: false, error: "save_failed" };
  }

  revalidatePath("/settings");
  return { ok: true };
}
