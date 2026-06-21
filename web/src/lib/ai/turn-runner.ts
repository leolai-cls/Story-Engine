import { z } from "zod";
import { generateObject } from "ai";
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
import { StateOpSchema, type StateDelta } from "@/schemas/state-delta";
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

### Every turn
Write 2-4 vivid paragraphs (300-600 words) of English narrative — the result of the player's action + character reactions + scene changes. Ground it in concrete sensory detail, but **vary your sensory entry point from turn to turn** (sometimes sound, sometimes touch, sometimes rhythm or silence) — don't stack the same sense-group (sound/smell/light) every single turn, and in calm or static scenes write sparingly rather than piling on texture. Don't phone it in with a couple of lines.

**Output STORY PROSE ONLY.** Never write JSON, tool calls, function calls, field names, or any \`{...}\` / \`update_state\` / \`update_character_disposition\` / \`set_permanent_flag\` text — the game state is tracked automatically by the system from your narrative. Just tell the story.

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
写 2-4 段简中故事文字（300-600 字）— 描述玩家行动的结果 + 角色反应 + 场景变化。要有画面感，但**每回合换一个不同的切入点**（有时声音、有时触感、有时节奏或静默）—— 不要每回合都堆同一组感官（声 / 气味 / 光），平静或静止的场景写得简约些，不要硬叠细节。写得丰富些，不要交差式只得几句。

**只输出故事文字。** 绝对不要写 JSON、tool call、function call、字段名，或任何 \`{...}\` / \`update_state\` / \`update_character_disposition\` / \`set_permanent_flag\` 之类的东西 —— 游戏状态由系统自动从你的叙事里读取，你只管讲故事。

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
寫 2-4 段繁中故事文字（300-600 字）— 描述玩家行動嘅結果 + 角色反應 + 場景變化。要有畫面感，但**每回合揀一個唔同嘅切入點**（有時聲音、有時觸感、有時節奏或者靜默）—— 唔好每回合都堆同一組感官（聲 / 氣味 / 光），平靜或者靜止嘅場景寫得簡約啲，唔好硬疊細節。寫得豐富啲，唔好交差式得幾句。

**只輸出故事文字。** 絕對唔好寫 JSON、tool call、function call、欄位名，或者任何 \`{...}\` / \`update_state\` / \`update_character_disposition\` / \`set_permanent_flag\` 之類嘅嘢 —— 遊戲狀態由系統自動喺你嘅敘事入面讀返，你只管講故事。

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

// C2 cleanup (2026-06-08 · audit): the Narrator tool definitions
// (updateStateTool / updateCharacterDispositionTool / setPermanentFlagTool) and
// their toolCalls extractors (extractStateDelta / extractDispositionChanges /
// extractPermanentFlags) are removed — the Narrator has been prose-only since
// 2026-05-29 (tools made CrazyRouter models emit empty prose); all state /
// disposition / flag changes come from the post-hoc extractTurnState pass below.
// The SCHEMAS stay (TurnExtractionSchema reuses them).

export const DispositionChangeSchema = z.object({
  character_name: z.string().min(1).max(40),
  axis: z.string().min(1).max(30),
  delta: z.number().min(-30).max(30),
  reason: z.string().min(5).max(120),
});

export type DispositionChange = z.infer<typeof DispositionChangeSchema>;

export const PermanentFlagSchema = z.object({
  character_name: z.string().min(1).max(40),
  // snake_case requested in the description (not enforced via regex): a `pattern`
  // keyword in the tool schema is rejected by CrazyRouter→Gemini (2026-05-29).
  flag: z.string().min(3).max(60),
  reason: z.string().min(10).max(140),
});

export type PermanentFlagToSet = z.infer<typeof PermanentFlagSchema>;

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
   * Consistency v3 (2026-06-04) — the cumulative "story so far" running digest
   * (playthroughs.running_summary), pre-fenced by the turn route in the story
   * language. ALWAYS present (not relevance-retrieved). This is the Claude-compact
   * through-line: plot + character relationships woven as prose. Empty until the
   * first compact fires (~turn 8).
   */
  runningSummaryBlock?: string;
  /**
   * Phase 1.5 — NPC L3 inner streams block (formatted by npcAgentToNarratorBlock).
   * Pre-formatted markdown wrapped in [INTERNAL CONTEXT — DO NOT QUOTE] header.
   * Empty string when L3 not active, all agents failed, or verdict=reject.
   * Injected into Narrator dynamic system prompt · NOT into Director context
   * (Director already ran before NPC agents · no recursion).
   */
  npcInnerStreamsBlock?: string;
  /**
   * 即興名冊 block (formatted by formatMentionRosterBlock · 角色升級階梯第 0 層)。
   * 之前回合提過名嘅 walk-on 路人清單 · wrapped in [INTERNAL CONTEXT — DO NOT QUOTE]。
   * 空 string 當冇 walk-on 名。注入 Narrator dynamic system prompt 防 retcon (改名/否認)。
   */
  mentionRosterBlock?: string;
  /**
   * M4 記憶手術 — 角色信念 block (formatted by formatBeliefsBlock)。角色目前相信
   * 嘅事實 (as-of-now · 可能係錯/過時) · wrapped in [INTERNAL CONTEXT — DO NOT QUOTE]。
   * 空 string 當冇 active 信念。注入防穿崩 (例:陳家明以為主角死咗 · AI 唔好寫佢見到
   * 主角好平靜)。felt-through-narrative (hard rule #19) · 唔係 dashboard。
   */
  beliefsBlock?: string;
  /**
   * ADR-007 角色深化 — 在場角色嘅「經歷」block (formatExperiencesBlock)。佢哋活過
   * 嘅事 + 點反應 (+ Stage 3 壓縮摘要) · wrapped [INTERNAL CONTEXT — DO NOT QUOTE]。
   * 空 string 當冇經歷。敘事者整體讀返 → 自然演繹被經歷塑造嘅角色 (無 threshold)。
   */
  experiencesBlock?: string;
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
  // Session 17 (audit fix · light-core): header was "...referenced inside update_state"
  // — but the prose-only narrator has no update_state tool, so that wording both named
  // a dead tool AND invited structured/JSON output (the leak class). Reframed to
  // "awareness only · never output".
  const schemaFieldsHeader =
    lang === "en"
      ? "## World State Dimensions (for your AWARENESS ONLY — the system tracks these automatically from your narrative; NEVER output any field name, key, value, or JSON. Just narrate.)"
      : lang === "zh-Hans"
        ? "## 世界状态维度 (仅供你了解——系统会从你的叙事里自动追踪；绝对不要输出任何字段名、key、数值或 JSON。只管讲故事。)"
        : "## 世界狀態維度 (淨係俾你了解——系統會喺你嘅敘事入面自動追蹤；絕對唔好輸出任何欄位名、key、數值或 JSON。只管講故事。)";
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
  // Consistency v3 · cumulative running digest · always-present · the "story so
  // far" foundation (placed first so it sets the stage before everything else).
  const running = ctx.runningSummaryBlock?.trim();
  const runningBlock = running ? running + "\n\n" : "";
  const memory = ctx.memoryContextString?.trim();
  const memoryBlock = memory ? memory + "\n\n" : "";

  // Phase 1.5 · NPC L3 inner streams block (Storyteller tier exclusive)
  // Already wrapped in [INTERNAL CONTEXT — DO NOT QUOTE] header by
  // npcAgentToNarratorBlock helper. Empty when L3 inactive / all failed.
  const innerStreams = ctx.npcInnerStreamsBlock?.trim();
  const innerStreamsBlock = innerStreams ? innerStreams + "\n\n" : "";

  // 即興名冊 block (角色升級階梯第 0 層 · 防 retcon)。Already wrapped 由
  // formatMentionRosterBlock。空 when 冇 walk-on 名。
  const roster = ctx.mentionRosterBlock?.trim();
  const rosterBlock = roster ? roster + "\n\n" : "";

  // M4 角色信念 block (信念圖譜 · 防事實穿崩)。Already wrapped 由 formatBeliefsBlock
  // ([INTERNAL CONTEXT — DO NOT QUOTE])。空 when 冇 active 信念。
  const beliefs = ctx.beliefsBlock?.trim();
  const beliefsBlock = beliefs ? beliefs + "\n\n" : "";

  // ADR-007 角色經歷 block (Stage 2)。Already wrapped 由 formatExperiencesBlock。
  // 空 when 冇經歷。放喺信念之後 (兩者都係 per-角色 context · 經歷 = 性格/關係層)。
  const experiences = ctx.experiencesBlock?.trim();
  const experiencesBlock = experiences ? experiences + "\n\n" : "";

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
  return `${runningBlock}${memoryBlock}${rosterBlock}${beliefsBlock}${experiencesBlock}${innerStreamsBlock}## Current Game State (READ-ONLY reference — do NOT repeat or output this; write story prose only)
