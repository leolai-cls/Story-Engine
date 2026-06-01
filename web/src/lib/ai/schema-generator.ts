// Intentionally NOT a Server Action ("use server" removed in audit fix SEC-C-02).
//
// Previously this file was marked "use server", which made every exported
// function publicly invokable as a Next.js Server Action — meaning any
// visitor (no auth required) could POST to call `generateStory` and burn
// ~$0.20 per call (4 parallel Sonnet 4.6 calls). It's only ever called
// internally from `stories/new/actions.ts` (which IS a Server Action and
// does check auth), so the "use server" directive here was both unnecessary
// and dangerous.
//
// This file is now a regular server-side library. Direct invocation is no
// longer possible from the client.
import { z } from "zod";
import { generateObject } from "ai";
import { anthropicProvider } from "./providers";
import { StateSchemaShape } from "@/schemas/state-schema";
import { StoryBibleSchema } from "@/schemas/bible";
import { CharacterCardSchema } from "@/schemas/character";

/**
 * Schema generator — the LLM service that designs a complete story package.
 *
 * Architecture: 4 PARALLEL LLM calls instead of 1 combined call.
 *
 * Why: Anthropic's tool-mode structured output compiles a grammar from the
 * schema and has a hard ceiling on grammar size. Our full StoryGenerationResult
 * (9-way discriminated union × nested arrays × 4 sub-schemas) blew the ceiling.
 *
 * Splitting into 4 focused calls keeps each schema simple enough for the
 * compiler. Running them in parallel keeps total latency around the slowest
 * call (~30s) instead of the sum (~95s sequential).
 *
 * Trade-off: Each call gets the same user prompt but doesn't see other calls'
 * output. Cross-call consistency (e.g., character names in opening_narrative
 * matching characters[]) is approximate — relies on same prompt context.
 * Phase 1.5+ can add a consistency-pass to align references.
 */

// 2026-05-29 (founder): switched Sonnet → Haiku 4.5 for story creation.
// Sonnet structured-output of the 4 creation calls took ~70s; Haiku is ~2×
// faster (~30-40s) and plenty capable for the creation scaffolding (bible /
// characters / schema / opening). Still Anthropic-direct (reliable). Revert to
// "claude-sonnet-4-6" if creation quality regresses.
const MODEL = "claude-haiku-4-5";

// ─── Per-call schemas (each individually fits the grammar ceiling) ──────

const MetaAndOpeningSchema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().min(10).max(280),
  genre: z.string().min(2).max(40),
  tags: z.array(z.string().min(2).max(20)).max(6),
  opening_narrative: z.string().min(100).max(1500),
});

const StateSchemaWrap = z.object({ state_schema: StateSchemaShape });
const BibleWrap = z.object({ story_bible: StoryBibleSchema });
const CharactersWrap = z.object({
  characters: z.array(CharacterCardSchema).min(1).max(6),
});

// ─── Combined result type returned to callers ───────────────────────────

const StoryGenerationResultSchema = z.object({
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  tags: z.array(z.string()),
  state_schema: StateSchemaShape,
  story_bible: StoryBibleSchema,
  characters: z.array(CharacterCardSchema),
  opening_narrative: z.string(),
});

type StoryGenerationBase = z.infer<typeof StoryGenerationResultSchema>;

/**
 * AUDIT FIX (P3-LOGIC-H-04 / P3-COST-M-06): return real token usage from
 * the 4 parallel schema-gen calls so the caller can charge ACTUAL cost
 * instead of a flat estimate (which was off by 30-50% on long prompts).
 */
export type StoryGenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type StoryGenerationResult = StoryGenerationBase & {
  usage: StoryGenerationUsage;
};

export type GenerateStoryInput = {
  prompt: string;
  locale: "zh-Hant" | "zh-Hans" | "en";
  content_rating: "sfw" | "soft" | "adult";
  protagonist_hint?: string;
};

// ─── Focused system prompts per sub-call ────────────────────────────────
//
// Wave 1 audit fix (2026-05-27): all 4 system prompts converted to
// locale-aware functions. Previously hardcoded 繁中 only → EN + zh-Hans
// stories had: opening_narrative in Cantonese, title in Cantonese, state
// labels in Cantonese, NPC names in Cantonese. Bilingual breakage on
// arrival. Now branched per input.locale so output language matches.

