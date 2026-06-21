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

Only extract facts this turn's narrative TRULY established or changed. If none, return an empty beliefs array.

## experiences[] — what a character LIVED this turn (separate from the facts above)
Also extract meaningful EXPERIENCES: when something with real impact happens TO a cast character this turn, capture how they lived it. This is the layer that shapes who they gradually become (NOT facts — felt moments + responses).
Each = (character, what_happened, my_response, emotional_tone, significance):
- character — a cast member, OR a recurring named walk-on listed in the prompt
- what_happened — what happened to/around them this turn (one short line)
- my_response — how they reacted / dealt with it (short)
- emotional_tone — their feeling (e.g. shaken, grateful, guarded, disheartened)
- significance — minor (everyday) / notable (clear impact) / major (turning point: a rescue, a betrayal, a vow)
✅ the protagonist took a blade for them → {character:"…", what_happened:"protagonist shielded them, got hurt", my_response:"lowered their guard", emotional_tone:"shaken + grateful", significance:"major"}
❌ Skip pure walk-through / mundane dialogue where no one is really affected.
Most calm turns have 0-1 experiences — only capture genuinely meaningful moments. If none, return an empty experiences array.`;
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

只抽今回合叙事真正确立或改变的事实。没有就返空 beliefs 数组。

## experiences[] — 角色今回合「经历」咗咩（同上面的事实分开）
另外抽有意义的经历：今回合有真正影响的事发生在某个角色身上时，记下他怎样经历它。这层会慢慢塑造他变成怎样的人（不是事实——是切身的时刻 + 反应）。
每条 = (character, what_happened, my_response, emotional_tone, significance)：
- character — 角色名单中的人，或一个反复出现的有名路人
- what_happened — 今回合发生在他身上的事（简短一句）
- my_response — 他怎样反应 / 应对（简短）
- emotional_tone — 当下情绪（如：震撼、感激、戒备、心淡）
- significance — minor（日常）/ notable（明显影响）/ major（转折：救命之恩、背叛、誓言）
✅ 主角为他挡了一刀 → {character:"…", what_happened:"主角替他挡刀受了伤", my_response:"收起戒备", emotional_tone:"震撼+感激", significance:"major"}
❌ 跳过纯过场 / 没人真正受影响的日常对白。
大部分平淡回合 experiences 是 0-1 条——只记真正有意义的时刻。没有就返空 experiences 数组。`;
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

只抽今回合敘事真正確立或改變嘅事實。冇就返空 beliefs 數組。

