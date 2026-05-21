import { NextResponse, type NextRequest } from "next/server";
import { streamText } from "ai";
import { anthropicProvider } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import {
  buildStableSystemPrompt,
  buildDynamicSystemPrompt,
  buildMessages,
  extractStateDelta,
  updateStateTool,
  isLLMRefusal,
  refusalFallbackNarrative,
  type TurnContext,
} from "@/lib/ai/turn-runner";
import { callDirector } from "@/lib/ai/director";
import { verdictToNarratorInstruction } from "@/schemas/director";
import {
  rollSkillCheck,
  skillCheckToNarratorInstruction,
  type SkillCheckResult,
} from "@/lib/ai/skill-check";
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

/**
 * Per-playthrough rate limit. In-memory map — best-effort across single
 * serverless instance. Real production should use Redis / DB-backed lock,
 * but for Phase 1 (low concurrency) in-memory + DB UNIQUE constraint on
 * (playthrough_id, turn_index) covers both UX (debounce) + correctness.
 */
const TURN_COOLDOWN_MS = 1500;
const lastTurnAt = new Map<string, number>();

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

  // 1.5 Rate limit (L-06 fix)
  const lastAt = lastTurnAt.get(playthroughId) ?? 0;
  if (Date.now() - lastAt < TURN_COOLDOWN_MS) {
    return NextResponse.json(
      { error: "請稍等 — 上一個 turn 仲處理緊" },
      { status: 429 },
    );
  }
  lastTurnAt.set(playthroughId, Date.now());

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

  // 4. DIRECTOR — pre-Narrator审 player action (Phase 1.5.1 / ADR-015)
  // Cheap Haiku call, outputs structured verdict that shapes Narrator behavior.
  let verdict;
  try {
    verdict = await callDirector(ctx, action);
    console.log(`[turn] Director verdict: ${verdict.verdict} — ${verdict.reasoning.slice(0, 80)}`);
  } catch (e) {
    console.warn("[turn] Director failed, falling back to allow:", e instanceof Error ? e.message : e);
    verdict = {
      verdict: "allow" as const,
      reasoning: "Director call failed; defaulting to allow.",
    };
  }

  // 4.5 SKILL CHECK — Phase 1.5.2: if Director required a check, roll dice now.
  let skillCheckResult: SkillCheckResult | null = null;
  let directorInstruction: string;
  if (verdict.verdict === "require_skill_check") {
    skillCheckResult = rollSkillCheck({
      state: currentState,
      schema: stateSchema,
      skill_key: verdict.skill_key,
      difficulty: verdict.difficulty,
    });
    console.log(
      `[turn] Skill check: ${verdict.skill_key} d20=${skillCheckResult.d20_roll} total=${skillCheckResult.total} vs ${verdict.difficulty} → ${skillCheckResult.outcome}`,
    );
    directorInstruction = skillCheckToNarratorInstruction(
      skillCheckResult,
      verdict.success_consequence_hint,
      verdict.failure_consequence_hint,
    );
  } else {
    directorInstruction = verdictToNarratorInstruction(verdict);
  }

  // 5. Stream Narrator response with prompt caching + Director instruction
  const stableSystem = buildStableSystemPrompt(ctx);
  const dynamicSystem =
    buildDynamicSystemPrompt(ctx) + "\n\n" + directorInstruction;
  const messages = buildMessages(ctx.recent_turns, action);

  const userTurnIndex = pt.turn_count;
  const aiTurnIndex = pt.turn_count + 1;

  const result = streamText({
    model: anthropicProvider(pt.llm_model ?? "claude-sonnet-4-6"),
    messages: [
      {
        role: "system",
        content: stableSystem,
        // Mark stable system for Anthropic prompt caching — saves ~90% on input cost
        // for repeat turns (bible + characters + rules stay constant per playthrough).
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      {
        role: "system",
        content: dynamicSystem,
      },
      ...messages,
    ],
    tools: { update_state: updateStateTool },
    temperature: 0.85,
    maxOutputTokens: 1500,
    onFinish: async ({ text, toolCalls, usage }) => {
      try {
        // L-08 fix: detect LLM refusal + substitute in-fiction fallback
        const isRefusal = isLLMRefusal(text);
        const finalText = isRefusal ? refusalFallbackNarrative() : text;
        if (isRefusal) {
          console.warn("[turn] LLM refused — replaced with in-fiction fallback. Original:", text.slice(0, 200));
        }

        const delta = extractStateDelta(toolCalls);
        let newState = currentState;
        if (delta && delta.ops.length > 0 && !isRefusal) {
          const applied = applyDelta(currentState, delta, stateSchema);
          newState = applied.state;
          if (applied.skipped.length > 0) {
            console.warn(
              `[turn] ${applied.skipped.length} ops skipped:`,
              applied.skipped.map((s) => `${s.op.op} ${s.op.key}: ${s.reason}`),
            );
          }
        }

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
            text: finalText,
            state_delta: isRefusal ? null : delta,
            director_verdict: verdict,
            skill_check: skillCheckResult,
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
      } finally {
        // Release rate-limit slot a bit earlier than cooldown so user
        // can submit next turn smoothly after stream finishes.
        const newLastAt = Date.now() - TURN_COOLDOWN_MS / 2;
        lastTurnAt.set(playthroughId, newLastAt);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