function userContext(input: GenerateStoryInput): string {
  const labels =
    input.locale === "en"
      ? {
          concept: "User's story concept:",
          protagonist: "Protagonist hint:",
        }
      : input.locale === "zh-Hans"
        ? {
            concept: "用户故事概念：",
            protagonist: "主角设定提示：",
          }
        : {
            concept: "用戶故事概念：",
            protagonist: "主角設定提示：",
          };
  return `${labels.concept}

${input.prompt}

${input.protagonist_hint ? `${labels.protagonist}${input.protagonist_hint}` : ""}

Content rating: ${input.content_rating}
Locale: ${input.locale}`;
}

function metaSystemFor(locale: GenerateStoryInput["locale"]): string {
  if (locale === "en") {
    return `You are Story Engine's story designer. Design the basic story metadata + opening narrative.

Output:
- title (2-80 chars): story title in **English**
- description (10-280 chars): short intro in English
- genre (2-40 chars): genre label (e.g. "romance campus", "wuxia adventure")
- tags (0-6, each 2-20 chars): category tags
- opening_narrative (100-1500 chars): opening in **English** second person ("you...")

### opening_narrative ending rule (CRITICAL)
The last 1-2 sentences MUST be one of these — to trigger player reaction:

✅ **NPC says / asks something** (player naturally replies)
- "Ah Ming taps your shoulder: 'Got plans tonight?'"
- "The coach looks at you: 'New kid, sit here.'"

✅ **NPC is in the middle of doing something the player runs into**
- "Lin Siu-ah turns suddenly, her eyes meet yours."
- "Mr. Chan is counting money; he frowns when he sees you walk in."

✅ **Environmental incident** (forces immediate reaction)
- "Just then, the door is kicked open, and the boss walks in."
- "Glass shatters upstairs."

✅ **Strong sensory + multiple paths** (natural decision moment)
- "You hear someone screaming for help in the next room, but the bodyguard at the door is still watching you."

❌ **Strictly forbidden**:
- Pure scene description ending ("Practice starts in a few minutes.", "The classroom is silent except for the fan.")
- Directly asking the player what to do ("What do you want to do?", "How will you choose?")
- Listing options ("You can A or B or C")

This rule is **non-negotiable** — Story Engine's player engagement depends entirely on the ending triggering a reaction.`;
  }
  if (locale === "zh-Hans") {
    return `你是 Story Engine 的 story designer。设计故事的基本资料 + 开场叙事。

输出：
- title (2-80 字)：故事标题，**简体中文**
- description (10-280 字)：简短介绍，简体中文
- genre (2-40 字)：类型 (e.g. "校园恋爱", "玄幻冒险")
- tags (0-6 个, 每个 2-20 字)：分类标签
- opening_narrative (100-1500 字)：开场叙事，**简体中文**第二人称（"你..."）

### opening_narrative 结尾规则（CRITICAL）
最后 1-2 句**必须**属于以下其中一种 — 触发玩家想 react：

✅ **NPC 说话／发问**（玩家自然 reply）
✅ **NPC 在做事玩家撞上**
✅ **环境突发事件**（强迫即时反应）
✅ **强烈 sensory + 多个方向可选**（自然 decision moment）

❌ **绝对禁止**：
- 纯场景描写然后 stop
- 直接问玩家做什么
- 列出选项

这个 rule **不可违反** — Story Engine 的 player engagement 完全 depend on 结尾触发 reaction。`;
  }
  return `你係 Story Engine 嘅 story designer。設計故事嘅基本資料 + 開場敘事。

輸出：
- title (2-80 字)：故事標題，繁中
- description (10-280 字)：簡短介紹
- genre (2-40 字)：類型 (e.g. "戀愛校園", "古惑仔", "玄幻冒險")
- tags (0-6 個, 每個 2-20 字)：類別標籤
- opening_narrative (100-1500 字)：開場敘事，繁中第二人稱（"你..."）

### opening_narrative 結尾規則（CRITICAL）
最後 1-2 句**必須**屬於以下其中一種 — 觸發玩家想 react：

✅ **NPC 講嘢／發問**（玩家自然 reply）
- 「阿明拍你膊頭：『你今晚有冇 plan？』」
- 「教練望住你：『新仔，過嚟坐。』」

✅ **NPC 做緊嘢但未完，玩家撞到**
- 「林思雅突然轉頭，眼神同你撞個正著。」
- 「陳生喺度數緊錢，見你入嚟眉頭一皺。」

✅ **環境突發事件**（強迫即時反應）
- 「就喺呢個時候，門被踢開，大佬走入嚟。」
- 「樓上傳嚟玻璃碎聲。」

✅ **強烈 sensory + 多個方向可選**（自然 decision moment）
- 「你聽到隔壁房有人喊救命，但門口嗰個保鏢仲望住你。」

❌ **絕對禁止**：
- 純場景描寫然後 stop（e.g.「訓練開始前還有幾分鐘」、「教室靜得只有風扇聲」）
- 直接問玩家做咩（e.g.「你想點做？」、「你會點選擇？」）
- 列出選項（e.g.「你可以 A 或 B 或 C」）

呢個 rule **不可違反** — Story Engine 嘅 player engagement 完全 depend on 結尾觸發 reaction。`;
}

