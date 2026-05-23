# Clarification — Story 唔係一本固定小說，係一個 scaffold / scenario

> 俾 Claude Design 嘅澄清文件。讀完 brief 之後你部分 page 嘅 mental model 行錯咗，呢度解釋返我哋 product 嘅核心邏輯。**Visual / 設計風格繼續由你 own** · 呢度淨係 correct product model 同 framing。

---

## 1. 你部分設計 reflect 出嘅錯誤 mental model

`story-detail.jsx` 同 `library.jsx` 入面見到呢類 element：

```
完成率 62%
建議玩 10-20 turn
預估全程：28-56 credits
CH.12 · TURN 84
CH.4 · TURN 31
```

呢啲假設咗：
- ❌ 故事有一個 fixed plot / 固定結局
- ❌ Player 由 0% 玩到 100% 之後「完成」
- ❌ 有預期遊玩長度 (10-20 turn) · 過咗就「玩完」
- ❌ 有「全程」cost · 即係玩到結尾要幾多 credits
- ❌ 有 chapter 系統 player 一章章玩
- ❌ 兩個 player 玩同一個 story · 大致係玩同一個故事

**全部錯**。

---

## 2. 我哋 Story 嘅真實 model

我哋唔係 publishing platform · 我哋係 **互動式 RPG engine**。最接近嘅比喻：

| 錯嘅比喻 | 啱嘅比喻 |
|---|---|
| Netflix series · 由 EP1 睇到 EP10 完 | **D&D module / campaign setting** — DM 開個 scenario · player 自己玩 |
| 小說 · 由 P1 睇到 P300 完 | **Character.AI character** — 一個 setup + 個性 + 開場 · 之後完全 emergent |
| Visual novel · 跟 branch 揀 ending | **Skyrim 嘅一個 region** — 有 NPC · 有規則 · 但你做乜由你 |
| Steam game · 通關 = 完成 | **NovelAI 嘅 lorebook scenario** — 一個 world template |

### 一個「Story」實際上係咩

當 user 喺 `/stories/new` create 一個 story · 我哋 generate 出嚟嘅係：

| Component | 內容 | Player 玩咗會點 |
|---|---|---|
| **Premise** | 一段文字描述世界 / 情境 | 永遠唔變 |
| **Opening narrative** | 故事點開頭 (~280 字) | 每個 playthrough 都係相同 starting point |
| **State schema** | 自適應 UI (e.g., 戀愛 = 好感度條 · D&D = HP/MP) | 永遠唔變 |
| **Story Bible** | 世界規則 · 紅線 · tone | 永遠唔變 (Hard Locked 部分) |
| **Character cards** | NPC 性格 · 紅線 · voice · default disposition | 永遠唔變 (template 層面) |
| **Story arc (Acts)** | 3-5 個 Act milestones · 條件觸發 | 內部 Director guidance · NOT player-facing chapters |

呢 6 樣嘢加埋係一個 **STARTING POINT + RULESET**。

### 一個「Playthrough」實際上係咩

當 user click「開始扮演」(fork) · 系統 spin up 一個獨立 instance：

| Component | 內容 | 每 playthrough 唔同 |
|---|---|---|
| `current_state` | 主角狀態 + NPC disposition jsonb | ✅ 每 playthrough 完全不同 |
| `turns[]` | Player action + AI narration 文字 | ✅ 永遠 unique |
| `playthrough_character_states` | 4-axis disposition + permanent_flags per NPC | ✅ 跟 player 行動 evolve |
| `turn_embeddings` | 每 turn 嘅 pgvector | ✅ unique |
| `memory_summaries` | 滾動章節摘要 | ✅ AI 為呢個 player 寫嘅總結 |
| `lorebook_entries` | 自動 extract 嘅 entity (character/place/item/event) | ✅ 跟 player 玩咩 evolve |

**兩個 player 玩同一個 story · 個 playthrough 完全唔同**。陳 Sir 對 Player A 可能變成朋友 · 對 Player B 可能變成敵人。Player A 喺 turn 8 觸發 Act 2 · Player B 可能 turn 25 都仲喺 Act 1。Player A 可能玩 12 turn 就停 · Player B 玩 80 turn。

