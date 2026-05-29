import { NextResponse, type NextRequest, after } from "next/server";
import { streamText } from "ai";
import { getProviderModel } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
// Migration 0018 (Phase 2 memory lockdown) — memory table mutation
// revoked from authenticated. Server-side writers (embed / summarizer /
// lorebook) use service-role client which bypasses RLS. User SELECT on
// own memory still works via the user-auth `supabase` client.
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
import { callNpcAgentsParallel } from "@/lib/ai/npc-agents";
import { npcAgentToNarratorBlock, NPC_L3_CREDITS_PER_NPC } from "@/schemas/npc-agent";
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
import {
  retrieveMemory,
  refineLorebookByHints,
  rebuildContextString,
} from "@/lib/ai/memory/retriever";
import { maybeRunSummarization } from "@/lib/ai/memory/summarizer";
import { runLorebookExtraction } from "@/lib/ai/memory/lorebook";
import { embedTextSafe } from "@/lib/ai/embed";
// ─── Phase 3 credits ─────────────────────────────────────────────────────
import {
  chargeCredits,
  computeCredits,
  computeTurnCredits,
  estimateTurnCredits,
  userTierAllowsModel,
} from "@/lib/billing/credits";
// ─── Phase 5 Wave 2 moderation (W1-MOD-H-03 audit fix) ──────────────────
import { ModerationConfigError, moderateText, verdictToCode } from "@/lib/moderation/openai-moderation";
// ─── Phase 6 non-money function: adult mode gate ────────────────────────
import { MODELS, tierForModel, recentTurnsLimitForTier } from "@/lib/ai/models";

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

/**
 * Recent turns window — ADR-022 simplified: standard=12 · pro=12.
 * MAX initial query limit kept at 20 for query-time simplicity · trimmed
 * to actual per-tier limit after fetching.
 */
