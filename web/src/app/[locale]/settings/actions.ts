"use server";

import { createClient } from "@/lib/supabase/server";
import { MODELS } from "@/lib/ai/models";
import { userTierAllowsModel } from "@/lib/billing/credits";
import { revalidatePath } from "next/cache";

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
