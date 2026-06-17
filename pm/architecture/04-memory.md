# 04 · 記憶架構 (Memory)

> 4 層記憶 + 角色記憶共享宮殿 + temporal 信念演化。
> Anchor 原則：[01-philosophy] 原則 1 (emergent)。
> 配合 [03-character-soul] 一齊睇 (角色記憶係呢度嘅一部分)。

---

## 核心理念

解決行業 churn #1 主因「AI 唔記得」。記憶分 4 層 · 每層解決唔同時間尺度嘅記憶。

---

## 4 層記憶架構

| 層 | 內容 | 時間尺度 | 現狀 |
|---|---|---|---|
| 近期全文 | 最近 ~20 回合原文 | 即時 | ✅ 已實作 |
| 滾動摘要 | 過去 scene 嘅摘要 (scene-boundary 觸發) | 中期 | ✅ 已實作 |
| RAG 向量 | 過去具體回合 by similarity | 長期 | ✅ 已實作 (pgvector) |
| 自動 lorebook | 角色/地點/物件/事件嘅 facts | 永久 | ✅ 已實作 |

呢 4 層已經喺 `lib/ai/memory/retriever.ts` 運作 · 有 per-source similarity floor (summaries 0.55 / RAG 0.5 / lorebook 0.45) 防 noise。

---

## 角色記憶：唔為每個角色起一座宮殿

> Founder concern：冇辦法為每個角色建立屬於佢哋嘅記憶宮殿 · 否則每個故事文件量會好大。

**解決：用 MemPalace 嘅 single-palace-multi-agent 模型。**

```
一個 playthrough = 一座記憶宮殿
├── protagonist wing (主角)
├── characters wing
│   ├── 林思雅 room
│   │   ├── 出身 (第 1 層靈魂 · 靜態)
│   │   └── 經歷日誌 entries (第 2 層靈魂 · 累積)
│   ├── 陳家明 room
│   └── ...
├── places wing
├── events wing
└── lore wing
```

關鍵：角色記憶**唔係複製成獨立結構** · 係共享宮殿入面用 wing/room namespace 隔離。5 個角色 = 一座宮殿開 5 個房 · 唔係 5 倍文件量。每個角色嘅 POV 記憶透過 query 自己嗰個 room 攞。

---

## MemPalace 整合決定 (已 research 真實 code · 2026-06-01)

我讀咗 `C:\Users\user\Desktop\mempalace-develop` 嘅真實 source。事實 (唔係 marketing claim)：

### ✅ 啱用嘅地方
- **MIT license** → 可商用 fork / 改。
- **真有繁中 (zh-TW) 支持**：`mempalace/i18n/zh-TW.json` 有完整 entity section · 中文人名用「百家姓開頭 + 1-2 中文字」regex 偵測 · topic 用 `[一-鿿]{2,}` 抽取。唔係得個英文。
- **真 temporal 知識圖譜**：`mempalace/knowledge_graph.py` · SQLite-backed · 有 `valid_from` / `valid_to` / `invalidate()` / `as_of` point-in-time query。**正正係角色信念演化要嘅嘢** (林思雅 turn 5 信「主角係衰人」→ turn 23 被救後 invalidate → 新信念生效 · query 時攞當前有效嗰個)。
- **wing/room 階層** 對應我哋角色 namespace 需求。

### ⚠️ 唔可以直接用嘅地方 (重要)
- **MemPalace 係 Python + ChromaDB + 本地 ONNX embedding** (`all-MiniLM-L6-v2` 或 `embeddinggemma`)。我哋係 **Next.js 16 / TypeScript / Supabase Postgres (pgvector) / Vercel serverless**。
- **唔可以內嵌入我哋 codebase** · 兩條技術棧。
- 佢個 embedding 唔係我哋用緊嘅 (我哋用 CrazyRouter text-embedding-3-small · 中文友好)。
- 「zero-LLM / 170 tokens」claim 係佢用本地 model · 同我哋架構唔直接搬。