function stateSchemaSystemFor(locale: GenerateStoryInput["locale"]): string {
  if (locale === "en") {
    return `You are Story Engine's UI designer. Design a custom state interface (state_schema) for this story.

Each field needs: \`key\` (snake_case), \`label\` (**English**), \`render_hint\` + variant-specific fields:

- \`bar\`: + \`max\` (number > 0) + \`default\` (number) — HP, MP, Stamina
- \`progress_ring\`: + \`default\` (0-100) — affinity, completion
- \`number\`: + \`default\` (number) — money, score, XP
- \`enum_chip\`: + \`options\` (string[], 2-12) + \`default\` (string in options) — mood, status
- \`inventory_list\`: + \`default\` (array of {name, count, icon}) — inventory; icon is an emoji
- \`relationship_graph\`: + \`default\` (object name→number) — multi-NPC relationships
- \`meter_with_label\`: + \`max\` (number > 0) + \`default\` (number) — stamina percentage
- \`portrait\`: + \`default\` (string URL or "") — avatar
- \`note\`: + \`default\` (string text) — diary, clues

Rules:
- 5-12 fields, each key unique (snake_case)
- label in **English**
- Every field must have a \`default\` value
- Romance → progress_ring (affinity) + enum_chip (mood) + number (allowance) + inventory_list (gifts) + note (diary)
- D&D → bar (HP/MP) + number (STR/DEX/INT) + inventory_list (backpack)
- Sports → meter_with_label (stamina) + number (points/rebounds/assists) + enum_chip (trust) + relationship_graph (teammates)`;
  }
  if (locale === "zh-Hans") {
    return `你是 Story Engine 的 UI designer。为这个故事设计专属状态介面 (state_schema)。

每个 field 需要：\`key\` (snake_case), \`label\` (**简体中文**), \`render_hint\` + variant-specific 字段。

规则：
- 5-12 个 fields，每个 key 唯一 (snake_case)
- label **简体中文**
- 每 field 必须有 \`default\` value
- 恋爱 → progress_ring (好感度) + enum_chip (心情) + number (零用钱) + inventory_list (礼物) + note (日记)
- D&D → bar (HP/MP) + number (力量/敏捷/智力) + inventory_list (背包)
- 体育 → meter_with_label (体力) + number (得分/篮板/助攻) + enum_chip (信任度) + relationship_graph (队友)

variant-specific 字段：
- \`bar\`: + \`max\` + \`default\` — HP, MP, 体力
- \`progress_ring\`: + \`default\` (0-100) — 好感度
- \`number\`: + \`default\` — 金钱, 得分
- \`enum_chip\`: + \`options\` + \`default\` — 心情
- \`inventory_list\`: + \`default\` array — 背包
- \`relationship_graph\`: + \`default\` object
- \`meter_with_label\`: + \`max\` + \`default\` — 体力%
- \`portrait\`: + \`default\` URL
- \`note\`: + \`default\` text`;
  }
  return `你係 Story Engine 嘅 UI designer。為呢個故事設計專屬狀態介面 (state_schema)。

每個 field 需要：\`key\` (snake_case), \`label\` (繁中), \`render_hint\` + variant-specific 欄位：

- \`bar\`: + \`max\` (number > 0) + \`default\` (number) — HP, MP, 體力
- \`progress_ring\`: + \`default\` (0-100) — 好感度、完成度
- \`number\`: + \`default\` (number) — 金錢、得分、經驗
- \`enum_chip\`: + \`options\` (string[], 2-12) + \`default\` (string in options) — 心情、狀態
- \`inventory_list\`: + \`default\` (array of {name, count, icon}) — 背包；icon 用 emoji
- \`relationship_graph\`: + \`default\` (object name→number) — NPC 多人關係
- \`meter_with_label\`: + \`max\` (number > 0) + \`default\` (number) — 體力百分比
- \`portrait\`: + \`default\` (string URL 或 "") — 頭像
- \`note\`: + \`default\` (string text) — 日記、線索

規則：
- 5-12 個 fields，每個 key 唯一 (snake_case)
- label 繁中
- 每 field 必須有 \`default\` value
- 戀愛 → progress_ring (好感度) + enum_chip (心情) + number (零用錢) + inventory_list (禮物) + note (日記)
- D&D → bar (HP/MP) + number (力量/敏捷/智力) + inventory_list (背包)
- 體育 → meter_with_label (體力) + number (得分/籃板/助攻) + enum_chip (信任度) + relationship_graph (隊友)`;
}

