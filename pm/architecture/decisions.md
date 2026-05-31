# 架構決定記錄 (Architecture Decision Records)

> 每個 lock 咗嘅架構決定 + 點解。ADR-style。
> 呢度只記**架構級**決定。產品級決定喺 `pm/DECISIONS.md`。

---

## ADR-001 · GM 由決策者降做 prep 員 (2026-06-01)

**決定**：移除 Director Model 嘅 verdict 仲裁角色。改用單 Narrator LLM + 四層優先級 context。

**背景**：舊系統每回合 2 個 LLM call —— Director (cheap) 出 4 選 1 verdict (allow/reject/allow_with_constraint/require_skill_check) · Narrator 跟住做。

**問題 (觸發呢個決定嘅 bug)**：Director 對 ambiguous case 過敏。玩家「觀察佢 · 心入面估計佢係春野櫻」(純內心 + 觀察) 都被判 reject · 而且 reject 路徑跌入寫死模板「場面停頓 / 眉頭微皺 / 你係咪認真 / 等你重新表達」· 每個 NPC 每次都一樣。變成 no-man AI。

**點解咁決定**：跟 [01-philosophy] 原則 2。決策應該由睇晒全部 context 嘅 Narrator 做 · 唔係一個 cheap LLM 預判。亦慳 ~30% turn cost。

**遷移 roadmap**：
1. Narrator system prompt 重構成明確 Tier 1/2/3/4 標籤 (唔郁 Director · 先試水溫)
2. Demote Director 做純 prep (保留 memory hints / scene boundary · 移除 verdict)
3. 故事生成 game-system tools + Narrator 自決擲骰 (見 05)
4. Post-hoc 紅線檢查 (見下面 note)
5. Director.ts 整個 deprecate + cleanup

**狀態**：DESIGN LOCKED · IMPLEMENTATION PENDING。
**驗證**：實作後用「觀察+估計春野櫻」case 跑 · 必須出 character-driven response · 唔再 canned。

---

## ADR-002 · 移除角色級硬紅線 · 只守法律底線 (2026-06-01)

**決定**：移除角色卡嘅 hard `red_lines` 概念。角色行為由三層靈魂推導。唯一硬底線 = 平台級法律 (CSAM / 真實傷害指引) · 同角色系統分離。

**點解**：跟 [01-philosophy] 原則 4。打仗故事要殺角色 · 黑幫要暴力 · 悲劇要背叛 —— 呢啲係故事內容 · 唔應該被平台自我審查。角色界線應該 emergent · 玩家可透過經歷改變。

**狀態**：DESIGN LOCKED。

---

## ADR-003 · 角色靈魂用三層 + 沉澱張力 (2026-06-01)

**決定**：角色 = 出身 (永久 anchor) + 經歷日誌 (累積) + 當下狀態 (即時)。演化用 pending tension threshold (累積夠先變 · threshold 由易變度定)。

**點解**：跟 [01-philosophy] 原則 1。Founder vision —— 角色經歷沉澱消化先作決定 · 重大事一次夠 · 細微事要累積。固執角色難變 · 情緒化角色易變。

**研究支持**：Letta sleep-time compute + belief revision (2025) 證實 production 可行。

**狀態**：DESIGN LOCKED · IMPLEMENTATION PENDING。

---

## ADR-004 · MemPalace 藍本重建 · 唔內嵌 (2026-06-01)

**決定**：唔跑 Python MemPalace 做 service · 唔內嵌。參考佢 schema 設計 (wings/rooms + temporal triples + validity windows) · 喺現有 Supabase Postgres 用 TypeScript 重建。

**點解**：讀咗真實 source。MemPalace 係 Python + ChromaDB + 本地 ONNX embedding · 同我哋 Next.js/TS/Postgres/Vercel 兩條技術棧 · solo dev 唔值得加多一條。但佢嘅 temporal 知識圖譜設計 (valid_from/valid_to/invalidate/as_of) 正合角色信念演化 · MIT license 可借。

**主要新 build**：Postgres `character_beliefs` 表 (temporal triples)。其餘 4 層記憶已有。

**狀態**：DESIGN LOCKED · 待 spike 驗證中文 entity 處理。

---

## ADR-005 · 自適應介面用 open-ended kit · 唔用固定數量 (2026-06-01)

**決定**：Panel 用 generative-UI 嘅 open-ended component kit 模型。AI 揀 + 出 Zod-validated JSON 配置 · 唔生成 code。Prompt 約束揀取數量。

**點解**：化解 founder「限死定無限」兩難。Open-ended kit 隨時加 · JSON 驗證防亂揀 · prompt 約束防揀太多。OpenDesign 研究後確認唔 fit (係設計工具非內嵌 kit) · 只取概念。

**狀態**：DESIGN LOCKED · 優先級喺 02/03 之後。

---

## 待寫入 CLAUDE.md / pm/DECISIONS.md

呢 5 個 ADR 需要：
- CLAUDE.md「Turn pipeline 架構」row 由「Orchestrator Pattern · Director 仲裁」改為指向呢個 folder
- pm/DECISIONS.md 加對應產品級 ADR
- pm/STATUS.md session log 記低呢次架構梳理

---

_Last updated: 2026-06-01 (Session 16)_
