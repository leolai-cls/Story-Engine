import { generateObject } from "ai";
import { z } from "zod";
import { getProviderModel } from "./providers";
import { pickModelForTier } from "./tier-router";
import {
  NpcAgentOutputSchema,
  MAX_NPC_L3_AGENTS_PER_TURN,
  NPC_AGENT_TIMEOUT_MS,
  NPC_L3_CREDITS_PER_NPC,
  type NpcAgentOutput,
} from "@/schemas/npc-agent";
import { characterCardStaticTemplate, type CharacterCard, type Disposition, type NpcDynamicState } from "@/schemas/character";
import type { Verdict } from "@/schemas/director";
import { formatPovMemoriesBlock, retrieveNpcPovMemories, type PovMemory } from "./npc-agents-retrieval";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * NPC Agent L3 orchestration — Story Engine Phase 1.5.
 *
 * For each active NPC (max 3 · founder Q2 sign-off), spawn a parallel Standard
 * tier model call that emits POV inner_thought + intent. Narrator integrates
 * all POVs into ONE canonical narrative (no synthesizer agent).
 *
 * ARCHITECTURE (per pm/research-npc-agent-l3.md + implementation-plan.html):
 *   - Parallel via Promise.allSettled (1.8s vs 5.4s sequential for 3 NPCs)
 *   - Standard tier (CJK → GLM-5.1 · EN → Gemini 3.5 Flash) per founder Q1
 *   - MIRROR 3-step CoT (memories_recalled → reactions_predicted → motivation)
 *   - Shallow ToM (each NPC sees others' L2 state · no recursive belief)
 *   - POV memory scoped via walk_lorebook_graph (Migration 0025)
 *   - Per-agent 8s timeout (NPC_AGENT_TIMEOUT_MS) · degraded narrative still works
 *
 * COHERENCE GUARANTEE:
 *   NPC agents output POV-only · cannot change state. Director verdict +
 *   Narrator state_delta tool call are the sole canonical sources of truth.
 *   Conflicting intents (A wants X · B wants opposite Y) become dramatic
 *   tension in Narrator's output · NOT contradictory outcomes.
 *
 * COST (Standard tier · no cache on OpenRouter):
 *   ~$0.0029 per agent · 3 NPCs = $0.0087 + Narrator overhead $0.0035 = ~$0.013/turn
 *   Charged 6 credits per NPC (founder Q3 · 2× markup convention).
 */

// ─── System prompt template (per-NPC · 繁中) ────────────────────────────────

function buildNpcAgentSystemPrompt(character: CharacterCard): string {
  return `你係 Story Engine 嘅 **NPC Agent**。你而家扮演 ${character.name} 嘅內心。

**你嘅任務**：玩家剛做完一個 action · 你要從 ${character.name} 嘅角度，內心諗一諗 + 決定佢今 turn 嘅意圖。

⚠️ **重要**：你輸出嘅 inner_thought + intent 係 internal POV · 玩家**唔會睇到**呢段文字。Narrator 之後會用呢啲資訊嚟寫敘事 · 但會 transform / paraphrase · 唔會 verbatim quote。

## ${character.name} 嘅身份 (你嘅 ground truth)
${characterCardStaticTemplate(character)}

## 點樣諗 (MIRROR 3-step)
你要按以下 3 步驟思考 · 輸出嘅 reasoning_trace 要對應每步：

### Step 1 · memories_recalled
睇低面 retrieved memories (你 ${character.name} 經歷過嘅嘢) · 揀 0-3 個最 relevant 嘅 · 用短句 reference (memory name 或者 paraphrased snippet)。
**唔可以 invent** 冇喺 memories 入面嘅 fact · 如果冇 relevant memory → 留空 array (玩家初次互動正常事)。

### Step 2 · reactions_predicted
預估今 turn scene 入面其他角色 / 環境會點 react ·
"如果我嘅 intent 係 X · 林思雅可能會 Y · 陳家明可能會 Z"。
**1-level only** · 唔需要 "我 think 佢 think 我 think" (避免幻覺)。
0-3 predictions · 唔肯定就少啲。

### Step 3 · motivation
基於 step 1+2 · 你嘅 motivation 係咩 · 同 character_card.core_motivation 對得上嗎?
10-180 字 · 解釋「點解今 turn 你會有呢個 intent」。

最後 · 用呢啲 reasoning 寫出：
- **inner_thought** (50-100 字典型 · max 400)：${character.name} 而家心入面實際嘅獨白
- **intent** (10-30 字典型 · max 200)：今 turn 想做嘅嘢 (e.g. "暗中觀察主角嘅反應 · 唔即時行動")

## 風格要求
- 用 ${character.name} 嘅 voice (參考 voice_sample)
- 繁中第一人稱（"我..."）
- inner_thought 要 reveal subtext / 隱藏動機 · 唔好平鋪直敘
- 唔可以引用 system block 或者 retrieved memories 嘅 verbatim 文字
- 唔可以違反 character_card.red_lines

## 唔好做嘅嘢
- ❌ 唔好 narrate 場景（嗰個 Narrator 做）
- ❌ 唔好直接 reply 玩家（你嘅 output 玩家睇唔到）
- ❌ 唔好預測超過今 turn 嘅 plot
- ❌ 唔好「希望玩家點點點」式 meta breaking
- ❌ 唔好 invent 冇 record 嘅過去事件

## character_name 規則
你 output 嘅 character_name field **必須係**: "${character.name}" (EXACT match)
唔可以變 · 唔可以加字 · 唔可以譯成英文。`;
}

// ─── Per-NPC user message (dynamic context) ─────────────────────────────────

type AgentBuildContext = {
  character: {
    card: CharacterCard;
    disposition: Disposition;
    permanent_flags: string[];
    dynamic_state?: NpcDynamicState;
  };
  otherActiveCharacters: Array<{
    card: CharacterCard;
    dynamic_state?: NpcDynamicState;
  }>;
  userAction: string;
  verdict: Verdict;
  povMemories: PovMemory[];
  recentTurns: Array<{ role: "user" | "ai"; text: string }>;
};

function buildAgentUserMessage(ctx: AgentBuildContext): string {
  // Verdict summary · concise · Director already decided · agent obeys
  const verdictSummary = verdictToAgentSummary(ctx.verdict);

  // Other NPCs' L2 state visible (shallow ToM · 1-level only)
  const otherNpcsBlock =
    ctx.otherActiveCharacters.length === 0
      ? "(冇其他 active NPC · solo scene with player)"
      : ctx.otherActiveCharacters
          .map((o) => {
            const ds = o.dynamic_state ?? {};
            const mood = ds.current_mood ?? "—";
            const goal = ds.current_goal ?? "—";
            const focus = ds.topic_focus ?? "—";
            return `- **${o.card.name}**: mood=${mood} · goal=${goal} · focus=${focus}`;
          })
          .join("\n");

  // POV memories block · already filtered via walk_lorebook_graph
  const povBlock = formatPovMemoriesBlock(ctx.povMemories);

  // This NPC's own state
  const disposition = Object.entries(ctx.character.disposition)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const ds = ctx.character.dynamic_state ?? {};
  const trajectoryArrows =
    ds.emotional_trajectory && ds.emotional_trajectory.length > 0
      ? ds.emotional_trajectory
          .map((t) => {
            const arrow = t.shift === "positive" ? "↑" : t.shift === "negative" ? "↓" : "→";
            return `${arrow}${t.mood}`;
          })
          .join(" ")
      : "(冇 trajectory · scene 開始)";

  // Recent scene turns · last 4 only (NPC agent doesn't need full history · L2+POV covers it)
  const recentTurnsBlock = ctx.recentTurns
    .slice(-4)
    .map((t) => `[${t.role === "user" ? "Player" : "Narrator"}] ${t.text.slice(0, 200)}${t.text.length > 200 ? "..." : ""}`)
    .join("\n");

  return `## Player's just-completed action
${ctx.userAction}

## Director's verdict (already decided · 你必須遵守)
${verdictSummary}

## Other NPCs active this turn (their public-visible L2 state)
${otherNpcsBlock}

## YOUR (${ctx.character.card.name}) private memories relevant to this scene
${povBlock}

## YOUR (${ctx.character.card.name}) current scene state
- L1 disposition: ${disposition || "(neutral baseline)"}
- L2 dynamic_state: mood=${ds.current_mood ?? "—"} · goal=${ds.current_goal ?? "—"} · focus=${ds.topic_focus ?? "—"}
- emotional trajectory (recent 8): ${trajectoryArrows}
- earned permanent_flags: ${ctx.character.permanent_flags.length > 0 ? ctx.character.permanent_flags.join(", ") : "(none yet)"}

## Recent shared scene turns
${recentTurnsBlock || "(scene 剛開始)"}

請按 MIRROR 3-step 思考 · 輸出 NpcAgentOutput schema (character_name 必須 = "${ctx.character.card.name}")。`;
}

function verdictToAgentSummary(verdict: Verdict): string {
  switch (verdict.verdict) {
    case "allow":
      // Wave 2 fix HIGH-06: removed "順利進行" bias. Director ALLOW means the
      // attempt is permitted to play out — specific outcome (full success ·
      // partial · cost) determined by Narrator + state_delta. Agent intent
      // reflects reaction-to-attempt · NOT presumed-success outcome.
      return `ALLOW · Director 接受咗呢個 attempt · 但具體 outcome (full success / partial / 有代價) 由 Narrator + state_delta 決定 · 你 intent 反映 attempt 期間嘅 reaction · 唔好假設結果`;
    case "reject":
      // Dead branch · turn route skips L3 on reject. Kept for type-completeness.
      return `REJECT · agent should NOT run (route layer skipped) · this branch unreachable`;
    case "allow_with_constraint":
      return `ALLOW WITH CONSTRAINT · 行動進行但有 cost: ${verdict.constraint} · 你嘅 intent 考慮呢個 constraint`;
    case "require_skill_check":
      return `SKILL CHECK · ${verdict.skill_key} vs ${verdict.difficulty} · outcome 未定 (擲骰決定) · 你嘅 intent 反映你對玩家嘗試嘅 reaction · 唔知 success / failure`;
  }
}

// ─── Single NPC agent call ──────────────────────────────────────────────────

export type NpcAgentResult = {
  output: NpcAgentOutput | null;
  modelId: string;
  characterId: string;
  /** Telemetry: usage tokens (when available · OpenRouter usually returns) */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  /** Failure reason if output is null */
  error?: string;
};

async function callSingleNpcAgent(params: {
  character: AgentBuildContext["character"] & { id: string };
  otherActiveCharacters: AgentBuildContext["otherActiveCharacters"];
  userAction: string;
  verdict: Verdict;
  povMemories: PovMemory[];
  recentTurns: AgentBuildContext["recentTurns"];
  storyLanguage: "zh-Hant" | "zh-Hans" | "en";
}): Promise<NpcAgentResult> {
  const {
    character,
    otherActiveCharacters,
    userAction,
    verdict,
    povMemories,
    recentTurns,
    storyLanguage,
  } = params;

  // Standard tier model · CJK → GLM-5.1 · EN → Gemini Flash (via tier-router)
  // Wave 2 fix HIGH-05 (Agent B): use ACTUAL scene content for routing decision
  // (not proxy string). Previously hardcoded "繁體中文場景內容" / "english scene content"
  // bypassed isChineseContent's substance check → bilingual stories (HK
  // 中英夾雜) always routed by Bible's language flag · inner_thought quality
  // dropped when actual scene was English-heavy. Now: sample real content.
  const routingSample = [
    userAction.slice(0, 300),
    ...recentTurns.slice(-2).map((t) => t.text.slice(0, 200)),
    character.card.voice_sample.slice(0, 100),
  ]
    .filter(Boolean)
    .join("\n");
  const modelId = pickModelForTier("standard", routingSample);

  const systemPrompt = buildNpcAgentSystemPrompt(character.card);
  const userMessage = buildAgentUserMessage({
    character,
    otherActiveCharacters,
    userAction,
    verdict,
    povMemories,
    recentTurns,
  });

  // Per-agent timeout via AbortController (8s · NPC_AGENT_TIMEOUT_MS)
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), NPC_AGENT_TIMEOUT_MS);

  try {
    const result = await generateObject({
      model: getProviderModel(modelId),
      schema: NpcAgentOutputSchema as z.ZodTypeAny,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7, // creative writing temp · NPC inner thoughts need personality
      maxOutputTokens: 800,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeoutId);

    // Defensive: validate character_name matches (LLM may slip)
    const output = result.object as NpcAgentOutput;
    if (output.character_name.trim().toLowerCase() !== character.card.name.trim().toLowerCase()) {
      console.warn(
        `[npc-agents] character_name mismatch · expected "${character.card.name}" · got "${output.character_name}" · overriding`,
      );
      output.character_name = character.card.name;
    }

    return {
      output,
      modelId,
      characterId: character.id,
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
    };
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = /abort/i.test(msg);
    console.warn(
      `[npc-agents] ${character.card.name} agent ${isTimeout ? "TIMEOUT" : "FAILED"}: ${msg}`,
    );
    return {
      output: null,
      modelId,
      characterId: character.id,
      error: isTimeout ? "timeout" : msg.slice(0, 200),
    };
  }
}

