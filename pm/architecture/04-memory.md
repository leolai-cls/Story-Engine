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

## Temporal 信念圖譜 (主要新 build · 角色演化地基)

參考 MemPalace `knowledge_graph.py` · 喺 Postgres 起一個 triples 表：

```
character_beliefs (
  id, playthrough_id, character_id,
  subject, predicate, object,        -- 三元組: (林思雅, 信任, 主角)
  valid_from timestamptz,            -- 幾時開始信
  valid_to timestamptz null,         -- 幾時唔再信 (null = 仍有效)
  invalidated_by_turn int null,      -- 邊個回合推翻
  weight float                       -- 信念強度
)
```

- **新信念**：insert · valid_to = null
- **信念被推翻**：set valid_to = now · invalidated_by_turn = 當前回合 (唔 delete · 保留歷史)
- **point-in-time query**：`WHERE valid_from <= as_of AND (valid_to IS NULL OR valid_to > as_of)`

呢個直接 power 角色靈魂 (03) 嘅信念演化。

---

## 同 Turn Pipeline 嘅關係

Prep 層 (02) 每回合：
- 4 層記憶 retrieve (現有 retriever)
- 每個 active 角色：query 佢嘅 room 經歷日誌 (RAG by current-scene similarity) + 當前有效信念 (temporal graph as_of=now)
- 全部入 Tier 2 (角色) + Tier 3 (場景)

背景層 (回合後)：寫經歷 entry + 更新信念圖譜 (新 belief / invalidate 舊 belief)。

---

## 待解決 (Open Questions)

1. MemPalace 嘅中文 entity regex 直接借用定改良 (佢個百家姓 list 可能漏字 · 我哋 Phase 5 有 CJK bigram util 可補)。
2. Temporal graph 寫入：用 LLM 抽三元組 (準但貴) 定 regex (慳但漏)。初版可 LLM 抽 · 收 lorebook 自動化嘅成本。
3. 經歷日誌 retrieval 嘅 similarity floor 要 tune (角色記憶比 general lorebook 更需要精準)。

---

_Last updated: 2026-06-01 (Session 16 · MemPalace 整合決定 grounded 喺真實 source code)_
