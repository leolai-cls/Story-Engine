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
  extractTurnState,
  type TurnContext,
} from "@/lib/ai/turn-runner";
import { callDirector } from "@/lib/ai/director";
import { verdictToContextNote } from "@/schemas/director";
import { callNpcAgentsParallel } from "@/lib/ai/npc-agents";
import { npcAgentToNarratorBlock, npcAgentsToThinkingBlock, NPC_L3_CREDITS_PER_NPC } from "@/schemas/npc-agent";
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
import {
  writeCharacterExperiences,
  loadCharacterExperiencesBlock,
  SOUL_UPGRADE_THRESHOLD,
} from "@/lib/ai/character/experience-writer";
import {
  parsePendingTensions,
  accumulateTensions,
} from "@/lib/ai/character/sediment";
import {
  parseMentionRoster,
  mergeMentionRoster,
  formatMentionRosterBlock,
} from "@/lib/ai/character/mention-roster";
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
import { ModerationConfigError, moderateText, verdictToCode, checkOutputLegalFloor } from "@/lib/moderation/openai-moderation";
// ─── Phase 6 non-money function: adult mode gate ────────────────────────
import { MODELS, tierForModel, recentTurnsLimitForTier, ADULT_NSFW_MODEL } from "@/lib/ai/models";
import { stripReasoningMarkers } from "@/lib/sanitize-narration";

/**
 * POST /api/playthroughs/[id]/turn
 *
 * Body: { action: string }
 *
 * Streams narrative response back to client (Vercel AI SDK data stream
 * format). On finish, persists user turn + AI turn + applies state delta.
 */

