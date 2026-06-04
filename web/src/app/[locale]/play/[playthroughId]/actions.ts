"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getActiveTier } from "@/lib/billing/credits";
import { MODELS, TIER_GATE, type ModelTier } from "@/lib/ai/models";

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
  // Deep Mode (2026-06-04): NPC 內心戲 = Pro-tier · unlocks at adventurer
  // (TIER_GATE.pro). Use getActiveTier (active subscription · status
  // active/trialing) NOT stale profile.subscription_tier, so a cancelled /
  // downgraded user can't keep flipping it on. Matches the turn route gate.
  if (enabled) {
    const activeTier = await getActiveTier(supabase, user.id);
    const order = ["free", "adventurer", "storyteller", "legend"] as const;
    if (order.indexOf(activeTier) < order.indexOf(TIER_GATE.pro)) {
      return {
        ok: false,
        errorCode: "play.npcL3TierRequired",
        errorParams: { tier: activeTier },
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
    // Trigger raised exception · surface as tier-required (DB-side gate).
    // Match both the new Pro-gate message (migration 0059) + the old
    // Storyteller one (pre-0059 rollout window · defence-in-depth).
    if (/Pro subscription|Storyteller subscription/i.test(msg)) {
      return {
        ok: false,
        errorCode: "play.npcL3TierRequiredGeneric",
        code: "tier_required",
      };
    }
    console.error("[setNpcL3Enabled] update failed:", msg);
    return { ok: false, errorCode: "play.saveFailed", code: "db_error" };
  }

  // No revalidatePath: the toggle is reflected by optimistic client state +
  // read fresh from DB on the next turn. Revalidating re-renders the whole
  // play page → felt like a reload on mobile (founder 2026-05-29).
  return { ok: true, enabled };
}

/**
 * 2026-05-29 (founder rule): allow mid-story model switching (ChatGPT-style).
 *
 * Previously llm_model was locked at playthrough creation (Migration 0022
 * trigger `protect_playthrough_llm_model`). Founder wants users to switch
 * model mid-story from the chat UI. We keep the trigger (blocks direct
 * client tampering) and do the validated update via service-role here.
 *
 * Validation:
 *   1. auth + owner check
 *   2. modelId must be a known narrator model
 *   3. user's ACTIVE tier (subscriptions.status active/trialing) must unlock
 *      the model's tier_pool (TIER_GATE)
 *
 * NSFW models (allows_nsfw) can be selected for SFW play too (ADR-022) — no
 * adult-mode gate on selection. The adult-rated *story* gate stays in the
 * turn route (content_rating='adult' requires adult_mode_enabled).
 *
 * Cost: per-turn credit charge auto-adjusts (turn route reads pt.llm_model
 * at turn time). Switching Gemini→Sonnet→GPT changes cost per turn — the
 * chat UI shows a live estimate.
 */
export type SetPlaythroughModelResult =
  | { ok: true; modelId: string }
  | { ok: false; errorCode?: string; errorParams?: Record<string, string | number>; code?: string };

export async function setPlaythroughModel(
  playthroughId: string,
  modelId: string,
): Promise<SetPlaythroughModelResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, errorCode: "common.notLoggedIn", code: "unauthorized" };
  }

  // Validate model exists + is a narrator (not Director / internal)
  const model = MODELS[modelId];
  if (!model || model.role !== "narrator" || !model.tier_pool) {
    return { ok: false, errorCode: "play.saveFailed", code: "unknown_model" };
  }

  // Owner check
  const { data: playthrough, error: ptErr } = await supabase
    .from("playthroughs")
    .select("id, user_id, llm_model")
    .eq("id", playthroughId)
    .single();
  if (ptErr || !playthrough) {
    return { ok: false, errorCode: "play.playthroughNotFound", code: "not_found" };
  }
  if (playthrough.user_id !== user.id) {
    return { ok: false, errorCode: "play.playthroughNotOwner", code: "forbidden" };
  }

  // No-op early exit
  if (playthrough.llm_model === modelId) {
    return { ok: true, modelId };
  }

  // Tier gate · active tier must unlock the model's pool
  const activeTier = await getActiveTier(supabase, user.id);
  const requiredSub = TIER_GATE[model.tier_pool as ModelTier];
  const order = ["free", "adventurer", "storyteller", "legend"] as const;
  if (order.indexOf(activeTier) < order.indexOf(requiredSub)) {
    return {
      ok: false,
      errorCode: "play.modelTierRequired",
      errorParams: { model: model.display_name },
      code: "tier_required",
    };
  }

  // Update via service-role (bypasses protect_playthrough_llm_model trigger ·
  // app-level validation above is the gate). Set both model + provider.
  const service = createServiceRoleClient();
  const { error: updErr } = await service
    .from("playthroughs")
    .update({ llm_model: modelId, llm_provider: model.provider })
    .eq("id", playthroughId);
  if (updErr) {
    console.error("[setPlaythroughModel] update failed:", updErr.message);
    return { ok: false, errorCode: "play.saveFailed", code: "db_error" };
  }

  // No revalidatePath (ChatGPT-style instant switch · optimistic client state ·
  // turn route reads pt.llm_model fresh next turn). Avoids full-page reload.
  return { ok: true, modelId };
}

