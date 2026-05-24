import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/playthroughs/[id]/memory-journal
 *
 * Returns the user's per-playthrough memory readout for the Memory Journal UI.
 * All 3 surfaceable memory layers (RAG turn embeddings + rolling summaries +
 * lorebook entries) are scoped via RLS to the caller's own playthroughs.
 *
 * Read-only — UI does NOT support editing (CLAUDE.md hard rule #11 ·
 * Migration 0018 lockdown: memory tables INSERT/UPDATE/DELETE revoked from
 * authenticated; SELECT preserved via 3 RLS policies).
 *
 * Schema:
 *   {
 *     playthroughId: string,
 *     turn: number,             // current turn_count
 *     summaries: [{ range: "[1,10)", title?, body, written_at }, ...],
 *     lorebook: {
 *       character: [{ name, description, always_on, mentions, first_seen, ...}],
 *       place: [...],
 *       item: [...],
 *       event: [...],
 *       concept: [...],
 *     },
 *     activeMemoryHint: string | null,  // optional empty-state hint
 *   }
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: playthroughId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Confirm caller owns the playthrough (RLS would 0-row otherwise · explicit
  // early-out for clean 404).
  const { data: pt } = await supabase
    .from("playthroughs")
    .select("id, turn_count, story_id, character_name")
    .eq("id", playthroughId)
    .single();
  if (!pt) {
    return NextResponse.json({ error: "playthrough_not_found" }, { status: 404 });
  }

  const { data: storyMeta } = await supabase
    .from("stories")
    .select("title")
    .eq("id", pt.story_id)
    .single();

  const [summariesResult, lorebookResult] = await Promise.all([
    supabase
      .from("memory_summaries")
      .select("id, turn_range, summary_text, created_at")
      .eq("playthrough_id", playthroughId)
      .order("created_at", { ascending: true }),
    supabase
      .from("lorebook_entries")
      .select(
        "id, entity_type, name, description, keywords, always_on, updated_at, created_at",
      )
      .eq("playthrough_id", playthroughId)
      .order("always_on", { ascending: false })
      .order("updated_at", { ascending: false }),
  ]);

  const summaries = (summariesResult.data ?? []).map((s) => ({
    id: s.id,
    range: s.turn_range as string,
    body: s.summary_text as string,
    writtenAt: s.created_at as string,
  }));

  // Group lorebook by entity_type
  type LoreEntry = {
    id: string;
    name: string;
    description: string;
    always_on: boolean;
    keywords: string[];
    mentions?: number;
    first_seen?: string;
  };
  const lorebook: Record<string, LoreEntry[]> = {
    character: [],
    place: [],
    item: [],
    event: [],
    concept: [],
  };
  for (const row of lorebookResult.data ?? []) {
    const t = row.entity_type as string;
    if (lorebook[t]) {
      lorebook[t].push({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string,
        always_on: row.always_on as boolean,
        keywords: (row.keywords as string[]) ?? [],
        first_seen: row.created_at as string,
      });
    }
  }

  return NextResponse.json({
    playthroughId,
    storyId: pt.story_id,
    storyTitle: storyMeta?.title ?? "故事",
    protagonist: pt.character_name ?? "主角",
    turn: pt.turn_count ?? 0,
    summaries,
    lorebook,
    /* Active memory (current-turn RAG retrieve) is NOT exposed here yet —
     * needs a separate turn_log table to record what was retrieved per turn.
     * For now, Memory Journal UI shows summaries + lorebook only.
     * Active Memory tab can render an empty/explainer state until backend
     * adds `turns.retrieved_memory_ids[]` column (Phase 7+ backlog). */
  });
}
