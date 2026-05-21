import { setRequestLocale, getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayClient } from "./play-client";
import type { StateSchema } from "@/schemas/state-schema";

export default async function PlayPage({
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
    const l = await getLocale();
    redirect({ href: "/login", locale: l });
    throw new Error("unreachable");
  }

  // Load playthrough + story + turns (initial render)
  const { data: pt } = await supabase
    .from("playthroughs")
    .select("id, user_id, story_id, character_name, current_state, turn_count")
    .eq("id", playthroughId)
    .single();

  if (!pt || pt.user_id !== user.id) {
    notFound();
  }

  const { data: story } = await supabase
    .from("stories")
    .select("title, description, state_schema")
    .eq("id", pt.story_id)
    .single();

  if (!story) notFound();

  const { data: turns } = await supabase
    .from("turns")
    .select("turn_index, role, text")
    .eq("playthrough_id", playthroughId)
    .order("turn_index", { ascending: true });

  return (
    <PlayClient
      playthroughId={playthroughId}
      storyTitle={story.title}
      storyDescription={story.description}
      stateSchema={story.state_schema as StateSchema}
      initialState={(pt.current_state as Record<string, unknown>) ?? {}}
      initialTurns={(turns ?? []).map((t) => ({
        role: t.role as "user" | "ai",
        text: t.text,
        index: t.turn_index,
      }))}
      characterName={pt.character_name ?? "主角"}
    />
  );
}
