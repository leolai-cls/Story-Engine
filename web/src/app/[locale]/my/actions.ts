"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";

/**
 * Hard-delete a playthrough the current user owns.
 *
 * 2026-06-03 (founder ask): "need button to delete story". A playthrough is a
 * player's game instance — deleting it removes the run, not the authored story.
 *
 * Safety:
 *  - Auth required · explicit `user_id = user.id` filter (belt-and-braces on top
 *    of RLS `playthroughs_own_delete` · Migration 0002 · using auth.uid()=user_id).
 *  - ALL children FK `references playthroughs(id) on delete cascade` (turns +
 *    embeddings, summaries, lorebook, graph edges, NPC inner thoughts, scene
 *    images, character experiences/beliefs) → one delete cleans everything.
 *  - `playthroughs_decrement_play_count` DELETE trigger (Migration 0010) keeps
 *    the story's play_count correct.
 *  - Destructive + irreversible → the client gates this behind a confirm step.
 *
 * Returns a small result object; the client refreshes the list on success.
 */
export async function deletePlaythrough(
  playthroughId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!playthroughId || typeof playthroughId !== "string") {
    return { ok: false, error: "invalid" };
  }

  const user = await getCachedUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("playthroughs")
    .delete()
    .eq("id", playthroughId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[deletePlaythrough] failed:", error.message);
    return { ok: false, error: "delete_failed" };
  }

  return { ok: true };
}
