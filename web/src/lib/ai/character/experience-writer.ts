import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { z } from "zod";
import { getProviderModel } from "../providers";
import { pickUtilityModel } from "../tier-router";
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

// 經歷 model 由 pickUtilityModel(contentRating) 決定 (SFW→Haiku · adult→Grok ·
// 避免 Anthropic 洗白成人經歷 + hard rule #5)。唔再寫死。

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

/**
 * M3 信念 entry — 只抽**事實性、需要前後一致**嘅信念 (「陳家明 以為 主角死咗」)。
 * ⚠️ 唔抽性格/情緒/價值 (會壓扁角色 · 留故事 · 見 04)。
 * change_type: new = 新信念 · invalidate = 推翻舊信念 (subject+predicate 配對舊嘅)。
 */
const BeliefEntrySchema = z.object({
  character_name: z.string().min(1).max(60),
  subject: z.string().min(1).max(80), // 通常係角色自己 或 主角 或 第三方
  predicate: z.string().min(1).max(40), // 以為 / 知道 / 當 / 相信 (事實關係)
  object: z.string().min(1).max(120), // 主角死咗 / 主角真實身份 / 主角係敵人
  change_type: z.enum(["new", "invalidate"]),
});

const ExperienceBatchSchema = z.object({
  entries: z.array(ExperienceEntrySchema).max(4),
  /** M3: 今回合角色嘅事實性信念變化 (只事實 · 唔抽性格) · max 3 */
  beliefs: z.array(BeliefEntrySchema).max(3).default([]),
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

## beliefs — factual belief changes (⚠️ facts ONLY, NOT personality)
Also note any FACTUAL, consistency-critical belief a character formed/lost this turn (things the AI easily forgets across turns, breaking continuity):
- ✅ Extract: "Chan Ka-ming thinks the protagonist is dead", "Lin Siu-ah knows the protagonist's true identity" (subject / predicate=thinks·knows·believes / object) · change_type="new" or "invalidate" (overturned this turn)
- ❌ Do NOT extract personality/emotion/values: "Lin Siu-ah is arrogant" ← that's characterization, belongs in experience log, NOT beliefs
- Most turns have no belief change · freely return \`beliefs: []\`. Max 3.

If nothing meaningful happened, return \`entries: []\` (+ \`beliefs: []\`).`;
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

## beliefs — 事实性信念变化（⚠️ 只抽事实 · 不抽性格）
留意角色今回合有没有**事实性、需要前后一致**的信念变化 (AI 跨回合容易记漏、记漏就穿帮)：
- ✅ 应该抽：「陈家明 以为 主角死了」「林思雅 知道 主角真实身份」(subject / predicate=以为·知道·当·相信 / object) · change_type="new" 或 "invalidate"(今回合被推翻)
- ❌ 不要抽性格/情绪/价值：「林思雅 性格 高傲」← 留给经历日志 · 不入 beliefs
- 大部分回合没有信念变化 · 放心 \`beliefs: []\`。max 3。

如果没有 meaningful 的事，return \`entries: []\` (+ \`beliefs: []\`)。`;
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

## beliefs — 事實性信念變化（⚠️ 只抽事實 · 唔抽性格）
除咗經歷 · 留意角色今回合有冇**事實性、需要前後一致**嘅信念變化。呢啲係 AI 跨回合容易記漏、記漏就穿崩嘅事實：
- ✅ 應該抽：「陳家明 以為 主角死咗」「林思雅 知道 主角真實身份」「阿強 當 主角 係敵人」(subject / predicate=以為·知道·當·相信 / object)
- ✅ change_type="new" = 新信念 · "invalidate" = 今回合呢個信念被推翻 (e.g. 陳家明撞破主角未死)
- ❌ **唔好抽**性格/情緒/價值：「林思雅 性格 高傲」「殺手 唔傷害 小朋友」← 呢啲係角色塑造 · 留俾經歷日誌 · 唔好入 beliefs
- 大部分回合冇信念變化 · 放心 \`beliefs: []\`。max 3。

如果冇 meaningful 嘅事 · return \`entries: []\` (+ \`beliefs: []\`)。`;
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
  /** 成人故事 → 經歷寫入 route 去 Grok (avoid Anthropic 洗白 + hard rule #5)。 */
  contentRating?: "sfw" | "soft" | "adult";
}): Promise<{
  written: number;
  perCharacter: WrittenExperience[];
  inputTokens?: number;
  outputTokens?: number;
}> {
  const {
    serviceClient,
    playthroughId,
    turnIndex,
    upgraded,
    turnText,
    playerAction,
    language,
    contentRating = "sfw",
  } = params;

  // 冇升級角色 → 唔使跑 AI (慳)。
  if (upgraded.length === 0) return { written: 0, perCharacter: [] };

  const nameToId = new Map(upgraded.map((c) => [c.name.trim(), c.character_id]));

  let entries: z.infer<typeof ExperienceEntrySchema>[];
  let beliefs: z.infer<typeof BeliefEntrySchema>[] = [];
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  try {
    const result = await generateObject({
      model: getProviderModel(pickUtilityModel(contentRating, "structured")),
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
    beliefs = result.object.beliefs ?? [];
    usage = {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
    // Observability (PR #62 QC · 監察 Grok 結構輸出): 成人 generateObject 成功但
    // 完全空 = valid no-op (model 判斷今回合冇值得記嘅經歷)。同「生成失敗」(catch)
    // 區分開 · 等我哋睇得出 Grok structured 係咪有問題定真係冇嘢寫。
    if (contentRating === "adult" && entries.length === 0 && beliefs.length === 0) {
      console.log(
        `[char-exp] adult generateObject OK · 0 entries+beliefs (valid no-op) · pt=${playthroughId} turn=${turnIndex}`,
      );
    }
  } catch (e) {
    // 成人 = Grok via CrazyRouter structured output · 歷史上 fragile (見 npc-agents
    // audit note) · failure 要睇得到 (watch-point)。non-fatal: 嗰回合唔寫 entry。
    console.warn(
      `[char-exp] generation FAILED (non-fatal)${contentRating === "adult" ? " · ⚠️ ADULT/Grok structured — watch CrazyRouter structured reliability" : ""}:`,
      e instanceof Error ? e.message : e,
    );
    return { written: 0, perCharacter: [] };
  }

  // M3: 寫信念變化 (temporal · new=insert · invalidate=set valid_to) · non-fatal
  await writeBeliefs(serviceClient, playthroughId, turnIndex, nameToId, beliefs);

  // 過濾走 AI invent 嘅名 (唔喺 upgraded 名單)。
  const valid = entries.filter((e) => nameToId.has(e.character_name.trim()));
  if (valid.length === 0) return { written: 0, perCharacter: [], ...usage };

  // Embed what_happened (RAG retrieve 用) · 一次過 batch。
  let vectors: (number[] | null)[] = valid.map(() => null);
  try {
    const results = await embedTexts(valid.map((e) => e.what_happened));
    vectors = results.map((r) => r.vector);
  } catch (e) {
    // Embed 失敗唔阻寫入：保留 row 因為 M2 沉澱張力 (sediment) 唔靠 embedding ·
    // 仍需要 weight + affects。⚠️ 已知限制 (Audit M-3): null-embedding 嘅 row
    // 唔會被 match_character_experiences RAG 搜到 (WHERE embedding is not null) ·
    // 而家冇 backfill job 補 embed → 呢條經歷對「讀取餵 Narrator」永久 invisible
    // (但仍計入沉澱)。embed outage 罕見 · 接受。將來如果做 backfill cron 先改。
    console.warn(
      "[char-exp] embed failed — row kept for sediment but NOT RAG-retrievable (no backfill):",
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
      return { written: 0, perCharacter: [], ...usage };
    }
    console.warn("[char-exp] insert failed:", msg);
    return { written: 0, perCharacter: [], ...usage };
  }

  // Return per-character 寫咗嘅 entry (M2 沉澱張力用：weight + affects)
  const perCharacter = valid.map((e) => ({
    character_id: nameToId.get(e.character_name.trim())!,
    weight: e.weight,
    affects: e.affects ?? [],
    what_happened: e.what_happened,
  }));

  return { written: rows.length, perCharacter, ...usage };
}

/** writeCharacterExperiences 寫咗嘅一條 entry 嘅沉澱相關部分 (per character) */
export type WrittenExperience = {
  character_id: string;
  weight: number;
  affects: string[];
  what_happened: string;
};

/**
 * M3 · 寫信念變化 (temporal · 事實一致性)。new = insert 新信念 (valid_to=null)。
 * invalidate = 揾返 subject+predicate 配對嘅當前有效信念 · set valid_to=now。
 * 全 non-fatal · migration 未 apply silent skip。
 */
async function writeBeliefs(
  serviceClient: SupabaseClient,
  playthroughId: string,
  turnIndex: number,
  nameToId: Map<string, string>,
  beliefs: z.infer<typeof BeliefEntrySchema>[],
): Promise<void> {
  if (beliefs.length === 0) return;
  for (const b of beliefs) {
    const charId = nameToId.get(b.character_name.trim());
    if (!charId) continue; // AI invent 嘅名 · skip
    try {
      if (b.change_type === "invalidate") {
        // 推翻當前有效嘅同 subject+predicate 信念
        await serviceClient
          .from("character_beliefs")
          .update({ valid_to: new Date().toISOString(), invalidated_by_turn: turnIndex })
          .eq("playthrough_id", playthroughId)
          .eq("character_id", charId)
          .eq("subject", b.subject)
          .eq("predicate", b.predicate)
          .is("valid_to", null);
      } else {
        // Audit HIGH-3: idempotent insert。先 invalidate 同 (subject+predicate)
        // 嘅舊 active 信念 (object 可能變咗 · e.g.「主角 身份 = 學生」→「= 臥底」) ·
        // 再 insert 新嘅。避免兩個 active row 同 key (撞 0052 partial unique index)
        // + 防同一事實 repeat 餵 Narrator。
        await serviceClient
          .from("character_beliefs")
          .update({ valid_to: new Date().toISOString(), invalidated_by_turn: turnIndex })
          .eq("playthrough_id", playthroughId)
          .eq("character_id", charId)
          .eq("subject", b.subject)
          .eq("predicate", b.predicate)
          .is("valid_to", null);
        await serviceClient.from("character_beliefs").insert({
          playthrough_id: playthroughId,
          character_id: charId,
          subject: b.subject,
          predicate: b.predicate,
          object: b.object,
          established_turn: turnIndex,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/does not exist/i.test(msg)) return; // migration 0050 未 apply
      // 其他錯 non-fatal · 繼續下一個
    }
  }
}

// ─── M4 讀取整合 ─────────────────────────────────────────────────────────────

export type ActiveCharacterForRead = {
  character_id: string;
  name: string;
};

/**
 * 讀取角色經歷 (M4 · Narrator 整合)。為今回合 active 角色 · 用 user-action
 * embedding query 各自相關嘅經歷 (match_character_experiences RPC · similarity
 * floor)。組成一個 markdown block 餵入 Narrator 嘅角色層 (Tier 2)。
 *
 * 用 user client (RLS: 只攞到自己 playthrough · RPC SECURITY INVOKER)。
 * queryEmbedding 重用 retriever 已算嗰個 (慳一個 embed call)。
 *
 * @returns markdown block (空 string = 冇相關經歷 · 唔加入 prompt)
 */
export async function loadCharacterExperiencesBlock(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  activeCharacters: ActiveCharacterForRead[];
  queryEmbedding: number[] | null;
  perCharacterLimit?: number;
}): Promise<string> {
  const {
    supabase,
    playthroughId,
    activeCharacters,
    queryEmbedding,
    perCharacterLimit = 3,
  } = params;

  if (!queryEmbedding || activeCharacters.length === 0) return "";

  const charIds = activeCharacters.map((c) => c.character_id);

  // M2: 攞 active 角色嘅已沉澱演化 (sediments) · 一次過 query
  const sedimentByChar = new Map<string, import("./sediment").Sediment[]>();
  try {
    const { data: stateRows } = await supabase
      .from("playthrough_character_states")
      .select("character_id, pending_tensions")
      .eq("playthrough_id", playthroughId)
      .in("character_id", charIds);
    const { parsePendingTensions } = await import("./sediment");
    for (const row of (stateRows ?? []) as Array<{
      character_id: string;
      pending_tensions: unknown;
    }>) {
      const pt = parsePendingTensions(row.pending_tensions);
      if (pt.sediments.length > 0) {
        sedimentByChar.set(row.character_id, pt.sediments);
      }
    }
  } catch {
    // non-fatal · 冇 sediment 照行
  }

  // M3: 攞 active 角色嘅當前有效信念 (valid_to IS NULL · 事實一致性) · 一次過 query
  const beliefByChar = new Map<string, string[]>();
  try {
    const { data: beliefRows } = await supabase
      .from("character_beliefs")
      .select("character_id, subject, predicate, object")
      .eq("playthrough_id", playthroughId)
      .in("character_id", charIds)
      .is("valid_to", null);
    for (const row of (beliefRows ?? []) as Array<{
      character_id: string;
      subject: string;
      predicate: string;
      object: string;
    }>) {
      const arr = beliefByChar.get(row.character_id) ?? [];
      arr.push(`${row.subject}${row.predicate}${row.object}`);
      beliefByChar.set(row.character_id, arr);
    }
  } catch {
    // non-fatal (migration 0050 未 apply) · 冇信念照行
  }

  const { sedimentsToNote } = await import("./sediment");
  // Audit MEDIUM-1 fix: 並行 query 每個角色嘅經歷 (取代 serial for loop) ·
  // 減少 player-facing turn 嘅 time-to-first-token 延遲。
  const sectionResults = await Promise.all(
    activeCharacters.map(async (ac) => {
      try {
        const { data, error } = await supabase.rpc("match_character_experiences", {
          p_playthrough_id: playthroughId,
          p_character_id: ac.character_id,
          p_query_embedding: queryEmbedding as unknown as string,
          p_match_count: perCharacterLimit,
          p_min_similarity: 0.5,
        });
        if (error) return null; // RPC/table 未 apply 或一時失敗 → skip 呢個角色
        const rows = (data ?? []) as Array<{
          what_happened: string;
          my_response: string | null;
          emotional_tone: string | null;
        }>;
        const parts: string[] = [];
        if (rows.length > 0) {
          const lines = rows
            .map((r) => {
              const resp = r.my_response ? ` → ${r.my_response}` : "";
              const tone = r.emotional_tone ? `（${r.emotional_tone}）` : "";
              return `  - ${r.what_happened}${resp}${tone}`;
            })
            .join("\n");
          parts.push(`${ac.name} 記得：\n${lines}`);
        }
        // M2: 加已沉澱演化 (角色累積經歷後真正消化咗嘅改變)
        const seds = sedimentByChar.get(ac.character_id);
        if (seds && seds.length > 0) {
          const note = sedimentsToNote(ac.name, seds);
          if (note) parts.push(note);
        }
        // M3: 加當前有效信念 (事實一致性 · 防穿崩)
        const beliefs = beliefByChar.get(ac.character_id);
        if (beliefs && beliefs.length > 0) {
          parts.push(
            `${ac.name} 而家認定嘅事實（必須前後一致 · 唔好寫到佢唔知）：\n${beliefs
              .map((b) => `  - ${b}`)
              .join("\n")}`,
          );
        }
        return parts.length > 0 ? parts.join("\n") : null;
      } catch {
        return null; // non-fatal · 一個角色失敗唔影響其他
      }
    }),
  );
  const sections = sectionResults.filter((s): s is string => s !== null);

  if (sections.length === 0) return "";

  // 包喺 internal-context tag (同 npcInnerStreamsBlock 一致 · 防 verbatim quote)
  return `[INTERNAL CONTEXT — DO NOT QUOTE · 角色記憶背景 · 用嚟令角色反應基於佢累積嘅經歷]
## 角色經歷記憶
呢啲係相關角色之前經歷過、並影響緊佢哋而家點睇嘢嘅事。寫角色反應時 · 由呢啲累積經歷推導佢哋嘅態度 · 唔好當佢哋係第一次見主角。唔好逐字引用 · 用你自己嘅敘事自然體現。

${sections.join("\n\n")}`;
}
