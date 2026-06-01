# 自適應介面 (Stage 3) 實作藍圖

> 由 [06-generative-panels] 概念落到可執行 milestone。開工前地圖。
> Grounded 喺真實 code (2026-06-01 讀過 state-panel + state-schema)。

---

## 由現狀躍進到目標 — 唔係由零起

讀咗真實 code · 現狀已經有一半：

| | 現狀 | Stage 3 目標 |
|---|---|---|
| Field 級渲染 | ✅ 有。`state_schema` 每 field 有 `render_hint` (bar/progress_ring/number/enum_chip/inventory_list/relationship_graph/meter_with_label/portrait/note) · `DynamicStatePanel` (components/state-panel) generic dispatch | 保留 (field 級自適應 work) |
| Panel 容器 | ❌ **固定一個 panel** 塞晒所有 field · 一個 layout fit 所有故事 | AI 揀邊幾個 panel 容器 + 每個點 group field |
| 關係顯示 | ❌ 裸好感度數字條 (違反沉浸感) | 質性顯示 (文字描述關係) |

**核心躍進**：由「一個 panel 塞晒」→「AI 為每個故事揀 panel 組合 + 質性化」。唔係重寫 field 渲染 · 係加一層 panel 編排。

---

## 關鍵設計決定 (開工前要 lock)

### D1 · 唔生成 code · 用 JSON 配置 + 預製 component (安全)
AI **唔出 React/HTML** (XSS / exfil 風險 · 06 已分析)。AI 出一個 **Zod-validated JSON** panel 配置 · client map 去預製 React component。同 Vercel 2026 json-render 模型一致 (06 research)。

### D2 · Panel 配置喺故事建立時生成 · 唔係每 turn
panel 組合係 per-story (穩定) · 喺 `schema-generator.ts` 嘅 parallel 流程加一個 call 生成 · 存 `stories.panel_config` jsonb。Runtime 唔再決定 panel · 淨係餵數據。(同 state_schema 一樣 lifecycle。)

### D3 · Open-ended kit + 約束揀取 (化解「限死定無限」)
Component kit 喺 codebase (TS · 唔封頂 · 隨時加)。AI 喺「當前 kit」揀 · prompt 約束「揀 0-3 個」· Zod enum 驗證揀嘅 component 存在。

### D4 · 沉浸感優先 (founder lock · 連 hard rule #19 修正)
- 關係顯示 = 質性 (文字: 「林思雅對你越嚟越信任」) · **唔係**裸數字條
- 純小說 / 偵探 → AI 可揀「唔要 panel」(空)
- 唔做 Memory Journal / dashboard

---

## Milestone 拆解

### M1 · Panel 配置 schema + DB (地基)
**目標**：定義 panel 配置點樣表達 + 存。
- `stories.panel_config` jsonb 欄位 (migration)。形狀:
  ```
  { panels: [ { component: "relationship" | "character_sheet" | "inventory" | ...,
                title: string, field_keys: string[], display_mode?: "qualitative"|"numeric" } ] }
  ```
- Zod schema (PanelConfigSchema) · `component` 係 enum (controlled vocab · 防 AI invent · hard rule #28)
- Demo：手動塞一個 panel_config · 確認存到 + parse 到

### M2 · Component kit (預製 React panel · 3-4 個起步)
**目標**：起最常用嘅幾個 panel component。
**先做 3-4 個** (唔係一次 10 個)：
- `RelationshipPanel` (質性 · 文字描述關係 · 落實 founder「唔好裸數字」)
- `CharacterSheetPanel` (HP/屬性/技能 · RPG)
- `InventoryPanel` (物品)
- `(empty)` (純小說 · render 冇 panel)
- 每個收一個 props schema (對應 M1 config) · 由現有 state field 數據餵入
- Demo：每個 component 餵假數據 render 到

### M3 · Renderer (panel_config → 揀 component render)
**目標**：play 頁由「固定 DynamicStatePanel」→「按 panel_config 揀 component」。
**Depends on M1+M2。**
- 新 `AdaptivePanels` component：讀 story.panel_config · map 每個 panel 去 kit component · 餵當前 state
- play-client 由 `<DynamicStatePanel>` 換 `<AdaptivePanels>` (fallback：冇 panel_config 就用返舊 DynamicStatePanel · 向後兼容舊故事)
- Demo：一個有 panel_config 嘅故事 render 出 AI 揀嘅 panel · 舊故事 fallback 正常

### M4 · AI 生成 panel_config (故事建立時)
**目標**：AI 為每個新故事揀 panel 組合。
**Depends on M1+M3。**
- `schema-generator.ts` 加一個 call (或者 fold 入現有 state_schema call)：俾 AI 故事 prompt + state_schema · 出 panel_config (揀邊幾個 component + field 點 group + 質性定數字)
- prompt 約束：揀 0-3 個 · component 必須喺 kit enum · 戀愛→關係 panel(質性) · 偵探→唔揀 / 案件板
- Demo：建一個戀愛故事 + 一個偵探故事 · 睇 AI 揀唔同 panel
- ⚠️ 舊故事冇 panel_config → M3 fallback 處理 (唔使 backfill)

### M5 · 裸數字條退役 (沉浸感落實)
**目標**：現有 relationship_graph 裸數字條 → 質性 (或者交 panel_config 決定)。
**Depends on M2 RelationshipPanel。**
- 現有 `DynamicStatePanel` 嘅 relationship_graph render 改質性 · 或者只喺有 panel_config 時用新 RelationshipPanel
- Demo：戀愛故事唔再見裸數字條 · 改文字描述

### M6 · 擴展 kit (按需要加)
案件板 / 圖鑑 / 隊伍 / 地圖 / 任務 / codex — 按邊類故事最多人玩逐個加。唔急 · open-ended kit 隨時加。

---

## 次序 + 並行
```
M1 panel config schema+DB (地基)
  ├─→ M2 component kit (3-4 個)
  │     └─→ M3 renderer (config→render)
  │           ├─→ M4 AI 生成 config
  │           └─→ M5 裸數字條退役
  └─ (M6 擴展 kit · M2 後任何時候)
```
建議：M1 → M2 → M3 → M4 → M5 → M6。

---

## 風險 (比 Stage 2 高 · 要留意)
1. **安全**：AI 出 JSON 落 React render。必須 Zod 嚴格驗證 + component enum allowlist + 唔 eval / 唔 dangerouslySetInnerHTML。比後台邏輯 (Stage 2) 高風險。
2. **向後兼容**：現有 9 個故事冇 panel_config → M3 fallback 一定要 work · 唔好整爛現有 play。
3. **Mobile**：panel 組合喺手機點 layout (現有 3-tab pattern: 敘事/角色/狀態) · AI 揀嘅 panel 要 fit 落去。
4. **State schema 對接**：panel 嘅 field_keys 必須對到 state_schema 真實 field (cross-reference · 似 hard rule #28 enum drift)。

---

## 待 founder 決定 (開工前)
1. Component kit 起步揀邊 3-4 個 (建議 關係/角色表/物品/空)？
2. M4 panel_config 用獨立 AI call 定 fold 入 state_schema call (慳)？
3. 優先級：Stage 3 而家做 · 定有更前嘅嘢 (角色靈魂 backlog: volatility 自動生成 / director.ts deprecate)？

---

_Last updated: 2026-06-01 (Session 16 · grounded 喺真實 state-panel + state-schema code)_