export const runtime = "nodejs";
// 2026-06-01 (founder bug · timeout 真兇): 由 60 bump 到 300。play 頁嘅 server
// action (page.tsx) 早就設 300 · 但呢個 turn route 一直係 60 → Director(4s) +
// memory retrieval + Narrator 加埋撞 60s timeout → Gemini 被砍交白卷 → 觸發
// 「眉頭微皺」fallback。Pro plan 撐到 300。GM 重構 (拆 Director call) 之後整體
// 會快返 · 但 300 ceiling 係安全網。
export const maxDuration = 300;

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
      "id, user_id, story_id, character_name, current_state, llm_model, turn_count, npc_l3_enabled, thinking_mode_enabled, mention_roster",
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
  // 2026-05-29: deep-thinking mode bumps narrator output (reasoning + story
  // text) → reserve more in the pre-charge gate (same over-estimate rationale
  // as L3 above). Defined once here · reused by the streamText block below.
  const thinkingEnabled =
    (pt as { thinking_mode_enabled?: boolean }).thinking_mode_enabled === true;
  // 成人 playthrough 個 narrator 本身就係 Grok (ADULT_NSFW_MODEL) → 由佢推 utility
  // content rating · 令 reserve 按 Grok 計 (背景 lorebook/summarizer/experience 貴啲)。
  // pre-charge gate 喺 story load 之前 · 仲未有準確 content_rating · 用呢個推導 ·
  // 實際扣費 (onFinish computeTurnCredits) 就用準確 story.content_rating。
  // (邊緣 case: 舊 glm-adult playthrough narrator≠Grok → reserve 當 sfw 略低 · 但
  //  實際扣費照準 · 只係 ~0 個舊 playthrough 受影響。)
  const estimateUtilityRating = playthroughModel === ADULT_NSFW_MODEL ? "adult" : "sfw";
  const estimatedTurnCost = estimateTurnCredits(
    playthroughModel,
    expectedL3Agents,
    thinkingEnabled,
    estimateUtilityRating,
  );

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
          // 易變度 · 舊故事 row 冇就 fallback 0.5 (沉澱機制喺 turn route 另外讀 · 呢度
          // 只為滿足 CharacterCard 型別 · 唔入 prompt)。
          volatility: (c.volatility as number | null) ?? 0.5,
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
  // PR2 (ADR-001 · GM 唔做判官): 移除舊 reject-gate。verdict 唔再決定 NPC 反應方向。
  // npc_updates 而家只係**今回合 prep hint** (transitional · decision 12) — Director
  // 預估 NPC 當下心情餵俾 Narrator。canonical NPC 狀態應改由 final narrative / extractor
  // 後處理更新 (follow-up · 見 play-command-fix-plan.md)。reject 唔再 skip / 清空。
  const shouldApplyNpcUpdates = directorNpcUpdates.length > 0;
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
  //   (b) [REMOVED PR2 · decision 10] verdict 唔再 gate NPC L3 (reject 唔再 = NPC 拒絕)
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

  // PR2 (ADR-001 · decision 10): 移除 verdict==="reject" gate — verdict 唔再 gate
  // NPC modeling (reject 唔再代表「NPC 拒絕」· 由 Narrator 按四層自決)。
  const shouldRunNpcL3 =
    npcL3EnabledOnPlaythrough &&
    !directorFailed &&
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
          // adult → NSFW-safe GLM (hard rule #5: no NSFW on Anthropic) · else Haiku
          contentRating: (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
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

  // ─── Character Soul M4 · 讀取角色經歷記憶 (pm/architecture/03 + 04) ───
  // 今回合 active 角色 (directorNpcUpdates) · 用 user-action embedding query 各自
  // 相關經歷 · 組成 block 塞入 Narrator Tier 2。等角色反應基於累積經歷。
  // 重用 memory.queryEmbedding (慳一個 embed)。全 non-fatal · 失敗 = 空 block。
  try {
    if (directorNpcUpdates.length > 0 && memory.queryEmbedding) {
      const activeForRead = directorNpcUpdates
        .map((upd) => {
          const ch = ctx.characters.find(
            (c) =>
              c.card.name.trim().toLowerCase() ===
              upd.character_name.trim().toLowerCase(),
          );
          return ch?.character_id
            ? { character_id: ch.character_id, name: ch.card.name }
            : null;
        })
        .filter((c): c is { character_id: string; name: string } => c !== null);
      ctx.characterExperiencesBlock = await loadCharacterExperiencesBlock({
        supabase,
        playthroughId,
        activeCharacters: activeForRead,
        queryEmbedding: memory.queryEmbedding,
      });
    }
  } catch (e) {
    console.warn(
      "[turn] character experience read exception (non-fatal):",
      e instanceof Error ? e.message : e,
    );
  }

  // 4.5 SKILL CHECK — Phase 1.5.2: if Director required a check, roll dice now.
  // 2026-06-01 (ADR-001 · GM 唔做判官 · PR2): 除咗 skill check 外，verdict 唔再推動
  // 敘事。verdictToContextNote 而家:reject→""(Narrator 按四層自決世界點回應·唔再有
  // GM pushback 劇本)·allow_with_constraint→中性世界代價提示(無 NPC 劇本)。skill check
  // 仍保留(骰已擲·結果要 narrate)。平台法律底線改由 onFinish post-hoc 輸出檢查把守。
  const directorLang: "zh-Hant" | "zh-Hans" | "en" =
    storyBible.hard_locked.language === "zh-Hans" ||
    storyBible.hard_locked.language === "en"
      ? storyBible.hard_locked.language
      : "zh-Hant";
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
    directorInstruction = verdictToContextNote(verdict, directorLang);
  }

  // 即興名冊 (角色升級階梯第 0 層 · 防 retcon)：parse 之前回合累積嘅 walk-on 名單 ·
  // 注入 Narrator context (內部 block) 等就算弱 model 都唔會改名 / 否認佢哋存在。
  // 今回合新提到嘅名喺 onFinish 由 extractor 攞返 + merge 入名冊。
  const knownMainNames = ctx.characters.map((c) => c.card.name);
  const currentRoster = parseMentionRoster(
    (pt as { mention_roster?: unknown }).mention_roster,
  );
  ctx.mentionRosterBlock = formatMentionRosterBlock(currentRoster, knownMainNames);

  // 5. Stream Narrator response with prompt caching + Director instruction
  // 2026-06-01: directorInstruction 可能係空 string（allow case · GM 唔加嘢）·
  // 只喺有內容時先 append · 避免多餘空行污染 prompt。
  const stableSystem = buildStableSystemPrompt(ctx);
  const dynamicSystem = directorInstruction.trim()
    ? buildDynamicSystemPrompt(ctx) + "\n\n" + directorInstruction
    : buildDynamicSystemPrompt(ctx);
  const messages = buildMessages(ctx.recent_turns, action, directorLang);

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
  // thinkingEnabled defined once near the pre-charge gate above (reused here).
  const narratorModelId = pt.llm_model ?? "claude-sonnet-4-6";
  const narratorIsAnthropic = MODELS[narratorModelId]?.provider === "anthropic";
  const ANTHROPIC_THINKING_BUDGET = 2000;

  // W5 · 2026-05-28: Gemini safety_settings injection 由 lib/ai/providers.ts
  // 嘅 fetch interceptor 處理 · 唔需要喺呢度傳 providerOptions.
  const result = streamText({
    // AUDIT FIX (AI-H-09): use provider dispatcher so non-Anthropic models
    // route to the right SDK rather than 404'ing against Anthropic.
    // 2026-05-31 (founder · "thinking mode no output" · root cause): only
    // ANTHROPIC narrators get the thinking provider instance. CrazyRouter models
    // (Gemini/GLM/GPT) have thinking force-disabled anyway (providers.ts), and
    // routing Gemini through the thinking instance + the 5000-token bump made the
    // streamText ERROR (0 input/output tokens → empty prose → fallback). For
    // CrazyRouter the narrator gen must stay identical to thinking-OFF (proven to
    // produce prose); the deep-thinking toggle still surfaces GM thinking via the
    // X-Think-Preamble header.
    model: getProviderModel(narratorModelId, { thinking: thinkingEnabled && narratorIsAnthropic }),
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
    // 2026-05-29: NO tools on the Narrator. Gemini/GLM via CrazyRouter often
    // returned finish_reason=tool_calls with EMPTY prose (escaping into the
    // tool instead of writing) → blank turns. Narrator now writes PROSE ONLY;
    // state changes are extracted afterwards by a separate Haiku call
    // (extractTurnState) which does structured output reliably.
    // Anthropic extended thinking forces temperature internally — passing a
    // value makes the SDK strip it + warn every turn (log noise). Omit it on
    // that path; otherwise keep 0.85.
    // 2026-06-01 (方案甲 · 情況 1 自動重試): connection 層失敗（call 唔到 /
    // 500 / rate limit · 喺任何 token stream 出嚟之前發生）由 SDK 自動重試 1 次 ·
    // 玩家完全唔知。明確設 1（SDK default 2）。情況 2（stream 中途死 / 出空白）
    // 唔喺度處理 · 因為文字可能已 stream 咗 · 由 onFinish 送誠實失敗訊號 + 前端 retry 掣。
    maxRetries: 1,
    temperature: thinkingEnabled && narratorIsAnthropic ? undefined : 0.85,
    // 2026-05-29 (founder): loosened from 1500 — output felt too thin. The user
    // pays per token anyway; the cap is just a runaway guard (so one turn can't
    // silently drain a big chunk of a user's credits), not a cost-saving knob.
    // 3000 fits a rich 2-4 paragraph turn; only the Anthropic thinking path gets
    // extra headroom for reasoning tokens. CrazyRouter stays at 3000 (the bump to
    // 5000 was part of what made the Gemini thinking-on narrator error out).
    maxOutputTokens: thinkingEnabled && narratorIsAnthropic ? 5000 : 3000,
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
    onFinish: async ({ text, usage }) => {
      try {
        // L-08 fix: detect LLM refusal + substitute in-fiction fallback.
        // AUDIT FIX (AI-M-07): pass story language so fallback matches locale
        // instead of forcing 繁中 on 簡中 / EN stories.
        // 2026-05-31 (founder · "narrator leaks JSON into the story"): strip a
        // leading ```json {...}``` block the narrator may echo from the state
        // context (Gemini mimicry) — keep only the prose. Defence-in-depth on top
        // of the prompt reformat (turn-runner shows state as plain text now).
        // 2026-06-01: 再 strip Grok reasoning marker leak ("> 🔍 **...**")。喺存
        // turns 之前做 → finalText (落 turns + 餵 summarizer/lorebook/experience 記憶)
        // 永不帶 reasoning 垃圾 (founder/Codex)。治本嘅 provider 壓制待驗證。
        const cleanText = stripReasoningMarkers(
          (text ?? "").replace(/^\s*```(?:json)?\s*\{[\s\S]*?\}\s*```\s*/i, ""),
        );
        // 2026-06-01 (ADR-001 原則 5 · 技術失敗要誠實 · 唔好假扮故事):
        // 失敗判斷 **只睇有冇實質文字出到** · 唔再用 isLLMRefusal 內容分析。
        // 舊邏輯 (isLLMRefusal + 貼 refusalFallbackNarrative 死文字) 係「眉頭微皺」
        // bug 嘅根源 —— 將一個技術失敗 (Gemini 超時交白卷) 扮成故事失敗 (NPC 反應)。
        // 而家：有文字 = 成功 (就算劇情上玩家動作失敗 · 都係成功嘅一回合)。
        // 冇文字 (空白 / 超時被砍 / model 死) = 技術失敗 → 唔存故事 · 唔污染記憶 ·
        // 送誠實失敗訊號俾前端 (前端顯示「整唔到請再試」+ retry 掣 · 似 ChatGPT)。
        // 註: isLLMRefusal / refusalFallbackNarrative 已 deprecated · 唔再 import 用。
        // PR2 (ADR-001 · decision 9/13) · post-hoc 法律底線檢查 (全新 defence-in-depth)。
        // 拆 GM 判官後·成人 Narrator 輸出冇人審。窄 evaluator 只攔 CSAM / 真實武器指引 /
        // 真實自殘 how-to (EXCLUDE 虛構暴力 · 原則 4)。命中 → 當失敗回合 (finalText="" ·
        // failed=true · 唔 extract · 唔 embed/summarize/lorebook) + audit log。un-stream
        // 唔到 (已串流) → 事後清走·唔污染 history/記憶。先成人 only (decision a)。
        const turnContentRating =
          (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw";
        let legalFloorCategories: string[] = [];
        if (cleanText.trim() && turnContentRating === "adult") {
          const floor = await checkOutputLegalFloor(cleanText).catch((e) => {
            console.warn(
              "[turn] post-hoc legal-floor check threw (non-fatal · allowing):",
              e instanceof Error ? e.message : e,
            );
            return { allowed: true as const };
          });
          if (!floor.allowed) {
            legalFloorCategories = floor.categories;
            console.error(
              `[turn] 🚨 POST-HOC LEGAL FLOOR HIT · pt ${playthroughId} user ${user.id} · categories=[${floor.categories.join(", ")}] — turn dropped (failed=true · not embedded · audit)`,
            );
          }
        }
        const legalBlocked = legalFloorCategories.length > 0;

        // 技術失敗 (空白 / 超時 / model 死) OR 法律底線命中 → 當失敗回合處理 (唔存故事文字 · 唔污染記憶)。
        const technicalFailure = !cleanText || !cleanText.trim() || legalBlocked;
        // 失敗時：插入一個 failed=true 標記回合（text 留空 · 唔係假故事文字）。
        // 前端見到 failed 標記 → 顯示「整唔到請再試」+ retry 掣（唔當故事回合）。
        // 失敗回合唔 embed 入記憶（下面 !technicalFailure 已 skip）· 清潔系統 (07)
        // 一句 SQL (WHERE failed=true) 就清走。用標記而唔係完全唔 insert · 係為咗
        // 避免「玩家 turn 已 pre-persist 但冇對應 AI turn」嘅孤兒回合 (reload 會亂)。
        const finalText = technicalFailure ? "" : cleanText;
        if (technicalFailure && !legalBlocked) {
          console.warn(
            `[turn] narrator produced no usable prose (timeout / empty / model error) — saving failed=true turn, client shows retry. Original head:`,
            (text ?? "").slice(0, 200),
          );
        }

        // 2026-05-29: state changes now come from a SEPARATE Haiku extraction
        // of the finished prose (the Narrator no longer uses tools — see the
        // streamText note). Skip on technical failure (nothing really happened).
        // Extractor failure is non-fatal — prose still saves.
        const extraction =
          !technicalFailure
            ? await extractTurnState(ctx, finalText).catch((e) => {
                console.warn(
                  "[turn] state extraction failed (continuing):",
                  e instanceof Error ? e.message : e,
                );
                return null;
              })
            : null;
        const delta = extraction?.delta ?? null;
        const dispositionChanges = extraction?.dispositionChanges ?? [];
        const permanentFlags = extraction?.flags ?? [];
        const extractorUsage = extraction?.usage ?? {};
        // 即興名冊 (防 retcon · 角色升級階梯第 0 層)：今回合 extractor 攞到嘅 walk-on
        // 名 merge 入名冊。currentRoster / knownMainNames / aiTurnIndex 喺 streamText
        // 之前定義 · 由呢個 onFinish closure 捕捉。失敗回合冇 extraction → 空 → 唔變。
        const nextRoster = mergeMentionRoster(
          currentRoster,
          extraction?.mentionedCharacters ?? [],
          aiTurnIndex,
          knownMainNames,
        );

        let newState = currentState;
        if (delta && delta.ops.length > 0) {
          const applied = applyDelta(currentState, delta, stateSchema);
          newState = applied.state;
          if (applied.skipped.length > 0) {
            console.warn(
              `[turn] ${applied.skipped.length} ops skipped:`,
              applied.skipped.map((s) => `${s.op.op} ${s.op.key}: ${s.reason}`),
            );
          }
        }

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
        // 2026-06-01 (Audit B-1 fix): use service-role client. Migration 0051
        // locks pcs server-managed columns against direct authenticated writes
        // (anti console-tamper); legit disposition/flag writes MUST go through
        // service-role so the protect trigger lets them pass.
        const pcsServiceClient = createServiceRoleClient();
        for (const entry of mergesByChar.values()) {
          let mergedViaRpc = false;
          try {
            const { error: rpcErr } = await pcsServiceClient.rpc(
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
            await pcsServiceClient
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
            state_delta: technicalFailure ? null : delta,
            // 2026-06-01 (ADR-001 原則 5): 技術失敗標記。前端見到 → retry 掣 ·
            // 唔當故事 · 清潔系統 (07) 清走 · reload 時 page.tsx filterFailedTurns 隱藏。
            failed: technicalFailure,
            // AUDIT FIX F-03 (Wave 2): persist Director failure flag inline so
            // postmortems can grep for `director_verdict->>'fallback' = 'true'`
            director_verdict: legalBlocked
              ? { ...verdict, post_hoc_legal_block: legalFloorCategories }
              : directorFailed
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
        // 即興名冊：有新 walk-on 名先寫 (merge 純加 · length 增 = 有新名) ·
        // 避免每回合都 update 同一個 jsonb。
        if (nextRoster.length > currentRoster.length) {
          playthroughUpdate.mention_roster = nextRoster;
        }
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
          // 2026-06-01 (Audit HIGH-2 fix): 技術失敗時完全唔扣 credit · 兌現失敗卡
          // 嘅「冇扣 credits」承諾 (hard rule #4)。舊 code 仲扣咗 Director Haiku
          // (~1 credit) → 講大話。失敗 = 我哋食咗個 Director 成本 (cost of doing biz)。
          const directorCredits = technicalFailure
            ? 0
            : computeCredits({
                modelId: "claude-haiku-4-5",
                inputTokens: directorUsage.inputTokens ?? 0,
                outputTokens: directorUsage.outputTokens ?? 0,
                cachedInputTokens: directorUsage.cachedInputTokens,
              });
          let narratorCredits = 0;
          let backgroundCredits = 0;
          if (!technicalFailure) {
            const fullTurnCredits = computeTurnCredits({
              // 成人故事 → lorebook/summarizer/experience 計 Grok 價 (同 runtime
              // 路由經同一 pickUtilityModel · 防 billing drift · PR #62 QC)。
              contentRating: (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
              narrator: {
                modelId: pt.llm_model ?? "claude-sonnet-4-6",
                inputTokens: usage?.inputTokens ?? 0,
                outputTokens: usage?.outputTokens ?? 0,
                cachedInputTokens: usage?.cachedInputTokens,
              },
              director: {
                // Director + state-extractor are both Haiku calls — combine
                // their tokens here so the per-turn charge stays accurate
                // (2026-05-29: extractor is the new prose→state pass).
                modelId: "claude-haiku-4-5",
                inputTokens: (directorUsage.inputTokens ?? 0) + (extractorUsage.inputTokens ?? 0),
                outputTokens: (directorUsage.outputTokens ?? 0) + (extractorUsage.outputTokens ?? 0),
                cachedInputTokens:
                  (directorUsage.cachedInputTokens ?? 0) + (extractorUsage.cachedInputTokens ?? 0),
              },
              // Estimated background work — these run via after() shortly
              // after charge. Variance absorbed by 2× markup buffer.
              lorebook: { inputTokens: 2000, outputTokens: 500 },
              // Summarizer is amortized 1/20 turns (~250 in, 40 out per rollup)
              summarizer: { inputTokens: 13, outputTokens: 2 },
              embedTokens: 400,
              // Character Soul (Audit HIGH-1 fix): 經歷日誌+信念背景 Haiku call ·
              // 只喺今回合有 active 角色 (可能升級) 先 reserve。charge 喺 after()
              // 升級判斷之前 · 所以保守：有 active 角色就 reserve (略高估好過唔收 ·
              // hard rule #20)。估 ~1500 in / 300 out (大部分 turn entries:[] 但 input 照付)。
              experience:
                directorNpcUpdates.length > 0
                  ? { inputTokens: 1500, outputTokens: 300 }
                  : undefined,
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
                refusal: technicalFailure,
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
        if (!technicalFailure && aiTurnId) {
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
                contentRating: (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
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
                contentRating: (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
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

          // ─── Character Soul M1 · 經歷日誌 (pm/architecture/03 + IMPLEMENTATION) ───
          // 今回合 active 角色 (directorNpcUpdates) → bump interaction_count →
          // 揾出已升級 (>= SOUL_UPGRADE_THRESHOLD) 嘅 → 寫經歷日誌 (背景 AI call)。
          // 動態升級 (founder #2): 路人甲 (出場一次) 永遠唔升級 · 慳 call + 慳儲存。
          // 失敗全部 non-fatal · 唔影響已 save 嘅 turn。
          if (directorNpcUpdates.length > 0) {
            after(async () => {
              try {
                const serviceClient = createServiceRoleClient();
                // active 角色 name → character_id
                const activeChars = directorNpcUpdates
                  .map((upd) => {
                    const ch = ctx.characters.find(
                      (c) =>
                        c.card.name.trim().toLowerCase() ===
                        upd.character_name.trim().toLowerCase(),
                    );
                    return ch?.character_id
                      ? { character_id: ch.character_id, name: ch.card.name }
                      : null;
                  })
                  .filter((c): c is { character_id: string; name: string } => c !== null);
                if (activeChars.length === 0) return;

                // Bump interaction_count atomically (Audit HIGH-1 + M-1 fix):
                // bump_interaction_count RPC (0053) 係 insert-or-increment 一個
                // statement · race-safe (跨 instance 並行 turn 唔會 lost update) ·
                // 自動處理 first-row missing · returning 新 count 俾升級 gate。
                const upgraded: Array<{ character_id: string; name: string }> = [];
                for (const ac of activeChars) {
                  const { data: newCount, error: bumpErr } = await serviceClient.rpc(
                    "bump_interaction_count",
                    {
                      p_playthrough_id: playthroughId,
                      p_character_id: ac.character_id,
                    },
                  );
                  if (bumpErr) {
                    console.warn(
                      `[turn] bump_interaction_count failed for ${ac.name}: ${bumpErr.message}`,
                    );
                    continue;
                  }
                  if ((newCount as number) >= SOUL_UPGRADE_THRESHOLD) upgraded.push(ac);
                }

                // 為已升級角色寫經歷日誌 (一個 AI call · bias toward 冇 entry)
                if (upgraded.length > 0) {
                  const expResult = await writeCharacterExperiences({
                    serviceClient,
                    playthroughId,
                    turnIndex: aiTurnIndex,
                    upgraded,
                    turnText: finalText,
                    playerAction: action,
                    language: (storyBible.hard_locked.language === "zh-Hans" ||
                      storyBible.hard_locked.language === "en"
                      ? storyBible.hard_locked.language
                      : "zh-Hant") as "zh-Hant" | "zh-Hans" | "en",
                    contentRating: (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
                  });

                  // ─── M2 沉澱張力：累加經歷 → 超 threshold 轉 sediment (演化) ───
                  // 純邏輯 · 無 AI call。pending_tensions 獨立 column (無 RPC race)。
                  const byChar = new Map<string, typeof expResult.perCharacter>();
                  for (const e of expResult.perCharacter) {
                    const arr = byChar.get(e.character_id) ?? [];
                    arr.push(e);
                    byChar.set(e.character_id, arr);
                  }
                  for (const [charId, exps] of byChar) {
                    if (exps.length === 0) continue;
                    // 攞角色 volatility (story_characters · fallback 0.5) + 現有 pending_tensions
                    const { data: scRow } = await serviceClient
                      .from("story_characters")
                      .select("volatility")
                      .eq("id", charId)
                      .maybeSingle();
                    const volatility = (scRow?.volatility as number | null) ?? 0.5;
                    const { data: ptRow } = await serviceClient
                      .from("playthrough_character_states")
                      .select("pending_tensions")
                      .eq("playthrough_id", playthroughId)
                      .eq("character_id", charId)
                      .maybeSingle();
                    const current = parsePendingTensions(ptRow?.pending_tensions);
                    const { next, newSediments } = accumulateTensions(
                      current,
                      exps.map((e) => ({
                        weight: e.weight,
                        affects: e.affects,
                        what_happened: e.what_happened,
                        turn_index: aiTurnIndex,
                      })),
                      volatility,
                    );
                    await serviceClient
                      .from("playthrough_character_states")
                      .update({ pending_tensions: next })
                      .eq("playthrough_id", playthroughId)
                      .eq("character_id", charId);
                    if (newSediments.length > 0) {
                      console.log(
                        `[turn] character ${charId} 沉澱演化: ${newSediments.map((s) => s.axis).join(", ")}`,
                      );
                    }
                  }
                }
              } catch (e) {
                console.warn(
                  "[turn] character experience write exception:",
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
        } else if (technicalFailure && userTurnId && memory.queryEmbedding) {
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

  // 2026-05-30 (founder): the deep-thinking toggle must show a VISIBLE thinking
  // process on EVERY model. Gemini hides its chain-of-thought (and we force it
  // off — it eats the output budget), so relying on the narrator's own reasoning
  // left the panel empty on Standard (Gemini). The Director (GM) runs every turn
  // on every model, so its verdict reasoning IS the universal thinking surface.
  // We wrap the narrator stream in a UI-message stream and write the GM thinking
  // as reasoning frames FIRST, then merge the narrator (whose own reasoning, if
  // any — e.g. Claude — appends after). The client already accumulates
  // reasoning-delta frames into the collapsible "思考過程" panel.
  //
  // sendReasoning: still forward the narrator's native reasoning (Claude) when
  // thinking is on. X-Accel-Buffering: no — ask any proxy not to buffer the SSE
  // stream (defence-in-depth; the real word-by-word pacing is the client-side
  // typing animation since CrazyRouter buffers Gemini regardless).
  // PR2 (ADR-001 · decision 11): 非 skill-check turn 唔再喺思考面板顯示 GM verdict
  // reasoning (verdict.reasoning 本質係判官理由 · 顯示 = GM 喺玩家體驗上仍係判官)。
  // 思考面板而家只顯示 NPC inner voices (L3) + Narrator 自己嘅 reasoning (Claude · 若有)。
  const gmThinking: string | null = null;

  // 2026-05-30 (founder): when Agent mode fired NPC L3 agents this turn, surface
  // their inner voices in the SAME 思考過程 panel so the player can SEE the agents
  // working ("撳入去打開個過程"). Independent of the deep-thinking toggle — if you
  // paid for Agent mode you see it regardless. Outputs were computed pre-narrator
  // (npcL3AgentDetails); the player-facing block is built here.
  const npcOutputs = npcL3AgentDetails
    .map((d) => d.output)
    .filter((o): o is NonNullable<typeof o> => o !== null);
  const npcThinking =
    npcOutputs.length > 0 ? npcAgentsToThinkingBlock(npcOutputs, storyLanguage) : null;

  // Combined pre-narrator thinking (GM verdict + NPC inner voices), capped so it
  // fits comfortably inside an HTTP header.
  const thinkingPreamble = [gmThinking, npcThinking]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);

  // 2026-05-31 (founder · "thinking mode no output"): deliver the GM/NPC thinking
  // via a RESPONSE HEADER — do NOT wrap the narrator in createUIMessageStream.
  // Wrapping (writer.merge OR an awaited pump) closed / raced the UI stream so
  // CrazyRouter's BUFFERED Gemini prose (lands ~16s in, all at once) never made
  // it out → blank narrative + the never-blank fallback fired. The header keeps
  // the narrator on the exact proven toUIMessageStreamResponse path that
  // thinking-OFF uses (always produced prose). The client reads X-Think-Preamble
  // (base64 UTF-8) to seed the 思考過程 panel; the narrator's own reasoning
  // (Claude · sendReasoning) still streams as reasoning-delta frames and appends.
  const headers: Record<string, string> = { "X-Accel-Buffering": "no" };
  if (thinkingPreamble) {
    headers["X-Think-Preamble"] = Buffer.from(thinkingPreamble, "utf8").toString("base64");
  }

  // 2026-06-01 (founder bug): the skill-check badge + Director amber border only
  // appeared after a full page reload — the live SSE stream carried prose only,
  // so the freshly-built client turn had no skill_check / director_verdict. The
  // server persists both on turns.* (so reload shows them), but the live turn
  // didn't. Mirror the X-Think-Preamble pattern: ship them as base64-JSON
  // response headers so the client attaches them onto the just-completed turn —
  // no extra round-trip. Fixes the skill badge AND the director border live, on
  // every device (the "desktop yes / mobile no" was a reload artifact).
  if (skillCheckResult) {
    headers["X-Skill-Check"] = Buffer.from(
      JSON.stringify(skillCheckResult),
      "utf8",
    ).toString("base64");
  }
  // PR2 (ADR-001 · decision 10): X-Director-Verdict header 移除 — GM verdict 唔再
  // 落前端 (amber 框 PR #65 已移除 · 呢個 header 變咗 dead plumbing)。

  return result.toUIMessageStreamResponse({
    sendReasoning: thinkingEnabled,
    headers,
  });
}