function bibleSystemFor(locale: GenerateStoryInput["locale"]): string {
  const langSnippet =
    locale === "en"
      ? `- \`language\`: MUST be "en" (story will be played in English)`
      : locale === "zh-Hans"
        ? `- \`language\`: MUST be "zh-Hans" (story will be played in 简体中文)`
        : `- \`language\`: MUST be "zh-Hant" (story will be played in 繁體中文)`;
  if (locale === "en") {
    return `You are Story Engine's story bible writer. Design this story's hard rules + flexible arc per ADR-008 3-tier calibration.

\`hard_locked\` (AI can NEVER override):
- \`central_conflict\` (one sentence, in English)
- \`world_invariants\` (3-6 hard world rules, in English)
- \`themes_required\` (0-5 short labels, empty array OK)
- \`tone\`: pick [realistic, romantic, dark_humor, epic_fantasy, noir, slice_of_life, thriller, comedy]
${langSnippet}
- \`cultural_setting\` (cultural backdrop, e.g. "1980s HK triad" — generic can be "")

\`soft_guided\` (Director has discretion):
- \`story_arc\`: 2-5 Acts, each with act (1-5), name, narrative_intent (in English), transition_condition
- transition_condition MUST use boolean DSL — only these path formats supported:
    1. \`state.<field_key>\` (any state schema field key)
    2. \`characters.<npc_name>.<axis>\` — axis is trust / romance / respect / fear
  operators: \`>= <= > < == !=\` + \`AND\` / \`OR\` (case-insensitive)
  **Not allowed**: turn count, \`interactions.X\`, parentheses
  **Correct examples**:
    - \`characters.linsiya.trust >= 60\` (simple)
    - \`characters.linsiya.trust >= 60 AND characters.linsiya.romance >= 30\` (compound)
    - \`state.money >= 1000 OR state.influence >= 50\` (state-based)
  Act 1 condition can use something easily satisfied (e.g. \`state.<field> >= 0\`)
- \`pacing_hint\` (one sentence in English, can be "")`;
  }
  if (locale === "zh-Hans") {
    return `你是 Story Engine 的 story bible writer。设计这个故事的 hard rules + flexible arc per ADR-008。

\`hard_locked\` (AI 永远不可以推翻):
- \`central_conflict\` (一句话，简体中文)
- \`world_invariants\` (3-6 条世界硬规则，简体中文)
- \`themes_required\` (0-5 short labels)
- \`tone\`: 选 [realistic, romantic, dark_humor, epic_fantasy, noir, slice_of_life, thriller, comedy]
${langSnippet}
- \`cultural_setting\` (文化背景)

\`soft_guided\`:
- \`story_arc\`: 2-5 Acts, transition_condition 必须用 boolean DSL · 只支持 \`state.<field>\` / \`characters.<npc>.<axis>\` · operators \`>= <= > < == != AND OR\`
- \`pacing_hint\``;
  }
  return `你係 Story Engine 嘅 story bible writer。設計呢個故事嘅 hard rules + flexible arc per ADR-008 3-tier calibration。

\`hard_locked\` (AI 永遠唔可以推翻):
- \`central_conflict\` (一句話)
- \`world_invariants\` (3-6 條世界硬規則)
- \`themes_required\` (0-5 個 short labels, empty array OK)
- \`tone\`: 揀 [realistic, romantic, dark_humor, epic_fantasy, noir, slice_of_life, thriller, comedy]
${langSnippet}
- \`cultural_setting\` (文化背景，e.g. "HK 1980s 古惑仔"；generic 可填 "")

\`soft_guided\` (Director 有彈性):
- \`story_arc\`: 2-5 個 Act，每個有 act (1-5), name, narrative_intent, transition_condition
- transition_condition 必須用 boolean DSL — 只支援以下 path 格式:
    1. \`state.<field_key>\` (state schema 入面任何 field key — e.g. \`state.money\`, \`state.linsiya_affinity\`)
    2. \`characters.<npc_name>.<axis>\` — axis 揀 trust / romance / respect / fear
  支援 operators: \`>= <= > < == !=\` + \`AND\` / \`OR\` (case-insensitive)
  **唔可以用**: turn count、\`interactions.X\`、parentheses
  **正確 examples**:
    - \`characters.linsiya.trust >= 60\` (簡單)
    - \`characters.linsiya.trust >= 60 AND characters.linsiya.romance >= 30\` (多條件)
    - \`state.money >= 1000 OR state.influence >= 50\` (state-based)
  Act 1 condition 可以填一個容易滿足嘅嘢 (e.g. \`state.<某 field> >= 0\`)，反正開始就喺 Act 1
- \`pacing_hint\` (一句 pacing 描述，可填 "")`;
}

