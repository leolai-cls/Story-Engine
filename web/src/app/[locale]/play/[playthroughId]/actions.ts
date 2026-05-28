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
/**
 * Wave 1 audit C-01 fix (2026-05-27): switched from hardcoded 繁中 error
 * strings to i18n error codes — was leaking Cantonese to EN / zh-Hans users
 * the moment they touched the NPC L3 toggle. Client renders via
 * useTranslations("errors") with the user's UI locale.
 */
export type SetNpcL3Result =
  | { ok: true; enabled: boolean }
  | {
      ok: false;
      errorCode?: string;
      errorParams?: Record<string, string | number>;
      errorRaw?: string;
      code?: string;
    };

export async function setNpcL3Enabled(
  playthroughId: string,
  enabled: boolean,
): Promise<SetNpcL3Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, errorCode: "common.notLoggedIn", code: "unauthorized" };
  }

  // Owner check FIRST (avoid tier-error leak to non-owner)
  const { data: playthrough, error: ptErr } = await supabase
    .from("playthroughs")
    .select("id, user_id, npc_l3_enabled")
    .eq("id", playthroughId)
    .single();

  if (ptErr || !playthrough) {
    return { ok: false, errorCode: "play.playthroughNotFound", code: "not_found" };
  }
  if (playthrough.user_id !== user.id) {
    return { ok: false, errorCode: "play.playthroughNotOwner", code: "forbidden" };
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
        errorCode: "play.npcL3TierRequired",
        errorParams: { tier },
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
    // Trigger raised exception · surface as tier-required (DB-side gate)
    if (/Storyteller subscription/i.test(msg)) {
      return {
        ok: false,
        errorCode: "play.npcL3TierRequiredGeneric",
        code: "tier_required",
      };
    }
    console.error("[setNpcL3Enabled] update failed:", msg);
    return { ok: false, errorCode: "play.saveFailed", code: "db_error" };
  }

  // Revalidate play page so UI sees new state on next render
  revalidatePath(`/play/${playthroughId}`);
  revalidatePath(`/play/${playthroughId}/memory`);

  return { ok: true, enabled };
}
