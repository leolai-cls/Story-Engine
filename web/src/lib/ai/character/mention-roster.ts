/**
 * 即興名冊 (Mention Roster · 角色升級階梯第 0 層 · pm/architecture/03).
 *
 * 防 retcon：AI 一提到某個名 (連 walk-on 路人) 就記低 {名, 第幾回合}。下回合將成個
 * 名冊餵返 Narrator (內部 context · 唔俾玩家睇)，等就算弱 model 都有 grounding —
 * 唔會改個名、唔會當佢哋無出現過。解決真實 bug：turn 2 寫「阿俊」· turn 4 否認改
 * 「阿輝」(弱 model 記唔牢一閃名)。
 *
 * 升級階梯：即興名冊(0) → lorebook(1·有描述+embedding) → 完整靈魂(2·經歷+沉澱)。
 * 主角 + 已有 story_characters 角色唔入名冊 (佢哋已經喺 Narrator 嘅 character context)。
 *
 * 純邏輯 (無 AI call)。名嘅抽取重用 turn route 既有 Haiku extractTurnState call —
 * 只攞名 (string array)·唔攞描述·保護嗰個關鍵 schema 唔爆 grammar ceiling。
 */

export type RosterEntry = { name: string; turn: number };

/** 防 prompt 無限長 · 保留最早出場嗰 N 個 (最早 = 最可能再被提起)。 */
const ROSTER_CAP = 40;

function normName(n: string): string {
  return n.trim().toLowerCase();
}

/** 安全 parse DB jsonb (容錯·舊 playthrough 冇 column → undefined → [])。 */
export function parseMentionRoster(raw: unknown): RosterEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RosterEntry[] = [];
  for (const e of raw) {
    if (e && typeof e === "object" && typeof (e as RosterEntry).name === "string") {
      const name = (e as RosterEntry).name.trim();
      if (!name) continue;
      const turn = typeof (e as RosterEntry).turn === "number" ? (e as RosterEntry).turn : 0;
      out.push({ name, turn });
    }
  }
  return out;
}

/**
 * 將今回合抽到嘅新名 merge 入名冊。純函數。
 * - dedup by 正規化名 (保留最早出場嗰條)
 * - 排除主角 / 已有主要角色 (knownNames · 已喺 character context · 唔使重複)
 * - capped ROSTER_CAP (按 turn 升序保留最早)
 */
export function mergeMentionRoster(
  current: RosterEntry[],
  mentions: string[],
  turn: number,
  knownNames: string[],
): RosterEntry[] {
  const known = new Set(knownNames.map(normName));
  const byName = new Map<string, RosterEntry>();
  for (const e of current) byName.set(normName(e.name), e);
  for (const raw of mentions) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    const key = normName(name);
    if (known.has(key)) continue; // 主要角色唔入冊
    if (byName.has(key)) continue; // 已記低 → 保留最早出場
    byName.set(key, { name, turn });
  }
  return [...byName.values()].sort((a, b) => a.turn - b.turn).slice(0, ROSTER_CAP);
}

/**
 * 組成俾 Narrator 嘅名冊 block (內部 context · wrapped · 唔俾玩家睇)。
 * 排除主要角色 (knownNames)。空 = 冇 walk-on 名 → 唔注入。
 */
export function formatMentionRosterBlock(
  roster: RosterEntry[],
  knownNames: string[],
): string {
  const known = new Set(knownNames.map(normName));
  const rows = roster.filter((e) => !known.has(normName(e.name)));
  if (rows.length === 0) return "";
  const lines = rows.map((e) => `  - ${e.name}（第 ${e.turn} 回合出現過）`).join("\n");
  return `[INTERNAL CONTEXT — DO NOT QUOTE]
## 已出場人物名冊（曾經喺呢個故事提過名嘅人 · 包括路人配角）
呢啲名係 canon · 之前出現過。如果玩家或劇情再提起佢哋 · 要保持一致 —— 唔好改個名、唔好話「冇呢個人」、唔好當佢哋從未出現。如果某個名你已經唔記得佢係邊個 · 當佢係之前出場過嘅人去自然處理 · 唔好否認佢存在：
${lines}`;
}
