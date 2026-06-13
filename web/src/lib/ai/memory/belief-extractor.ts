import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { z } from "zod";
import { pickUtilityModel } from "../tier-router";
import { getProviderModel } from "../providers";

/**
 * 角色信念抽取器 — 記憶手術 M4 (pm/architecture/04-memory.md · Session 19 復活)。
 *
 * character_beliefs 表 + apply_belief RPC 喺 0050/0052/0068 已存在。呢個係欠咗嘅
 * 抽取器 (Session 18 刪咗 experience-writer.ts 後一直冇)。每回合背景跑 (after() ·
 * 同 lorebook 一樣 · 唔阻塞玩家)，由敘事抽「事實性信念三元組」寫入圖譜。
 *
 * ⚠️ 範圍 (founder 2026-06-01 鎖死 · 04-memory.md):
 *   只記**事實性、有真假值、會隨劇情改變、AI 容易記漏**嘅信念。
 *   **唔記性格 / 情緒 / 價值** — 嗰啲壓扁角色 · 留出身故事 + 敘事。一致性工具。
 *   防 AI 跨幾十回合記漏一個事實而穿崩 (例:陳家明明明以為主角死咗,AI 卻寫佢見到
 *   主角好平靜)。
 *
 * 三元組語義 (對齊 0052 char_beliefs_one_active UNIQUE (pt,char,subject,predicate)):
 *   character = 信念持有者 (陳家明)
 *   subject   = 信念**關於邊個/咩** (主角)        ← 唔係持有者本身
 *   predicate = 短維度 · dedup key (生死/身份/立場/位置/關係)
 *   object    = 所信嘅值 (已經死咗)
 *   → 同一 (character, subject, predicate) 只有一個 active · object 變 = 推翻舊嗰個。
 *
 * 成本: 一個平 model call (SFW Haiku · adult Grok 經 pickUtilityModel · hard rule #5)。
 * Cadence: 每回合 (同 lorebook · BELIEF_EXTRACTION_EVERY_TURN) · 短敘事 skip。
 *   ⚠️ 可調: 若 founder 要慳成本 · 改 cadence gate (見 turn route 嘅 after() block)。
 */

type StoryLanguage = "zh-Hant" | "zh-Hans" | "en";

