import { setRequestLocale } from "next-intl/server";
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
    redirect(`/${locale}/login?next=/play/${playthroughId}/memory`);
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
  const [{ data: summaries }, { data: lorebookRows }] = await Promise.all([
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

  const turnCount = pt.turn_count ?? 0;
  const protagonist = pt.character_name ?? "主角";
  const storyTitle = storyMeta?.title ?? "故事";

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
    />
  );
}
