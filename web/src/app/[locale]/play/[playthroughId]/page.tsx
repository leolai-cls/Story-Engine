import { setRequestLocale, getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayClient } from "./play-client";
import { StateSchemaShape } from "@/schemas/state-schema";

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

  // AUDIT FIX (DB-M-03 / DB-H-06): validate state_schema at the boundary
  // instead of trusting the DB blob. A bad jsonb row (admin SQL edit, partial
  // creation, schema drift) used to crash deep inside renderers with
  // unhelpful stacks. Now: friendly error if shape is wrong.
  const schemaParse = StateSchemaShape.safeParse(story.state_schema);
  if (!schemaParse.success) {
    console.error(
      "[play] state_schema validation failed for story",
      pt.story_id,
      schemaParse.error.issues.slice(0, 3),
    );
    notFound(); // Friendlier than a stack trace; surfaces as "story not found"
  }

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
      stateSchema={schemaParse.data}
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
