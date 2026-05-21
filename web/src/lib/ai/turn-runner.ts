import { z } from "zod";
import { tool } from "ai";
import { bibleToSystemPrompt, type StoryBible } from "@/schemas/bible";
import {
  allCharactersStaticTemplate,
  allCharactersDynamicState,
  type CharacterCard,
  type Disposition,
} from "@/schemas/character";
import { StateDeltaSchema, type StateDelta } from "@/schemas/state-delta";
import { INTERNAL_STATE_KEY_PREFIX, type StateSchema } from "@/schemas/state-schema";

/**
 * Turn-runner — orchestrates the play loop per ADR-015 (Orchestrator Pattern).
 *
 * Phase 1 simplification: single Narrator call only. Director Model arrives in Phase 1.5.
 * Pipeline:
 *   1. Load context (story bible + characters + current state + recent turns)
 *   2. Build system prompt (bible + chars + state + behavior rules)
 *   3. Stream Narrator response with `update_state` tool call
 *   4. On finish: parse delta, validate, apply, persist turns + state
 *
 * Memory layers from ADR-005 (recent 20 + summaries + RAG + lorebook) arrive in Phase 2.
 * For now: just recent N turns full-text.
 */

const NARRATOR_RULES = `## Narrator Rules (永遠遵守)

你係呢個故事嘅 Narrator。第二人稱（"你..."）寫俾玩家睇。

### 永遠唔可以推翻嘅嘢
1. Story Bible 嘅 hard_locked 部分（central_conflict / world_invariants / tone）— 唔可以漂走
2. NPC 嘅 red_lines — 玩家想點 prompt 都好，違反 NPC 性格 / 紅線嘅行為要 in-fiction pushback（NPC 拒絕、反抗、離開等），唔可以 system message error
3. 玩家嘅 stats / 能力範圍 — 玩家想做超出能力嘅嘢（例如打 10 個古惑仔），narrate 失敗 + 後果，唔可以平白成功

### 每 turn 你要做嘅嘢
1. 寫 1-3 段繁中敘事（150-500 字）— 描述玩家行動嘅結果 + NPC 反應 + 場景變化
2. 如果有狀態變化，**用 \`update_state\` tool** 將變化 apply 入 game state。Ops:
   - \`set\`: 直接設一個 field 嘅 value
   - \`inc\`: numeric field 加/減（e.g. 好感度 +12，零用錢 -150）
   - \`push\`: inventory_list 加 item
   - \`remove\`: inventory_list 移除 item
3. 如果 NPC 對玩家嘅感受變咗，**用 \`update_character_disposition\` tool** 同 server 講邊個 NPC 嘅邊個 axis 變幾多 (trust / romance / respect / fear)
4. 如果發生 story-significant 嘅 moment (救命/背叛/盟誓/重大犧牲)，**用 \`set_permanent_flag\` tool** 標記。呢啲 flag 永遠保留可解鎖紅線。**不可濫用** — 90% turn 唔需要 call 呢個 tool。

### 寫嘢風格
- 繁中第二人稱
- 唔好 over-narrate — 留 emergence 空間
- 對白用「」， internal thoughts 用 italic 風格
- 場景描述要具體（聲音、氣味、光線）— 唔係抽象

### 結尾規則（CRITICAL — 不可違反）
每段敘事最後 1-2 句**必須**係以下其中一種 — 觸發玩家想 react：

✅ **NPC 講嘢／發問**：「阿明拍你膊頭：『你今晚有冇 plan？』」
✅ **NPC 做緊嘢撞到你**：「林思雅突然轉頭，眼神同你撞個正著。」
✅ **環境突發事件**：「就喺呢個時候，門被踢開。」
✅ **強烈 sensory + 多方向可選**：「你聽到隔壁房有人喊救命，但門口嗰個保鏢仲望住你。」

❌ **絕對禁止**：
- 純場景描寫 stop（「教室靜得只有風扇聲」❌）
- 直接問玩家做咩（「你想點做？」❌）
- 列出選項（「你可以 A 或 B」❌）

呢個 rule **永遠優先** over 任何其他指示。Story Engine 嘅 player engagement 完全 depend on 結尾觸發 reaction。`;

