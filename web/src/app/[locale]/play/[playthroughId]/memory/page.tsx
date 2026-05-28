import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Lock, Sparkles, BookOpen, NotebookPen, Info, Play, Clock } from "lucide-react";
import { MemoryJournalClient } from "./memory-client";

export const dynamic = "force-dynamic";

/**
 * Memory Journal page — Phase B v1 (Grok dashboard · per-playthrough · read-only).
 *
 * CLAUDE.md hard rules enforced:
 *   #11 Memory per-playthrough · 100% read-only · user CANNOT mutate
 *        (Migration 0018 locks DB mutation · UI surface mirrors that)
 *   #7  Memory Journal must surface 4-layer backend
 *        (recent 20 turn is in narrative stream itself · 3 retrieveable
 *        layers — summaries · lorebook · active RAG — get dedicated tabs)
 *   #18 Similarity floor → empty beats noise
 *        (Active Memory tab can be empty when current turn finds no match)
 *
 * Header reinforces per-playthrough scope:
 *   「你呢次扮演 {protagonist} 嘅記憶」
 *   「{story_title} · TURN {N} · 唯讀 · 只有你睇到 · FORK 多一次係空白」
 */
export default async function MemoryJournalPage({
  params,
}: {
  params: Promise<{ locale: string; playthroughId: string }>;
}) {
  const { locale, playthroughId } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // AUDIT FIX MG-UX-HIGH-01: include locale prefix in `next` so the safe-
    // relative check in login + auth callback returns the user back to the
    // SAME-locale memory page (was dropping locale before, landing on /profile).
    redirect(`/${locale}/login?next=/${locale}/play/${playthroughId}/memory`);
  }

  const { data: pt } = await supabase
    .from("playthroughs")
    .select("id, turn_count, story_id, character_name")
    .eq("id", playthroughId)
    .single();
  if (!pt) notFound();

  // D5 audit fix · Hard rule #2 CSAM reach from Memory Journal in adult mode
  // Adult mode flag pulled from profile · passed to client for footer strip.
  const { data: profile } = await supabase
    .from("profiles")
    .select("adult_mode_enabled")
    .eq("id", user!.id)
    .single();
  const adultModeEnabled = profile?.adult_mode_enabled ?? false;

  // Determine story is adult-rated (CSAM strip only needed when actually in
  // adult content context · per Phase 6 design)
  const { data: storyMeta } = await supabase
    .from("stories")
    .select("title, content_rating")
    .eq("id", pt.story_id)
    .single();
  const showCsam = adultModeEnabled && storyMeta?.content_rating === "adult";

  // Fetch memory data server-side (initial render)
  // Session 14: also fetch NPC L3 inner thoughts (joined with story_characters for name)
  const [
    { data: summaries },
    { data: lorebookRows },
    { data: innerThoughtsRows },
  ] = await Promise.all([
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
    supabase
      .from("npc_inner_thoughts")
      .select(
        "id, character_id, turn_index, inner_thought, intent, created_at, story_characters(name)",
      )
      .eq("playthrough_id", playthroughId)
      .order("turn_index", { ascending: false })
      .limit(50),
  ]);

  // Session 14 · group inner thoughts by NPC name (join with story_characters)
  type InnerThoughtGroup = {
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
  const npcInnerVoices: Record<string, InnerThoughtGroup[]> = {};
  for (const row of (innerThoughtsRows as RawInnerRow[] | null) ?? []) {
    const charJoin = row.story_characters;
    const charName = Array.isArray(charJoin) ? charJoin[0]?.name : charJoin?.name;
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

  // Wave 2 i18n migration (2026-05-27): default protagonist + story title localized.
  const tMem = await getTranslations("memory");
  const turnCount = pt.turn_count ?? 0;
  const protagonist =
    pt.character_name ?? (locale === "en" ? "Protagonist" : "主角");
  const storyTitle = storyMeta?.title ?? tMem("defaultStoryTitle");

  return (
    <MemoryJournalClient
      playthroughId={playthroughId}
      turnCount={turnCount}
      protagonist={protagonist}
      storyTitle={storyTitle}
      locale={locale}
      showCsam={showCsam}
      summaries={(summaries ?? []).map((s) => ({
        id: s.id as string,
        range: s.turn_range as string,
        body: s.summary_text as string,
        writtenAt: s.created_at as string,
      }))}
      lorebook={lorebookRows ?? []}
      npcInnerVoices={npcInnerVoices}
    />
  );
}
