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
 *
 * Phase 1.5 wiring: Anthropic Claude Sonnet 4.6 with structured output.
 *
 * CRITICAL: All sub-schemas are kept tight (no optional / default fields)
 * to stay under Anthropic's 24-optional-param grammar compilation limit.
 * Display polish (colors, prefixes, etc.) is derived in renderers from
 * field.key heuristics rather than emitted by LLM.
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

每個 field 必須包含：\`key\` (snake_case), \`label\` (繁中), \`render_hint\`。

\`render_hint\` 揀以下 9 個之一 + 每個額外必須 field：

- \`bar\`: + \`max\` (number > 0) + \`default\` (number) — HP, MP, 體力 with explicit cap
- \`progress_ring\`: + \`default\` (0-100) — 好感度 / 完成度等百分比
- \`number\`: + \`default\` (number) — 金錢、得分、經驗值
- \`enum_chip\`: + \`options\` (string[], 2-12) + \`default\` (string in options) — 心情、狀態
- \`inventory_list\`: + \`default\` (array of {name, count, icon}) — 背包
- \`relationship_graph\`: + \`default\` (object name→number) — NPC 多人關係
- \`meter_with_label\`: + \`max\` (number > 0) + \`default\` (number) — 體力百分比 with cap
- \`portrait\`: + \`default\` (string URL or empty "") — 主角頭像
- \`note\`: + \`default\` (string text) — 日記、線索、自由文字

**規則**：
- 5-12 個 fields。
- key 用 snake_case (e.g. \`linsiya_affinity\`, \`hp\`)，唔可以重複
- label 用繁中
- **每 field 一定要有 \`default\` value**（即使係 0 / "" / [] / {}）
- inventory_list 嘅 default 每個 item 一定要有 name + count + icon (icon 用 emoji 例如 🎒 ⚔️ 💐)
- 戀愛 → 用 progress_ring (好感度) + enum_chip (心情) + number (零用錢) + inventory_list (禮物) + note (日記)
- D&D → bar (HP/MP) + number (力量/敏捷/智力) + inventory_list (背包)
- 體育 → meter_with_label (體力) + number (得分/籃板/助攻) + enum_chip (教練信任度) + relationship_graph (隊友)

## 2. story_bible（3 層 calibration，per ADR-008）

### hard_locked — AI 永遠唔可以推翻
- \`central_conflict\`: 一句話描述故事核心衝突
- \`world_invariants\`: 3-6 條世界硬規則
- \`themes_required\`: 0-5 個 short labels (empty array OK)
- \`tone\`: 揀一個 [realistic, romantic, dark_humor, epic_fantasy, noir, slice_of_life, thriller, comedy]
- \`language\`: "zh-Hant" / "zh-Hans" / "en"
- \`cultural_setting\`: 文化背景（e.g. "HK 1980s 古惑仔"; 若 generic 可以填 ""）

### soft_guided — Director 有彈性
- \`story_arc\`: 2-5 個 Act
  - 每 Act: \`act\` (1-5), \`name\`, \`narrative_intent\`, \`transition_condition\`
  - **transition_condition 必須用 boolean DSL referencing state fields**
    e.g. "characters.linsiya.disposition.trust >= 60 AND interactions.linsiya >= 3"
  - **唔可以用 turn count**
- \`pacing_hint\`: 一句話描述 pacing (可填 "")

## 3. characters（1-6 個 NPCs）

每個 NPC：
- \`name\`, \`role\` (e.g. "女主角候選" / "" if no specific role)
- \`personality_traits\`: 2-6 個 short traits
- \`backstory\`: 1-3 句 (20-600 字)
- \`core_motivation\`: NPC 想要乜（一句, 10-280 字）
- \`red_lines\`: 1-5 條 hard limits — specific, NOT vague
- \`voice_sample\`: 2-3 句 demonstrating 講嘢風格 (20-400 字)
- \`arc_description\`: NPC 點 evolve（10-280 字）
- \`default_disposition_toward_protagonist\`: [hostile, wary, neutral, friendly, warm, devoted]

## 4. opening_narrative（100-1500 字）
- 繁中第二人稱（"你..."）
- 設定場景 + 介紹至少一個主要 NPC
- 留 emergence 空間俾玩家做第一個行動

## 5. title / description / genre / tags
- \`title\`: 故事標題 (2-80 字)
- \`description\`: 簡短介紹 (10-280 字)
- \`genre\`: 類型 (2-40 字)
- \`tags\`: 0-6 個 tag (each 2-20 字)

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

請設計完整 story package（state_schema + story_bible + 1-6 characters + opening_narrative）。`;

  const result = await generateObject({
    model: anthropicProvider("claude-sonnet-4-6"),
    schema: StoryGenerationResultSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.8,
    maxOutputTokens: 8000,
  });

  return result.object;
}