const MAX_RECENT_TURN_LIMIT = 20;

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
  // Wave 2 i18n cycle-3 fix (2026-05-28): error code only · client localizes.
  const lastAt = lastTurnAt.get(playthroughId) ?? 0;
  if (Date.now() - lastAt < TURN_COOLDOWN_MS) {
    return NextResponse.json(
      { error: "rate_limited" },
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
      // Wave 2 fix CRIT-A: include npc_l3_enabled · was missing → L3 path dead
      // 2026-05-29: include thinking_mode_enabled (founder deep-thinking toggle · Migration 0046)
      "id, user_id, story_id, character_name, current_state, llm_model, turn_count, npc_l3_enabled, thinking_mode_enabled",
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
    // Wave 2 i18n cycle-3 fix (2026-05-28): drop hardcoded 繁中 `message`.
    // play-client already renders body via play.errors.modelTierBody using
    // currentTier + modelId. Server only sends data + error code.
    return NextResponse.json(
      {
        error: "model_tier_required",
        currentTier: tierCheck.tier,
        modelId: playthroughModel,
        reason: tierCheck.reason,
      },
      { status: 403 },
    );
  }

  // Phase 6 non-money function — adult mode gate (CLAUDE.md hard rule #5
  // LLM isolation). Two enforcement layers:
  //   (a) NSFW model gate: allows_nsfw=true model + !adult_mode_enabled → 403
  //   (b) Adult story gate (P6-MED-01 audit fix): story.content_rating='adult'
  //       + !adult_mode_enabled → 403 (applied after story load below).
  //
  // P6P2-COST-M-01 audit fix (2nd cycle): merged the previous separate reads
  // of `adult_mode_enabled` + `credit_balance` (via getBalanceAndCheck) into
  // ONE profile read. Saves ~30-50ms PG roundtrip on every turn for every
  // user. Inlined getBalanceAndCheck's fail-open semantics (error or null →
  // assume sufficient, let atomic RPC at end-of-turn be source of truth).
  const modelEntry = MODELS[playthroughModel];
  // Wave 2 fix HIGH-04: pre-charge estimate accounts for L3 add-on when flag
  // is on. Conservative projection assumes 3 active NPCs (max · founder Q2).
  // If actual turn fires fewer NPCs, charge will be less than estimate.
  // Underestimate would cause post-stream charge to fail with insufficient
  // credits → "free turn" + reconciliation debt. Better to over-estimate.
  const expectedL3Agents = ((pt as { npc_l3_enabled?: boolean }).npc_l3_enabled === true) ? 3 : 0;
  const estimatedTurnCost = estimateTurnCredits(playthroughModel, expectedL3Agents);

  const { data: profileGate, error: profileGateErr } = await supabase
    .from("profiles")
    .select("adult_mode_enabled, credit_balance")
    .eq("id", user.id)
    .single();
  if (profileGateErr) {
    console.warn(
      `[turn] profile gate read fail-open: ${profileGateErr.message}`,
    );
  }
  const userAdultMode = profileGate?.adult_mode_enabled === true;
  // Session 16 audit HIGH-04: was using -1 as fail-open sentinel which
  // could leak into UI / logs. Now use null + boolean sufficient.
  const balance =
    typeof profileGate?.credit_balance === "number"
      ? profileGate.credit_balance
      : null;
  const sufficient = balance === null ? true : balance >= estimatedTurnCost;

  // W4 fix · 2026-05-28 (ADR-022 follow-up): drop model-level allows_nsfw gate.
  // 之前邏輯: model.allows_nsfw=true + !adult_mode → 403. 但 ADR-022 之後
  // GLM-5.1 同時做 (a) Standard pool SFW model 出 fiction · (b) cross-tier
  // NSFW model (when adult mode opted in). `allows_nsfw=true` 變咗代表
  // "呢個 model 識做 NSFW" 唔係 "呢個 model 只可以做 NSFW".
  // 真正 NSFW gate 喺 story.content_rating='adult' check 度做 (下面).
  void modelEntry;

  if (!sufficient) {
    // Wave 2 i18n cycle-3 fix (2026-05-28): drop hardcoded 繁中 `message`.
    // Client renders body via play.errors.insufficientCreditsBody using
    // currentBalance + estimatedCost (already on the response).
    return NextResponse.json(
      {
        error: "insufficient_credits",
        // Session 16 HIGH-04: balance is null only on fail-open (sufficient=true)
        // so this branch always has a real number — coalesce to 0 for type safety.
        currentBalance: balance ?? 0,
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

  // P6-MED-01 audit fix — adult-rated story gate (CLAUDE.md hard rule #5).
  // Scenario: user created adult-rated story with adult mode ON · later
  // disabled adult mode. Without this gate, the user can keep playing on
  // Anthropic Sonnet with story.content_rating='adult' moderation thresholds
  // (which are more permissive on sexual category) → NSFW intent reaches a
  // direct provider that mustn't see it. Block here · client localizes body.
  if (story.content_rating === "adult" && !userAdultMode) {
    // Wave 2 i18n cycle-3 fix (2026-05-28): error code · play-client renders
    // adultModeRequiredBody{Story} per user locale.
    return NextResponse.json(
      {
        error: "adult_mode_required",
        reason: "adult_story",
      },
      { status: 403 },
    );
  }

  // 3.6 Wave 2.5 W2-PERF-M-06: parallelize moderation with character /
  // char-state / recent-turn fetches. Moderation only needs story.content_rating
  // (already in hand). The 3 DB queries only need playthroughId / story_id.
  // Previously serialized — moderation latency (~500ms-2s) blocked 3 independent
  // SELECTs. Now they all run together; we process the verdict after settle.
  //
  // W1-MOD-H-03 + CLAUDE.md hard rule #6 still hold: action moderation happens
  // BEFORE any Director / Narrator call (those come later in the pipeline).
  // failClosed:true ensures transient API errors block.
  const moderationPromise = moderateText(
    action,
    (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
    { failClosed: true },
  )
    .then((verdict) => ({ ok: true as const, verdict }))
    .catch((e: unknown) => ({ ok: false as const, error: e }));

  const [moderationResult, charactersResult, charStatesResult, recentTurnsResult] = await Promise.all([
    moderationPromise,
    supabase.from("story_characters").select("*").eq("story_id", pt.story_id),
    supabase
      .from("playthrough_character_states")
      .select("*")
      .eq("playthrough_id", playthroughId),
    supabase
      .from("turns")
      .select("role, text, turn_index")
      .eq("playthrough_id", playthroughId)
      .order("turn_index", { ascending: false })
      .limit(MAX_RECENT_TURN_LIMIT),
  ]);

  // Handle moderation verdict / error before continuing into the LLM pipeline
  // Wave 2 i18n cycle-3 fix (2026-05-28): drop hardcoded 繁中 `message`.
  // play-client renders body via play.errors.moderationConfigBody.
  if (!moderationResult.ok) {
    const err = moderationResult.error;
    if (err instanceof ModerationConfigError) {
      console.error("[turn] moderation config error:", err.message);
      return NextResponse.json(
        { error: "moderation_misconfigured" },
        { status: 503 },
      );
    }
    console.error("[turn] moderation threw unexpected:", err);
    return NextResponse.json(
      { error: "moderation_failed" },
      { status: 503 },
    );
  }
  if (!moderationResult.verdict.allowed) {
    console.warn(
      `[turn] moderation blocked action on pt ${playthroughId} user ${user.id}: ${moderationResult.verdict.categories.join(", ")}`,
    );
    // Session 16 PM Review #2 (C-01 follow-up sweep): was returning
    // verdict.reason (繁中-only). Now return stable code · client maps
    // via errors.moderation.* catalog.
    return NextResponse.json(
      { error: "action_blocked", code: verdictToCode(moderationResult.verdict.categories) },
      { status: 400 },
    );
  }

  const characters = charactersResult.data;
  const charStates = charStatesResult.data;
  const recentTurns = recentTurnsResult.data;

  // PHASE 1 (P1.7) — tier-aware recent turns window.
  // Fetched up to MAX_RECENT_TURN_LIMIT (20) · trim to tier-specific size:
  //   standard=8 · pro=12 · pro-max=20 · adult=12
  // Cheaper tiers save tokens · long-term memory (RAG + summaries) compensates.
  const tierForThisPlay = tierForModel(pt.llm_model);
  const tierTurnLimit = recentTurnsLimitForTier(tierForThisPlay);
  const recentTurnsTrimmed = (recentTurns ?? []).slice(0, tierTurnLimit);
  if (recentTurns && recentTurns.length > tierTurnLimit) {
    console.log(
      `[turn] trim recent turns ${recentTurns.length} → ${tierTurnLimit} for tier=${tierForThisPlay}`,
    );
  }

  // Reverse to chronological
  const turnsChronological = recentTurnsTrimmed.reverse();

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
        // Phase 1 — Migration 0024 NPC Level 2 dynamic state
        dynamic_state:
          (cs?.dynamic_state as Record<string, unknown> | null | undefined) ?? undefined,
        character_id: c.id,
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
  // Wave 1 audit C-03 fix (2026-05-27): pass story language so LTM block
  // headers + anti-quote preamble render in the story's language. Without
  // this, EN / zh-Hans stories got a 200-char Cantonese system block + 繁中
  // section headers every turn.
  const storyLanguage = (story.story_bible?.hard_locked?.language ?? "zh-Hant") as
    | "zh-Hant"
    | "zh-Hans"
    | "en";
  const memory = await retrieveMemory({
    supabase,
    playthroughId,
    userAction: action,
    recentTurns: turnsChronological.map((t) => ({
      role: t.role as "user" | "ai",
      text: t.text,
      turn_index: t.turn_index,
    })),
    language: storyLanguage,
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
  // Phase 1 — MemPalace memory hints + NPC Level 2 dynamic state
  // (persistence wired in P1.4 · for now log + structurally available)
  let directorMemoryHints: { rooms_to_load: string[]; wings_to_load: string[] } = {
    rooms_to_load: [],
    wings_to_load: [],
  };
  let directorNpcUpdates: Array<{
    character_name: string;
    emotional_shift: "positive" | "neutral" | "negative";
    current_goal: string;
    current_mood: string;
    topic_focus: string;
  }> = [];
  let directorSceneBoundary = false; // Phase 1 — Director marks scene-end
  // AUDIT FIX F-03 (Wave 2): track Director failure for ops/audit visibility ·
  // persisted into turns.director_verdict so postmortems can distinguish
  // "Director said allow" from "Director failed, defaulted to allow"
  let directorFailed = false;
  try {
    const directorResult = await callDirector(ctx, action);
    verdict = directorResult.verdict;
    directorUsage = directorResult.usage;
    directorMemoryHints = directorResult.memoryHints;
    directorNpcUpdates = directorResult.npcUpdates;
    directorSceneBoundary = directorResult.sceneBoundary;
    console.log(
      `[turn] Director verdict: ${verdict.verdict} — ${verdict.reasoning.slice(0, 80)} ` +
      `(in=${directorUsage.inputTokens ?? "?"} cached=${directorUsage.cachedInputTokens ?? "?"} out=${directorUsage.outputTokens ?? "?"})`,
    );
    if (directorMemoryHints.rooms_to_load.length > 0 || directorMemoryHints.wings_to_load.length > 0) {
      console.log(
        `[turn] Director memory hints: rooms=[${directorMemoryHints.rooms_to_load.join(",")}] wings=[${directorMemoryHints.wings_to_load.join(",")}]`,
      );
    }
    if (directorNpcUpdates.length > 0) {
      console.log(
        `[turn] Director NPC updates: ${directorNpcUpdates.map((u) => `${u.character_name}(${u.emotional_shift}/${u.current_mood})`).join(", ")}`,
      );
    }
  } catch (e) {
    console.warn("[turn] Director failed, falling back to allow:", e instanceof Error ? e.message : e);
    verdict = {
      verdict: "allow" as const,
      reasoning: "Director call failed; defaulting to allow.",
    };
    directorFailed = true; // AUDIT FIX F-03 · ops visibility for fallback path
  }

  // 4.2 PHASE 1 — NPC Level 2 dynamic state apply (in-memory)
  // Director emitted npc_updates · refresh ctx.characters[].dynamic_state so
  // Narrator's prompt sees the updated mood / goal / focus / trajectory.
  // Persistence to DB happens in after() block (non-blocking · Migration 0024
  // apply_npc_dynamic_state RPC). If RPC missing, in-memory update still
  // benefits THIS turn's Narrator quality.
  //
  // AUDIT FIX F-06 (Wave 2): SKIP npc_updates when verdict=reject. If Director
  // rejected the action, the NPC didn't actually accept it — applying
  // npc_updates would bake the rejected reality into NPC state. Also closes
  // a narrative-integrity attack vector (player social-engineers Director
  // into emitting npc_updates that violate red_lines while verdict says
  // "reject" · CLAUDE.md hard rule #5).
  const shouldApplyNpcUpdates =
    directorNpcUpdates.length > 0 && verdict.verdict !== "reject";
  if (verdict.verdict === "reject" && directorNpcUpdates.length > 0) {
    console.log(
      `[turn] skipping ${directorNpcUpdates.length} npc_updates (verdict=reject · narrative-integrity guard)`,
    );
    directorNpcUpdates = []; // also clear so after() block doesn't persist
  }
  if (shouldApplyNpcUpdates) {
    for (const upd of directorNpcUpdates) {
      const ch = ctx.characters.find(
        (c) => c.card.name.trim().toLowerCase() === upd.character_name.trim().toLowerCase(),
      );
      if (!ch) continue; // Director hallucinated an NPC name · skip silently
      const prev = (ch.dynamic_state ?? {}) as Record<string, unknown>;
      type TrajectoryEntry = {
        shift: "positive" | "neutral" | "negative";
        turn: number;
        mood: string;
      };
      const isValidShift = (s: unknown): s is TrajectoryEntry["shift"] =>
        s === "positive" || s === "neutral" || s === "negative";
      const prevTrajectoryRaw = Array.isArray(prev.emotional_trajectory)
        ? (prev.emotional_trajectory as Array<{ shift?: unknown; turn?: unknown; mood?: unknown }>)
        : [];
      const prevTrajectory: TrajectoryEntry[] = prevTrajectoryRaw
        .filter(
          (t): t is TrajectoryEntry =>
            isValidShift(t.shift) &&
            typeof t.turn === "number" &&
            typeof t.mood === "string",
        );
      const newTrajectory: TrajectoryEntry[] = [
        ...prevTrajectory,
        { shift: upd.emotional_shift, turn: pt.turn_count + 1, mood: upd.current_mood },
      ].slice(-8); // keep last 8
      ch.dynamic_state = {
        ...prev,
        current_mood: upd.current_mood,
        current_goal: upd.current_goal,
        topic_focus: upd.topic_focus,
        last_emotional_shift: upd.emotional_shift,
        last_updated_turn: pt.turn_count + 1,
        emotional_trajectory: newTrajectory,
      };
    }
  }

  // 4.25 PHASE 1 — MemPalace selective retrieval refinement
  // If Director provided memory_hints AND we have a queryEmbedding from
  // first-pass retrieval · re-fetch lorebook with hint-guided RPC + hybrid
  // scoring (semantic + keyword + temporal). Replaces matched lorebook in
  // the Narrator's memory context · no extra embedding call (reuses pass-1
  // embedding) · ~1 RPC + 1 SELECT roundtrip cost.
  const hintsActive =
    directorMemoryHints.rooms_to_load.length > 0 ||
    directorMemoryHints.wings_to_load.length > 0;
  if (hintsActive && memory.queryEmbedding && memory.pgvectorAvailable) {
    try {
      const refinedLorebook = await refineLorebookByHints({
        supabase,
        playthroughId,
        queryEmbedding: memory.queryEmbedding,
        userAction: action,
        hints: directorMemoryHints,
      });
      if (refinedLorebook.length > 0) {
        const newContextString = rebuildContextString({
          alwaysOnLorebook: memory.alwaysOnLorebook,
          matchedLorebook: refinedLorebook,
          summaries: memory.summaries,
          ragTurns: memory.ragTurns,
          // Wave 1 audit C-03 fix: thread story language through refined LTM rebuild.
          language: storyLanguage,
        });
        memory.matchedLorebook = refinedLorebook;
        memory.contextString = newContextString;
        ctx.memoryContextString = newContextString;
        console.log(
          `[turn] memory refined by Director hints: ${refinedLorebook.length} lorebook entries (top hybrid ${refinedLorebook[0].hybrid_score?.toFixed(3) ?? "—"})`,
        );
      }
    } catch (e) {
      console.warn(
        "[turn] memory refinement failed, keeping initial retrieval:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // 4.27 PHASE 1.5 — NPC L3 Agents (Storyteller tier exclusive · founder Q1-Q5)
  // ─────────────────────────────────────────────────────────────────────────
  // Parallel Haiku-tier model call per active NPC (max 3) emits POV inner_thought
  // + intent · Narrator integrates via dynamic system prompt block.
  //
  // SKIP conditions (each saves cost · maintains narrative integrity):
  //   (a) playthrough.npc_l3_enabled === false (opt-in flag · founder Q4)
  //   (b) Director verdict === "reject" (F-04 mitigation · NPC pushback IS the scene)
  //   (c) No active NPCs in Director's npc_updates (no one to model)
  //   (d) directorFailed === true (skip extra LLM if Director already faltered)
  //
  // Tier-gate enforced 3-layer (Migration 0028 DB trigger + this server check +
  // UI hides toggle for non-Storyteller). Belt-and-braces.
  let npcL3SuccessfulAgents = 0;
  let npcL3AgentDetails: Array<{
    output: import("@/schemas/npc-agent").NpcAgentOutput | null;
    modelId: string;
    characterId: string;
    error?: string;
  }> = [];
  const playthroughHasL3Flag = (pt as { npc_l3_enabled?: boolean }).npc_l3_enabled === true;

  // Wave 2 fix CRIT-B: server-side tier recheck per turn.
  // Migration 0028 trigger only fires on column WRITE · doesn't downgrade
  // existing true row when user cancels subscription. Belt-and-braces with
  // reusable tierCheck.tier from earlier (line ~158 · already fetched once
  // for model tier gate · zero extra DB call).
  const tierAllowsL3 = tierCheck.tier === "storyteller" || tierCheck.tier === "legend";
  const npcL3EnabledOnPlaythrough = playthroughHasL3Flag && tierAllowsL3;
  if (playthroughHasL3Flag && !tierAllowsL3) {
    console.warn(
      `[turn] NPC L3 flag is on but user tier=${tierCheck.tier} no longer eligible · skipping L3 (consider clearing flag via subscription webhook)`,
    );
  }

  const shouldRunNpcL3 =
    npcL3EnabledOnPlaythrough &&
    !directorFailed &&
    verdict.verdict !== "reject" &&
    directorNpcUpdates.length > 0;

  if (shouldRunNpcL3) {
    try {
      // Map Director's npc_updates → active characters list (exact match by name).
      // Cap at 3 (MAX_NPC_L3_AGENTS_PER_TURN · founder Q2 sign-off).
      const activeCharsForL3 = directorNpcUpdates
        .map((upd) => {
          const ch = ctx.characters.find(
            (c) =>
              c.card.name.trim().toLowerCase() ===
              upd.character_name.trim().toLowerCase(),
          );
          if (!ch || !ch.character_id) return null;
          return {
            id: ch.character_id,
            card: ch.card,
            disposition: ch.disposition,
            permanent_flags: ch.permanent_flags,
            dynamic_state: ch.dynamic_state,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .slice(0, 3);

      if (activeCharsForL3.length > 0) {
        // Wave 2 fix HIGH-06 (Agent A · storyLanguage validation):
        // runtime narrow on storyBible.hard_locked.language · accept only known
        // values · fall back to zh-Hant (primary market) for malformed bibles
        const rawLang = storyBible.hard_locked.language;
        const storyLanguage: "zh-Hant" | "zh-Hans" | "en" =
          rawLang === "zh-Hans" || rawLang === "en" ? rawLang : "zh-Hant";

        // Wave 2 fix HIGH-03 (Agent A · recentTurns memory waste):
        // slice to last 4 BEFORE map · single object pass shared across all
        // 3 parallel agents · was: full array × 3 NPCs duplicated allocation
        const recentTurnsForL3 = turnsChronological.slice(-4).map((t) => ({
          role: t.role as "user" | "ai",
          text: t.text,
        }));

        const batchResult = await callNpcAgentsParallel({
          supabase,
          playthroughId,
          activeCharacters: activeCharsForL3,
          userAction: action,
          verdict,
          recentTurns: recentTurnsForL3,
          storyLanguage,
        });

        npcL3SuccessfulAgents = batchResult.outputs.length;
        npcL3AgentDetails = batchResult.details;

        if (batchResult.outputs.length > 0) {
          const innerStreamsBlock = npcAgentToNarratorBlock(batchResult.outputs);
          ctx.npcInnerStreamsBlock = innerStreamsBlock;
          console.log(
            `[turn] NPC L3 active: ${batchResult.outputs.length} successful agents · creditsCharged=${batchResult.creditsCharged}`,
          );
        }
      }
    } catch (e) {
      // Catch-all · graceful degrade. Narrator still runs without inner streams.
      console.warn(
        "[turn] NPC L3 batch exception, falling back to L2-only narration:",
        e instanceof Error ? e.message : e,
      );
    }
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
      //
      // Migration 0018 lockdown: memory_lockdown REVOKEd user INSERT/UPDATE
      // on memory tables · server-side memory writers now use service-role
      // client. User can READ own memory via Memory Journal · cannot mutate.
      if (memory.queryEmbedding && userTurnId) {
        const turnId = userTurnId;
        const queryVec = memory.queryEmbedding;
        after(async () => {
          try {
            const serviceClient = createServiceRoleClient();
            const { error: embedErr } = await serviceClient
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

  // 2026-05-29 (founder product decision): per-playthrough deep-thinking toggle
  // (Migration 0046). ON → narrator reasons before writing (richer narration ·
  // more credits · slower). Gemini thinking is routed via the thinking-enabled
  // CrazyRouter instance (providers.ts); Anthropic uses extended thinking which
  // requires temperature=1 and max_tokens > thinking budget.
  const thinkingEnabled =
    (pt as { thinking_mode_enabled?: boolean }).thinking_mode_enabled === true;
  const narratorModelId = pt.llm_model ?? "claude-sonnet-4-6";
  const narratorIsAnthropic = MODELS[narratorModelId]?.provider === "anthropic";
  const ANTHROPIC_THINKING_BUDGET = 2000;

  // W5 · 2026-05-28: Gemini safety_settings injection 由 lib/ai/providers.ts
  // 嘅 fetch interceptor 處理 · 唔需要喺呢度傳 providerOptions.
  const result = streamText({
    // AUDIT FIX (AI-H-09): use provider dispatcher so non-Anthropic models
    // route to the right SDK rather than 404'ing against Anthropic.
    model: getProviderModel(narratorModelId, { thinking: thinkingEnabled }),
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
    // Anthropic extended thinking requires temperature=1; otherwise keep 0.85.
    temperature: thinkingEnabled && narratorIsAnthropic ? 1 : 0.85,
    // Deep thinking needs headroom for reasoning + prose (else prose gets cut).
    maxOutputTokens: thinkingEnabled ? 4000 : 1500,
    // Anthropic extended thinking (call-level providerOptions · coexists with
    // the per-message cacheControl above). CrazyRouter models get their thinking
    // behaviour from the provider instance, not here.
    ...(thinkingEnabled && narratorIsAnthropic
      ? {
          providerOptions: {
            anthropic: {
              thinking: { type: "enabled" as const, budgetTokens: ANTHROPIC_THINKING_BUDGET },
            },
          },
        }
      : {}),
    // W4 fix · agent 4-persona retest 2026-05-28 揾到 streamText silent fail:
    // POST /turn 返 200 OK 但 narrator output 從未出 · AI turn row 從未 insert ·
    // credit charge 從未 trigger. Root cause 推斷係 OpenRouter Gemini chat
    // completion 出錯 (model_id 唔啱 · tools schema 不兼容 · or rate limit).
    // 加 onError 等錯誤 surface 入 Vercel runtime log + Sentry · 同時記錄
    // provider / model / message-count 等 diagnostic.
    onError: async (event) => {
      const err = event.error;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[turn] streamText FAILED for pt ${playthroughId} model=${pt.llm_model}: ${msg}`,
      );
      // Sentry capture if available · non-fatal best effort
      try {
        const Sentry = await import("@sentry/nextjs").catch(() => null);
        if (Sentry) {
          Sentry.captureException(err, {
            tags: { route: "turn", model: pt.llm_model ?? "default" },
            extra: { playthroughId, userId: user.id },
          });
        }
      } catch {
        // ignore
      }
    },
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

        // Phase 1.5/2 polish (M-02) — NPC name fuzzy match.
        // Narrator may refer to NPCs by short form ("阿明") while DB has full
        // name ("陳家明") or vice versa. Lookup ladder:
        //   1. Exact match (cheapest · most calls hit here)
        //   2. NFKC + lowercase trim normalization (handles 全形 / spaces)
        //   3. Substring match either direction (narrator name ∈ db OR db ∈ narrator)
        //   4. Unresolved → log telemetry warning, skip
        // Logged warnings let us see drift between Narrator output and DB
        // schema over time (CLAUDE.md hard rule #8: path-format drift visibility).
        const dbCharacters = characters ?? [];
        const normalizeName = (s: string) =>
          s.normalize("NFKC").trim().toLowerCase();
        const charByExact = new Map(dbCharacters.map((c) => [c.name, c]));
        const charByNormalized = new Map(
          dbCharacters.map((c) => [normalizeName(c.name), c]),
        );

        function resolveCharacter(
          narratorName: string,
        ): (typeof dbCharacters)[number] | null {
          // 1. Exact match
          const exact = charByExact.get(narratorName);
          if (exact) return exact;
          // 2. Normalized match
          const norm = normalizeName(narratorName);
          const normalized = charByNormalized.get(norm);
          if (normalized) return normalized;
          // 3. Substring match (bidirectional · abstain on ambiguity).
          //    P1.5P-LOGIC-M-01 audit fix: previously `norm.length >= 1`
          //    matched single CJK char like "家" → wrong NPC silently picked
          //    (first match wins). Now: require >=2 chars + collect all
          //    candidates · if >1 match → abstain (return null) + log
          //    AMBIGUOUS · only single-candidate fuzzy match commits.
          if (norm.length >= 2) {
            const candidates = dbCharacters.filter((c) => {
              const dbNorm = normalizeName(c.name);
              return dbNorm.includes(norm) || norm.includes(dbNorm);
            });
            if (candidates.length === 1) {
              return candidates[0];
            }
            if (candidates.length > 1) {
              console.warn(
                `[turn] NPC AMBIGUOUS fuzzy match for "${narratorName}" — candidates [${candidates.map((c) => c.name).join(", ")}] · abstaining (no update applied)`,
              );
            }
          }
          return null;
        }

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
          const dbChar = resolveCharacter(change.character_name);
          if (!dbChar) {
            console.warn(
              `[turn] Narrator referenced unknown NPC "${change.character_name}" — no fuzzy match in [${dbCharacters.map((c) => c.name).join(", ")}] · skipped`,
            );
            continue;
          }
          if (dbChar.name !== change.character_name) {
            console.log(
              `[turn] NPC fuzzy-matched "${change.character_name}" → "${dbChar.name}"`,
            );
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
          const dbChar = resolveCharacter(flagOp.character_name);
          if (!dbChar) {
            console.warn(
              `[turn] Narrator tried to set flag on unknown NPC "${flagOp.character_name}" — no fuzzy match in [${dbCharacters.map((c) => c.name).join(", ")}] · skipped`,
            );
            continue;
          }
          if (dbChar.name !== flagOp.character_name) {
            console.log(
              `[turn] NPC fuzzy-matched (flag) "${flagOp.character_name}" → "${dbChar.name}"`,
            );
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
        // Apply this turn's disposition changes to the in-memory map (DB is async).
        // M-02 fuzzy match: resolve narrator name → canonical DB name before lookup.
        for (const change of dispositionChanges) {
          const dbChar = resolveCharacter(change.character_name);
          if (!dbChar) continue;
          const cur = updatedCharStates.get(dbChar.name);
          if (!cur) continue;
          const newValue = Math.max(
            -100,
            Math.min(100, (cur.disposition[change.axis] ?? 0) + change.delta),
          );
          cur.disposition = { ...cur.disposition, [change.axis]: newValue };
        }
        // Add this turn's flags
        for (const flagOp of permanentFlags) {
          const dbChar = resolveCharacter(flagOp.character_name);
          if (!dbChar) continue;
          const cur = updatedCharStates.get(dbChar.name);
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
            // AUDIT FIX F-03 (Wave 2): persist Director failure flag inline so
            // postmortems can grep for `director_verdict->>'fallback' = 'true'`
            director_verdict: directorFailed
              ? { ...verdict, fallback: true }
              : verdict,
            skill_check: skillCheckResult,
            // P6-HIGH-01 fix: derive llm_provider from MODELS catalog instead
            // of hardcoded "anthropic". Previously Llama (openrouter) turns
            // were mis-stamped as anthropic — analytics by provider would
            // attribute NSFW traffic to wrong provider, masking CLAUDE.md
            // hard rule #5 compliance audit + breaking Phase 4 billing
            // reconciliation against OpenRouter invoices.
            llm_provider: MODELS[pt.llm_model ?? "claude-sonnet-4-6"]?.provider ?? "anthropic",
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
              // Phase 1.5 · NPC L3 flat-rate add-on (6 credits per successful agent · founder Q3)
              npcL3SuccessfulAgents,
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
                // Phase 1.5 · NPC L3 telemetry for cost analytics + audit trail
                // Wave 2 fix CRIT-C: use NPC_L3_CREDITS_PER_NPC constant
                npc_l3_active_agents: npcL3SuccessfulAgents,
                npc_l3_credits: npcL3SuccessfulAgents * NPC_L3_CREDITS_PER_NPC,
              },
            });
            if (chargeResult.ok) {
              // AUDIT FIX (P3-LOGIC-H-03): credits_charged UPDATE is now
              // folded into apply_credit_charge RPC (atomic with ledger
              // insert). No separate UPDATE needed here.
              console.log(
                `[turn] charged ${totalCredits} credits (narrator=${narratorCredits}, director=${directorCredits}, background_reserve=${backgroundCredits}) — new balance: ${chargeResult.newBalance}`,
              );
              // Session 16 PM Review #2 (P-02): fire first_turn_played event
              // for activation funnel. pt.turn_count was read at request start —
              // if it was 0, this was the user's very first turn ever.
              if (pt.turn_count === 0) {
                try {
                  const { captureServerEvent } = await import("@/lib/posthog/server");
                  await captureServerEvent(user.id, "first_turn_played", {
                    playthrough_id: playthroughId,
                    story_id: pt.story_id,
                    model: playthroughModel,
                    credits_charged: totalCredits,
                  });
                } catch (e) {
                  console.warn("[turn] PostHog first_turn event failed:", e);
                }
              }
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
          //
          // Migration 0018 lockdown: use service-role client for memory writes.
          // User INSERT on memory tables revoked in 0018. createServiceRoleClient
          // bypasses RLS — only ever called from server-side after() blocks.
          after(async () => {
            try {
              const serviceClient = createServiceRoleClient();
              const embed = await embedTextSafe(finalText, "turn:ai");
              if (embed) {
                const { error: embedErr } = await serviceClient
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

          // Rolling summary — Phase 1: scene-aware. Fires on:
          //   (a) Director sceneBoundary=true (scoped scene-level)
          //   (b) standard 20-turn block reached
          //   (c) runaway cap (>25 turns since last summary)
          after(async () => {
            try {
              const serviceClient = createServiceRoleClient();
              await maybeRunSummarization({
                supabase: serviceClient,
                playthroughId,
                currentMaxTurnIndex: aiTurnIndex,
                language: storyBible.hard_locked.language,
                sceneBoundary: directorSceneBoundary,
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
              const serviceClient = createServiceRoleClient();
              await runLorebookExtraction({
                supabase: serviceClient,
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

          // PHASE 1 · Migration 0024 — persist NPC Level 2 dynamic state
          // (mood / goal / focus / emotional_trajectory). Director output was
          // already applied IN-MEMORY pre-Narrator so this turn's prompt sees
          // it · this block just durably writes it for next turn's retrieval.
          //
          // Service-role only (apply_npc_dynamic_state grant restricted ·
          // see Migration 0024 grants section).
          if (directorNpcUpdates.length > 0) {
            after(async () => {
              try {
                const serviceClient = createServiceRoleClient();
                for (const upd of directorNpcUpdates) {
                  const ch = ctx.characters.find(
                    (c) =>
                      c.card.name.trim().toLowerCase() ===
                      upd.character_name.trim().toLowerCase(),
                  );
                  if (!ch?.character_id) continue;
                  const { error: npcErr } = await serviceClient.rpc(
                    "apply_npc_dynamic_state",
                    {
                      p_playthrough_id: playthroughId,
                      p_character_id: ch.character_id,
                      p_current_mood: upd.current_mood,
                      p_current_goal: upd.current_goal,
                      p_topic_focus: upd.topic_focus,
                      p_emotional_shift: upd.emotional_shift,
                      p_turn_index: aiTurnIndex,
                    },
                  );
                  if (npcErr) {
                    const msg = String(npcErr.message ?? "");
                    if (/does not exist|function .* does not exist/i.test(msg)) {
                      console.warn(
                        "[turn] apply_npc_dynamic_state RPC missing — apply Migration 0024",
                      );
                      break; // no point retrying for other NPCs in same loop
                    }
                    console.warn(
                      `[turn] apply_npc_dynamic_state failed for ${upd.character_name}: ${msg}`,
                    );
                  }
                }
              } catch (e) {
                console.warn(
                  "[turn] NPC dynamic state persist exception:",
                  e instanceof Error ? e.message : e,
                );
              }
            });
          }

          // PHASE 1.5 · NPC L3 inner_thoughts persist (Migration 0027)
          // Service-role only RPC · embeds in same block to keep latency off
          // user response · graceful "Migration 0027 missing" handling.
          if (npcL3AgentDetails.length > 0) {
            after(async () => {
              try {
                const serviceClient = createServiceRoleClient();
                for (const detail of npcL3AgentDetails) {
                  if (!detail.output || !detail.characterId) continue;
                  // Embed the inner_thought for future "NPC remembers" feature.
                  // Failure here is non-blocking — RPC accepts null embedding.
                  let embedding: number[] | null = null;
                  try {
                    const result = await embedTextSafe(
                      detail.output.inner_thought,
                      "npc-l3:inner_thought",
                    );
                    embedding = result?.vector ?? null;
                  } catch (e) {
                    console.warn(
                      `[turn] npc-l3 embed failed for ${detail.output.character_name}: ${e instanceof Error ? e.message : e}`,
                    );
                  }
                  const { error: persistErr } = await serviceClient.rpc(
                    "apply_npc_inner_thought",
                    {
                      p_playthrough_id: playthroughId,
                      p_character_id: detail.characterId,
                      p_turn_index: aiTurnIndex,
                      p_inner_thought: detail.output.inner_thought,
                      p_intent: detail.output.intent,
                      p_reasoning_trace: detail.output.reasoning_trace,
                      p_embedding: embedding,
                      p_model_id: detail.modelId,
                    },
                  );
                  if (persistErr) {
                    const msg = String(persistErr.message ?? "");
                    if (/does not exist|function .* does not exist/i.test(msg)) {
                      console.warn(
                        "[turn] apply_npc_inner_thought RPC missing — apply Migration 0027",
                      );
                      break;
                    }
                    console.warn(
                      `[turn] apply_npc_inner_thought failed for ${detail.output.character_name}: ${msg}`,
                    );
                  }
                }
              } catch (e) {
                console.warn(
                  "[turn] NPC L3 inner_thought persist exception:",
                  e instanceof Error ? e.message : e,
                );
              }
            });
          }
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

  // sendReasoning: stream the narrator's thinking to the client (collapsible
  // panel · founder 2026-05-29) only when the user opted into deep thinking.
  // Models that expose reasoning text (GLM / Claude) populate the panel;
  // Gemini usually hides its chain-of-thought (panel may be empty · prose
  // still improves). When thinking is OFF there is no reasoning to send.
  return result.toUIMessageStreamResponse({ sendReasoning: thinkingEnabled });
}
