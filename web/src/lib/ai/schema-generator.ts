"use server";

import { z } from "zod";
import { generateObject } from "ai";
import { anthropicProvider } from "./providers";
import { StateSchemaShape } from "@/schemas/state-schema";
import { StoryBibleSchema } from "@/schemas/bible";
import { CharacterCardSchema } from "@/schemas/character";

/**
 * Schema generator — the LLM service that takes a user's story prompt
 * and produces:
 *   - state_schema (drives the side panel UI per ADR-014/orchestrator)
 *   - story_bible (3-tier hard/soft per ADR-008)
 *   - characters[] (NPCs with red_lines per ADR-006)
 *   - opening_narrative (first AI message)
 *   - suggested cover_prompt (v1.5 image gen)
 *
 * Phase 1.5 wiring: Anthropic Claude Sonnet 4.6 with structured output.
 */

const StoryGenerationResultSchema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().min(10).max(280),
  genre: z.string().min(2).max(40),
  tags: z.array(z.string().min(2).max(20)).max(6),
  state_schema: StateSchemaShape,
  story_bible: StoryBibleSchema,
  characters: z.array(CharacterCardSchema).min(1).max(6),
  opening_narrative: z.string().min(100).max(1500),
  cover_prompt: z.string().max(280).optional(),
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

const SYSTEM_PROMPT_ZH_HANT = `你係 Story Engine 嘅 story designer。用戶會俾你一個故事概念，你要設計：

## 1. state_schema（故事自適應介面）
**揀啱嘅 render_hint** 表達呢個故事最重要嘅狀態。9 個選擇：

- \`bar\`：HP、體力等有 max 嘅 numeric (好似 D&D HP/MP)
- \`progress_ring\`：好感度 0-100 嘅圓環（戀愛故事必用）
- \`number\`：金錢、得分、經驗值（純數字 + prefix/suffix）
- \`enum_chip\`：心情、狀態、階級（從 options 揀一個）
- \`inventory_list\`：背包、收藏、隊友清單（array of objects）
- \`relationship_graph\`：NPC 多人關係圖（map of name → -100..100）
- \`meter_with_label\`：體力百分比 + label（"體力 78%"）
- \`portrait\`：主角頭像 URL（可空）
- \`note\`：自由文字段（日記、線索、筆記）

**規則**：
- 5-12 個 fields。唔好太少（淨係 HP 太單薄）亦唔好太多（過 12 個眼花）
- 每個 field 嘅 key 用 snake_case（e.g. \`linsiya_affinity\`, \`hp\`）
- label 用繁中
- 每個 field 一定要有 \`default\` value
- 戀愛 → 用 progress_ring + enum_chip(心情) + number(零用錢) + inventory(禮物) + note(日記)
- D&D → bar(HP/MP) + number(力量/敏捷/智力) + inventory(背包)
- 體育 → meter_with_label(體力) + number(得分/籃板/助攻) + enum_chip(教練信任度) + relationship_graph(隊友)

## 2. story_bible（3 層 calibration，per ADR-008）

### Hard Locked（150-300 字總共，5-10 條 declarative）— AI **永遠**唔可以推翻
- \`central_conflict\`: 故事核心衝突（一句話）
- \`world_invariants\`: 3-6 條世界硬規則（物理、社會、設定 limits）
- \`themes_required\`: 必要主題 (0-5 個 short labels)
- \`tone\`: 揀一個 [realistic, romantic, dark_humor, epic_fantasy, noir, slice_of_life, thriller, comedy]
- \`cultural_setting\`: 文化背景（e.g. "HK 1980s 古惑仔", "TW 大學校園"）

### Soft Guided（300-500 字總共）— Director 有彈性
- \`story_arc\`: 2-5 個 Act
  - 每個 Act 有 \`act\`(1-5), \`name\`, \`narrative_intent\`(短解釋), \`transition_condition\`
  - **transition_condition 永遠用 boolean DSL referencing state fields**，
    e.g. "characters.linsiya.disposition.trust >= 60 AND interactions.linsiya >= 3"
  - **永遠唔可以用 turn count threshold** (e.g. "turn >= 12")

## 3. characters（3-5 個 NPCs，每個有 red_lines per ADR-006）
每個 NPC：
- name, role (e.g. "女主角候選", "宿敵", "導師")
- personality_traits: 2-6 個 short traits
- backstory: 1-3 句
- core_motivation: NPC 想要乜（一句）
- **red_lines: 1-5 條 hard behavioral limits** —
  e.g. "唔接受快速進展嘅關係" / "永遠唔會背叛兄弟"
  要 specific，唔可以 vague。Director 用呢啲做 enforcement boundary。
- voice_sample: 2-3 句 demonstrating 講嘢風格
- arc_description: NPC 點 evolve（一兩句）
- default_disposition_toward_protagonist: [hostile, wary, neutral, friendly, warm, devoted] 揀一個

## 4. opening_narrative（100-1500 字）
- 繁中第二人稱（"你..."）
- 設定場景 + 介紹至少一個主要 NPC
- 留一個 prompt 等玩家做第一個行動（"你會點做？"）
- 唔好太長 — 留 emergence 空間

## 5. cover_prompt（optional, 280 字以內）
英文一句 描述故事 visual mood — 將來餵 image gen。

---
**永遠輸出 valid JSON 符合 schema。中文字符自由用。**`;

export async function generateStory(
  input: GenerateStoryInput,
): Promise<StoryGenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Add to .env.local + Vercel env vars.",
    );
  }

  const systemPrompt = SYSTEM_PROMPT_ZH_HANT; // TODO: locale-aware variants

  const userPrompt = `用戶故事概念：

${input.prompt}

${input.protagonist_hint ? `主角設定提示：${input.protagonist_hint}` : ""}

Content rating: ${input.content_rating}
Locale: ${input.locale}

請設計完整 story package（state_schema + story_bible + 3-5 characters + opening_narrative）。`;

  const result = await generateObject({
    model: anthropicProvider("claude-sonnet-4-6"),
    schema: StoryGenerationResultSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.8, // creative
    maxOutputTokens: 8000,
  });

  return result.object;
}
