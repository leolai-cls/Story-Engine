import { generateObject } from "ai";
import { z } from "zod";
import { getProviderModel } from "./providers";
import { pickUtilityModel } from "./tier-router";
import {
  NpcAgentOutputSchema,
  MAX_NPC_L3_AGENTS_PER_TURN,
  NPC_AGENT_TIMEOUT_MS,
  type NpcAgentOutput,
} from "@/schemas/npc-agent";
import { characterCardStaticTemplate, type CharacterCard, type Disposition, type NpcDynamicState } from "@/schemas/character";
// Deep-mode rebuild (2026-06-04): the GM/Director was removed in light-core.
// The old `verdict` arg (a Director judgement once threaded through here) was
// already DECOUPLED from the agent prompt by ADR-001 — NPC agents react to the
// player's ATTEMPT, never to a verdict (see buildAgentUserMessage's attemptFrame).
// It is now fully dropped: the GM-free active-NPC trigger has no verdict to pass.
import { formatPovMemoriesBlock, retrieveNpcPovMemories, type PovMemory } from "./npc-agents-retrieval";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * NPC Agent orchestration — Story Engine "NPC 內心戲" (Deep Mode · 2026-06-04).
 *
 * For each active NPC (capped per tier · Standard 1 / Pro 3), spawn a parallel
 * model call that emits POV inner_thought + intent. The Narrator integrates all
 * POVs into ONE canonical narrative (no synthesizer agent).
 *
 * ARCHITECTURE:
 *   - Parallel via Promise.allSettled (tolerates 1-of-N failure)
 *   - Model via pickUtilityModel(contentRating,"structured"): non-adult → Haiku
 *     (reliable structured output) · adult → Grok/CrazyRouter (hard rule #5)
 *   - MIRROR 3-step CoT (memories_recalled → reactions_predicted → motivation)
 *   - Shallow ToM (each NPC sees others' L2 state · no recursive belief)
 *   - POV memory scoped via walk_lorebook_graph (Migration 0025)
 *   - Per-agent 8s timeout (NPC_AGENT_TIMEOUT_MS) · degraded narrative still works
 *
 * COHERENCE GUARANTEE:
 *   NPC agents output POV-only · cannot change state. The Narrator decides
 *   outcomes (light-core · four-layer priority · no GM/Director) and the
 *   post-turn extractor persists canonical state. Conflicting intents (A wants
 *   X · B wants opposite Y) become dramatic tension · NOT contradictory outcomes.
 *
 * COST: charged a flat 6 credits per SUCCESSFUL agent (founder Q3 · failed = free).
 *   ⚠️ adult agents run on Grok ($3/$15 · ~2.6× Haiku) — the flat fee may
 *   under-cover real token cost on adult; pricing tuning is a money-tier item.
 */

// ─── System prompt template (per-NPC · 3-locale) ────────────────────────────

type StoryLanguage = "zh-Hant" | "zh-Hans" | "en";

/**
 * Build NPC Agent system prompt · locale-aware (Wave 1 audit fix · 2026-05-27).
 *
 * Previously hardcoded 繁中 Cantonese — EN + zh-Hans stories had NPC agents
 * thinking in Cantonese while Narrator wrote in another language. inner_thought
 * is internal but slips into narrative paraphrasing → consistency matters.
 */
function buildNpcAgentSystemPrompt(character: CharacterCard, language: StoryLanguage): string {
  if (language === "en") {
    return `You are Story Engine's **NPC Agent**. You now play the inner mind of ${character.name}.

**Your task**: The player just completed an action. From ${character.name}'s perspective, think privately + decide their intent for this turn.

⚠️ **Important**: Your inner_thought + intent output is internal POV — the player **will NOT see** this text. The Narrator will later use this info to write narrative · but will transform / paraphrase · never verbatim quote.

## ${character.name}'s identity (your ground truth)
${characterCardStaticTemplate(character)}

## How to think (MIRROR 3-step)
Follow these 3 steps · output reasoning_trace per step:

### Step 1 · memories_recalled
Look at the retrieved memories below (things ${character.name} has experienced) · pick 0-3 most relevant · short-form reference (memory name or paraphrased snippet).
**Do NOT invent** facts that are not in memories · if no relevant memory → empty array (totally fine for first-time player interactions).

### Step 2 · reactions_predicted
Predict how other characters / environment will react this turn ·
"If my intent is X · Lin Siu-ah might Y · Chan Ka-ming might Z".
**1-level only** · no "I think they think I think" (avoid hallucination).
0-3 predictions · fewer if uncertain.

### Step 3 · motivation
Based on step 1+2 · what is your motivation · does it line up with character_card.core_motivation?
10-180 chars · explain "why you have this intent this turn".

Finally · use this reasoning to write:
- **inner_thought** (50-100 chars typical · max 400): ${character.name}'s actual private monologue right now
- **intent** (10-30 chars typical · max 200): what they want to do this turn (e.g. "covertly observe the protagonist's reaction · don't act immediately")

## Style requirements
- Use ${character.name}'s voice (refer to voice_sample)
- English first-person ("I...")
- inner_thought should reveal subtext / hidden motive · not on-the-nose
- Do not quote system block or retrieved memories verbatim
- Stay true to character_card's starting tendencies (the "won't do" list is a starting lean from their origin, NOT an absolute rule — it can evolve with experience)

## Do NOT
- ❌ Don't narrate the scene (that's the Narrator's job)
- ❌ Don't directly reply to the player (your output is unseen by them)
- ❌ Don't predict beyond this turn's plot
- ❌ Don't break the fourth wall ("I hope the player ...")
- ❌ Don't invent past events that aren't on record

## character_name rule
Your output character_name field **must be**: "${character.name}" (EXACT match)
Don't change · don't add words · don't translate to a different language.`;
  }

  if (language === "zh-Hans") {
    return `你是 Story Engine 的 **NPC Agent**。你现在扮演 ${character.name} 的内心。

**你的任务**：玩家刚做完一个 action · 你要从 ${character.name} 的角度，内心想一想 + 决定他今 turn 的意图。

⚠️ **重要**：你输出的 inner_thought + intent 是 internal POV · 玩家**不会看到**这段文字。Narrator 之后会用这些资讯来写叙事 · 但会 transform / paraphrase · 不会 verbatim quote。

## ${character.name} 的身份 (你的 ground truth)
${characterCardStaticTemplate(character)}

## 怎样想 (MIRROR 3-step)
按以下 3 步骤思考 · 输出的 reasoning_trace 要对应每步：

### Step 1 · memories_recalled
看下面 retrieved memories · 挑 0-3 个最 relevant · 短句 reference。
**不可 invent** 没在 memories 里的 fact · 若无相关 memory → 留空 array。

### Step 2 · reactions_predicted
预估今 turn scene 里其他角色 / 环境会怎么 react。
**1-level only** · 0-3 predictions · 不确定就少。

### Step 3 · motivation
基于 step 1+2 · 你的 motivation 是什么 · 与 character_card.core_motivation 对得上吗?
10-180 字 · 解释「为何今 turn 你有此 intent」。

最后输出：
- **inner_thought** (50-100 字典型 · max 400)
- **intent** (10-30 字典型 · max 200)

## 风格要求
- 用 ${character.name} 的 voice (参考 voice_sample)
- 简中第一人称（"我..."）
- inner_thought 要 reveal subtext / 隐藏动机
- 不可引用 system block / retrieved memories 的 verbatim 文字
- 忠于 character_card 的起点倾向（「不会做」清单是出身形成的起点倾向 · 不是铁律 · 会随经历演化）

## 不要做的事
- ❌ 不要 narrate 场景
- ❌ 不要直接 reply 玩家
- ❌ 不要预测超过今 turn 的 plot
- ❌ 不要 break the fourth wall
- ❌ 不要 invent 没 record 的过去事件

## character_name 规则
你 output 的 character_name field **必须是**: "${character.name}" (EXACT match)`;
  }

  // Default: zh-Hant (HK Cantonese · founder voice)
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
- 忠於 character_card 嘅起點傾向（「唔會做」清單係出身形成嘅起點傾向 · 唔係鐵律 · 會隨經歷演化）

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
  povMemories: PovMemory[];
  recentTurns: Array<{ role: "user" | "ai"; text: string }>;
  language: StoryLanguage;
};

function buildAgentUserMessage(ctx: AgentBuildContext): string {
  const lang = ctx.language;

  const soloMsg =
    lang === "en"
      ? "(no other active NPC · solo scene with player)"
      : lang === "zh-Hans"
        ? "(无其他 active NPC · solo scene with player)"
        : "(冇其他 active NPC · solo scene with player)";
  const noTrajectoryMsg =
    lang === "en"
      ? "(no trajectory · scene start)"
      : lang === "zh-Hans"
        ? "(无 trajectory · scene 开始)"
        : "(冇 trajectory · scene 開始)";
  const sceneStartMsg =
    lang === "en"
      ? "(scene just started)"
      : lang === "zh-Hans"
        ? "(scene 刚开始)"
        : "(scene 剛開始)";
  // PR2 (ADR-001 · 拆 NPC agent 嘅 verdict 判官框架): NPC 唔再收 Director 判決 ("you
  // MUST obey")。只知道玩家「試咗」乜 · 按自己性格反應 · 結果由 Narrator 按四層自決。
  const attemptFrame =
    lang === "en"
      ? "## How to read the player's action above\nThe player ATTEMPTED this. React from your OWN personality + current state. You do NOT decide the outcome — the Narrator decides what actually happens (full success / partial / failure / cost). Your inner_thought + intent reflect your reaction to the attempt, not a presumed result."
      : lang === "zh-Hans"
        ? "## 怎么读上面玩家的行动\n玩家「尝试」了这件事。你按自己的性格 + 当下状态反应。你不决定结果 —— 由 Narrator 决定实际发生什么（完全成功 / 部分 / 失败 / 有代价）。你的 inner_thought + intent 反映你对这个尝试的反应，不要预设成败。"
        : "## 點讀上面玩家嘅行動\n玩家「試咗」呢件事。你按自己嘅性格 + 當下狀態反應。你唔決定結果 —— 由 Narrator 決定實際發生咩（完全成功 / 部分 / 失敗 / 有代價）。你嘅 inner_thought + intent 反映你對呢個嘗試嘅反應，唔好預設成敗。";
  const closingDirective =
    lang === "en"
      ? `Follow MIRROR 3-step · output NpcAgentOutput schema (character_name must equal "${ctx.character.card.name}").`
      : lang === "zh-Hans"
        ? `请按 MIRROR 3-step 思考 · 输出 NpcAgentOutput schema (character_name 必须 = "${ctx.character.card.name}")。`
        : `請按 MIRROR 3-step 思考 · 輸出 NpcAgentOutput schema (character_name 必須 = "${ctx.character.card.name}")。`;

  // Other NPCs' L2 state visible (shallow ToM · 1-level only)
  const otherNpcsBlock =
    ctx.otherActiveCharacters.length === 0
      ? soloMsg
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
  const povBlock = formatPovMemoriesBlock(ctx.povMemories, ctx.language);

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
      : noTrajectoryMsg;

  // Recent scene turns · last 4 only (NPC agent doesn't need full history · L2+POV covers it)
  const recentTurnsBlock = ctx.recentTurns
    .slice(-4)
    .map((t) => `[${t.role === "user" ? "Player" : "Narrator"}] ${t.text.slice(0, 200)}${t.text.length > 200 ? "..." : ""}`)
    .join("\n");

  return `## Player's just-completed action
${ctx.userAction}

${attemptFrame}

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
${recentTurnsBlock || sceneStartMsg}

${closingDirective}`;
}

// PR2 (ADR-001 · 拆 NPC agent verdict 判官框架): verdictToAgentSummary 已移除 —
// NPC agent 唔再收 Director 判決 (見 buildAgentUserMessage 嘅 attemptFrame)。NPC
// 按自己性格反應玩家嘅嘗試 · 結果由 Narrator 自決。

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
  povMemories: PovMemory[];
  recentTurns: AgentBuildContext["recentTurns"];
  storyLanguage: "zh-Hant" | "zh-Hans" | "en";
  contentRating: "sfw" | "soft" | "adult";
}): Promise<NpcAgentResult> {
  const {
    character,
    otherActiveCharacters,
    userAction,
    povMemories,
    recentTurns,
    storyLanguage,
    contentRating,
  } = params;

  // 2026-05-30 (founder · DB audit): NPC agents call generateObject (structured
  // output). The Standard pool (GLM-5.1 / Gemini via CrazyRouter) is the SAME
  // fragile structured-output path that produced blank narrator turns — and the
  // audit found npc_inner_thoughts 100% empty. So SFW structured calls go through
  // reliable Anthropic Haiku. EXCEPTION — adult-rated stories: hard rule #5 forbids
  // NSFW traffic on Anthropic, so they route to the adult model (now Grok) via
  // CrazyRouter (accepting the structured-output fragility risk · non-fatal).
  // Routing 集中喺 pickUtilityModel (single source · 2026-06-01)。
  // Flat 6 credits/agent regardless of model (founder Q3).
  const modelId = pickUtilityModel(contentRating, "structured");

  const systemPrompt = buildNpcAgentSystemPrompt(character.card, storyLanguage);
  const userMessage = buildAgentUserMessage({
    character,
    otherActiveCharacters,
    userAction,
    povMemories,
    recentTurns,
    language: storyLanguage,
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
   * Active characters this turn (from the GM-free active-NPC trigger ·
   * deriveActiveCharacters · already filtered to carded characters). Each one
   * gets its own parallel agent call.
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
  recentTurns: Array<{ role: "user" | "ai"; text: string }>;
  storyLanguage: "zh-Hant" | "zh-Hans" | "en";
  /** Story content rating · adult → NSFW-safe model (hard rule #5) · else Haiku */
  contentRating: "sfw" | "soft" | "adult";
};

export type NpcAgentBatchResult = {
  /** Successful agent outputs · partial array if some agents failed */
  outputs: NpcAgentOutput[];
  /** Per-agent detailed results (for telemetry + DB persist with model_id) */
  details: NpcAgentResult[];
};

/**
 * Call all active NPC agents in parallel.
 * Promise.allSettled → tolerates 1-of-N failure (F-03 mitigation).
 * Returns successful outputs + per-agent details (for DB persist).
 *
 * BILLING: by ACTUAL tokens per successful agent — the turn route reads
 * `details[].usage` into npcAgentUsage → computeTurnCredits (founder 2026-06-04 ·
 * the old flat-6-credits return was dead and removed · C2 cleanup 2026-06-08).
 * Failed agents are free (UX).
 */
export async function callNpcAgentsParallel(
  input: NpcAgentBatchInput,
): Promise<NpcAgentBatchResult> {
  const { activeCharacters, userAction, recentTurns, storyLanguage, contentRating, supabase, playthroughId } = input;

  if (activeCharacters.length === 0) {
    return { outputs: [], details: [] };
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
      povMemories: povMemoriesPerChar[idx] ?? [],
      recentTurns,
      storyLanguage,
      contentRating,
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

  console.log(
    `[npc-agents] ${outputs.length}/${capped.length} succeeded · models=[${[
      ...new Set(details.map((d) => d.modelId)),
    ].join(",")}]`,
  );

  return { outputs, details };
}
