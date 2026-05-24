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
    .select("turn_index, role, text, skill_check, director_verdict")
    .eq("playthrough_id", playthroughId)
    .order("turn_index", { ascending: true });

  // Fetch NPCs + per-playthrough disposition (Hard rule #6: 4-axis surface).
  // 4-axis stored in playthrough_character_states.disposition jsonb.
  const [{ data: characters }, { data: charStates }] = await Promise.all([
    supabase
      .from("story_characters")
      .select("id, name, role")
      .eq("story_id", pt.story_id),
    supabase
      .from("playthrough_character_states")
      .select("character_id, disposition")
      .eq("playthrough_id", playthroughId),
  ]);

  // Merge characters + states into a single array for PlayClient
  type DispJson = { trust?: number; romance?: number; respect?: number; fear?: number } | null;
  const stateMap = new Map<string, DispJson>(
    (charStates ?? []).map((s) => [s.character_id as string, s.disposition as DispJson]),
  );
  const npcs = (characters ?? []).map((c) => {
    const d = stateMap.get(c.id as string) ?? {};
    return {
      name: c.name as string,
      role: (c.role as string | null) ?? null,
      axes: {
        trust: typeof d?.trust === "number" ? d!.trust! : 0,
        romance: typeof d?.romance === "number" ? d!.romance! : 0,
        respect: typeof d?.respect === "number" ? d!.respect! : 0,
        fear: typeof d?.fear === "number" ? d!.fear! : 0,
      },
    };
  });

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
        skillCheck: t.skill_check as Turn["skillCheck"] | undefined,
        directorVerdict: t.director_verdict as Turn["directorVerdict"] | undefined,
      }))}
      characterName={pt.character_name ?? "主角"}
      npcs={npcs}
    />
  );
}

// Local alias so the cast above doesn't need to import the full type from client
type Turn = import("./play-client").Turn;