/**
 * 2026-05-29 (founder product decision): per-playthrough "deep thinking" toggle.
 *
 * Lets users opt the narrator into a reasoning/thinking pass for richer
 * story-telling (ChatGPT-style). Founder rules:
 *   - Default OFF · 人人可手動開 (NO tier gate · unlike npc_l3).
 *   - ON costs more credits (billed on actual token usage · incl. reasoning)
 *     and is a few seconds slower → the turn route reads pt.thinking_mode_enabled
 *     and routes Gemini through the thinking-enabled CrazyRouter instance /
 *     enables Anthropic extended thinking, with a larger output budget.
 *
 * Plain owner-gated write (Migration 0046 · no DB trigger on this column ·
 * RLS playthroughs_own_update enforces owner). thinking_mode_enabled is not in
 * the generated Supabase types yet, so we cast — same pattern as npc_l3_enabled.
 */
export type SetThinkingModeResult =
  | { ok: true; enabled: boolean }
  | { ok: false; errorCode?: string; code?: string };

export async function setThinkingMode(
  playthroughId: string,
  enabled: boolean,
): Promise<SetThinkingModeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, errorCode: "common.notLoggedIn", code: "unauthorized" };
  }

  // Owner check
  const { data: playthrough, error: ptErr } = await supabase
    .from("playthroughs")
    .select("id, user_id, thinking_mode_enabled")
    .eq("id", playthroughId)
    .single();
  if (ptErr || !playthrough) {
    return { ok: false, errorCode: "play.playthroughNotFound", code: "not_found" };
  }
  if (playthrough.user_id !== user.id) {
    return { ok: false, errorCode: "play.playthroughNotOwner", code: "forbidden" };
  }

  // No-op early exit (same state · skip DB roundtrip)
  if ((playthrough as { thinking_mode_enabled?: boolean }).thinking_mode_enabled === enabled) {
    return { ok: true, enabled };
  }

  // Write · authenticated client (owner check via RLS · no tier gate)
  const { error: updErr } = await supabase
    .from("playthroughs")
    .update({ thinking_mode_enabled: enabled })
    .eq("id", playthroughId);
  if (updErr) {
    console.error("[setThinkingMode] update failed:", updErr.message);
    return { ok: false, errorCode: "play.saveFailed", code: "db_error" };
  }

  // No revalidatePath (instant toggle · optimistic client state · turn route
  // reads thinking_mode_enabled fresh next turn). Avoids full-page reload.
  return { ok: true, enabled };
}

