import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { z } from "zod";
import { anthropicProvider } from "../providers";
import { DEFAULT_DIRECTOR } from "../models";
import { embedTexts } from "../embed";

/**
 * 角色經歷日誌寫入 (Character Soul M1 · pm/architecture/03 + IMPLEMENTATION).
 *
 * 每個有意義嘅回合之後 · 背景層 (turn route onFinish · after()) 為「升級咗」嘅
 * active 角色評估「今回合對佢有冇 meaningful impact」· 有就寫一條經歷 entry。
 *
 * 動態升級 (founder #2): 唔靜態標主要角色。只為 interaction_count >= UPGRADE_THRESHOLD
 * 嘅角色寫日誌。路人甲 (出場一次就走) 永遠唔升級 · 慳 AI call + 慳儲存。
 *
 * 呢個 AI call 同時做緊「理解意義」(靈魂第二層) · 順手認晒邊個角色出場
 * (見 04 兩階段讀取) — 唔需要另外一個 regex 認名 call。
 *
 * Cost: ~$0.001 / turn (one Haiku call · 只有有升級角色嘅回合先跑)。
 * Fire-and-forget from turn route onFinish via after(). 唔阻塞 client。
 */

const EXPERIENCE_MODEL = DEFAULT_DIRECTOR; // Haiku 4.5

/** 動態升級 threshold — 角色出場累積到呢個次數先開始有經歷日誌。 */
export const SOUL_UPGRADE_THRESHOLD = 3;

type StoryLanguage = "zh-Hant" | "zh-Hans" | "en";

/**
 * 一條經歷 entry 嘅 AI 輸出 schema。一個 call 可以為多個角色各寫一條。
 * character_name 必須 EXACTLY match 傳入嘅 upgraded 角色名 (防 AI invent)。
 */
const ExperienceEntrySchema = z.object({
  character_name: z.string().min(1).max(60),
  /** 件事 (客觀發生咗咩 · 從呢個角色 POV) */
  what_happened: z.string().min(4).max(280),
  /** 角色嘅回應 / 決定 (佢點消化) · 可空 (e.g. 純旁觀) */
  my_response: z.string().max(200).optional(),
  /** 0-1 件事對佢嘅影響有幾大 (沉澱張力 M2 用) */
  weight: z.number().min(0).max(1),
  /** 情感色彩 (e.g. 「震撼+感激」) */
  emotional_tone: z.string().max(40).optional(),
  /** 影響到角色嘅邊啲方面 (e.g. ["對主角嘅信任"]) · max 3 */
  affects: z.array(z.string().min(1).max(40)).max(3).default([]),
});

const ExperienceBatchSchema = z.object({
  entries: z.array(ExperienceEntrySchema).max(4),
});

function experienceSystemPrompt(
  language: StoryLanguage,
  upgradedNames: string[],
): string {
  const nameList = upgradedNames.map((n) => `「${n}」`).join("、");
  if (language === "en") {
    return `You are Story Engine's character-experience archivist. After reading the latest turn, decide whether anything happened that MEANINGFULLY affected any of these characters: ${upgradedNames.map((n) => `"${n}"`).join(", ")}.

For each character GENUINELY affected this turn, write ONE experience entry (from that character's POV):
- \`character_name\` — MUST exactly match one of the names above. Do NOT invent characters.
- \`what_happened\` (4-280 chars) — what objectively happened, from this character's POV.
- \`my_response\` (optional, ≤200) — how the character internally responded / decided. Skip if they were a passive bystander.
- \`weight\` (0-1) — how much this affects them. 0.9 = life-changing (saved their life, betrayal). 0.2 = minor friction. Most turns: 0.2-0.5.
- \`emotional_tone\` (optional, ≤40) — e.g. "shock + gratitude".
- \`affects\` (0-3) — what facets it touches, e.g. ["trust toward protagonist"].

⚠️ Bias HARD toward FEWER entries:
- **Most turns affect NOBODY meaningfully** — ordinary dialogue / passing-through does NOT warrant an entry. Return \`entries: []\` freely.
- Only write an entry when something genuinely lands on a character (a choice, a revelation, a charged moment).
- One entry per character max. Never more than 4 total.
- Do NOT write entries for characters not in the list above.

If nothing meaningful happened, return \`entries: []\`.`;
  }
  if (language === "zh-Hans") {
    return `你是 Story Engine 的角色经历记录员。看完最新一回合后，判断有没有发生对以下角色有 MEANINGFUL 影响的事：${nameList}。

为每个今回合真正受影响的角色，写 ONE 经历 entry（从该角色 POV）：
- \`character_name\` — 必须 EXACTLY 对上上面其中一个名。不可 invent 角色。
- \`what_happened\` (4-280 字) — 客观发生了什么，从这个角色 POV。
- \`my_response\` (可选, ≤200) — 角色内心怎么回应 / 决定。纯旁观就 skip。
- \`weight\` (0-1) — 对他影响多大。0.9 = 改变一生 (救命、背叛)。0.2 = 小磨擦。大部分回合: 0.2-0.5。
- \`emotional_tone\` (可选, ≤40) — e.g.「震撼+感激」。
- \`affects\` (0-3) — 触及哪些方面, e.g. ["对主角的信任"]。

⚠️ 强烈 bias 向 FEWER entries：
- **大部分回合对任何人都没 meaningful 影响** — 日常对话 / 路过 不需要 entry。放心 return \`entries: []\`。
- 只在真正打到角色身上 (一个选择、一个揭露、一个 charged moment) 才写。
- 每个角色最多一条。总数不超过 4。
- 不在上面名单的角色不要写。

如果没有 meaningful 的事，return \`entries: []\`。`;
  }
  return `你係 Story Engine 嘅角色經歷記錄員。睇完最新一回合之後 · 判斷有冇發生對以下角色有 MEANINGFUL 影響嘅事：${nameList}。

為每個今回合真正受影響嘅角色 · 寫 ONE 經歷 entry（從嗰個角色 POV）：
- \`character_name\` — 必須 EXACTLY 對上上面其中一個名。唔可以 invent 角色。
- \`what_happened\` (4-280 字) — 客觀發生咗咩 · 從呢個角色 POV。
- \`my_response\` (可選, ≤200) — 角色內心點回應 / 決定。純旁觀就 skip。
- \`weight\` (0-1) — 對佢影響有幾大。0.9 = 改變一生 (救命、背叛)。0.2 = 小磨擦。大部分回合: 0.2-0.5。
- \`emotional_tone\` (可選, ≤40) — e.g.「震撼+感激」。
- \`affects\` (0-3) — 觸及邊啲方面, e.g. ["對主角嘅信任"]。

⚠️ 強烈 bias 向 FEWER entries：
- **大部分回合對任何人都冇 meaningful 影響** — 日常對白 / 路過 唔需要 entry。放心 return \`entries: []\`。
- 只喺真正打到角色身上 (一個選擇、一個揭露、一個 charged moment) 先寫。
- 每個角色最多一條。總數唔超過 4。
- 唔喺上面名單嘅角色唔好寫。

如果冇 meaningful 嘅事 · return \`entries: []\`。`;
}

