import { generateObject } from "ai";
import { anthropicProvider } from "./providers";
import { DEFAULT_DIRECTOR } from "./models";
import { VerdictSchema, type Verdict } from "@/schemas/director";
import { bibleToSystemPrompt } from "@/schemas/bible";
import { allCharactersToSystemPrompt } from "@/schemas/character";
import type { TurnContext } from "./turn-runner";

/**
 * Director Model — the first LLM call in each turn pipeline (ADR-015 Orchestrator).
 *
 * Cheap model (Haiku) 审 the player's intended action against:
 *   - Story Bible hard_locked rules
 *   - Each NPC's red_lines + current disposition + earned permanent_flags
 *   - Current game state
 *
 * Outputs a structured verdict the Narrator must respect.
 *
 * Cost: ~$0.001/turn (Haiku 4.5). ~30% turn cost overhead vs Narrator only.
 * Quality benefit: catches "yes-man AI" cases — NPC red lines enforced,
 * impossible actions get in-fiction pushback instead of permissive narrative.
 */

const DIRECTOR_SYSTEM = `你係 Story Engine 嘅 **Director**。每個 turn，Narrator 寫敘事之前，你要審視玩家嘅 action 對住故事規則嘅 compliance。

你嘅責任：
1. **守住 Story Bible hard_locked**：central_conflict、world_invariants、tone — 永遠唔可以推翻
2. **守住 NPC red_lines**：除非有 permanent_flag 解鎖 (earned exception)
3. **判斷 player action 嘅 plausibility**：玩家能力上限 vs 嘗試難度
4. **判斷 story arc drift**：玩家係咪繞過 critical narrative moment

對玩家每個 action 你只可以輸出 4 種 verdict 之一：

### 1. \`allow\` (大部分情況)
Action 合理，冇違反 bible / red lines，玩家能力足夠。Narrator 正常 narrate。

### 2. \`reject\` (action 直接違反 hard rule)
玩家 prompt 試圖：
- 推翻 world invariants (e.g. 召喚魔法但故事係寫實向)
- 突破 NPC red line (e.g. 第 3 turn 同林思雅求婚，紅線「唔接受快速進展」)
- 違反 tone (e.g. 戀愛故事突然殺人)

輸出 reject + 講邊個 character 受影響 + pushback hint (Narrator 寫 in-fiction NPC 反抗)。
**唔可以**「reject」 因為 action 太大膽 — bold 但合理嘅 action 仍然 allow。Reject 嘅 bar 係 clear rule violation。

### 3. \`allow_with_constraint\` (action 可以，但有後果)
Action 合理但有 cost：e.g. 玩家行動會 hurt HP / damage 好感度 / cost money。
輸出 constraint description — Narrator 必須喺敘事入面 incorporate。

### 4. \`require_skill_check\` (action 結果未定，需要擲骰)
玩家試嘅嘢有 risk + 結果由 skill 決定：e.g. 戰鬥（戰鬥力 vs 對手）、口才說服 (口才 vs 拒絕度)。
指定 skill_key (對應 state field), difficulty (5=easy 25=超難), 成功/失敗 consequence hints。

⚠️ Bias 應該 lean \`allow\` — 玩家 agency 重要。只有清楚 rule 違反先 reject。Skill check 用喺真係 uncertain outcome 嗰種 risky action，唔係日常對白。`;

export async function callDirector(
  ctx: TurnContext,
  userAction: string,
): Promise<Verdict> {
  const bible = bibleToSystemPrompt(ctx.story.story_bible);
  const chars = allCharactersToSystemPrompt(ctx.characters);
  const protagonist = ctx.playthrough_character_name
    ? `Protagonist: ${ctx.playthrough_character_name}`
    : "";

  const recentContextLines = ctx.recent_turns
    .slice(-6) // last 6 turns of context (3 user + 3 AI)
    .map((t, i) => `[${i}] ${t.role === "user" ? "Player" : "Narrator"}: ${t.text.slice(0, 200)}${t.text.length > 200 ? "..." : ""}`)
    .join("\n");

  const stateSnapshot = JSON.stringify(ctx.current_state, null, 2);

  // Stable prefix — cacheable across turns
  const stableContext = [
    bible,
    chars,
    protagonist,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Dynamic — per-turn
  const dynamicContext = `## Current State
\`\`\`json
${stateSnapshot}
\`\`\`

## Recent Turns (chronological)
${recentContextLines || "(none yet — this is the first user action)"}

## Player's Proposed Action
"${userAction}"

請輸出你嘅 verdict。`;

  const result = await generateObject({
    model: anthropicProvider(DEFAULT_DIRECTOR),
    schema: VerdictSchema,
    messages: [
      {
        role: "system",
        content: DIRECTOR_SYSTEM + "\n\n" + stableContext,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      {
        role: "user",
        content: dynamicContext,
      },
    ],
    temperature: 0.3, // low — Director should be deterministic-ish
    maxOutputTokens: 800,
  });

  return result.object;
}