## experiences[] — 角色今回合「經歷」咗咩（同上面嘅事實分開）
另外抽有意義嘅經歷：今回合有真正影響嘅事發生喺某個角色身上時，記低佢點樣經歷佢。呢層會慢慢塑造佢變成點樣嘅人（唔係事實——係切身嘅時刻 + 反應）。
每條 = (character, what_happened, my_response, emotional_tone, significance)：
- character — 角色名單入面嘅人，或者一個反覆出現嘅有名路人
- what_happened — 今回合發生喺佢身上嘅事（簡短一句）
- my_response — 佢點反應 / 應對（簡短）
- emotional_tone — 當下情緒（如：震撼、感激、戒備、心淡）
- significance — minor（日常）/ notable（明顯影響）/ major（轉折：救命之恩、背叛、誓言）
✅ 主角為佢擋咗一刀 → {character:"…", what_happened:"主角替佢擋刀受咗傷", my_response:"收起戒備", emotional_tone:"震撼+感激", significance:"major"}
❌ 跳過純過場 / 冇人真正受影響嘅日常對白。
大部分平淡回合 experiences 係 0-1 條——只記真正有意義嘅時刻。冇就返空 experiences 數組。`;
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

// ── 角色經歷 (ADR-007 · 2026-06-18) ──────────────────────────────────────────
// 折入同一個 call (founder「唔加新 LLM call」)。經歷 = 角色嘅「lived moment + felt
// response」· 累積落去由敘事者整體讀返自然塑造角色 (無 threshold · 無進化事件)。
// 同信念互補:信念 = 事實 (生死/身份)；經歷 = 發生咗咩 + 點反應 + 情緒。
//
// significance = controlled enum · grammar-cheap (hard rule #10) · 映射去
// character_experiences.weight。⚠️ weight 喺 ADR-007 只係「儲存優先級」(壓縮時揀
// 邊條保留清楚) · 永不觸發角色改變。
const SIGNIFICANCE_TO_WEIGHT: Record<"minor" | "notable" | "major", number> = {
  minor: 0.3,
  notable: 0.6,
  major: 0.9,
};

const ExperienceSchema = z.object({
  character: z.string().min(1).max(40),
  what_happened: z.string().min(1).max(200),
  my_response: z.string().min(1).max(200),
  emotional_tone: z.string().min(1).max(40),
  significance: z.enum(["minor", "notable", "major"]),
});

// 折疊 schema 細 (hard rule #10):beliefs max 4 + experiences max 3。兩個 bounded
// 短字串陣列 · 同單獨 belief schema 同一量級。若實機見 grammar 報錯 → 拆做獨立 call。
const BeliefExtractionSchema = z.object({
  beliefs: z.array(BeliefSchema).max(4),
  experiences: z.array(ExperienceSchema).max(3),
});

/** 同 lorebook 一致:短敘事 skip。 */
const MIN_NARRATIVE_LEN = 80;

/** 主角別名 → 一律正規化做「主角」(subject 去重穩定 · audit QUAL-03)。 */
const PROTAGONIST_ALIASES = new Set(["主角", "你", "protagonist", "the protagonist", "player"]);

export async function runCharacterMemoryExtraction(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  /** 主要角色名單 (name → character_id 解析 · 唔做第二個 LLM 估 id · hard rule #40)。 */
  cast: Array<{ id: string; name: string }>;
  /** 主角名 (subject 正規化:主角別名 / 真名 → 統一「主角」· 防 subject 漂移)。 */
  protagonistName?: string | null;
  /** ADR-007 Stage 1b — 即興名冊嘅路人名。經歷可記喺呢啲名 (name-keyed · 冇
   *  story_characters row) → 玩家不停互動嘅路人有機深化。信念唔用 (淨係 cast)。 */
  rosterNames?: string[];
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
    rosterNames,
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
  // audit INFO-2: 先設主角別名,後設 cast → 撞名時 cast 贏 (具體角色身份優先於
  // 通用主角 token · 避免「protagonist 同 NPC 同名」時 NPC 嘅 subject 被標做主角)。
  if (protagonistName) canonicalSubject.set(protagonistName.trim().toLowerCase(), "主角");
  for (const a of PROTAGONIST_ALIASES) canonicalSubject.set(a, "主角");
  for (const c of cast) {
    if (c.name && c.id) {
      idByName.set(c.name.trim().toLowerCase(), c.id);
      canonicalSubject.set(c.name.trim().toLowerCase(), c.name.trim());
    }
  }

  const normSubject = (s: string): string => {
    const key = s.trim().toLowerCase();
    return canonicalSubject.get(key) ?? s.trim();
  };
  const castNames = cast.map((c) => c.name).join(", ");
  // ADR-007 Stage 1b — 名冊路人 (經歷可記 name-keyed · 信念唔記)。dedup vs cast。
  const castLower = new Set(cast.map((c) => c.name.trim().toLowerCase()));
  const walkOns = (rosterNames ?? [])
    .map((n) => (n ?? "").trim())
    .filter((n) => n && !castLower.has(n.toLowerCase()));
  const walkOnList = walkOns.length ? walkOns.join(", ") : "—";

  try {
    const result = await generateObject({
      model: getProviderModel(pickUtilityModel(contentRating, "structured")),
      schema: BeliefExtractionSchema,
      system: beliefSystemPrompt(language),
      prompt:
        language === "en"
          ? `Cast: ${castNames}\nRecurring named walk-ons (experiences only · NOT beliefs): ${walkOnList}\n\nThis turn's narrative:\n${aiNarrative.slice(0, 4000)}\n\nExtract beliefs (facts · cast only) AND experiences (lived moments · cast OR a listed walk-on) per the system rules.`
          : language === "zh-Hans"
            ? `角色名单：${castNames}\n反复出现的有名路人（只记 experiences，不记 beliefs）：${walkOnList}\n\n今回合叙事：\n${aiNarrative.slice(0, 4000)}\n\n依系统规则抽 beliefs（事实·只限角色名单）和 experiences（经历·角色或路人）。`
            : `角色名單：${castNames}\n反覆出現嘅有名路人（只記 experiences，唔記 beliefs）：${walkOnList}\n\n今回合敘事：\n${aiNarrative.slice(0, 4000)}\n\n依系統規則抽 beliefs（事實·只限角色名單）同 experiences（經歷·角色或路人）。`,
      temperature: 0.2,
      maxOutputTokens: 700,
    });

    const beliefs = result.object.beliefs ?? [];
    const experiences = result.object.experiences ?? [];
    const usage = {
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
    if (beliefs.length === 0 && experiences.length === 0) {
      if (contentRating === "adult") {
        console.log(`[char-mem] adult generateObject OK · 0 beliefs / 0 experiences (valid no-op) · pt=${playthroughId}`);
      }
      return { written: 0, usage };
    }

    // ── beliefs (facts · invalidate-then-insert via apply_belief) ──
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

    // ── experiences (ADR-007 · append-only · Stage 1 = main cast only) ──
    // 角色深化嘅燃料:每條 = 角色今回合經歷咗咩 + 點反應。Append-only (無 invalidate ·
    // 累積本身就係深度 · 敘事者整體讀返自然演繹 · 無 threshold / 無進化事件)。
    // walk-on (唔喺 cast → 冇 story_characters row) 喺度 drop · 佢哋嘅有機升級 = Stage 1b。
    // embedding 階段 1 留 null (先用近期-N 讀 · RAG-by-similarity 係之後嘅 refinement)。
    // weight = significance 映射 · 純儲存優先級 · 永不觸發角色改變 (ADR-007)。
    // ADR-007 Stage 1b — 名冊路人經歷用 name-key (cast 用 character_id)。唔喺 cast
    // 又唔喺名冊嘅名 → drop (避免 LLM 亂作個名塞落去)。
    const rosterSet = new Set(walkOns.map((n) => n.toLowerCase()));
    let expWritten = 0;
    let expDropped = 0;
    for (const x of experiences) {
      const key = x.character.trim().toLowerCase();
      const charId = idByName.get(key);
      const isWalkOn = !charId && rosterSet.has(key);
      if (!charId && !isWalkOn) {
        expDropped++; // 唔識嘅名 → drop
        continue;
      }
      const row: Record<string, unknown> = {
        playthrough_id: playthroughId,
        turn_index: currentTurn,
        what_happened: x.what_happened.trim().slice(0, 500),
        my_response: x.my_response.trim().slice(0, 500),
        emotional_tone: x.emotional_tone.trim().slice(0, 60),
        weight: SIGNIFICANCE_TO_WEIGHT[x.significance],
        affects: [],
      };
      if (charId) row.character_id = charId;
      else row.character_name = x.character.trim().slice(0, 40); // walk-on · name-keyed
      const { error } = await supabase.from("character_experiences").insert(row);
      if (error) {
        const msg = String(error.message ?? "");
        if (/relation .* does not exist/i.test(msg)) {
          console.warn("[char-mem] character_experiences table missing — skip experiences");
          break; // 表唔存在 · 整批失敗 · 唔使逐個試
        }
        console.warn(`[char-mem] experience insert failed for ${x.character}: ${msg}`);
        continue;
      }
      expWritten++;
    }

    if (written > 0 || unresolved > 0 || expWritten > 0 || expDropped > 0) {
      console.log(
        `[char-mem] turn ${currentTurn}: ${written}/${beliefs.length} beliefs` +
          (unresolved > 0 ? ` (${unresolved} holder not in cast)` : "") +
          ` · ${expWritten}/${experiences.length} experiences` +
          (expDropped > 0 ? ` (${expDropped} walk-on · Stage 1b)` : "") +
          ` · pt=${playthroughId}`,
      );
    }
    return { written: written + expWritten, usage };
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

/**
 * 格式化「角色經歷」block 注入 Narrator dynamic prompt (ADR-007 · Stage 2 讀出)。
 *
 * 角色深化嘅 surface 層:敘事者每回合睇返在場角色活過嘅事 + 點反應 → 自然演繹返一個
 * 被經歷塑造嘅人 (無 threshold · 無進化事件 · 累積本身就係深度)。同 beliefsBlock 一樣
 * [INTERNAL CONTEXT — DO NOT QUOTE] fence (felt-through-narrative · hard rule #19)。
 *
 * digestByCharId = Stage 3 嘅 per-character 壓縮摘要 (舊經歷「變成點」)。空 = 純近期。
 * 每個角色:digest (if any) + recent N 條 (chrono)。空 → "" (block 自然消失)。
 */
export function formatExperiencesBlock(
  rows: Array<{
    character_id?: string | null;
    character_name?: string | null; // ADR-007 Stage 1b · walk-on name-keyed row
    turn_index: number;
    what_happened: string;
    my_response: string | null;
    emotional_tone: string | null;
    weight?: number | null;
  }>,
  castNameById: Map<string, string>,
  language: StoryLanguage,
  opts?: { recentPerChar?: number; milestonePerChar?: number; digestByName?: Map<string, string> },
): string {
  // Stage 3 (壓縮 · ADR-007):每角色 surface「近期 N 條 + 重大里程碑」· bound context 之餘
  // 永遠保留角色定義性時刻 (weight≥floor 嘅救命之恩/背叛等 · 唔會因為耐就消失)。digest
  // (LLM 長尾摘要) 由 digestByCharId 提供 · 留位未來強化。
  const recentPerChar = opts?.recentPerChar ?? 6;
  const milestonePerChar = opts?.milestonePerChar ?? 3;
  const MILESTONE_FLOOR = 0.9;
  const digestByName = opts?.digestByName;
  // SEC: 經歷係 LLM 自由文字 · 注入 narrator system prompt 前消毒 (同 formatBeliefsBlock)。
  const clean = (s: string, max = 160): string =>
    String(s ?? "")
      .replace(/[\r\n]+/g, " ")
      .replace(/\[INTERNAL|DO NOT QUOTE|<\/?player_action>/gi, "")
      .trim()
      .slice(0, max);

  type Row = (typeof rows)[number];
  const fmtLine = (r: Row, star: boolean): string => {
    const what = clean(r.what_happened);
    if (!what) return "";
    const resp = clean(r.my_response ?? "");
    const tone = clean(r.emotional_tone ?? "", 40);
    const mark = star ? "★ " : "";
    return language === "en"
      ? `- ${mark}(turn ${r.turn_index}) ${what}${resp ? ` → them: ${resp}` : ""}${tone ? ` [${tone}]` : ""}`
      : `- ${mark}（第${r.turn_index}回合）${what}${resp ? ` → 佢：${resp}` : ""}${tone ? `（${tone}）` : ""}`;
  };

  // resolve 每行嘅顯示名 (cast → castNameById · walk-on → character_name) · 按 NAME
  // group ALL rows (input arrives turn DESC)。
  const byName = new Map<string, Row[]>();
  for (const r of rows) {
    const name = r.character_id ? castNameById.get(r.character_id) : (r.character_name ?? undefined);
    if (!name) continue;
    const arr = byName.get(name) ?? [];
    arr.push(r);
    byName.set(name, arr);
  }

  const names = new Set<string>([...byName.keys(), ...(digestByName?.keys() ?? [])]);
  const sections: string[] = [];
  for (const name of names) {
    const all = byName.get(name) ?? []; // turn DESC
    const recent = all.slice(0, recentPerChar);
    const recentTurns = new Set(recent.map((r) => r.turn_index));
    // 里程碑:weight≥floor 且唔喺 recent · 取最重 milestonePerChar 條 (永遠保留)。
    const milestones = all
      .filter((r) => (r.weight ?? 0) >= MILESTONE_FLOOR && !recentTurns.has(r.turn_index))
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, milestonePerChar);

    const lines: string[] = [];
    const digest = digestByName?.get(name);
    const cleanDigest = digest ? clean(digest, 400) : "";
    if (cleanDigest) lines.push(language === "en" ? `(so far) ${cleanDigest}` : `（至今）${cleanDigest}`);
    // 里程碑 chrono 先 (★) · 跟住近期 chrono。
    for (const r of milestones.slice().sort((a, b) => a.turn_index - b.turn_index)) {
      const l = fmtLine(r, true);
      if (l) lines.push(l);
    }
    for (const r of recent.slice().reverse()) {
      const l = fmtLine(r, false);
      if (l) lines.push(l);
    }
    if (lines.length > 0) sections.push(`### ${name}\n${lines.join("\n")}`);
  }
  if (sections.length === 0) return "";
  const header =
    language === "en"
      ? `[INTERNAL CONTEXT · what these characters have LIVED (shapes who they are now — not a fact list) · DO NOT QUOTE · let their reactions stay consistent with what they've been through; don't regress them]\n## Character experiences`
      : language === "zh-Hans"
        ? `[INTERNAL CONTEXT · 这些角色经历过的事（塑造他们现在是谁——不是事实清单）· DO NOT QUOTE · 让他们的反应跟所经历的一致，别让他们倒退]\n## 角色经历`
        : `[INTERNAL CONTEXT · 呢啲角色經歷過嘅事（塑造緊佢哋而家係邊個——唔係事實清單）· DO NOT QUOTE · 令佢哋嘅反應同經歷一致，唔好令佢哋倒退]\n## 角色經歷`;
  return `${header}\n${sections.join("\n")}`;
}