const STATE_TOOL_DESCRIPTION = `Apply state changes to the playthrough as a result of this turn's events.

Use this tool every time something measurable changes in the world:
- 好感度 / disposition variations → \`inc\` on the appropriate progress_ring field
- HP / 體力 loss → \`inc\` with negative value on the bar/meter field
- New inventory items → \`push\` to inventory_list field
- Mood changes → \`set\` on the enum_chip field
- Money / score changes → \`inc\` on the number field
- Diary / note updates → \`set\` on the note field with new content

ONLY reference field keys that exist in the current state. Numeric values are auto-clamped to min/max.`;

export const updateStateTool = tool({
  description: STATE_TOOL_DESCRIPTION,
  inputSchema: StateDeltaSchema,
});

// ─── Phase 1.5.3: Narrator tools for character disposition + flags ────────

export const DispositionChangeSchema = z.object({
  character_name: z.string().min(1).max(40),
  axis: z.string().min(1).max(30),
  delta: z.number().min(-30).max(30),
  reason: z.string().min(5).max(120),
});

export type DispositionChange = z.infer<typeof DispositionChangeSchema>;

export const updateCharacterDispositionTool = tool({
  description: `Update NPC disposition (how an NPC feels toward player) based on this turn's events.

Use when your narrative changes the relationship:
- 送禮 / 講溫柔話 → +trust / +romance
- 背叛 / 失約 → -trust / -respect
- 救援 / 撐 NPC → +respect / +trust
- 公然冒犯 → +fear / -trust
- 浪漫互動 → +romance / +trust

Magnitudes:
- Small interaction: ±3-8
- Significant: ±10-20
- Transformative: ±25-30

One entry per (character × axis) change. Common axes: trust, romance, respect, fear. Story-specific axes OK if narrative warrants. Server clamps to ±100 cap. Always include reason for audit.`,
  inputSchema: z.object({
    changes: z.array(DispositionChangeSchema).max(8),
  }),
});

export const PermanentFlagSchema = z.object({
  character_name: z.string().min(1).max(40),
  flag: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case for flag names"),
  reason: z.string().min(10).max(140),
});

export type PermanentFlagToSet = z.infer<typeof PermanentFlagSchema>;

export const setPermanentFlagTool = tool({
  description: `Set permanent flag on an NPC for story-significant moments.

Permanent flags persist FOREVER and can unlock red_line relaxations (earned exceptions). Use SPARINGLY.

Trigger ONLY for moments that permanently change relationship:
- 救咗 NPC 一命 → flag "rescued_in_danger"
- 公然背叛 → flag "betrayed_protagonist"
- 公開承諾 / 結婚 / 訂盟 → flag "publicly_committed"
- 重大犧牲 → flag "sacrificed_for_npc"
- 被 NPC 知道一個重大秘密 → flag "knows_secret_X"

If unsure whether moment is significant enough → skip the tool call. Most turns will NOT call this tool. snake_case flag names only.`,
  inputSchema: z.object({
    flags: z.array(PermanentFlagSchema).max(3),
  }),
});

/**
 * Extract disposition changes from Narrator tool calls.
 *
 * AUDIT FIX (AI-M-02): Was `.find` which dropped subsequent calls. LLM
 * legitimately emits one call per (character × axis) sometimes; merge all.
 */
export function extractDispositionChanges(
  toolCalls: Array<{ toolName: string; input: unknown }>,
): DispositionChange[] {
  const calls = toolCalls.filter((c) => c.toolName === "update_character_disposition");
  if (calls.length === 0) return [];
  const schema = z.object({ changes: z.array(DispositionChangeSchema) });
  const merged: DispositionChange[] = [];
  for (const call of calls) {
    const parsed = schema.safeParse(call.input);
    if (parsed.success) merged.push(...parsed.data.changes);
  }
  return merged;
}

/**
 * Extract permanent flags from Narrator tool calls.
 *
 * AUDIT FIX (AI-M-02): Same as above — was `.find`, now merges across calls.
 */