### 整合決定：藍本重建 · 唔係內嵌
- **唔** 跑 Python MemPalace 做 service (多一條技術棧 · solo dev 唔值)。
- **參考 MemPalace 嘅 schema design** (wings/rooms/drawers + temporal triples + validity windows) · 喺我哋現有 **Supabase Postgres** 重建一個 TypeScript 版。
- 我哋已經有 pgvector + lorebook (wings/rooms 喺 Migration 0023 已有) · 缺嘅係 **temporal 信念圖譜** (valid_from/valid_to/invalidate)。呢個係主要新 build。
- 角色 room namespace：用現有 lorebook 嘅 `characters` wing · 每角色一個 room · 加經歷日誌做新 drawer type。

---

## Temporal 信念圖譜 (主要新 build · 事實一致性工具)

> ⚠️ **範圍收窄 (founder 2026-06-01)**：信念圖譜**只**記「事實性、需要前後一致、AI 容易記漏」嘅嘢。**絕對唔係**用嚟代表角色嘅性格 / 情緒 / 價值 — 嗰啲會把角色壓扁 (見 [03] 矛盾活喺故事)。性格留喺出身故事 + 經歷日誌 · 由 AI 推導。信念圖譜係**一致性工具** · 唔係性格工具。

### 適合放入信念圖譜嘅 (事實 · 有明確真假 · 會隨時間變)
- 「陳家明 以為 主角死咗」(turn 10-40 有效 · turn 41 撞破)
- 「林思雅 知道 主角嘅真實身份」(turn 23 開始)
- 「阿強 當 主角 係敵人」

呢啲嘢 AI 跨越幾十回合好易記漏 · 記漏就會穿崩 (e.g. 陳家明明明以為主角死咗 · 但 AI 寫到佢見到主角好平靜)。信念圖譜防呢種一致性 bug。

### 唔好放入信念圖譜嘅 (性格 / 情緒 / 價值 → 留故事)
- ❌「林思雅 性格 高傲」← 壓扁 · 寫入出身
- ❌「殺手 唔傷害 小朋友」← 呢個係佢嘅內心矛盾 · 寫入出身故事 · 由 AI 理解
- ❌ 任何「呢個角色係咩人」嘅判斷 ← 全部留故事 + 經歷日誌

### Schema (參考 MemPalace knowledge_graph.py)
```
character_beliefs (
  id, playthrough_id, character_id,
  subject, predicate, object,        -- 三元組: (陳家明, 以為, 主角死咗)
  valid_from timestamptz,            -- 幾時開始信
  valid_to timestamptz null,         -- 幾時唔再信 (null = 仍有效)
  invalidated_by_turn int null,      -- 邊個回合推翻
  weight float                       -- 信念強度
)
```

- **新信念**：insert · valid_to = null
- **信念被推翻**：set valid_to = now · invalidated_by_turn = 當前回合 (唔 delete · 保留歷史)
- **point-in-time query**：`WHERE valid_from <= as_of AND (valid_to IS NULL OR valid_to > as_of)`

⚠️ 實作時 · 寫入嘅 AI prompt 要明確界定「只抽事實性信念 · 唔抽性格判斷」 · 否則 AI 會亂塞「林思雅信任主角」呢類軟嘢入去 · 慢慢變返硬性性格清單。