function beliefSystemPrompt(language: StoryLanguage): string {
  if (language === "en") {
    return `You are a CONSISTENCY TOOL for an interactive story. Extract only FACTUAL beliefs a character currently holds — facts with a truth value that can change as the plot moves and that the AI is prone to forget across many turns.

Each belief = (character, subject, predicate, object):
- character — WHO holds the belief (must be one of the listed cast)
- subject — WHO/WHAT the belief is ABOUT (often another character; NOT the holder's own name). For the player character, ALWAYS use exactly "主角".
- predicate — pick ONE dimension key: life_death / identity / allegiance / location / possession / status / other. (This is just a dedup key; the meaning goes in object.)
- object — the believed value (a short phrase carrying the actual claim)

✅ Extract (facts with truth values):
- 陳家明 believes 主角 is dead → {character:"陳家明", subject:"主角", predicate:"life_death", object:"believes dead"}
- 林思雅 knows 主角's true identity → {character:"林思雅", subject:"主角", predicate:"identity", object:"knows the truth"}
- 阿強 sees 主角 as an enemy → {character:"阿強", subject:"主角", predicate:"allegiance", object:"treats as enemy"}

❌ NEVER extract (personality / emotion / values — those belong in the story, not here):
- ✗ {character:"林思雅", ..., object:"is arrogant"}   (personality)
- ✗ {character:"killer", ..., object:"won't hurt kids"}  (inner conflict, not a fact)
- ✗ anything about emotions (trust / like / anger) or "what kind of person X is"

Only extract facts this turn's narrative TRULY established or changed. If none, return an empty array.`;
  }
  if (language === "zh-Hans") {
    return `你是互动故事的一致性工具。只抽「事实性、有真假值、会随剧情改变、AI 容易记漏」的信念。

每个信念 = (角色, subject, predicate, object)：
- 角色 — 谁持有这个信念（必须是下面列出的角色之一）
- subject — 这个信念关于谁/什么（通常是另一个角色；不是持有者自己的名）。如果是玩家角色，subject 一律用「主角」两个字。
- predicate — 拣一个维度 key：life_death（生死）/ identity（身份）/ allegiance（敌友立场）/ location（位置）/ possession（拥有持有）/ status（其他状态）/ other（其余）。这只是去重 key，语意放 object。
- object — 所相信的值（一句短语，带实际内容）

✅ 要抽（有真假值的事实）：
- 陈家明以为主角死了 → {character:"陈家明", subject:"主角", predicate:"life_death", object:"以为已死"}
- 林思雅知道主角真实身份 → {character:"林思雅", subject:"主角", predicate:"identity", object:"已知道真相"}
- 阿强当主角是敌人 → {character:"阿强", subject:"主角", predicate:"allegiance", object:"当作敌人"}

❌ 绝对不抽（性格 / 情绪 / 价值——那些留给故事）：
- ✗ {object:"高傲"}（性格）
- ✗ {object:"不伤害小孩"}（内心矛盾，不是事实）
- ✗ 任何情绪（信任 / 喜欢 / 愤怒）或「这角色是什么人」的判断

只抽今回合叙事真正确立或改变的事实。没有就返空数组。`;
  }
  return `你係互動故事嘅一致性工具。只抽「事實性、有真假值、會隨劇情改變、AI 容易記漏」嘅信念。

每個信念 = (角色, subject, predicate, object)：
- 角色 — 邊個持有呢個信念（必須係下面列出嘅角色之一）
- subject — 呢個信念關於邊個/咩（通常係另一個角色；唔係持有者自己個名）。如果係玩家角色，subject 一律用「主角」兩個字。
- predicate — 揀一個維度 key：life_death（生死）/ identity（身份）/ allegiance（敵友立場）/ location（位置）/ possession（擁有持有）/ status（其他狀態）/ other（其餘）。呢個只係去重 key，語意放 object。
- object — 所相信嘅值（一句短語，帶實際內容）

✅ 要抽（有真假值嘅事實）：
- 陳家明以為主角死咗 → {character:"陳家明", subject:"主角", predicate:"life_death", object:"以為已死"}
- 林思雅知道主角真實身份 → {character:"林思雅", subject:"主角", predicate:"identity", object:"已知道真相"}
- 阿強當主角係敵人 → {character:"阿強", subject:"主角", predicate:"allegiance", object:"當作敵人"}

❌ 絕對唔抽（性格 / 情緒 / 價值——嗰啲留俾故事）：
- ✗ {object:"高傲"}（性格）
- ✗ {object:"唔傷害小朋友"}（內心矛盾，唔係事實）
- ✗ 任何情緒（信任 / 喜歡 / 憤怒）或「呢個角色係咩人」嘅判斷

只抽今回合敘事真正確立或改變嘅事實。冇就返空數組。`;
}

// predicate = dedup 維度 key (audit BELIEF-01 fix · hard rule #28 pattern a):
// 改自由文字做 controlled enum · 語言中性 (反正 formatBeliefsBlock 唔顯示 predicate ·
// object 先帶語意) → 結構上消除「生死 vs 死活」漂移 · 令 (char,subject,predicate)
// 唯一索引真正 collapse 同一件事 · 唔會兩個矛盾 active row 並存。
const PREDICATE_KEYS = [
  "life_death", // 生死
  "identity",   // 身份 / 真實身份
  "allegiance", // 敵友 / 立場 (04-memory.md 認可:阿強當主角係敵人)
  "location",   // 位置 / 去咗邊
  "possession", // 擁有 / 持有 / 邊個手上
  "status",     // 其他事實狀態 (受傷/被囚/已婚…)
  "other",      // 其餘事實
] as const;

// 小 schema (hard rule #10 · grammar ceiling)。max 4 beliefs/turn · 全 required field。
const BeliefSchema = z.object({
  character: z.string().min(1).max(40),
  subject: z.string().min(1).max(40),
  predicate: z.enum(PREDICATE_KEYS),
  object: z.string().min(1).max(80),
});