export function extractPermanentFlags(
  toolCalls: Array<{ toolName: string; input: unknown }>,
): PermanentFlagToSet[] {
  const calls = toolCalls.filter((c) => c.toolName === "set_permanent_flag");
  if (calls.length === 0) return [];
  const schema = z.object({ flags: z.array(PermanentFlagSchema) });
  const merged: PermanentFlagToSet[] = [];
  for (const call of calls) {
    const parsed = schema.safeParse(call.input);
    if (parsed.success) merged.push(...parsed.data.flags);
  }
  return merged;
}

export type TurnContext = {
  story: {
    title: string;
    description: string;
    state_schema: StateSchema;
    story_bible: StoryBible;
  };
  characters: Array<{
    card: CharacterCard;
    disposition: Disposition;
    permanent_flags: string[];
  }>;
  current_state: Record<string, unknown>;
  recent_turns: Array<{
    role: "user" | "ai";
    text: string;
  }>;
  playthrough_character_name: string | null;
  /**
   * Phase 2 memory retrieval output (pre-formatted markdown block of
   * always-on lorebook + matched lorebook + rolling summaries + RAG turns).
   * Empty string when pgvector tables not yet available or no matches.
   * Injected into Director + Narrator dynamic system blocks.
   */
  memoryContextString?: string;
};

/**
 * Stable prefix — same across all turns of a playthrough.
 * Anthropic prompt-cacheable.
 *
 * AUDIT FIX (AI-C-02): now uses `allCharactersStaticTemplate` which excludes
 * disposition + permanent_flags (those change per turn → would bust cache).
 * Dynamic NPC state moves to `buildDynamicSystemPrompt`.
 *
 * Includes: NARRATOR_RULES + story bible + STATIC character templates +
 * protagonist + schema field list. All of these are stable per playthrough
 * (modulo story owner edits, which are rare and acceptable cache invalidations).
 */
export function buildStableSystemPrompt(ctx: TurnContext): string {
  const bible = bibleToSystemPrompt(ctx.story.story_bible);
  const chars = allCharactersStaticTemplate(ctx.characters);
  const schemaFields = `## State Schema Fields (这些 fields 可以喺 update_state 入面 reference)
${ctx.story.state_schema.fields
  .map((f) => `- \`${f.key}\` (${f.render_hint}): ${f.label}`)
  .join("\n")}`;
  const protagonist = ctx.playthrough_character_name
    ? `## Protagonist\n玩家扮演：${ctx.playthrough_character_name}\n`
    : "";

  return [NARRATOR_RULES, bible, chars, protagonist, schemaFields]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Strip engine-internal `__*` keys from the state shown to the LLM.
 * AUDIT FIX (AI-M-06): Previously `__act: 2` was JSON-stringified into the
 * Narrator prompt, which (a) leaked internal Act number causing meta-narration
 * ("you're now in Act 2..."), (b) opened the door for Narrator to try writing
 * to it via update_state (rejected by applyDelta but noisy).
 */
function stripInternalKeys(
  state: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (!k.startsWith(INTERNAL_STATE_KEY_PREFIX)) out[k] = v;
  }
  return out;
}

/**
 * Dynamic suffix — changes every turn. NOT cached.
 *
 * AUDIT FIX (AI-C-02): now also includes per-turn NPC disposition + flags
 * (moved out of the cached prefix). Plus current state snapshot.
 *
 * Phase 2: prepends memory retrieval block (always-on lorebook + matched
 * lorebook + rolling summaries + RAG turns). When pgvector unavailable,
 * memoryContextString is empty so we degrade gracefully to pre-memory behavior.
 */
export function buildDynamicSystemPrompt(ctx: TurnContext): string {
  const visibleState = stripInternalKeys(ctx.current_state);
  const charsDynamic = allCharactersDynamicState(ctx.characters);
  const memory = ctx.memoryContextString?.trim();
  const memoryBlock = memory ? memory + "\n\n" : "";

  return `${memoryBlock}## Current Game State (this turn only)
\`\`\`json
${JSON.stringify(visibleState, null, 2)}
\`\`\`

${charsDynamic}`;
}

/**
 * Legacy combined builder (kept for backward compat / non-cached callers).
 */