export type UpgradedCharacter = {
  character_id: string;
  name: string;
};

/**
 * 寫角色經歷日誌。只為 upgraded 角色跑。冇 upgraded 角色就直接 return (慳 call)。
 *
 * @param serviceClient service-role client (bypass RLS · memory lockdown 0018)
 * @param upgraded 已升級 (interaction_count >= threshold) 嘅 active 角色
 * @param turnText 今回合 Narrator 寫嘅故事文字
 * @param playerAction 玩家今回合輸入
 * @returns 寫咗幾多條 entry (telemetry)
 */
export async function writeCharacterExperiences(params: {
  serviceClient: SupabaseClient;
  playthroughId: string;
  turnIndex: number;
  upgraded: UpgradedCharacter[];
  turnText: string;
  playerAction: string;
  language: StoryLanguage;
}): Promise<{ written: number; inputTokens?: number; outputTokens?: number }> {
  const {
    serviceClient,
    playthroughId,
    turnIndex,
    upgraded,
    turnText,
    playerAction,
    language,
  } = params;

  // 冇升級角色 → 唔使跑 AI (慳)。
  if (upgraded.length === 0) return { written: 0 };

  const nameToId = new Map(upgraded.map((c) => [c.name.trim(), c.character_id]));

  let entries: z.infer<typeof ExperienceEntrySchema>[];
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  try {
    const result = await generateObject({
      model: anthropicProvider(EXPERIENCE_MODEL),
      schema: ExperienceBatchSchema,
      messages: [
        {
          role: "system",
          content: experienceSystemPrompt(
            language,
            upgraded.map((c) => c.name),
          ),
        },
        {
          role: "user",
          content: `[玩家行動]\n${playerAction.slice(0, 1000)}\n\n[今回合故事]\n${turnText.slice(0, 3000)}`,
        },
      ],
      temperature: 0.3,
      maxOutputTokens: 800,
    });
    entries = result.object.entries;
    usage = {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
  } catch (e) {
    console.warn(
      "[char-exp] generation failed (non-fatal):",
      e instanceof Error ? e.message : e,
    );
    return { written: 0 };
  }

  // 過濾走 AI invent 嘅名 (唔喺 upgraded 名單)。
  const valid = entries.filter((e) => nameToId.has(e.character_name.trim()));
  if (valid.length === 0) return { written: 0, ...usage };

  // Embed what_happened (RAG retrieve 用) · 一次過 batch。
  let vectors: (number[] | null)[] = valid.map(() => null);
  try {
    const results = await embedTexts(valid.map((e) => e.what_happened));
    vectors = results.map((r) => r.vector);
  } catch (e) {
    // Embed 失敗唔阻寫入 · 留 null embedding (清潔系統將來可補 embed)。
    console.warn(
      "[char-exp] embed failed (writing without embedding):",
      e instanceof Error ? e.message : e,
    );
  }

  const rows = valid.map((e, i) => ({
    playthrough_id: playthroughId,
    character_id: nameToId.get(e.character_name.trim())!,
    turn_index: turnIndex,
    what_happened: e.what_happened,
    my_response: e.my_response ?? null,
    weight: e.weight,
    emotional_tone: e.emotional_tone ?? null,
    affects: e.affects ?? [],
    embedding: vectors[i] ?? null,
  }));

  const { error } = await serviceClient.from("character_experiences").insert(rows);
  if (error) {
    const msg = String(error.message ?? "");
    if (/relation .* does not exist/i.test(msg)) {
      // Migration 0048 未 apply — silent no-op。
      return { written: 0, ...usage };
    }
    console.warn("[char-exp] insert failed:", msg);
    return { written: 0, ...usage };
  }

  return { written: rows.length, ...usage };
}