${stateLines}

${charsDynamic}`;
}

// C2 cleanup (2026-06-08 · audit): isLLMRefusal + refusalFallbackNarrative
// removed — deprecated since the honest-failure redesign (ADR-001 原則 5 · the
// 「眉頭微皺」canned-fallback bug): a technical failure is now an empty
// failed=true turn + client retry, never fake story text. Zero callers remained.

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
  // B2 (2026-06-08 · 藍圖一致性): the story's CURRENT act, judged qualitatively
  // from the prose + the act list (replaces the old hardcoded transition_condition
  // DSL that referenced state fields the schema never had → arcs were frozen at
  // act 1 platform-wide). One small scalar · negligible grammar cost (hard rule #10).
  current_act: z.number().int().min(1).max(20),
});

export async function extractTurnState(
  ctx: TurnContext,
  narrative: string,
): Promise<{
  delta: StateDelta | null;
  dispositionChanges: DispositionChange[];
  flags: PermanentFlagToSet[];
  mentionedCharacters: string[];
  currentAct: number;
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

  // B2 — qualitative act tracking. Give the extractor the act list + the act the
  // story is currently in, and let it judge (from the prose) which act we're in
  // now. Replaces arc-dsl's hardcoded condition evaluation.
  const storyArc = ctx.story.story_bible?.soft_guided?.story_arc ?? [];
  const currentActAnchor =
    typeof (ctx.current_state as Record<string, unknown>).__act === "number"
      ? ((ctx.current_state as Record<string, unknown>).__act as number)
      : 1;
  const actsBlock =
    storyArc.length > 0
      ? `\n\n## Story acts (for act tracking)\n${storyArc
          .map(
            (a: { act: number; name: string; narrative_intent: string }) =>
              `- Act ${a.act} — ${a.name}: ${a.narrative_intent}`,
          )
          .join(
            "\n",
          )}\nThe story is CURRENTLY in Act ${currentActAnchor}. From THIS turn's narrative + the overall progression, output \`current_act\` = the act the story is now in. It moves FORWARD only when an act's intent is SUBSTANTIALLY fulfilled — most turns stay in the same act, and it NEVER goes backward (output ≥ ${currentActAnchor}). When unsure, keep ${currentActAnchor}.`
      : `\n\n## Act tracking\nThis story has no defined acts — output \`current_act\`: ${currentActAnchor}.`;

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
List the NAMES of any specific named people who appear or are mentioned in this turn's narrative but are NOT in the main cast above (${charNames}). Walk-on characters, people referred to by name in passing, newly-introduced minor characters. Names only — no description. This keeps names consistent across turns (so a name introduced once is never denied or changed later). Empty if no other named people appeared.${actsBlock}

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
    currentAct: obj.current_act,
    usage: {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      cachedInputTokens: result.usage?.cachedInputTokens,
    },
  };
}

// Re-export Zod for callers
export { z };