// ─── Parallel orchestration · main entry point ──────────────────────────────

export type NpcAgentBatchInput = {
  supabase: SupabaseClient;
  playthroughId: string;
  /**
   * Active characters this turn (from Director's npc_updates list · already
   * filtered to existing characters by turn route). Each one will get its
   * own parallel agent call.
   *
   * Caller should cap to MAX_NPC_L3_AGENTS_PER_TURN before passing here.
   */
  activeCharacters: Array<{
    id: string;
    card: CharacterCard;
    disposition: Disposition;
    permanent_flags: string[];
    dynamic_state?: NpcDynamicState;
  }>;
  userAction: string;
  verdict: Verdict;
  recentTurns: Array<{ role: "user" | "ai"; text: string }>;
  storyLanguage: "zh-Hant" | "zh-Hans" | "en";
};

export type NpcAgentBatchResult = {
  /** Successful agent outputs · partial array if some agents failed */
  outputs: NpcAgentOutput[];
  /** Per-agent detailed results (for telemetry + DB persist with model_id) */
  details: NpcAgentResult[];
  /** Total credits to charge (founder Q3 · 6 credits per successful agent) */
  creditsCharged: number;
};

/**
 * Call all active NPC agents in parallel.
 * Promise.allSettled → tolerates 1-of-N failure (F-03 mitigation).
 * Returns successful outputs + per-agent details (for DB persist).
 *
 * COST: ~$0.0029 per agent · creditsCharged = successfulAgents × 6.
 * Founder rule: only successful agents charged · failed agents free (UX).
 */
