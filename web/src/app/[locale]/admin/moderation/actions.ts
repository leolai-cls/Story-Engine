"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Process a moderation flag · approve / dismiss / soft-delete the offending
 * content. Admin-only · gated by process_moderation_flag RPC (auth.uid() must
 * have raw_app_meta_data.role='admin').
 */
export async function processModerationFlag(
  flagId: string,
  action: "approve" | "dismiss" | "soft_delete",
  reviewNotes?: string,
): Promise<{ ok: true; hidden: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data, error } = await supabase.rpc("process_moderation_flag", {
    p_flag_id: flagId,
    p_action: action,
    p_review_notes: reviewNotes ?? null,
  });

  if (error) {
    console.warn(`[admin/moderation] processModerationFlag failed:`, error);
    if (error.message?.includes("not admin")) return { ok: false, error: "not_admin" };
    if (error.message?.includes("already")) return { ok: false, error: "already_processed" };
    if (error.message?.includes("not found")) return { ok: false, error: "flag_not_found" };
    return { ok: false, error: "process_failed" };
  }
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/admin/moderation");
  return { ok: true, hidden: row?.content_hidden ?? false };
}
