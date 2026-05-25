"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Session 14 · Server action for NPC L3 opt-in toggle (founder Q4 sign-off).
 *
 * Defense in depth (3 layers):
 *   1. THIS server action: auth + tier check + owner check (friendly errors)
 *   2. Migration 0028 trigger `enforce_npc_l3_tier_gate`: DB-level tier check
 *      (canonical JWT pattern · fires on column UPDATE)
 *   3. RLS `playthroughs_own_update`: owner check (auth.uid() = user_id)
 *
 * Storyteller / Legend subscription tier required to enable. Free / Adventurer
 * users will fail at the action layer with a clear upsell error message.
 *
 * Tier downgrade race (F-09 from research · Wave 2 CRIT-B fix in turn route):
 *   - User on Storyteller enables L3 · downgrades to Adventurer
 *   - playthroughs.npc_l3_enabled remains TRUE
 *   - Turn route's server-side tierCheck.tier re-validates per turn
 *   - Disable path here (`enabled: false`) always works regardless of tier
 *     (covers cancel-subscription → turn off feature gracefully)
 */
export async function setNpcL3Enabled(
  playthroughId: string,
  enabled: boolean,
): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string; code?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "請先登入。", code: "unauthorized" };
  }

  // Owner check FIRST (avoid tier-error leak to non-owner)
  const { data: playthrough, error: ptErr } = await supabase
    .from("playthroughs")
    .select("id, user_id, npc_l3_enabled")
    .eq("id", playthroughId)
    .single();

  if (ptErr || !playthrough) {
    return { ok: false, error: "搵唔到呢個 playthrough。", code: "not_found" };
  }
  if (playthrough.user_id !== user.id) {
    return { ok: false, error: "你唔係呢個 playthrough 嘅主人。", code: "forbidden" };
  }

  // No-op early exit (same state · skip DB roundtrip)
  if (playthrough.npc_l3_enabled === enabled) {
    return { ok: true, enabled };
  }

  // Tier check ONLY on enable path. Disable always allowed (cancel-aware UX).
  if (enabled) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .single();
    const tier = (profile?.subscription_tier ?? "free") as string;
    if (tier !== "storyteller" && tier !== "legend") {
      return {
        ok: false,
        error: `NPC 內心戲係 Storyteller 訂閱獨享 (你而家係 ${tier} tier · 升級至 Storyteller 即可解鎖)。`,
        code: "tier_required",
      };
    }
  }

  // Write · authenticated client (Migration 0028 trigger enforces tier in DB)
  const { error: updErr } = await supabase
    .from("playthroughs")
    .update({ npc_l3_enabled: enabled })
    .eq("id", playthroughId);

  if (updErr) {
    const msg = String(updErr.message ?? "");
    // Trigger raised exception · surface clean message
    if (/Storyteller subscription/i.test(msg)) {
      return {
        ok: false,
        error: msg.replace(/^.*?:\s*/, ""),
        code: "tier_required",
      };
    }
    console.error("[setNpcL3Enabled] update failed:", msg);
    return { ok: false, error: "儲存失敗 · 請稍後再試。", code: "db_error" };
  }

  // Revalidate play page so UI sees new state on next render
  revalidatePath(`/play/${playthroughId}`);
  revalidatePath(`/play/${playthroughId}/memory`);

  return { ok: true, enabled };
}