---

## 3. 點解冇「完成率」/「全程」呢啲概念

因為：

1. **無 fixed ending** — Story 冇 single 結局。Player 行動 + Director verdict + NPC 反應 = emergent narrative。
2. **Acts 唔係 chapters** — 我哋 Story Bible 有 3-5 個 Act milestone (e.g., Act 1: 認識陳 Sir + 接 case · Act 2: 揭發第一個 clue · Act 3: 揭底牌 · Act 4: choose to confront or walk away)。**呢啲 Act 嘅 transition 係 condition-based**：「好感度 >= 60 AND 1-on-1 互動 >= 3」· **絕對唔可以用 turn count**。意味住兩個 player 推進速度可以差好遠。Player C 可能永遠停喺 Act 1 因為佢冇 trigger 條件。
3. **Player 自己決定幾時停** — 玩到自己滿足為止。可以喺任何 Act 收手。冇所謂「未完成」。Drop-off ≠ 失敗。
4. **可以重玩無限次** — Fork 多次 · 每次唔同。Comments 入面已經有 player 寫「玩咗 3 個 playthrough · 每次結局都唔同」。

所以「62% 完成率」字面上係 garbage — 因為冇野俾 player 完成。如果 backend 真係有呢個 metric · 佢只係「玩到某個 internal Act milestone 嘅 % player」· 但呢個對 player 黎講係 **misleading**（暗示 38% 失敗 / 唔夠好）· 同埋會 leak Director 嘅內部結構俾 player 知 · 破壞 emergence。

---

## 4. 你部分設計做得 RIGHT (story detail)

唔係話你全錯。呢啲 element 完全 align 我哋 product model：

- ✅ **Premise / blurb** — 描述世界 + 情境 · 唔劇透
- ✅ **Opening narrative preview** — 大家都係由呢度起 · show 出嚟係 onboarding
- ✅ **Cast / NPC preview** — 角色姓名 + role + 3 個 trait · 完美。Show 個 character setup · 唔講劇情
- ✅ **Rating + comment thread** — 評嘅係「呢個 setup 好唔好玩」/「呢啲 NPC 有冇深度」· 唔係「結局好唔好」
- ✅ **Fork modal** — 改主角名 + 揀 model · atomic 開新 playthrough · 100% 啱
- ✅ **「Fork 改編」button** — 用 NovelAI / D&D module 嘅 fork-as-remix 概念 · 啱
- ✅ **403 adult mode card** — 好設計

呢啲 element keep · 唔需要改。

---

## 5. 點 fix 你部分錯嘅 framing

### Story detail stats sidebar

**而家**：
```
累計遊玩 7,220
Fork 次數 312
完成率 62%        ← drop
平均長度 14 turn  ← 重新 frame
```

**應該係**：
```
累計開過 playthrough  7,220   (number of playthroughs forked)
獨立 fork (改編)      312     (number of forks-as-remix, separate story_id)
活躍 playthrough      482     (people still playing — alive)
中位數 session 長度   14 turn (descriptive · 唔係 prescriptive)
```

或者 designer 自己想 framing · 但 **「完成率」要 drop · 「建議玩 X turn」要 drop · 「預估全程 cost」要 drop**。

**Cost estimate 可以 reframe**：
- ❌「預估全程：28-56 credits」(implies fixed 全程)
- ✅「~2 credits / turn · 你嘅餘額：184 credits」(per-turn cost · 玩到自己滿足為止 · 餘額 reference)

### Library「繼續玩」card

**而家**：
```
[Story name]
CH.12 · TURN 84
2 小時前
```

**應該係**：
```
[Story name]
TURN 84            ← drop CH chapter prefix · 我哋 DB 冇 chapter
2 小時前
```

或者 designer 想加 context 唔加 chapter：
- 「上次最後一句 narrative...」(snippet)
- 「同 [NPC 名] 嘅關係 +25」(disposition signal)
- 「上次活躍 Act：揭發階段」(internal Act name · OPTIONAL · 要諗下要唔要 leak Director 結構)

### Tags / 故事長度建議