function charactersSystemFor(locale: GenerateStoryInput["locale"]): string {
  if (locale === "en") {
    return `You are Story Engine's character designer. Design 1-6 NPCs, each with a complete personality.

Each NPC:
- \`name\` (English name appropriate to the story's cultural_setting), \`role\` (e.g. "love interest candidate"; empty string if no role)
- \`personality_traits\`: 2-6 short traits (e.g. "introverted", "principled")
- \`backstory\` (20-600 chars): 1-3 sentences of past, in English
- \`core_motivation\` (10-280 chars): what the NPC wants
- \`red_lines\` (1-5 entries, 5-140 chars each): hard behavioral limits — specific, NOT vague (e.g. "won't accept fast-progressing relationships" NOT "doesn't trust strangers")
- \`voice_sample\` (20-400 chars): 2-3 sentences in English demonstrating speech style
- \`arc_description\` (10-280 chars): how the NPC evolves
- \`default_disposition_toward_protagonist\`: pick [hostile, wary, neutral, friendly, warm, devoted]
- \`volatility\` (0.0-1.0): how readily this character's attitude shifts from accumulated experiences. Stubborn / principled / steady → low (0.1-0.3); ordinary → ~0.5; emotional / impulsive / mercurial → high (0.7-0.9). Derive it from the personality — make characters differ.

NPC count = the minimum the story needs (3-5 is usually right). Quality > quantity.`;
  }
  if (locale === "zh-Hans") {
    return `你是 Story Engine 的 character designer。设计 1-6 个 NPC，每个有完整人格。

每个 NPC:
- \`name\` (简体中文), \`role\` (e.g. "女主角候选"，无特定 role 填 "")
- \`personality_traits\`: 2-6 个 short traits (e.g. "内向", "有原则")
- \`backstory\` (20-600 字)：1-3 句过去，简体中文
- \`core_motivation\` (10-280 字)：NPC 想要什么
- \`red_lines\` (1-5 条, 每条 5-140 字): hard behavioral limits — specific, NOT vague
- \`voice_sample\` (20-400 字): 2-3 句 demonstrating 讲话风格，简体中文
- \`arc_description\` (10-280 字)：NPC 如何 evolve
- \`default_disposition_toward_protagonist\`: 选 [hostile, wary, neutral, friendly, warm, devoted]
- \`volatility\` 易变度 (0.0-1.0)：这个角色的态度有多容易因累积经历而改变。固执/有原则/沉稳 → 低 (0.1-0.3)；普通 → ~0.5；情绪化/冲动/善变 → 高 (0.7-0.9)。按性格定 · 让角色之间有差异。

NPC 数量 = 故事需要的最少 (3-5 通常合适)。质量 > 数量。`;
  }
  return `你係 Story Engine 嘅 character designer。設計 1-6 個 NPC，每個有完整人格。

每個 NPC:
- \`name\`, \`role\` (e.g. "女主角候選"，無特定 role 填 "")
- \`personality_traits\`: 2-6 個 short traits (e.g. "內向", "有原則")
- \`backstory\` (20-600 字)：1-3 句過去
- \`core_motivation\` (10-280 字)：NPC 想要乜
- \`red_lines\` (1-5 條, 每條 5-140 字): hard behavioral limits — specific, NOT vague (e.g. "唔接受快速進展嘅關係" NOT "唔信任陌生人")
- \`voice_sample\` (20-400 字): 2-3 句 demonstrating 講嘢風格
- \`arc_description\` (10-280 字)：NPC 點 evolve
- \`default_disposition_toward_protagonist\`: 揀 [hostile, wary, neutral, friendly, warm, devoted]
- \`volatility\` 易變度 (0.0-1.0)：呢個角色嘅態度有幾易因累積經歷而改變。固執/有原則/沉穩 → 低 (0.1-0.3)；普通 → ~0.5；情緒化/衝動/善變 → 高 (0.7-0.9)。按佢性格定 · 令角色之間有差異。

NPC 數量 = 故事需要嘅最少 (3-5 通常啱)。質量 > 數量。`;
}

