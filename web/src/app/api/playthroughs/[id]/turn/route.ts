import { NextResponse, type NextRequest } from "next/server";
import { streamText } from "ai";
import { getProviderModel } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import {
  buildStableSystemPrompt,
  buildDynamicSystemPrompt,
  buildMessages,
  extractStateDelta,
  extractDispositionChanges,
  extractPermanentFlags,
  updateStateTool,
  updateCharacterDispositionTool,
  setPermanentFlagTool,
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
import { deriveCurrentAct, type ArcContext } from "@/lib/ai/arc-dsl";
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
    // AUDIT FIX (AI-H-09): use provider dispatcher so non-Anthropic models
    // (OpenRouter for adult mode, etc.) route to the right SDK rather than
    // 404'ing against Anthropic.
    model: getProviderModel(pt.llm_model ?? "claude-sonnet-4-6"),
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
    tools: {
      update_state: updateStateTool,
      update_character_disposition: updateCharacterDispositionTool,
      set_permanent_flag: setPermanentFlagTool,
    },
    temperature: 0.85,
    maxOutputTokens: 1500,
    onFinish: async ({ text, toolCalls, usage }) => {
      try {
        // L-08 fix: detect LLM refusal + substitute in-fiction fallback.
        // AUDIT FIX (AI-M-07): pass story language so fallback matches locale
        // instead of forcing 繁中 on 簡中 / EN stories.
        const isRefusal = isLLMRefusal(text);
        const storyLanguage = ctx.story.story_bible.hard_locked.language;
        const finalText = isRefusal
          ? refusalFallbackNarrative(storyLanguage)
          : text;
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

        // ─── Phase 1.5.3: extract Narrator's disposition + flag tool calls ───
        const dispositionChanges = isRefusal
          ? []
          : extractDispositionChanges(toolCalls);
        const permanentFlags = isRefusal ? [] : extractPermanentFlags(toolCalls);

        // Build lookup of NPCs by name to map character_name → character_id.
        const charByName = new Map(
          (characters ?? []).map((c) => [c.name, c]),
        );

        // Apply disposition changes — clamp ±100 + upsert per (playthrough, character)
        for (const change of dispositionChanges) {
          const dbChar = charByName.get(change.character_name);
          if (!dbChar) {
            console.warn(
              `[turn] Narrator referenced unknown NPC "${change.character_name}" in disposition update — skipped`,
            );
            continue;
          }
          const existingState = charStates?.find(
            (s) => s.character_id === dbChar.id,
          );
          const currentDisposition =
            (existingState?.disposition as Record<string, number>) ?? {};
          const currentValue = currentDisposition[change.axis] ?? 0;
          const newValue = Math.max(
            -100,
            Math.min(100, currentValue + change.delta),
          );
          const newDisposition = {
            ...currentDisposition,
            [change.axis]: newValue,
          };

          await supabase
            .from("playthrough_character_states")
            .upsert(
              {
                playthrough_id: playthroughId,
                character_id: dbChar.id,
                disposition: newDisposition,
                permanent_flags: existingState?.permanent_flags ?? [],
                last_interaction_turn: aiTurnIndex,
              },
              { onConflict: "playthrough_id,character_id" },
            );
        }

        // Apply permanent flags — append to character's flag array
        for (const flagOp of permanentFlags) {
          const dbChar = charByName.get(flagOp.character_name);
          if (!dbChar) {
            console.warn(
              `[turn] Narrator tried to set flag on unknown NPC "${flagOp.character_name}" — skipped`,
            );
            continue;
          }
          const existingState = charStates?.find(
            (s) => s.character_id === dbChar.id,
          );
          const existingFlags = (existingState?.permanent_flags as string[]) ?? [];
          if (existingFlags.includes(flagOp.flag)) {
            continue; // already set
          }
          await supabase
            .from("playthrough_character_states")
            .upsert(
              {
                playthrough_id: playthroughId,
                character_id: dbChar.id,
                disposition: existingState?.disposition ?? {},
                permanent_flags: [...existingFlags, flagOp.flag],
                last_interaction_turn: aiTurnIndex,
              },
              { onConflict: "playthrough_id,character_id" },
            );
          console.log(
            `[turn] Set permanent flag on ${flagOp.character_name}: ${flagOp.flag} — ${flagOp.reason}`,
          );
        }

        // ─── Arc transition check (Phase 1.5.3) ────────────────────────────
        // Build ArcContext from new state + updated character dispositions
        const updatedCharStates = new Map<
          string,
          { disposition: Record<string, number>; permanent_flags: string[] }
        >();
        for (const c of characters ?? []) {
          const cs = charStates?.find((s) => s.character_id === c.id);
          updatedCharStates.set(c.name, {
            disposition: (cs?.disposition as Record<string, number>) ?? {},
            permanent_flags: (cs?.permanent_flags as string[]) ?? [],
          });
        }
        // Apply this turn's disposition changes to the in-memory map (DB is async)
        for (const change of dispositionChanges) {
          const cur = updatedCharStates.get(change.character_name);
          if (!cur) continue;
          const newValue = Math.max(
            -100,
            Math.min(100, (cur.disposition[change.axis] ?? 0) + change.delta),
          );
          cur.disposition = { ...cur.disposition, [change.axis]: newValue };
        }
        // Add this turn's flags
        for (const flagOp of permanentFlags) {
          const cur = updatedCharStates.get(flagOp.character_name);
          if (!cur) continue;
          if (!cur.permanent_flags.includes(flagOp.flag)) {
            cur.permanent_flags = [...cur.permanent_flags, flagOp.flag];
          }
        }
        const arcCtx: ArcContext = {
          state: newState,
          characters: updatedCharStates,
        };
        const persistedAct =
          typeof (newState as Record<string, unknown>).__act === "number"
            ? ((newState as Record<string, unknown>).__act as number)
            : 1;
        const arcResult = deriveCurrentAct({
          story_arc: ctx.story.story_bible.soft_guided.story_arc,
          ctx: arcCtx,
          persisted_act: persistedAct,
        });
        if (arcResult.act > persistedAct) {
          (newState as Record<string, unknown>).__act = arcResult.act;
          console.log(
            `[turn] Story advanced to Act ${arcResult.act}: ${arcResult.just_advanced_to?.name ?? ""}`,
          );
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
      }
      // AUDIT FIX (AI-H-05): NO finally-block timestamp clobber. The previous
      // implementation set `lastTurnAt = Date.now() - COOLDOWN/2` which could
      // move the cooldown BACKWARD if onFinish completed after a concurrent
      // turn had already updated the slot, letting subsequent requests bypass
      // the cooldown. The entry-side `lastTurnAt.set(...)` is sufficient —
      // streams take 10-30s so the 1.5s cooldown has long expired by then.
    },
  });

  return result.toUIMessageStreamResponse();
}