**而家** tags 入面有「短篇 (10-20 turn)」· 暗示 fixed length。

**Drop** — 或者改成 community 觀察：「typical session: 10-20 turn」label 喺 stats area · 唔係 tag 入面 (tag 應該係 genre / theme / vibe)。

---

## 6. Story detail page 嘅 mental anchor

設計時諗呢個 framing：

> **Story detail = scenario landing page**。
> Player 嚟睇：呢個世界係點 · 入面有咩 NPC · 開頭點開 · 別人玩過點樣 (impression 而唔係 score) · 我想唔想入呢個 scenario。
>
> **唔係 product page**。
> 唔需要俾 player 計「我要 invest 幾多時間 / 錢 先可以 finish」· 因為冇 finish。

最好嘅 reference：
- Character.AI 嘅 character page (premise + personality + start chat)
- D&D Beyond 嘅 adventure module page (setting + cast + hooks · 唔講 ending)
- NovelAI 嘅 community scenario card (template description · 唔講 chapters)

避免嘅 reference：
- Steam 嘅 game page (有 chapters / endings / completion %)
- Netflix 嘅 series page (有 episode list)
- Wattpad 嘅 novel page (有 chapters · linear)

---

## 7. 仲有部分細節 — Library page 個別 cards 嘅 framing

`library.jsx` 入面 sample data：

```
{ story: STORIES[5], chapter: 12, turn: 84, npc: '陳 Sir' }
```

呢個係 designer 假設 backend return chapter 數。**我哋冇**。Backend return：

```
{
  playthrough_id,
  story_id,
  turn_count,
  current_state.__act,  ← internal Director guidance · NOT recommended to surface
  updated_at,
  ...
}
```

如果要 player-facing「我玩到邊」signal · 用以下任何一個（designer 揀）：

- `turn_count` (純數字 · 「玩咗 84 turn」)
- Last NPC mentioned in recent turn (relationship anchor)
- Disposition movement summary (e.g.「陳 Sir 信任 +15」)
- Latest summary snippet (if `memory_summaries` 有 entry · 用最新一條 ~30 字)
- Most recent permanent_flag triggered (if 想 leak achievement-like signal)

唔好用：
- ❌ Chapter (DB 冇)
- ❌ Progress % (concept 唔啱)
- ❌ Completion ETA (concept 唔啱)

---

## 8. Out-of-scope items 你加咗

你加咗呢啲嘢 backend 暫時冇 · 唔係要 drop · 但要 flag：

- **「+ 追蹤」(follow author button) + 「追蹤者 1,284」** — Backend 而家冇 user-to-user follow。可以諗住 future feature · 但 mockup 要 mark「v1.5+ 待 build」唔好假設而家 ship。
- **「STORY ID · DET-2024-0817」** — Backend 用 UUID 唔係呢個 format。Designer 自己 mock 嘅 readable ID 都得 · 但實 implementation 會係 short_code (e.g., 8-char base32)。Note for engineer。
- **Rating histogram (582 / 184 / 78 / 24 / 12)** — Backend 有 rating count + average ⭐ · 暫時冇 1★/2★/3★ breakdown。可以 push backend 加 · 但 flag。
- **Tags 「短篇 (10-20 turn)」** — Per #5 上面 · drop。Tags 應該係 genre / theme / vibe · 唔係 length。

---

## 9. 我而家想你做咩

1. **Story detail page 重新 frame stats sidebar + cost / length 描述** (per #5)
2. **Library 「繼續玩」card drop chapter display** (per #5)
3. **同你心目中其他 page (Play screen · Memory Journal etc) 想下：有冇其他地方仲假設咗 fixed-length / chapter / completion model · 一齊 fix**
4. **Phase A 兩個 page (Library + Story detail) update 完之後** pause 等 user review · 然後再 proceed Phase B

**Visual style / colors / typography / motion / 你而家整咗嘅 vibe — 全部 keep · 唔需要改**。淨係 framing 入面假設咗「story = fixed product player completes」嗰部分要 fix。

---

_Clarification doc 2026-05-23 · 解 designer Phase A 出嚟之後嘅 mental model gap · 唔影響 visual direction。_
