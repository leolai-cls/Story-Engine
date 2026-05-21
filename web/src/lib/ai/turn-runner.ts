import { z } from "zod";
import { tool } from "ai";
import { bibleToSystemPrompt, type StoryBible } from "@/schemas/bible";
import {
  allCharactersToSystemPrompt,
  type CharacterCard,
  type Disposition,
} from "@/schemas/character";
import { StateDeltaSchema, type StateDelta } from "@/schemas/state-delta";
import type { StateSchema } from "@/schemas/state-schema";

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

### 寫嘢風格
- 繁中第二人稱
- 唔好 over-narrate — 留 emergence 空間，玩家想做下一步
- 對白用「」， internal thoughts 用 italic 風格
- 場景描述要具體（聲音、氣味、光線）— 唔係抽象

### 結尾留 hook
每段敘事 end with：
- 一個 NPC 反應 / 提問
- 一個環境變化
- 玩家有得 react 嘅 moment

唔好直接問 "你想做咩?"。寫到留有自然 next action 嘅空間就 OK。`;

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
};

export function buildSystemPrompt(ctx: TurnContext): string {
  const bible = bibleToSystemPrompt(ctx.story.story_bible);
  const chars = allCharactersToSystemPrompt(ctx.characters);
  const stateSnapshot = `## Current Game State
\`\`\`json
${JSON.stringify(ctx.current_state, null, 2)}
\`\`\`

State schema fields:
${ctx.story.state_schema.fields
  .map(
    (f) =>
      `- \`${f.key}\` (${f.render_hint}): ${f.label}${"description" in f && f.description ? ` — ${f.description}` : ""}`,
  )
  .join("\n")}`;

  const protagonist = ctx.playthrough_character_name
    ? `## Protagonist\n玩家扮演：${ctx.playthrough_character_name}\n`
    : "";

  return [
    NARRATOR_RULES,
    bible,
    chars,
    protagonist,
    stateSnapshot,
  ]
    .filter(Boolean)
    .join("\n\n");
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
