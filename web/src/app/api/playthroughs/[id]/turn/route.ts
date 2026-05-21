import { NextResponse, type NextRequest } from "next/server";
import { streamText } from "ai";
import { anthropicProvider } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  buildMessages,
  extractStateDelta,
  updateStateTool,
  type TurnContext,
} from "@/lib/ai/turn-runner";
import { applyDelta } from "@/schemas/state-delta";
import { initialStateFromSchema, type StateSchema } from "@/schemas/state-schema";
import type { StoryBible } from "@/schemas/bible";

/**
 * POST /api/playthroughs/[id]/turn
 *
 * Body: { action: string }
 *
 * Streams narrative response back to client (Vercel AI SDK data stream
 * format). On finish, persists user turn + AI turn + applies state delta.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const RECENT_TURN_LIMIT = 20; // Phase 2 will swap to recent + RAG + summaries

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playthroughId } = await params;
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let action: string;
  try {
    const body = await req.json();
    action = String(body.action ?? "").trim();
    if (!action || action.length > 2000) {
      return NextResponse.json(
        { error: "action must be 1-2000 chars" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // 3. Load playthrough + story + characters + recent turns
  const { data: pt, error: ptErr } = await supabase
    .from("playthroughs")
    .select(
      "id, user_id, story_id, character_name, current_state, llm_model, turn_count",
    )
    .eq("id", playthroughId)
    .single();

  if (ptErr || !pt) {
    return NextResponse.json({ error: "playthrough not found" }, { status: 404 });
  }
  if (pt.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: story, error: storyErr } = await supabase
    .from("stories")
    .select("title, description, state_schema, story_bible")
    .eq("id", pt.story_id)
    .single();
  if (storyErr || !story) {
    return NextResponse.json({ error: "story not found" }, { status: 404 });
  }

  const { data: characters } = await supabase
    .from("story_characters")
    .select("*")
    .eq("story_id", pt.story_id);

  const { data: charStates } = await supabase
    .from("playthrough_character_states")
    .select("*")
    .eq("playthrough_id", playthroughId);

  const { data: recentTurns } = await supabase
    .from("turns")
    .select("role, text, turn_index")
    .eq("playthrough_id", playthroughId)
    .order("turn_index", { ascending: false })
    .limit(RECENT_TURN_LIMIT);

  // Reverse to chronological
  const turnsChronological = (recentTurns ?? []).reverse();

  const stateSchema = story.state_schema as StateSchema;
  const currentState =
    (pt.current_state as Record<string, unknown>) ??
    initialStateFromSchema(stateSchema);

  const ctx: TurnContext = {
    story: {
      title: story.title,
      description: story.description,
      state_schema: stateSchema,
      story_bible: story.story_bible as StoryBible,
    },
    characters: (characters ?? []).map((c) => {
      const cs = charStates?.find((s) => s.character_id === c.id);
      return {
        card: {
          version: "story-engine/character/v1" as const,
          name: c.name,
          role: c.role ?? undefined,
          personality_traits: c.personality_traits ?? [],
          backstory: c.backstory ?? "",
          core_motivation: c.core_motivation ?? "",
          red_lines: c.red_lines ?? [],
          voice_sample: c.voice_sample ?? "",
          arc_description: c.arc_description ?? "",
          default_disposition_toward_protagonist:
            (c.default_disposition_toward_protagonist as
              | "hostile"
              | "wary"
              | "neutral"
              | "friendly"
              | "warm"
              | "devoted") ?? "neutral",
        },
        disposition: (cs?.disposition as Record<string, number>) ?? { trust: 0 },
        permanent_flags: (cs?.permanent_flags as string[]) ?? [],
      };
    }),
    current_state: currentState,
    recent_turns: turnsChronological.map((t) => ({
      role: t.role as "user" | "ai",
      text: t.text,
    })),
    playthrough_character_name: pt.character_name,
  };

  // 4. Stream Narrator response
  const systemPrompt = buildSystemPrompt(ctx);
  const messages = buildMessages(ctx.recent_turns, action);

  const userTurnIndex = pt.turn_count;
  const aiTurnIndex = pt.turn_count + 1;

  const result = streamText({
    model: anthropicProvider(pt.llm_model ?? "claude-sonnet-4-6"),
    system: systemPrompt,
    messages,
    tools: { update_state: updateStateTool },
    temperature: 0.85,
    maxOutputTokens: 1500,
    onFinish: async ({ text, toolCalls, usage }) => {
      try {
        const delta = extractStateDelta(toolCalls);
        let newState = currentState;
        if (delta && delta.ops.length > 0) {
          const result = applyDelta(currentState, delta, stateSchema);
          newState = result.state;
          if (result.skipped.length > 0) {
            console.warn(
              `[turn] ${result.skipped.length} ops skipped:`,
              result.skipped.map((s) => `${s.op.op} ${s.op.key}: ${s.reason}`),
            );
          }
        }

        // Persist user turn + AI turn atomically (best-effort — Supabase
        // doesn't have transactions via JS client, but we use unique
        // (playthrough_id, turn_index) to prevent duplicates).
        await supabase.from("turns").insert([
          {
            playthrough_id: playthroughId,
            turn_index: userTurnIndex,
            role: "user",
            text: action,
          },
          {
            playthrough_id: playthroughId,
            turn_index: aiTurnIndex,
            role: "ai",
            text,
            state_delta: delta,
            llm_provider: "anthropic",
            model: pt.llm_model ?? "claude-sonnet-4-6",
            input_tokens: usage?.inputTokens,
            output_tokens: usage?.outputTokens,
          },
        ]);

        await supabase
          .from("playthroughs")
          .update({
            current_state: newState,
            turn_count: pt.turn_count + 2,
            last_played_at: new Date().toISOString(),
          })
          .eq("id", playthroughId);
      } catch (e) {
        console.error("[turn] onFinish persistence failed", e);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
