import { NextResponse, type NextRequest, after } from "next/server";
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
// ─── Phase 3 credits ─────────────────────────────────────────────────────
import {
  chargeCredits,
  computeCredits,
  computeTurnCredits,
  estimateTurnCredits,
  getBalanceAndCheck,
  userTierAllowsModel,
} from "@/lib/billing/credits";
// ─── Phase 5 Wave 2 moderation (W1-MOD-H-03 audit fix) ──────────────────
import { ModerationConfigError, moderateText } from "@/lib/moderation/openai-moderation";

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

  // 3.5 AUDIT FIX (P3-LOGIC-H-02 / P3-SEC-H-02 / P3-SEC-H-03):
  // Tier gate + credit pre-check using the REAL model (not hardcoded Sonnet).
  // Previously pre-check ran before pt was loaded, so it always estimated
  // Sonnet cost (~22 credits). Opus user (5× cost) could pass pre-check at
  // 25 credits balance, stream a turn, then post-charge would fail silently
  // → free turn. Now: load pt first, then estimate using pt.llm_model.
  //
  // Also blocks tier downgrade exploits: a user who upgraded → set Opus
  // → downgraded should NOT keep using Opus. userTierAllowsModel checks
  // both profile.subscription_tier AND active subscription row.
  const playthroughModel = pt.llm_model ?? "claude-sonnet-4-6";
  const tierCheck = await userTierAllowsModel(supabase, user.id, playthroughModel);
  if (!tierCheck.allowed) {
    return NextResponse.json(
      {
        error: "model_tier_required",
        message: `你嘅 tier (${tierCheck.tier}) 唔可以用 ${playthroughModel}。請去 Settings 揀其他 model 或升級。`,
        currentTier: tierCheck.tier,
        modelId: playthroughModel,
        reason: tierCheck.reason,
      },
      { status: 403 },
    );
  }

  const estimatedTurnCost = estimateTurnCredits(playthroughModel);
  const balanceCheck = await getBalanceAndCheck(supabase, {
    userId: user.id,
    estimatedCost: estimatedTurnCost,
  });
  if (!balanceCheck.sufficient) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: `Credit 唔夠（剩 ${balanceCheck.balance}，需要約 ${estimatedTurnCost}）。Top-up 或 upgrade 之後再玩。`,
        currentBalance: balanceCheck.balance,
        estimatedCost: estimatedTurnCost,
      },
      { status: 402 }, // 402 Payment Required
    );
  }

  const { data: story, error: storyErr } = await supabase
    .from("stories")
    .select("title, description, state_schema, story_bible, content_rating")
    .eq("id", pt.story_id)
    .single();
  if (storyErr || !story) {
    return NextResponse.json({ error: "story not found" }, { status: 404 });
  }

  // 3.6 W1-MOD-H-03 (Phase 5 Wave 2 audit fix) — moderate user action input
  // BEFORE Director / Narrator pipeline. CLAUDE.md hard rule #6 covers all
  // user-input surfaces including private playthrough action text — the
  // turn text persists to the turns table even on Narrator refusal, so
  // CSAM / illegal action descriptions need to be blocked at submit time.
  // failClosed:true: transient API errors block (no silent bypass on the
  // hottest input surface).
  try {
    const verdict = await moderateText(
      action,
      (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
      { failClosed: true },
    );
    if (!verdict.allowed) {
      console.warn(
        `[turn] moderation blocked action on pt ${playthroughId} user ${user.id}: ${verdict.categories.join(", ")}`,
      );
      return NextResponse.json(
        { error: "action_blocked", message: verdict.reason },
        { status: 400 },
      );
    }
  } catch (e) {
    if (e instanceof ModerationConfigError) {
      console.error("[turn] moderation config error:", e.message);
      return NextResponse.json(
        { error: "moderation_misconfigured", message: "內容審核系統設定問題，請稍後再試。" },
        { status: 503 },
      );
    }
    throw e;
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
    // AUDIT FIX (P2-UX-L-14): include top similarity scores per source so
    // we can tune thresholds from real playthrough data + diagnose
    // "AI doesn't remember" complaints.
    const topSim = (arr: Array<{ similarity: number }>) =>
      arr.length ? arr[0].similarity.toFixed(3) : "—";
    console.log(
      `[turn] memory retrieved: ${memory.summaries.length} summaries (top sim ${topSim(memory.summaries)}) · ${memory.ragTurns.length} RAG (top sim ${topSim(memory.ragTurns)}) · ${memory.alwaysOnLorebook.length} always-on + ${memory.matchedLorebook.length} matched lorebook (top sim ${topSim(memory.matchedLorebook.map((l) => ({ similarity: l.similarity ?? 0 })))}) (pgvector=${memory.pgvectorAvailable})`,
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

      // AUDIT FIX (P2-PERF-C-02 / P2-LOGIC-H-08): use Next.js `after()` so
      // the runtime keeps the lambda alive past response completion until
      // this background work finishes. Previously `void (async () => ...)`
      // got killed when Vercel terminated the lambda → user turn embeddings
      // were silently never persisted. Same fix applied to AI turn embed +
      // summarizer + lorebook in onFinish below.
      //
      // Reuse the queryEmbedding computed by retriever (avoids dup API call).
      if (memory.queryEmbedding && userTurnId) {
        const turnId = userTurnId;
        const queryVec = memory.queryEmbedding;
        after(async () => {
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
        });
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

        // ─── Phase 3: charge credits for full turn cost ───────────────────
        // AUDIT FIX (P3-COST-H-05 / LOGIC-M-07): now charges FULL turn cost
        // including background work (lorebook + summarizer + embed) as a
        // reserve, not just Narrator + Director. Previously claimed 2×
        // markup was effectively 1.62× because ~$0.004/turn of background
        // work was unbilled. Reserve uses ESTIMATED tokens (actual variance
        // absorbed by 2× markup buffer) so charge happens upfront before
        // after() blocks fire; no need to coordinate post-fire charges.
        //
        // On refusal: Narrator/lorebook/summarizer/embed skipped — only
        // Director cost charged (one Haiku call already happened).
        const aiTurnIdForCharge = aiTurnRow?.id ?? null;
        if (aiTurnIdForCharge) {
          const directorCredits = computeCredits({
            modelId: "claude-haiku-4-5",
            inputTokens: directorUsage.inputTokens ?? 0,
            outputTokens: directorUsage.outputTokens ?? 0,
            cachedInputTokens: directorUsage.cachedInputTokens,
          });
          let narratorCredits = 0;
          let backgroundCredits = 0;
          if (!isRefusal) {
            const fullTurnCredits = computeTurnCredits({
              narrator: {
                modelId: pt.llm_model ?? "claude-sonnet-4-6",
                inputTokens: usage?.inputTokens ?? 0,
                outputTokens: usage?.outputTokens ?? 0,
                cachedInputTokens: usage?.cachedInputTokens,
              },
              director: {
                modelId: "claude-haiku-4-5",
                inputTokens: directorUsage.inputTokens ?? 0,
                outputTokens: directorUsage.outputTokens ?? 0,
                cachedInputTokens: directorUsage.cachedInputTokens,
              },
              // Estimated background work — these run via after() shortly
              // after charge. Variance absorbed by 2× markup buffer.
              lorebook: { inputTokens: 2000, outputTokens: 500 },
              // Summarizer is amortized 1/20 turns (~250 in, 40 out per rollup)
              summarizer: { inputTokens: 13, outputTokens: 2 },
              embedTokens: 400,
            });
            // Back out narrator-only for the metadata log
            narratorCredits = computeCredits({
              modelId: pt.llm_model ?? "claude-sonnet-4-6",
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
              cachedInputTokens: usage?.cachedInputTokens,
            });
            backgroundCredits = fullTurnCredits - narratorCredits - directorCredits;
          }
          const totalCredits = narratorCredits + directorCredits + backgroundCredits;
          if (totalCredits > 0) {
            const chargeResult = await chargeCredits(supabase, {
              userId: user.id,
              delta: -totalCredits,
              reason: "turn_charge",
              refType: "turn",
              refId: aiTurnIdForCharge,
              metadata: {
                narrator_credits: narratorCredits,
                director_credits: directorCredits,
                background_credits: backgroundCredits, // P3-COST-H-05 reserve
                narrator_model: pt.llm_model ?? "claude-sonnet-4-6",
                refusal: isRefusal,
              },
            });
            if (chargeResult.ok) {
              // AUDIT FIX (P3-LOGIC-H-03): credits_charged UPDATE is now
              // folded into apply_credit_charge RPC (atomic with ledger
              // insert). No separate UPDATE needed here.
              console.log(
                `[turn] charged ${totalCredits} credits (narrator=${narratorCredits}, director=${directorCredits}, background_reserve=${backgroundCredits}) — new balance: ${chargeResult.newBalance}`,
              );
            } else if (chargeResult.error === "insufficient_credits") {
              // Should NOT happen because pre-check passed, but defensive log.
              // Phase 3 Wave 2 will add refund saga; for now flag for admin review.
              console.error(
                `[turn] post-charge insufficient_credits (current=${chargeResult.currentBalance}, needed=${chargeResult.needed}) — turn already streamed; flagging for refund/review`,
              );
            } else if (chargeResult.error === "forbidden") {
              // Should be impossible because RPC checks auth.uid() = p_user_id
              // and we pass user.id from getUser() — but log loudly if it ever fires.
              console.error("[turn] charge forbidden — RPC auth guard rejected:", chargeResult.message);
            } else if (chargeResult.error === "profile_not_found") {
              console.error("[turn] charge failed — profile not found:", chargeResult.message);
            } else {
              console.error("[turn] credit charge failed:", chargeResult.message);
            }
          }
        }

        // ─── Phase 2 background: embed AI turn + summarize + lorebook ──────
        // AUDIT FIX (P2-PERF-C-02): use `after()` from next/server so Vercel
        // keeps the lambda alive past response completion. Previously the
        // `void (async () => ...)` pattern got killed when stream finished →
        // summarizer's 30s Haiku call, AI-turn embed, and lorebook extraction
        // all silently failed in production. Phase 2 tiers 2/3/4 were
        // effectively non-functional. `after()` is the documented Next.js 15+
        // primitive for "run after response, keep lambda alive".
        //
        // Each helper still wraps its own error handling so one failing
        // doesn't cascade-kill the others.
        const aiTurnId = aiTurnRow?.id ?? null;
        if (!isRefusal && aiTurnId) {
          // Embed AI turn → turn_embeddings (RAG tier 3)
          after(async () => {
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
          });

          // Rolling summary (every 20 turns) — locale-aware (P2-UX-H-09)
          after(async () => {
            try {
              await maybeRunSummarization({
                supabase,
                playthroughId,
                currentMaxTurnIndex: aiTurnIndex,
                language: storyBible.hard_locked.language,
              });
            } catch (e) {
              console.warn(
                "[turn] summarizer exception:",
                e instanceof Error ? e.message : e,
              );
            }
          });

          // Lorebook entity extraction — locale-aware (P2-UX-H-09)
          after(async () => {
            try {
              await runLorebookExtraction({
                supabase,
                playthroughId,
                userAction: action,
                aiNarrative: finalText,
                protagonistName: pt.character_name,
                language: storyBible.hard_locked.language,
              });
            } catch (e) {
              console.warn(
                "[turn] lorebook exception:",
                e instanceof Error ? e.message : e,
              );
            }
          });
        } else if (isRefusal && userTurnId && memory.queryEmbedding) {
          // AUDIT FIX (P2-UX-H-07): on refusal, the AI fallback narrative
          // shouldn't enter RAG (canned text has no signal). But the user
          // action turn SHOULD still be retrievable — that way Director on
          // future turns can see "player has tried this kind of action
          // before" and either explain in-fiction or unlock a softened path,
          // instead of mechanically refusing the same thing again.
          //
          // User turn was already embedded above. Nothing extra needed.
          // Documenting the intent here so future maintainers don't add
          // "skip user embed on refusal" by mistake.
          console.log(
            `[turn] refusal — AI fallback not embedded (intent); user turn ${userTurnId} embedding retained`,
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
