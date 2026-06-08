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
import { GameSystemSchema } from "@/schemas/game-system";

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
  // Deep Mode ②③ — the per-story game_system 「藍圖」 (pm/architecture/05).
  // Folded into the (grammar-light) meta call · skill stats derived at runtime.
  game_system: GameSystemSchema,
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
  game_system: GameSystemSchema,
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
  /**
   * Deep Mode ②③ · player-chosen game mode at creation. "auto" → the AI decides
   * the mechanic from the prompt; a specific mode OVERRIDES the AI's choice
   * (e.g. a romance prompt + "dice" → a romance that rolls). Default "auto".
   */
  game_mode?: "auto" | "narrative" | "dice";
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

This rule is **non-negotiable** — Story Engine's player engagement depends entirely on the ending triggering a reaction.

### game_system — declare this story's mechanics (let the story decide)
- \`mechanic\`: pick ONE that fits — \`narrative\` (pure story · romance/drama/slice-of-life · MOST stories) · \`dice\` (skill-check rolls · D&D/TRPG) · \`combat\` (turn-based battle · JRPG) · \`capture\` (collection · pet-monster) · \`mixed\`. A romance is \`narrative\`; a dungeon crawl is \`dice\`. Never force mechanics onto a story that doesn't want them.
- \`objectives\`: 0-5 short opening quest lines. Adventure/mystery → clear objectives. Romance/slice-of-life → few or none (\`[]\` is fine).`;
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

这个 rule **不可违反** — Story Engine 的 player engagement 完全 depend on 结尾触发 reaction。

### game_system —声明这个故事的机制（让故事自己决定）
- \`mechanic\`: 选一个最配的 — \`narrative\`（纯故事 · 恋爱/剧情/日常 · 大部分故事）· \`dice\`（技能检定掷骰 · D&D/TRPG）· \`combat\`（回合制战斗 · JRPG）· \`capture\`（收集 · 宠物精灵）· \`mixed\`。恋爱是 \`narrative\`；地下城探险是 \`dice\`。绝不硬塞机制给不需要的故事。
- \`objectives\`: 0-5 条简短开场任务线。冒险/悬疑 → 明确目标。恋爱/日常 → 很少或没有（\`[]\` 可以）。`;
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

呢個 rule **不可違反** — Story Engine 嘅 player engagement 完全 depend on 結尾觸發 reaction。

### game_system —宣告呢個故事嘅機制（畀故事自己決定）
- \`mechanic\`: 揀一個最配嘅 — \`narrative\`（純故事 · 戀愛/劇情/日常 · 大部分故事）· \`dice\`（技能檢定擲骰 · D&D/TRPG）· \`combat\`（回合制戰鬥 · JRPG）· \`capture\`（收集 · 寵物小精靈）· \`mixed\`。戀愛係 \`narrative\`；地下城探險係 \`dice\`。絕不硬塞機制畀唔需要嘅故事。
- \`objectives\`: 0-5 條簡短開場任務線。冒險/懸疑 → 明確目標。戀愛/日常 → 好少或者冇（\`[]\` 可以）。`;
}

