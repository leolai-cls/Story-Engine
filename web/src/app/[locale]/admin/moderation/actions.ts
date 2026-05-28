"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { chargeCredits } from "@/lib/billing/credits";
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

/**
 * Phase 8 Wave 3 fix CR-HIGH-03 · Moderate a generated scene_image.
 *
 * Admin-only path:
 *   - 'approve' → moderation_status='approved' (no refund · default state)
 *   - 'reject' → moderation_status='rejected' + AUTO-REFUND credits + remove
 *     Storage object (founder decision 2026-05-28: auto-refund on admin reject)
 *
 * Hard rule #4: refund happens via credit_ledger entry (append-only) ·
 * NEVER mutate profiles.credit_balance directly.
 */
export async function moderateSceneImage(
  sceneImageId: string,
  action: "approve" | "reject",
): Promise<{ ok: true; refunded?: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if ((user.app_metadata?.role as string) !== "admin") {
    return { ok: false, error: "not_admin" };
  }

  const service = createServiceRoleClient();

  // Load scene_image row · need user_id + credits_charged + storage path for cleanup
  const { data: scene, error: loadErr } = await service
    .from("scene_images")
    .select("id, user_id, credits_charged, ledger_id, storage_url, moderation_status, playthrough_id, turn_index")
    .eq("id", sceneImageId)
    .single();
  if (loadErr || !scene) return { ok: false, error: "scene_not_found" };

  if (action === "approve") {
    const { error: updErr } = await service
      .from("scene_images")
      .update({ moderation_status: "approved" })
      .eq("id", sceneImageId);
    if (updErr) return { ok: false, error: "update_failed" };
    revalidatePath("/admin/moderation");
    return { ok: true };
  }

  // action === 'reject' — soft-delete + auto-refund + storage cleanup
  if (scene.moderation_status === "rejected") {
    return { ok: false, error: "already_processed" };
  }

  // 1. Refund credits via ledger entry (append-only · hard rule #4)
  let refunded: number | undefined;
  const creditsCharged = scene.credits_charged as number | null;
  if (creditsCharged && creditsCharged > 0) {
    try {
      const refundResult = await chargeCredits(service, {
        userId: scene.user_id as string,
        delta: +creditsCharged,
        reason: "refund",
        refType: "scene_image",
        refId: sceneImageId,
        metadata: {
          original_ledger_id: scene.ledger_id,
          reason_detail: "admin_moderation_reject",
          playthrough_id: scene.playthrough_id,
          turn_index: scene.turn_index,
          admin_user_id: user.id,
        },
      });
      if (refundResult.ok) {
        refunded = creditsCharged;
      }
    } catch (e) {
      console.error("[admin/moderation] scene refund failed · MANUAL:", e, {
        sceneImageId,
        userId: scene.user_id,
        credits: creditsCharged,
      });
    }
  }

  // 2. Update moderation status
  const { error: updErr } = await service
    .from("scene_images")
    .update({ moderation_status: "rejected" })
    .eq("id", sceneImageId);
  if (updErr) return { ok: false, error: "update_failed" };

  // 3. Best-effort storage cleanup (path extraction from storage_url)
  try {
    const storageUrl = scene.storage_url as string;
    // Public URL shape: .../storage/v1/object/public/scene-images/{path}
    const match = storageUrl.match(/\/scene-images\/(.+)$/);
    if (match) {
      await service.storage.from("scene-images").remove([match[1]]);
    }
  } catch (e) {
    console.warn("[admin/moderation] storage cleanup failed:", e);
  }

  revalidatePath("/admin/moderation");
  revalidatePath(`/play/${scene.playthrough_id}`);
  return { ok: true, refunded };
}
