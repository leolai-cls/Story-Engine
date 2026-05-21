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

const MODEL = "claude-sonnet-4-6";

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

export type StoryGenerationResult = z.infer<
  typeof StoryGenerationResultSchema
>;

export type GenerateStoryInput = {
  prompt: string;
  locale: "zh-Hant" | "zh-Hans" | "en";
  content_rating: "sfw" | "soft" | "adult";
  protagonist_hint?: string;
};

// ─── Focused system prompts per sub-call ────────────────────────────────

function userContext(input: GenerateStoryInput): string {
  return `用戶故事概念：

${input.prompt}

${input.protagonist_hint ? `主角設定提示：${input.protagonist_hint}` : ""}

Content rating: ${input.content_rating}
Locale: ${input.locale}`;
}

const META_SYSTEM = `你係 Story Engine 嘅 story designer。設計故事嘅基本資料 + 開場敘事。

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

const STATE_SCHEMA_SYSTEM = `你係 Story Engine 嘅 UI designer。為呢個故事設計專屬狀態介面 (state_schema)。

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

const BIBLE_SYSTEM = `你係 Story Engine 嘅 story bible writer。設計呢個故事嘅 hard rules + flexible arc per ADR-008 3-tier calibration。

\`hard_locked\` (AI 永遠唔可以推翻):
- \`central_conflict\` (一句話)
- \`world_invariants\` (3-6 條世界硬規則)
- \`themes_required\` (0-5 個 short labels, empty array OK)
- \`tone\`: 揀 [realistic, romantic, dark_humor, epic_fantasy, noir, slice_of_life, thriller, comedy]
- \`language\`: "zh-Hant" / "zh-Hans" / "en"
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

const CHARACTERS_SYSTEM = `你係 Story Engine 嘅 character designer。設計 1-6 個 NPC，每個有完整人格。

每個 NPC:
- \`name\`, \`role\` (e.g. "女主角候選"，無特定 role 填 "")
- \`personality_traits\`: 2-6 個 short traits (e.g. "內向", "有原則")
- \`backstory\` (20-600 字)：1-3 句過去
- \`core_motivation\` (10-280 字)：NPC 想要乜
- \`red_lines\` (1-5 條, 每條 5-140 字): hard behavioral limits — specific, NOT vague (e.g. "唔接受快速進展嘅關係" NOT "唔信任陌生人")
- \`voice_sample\` (20-400 字): 2-3 句 demonstrating 講嘢風格
- \`arc_description\` (10-280 字)：NPC 點 evolve
- \`default_disposition_toward_protagonist\`: 揀 [hostile, wary, neutral, friendly, warm, devoted]

NPC 數量 = 故事需要嘅最少 (3-5 通常啱)。質量 > 數量。`;

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

  const [meta, state, bible, characters] = await Promise.all([
    runWithRetry({
      label: "meta + opening_narrative",
      call: () =>
        generateObject({
          model: anthropicProvider(MODEL),
          schema: MetaAndOpeningSchema,
          system: META_SYSTEM,
          prompt: userPrompt,
          temperature: 0.8,
          maxOutputTokens: 3000,
        }),
    }),
    runWithRetry({
      label: "state_schema",
      call: () =>
        generateObject({
          model: anthropicProvider(MODEL),
          schema: StateSchemaWrap,
          system: STATE_SCHEMA_SYSTEM,
          prompt: userPrompt,
          temperature: 0.7,
          maxOutputTokens: 2500,
        }),
    }),
    runWithRetry({
      label: "story_bible",
      call: () =>
        generateObject({
          model: anthropicProvider(MODEL),
          schema: BibleWrap,
          system: BIBLE_SYSTEM,
          prompt: userPrompt,
          temperature: 0.7,
          maxOutputTokens: 3000,
        }),
    }),
    runWithRetry({
      label: "characters",
      call: () =>
        generateObject({
          model: anthropicProvider(MODEL),
          schema: CharactersWrap,
          system: CHARACTERS_SYSTEM,
          prompt: userPrompt,
          temperature: 0.85,
          maxOutputTokens: 4000,
        }),
    }),
  ]);

  return {
    title: meta.title,
    description: meta.description,
    genre: meta.genre,
    tags: meta.tags,
    opening_narrative: meta.opening_narrative,
    state_schema: state.state_schema,
    story_bible: bible.story_bible,
    characters: characters.characters,
  };
}
