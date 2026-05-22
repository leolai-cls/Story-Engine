"use server";

import { createClient } from "@/lib/supabase/server";
import { MODELS } from "@/lib/ai/models";
import { revalidatePath } from "next/cache";

/**
 * Update the user's default narrator model preference.
 * Validates the model id exists in MODELS catalog (defense in depth even
 * though UI only renders valid IDs).
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
    return { ok: false, error: "unknown model" };
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