// ─── Retry wrapper: 1 retry with exponential backoff (AI-M-08 fix) ──────

type SubCallConfig<T> = {
  label: string;
  call: () => Promise<{ object: T }>;
};

/**
 * Decide whether an error is worth retrying. 4xx auth/validation errors
 * won't get better by retrying — fail fast. 429 (rate limit) and 5xx
 * (server) are good retry candidates.
 */
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Anthropic SDK errors include the status code in the message
  if (/\b(400|401|403|404)\b/.test(msg)) return false;
  if (/invalid[_-]api[_-]key|authentication/i.test(msg)) return false;
  return true;
}

async function runWithRetry<T>(cfg: SubCallConfig<T>): Promise<T> {
  try {
    const r = await cfg.call();
    return r.object;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (!isRetryable(e)) {
      console.error(`[schema-gen] ${cfg.label} non-retryable error:`, errMsg);
      throw new Error(`${cfg.label} 生成失敗: ${errMsg}`);
    }
    console.warn(`[schema-gen] ${cfg.label} attempt 1 failed, retrying in 1s:`, errMsg);
    // Exponential backoff: 1s before retry. Burst retries against a
    // rate-limited Anthropic just make it worse.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const r2 = await cfg.call();
      return r2.object;
    } catch (e2) {
      const err2Msg = e2 instanceof Error ? e2.message : String(e2);
      console.error(`[schema-gen] ${cfg.label} attempt 2 failed:`, err2Msg);
      throw new Error(`${cfg.label} 生成失敗 (2 次嘗試後): ${err2Msg}`);
    }
  }
}

// ─── Main function: 4 parallel calls with per-call retry + assemble ─────

