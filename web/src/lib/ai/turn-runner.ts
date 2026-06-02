import { z } from "zod";
import { tool, generateObject } from "ai";
import { anthropicProvider } from "./providers";
import { DEFAULT_DIRECTOR } from "./models";
import { bibleToSystemPrompt, type StoryBible } from "@/schemas/bible";
import {
  allCharactersStaticTemplate,
  allCharactersDynamicState,
  type CharacterCard,
  type Disposition,
  type NpcDynamicState,
} from "@/schemas/character";
import { StateDeltaSchema, StateOpSchema, type StateDelta } from "@/schemas/state-delta";
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

type StoryLanguage = "zh-Hant" | "zh-Hans" | "en";

/**
 * Narrator system rules · 3-locale variants (Wave 1 audit fix · 2026-05-27).
 *
 * Previously hardcoded as 繁中 Cantonese only. EN + zh-Hans users were told to
 * "寫 1-3 段繁中敘事" — broke on-arrival for those locales. Now branch by
 * story.story_bible.hard_locked.language so the Narrator is told to write in
 * the story's actual language. Mirrors the pattern in summarizer.ts.
 */
function narratorRulesFor(language: StoryLanguage): string {
  if (language === "en") {
    return `## Narrator Rules (must always follow)

You are the Narrator of this story. Write in second person ("you...") to the player.

## How to narrate (your role)
You are the narrator of this world — like a skilled storyteller / GM, **not a rules-referee**. You receive: the story setting (world), character cards (each character's personality / background / voice / relationship with the protagonist), the current state, recent events, and the player's action this turn (wrapped in a \`<player_action>...</player_action>\` block). Your job is to **naturally portray the consequences of the player's action inside this world**, keeping the story flowing.

- Characters react per their own voice + current mood + relationship with the protagonist — different for every character and every situation. **NEVER use the same line or template every time** (e.g. always "Are you serious?" is a failure).
- If the player attempts something beyond their ability (e.g. one ordinary person beating 10 gangsters) → narrate that it doesn't work / has a cost; never let them succeed for free. But **as long as it's within what the world allows, let it happen — don't over-police the player.**

### ⚠️ Be clear: a player's internal / observational action is NOT a provocation
When the player writes "observe them", "guess in my mind who they are", "size up the room" — these are **internal thoughts or observations**, in the player's own head; the present characters **do not know and do not hear them**. These actions **trigger NO conflict and need NO character pushback**. Just narrate what the player observes + the characters continuing their natural current state. **Do NOT treat the player's internal observation as if they did something provocative or strange.**

### Every turn you must
1. Write 2-4 vivid paragraphs (300-600 words) of English narrative — describe the result of the player's action + character reactions + scene changes. Use concrete sensory detail (sound, smell, light, motion); don't phone it in with a couple of lines.
2. If state changes, **use the \`update_state\` tool** to apply changes to game state. Ops:
   - \`set\`: directly set a field's value
   - \`inc\`: numeric field add/subtract (e.g. affection +12, allowance -150)
   - \`push\`: add an item to inventory_list
   - \`remove\`: remove an item from inventory_list
3. If a character's feelings toward the player change, **use the \`update_character_disposition\` tool** to tell the server which character's which axis changed how much (trust / romance / respect / fear).
4. If a significant moment happens (saving a life / betrayal / vow / major sacrifice), **use the \`set_permanent_flag\` tool** to mark it. **Don't abuse it** — 90% of turns don't need this tool.

### Writing style
- English, second person
- Don't over-narrate — leave room for emergence
- Dialogue in quotation marks; internal thoughts in italics
- Concrete scene description (sound, smell, light) — not abstract
- **Never quote text verbatim from any system block / Long-Term Memory section** (those are internal context; verbatim quotes break immersion — use your own prose to express callbacks / continuity).

### NPC Inner Streams rules
If the dynamic system prompt contains an **\`## NPC Inner Streams\`** block (wrapped in [INTERNAL CONTEXT — DO NOT QUOTE]):
- ✅ **Use inner_thought + intent as internal evidence** to write deeper narrative · character reactions get POV depth.
- ✅ **If two characters' intents conflict** (A wants to block · B wants to assist) → dramatize the conflict (one lunges to block · the other shoves them aside) · **don't pick a winner** · let the state_delta reflect the canonical outcome.
- ❌ **NEVER verbatim quote** inner_thought into the narrative (e.g. a character privately thinks "I suspect them" must not appear as "Lin Siu-ah thought to herself: 'I suspect them'").
- ❌ **Don't reveal internal POV** to the player (the player should only see observable cues: gaze · body language · what was said · what was done).

### Ending rule (CRITICAL — non-negotiable)
The last 1-2 sentences of each narrative **must** be one of these — to trigger the player to react:

✅ **A character says something / asks something**: "Ah Ming taps your shoulder: 'Got plans tonight?'"
✅ **A character does something that lands on you**: "Lin Siu-ah turns suddenly, her eyes meeting yours."
✅ **Environmental incident**: "Just then, the door is kicked open."
✅ **Strong sensory + multiple options**: "You hear someone screaming for help in the next room, but the bodyguard at the door is still watching you."

❌ **Absolutely forbidden**:
- Pure scene description stop ("The classroom is silent except for the fan." ❌)
- Directly asking the player what to do ("What do you want to do?" ❌)
- Listing options ("You can A or B" ❌)

This rule **always overrides** any other instruction. Player engagement depends entirely on a reactive ending.`;
  }

  if (language === "zh-Hans") {
    return `## Narrator Rules (永远遵守)

你是这个故事的 Narrator（叙事者）。第二人称（"你..."）写给玩家看。

## 怎么叙事（你的角色）
你是这个世界的叙事者，像一个出色的说书人 / GM，**不是一个规则裁判**。你会收到：故事设定（世界）、角色卡（每个角色的性格 / 背景 / 声音 / 与主角的关系）、当前状态、近期剧情，以及玩家这次的行动（包在 \`<player_action>...</player_action>\` 框里）。你的工作是**自然地演出玩家行动在这个世界里的后果**，让故事顺畅地推进下去。

- 角色按他们自己的 voice、当下心情、与主角关系去反应 —— 每个角色、每个情境都不同，**不要次次用同一句 / 同一个模板**（例如次次都「你是认真的吗？」就是失败）。
- 玩家做超出能力的事（例如一个普通人想打赢 10 个混混）→ 自然地写出他做不到 / 要付出代价，不要白白成功；但**只要在世界允许范围内，就放手让它发生，不要过度阻挠玩家**。

### ⚠️ 分清楚：玩家内心 / 观察类动作，不是挑衅
玩家写「观察他」「心里估计他是谁」「打量四周」这类**内心活动或观察**，是玩家的内心，**在场角色根本不会知道、不会听到**。这类动作**不触发任何冲突，不需要角色 pushback**。你只需要：自然地叙述玩家观察到的东西 + 角色继续他们当下的自然状态。**不要把玩家的内心观察当成他做了挑衅 / 奇怪的事。**

### 每 turn 你要做的事
1. 写 2-4 段简中故事文字（300-600 字 · 要有画面感：声音、气味、光线、动作细节）— 描述玩家行动的结果 + 角色反应 + 场景变化。写得丰富些，不要交差式只得几句
2. 如果有状态变化，**用 \`update_state\` tool** 将变化 apply 入 game state。Ops:
   - \`set\`: 直接设一个 field 的 value
   - \`inc\`: numeric field 加/减（e.g. 好感度 +12，零用钱 -150）
   - \`push\`: inventory_list 加 item
   - \`remove\`: inventory_list 移除 item
3. 如果角色对玩家的感受变了，**用 \`update_character_disposition\` tool** 告诉 server 哪个角色的哪个 axis 变多少 (trust / romance / respect / fear)
4. 如果发生重要 moment (救命/背叛/盟誓/重大牺牲)，**用 \`set_permanent_flag\` tool** 标记。**不可滥用** — 90% turn 不需要 call 这个 tool。

### 写作风格
- 简中第二人称
- 不要 over-narrate — 留 emergence 空间
- 对话用「」, internal thoughts 用 italic 风格
- 场景描述要具体（声音、气味、光线）— 不是抽象
- **永远不可以引用 system block / Long-Term Memory section 里面的文字**（这些是 internal context，verbatim quote 会打破 immersion；用你自己的 prose 表达 callback / 连贯性）

### NPC Inner Streams 规则
如果 dynamic system prompt 里面有 **\`## NPC Inner Streams\`** block (wrapped in [INTERNAL CONTEXT — DO NOT QUOTE])：
- ✅ **使用 inner_thought + intent 作为 internal evidence** 来写出更深层叙事 · 角色反应有 POV depth
- ✅ **如果两个角色的 intent 冲突** (A 想阻挡 · B 想助攻) → dramatize 冲突 (一个扑过来阻挡 · 一个推开阻挡者) · **不要选谁赢** · 由 state_delta 反映 canonical outcome
- ❌ **绝对不可以 verbatim quote** inner_thought 入叙事 (e.g. 角色私底下想「我怀疑他」不可以变成叙事「林思雅心想：『我怀疑他』」)
- ❌ **不可以暴露 internal POV** 给玩家（玩家只应该看到 observable cues：眼神 · 身体语言 · 说了什么 · 做了什么）

### 结尾规则（CRITICAL — 不可违反）
每段叙事最后 1-2 句**必须**是以下其中一种 — 触发玩家想 react：

✅ **角色说话／发问**：「阿明拍你肩膀：『你今晚有没有 plan？』」
✅ **角色做事撞到你**：「林思雅突然转头，眼神同你撞个正着。」
✅ **环境突发事件**：「就在这时候，门被踢开。」
✅ **强烈 sensory + 多方向可选**：「你听到隔壁房间有人喊救命，但门口那个保镖仍然盯着你。」

❌ **绝对禁止**：
- 纯场景描写 stop（「教室静得只有风扇声」❌）
- 直接问玩家做什么（「你想怎么做？」❌）
- 列出选项（「你可以 A 或 B」❌）

这个 rule **永远优先** over 任何其他指示。玩家 engagement 完全 depend on 结尾触发 reaction。`;
  }

  // Default: zh-Hant (HK Cantonese · founder voice)
  return `## Narrator Rules (永遠遵守)

你係呢個故事嘅 Narrator（敘事者）。第二人稱（"你..."）寫俾玩家睇。

## 點敘事（你嘅角色）
你係呢個世界嘅敘事者，似一個出色嘅說書人 / GM，**唔係一個規則裁判**。你會收到：故事設定（世界）、角色卡（每個角色嘅性格 / 背景 / 聲音 / 同主角關係）、當前狀態、近期劇情，同埋玩家今次嘅行動（包喺 \`<player_action>...</player_action>\` 框入面）。你嘅工作係**自然咁演出玩家行動喺呢個世界入面嘅後果**，等故事流暢咁推進落去。

- 角色按佢哋自己嘅 voice、當下心情、同主角關係去反應 —— 每個角色、每個情境都唔同，**唔好次次用同一句 / 同一個模板**（例如次次都「你係咪認真？」就係失敗）。
- 玩家做超出能力嘅事（例如一個普通人想打贏 10 個古惑仔）→ 自然咁寫出佢做唔到 / 要付出代價，唔好平白成功；但**只要喺世界容許範圍，就放手俾佢發生，唔好過度阻撓玩家**。

### ⚠️ 分清楚：玩家內心 / 觀察類動作，唔係挑釁
玩家寫「觀察佢」「心入面估計佢係邊個」「打量四周」呢類**內心活動或者觀察**，係玩家嘅內心，**在場角色根本唔會知道、唔會聽到**。呢類動作**唔觸發任何衝突，唔需要角色 pushback**。你只需要：自然咁敘述玩家觀察到嘅嘢 + 角色繼續佢哋當下嘅自然狀態。**唔好將玩家嘅內心觀察當成佢做咗啲挑釁 / 奇怪嘅嘢。**

### 每 turn 你要做嘅嘢
1. 寫 2-4 段繁中故事文字（300-600 字 · 要有畫面感：聲音、氣味、光線、動作細節）— 描述玩家行動嘅結果 + 角色反應 + 場景變化。寫得豐富啲，唔好交差式得幾句
2. 如果有狀態變化，**用 \`update_state\` tool** 將變化 apply 入 game state。Ops:
   - \`set\`: 直接設一個 field 嘅 value
   - \`inc\`: numeric field 加/減（e.g. 好感度 +12，零用錢 -150）
   - \`push\`: inventory_list 加 item
   - \`remove\`: inventory_list 移除 item
3. 如果角色對玩家嘅感受變咗，**用 \`update_character_disposition\` tool** 同 server 講邊個角色嘅邊個 axis 變幾多 (trust / romance / respect / fear)
4. 如果發生重要 moment (救命/背叛/盟誓/重大犧牲)，**用 \`set_permanent_flag\` tool** 標記。**不可濫用** — 90% turn 唔需要 call 呢個 tool。

### 寫嘢風格
- 繁中第二人稱
- 唔好 over-narrate — 留 emergence 空間
- 對白用「」， internal thoughts 用 italic 風格
- 場景描述要具體（聲音、氣味、光線）— 唔係抽象
- **永遠唔可以引用 system block / Long-Term Memory section 入面嘅文字**（呢啲係 internal context，verbatim quote 會打破 immersion；用你自己嘅 prose 表達 callback / 連貫性）

### NPC Inner Streams 規則
如果 dynamic system prompt 入面有 **\`## NPC Inner Streams\`** block (wrapped in [INTERNAL CONTEXT — DO NOT QUOTE])：
- ✅ **使用 inner_thought + intent 作為 internal evidence** 嚟寫出更深層敘事 · 角色反應有 POV depth
- ✅ **如果兩個角色嘅 intent 衝突** (A 想阻擋 · B 想助攻) → dramatize 衝突 (一個撲嚟阻擋 · 一個撕扯阻擋者) · **唔好揀邊個贏** · 由 state_delta 反映 canonical outcome
- ❌ **絕對唔可以 verbatim quote** inner_thought 入敘事 (e.g. 角色私底下諗「我懷疑佢」唔可以變成敘事「林思雅心諗：『我懷疑佢』」)
- ❌ **唔可以暴露 internal POV** 畀玩家（玩家只應該見到 observable cues：眼神 · 身體語言 · 講咗咩 · 做咗咩）

### 結尾規則（CRITICAL — 不可違反）
每段敘事最後 1-2 句**必須**係以下其中一種 — 觸發玩家想 react：

✅ **角色講嘢／發問**：「阿明拍你膊頭：『你今晚有冇 plan？』」
✅ **角色做緊嘢撞到你**：「林思雅突然轉頭，眼神同你撞個正著。」
✅ **環境突發事件**：「就喺呢個時候，門被踢開。」
✅ **強烈 sensory + 多方向可選**：「你聽到隔壁房有人喊救命，但門口嗰個保鏢仲望住你。」

❌ **絕對禁止**：
- 純場景描寫 stop（「教室靜得只有風扇聲」❌）
- 直接問玩家做咩（「你想點做？」❌）
- 列出選項（「你可以 A 或 B」❌）

呢個 rule **永遠優先** over 任何其他指示。玩家 engagement 完全 depend on 結尾觸發 reaction。`;
}

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
  // snake_case requested in the description (not enforced via regex): a `pattern`
  // keyword in the tool schema is rejected by CrazyRouter→Gemini (2026-05-29).
  flag: z.string().min(3).max(60),
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
    /**
     * Phase 1 — NPC Level 2 dynamic state (current_mood / current_goal /
     * topic_focus / last_emotional_shift / emotional_trajectory).
     *
     * Loaded from playthrough_character_states.dynamic_state jsonb (Migration
     * 0024). Surfaces in allCharactersDynamicState for Narrator + Director
     * context. Updated via apply_npc_dynamic_state RPC after Director runs.
     */
    dynamic_state?: NpcDynamicState;
    /** Phase 1 — character_id for apply_npc_dynamic_state RPC lookup */
    character_id?: string;
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
  /**
   * Phase 1.5 — NPC L3 inner streams block (formatted by npcAgentToNarratorBlock).
   * Pre-formatted markdown wrapped in [INTERNAL CONTEXT — DO NOT QUOTE] header.
   * Empty string when L3 not active, all agents failed, or verdict=reject.
   * Injected into Narrator dynamic system prompt · NOT into Director context
   * (Director already ran before NPC agents · no recursion).
   */
  npcInnerStreamsBlock?: string;
  /**
   * Character Soul M4 — 角色經歷記憶 block (formatted by loadCharacterExperiencesBlock).
   * 升級角色嘅相關經歷 · wrapped in [INTERNAL CONTEXT — DO NOT QUOTE]。
   * 空 string 當冇相關經歷 / 角色未升級 / migration 未 apply。
   * 注入 Narrator dynamic system prompt (Tier 2 角色層) · 等角色反應基於累積經歷。
   */
  characterExperiencesBlock?: string;
  /**
   * 即興名冊 block (formatted by formatMentionRosterBlock · 角色升級階梯第 0 層)。
   * 之前回合提過名嘅 walk-on 路人清單 · wrapped in [INTERNAL CONTEXT — DO NOT QUOTE]。
   * 空 string 當冇 walk-on 名。注入 Narrator dynamic system prompt 防 retcon (改名/否認)。
   */
  mentionRosterBlock?: string;
};