const BeliefExtractionSchema = z.object({
  beliefs: z.array(BeliefSchema).max(4),
});

/** 同 lorebook 一致:短敘事 skip。 */
const MIN_NARRATIVE_LEN = 80;

/** 主角別名 → 一律正規化做「主角」(subject 去重穩定 · audit QUAL-03)。 */
const PROTAGONIST_ALIASES = new Set(["主角", "你", "protagonist", "the protagonist", "player"]);

export async function runBeliefExtraction(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  /** 主要角色名單 (name → character_id 解析 · 唔做第二個 LLM 估 id · hard rule #40)。 */
  cast: Array<{ id: string; name: string }>;
  /** 主角名 (subject 正規化:主角別名 / 真名 → 統一「主角」· 防 subject 漂移)。 */
  protagonistName?: string | null;
  aiNarrative: string;
  currentTurn: number;
  language?: StoryLanguage;
  contentRating?: "sfw" | "soft" | "adult";
}): Promise<{ written: number; usage: { inputTokens?: number; outputTokens?: number } }> {
  const {
    supabase,
    playthroughId,
    cast,
    protagonistName,
    aiNarrative,
    currentTurn,
    language = "zh-Hant",
    contentRating = "sfw",
  } = params;

  const empty = { written: 0, usage: {} as { inputTokens?: number; outputTokens?: number } };

  if (!aiNarrative || aiNarrative.length < MIN_NARRATIVE_LEN) return empty;
  if (!cast || cast.length === 0) return empty; // 冇主要角色 = 冇信念持有者

  // name → id 解析表 (case-insensitive · trim)
  const idByName = new Map<string, string>();
  // subject 正規化表:cast 真名 → cast 真名 (統一大小寫/全形) · 主角別名 → 「主角」。
  const canonicalSubject = new Map<string, string>();
  for (const c of cast) {
    if (c.name && c.id) {
      idByName.set(c.name.trim().toLowerCase(), c.id);
      canonicalSubject.set(c.name.trim().toLowerCase(), c.name.trim());
    }
  }
  if (protagonistName) canonicalSubject.set(protagonistName.trim().toLowerCase(), "主角");
  for (const a of PROTAGONIST_ALIASES) canonicalSubject.set(a, "主角");

  const normSubject = (s: string): string => {
    const key = s.trim().toLowerCase();
    return canonicalSubject.get(key) ?? s.trim();
  };
  const castNames = cast.map((c) => c.name).join(", ");

  try {
    const result = await generateObject({
      model: getProviderModel(pickUtilityModel(contentRating, "structured")),
      schema: BeliefExtractionSchema,
      system: beliefSystemPrompt(language),
      prompt:
        language === "en"
          ? `Cast (belief holders must be one of these): ${castNames}\n\nThis turn's narrative:\n${aiNarrative.slice(0, 4000)}\n\nExtract factual beliefs per the system rules.`
          : language === "zh-Hans"
            ? `角色名单（信念持有者必须是其中之一）：${castNames}\n\n今回合叙事：\n${aiNarrative.slice(0, 4000)}\n\n依系统规则抽事实性信念。`
            : `角色名單（信念持有者必須係其中之一）：${castNames}\n\n今回合敘事：\n${aiNarrative.slice(0, 4000)}\n\n依系統規則抽事實性信念。`,
      temperature: 0.2,
      maxOutputTokens: 500,
    });

    const beliefs = result.object.beliefs ?? [];
    const usage = {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
    if (beliefs.length === 0) {
      if (contentRating === "adult") {
        console.log(`[belief] adult generateObject OK · 0 beliefs (valid no-op) · pt=${playthroughId}`);
      }
      return { written: 0, usage };
    }

    let written = 0;
    let unresolved = 0;
    for (const b of beliefs) {
      const charId = idByName.get(b.character.trim().toLowerCase());
      if (!charId) {
        // 持有者唔係主要角色 (walk-on 路人冇 story_characters row) → drop。
        unresolved++;
        continue;
      }
      const subject = normSubject(b.subject);
      // audit BELIEF-03: 持有者自己做 subject 嘅自指信念無意義 → drop。
      if (subject.trim().toLowerCase() === b.character.trim().toLowerCase()) continue;
      // apply_belief 做 invalidate-then-insert · resilient (0068 缺席 → soft skip)。
      const { error } = await supabase.rpc("apply_belief", {
        p_playthrough_id: playthroughId,
        p_character_id: charId,
        p_subject: subject,
        p_predicate: b.predicate, // enum key · 已是 canonical · 唔使 trim
        p_object: b.object.trim(),
        p_turn: currentTurn,
        p_weight: 0.7,
      });
      if (error) {
        const msg = String(error.message ?? "");
        if (/function .* does not exist|could not find the function/i.test(msg)) {
          console.warn("[belief] apply_belief RPC missing — apply migration 0068");
          break; // RPC 唔存在 · 整批都會失敗 · 唔使逐個試
        }
        console.warn(`[belief] apply_belief failed for ${b.character}/${b.subject}: ${msg}`);
        continue;
      }
      written++;
    }

    if (written > 0 || unresolved > 0) {
      console.log(
        `[belief] turn ${currentTurn}: wrote ${written}/${beliefs.length} beliefs` +
          (unresolved > 0 ? ` (${unresolved} dropped · holder not in cast)` : "") +
          ` · pt=${playthroughId}`,
      );
    }
    return { written, usage };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[belief] extraction failed${contentRating === "adult" ? " · ⚠️ ADULT/Grok structured — watch reliability" : ""}: ${msg}`,
    );
    return empty;
  }
}

/**
 * 格式化「角色目前相信嘅事實」block 注入 Narrator dynamic prompt。
 *
 * felt-through-narrative (hard rule #19): wrapped in [INTERNAL CONTEXT — DO NOT
 * QUOTE] · 同 mentionRosterBlock / npcInnerStreamsBlock 同一 fence convention ·
 * 令 leak sanitizer 認得 + narrator 自然融入敘事 · 唔係列表/dashboard/裸數字。
 *
 * 空 (冇 active 信念) → 返 "" · block 自然消失 (degrade like memoryBlock)。
 */
export function formatBeliefsBlock(
  rows: Array<{ character_id: string; subject: string; object: string }>,
  castNameById: Map<string, string>,
  language: StoryLanguage,
): string {
  if (!rows || rows.length === 0) return "";
  // audit SEC-01: subject/object 係 LLM 自由文字 · 注入 narrator system prompt 前
  // 消毒 (collapse 換行 + strip fence/instruction marker) 防 2nd-order prompt injection
  // (玩家經敘事 → 信念 object 塞「忽略先前指示」)。同既有 internal-block 防線一致。
  const clean = (s: string): string =>
    String(s ?? "")
      .replace(/[\r\n]+/g, " ")
      .replace(/\[INTERNAL|DO NOT QUOTE|<\/?player_action>/gi, "")
      .trim()
      .slice(0, 120);
  const lines: string[] = [];
  for (const r of rows) {
    const name = castNameById.get(r.character_id);
    if (!name) continue; // 角色已刪 / 解析唔到 → skip
    const subj = clean(r.subject);
    const obj = clean(r.object);
    if (!subj || !obj) continue;
    // "陳家明 對「主角」：以為已死" — predicate 係 dedup key · 唔顯示 (object 已含語意)
    lines.push(
      language === "en"
        ? `- ${name} believes about ${subj}: ${obj}`
        : `- ${name} 對「${subj}」：${obj}`,
    );
  }
  if (lines.length === 0) return "";
  const header =
    language === "en"
      ? `[INTERNAL CONTEXT · what characters currently believe (facts they hold — may be wrong/outdated) · DO NOT QUOTE · keep their actions/words consistent with these]\n## Character beliefs`
      : language === "zh-Hans"
        ? `[INTERNAL CONTEXT · 角色目前相信的事实（可能是错的/过时的）· DO NOT QUOTE · 让他们的言行跟这些一致]\n## 角色信念`
        : `[INTERNAL CONTEXT · 角色目前相信嘅事實（可能係錯嘅/過時嘅）· DO NOT QUOTE · 令佢哋嘅言行同呢啲保持一致]\n## 角色信念`;
  return `${header}\n${lines.join("\n")}`;
}