function stateSchemaSystemFor(
  locale: GenerateStoryInput["locale"],
  gameMode: GenerateStoryInput["game_mode"] = "auto",
): string {
  const base = ((): string => {
  if (locale === "en") {
    return `You are Story Engine's UI designer. Decide this story's on-screen state panel — ONE small, cohesive panel. Let the STORY decide what (if anything) belongs on it.

## FIRST decide: game-stats or pure story?
- **Game-like** (D&D, survival, management, sports, pet-raising): the player WANTS real mechanics (HP, money, days, inventory, quest %). Numbers are meaningful here — show them.
- **Narrative** (romance, drama, slice-of-life, mystery): emotions + relationships live in the PROSE, not on a meter. Generate only **1-3 QUALITATIVE fields** (or a single note). A naked "affinity 75/100" bar CHEAPENS the feeling — **never** do it.

## Rules
- 1-8 fields total · **match the story**: narrative → 1-3 · game → as many mechanics as genuinely help. Fewer + meaningful beats a wall of bars. (Min 1 field required.)
- Each \`key\` unique (snake_case) · \`label\` in **English** · every field has a \`default\`.
- **Relationships / emotions / mood → QUALITATIVE**: use \`enum_chip\` with descriptive STAGES (e.g. relationship: stranger / acquaintance / close / flirting / together) or a short \`note\`. NEVER a naked affinity number, bar, or ring.
- **Numbers (\`bar\` / \`number\` / \`progress_ring\`) → ONLY genuine countable mechanics**: HP, MP, money, days left, score, quest %. Not feelings.
- (Internal relationship scores still exist for story logic + act transitions — they just don't appear as naked numbers on the panel.)

## render_hints
- \`enum_chip\`: + \`options\` (2-12) + \`default\` — relationship stage / mood / status (PREFERRED for narrative)
- \`note\`: + \`default\` (text) — mind-state / clue / situation (PREFERRED for narrative)
- \`bar\`: + \`max\` (>0) + \`default\` — HP / MP / stamina (game)
- \`number\`: + \`default\` — money / score / days (game)
- \`progress_ring\`: + \`default\` (0-100) — quest / completion % (a real countable goal, NOT affinity)
- \`inventory_list\`: + \`default\` (array of {name, count, icon=emoji}) — items (game)
- \`meter_with_label\`: + \`max\` (>0) + \`default\` — stamina % (game)
- \`relationship_graph\` (object name→number) / \`portrait\` (URL or ""): rarely needed

## Examples
- Romance → \`enum_chip\` "Relationship with Lin" (stranger/acquaintance/close/flirting/together) + \`note\` "Your current state of mind". That's it — NO affinity number.
- D&D → \`bar\` HP/MP + \`number\` Gold + \`inventory_list\` Backpack + \`enum_chip\` Condition
- Survival → \`bar\` Stamina/Hunger + \`number\` Day + \`inventory_list\` Supplies`;
  }
  if (locale === "zh-Hans") {
    return `你是 Story Engine 的 UI designer。决定这个故事的画面状态面板 —— 一个小而连贯的面板。让【故事本身】决定面板上该放什么（甚至几乎不放）。

## 先判断：游戏型 还是 纯叙事？
- **游戏型**（D&D、生存、经营、运动、养成）：玩家【想看】真机制（HP、金钱、天数、背包、任务进度）。这里数字有意义 —— 照显示。
- **叙事型**（恋爱、剧情、日常、悬疑）：情感和关系活在【叙事文字】里，不在数值条上。只生成 **1-3 个质性 field**（或一个 note）。一条裸的「好感 75/100」会【cheapen 个感情】—— **绝不**这样做。

## 规则
- 共 1-8 个 fields · **配合故事**：叙事 → 1-3 个 · 游戏 → 该有多少机制就多少。少而有意义胜过一堆数值条。（最少 1 个。）
- 每个 \`key\` 唯一 (snake_case) · \`label\` 简体中文 · 每 field 有 \`default\`。
- **关系 / 情感 / 心情 → 质性**：用 \`enum_chip\` 配描述性【阶段】（例：关系：陌生 / 相识 / 亲近 / 暧昧 / 交往）或一个短 \`note\`。绝不用裸好感度数字、bar、ring。
- **数字（\`bar\` / \`number\` / \`progress_ring\`）→ 只给真正可数的机制**：HP、MP、金钱、剩余天数、得分、任务%。不是感情。
- （内部关系分数仍然存在，给故事逻辑 + 幕转场用 —— 只是不在面板上以裸数字出现。）

## render_hints
- \`enum_chip\`: + \`options\` (2-12) + \`default\` — 关系阶段 / 心情 / 状态（叙事【首选】）
- \`note\`: + \`default\` (text) — 心境 / 线索 / 处境（叙事【首选】）
- \`bar\`: + \`max\` (>0) + \`default\` — HP / MP / 体力（游戏）
- \`number\`: + \`default\` — 金钱 / 得分 / 天数（游戏）
- \`progress_ring\`: + \`default\` (0-100) — 任务 / 完成度%（真正可数的目标，不是好感度）
- \`inventory_list\`: + \`default\` (array of {name,count,icon=emoji}) — 物品（游戏）
- \`meter_with_label\`: + \`max\` (>0) + \`default\` — 体力%（游戏）
- \`relationship_graph\` (object name→number) / \`portrait\` (URL 或 "")：很少需要

## 示例
- 恋爱 → \`enum_chip\`「与林思雅的关系」(陌生/相识/亲近/暧昧/交往) + \`note\`「你此刻的心境」。就这样 —— 没有好感度数字。
- D&D → \`bar\` HP/MP + \`number\` 金钱 + \`inventory_list\` 背包 + \`enum_chip\` 状态
- 生存 → \`bar\` 体力/饥饿 + \`number\` 天数 + \`inventory_list\` 物资`;
  }
  return `你係 Story Engine 嘅 UI designer。決定呢個故事嘅畫面狀態面板 —— 一個細而連貫嘅面板。畀【故事本身】決定面板上放咩（甚至幾乎唔放）。

## 先判斷：遊戲型 定 純敘事？
- **遊戲型**（D&D、生存、經營、運動、養成）：玩家【想睇】真機制（HP、金錢、天數、背包、任務進度）。呢度數字有意義 —— 照顯示。
- **敘事型**（戀愛、劇情、日常、懸疑）：情感同關係活喺【敘事文字】入面，唔喺數值條上。只生成 **1-3 個質性 field**（或者一個 note）。一條裸嘅「好感 75/100」會【cheapen 個感情】—— **絕不**咁做。

## 規則
- 共 1-8 個 fields · **配合故事**：敘事 → 1-3 個 · 遊戲 → 該有幾多機制就幾多。少而有意義勝過一堆數值條。（最少 1 個。）
- 每個 \`key\` 唯一 (snake_case) · \`label\` 繁中 · 每 field 有 \`default\`。
- **關係 / 情感 / 心情 → 質性**：用 \`enum_chip\` 配描述性【階段】（例：關係：陌生 / 相識 / 親近 / 曖昧 / 交往）或者一個短 \`note\`。絕不用裸好感度數字、bar、ring。
- **數字（\`bar\` / \`number\` / \`progress_ring\`）→ 只畀真正可數嘅機制**：HP、MP、金錢、剩餘天數、得分、任務%。唔係感情。
- （內部關係分數仍然存在，畀故事邏輯 + 幕轉場用 —— 只係唔喺面板上以裸數字出現。）

## render_hints
- \`enum_chip\`: + \`options\` (2-12) + \`default\` — 關係階段 / 心情 / 狀態（敘事【首選】）
- \`note\`: + \`default\` (text) — 心境 / 線索 / 處境（敘事【首選】）
- \`bar\`: + \`max\` (>0) + \`default\` — HP / MP / 體力（遊戲）
- \`number\`: + \`default\` — 金錢 / 得分 / 天數（遊戲）
- \`progress_ring\`: + \`default\` (0-100) — 任務 / 完成度%（真正可數嘅目標，唔係好感度）
- \`inventory_list\`: + \`default\` (array of {name,count,icon=emoji}) — 物品（遊戲）
- \`meter_with_label\`: + \`max\` (>0) + \`default\` — 體力%（遊戲）
- \`relationship_graph\` (object name→number) / \`portrait\` (URL 或 "")：好少需要

## 示例
- 戀愛 → \`enum_chip\`「與林思雅嘅關係」(陌生/相識/親近/曖昧/交往) + \`note\`「你此刻嘅心境」。就咁 —— 冇好感度數字。
- D&D → \`bar\` HP/MP + \`number\` 力量/敏捷/感知 + \`inventory_list\` 背包 + \`enum_chip\` 狀態
- 生存 → \`bar\` 體力/飢餓 + \`number\` 天數 + \`inventory_list\` 物資`;
  })();

  // B1 (2026-06-08 · 藍圖一致性): when the player EXPLICITLY picked dice mode, the
  // panel generator (which otherwise only sees the locale) MUST emit rollable
  // ability stats — else the dice runtime has no numeric skill to roll against
  // and never rolls (real bug: 骰子覺醒 made only a `dice_rolls_today` counter →
  // 0 rolls in 117 turns). The chosen mechanic OVERRIDES the AI's own game/narrative
  // judgement here, mirroring finalGameSystem's override at the call site.
  if (gameMode !== "dice") return base;
  const diceReq =
    locale === "en"
      ? `\n\n## ⚠️ THIS STORY ROLLS DICE (skill-check mechanic) — REQUIRED\nThe player explicitly chose a dice / TRPG mode. You MUST include **2-4 numeric ability stats** as \`number\` (or \`bar\`) fields that skill checks can roll against — pick the ones that fit this story from: Strength · Agility · Perception · Will · Constitution · Intellect · Charisma. Give each a sensible starting \`default\` (e.g. 8-14 on a ~20 scale). These are REQUIRED and go IN ADDITION to any narrative fields (stay within 1-8 total). WITHOUT numeric ability stats the dice system has nothing to roll.`
      : locale === "zh-Hans"
        ? `\n\n## ⚠️ 这个故事会掷骰（技能检定机制）—— 必须\n玩家明确选了掷骰 / TRPG 模式。你**必须**加入 **2-4 个数字能力属性**（用 \`number\` 或 \`bar\`），让技能检定可以掷 —— 从这些里挑配合故事的：力量 · 敏捷 · 感知 · 意志 · 体质 · 智力 · 魅力。每个给一个合理起始 \`default\`（例如 ~20 制下 8-14）。这些是**必须**的，跟任何叙事 field 一起（总数维持 1-8）。没有数字能力属性，掷骰系统就无骰可掷。`
        : `\n\n## ⚠️ 呢個故事會擲骰（技能檢定機制）—— 必須\n玩家明確揀咗擲骰 / TRPG 模式。你**必須**加入 **2-4 個數字能力屬性**（用 \`number\` 或 \`bar\`），等技能檢定可以擲 —— 喺呢啲入面揀配合故事嘅：力量 · 敏捷 · 感知 · 意志 · 體質 · 智力 · 魅力。每個畀一個合理起始 \`default\`（例如 ~20 制下 8-14）。呢啲係**必須**嘅，同任何敘事 field 一齊（總數維持 1-8）。冇數字能力屬性，擲骰系統就無骰可擲。`;
  return `${base}${diceReq}`;
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
  // B1: pass the chosen game mode so an explicit dice pick forces rollable
  // ability stats into the panel (the mechanic + the schema are otherwise
  // generated by independent parallel calls that can't see each other).
  const stateSchemaSystem = stateSchemaSystemFor(input.locale, input.game_mode);
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

  // Deep Mode ②③ · apply the player's chosen game mode (overrides the AI's
  // mechanic). "auto" / unset → keep the AI's choice. A specific mode keeps the
  // AI-generated objectives but forces the mechanic.
  const finalGameSystem =
    input.game_mode && input.game_mode !== "auto"
      ? { ...meta.game_system, mechanic: input.game_mode }
      : meta.game_system;

  return {
    title: meta.title,
    description: meta.description,
    genre: meta.genre,
    tags: meta.tags,
    opening_narrative: meta.opening_narrative,
    state_schema: state.state_schema,
    story_bible: forcedBible,
    characters: characters.characters,
    game_system: finalGameSystem,
    // AUDIT FIX (P3-LOGIC-H-04): return real usage for accurate charging.
    usage: {
      inputTokens: usageTotals.input,
      outputTokens: usageTotals.output,
      cachedInputTokens: usageTotals.cached,
    },
  };
}
