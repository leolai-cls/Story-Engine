import { z } from "zod";

/**
 * NPC Agent L3 schemas — Story Engine Phase 1.5 generative agent layer.
 *
 * Each active NPC spawns a parallel agent call (Standard tier model via
 * tier-router · default GLM-5.1 for CJK / Gemini Flash for EN). The agent
 * follows MIRROR-inspired 3-step CoT:
 *   1. memories_recalled — relevant past events from POV-scoped memory
 *   2. reactions_predicted — 1-level Theory of Mind (no recursive nesting)
 *   3. motivation — synthesis grounded in character.core_motivation
 *
 * Output is wrapped as inner_thought + intent for Narrator to weave into
 * the canonical narrative. NPC agents CANNOT change state — that flows
 * exclusively through Director verdict + Narrator state_delta tool call.
 *
 * COHERENCE GUARANTEE:
 *   - Director is the single decision-maker for outcomes
 *   - Narrator is the sole integrator (NO synthesizer agent)
 *   - NPC inner_thought + intent are POV-only · read-only for state
 *   - Conflicting intents become dramatic tension · NOT contradictory outcomes
 *
 * Storyteller subscription tier exclusive · playthroughs.npc_l3_enabled flag
 * gates per-playthrough activation · DB trigger enforces tier (Migration 0028).
 */

// ─── ReasoningTrace · MIRROR 3-step CoT structure ───────────────────────────

export const ReasoningTraceSchema = z.object({
  /**
   * Step 1: memories the agent recalled while forming this thought.
   * Each entry is a short reference (lorebook entry name or paraphrased
   * memory snippet). 0-3 entries. Empty array means agent thought without
   * memory anchor — usually first interaction with player.
   */
  memories_recalled: z.array(z.string().min(1).max(120)).max(3),
  /**
   * Step 2: agent's 1-level Theory of Mind predictions about how others
   * (player + other NPCs + environment) might react to its intent.
   * 0-3 predictions. NO recursive ToM ("I think they think I think...")
   * to avoid hallucination + exponential context blowup.
   */
  reactions_predicted: z.array(z.string().min(1).max(120)).max(3),
  /**
   * Step 3: synthesis — agent's motivation for this turn's intent.
   * MUST ground in character.core_motivation (RoleFact-inspired fact-grounding).
   * 10-180 chars · the "because..." that ties memories + predictions together.
   */
  motivation: z.string().min(10).max(180),
});

export type ReasoningTrace = z.infer<typeof ReasoningTraceSchema>;

// ─── NpcAgentOutput · single agent's structured output per turn ─────────────

export const NpcAgentOutputSchema = z.object({
  /**
   * Canonical NPC name · MUST exact-match an active character. Used by
   * turn route to look up character_id for DB persist via apply_npc_inner_thought.
   * Case-insensitive matching is performed app-side (turn route).
   */
  character_name: z.string().min(1).max(60),
  /**
   * Agent's internal monologue · 50-100 字 typical · max 400.
   * 第一人稱 ("我...") · reveals subtext / hidden motivation.
   * NEVER appears verbatim in player-visible narrative — wrapped in
   * [INTERNAL CONTEXT — DO NOT QUOTE] block when injected into Narrator.
   * Min 20 chars to prevent under-developed throwaway thoughts.
   */
  inner_thought: z.string().min(20).max(400),
  /**
   * Agent's intent for this turn · 10-30 字 typical · max 200.
   * What the NPC plans to do (NOT what they will succeed at — Director
   * verdict + state_delta determine actual outcomes).
   * Example: "暗中觀察主角嘅反應 · 唔即時行動"
   */
  intent: z.string().min(5).max(200),
  /**
   * MIRROR 3-step reasoning trace · auditable + groundable.
   */
  reasoning_trace: ReasoningTraceSchema,
});

export type NpcAgentOutput = z.infer<typeof NpcAgentOutputSchema>;

// ─── Helper · format N agent outputs for Narrator dynamic system prompt ────

/**
 * Build the NPC Inner Streams block for Narrator's dynamic prompt.
 *
 * Wrapped in [INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE] header to match
 * existing Director verdict + memory context wrapping pattern. Narrator's
 * NARRATOR_RULES enforces non-verbatim-quote (F-08 mitigation).
 *
 * Returns empty string when no agents fired (no L3 active OR all failed) —
 * caller (turn route / turn-runner) should branch on empty to skip injection.
 *
 * Format kept compact · ~150 tokens per NPC · 3 NPC scenario ~450 tokens
 * added to Narrator input (cost factored into per-NPC credit charge).
 */