export async function generateStory(
  input: GenerateStoryInput,
): Promise<StoryGenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Add to .env.local + Vercel env vars.",
    );
  }

  const userPrompt = userContext(input);

  // AUDIT FIX (AI-H-02): track total token spend across the 4 parallel calls
  // for cost observability. Phase 4 billing will read this from telemetry.
  const usageTotals = { input: 0, output: 0, cached: 0 };

  // Wave 1 audit fix (2026-05-27): pass input.locale into all 4 system prompts
  // so output language matches the user's story language (was hardcoded 繁中).
  const metaSystem = metaSystemFor(input.locale);
  const stateSchemaSystem = stateSchemaSystemFor(input.locale);
  const bibleSystem = bibleSystemFor(input.locale);
  const charactersSystem = charactersSystemFor(input.locale);

  const [meta, state, bible, characters] = await Promise.all([
    runWithRetry({
      label: "meta + opening_narrative",
      call: async () => {
        const r = await generateObject({
          model: anthropicProvider(MODEL),
          schema: MetaAndOpeningSchema,
          system: metaSystem,
          prompt: userPrompt,
          temperature: 0.8,
          maxOutputTokens: 3000,
        });
        usageTotals.input += r.usage?.inputTokens ?? 0;
        usageTotals.output += r.usage?.outputTokens ?? 0;
        usageTotals.cached += r.usage?.cachedInputTokens ?? 0;
        return r;
      },
    }),
    runWithRetry({
      label: "state_schema",
      call: async () => {
        const r = await generateObject({
          model: anthropicProvider(MODEL),
          schema: StateSchemaWrap,
          system: stateSchemaSystem,
          prompt: userPrompt,
          temperature: 0.7,
          maxOutputTokens: 2500,
        });
        usageTotals.input += r.usage?.inputTokens ?? 0;
        usageTotals.output += r.usage?.outputTokens ?? 0;
        usageTotals.cached += r.usage?.cachedInputTokens ?? 0;
        return r;
      },
    }),
    runWithRetry({
      label: "story_bible",
      call: async () => {
        const r = await generateObject({
          model: anthropicProvider(MODEL),
          schema: BibleWrap,
          system: bibleSystem,
          prompt: userPrompt,
          temperature: 0.7,
          maxOutputTokens: 3000,
        });
        usageTotals.input += r.usage?.inputTokens ?? 0;
        usageTotals.output += r.usage?.outputTokens ?? 0;
        usageTotals.cached += r.usage?.cachedInputTokens ?? 0;
        return r;
      },
    }),
    runWithRetry({
      label: "characters",
      call: async () => {
        const r = await generateObject({
          model: anthropicProvider(MODEL),
          schema: CharactersWrap,
          system: charactersSystem,
          prompt: userPrompt,
          temperature: 0.85,
          maxOutputTokens: 4000,
        });
        usageTotals.input += r.usage?.inputTokens ?? 0;
        usageTotals.output += r.usage?.outputTokens ?? 0;
        usageTotals.cached += r.usage?.cachedInputTokens ?? 0;
        return r;
      },
    }),
  ]);

  console.log(
    `[schema-gen] story created — input=${usageTotals.input} cached=${usageTotals.cached} output=${usageTotals.output} ` +
    `(approx $${((usageTotals.input * 3 + usageTotals.output * 15) / 1_000_000).toFixed(3)} Sonnet 4.6 pricing)`,
  );

  // Wave 1 audit H-04 fix (2026-05-27): force Bible language = input.locale.
  // LLM is instructed to set bible.hard_locked.language = input.locale, but
  // at temp 0.7 Sonnet can occasionally pick wrong (e.g. drift to zh-Hant on
  // an EN story). Bible language is the single source of truth for Narrator /
  // Director / NPC agents — drift here silently corrupts the playthrough for
  // its entire lifetime. input.locale is authoritative (it's also what gets
  // stored in stories.language DB column at actions.ts), so we overwrite.
  const forcedBible = {
    ...bible.story_bible,
    hard_locked: {
      ...bible.story_bible.hard_locked,
      language: input.locale,
    },
  };
  if (bible.story_bible.hard_locked.language !== input.locale) {
    console.warn(
      `[schema-gen] LLM drifted bible.hard_locked.language=${bible.story_bible.hard_locked.language} but input.locale=${input.locale} — forcing input.locale.`,
    );
  }

  return {
    title: meta.title,
    description: meta.description,
    genre: meta.genre,
    tags: meta.tags,
    opening_narrative: meta.opening_narrative,
    state_schema: state.state_schema,
    story_bible: forcedBible,
    characters: characters.characters,
    // AUDIT FIX (P3-LOGIC-H-04): return real usage for accurate charging.
    usage: {
      inputTokens: usageTotals.input,
      outputTokens: usageTotals.output,
      cachedInputTokens: usageTotals.cached,
    },
  };
}