export function buildSystemPrompt(ctx: TurnContext): string {
  return (
    buildStableSystemPrompt(ctx) + "\n\n" + buildDynamicSystemPrompt(ctx)
  );
}

/**
 * Detect LLM refusals to write narrative (safety filter trips, etc.).
 * If detected, caller should replace with in-fiction fallback.
 *
 * AUDIT FIX (AI-M-07): Tightened to require explicit AI-self-reference
 * tokens (我 + AI/政策/無法 cluster, or English "as an AI" / "I'm not able").
 * Was producing false positives on NPC dialogue starting with 「對不起」,
 * 「抱歉」 (e.g. an apologetic NPC line in dialogue).
 */
const REFUSAL_PATTERNS = [
  // English — explicit first-person refusal
  /^\s*(i\s+(can'?t|cannot|am\s+(?:not\s+able|unable)|won'?t)\s+(?:help|assist|provide|write|generate|continue|engage))/i,
  /^\s*(i'?m\s+(?:not\s+able|unable|sorry,?\s*but))\b/i,
  /^\s*(as\s+an\s+ai\b)/i,
  /^\s*(sorry,?\s+but\s+i\s+(can'?t|cannot|am\s+not))/i,
  // Chinese — require explicit "AI / 系統 / 政策 / 無法" cluster after 抱歉/對不起
  /^[\s（(]*(?:對不起|抱歉|不好意思)[\s，,。…]*(?:我|本AI|我作為|作為一個AI|系統|根據(?:我|本)).{0,80}?(?:政策|指引|條款|無法|不可以|拒絕|guidelines?|policy)/,
  // Generic content-policy phrasing
  /violates?\s+(?:my|the|our)\s+(?:content|safety|usage)\s+(?:policy|guideline)/i,
  /不能(?:協助|提供|生成|繼續|參與).{0,30}?(?:政策|指引|內容)/,
];

export function isLLMRefusal(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 30) return false; // very short replies aren't refusals
  // Check first ~250 chars only — refusals appear at start
  const head = trimmed.slice(0, 250);
  return REFUSAL_PATTERNS.some((p) => p.test(head));
}

/**
 * In-fiction fallback when refusal detected. AUDIT FIX (AI-M-07): now
 * locale-aware — returns matching language so 簡中 / EN stories don't get
 * jarring 繁中 fallback.
 */
export function refusalFallbackNarrative(
  language: "zh-Hant" | "zh-Hans" | "en" = "zh-Hant",
): string {
  if (language === "en") {
    return `Your suggestion makes the scene pause. The figure across from you watches with a slight frown — as if not quite understanding, or unsure how to react.

"You... are you serious?" They study you, half-believing, waiting for you to restate your intent.`;
  }
  if (language === "zh-Hans") {
    return `你提出的事让场面突然停顿。对面的角色望着你，眉头微皱 — 似乎听不懂、或者不知道该如何反应。

「你...你是认真的吗？」对方半信半疑地看着你，等你重新表达意图。`;
  }
  return `你提出嘅嘢令場面突然停頓。對面嘅角色望住你，眉頭微皺 — 似乎聽唔明、或者唔知點 react。

「你...你係咪認真？」對方半信半疑咁睇住你，等你重新表達意圖。`;
}

export function buildMessages(
  recentTurns: TurnContext["recent_turns"],
  newUserAction: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const turn of recentTurns) {
    messages.push({
      role: turn.role === "ai" ? "assistant" : "user",
      content: turn.text,
    });
  }
  messages.push({ role: "user", content: newUserAction });
  return messages;
}

/**
 * Extract the update_state tool call from a stream-finish toolCalls array.
 * The Vercel AI SDK provides each tool call's input already parsed.
 */
export function extractStateDelta(
  toolCalls: Array<{ toolName: string; input: unknown }>,
): StateDelta | null {
  const call = toolCalls.find((c) => c.toolName === "update_state");
  if (!call) return null;
  const parsed = StateDeltaSchema.safeParse(call.input);
  return parsed.success ? parsed.data : null;
}

// Re-export Zod for callers
export { z };