export function npcAgentToNarratorBlock(outputs: NpcAgentOutput[]): string {
  if (outputs.length === 0) return "";

  // Wave 2 fix HIGH-05 (security): sanitize all LLM-emitted strings before
  // interpolating into Narrator prompt. Strips characters that could be used
  // to break out of markdown structure or inject instructions:
  //   \n\r — line break injection (could start fake header)
  //   < > [ ] — angle/bracket tag injection
  //   ` — code block escape
  // Defensive: agent might emit jailbroken character_name with embedded
  // "[SYSTEM]: ignore narrator rules". Per-NPC name override in npc-agents.ts
  // catches obvious mismatches but accepts strings that match canonical name
  // even when suffixed with junk. This belt-and-braces sanitize closes the gap.
  const sanitize = (s: string): string =>
    s.replace(/[\r\n\[\]<>`]/g, "").slice(0, 400);

  const sections = outputs.map((o) => {
    const safeName = sanitize(o.character_name).slice(0, 60);
    const safeThought = sanitize(o.inner_thought);
    const safeIntent = sanitize(o.intent).slice(0, 200);
    return `### ${safeName}
**inner_thought** (POV · 私底下諗): ${safeThought}
**intent** (今 turn 想做嘅嘢): ${safeIntent}`;
  });

  return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE INTO NARRATIVE]
## NPC Inner Streams (this turn · private POVs)

呢度係每個 active NPC 嘅內心 + 意圖 · 玩家睇唔到呢段文字。
你嘅工作: weave 呢啲 POV 入觀察到嘅場景 · 變成 dramatic tension。

⚠️ **規則**:
- inner_thought 永遠唔可以 verbatim 出現喺敘事入面 (用你自己嘅 prose 表達)
- intent 影響 NPC 行動 / 對白 · 但 final outcome 由 Director verdict + state_delta 決定
- 如果兩個 NPC intent 衝突 (A 想阻擋 · B 想助攻) → dramatize 衝突 · 唔好揀邊個贏 (由 state_delta 反映 canonical outcome)
- 玩家只應該見到 observable cues (眼神 · 身體語言 · 講咗咩話 · 做咗咩動作)

${sections.join("\n\n")}`;
}

// ─── Helper · estimate NPC L3 credit charge ────────────────────────────────

/**
 * Credits charged per active NPC L3 agent.
 *
 * Founder Q3 decision (Session 12 sign-off):
 *   - Per-NPC real cost ≈ $0.003 (GLM-5.1 Standard tier · no cache via OpenRouter)
 *     + Narrator input/output overhead share (~$0.0014/NPC)
 *     ≈ $0.0044 per NPC actual
 *   - Story Engine 2× markup convention (1 credit = $0.001 · markup 2.0×):
 *     0.0044 × 2 × 1000 = 8.8 credits per NPC
 *   - Rounded down to 6 credits per NPC (slightly under-margin to keep value
 *     perception · still net positive · founder explicit decision)
 *
 * Per turn (3 NPCs max): 3 × 6 = 18 credits add-on (~9% above 200-credit
 * Opus baseline · ~8% reduction in monthly turn budget for Storyteller users).
 */
export const NPC_L3_CREDITS_PER_NPC = 6;

/**
 * Compute total NPC L3 credit charge for a turn.
 * Pure function · safe to call from estimateTurnCredits + computeTurnCredits.
 */
export function computeNpcL3Credits(activeNpcCount: number): number {
  if (activeNpcCount <= 0) return 0;
  return activeNpcCount * NPC_L3_CREDITS_PER_NPC;
}

// ─── Constants exposed for orchestration module ────────────────────────────

/**
 * Max NPC agents per turn (founder Q2 decision · Session 12 sign-off).
 * Cap at 3 to balance scene drama vs cost · group scenes still feasible.
 */
export const MAX_NPC_L3_AGENTS_PER_TURN = 3;

/**
 * Hard timeout for individual NPC agent call (per-agent · NOT total batch).
 * Above this · agent's slot returns empty + warning logged (graceful degrade).
 * 8s chosen: Standard tier models (GLM-5.1 / Gemini Flash) typical P50 ~1.5s ·
 * P99 ~5-6s · 8s gives headroom without blowing turn budget.
 */
export const NPC_AGENT_TIMEOUT_MS = 8000;