/**
 * Undo the last exchange so the player can REDO the turn.
 *
 * 2026-06-03 (founder ask): "add a button for redo the turn". The client calls
 * this, then re-submits the returned `lastUserText` through the normal turn
 * endpoint → a fresh generation (charged like any turn). Keeping redo as
 * "undo + resend" leaves the turn-generation path untouched.
 *
 * What it does:
 *  - auth + owner check.
 *  - Deletes every turn from the most recent USER turn onward (that user turn +
 *    its AI reply, incl. any failed rows). turns is append-only — no client
 *    DELETE policy (Migration 0002 → select+insert only) — so the delete runs
 *    via service-role AFTER the ownership check. Child rows (turn embeddings,
 *    NPC inner thoughts) cascade on turns delete.
 *  - Resets playthroughs.turn_count to the freed base index (acquire_next_turn_pair
 *    re-allocates it) + restores current_state from the user turn's state_before
 *    snapshot (Migration 0058). Missing snapshot (pre-0058 / fallback turn) →
 *    state restore skipped (soft) so redo still works.
 *
 * Note: derived memory (summaries / lorebook) from the discarded turn is NOT
 * reverted — only the canonical current_state. Acceptable for a single redo.
 */
export async function undoLastTurn(
  playthroughId: string,
): Promise<{ ok: boolean; lastUserText?: string; error?: string }> {
  if (!playthroughId || typeof playthroughId !== "string") {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // Ownership check (RLS also scopes this to the owner).
  const { data: pt, error: ptErr } = await supabase
    .from("playthroughs")
    .select("id, user_id")
    .eq("id", playthroughId)
    .single();
  if (ptErr || !pt) return { ok: false, error: "not_found" };
  if (pt.user_id !== user.id) return { ok: false, error: "forbidden" };

  // Most recent turns (desc) → latest USER turn + its pre-turn snapshot.
  const { data: turns, error: turnsErr } = await supabase
    .from("turns")
    .select("turn_index, role, text, state_before")
    .eq("playthrough_id", playthroughId)
    .order("turn_index", { ascending: false })
    .limit(10);
  if (turnsErr) {
    console.error("[undoLastTurn] turns read failed:", turnsErr.message);
    return { ok: false, error: "read_failed" };
  }
  const lastUser = (turns ?? []).find((t) => t.role === "user");
  if (!lastUser) return { ok: false, error: "no_user_turn" };

  const lastUserText = lastUser.text as string;
  const restoreState =
    (lastUser as { state_before?: unknown }).state_before ?? null;

  const service = createServiceRoleClient();

  // Delete the whole last exchange (user turn + everything after it).
  const { error: delErr } = await service
    .from("turns")
    .delete()
    .eq("playthrough_id", playthroughId)
    .gte("turn_index", lastUser.turn_index);
  if (delErr) {
    console.error("[undoLastTurn] delete failed:", delErr.message);
    return { ok: false, error: "delete_failed" };
  }

  // Reset turn_count to the freed base index; restore pre-turn state if we have
  // the snapshot (else leave current_state as-is · soft).
  const update: Record<string, unknown> = { turn_count: lastUser.turn_index };
  if (restoreState != null && typeof restoreState === "object") {
    update.current_state = restoreState;
  }

  // Consistency v3: if the running digest covered into the now-deleted range,
  // clamp running_summary_through back so the next compact re-folds the freed
  // turns (else the digest stalls / "remembers" an undone turn). Guarded read —
  // skip silently if the column doesn't exist yet (migration 0060 not applied).
  {
    const { data: rs, error: rsErr } = await supabase
      .from("playthroughs")
      .select("running_summary_through")
      .eq("id", playthroughId)
      .single();
    const currentThrough = rsErr
      ? null
      : ((rs as { running_summary_through?: number } | null)?.running_summary_through ?? 0);
    if (currentThrough !== null && currentThrough > lastUser.turn_index) {
      update.running_summary_through = lastUser.turn_index;
    }
  }
  const { error: updErr } = await service
    .from("playthroughs")
    .update(update)
    .eq("id", playthroughId);
  if (updErr) {
    console.error("[undoLastTurn] playthrough reset failed:", updErr.message);
    return { ok: false, error: "reset_failed" };
  }

  return { ok: true, lastUserText };
}