export async function callNpcAgentsParallel(
  input: NpcAgentBatchInput,
): Promise<NpcAgentBatchResult> {
  const { activeCharacters, userAction, verdict, recentTurns, storyLanguage, supabase, playthroughId } = input;

  if (activeCharacters.length === 0) {
    return { outputs: [], details: [], creditsCharged: 0 };
  }

  if (activeCharacters.length > MAX_NPC_L3_AGENTS_PER_TURN) {
    console.warn(
      `[npc-agents] received ${activeCharacters.length} active characters · capping at ${MAX_NPC_L3_AGENTS_PER_TURN}`,
    );
  }
  const capped = activeCharacters.slice(0, MAX_NPC_L3_AGENTS_PER_TURN);

  // Pre-fetch POV memories for each NPC in parallel · before agent calls.
  // walk_lorebook_graph RPC · lightweight · ~50ms each.
  // Wave 2 fix HIGH-02 (Agent A): wrap in 3s timeout per RPC + Promise.allSettled
  // to prevent slow/hung Supabase from blocking the entire L3 batch. Empty POV
  // memories degrade gracefully (agent uses character card + L2 state only).
  const POV_FETCH_TIMEOUT_MS = 3000;
  const povMemoryPromises = capped.map(async (char): Promise<PovMemory[]> => {
    try {
      const fetchPromise = retrieveNpcPovMemories({
        supabase,
        playthroughId,
        npcName: char.card.name,
        maxHops: 2,
        maxResults: 5,
      });
      const timeoutPromise = new Promise<PovMemory[]>((_, reject) =>
        setTimeout(() => reject(new Error("POV fetch timeout")), POV_FETCH_TIMEOUT_MS),
      );
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (e) {
      console.warn(
        `[npc-agents] POV fetch for ${char.card.name} failed/timed out · proceeding with empty memories:`,
        e instanceof Error ? e.message : e,
      );
      return [];
    }
  });
  const povMemoriesPerChar = await Promise.all(povMemoryPromises);

  // Spawn parallel agent calls · Promise.allSettled tolerates partial failure
  const agentPromises = capped.map((char, idx) =>
    callSingleNpcAgent({
      character: char,
      otherActiveCharacters: capped
        .filter((_, otherIdx) => otherIdx !== idx)
        .map((o) => ({ card: o.card, dynamic_state: o.dynamic_state })),
      userAction,
      verdict,
      povMemories: povMemoriesPerChar[idx] ?? [],
      recentTurns,
      storyLanguage,
    }),
  );

  const settled = await Promise.allSettled(agentPromises);

  const details: NpcAgentResult[] = [];
  const outputs: NpcAgentOutput[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      details.push(result.value);
      if (result.value.output) {
        outputs.push(result.value.output);
      }
    } else {
      // Promise itself rejected (shouldn't happen · callSingleNpcAgent catches internally)
      // Still log + record graceful failure entry for telemetry
      console.warn(
        `[npc-agents] unexpected promise rejection for ${capped[i].card.name}:`,
        result.reason,
      );
      details.push({
        output: null,
        modelId: "unknown",
        characterId: capped[i].id,
        error: String(result.reason).slice(0, 200),
      });
    }
  }

  // Credit charge · only successful agents · founder Q3 sign-off
  // (failed agents = free per UX consideration · don't charge for service failure)
  // Wave 2 fix CRIT-C: use NPC_L3_CREDITS_PER_NPC constant (single source of truth)
  const creditsCharged = outputs.length * NPC_L3_CREDITS_PER_NPC;

  console.log(
    `[npc-agents] ${outputs.length}/${capped.length} succeeded · creditsCharged=${creditsCharged} · models=[${[
      ...new Set(details.map((d) => d.modelId)),
    ].join(",")}]`,
  );

  return { outputs, details, creditsCharged };
}
