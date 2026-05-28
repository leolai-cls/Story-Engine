import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveLocale } from "@/lib/auth/safe-next";

/**
 * Locale-aware fallback strings (Session 16 audit MED-06 fix).
 * Was hardcoded 繁中 — leaked Cantonese to EN / zh-Hans users.
 */
const FALLBACKS = {
  en: { storyTitle: "Story", protagonist: "Protagonist" },
  "zh-Hant": { storyTitle: "故事", protagonist: "主角" },
  "zh-Hans": { storyTitle: "故事", protagonist: "主角" },
} as const;

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
  const locale = resolveLocale({
    next: null,
    cookieLocale: _req.cookies.get("NEXT_LOCALE")?.value ?? null,
    acceptLanguage: _req.headers.get("accept-language"),
  });
  const fb = FALLBACKS[locale];
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

  const [summariesResult, lorebookResult, innerThoughtsResult] = await Promise.all([
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
    // Session 14 · NPC L3 inner thoughts (Storyteller-tier feature surface)
    // RLS filters to caller's own playthroughs · empty array if L3 never used
    // Join story_characters to get NPC name for display
    supabase
      .from("npc_inner_thoughts")
      .select(
        "id, character_id, turn_index, inner_thought, intent, created_at, story_characters(name)",
      )
      .eq("playthrough_id", playthroughId)
      .order("turn_index", { ascending: false })
      .limit(50),
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

  // Session 14 · group NPC inner thoughts by character_name for UI display
  type InnerThought = {
    id: string;
    turnIndex: number;
    innerThought: string;
    intent: string;
    createdAt: string;
  };
  type RawInnerRow = {
    id: string;
    character_id: string;
    turn_index: number;
    inner_thought: string;
    intent: string;
    created_at: string;
    story_characters: { name: string } | { name: string }[] | null;
  };
  const npcInnerVoices: Record<string, InnerThought[]> = {};
  for (const row of (innerThoughtsResult.data as RawInnerRow[] | null) ?? []) {
    const charJoin = row.story_characters;
    const charName = Array.isArray(charJoin)
      ? charJoin[0]?.name
      : charJoin?.name;
    if (!charName) continue;
    if (!npcInnerVoices[charName]) npcInnerVoices[charName] = [];
    npcInnerVoices[charName].push({
      id: row.id,
      turnIndex: row.turn_index,
      innerThought: row.inner_thought,
      intent: row.intent,
      createdAt: row.created_at,
    });
  }

  return NextResponse.json({
    playthroughId,
    storyId: pt.story_id,
    storyTitle: storyMeta?.title ?? fb.storyTitle,
    protagonist: pt.character_name ?? fb.protagonist,
    turn: pt.turn_count ?? 0,
    summaries,
    lorebook,
    /* Session 14 · NPC L3 inner thoughts (Storyteller tier feature)
     * Empty object when L3 never used on this playthrough (free/adventurer
     * users · or Storyteller users who haven't opted in). UI handles empty
     * state with explainer card. */
    npcInnerVoices,
    /* Active memory (current-turn RAG retrieve) is NOT exposed here yet —
     * needs a separate turn_log table to record what was retrieved per turn.
     * For now, Memory Journal UI shows summaries + lorebook + npcInnerVoices.
     * Active Memory tab can render an empty/explainer state until backend
     * adds `turns.retrieved_memory_ids[]` column (Phase 7+ backlog). */
  });
}