> **實作備註 (Session 19 · M4 復活 · migration 0068 + belief-extractor.ts)**：上面 `(陳家明, 以為, 主角死咗)` 係概念寫法。**實際實作收緊咗三元組嘅角色**以結構上消除「謂詞語意漂移」(0052 自己 flag 過嘅殘留 bug)：
> - `subject` = 信念**關於邊個/咩** (主角 · 陳家明…) · 寫入前對齊角色名單 + 主角別名正規化 (「你」/真名 → 統一「主角」)。
> - `predicate` = **短維度 dedup key 嘅 controlled enum**（`life_death`/`identity`/`allegiance`/`location`/`possession`/`status`/`other`）· **唔顯示** · 純為令 `(playthrough, character, subject, predicate)` 唯一索引 collapse 同一件事 (生死變咗就推翻舊嗰個 · 唔會兩個矛盾 active row 並存)。
> - `object` = 帶語意嘅所信值 (「以為已死」)。注入 narrator 時格式 = 「{角色} 對「{subject}」：{object}」(felt-through-narrative · `[INTERNAL CONTEXT]` fence · hard rule #19)。
> 信念圖譜 = 一致性工具,同經歷日誌寫入解耦。**更新（ADR-007 · 2026-06-18）**：經歷日誌寫入（前 experience-writer）以**漸變式重新啟動**（無 threshold · 搭順風車現有每回合 Haiku extractor · 見 [03] + decisions.md ADR-007）；sediment（沉澱張力 threshold）概念**永久移除**（唔只係推遲）。信念圖譜（事實層）同經歷日誌（性格/關係層）互補。

---

## 同 Turn Pipeline 嘅關係

Prep 層 (02) 每回合：
- 4 層記憶 retrieve (現有 retriever)
- 每個 active 角色：query 佢嘅 room 經歷日誌 (RAG by current-scene similarity) + 當前有效信念 (temporal graph as_of=now)
- 全部入 Tier 2 (角色) + Tier 3 (場景)

背景層 (回合後)：寫經歷 entry + 更新信念圖譜 (新 belief / invalidate 舊 belief)。

---

## 兩階段記憶讀取：而家 vs 終極版

記憶讀取分兩種做法 · 由簡單到聰明：

### 現狀 · 一次過篩好餵 (passive retrieval)
```
玩家輸入 → 篩出相關角色 → 攞嗰啲角色嘅記憶 → 一次過餵俾 Narrator
Narrator 收到固定嘅一份記憶 · 唔會自己再叫多啲
```
簡單 · 平 · 夠用。但有個盲點：如果一開始篩漏咗 (例如玩家提到一件好耐之前嘅事 · 但相似度唔夠高冇被揀中) · Narrator 就冇咗嗰段記憶 · 會「唔記得」。

### 終極版 · AI 自己揾記憶 (agentic retrieval) — DESIGN TARGET
```
玩家輸入 → 篩出初步記憶 → 餵俾 Narrator
Narrator 寫故事途中 · 發現「我需要知道林思雅同陳家明之前嘅恩怨」
  → 自己 call 一個 search_memory tool 主動揾返嗰段
  → 攞到先繼續寫
```
Narrator 唔再被動接受一份固定記憶 · 而係好似一個真人作者咁 · 寫到邊、覺得唔夠資料 · 就主動翻返舊嘢查。呢個係業界叫 agentic retrieval / tool-use retrieval 嘅做法。

**點解係終極版必要嘅嘢** (founder 2026-06-01)：
- 解決「篩漏」盲點 — Narrator 自己補返漏咗嘅記憶 · 唔會無端「唔記得」
- 角色靈魂更真 — 一個真人記得嘅嘢唔係固定一批 · 係「諗起先翻查」· agentic retrieval 更貼近真實記憶
- 長故事更穩 — 玩到 200 回合 · 一次過篩好嘅做法越嚟越易漏 · AI 自己揾就唔受長度影響

**實作位置**：呢個係 Narrator 嘅一個 `search_memory` tool (Vercel AI SDK tool calling) · 同 [05-game-system] 嘅故事 mechanics tools 同一個機制。代價：多咗 tool call → 慢少少 + 貴少少 · 所以可能係 Pro tier 或者長故事先開。

**Phase placement**：DESIGN TARGET · 唔係第一版。第一版用 passive retrieval (現狀) · 角色靈魂地基穩咗 + Narrator tool 機制起好 (05) 之後先加。

---

## 待解決 (Open Questions)

1. MemPalace 嘅中文 entity regex 直接借用定改良 (佢個百家姓 list 可能漏字 · 我哋 Phase 5 有 CJK bigram util 可補)。
2. Temporal graph 寫入：用 LLM 抽三元組 (準但貴) 定 regex (慳但漏)。初版可 LLM 抽 · 收 lorebook 自動化嘅成本。
3. 經歷日誌 retrieval 嘅 similarity floor 要 tune (角色記憶比 general lorebook 更需要精準)。

---

_Last updated: 2026-06-01 (Session 16 · MemPalace 整合決定 grounded 喺真實 source code)_
