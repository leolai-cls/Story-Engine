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
import { initialStateFromSchema, StateSchemaShape } from "@/schemas/state-schema";
import { StoryBibleSchema } from "@/schemas/bible";
// ─── Phase 2 memory layer ────────────────────────────────────────────────
import { retrieveMemory } from "@/lib/ai/memory/retriever";
import { maybeRunSummarization } from "@/lib/ai/memory/summarizer";
import { runLorebookExtraction } from "@/lib/ai/memory/lorebook";
import { embedTextSafe } from "@/lib/ai/embed";

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

  // AUDIT FIX (DB-M-03 / DB-H-06): Zod parse at boundary instead of bare cast.
  // A malformed story row (admin edit, schema drift, half-saved creation) used
  // to crash deep inside the AI pipeline with an unhelpful stack. Now: return
  // a 500 with a generic message; details logged server-side.
  const schemaParse = StateSchemaShape.safeParse(story.state_schema);
  const bibleParse = StoryBibleSchema.safeParse(story.story_bible);
  if (!schemaParse.success || !bibleParse.success) {
    console.error(
      "[turn] story validation failed",
      pt.story_id,
      schemaParse.success ? null : schemaParse.error.issues.slice(0, 3),
      bibleParse.success ? null : bibleParse.error.issues.slice(0, 3),
    );
    return NextResponse.json(
      { error: "story_corrupted" },
      { status: 500 },
    );
  }
  const stateSchema = schemaParse.data;
  const storyBible = bibleParse.data;

  const currentState =
    (pt.current_state as Record<string, unknown>) ??
    initialStateFromSchema(stateSchema);

  const ctx: TurnContext = {
    story: {
      title: story.title,
      description: story.description,
      state_schema: stateSchema,
      story_bible: storyBible,
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

  // 3.5 MEMORY RETRIEVAL — Phase 2 / ADR-005
  // Embeds user action + queries 3 RPCs (summaries / RAG turns / matched
  // lorebook) + 1 SELECT (always-on lorebook) in parallel. Adds ~200-300ms
  // before Director call but enables long-term memory for both Director +
  // Narrator. Graceful fallback if pgvector tables missing (returns empty
  // context string — pipeline continues without memory).
  const memory = await retrieveMemory({
    supabase,
    playthroughId,
    userAction: action,
    recentTurns: turnsChronological.map((t) => ({
      role: t.role as "user" | "ai",
      text: t.text,
      turn_index: t.turn_index,
    })),
  });
  ctx.memoryContextString = memory.contextString;
  if (memory.contextString) {
    console.log(
      `[turn] memory retrieved: ${memory.summaries.length} summaries · ${memory.ragTurns.length} RAG · ${memory.alwaysOnLorebook.length} always-on + ${memory.matchedLorebook.length} matched lorebook (pgvector=${memory.pgvectorAvailable})`,
    );
  }

  // 4. DIRECTOR — pre-Narrator审 player action (Phase 1.5.1 / ADR-015)
  // Cheap Haiku call, outputs structured verdict that shapes Narrator behavior.
  // AUDIT FIX (AI-H-02): callDirector returns {verdict, usage} so we can
  // persist Director token spend in the turn ledger.
  let verdict;
  let directorUsage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number } = {};
  try {
    const directorResult = await callDirector(ctx, action);
    verdict = directorResult.verdict;
    directorUsage = directorResult.usage;
    console.log(
      `[turn] Director verdict: ${verdict.verdict} — ${verdict.reasoning.slice(0, 80)} ` +
      `(in=${directorUsage.inputTokens ?? "?"} cached=${directorUsage.cachedInputTokens ?? "?"} out=${directorUsage.outputTokens ?? "?"})`,
    );
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

  // AUDIT FIX (AI-C-03 / DB-H-03): atomic turn pair acquisition via RPC.
  // Falls back to legacy non-atomic read if migration 0003 not yet applied.
  let userTurnIndex: number;
  let aiTurnIndex: number;
  let acquiredViaRpc = false;
  try {
    const { data: pairData, error: pairErr } = await supabase.rpc(
      "acquire_next_turn_pair",
      { p_playthrough_id: playthroughId },
    );
    if (pairErr) throw pairErr;
    if (!pairData || (Array.isArray(pairData) && pairData.length === 0)) {
      throw new Error("acquire_next_turn_pair returned empty");
    }
    const row = Array.isArray(pairData) ? pairData[0] : pairData;
    userTurnIndex = row.user_idx;
    aiTurnIndex = row.ai_idx;
    acquiredViaRpc = true;
  } catch (e) {
    // Legacy path — migration 0003 not yet applied, OR transient failure.
    // Race still possible (UNIQUE constraint on turn_index will catch it).
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[turn] acquire_next_turn_pair RPC failed (apply migration 0003?): ${msg} — falling back to non-atomic`,
    );
    userTurnIndex = pt.turn_count;
    aiTurnIndex = pt.turn_count + 1;
  }

  // AUDIT FIX (AI-H-04): pre-persist user turn BEFORE the LLM stream so the
  // player's input is durable even if the stream aborts (tab close, network
  // drop, etc). Only when RPC path succeeded — fallback path persists both
  // turns at the end to avoid double-insert collisions.
  let userTurnPersisted = false;
  let userTurnId: string | null = null;
  if (acquiredViaRpc) {
    const { data: userTurnRow, error: userInsertErr } = await supabase
      .from("turns")
      .insert({
        playthrough_id: playthroughId,
        turn_index: userTurnIndex,
        role: "user",
        text: action,
      })
      .select("id")
      .single();
    if (userInsertErr || !userTurnRow) {
      console.error(
        "[turn] pre-stream user turn insert failed:",
        userInsertErr,
      );
      // Continue anyway — onFinish will retry. Don't block the user.
    } else {
      userTurnPersisted = true;
      userTurnId = userTurnRow.id;

      // Phase 2: fire-and-forget embed insert for user turn. Reuse the
      // queryEmbedding computed by retriever (avoids a duplicate API call).
      if (memory.queryEmbedding && userTurnId) {
        const turnId = userTurnId;
        const queryVec = memory.queryEmbedding;
        // Don't await — stream starts immediately.
        void (async () => {
          try {
            const { error: embedErr } = await supabase
              .from("turn_embeddings")
              .insert({ turn_id: turnId, embedding: queryVec });
            if (embedErr) {
              const msg = String(embedErr.message ?? "");
              if (!/relation .* does not exist/i.test(msg)) {
                console.warn("[turn] user-turn embed insert failed:", msg);
              }
              // table missing = migration 0004 not applied → silent
            }
          } catch (e) {
            console.warn(
              "[turn] user-turn embed insert exception:",
              e instanceof Error ? e.message : e,
            );
          }
        })();
      }
    }
  }

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

        // AUDIT FIX (AI-C-01 / DB-H-04): group all disposition + flag changes
        // by character_id BEFORE writing — the loop previously rebuilt each
        // upsert from a stale `existingState` snapshot and clobbered other
        // axis updates for the same NPC. Now we accumulate per-character
        // (axis_delta map + new_flags) and do ONE atomic merge per NPC.
        type NpcMerge = {
          characterId: string;
          characterName: string;
          dispositionDelta: Record<string, number>;
          newFlags: string[];
        };
        const mergesByChar = new Map<string, NpcMerge>();

        for (const change of dispositionChanges) {
          const dbChar = charByName.get(change.character_name);
          if (!dbChar) {
            console.warn(
              `[turn] Narrator referenced unknown NPC "${change.character_name}" — skipped`,
            );
            continue;
          }
          let entry = mergesByChar.get(dbChar.id);
          if (!entry) {
            entry = {
              characterId: dbChar.id,
              characterName: dbChar.name,
              dispositionDelta: {},
              newFlags: [],
            };
            mergesByChar.set(dbChar.id, entry);
          }
          // Sum deltas if Narrator emitted multiple changes for same axis.
          entry.dispositionDelta[change.axis] =
            (entry.dispositionDelta[change.axis] ?? 0) + change.delta;
        }
        for (const flagOp of permanentFlags) {
          const dbChar = charByName.get(flagOp.character_name);
          if (!dbChar) {
            console.warn(
              `[turn] Narrator tried to set flag on unknown NPC "${flagOp.character_name}" — skipped`,
            );
            continue;
          }
          let entry = mergesByChar.get(dbChar.id);
          if (!entry) {
            entry = {
              characterId: dbChar.id,
              characterName: dbChar.name,
              dispositionDelta: {},
              newFlags: [],
            };
            mergesByChar.set(dbChar.id, entry);
          }
          if (!entry.newFlags.includes(flagOp.flag)) {
            entry.newFlags.push(flagOp.flag);
          }
          console.log(
            `[turn] Set permanent flag on ${flagOp.character_name}: ${flagOp.flag} — ${flagOp.reason}`,
          );
        }

        // Apply each character's merged changes — try atomic RPC first
        // (migration 0003), fallback to non-atomic upsert if RPC unavailable.
        for (const entry of mergesByChar.values()) {
          let mergedViaRpc = false;
          try {
            const { error: rpcErr } = await supabase.rpc(
              "apply_turn_npc_changes",
              {
                p_playthrough_id: playthroughId,
                p_character_id: entry.characterId,
                p_disposition_delta: entry.dispositionDelta,
                p_new_flags: entry.newFlags,
                p_turn_index: aiTurnIndex,
              },
            );
            if (rpcErr) throw rpcErr;
            mergedViaRpc = true;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(
              `[turn] apply_turn_npc_changes RPC failed (apply migration 0003?): ${msg} — falling back`,
            );
          }

          if (!mergedViaRpc) {
            // Legacy fallback — single upsert that merges from the in-request
            // snapshot. Still loses if two concurrent requests both fall back,
            // but at least each character is one upsert (not two).
            const existingState = charStates?.find(
              (s) => s.character_id === entry.characterId,
            );
            const baselineDisp =
              (existingState?.disposition as Record<string, number>) ?? {};
            const baselineFlags =
              (existingState?.permanent_flags as string[]) ?? [];

            const mergedDisp = { ...baselineDisp };
            for (const [axis, delta] of Object.entries(entry.dispositionDelta)) {
              const cur = mergedDisp[axis] ?? 0;
              mergedDisp[axis] = Math.max(-100, Math.min(100, cur + delta));
            }
            const mergedFlags = [...baselineFlags];
            for (const flag of entry.newFlags) {
              if (!mergedFlags.includes(flag)) mergedFlags.push(flag);
            }
            await supabase
              .from("playthrough_character_states")
              .upsert(
                {
                  playthrough_id: playthroughId,
                  character_id: entry.characterId,
                  disposition: mergedDisp,
                  permanent_flags: mergedFlags,
                  last_interaction_turn: aiTurnIndex,
                },
                { onConflict: "playthrough_id,character_id" },
              );
          }
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

        // Build turn rows. AUDIT FIX (AI-H-04): user turn was pre-persisted
        // before the stream when RPC path was used; only insert it here as a
        // fallback if pre-insert failed or we're on the legacy non-atomic path.
        const userRowsToInsert: Array<Record<string, unknown>> = [];
        if (!userTurnPersisted) {
          userRowsToInsert.push({
            playthrough_id: playthroughId,
            turn_index: userTurnIndex,
            role: "user",
            text: action,
          });
        }
        if (userRowsToInsert.length > 0) {
          await supabase.from("turns").insert(userRowsToInsert);
        }

        // Insert AI turn — capture row id so we can attach an embedding (Phase 2)
        const { data: aiTurnRow } = await supabase
          .from("turns")
          .insert({
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
            // AUDIT FIX (AI-H-02): capture Director token usage too. Without
            // this, Phase 4 billing would undercount by ~30% per turn.
            director_input_tokens: directorUsage.inputTokens,
            director_output_tokens: directorUsage.outputTokens,
          })
          .select("id")
          .single();

        // AUDIT FIX (AI-C-03): RPC `acquire_next_turn_pair` already bumped
        // `turn_count` + `last_played_at` atomically at request start. Only
        // need to update `current_state` here. Legacy fallback path still
        // bumps turn_count + last_played_at non-atomically.
        const playthroughUpdate: Record<string, unknown> = {
          current_state: newState,
        };
        if (!acquiredViaRpc) {
          playthroughUpdate.turn_count = pt.turn_count + 2;
          playthroughUpdate.last_played_at = new Date().toISOString();
        }
        await supabase
          .from("playthroughs")
          .update(playthroughUpdate)
          .eq("id", playthroughId);

        // ─── Phase 2 background: embed AI turn + summarize + lorebook ──────
        // All fire-and-forget. Errors logged but don't break the user-facing
        // pipeline (stream already returned, turns already persisted). Each
        // helper gracefully no-ops if pgvector tables aren't yet provisioned.
        const aiTurnId = aiTurnRow?.id ?? null;
        if (!isRefusal && aiTurnId) {
          void (async () => {
            try {
              const embed = await embedTextSafe(finalText, "turn:ai");
              if (embed) {
                const { error: embedErr } = await supabase
                  .from("turn_embeddings")
                  .insert({ turn_id: aiTurnId, embedding: embed.vector });
                if (embedErr && !/relation .* does not exist/i.test(String(embedErr.message ?? ""))) {
                  console.warn("[turn] ai-turn embed insert failed:", embedErr.message);
                }
              }
            } catch (e) {
              console.warn("[turn] ai-turn embed exception:", e instanceof Error ? e.message : e);
            }
          })();

          // Rolling summary (every 20 turns)
          void maybeRunSummarization({
            supabase,
            playthroughId,
            currentMaxTurnIndex: aiTurnIndex,
          }).catch((e) =>
            console.warn(
              "[turn] summarizer exception:",
              e instanceof Error ? e.message : e,
            ),
          );

          // Lorebook entity extraction
          void runLorebookExtraction({
            supabase,
            playthroughId,
            userAction: action,
            aiNarrative: finalText,
            protagonistName: pt.character_name,
          }).catch((e) =>
            console.warn(
              "[turn] lorebook exception:",
              e instanceof Error ? e.message : e,
            ),
          );
        }
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