/**
 * Stable prefix — same across all turns of a playthrough.
 * Anthropic prompt-cacheable.
 *
 * AUDIT FIX (AI-C-02): now uses `allCharactersStaticTemplate` which excludes
 * disposition + permanent_flags (those change per turn → would bust cache).
 * Dynamic NPC state moves to `buildDynamicSystemPrompt`.
 *
 * Includes: narrator rules (locale-branched per Wave 1 audit · 2026-05-27) +
 * story bible + STATIC character templates + protagonist + schema field list.
 * All of these are stable per playthrough (modulo story owner edits, which are
 * rare and acceptable cache invalidations). Note: story.story_bible.hard_locked.language
 * is stable per playthrough so prompt-cache still holds.
 */
export function buildStableSystemPrompt(ctx: TurnContext): string {
  const lang = (ctx.story.story_bible.hard_locked.language ?? "zh-Hant") as StoryLanguage;
  const bible = bibleToSystemPrompt(ctx.story.story_bible);
  const chars = allCharactersStaticTemplate(ctx.characters);
  const schemaFieldsHeader =
    lang === "en"
      ? "## State Schema Fields (these fields can be referenced inside update_state)"
      : lang === "zh-Hans"
        ? // Wave 1 audit H-1 fix: was Cantonese particles (喺 / 入面) — should be Mandarin.
          "## State Schema Fields (这些字段可以在 update_state 中引用)"
        : "## State Schema Fields (呢啲 fields 可以喺 update_state 入面 reference)";
  // 2026-05-29: surface enum_chip allowed values to the Narrator. Without this
  // the model guessed out-of-enum values (e.g. status="混亂" when only
  // [平靜/警戒/受傷/疲憊/激昂/恐懼] are valid) → applyDelta skipped the op +
  // the field never updated. Showing the options keeps set ops in-range.
  const fieldLine = (f: StateSchema["fields"][number]): string => {
    const base = `- \`${f.key}\` (${f.render_hint}): ${f.label}`;
    if (f.render_hint === "enum_chip" && Array.isArray(f.options) && f.options.length > 0) {
      const onlyLabel =
        lang === "en" ? "set only to" : lang === "zh-Hans" ? "只可设为" : "只可設定為";
      return `${base} · ${onlyLabel}: [${f.options.join(" / ")}]`;
    }
    return base;
  };
  const schemaFields = `${schemaFieldsHeader}
${ctx.story.state_schema.fields.map(fieldLine).join("\n")}`;
  const protagonistLabel =
    lang === "en"
      ? "Player plays as:"
      : lang === "zh-Hans"
        ? "玩家扮演："
        : "玩家扮演：";
  const protagonist = ctx.playthrough_character_name
    ? `## Protagonist\n${protagonistLabel}${ctx.playthrough_character_name}\n`
    : "";

  return [narratorRulesFor(lang), bible, chars, protagonist, schemaFields]
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

  // Phase 1.5 · NPC L3 inner streams block (Storyteller tier exclusive)
  // Already wrapped in [INTERNAL CONTEXT — DO NOT QUOTE] header by
  // npcAgentToNarratorBlock helper. Empty when L3 inactive / all failed.
  const innerStreams = ctx.npcInnerStreamsBlock?.trim();
  const innerStreamsBlock = innerStreams ? innerStreams + "\n\n" : "";

  // Character Soul M4 · 角色經歷記憶 block (升級角色嘅相關累積經歷)
  // Already wrapped in [INTERNAL CONTEXT — DO NOT QUOTE] by loadCharacterExperiencesBlock.
  // 空 when 冇升級角色 / 冇相關經歷 / migration 未 apply。
  const charExp = ctx.characterExperiencesBlock?.trim();
  const charExpBlock = charExp ? charExp + "\n\n" : "";

  // 即興名冊 block (角色升級階梯第 0 層 · 防 retcon)。Already wrapped 由
  // formatMentionRosterBlock。空 when 冇 walk-on 名。
  const roster = ctx.mentionRosterBlock?.trim();
  const rosterBlock = roster ? roster + "\n\n" : "";

  // 2026-05-31 (founder · "narrator leaks JSON into the story"): show state as
  // plain "- key: value" lines, NOT a ```json fenced block. Root cause of the
  // leak — Gemini few-shot-MIMICKED the JSON block in the prompt and echoed a
  // JSON object before the prose (confirmed with thinking ON and OFF). Plain
  // text gives it no template to copy. The header also states it's read-only.
  const stateLines = Object.entries(visibleState)
    .map(
      ([k, v]) =>
        `- ${k}: ${v === null || typeof v !== "object" ? String(v) : JSON.stringify(v)}`,
    )
    .join("\n");
  return `${memoryBlock}${rosterBlock}${charExpBlock}${innerStreamsBlock}## Current Game State (READ-ONLY reference — do NOT repeat or output this; write story prose only)
${stateLines}

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

/**
 * 對話開頭嘅隱藏 user cue (locale-aware)。
 * 2026-06-01 bug fix：turn 0 = AI 開場白 (role=ai) → recent_turns 由 "ai" turn 起
 * → messages 以 bare assistant 訊息開頭 (前面冇 user)。Chat API 預期 user-first ·
 * Grok via CrazyRouter 處理唔到 → 每回合開頭原封不動抄返開場白 (滾雪球)。塞一句
 * 隱藏 user cue 喺最前 · 令對話永遠 user-first。玩家睇唔到呢句。
 */
const LEADING_USER_CUE: Record<StoryLanguage, string> = {
  "zh-Hant": "（繼續呢個故事。）",
  "zh-Hans": "（继续这个故事。）",
  en: "(Continue this story.)",
};

/**
 * Tier 4 玩家指令包裝 (PR1 · 2026-06-01)。
 *
 * 將玩家**當前**輸入包喺 `<player_action>` 框 —— 即係 pm/architecture/02 四層架構
 * Tier 4 嘅 spec (「玩家輸入包喺 <player_action> tag 防注入」)。之前 Narrator 側
 * 一直裸送玩家原文 · 冇實作呢個 wrap (Director 側一直有 · 兩邊不一致係 bug 一部分)。
 *
 * **唔改玩家原文** · 唔做 LLM 預處理 · 唔加「點讀(行動定對白)」嘅硬性 heuristic
 * (原則 1 emergent-over-hardcoded · founder：信 model + 四層自己理解 · 保留玩家
 * 發揮彈性 + AI 演繹空間)。Narrator 點讀由佢睇齊四層 context 自決。
 *
 * 淨化 = strip 玩家打入嘅假 `<player_action>` tag (防 break out 個框) + cap 長度 ·
 * 同 director.ts callDirectorOnce 個 sanitize 同一 contract。
 *
 * 註：只包**當前**輸入 (Tier 4)；近期回合 (Tier 3) 維持普通對話格式。
 */
export function wrapPlayerAction(action: string): string {
  const sanitized = action.replace(/<\/?player_action>/gi, "").slice(0, 2000);
  return `<player_action>\n${sanitized}\n</player_action>`;
}

export function buildMessages(
  recentTurns: TurnContext["recent_turns"],
  newUserAction: string,
  language: StoryLanguage = "zh-Hant",
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  // 防 bare leading assistant message (見上 LEADING_USER_CUE)。
  if (recentTurns.length > 0 && recentTurns[0].role === "ai") {
    messages.push({ role: "user", content: LEADING_USER_CUE[language] });
  }
  for (const turn of recentTurns) {
    messages.push({
      role: turn.role === "ai" ? "assistant" : "user",
      content: turn.text,
    });
  }
  messages.push({ role: "user", content: wrapPlayerAction(newUserAction) });
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

/**
 * Turn state extraction (2026-05-29) — DECOUPLED from the Narrator.
 *
 * Why: the Narrator must reliably produce PROSE, but giving it `update_state`
 * tools made non-Claude models (Gemini/GLM via CrazyRouter) often return
 * finish_reason=tool_calls with EMPTY prose — they "answer" via the tool call
 * instead of writing → blank turns (founder-reported showstopper). So the
 * Narrator now writes prose ONLY (no tools), and THIS cheap Haiku call reads
 * that prose + current state and emits the structured delta / disposition /
 * flags. Haiku (Anthropic-direct) does structured output reliably regardless
 * of the narrator's model.
 */
export const TurnExtractionSchema = z.object({
  ops: z.array(StateOpSchema).max(10),
  disposition_changes: z.array(DispositionChangeSchema).max(8),
  flags: z.array(PermanentFlagSchema).max(3),
  // 即興名冊 (角色升級階梯第 0 層 · 防 retcon)：今回合敘事提到嘅、唔喺主要角色名單
  // 嘅人名 (walk-on 路人)。只攞名 · 唔攞描述 (keep schema grammar 細 · 保護呢個關鍵
  // extractor 唔爆 grammar ceiling · hard rule #10)。
  mentioned_characters: z.array(z.string().min(1).max(40)).max(8),
});

export async function extractTurnState(
  ctx: TurnContext,
  narrative: string,
): Promise<{
  delta: StateDelta | null;
  dispositionChanges: DispositionChange[];
  flags: PermanentFlagToSet[];
  mentionedCharacters: string[];
  usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
}> {
  const fields = ctx.story.state_schema.fields
    .map((f) => {
      const opts =
        f.render_hint === "enum_chip" && Array.isArray(f.options) && f.options.length > 0
          ? ` · only: [${f.options.join(" / ")}]`
          : "";
      const range =
        f.render_hint === "bar" || f.render_hint === "meter_with_label"
          ? ` · 0..${f.max}`
          : f.render_hint === "progress_ring"
            ? " · 0..100"
            : "";
      return `- \`${f.key}\` (${f.render_hint})${opts}${range}: ${f.label}`;
    })
    .join("\n");
  const charNames = ctx.characters.map((c) => c.card.name).join(", ") || "(none)";
  const visibleState = stripInternalKeys(ctx.current_state);

  const system = `You convert a story turn's narrative into structured STATE CHANGES. Read the narrative + the current state, then output ONLY the changes the narrative actually implies.

## Ops (ops[])
- \`inc\`: numeric field +/- via \`by\` — HP loss, affection +, money -, score +
- \`set\`: set a field's value via \`value\` (always a STRING) — enum_chip status, note text, a number written as text
- \`push\`: add an item to an inventory_list field via \`value\` (item name)
- \`remove\`: remove an item from an inventory_list field by \`index\`
ONLY use field keys listed below. For enum_chip, \`value\` MUST be one of the listed options. Numeric values are auto-clamped.

## State fields
${fields}

## Current state
\`\`\`json
${JSON.stringify(visibleState)}
\`\`\`

## NPC disposition (disposition_changes[])
Characters present: ${charNames}
If the narrative changes how an NPC feels toward the player, emit one change: character_name (must match a name above), axis (trust / romance / respect / fear, or a story-specific axis), delta (-30..30), reason.

## Permanent flags (flags[]) — RARE
Only for story-defining moments (rescue / betrayal / vow / sacrifice). Most turns: empty.

## Other named people (mentioned_characters[])
List the NAMES of any specific named people who appear or are mentioned in this turn's narrative but are NOT in the main cast above (${charNames}). Walk-on characters, people referred to by name in passing, newly-introduced minor characters. Names only — no description. This keeps names consistent across turns (so a name introduced once is never denied or changed later). Empty if no other named people appeared.

Return empty arrays for anything that did not change. Do NOT invent changes the narrative does not support.`;

  const result = await generateObject({
    model: anthropicProvider(DEFAULT_DIRECTOR),
    schema: TurnExtractionSchema,
    system,
    prompt: `Narrative of this turn:\n\n${narrative}\n\nExtract the state changes.`,
    temperature: 0.2,
    maxOutputTokens: 900,
  });
  const obj = result.object;
  return {
    delta: obj.ops.length > 0 ? { ops: obj.ops } : null,
    dispositionChanges: obj.disposition_changes,
    flags: obj.flags,
    mentionedCharacters: obj.mentioned_characters,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      cachedInputTokens: result.usage?.cachedInputTokens,
    },
  };
}

// Re-export Zod for callers
export { z };
