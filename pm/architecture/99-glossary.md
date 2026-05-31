# 99 · 名詞表 (Glossary)

> 架構文件入面所有專有名詞嘅定義。中英對照。

---

| 名詞 | 英文 | 定義 |
|---|---|---|
| GM / 遊戲主持 | Game Master | 每回合 prep 層 · 整理 context 交俾 Narrator。**唔做決策** (見 02)。 |
| Narrator / 敘事者 | Narrator | 寫故事文字嘅 LLM · 玩家揀嘅 model。每回合唯一 LLM 決策者。 |
| 四層優先級 | Tier Hierarchy | 世界(1) > 角色(2) > 場景(3) > 玩家指令(4)。低層唔可推翻高層 (見 02)。 |
| 角色靈魂 | Character Soul | 角色由出身+經歷+當下三層組成嘅活性格 (見 03)。 |
| 出身 | Origin | 靈魂第 1 層 · 永久 anchor · 故事建立時生成。 |
| 經歷日誌 | Experience Log | 靈魂第 2 層 · 累積嘅 meaningful moment entries。 |
| 沉澱張力 | Pending Tension | 未夠 trigger 行為改變嘅累積張力 · 超 threshold 先令角色演化 (見 03)。 |
| 易變度 | Volatility | 角色性格參數 (0-1) · 決定佢幾易因經歷而變。 |
| 記憶宮殿 | Memory Palace | 一個 playthrough 一座 · wings/rooms/drawers 階層 (見 04)。 |
| Wing / 翼 | Wing | 宮殿頂層 · 一個人/專案/主題 (characters / places / events…)。 |
| Room / 房 | Room | wing 入面嘅 topic 分類 · 角色各佔一個 room。 |
| Temporal 信念圖譜 | Temporal Belief Graph | 角色信念嘅三元組 + 有效期 · 支援 invalidate + point-in-time query (見 04)。 |
| 故事自適應系統 | Adaptive Game System | 每個故事 AI 生成適合佢嘅 mechanics + state + panel (見 05)。 |
| State schema | State Schema | 一個故事追蹤咩數值嘅結構定義 (HP? 好感度?)。 |
| 自適應介面 | Generative Panels | AI 揀 panel + JSON 配置 · open-ended kit (見 06)。 |
| Component kit | Component Kit | AI 可揀嘅 React panel 庫 · open-ended · 隨時加。 |
| Agent mode / NPC Agent L3 | NPC Agent L3 | 每個在場角色一個 POV LLM call · 加強角色獨立性 (見 02/05)。 |
| RAG | Retrieval-Augmented Generation | 用向量相似度拉返過去相關回合做 context。 |
| 被動讀取 | Passive Retrieval | 現狀 · 一次過篩好記憶餵俾 Narrator · Narrator 唔自己再叫 (見 04)。 |
| AI 自己揾記憶 | Agentic Retrieval | 終極版 · Narrator 寫途中發現唔夠 · 自己 call search_memory tool 補返 (見 04)。DESIGN TARGET。 |
| Lorebook | Lorebook | 角色/地點/物件/事件嘅永久 facts 庫 (記憶第 4 層)。 |
| 記憶整理 / 清潔系統 | Memory Maintenance | 背景管家 · 定期壓縮+消化+清潔記憶宮殿 · 唔阻塞玩家 (見 07)。 |
| 機械式清潔 | Mechanical Cleanup | 純 code 清潔 (刪失敗回合/去重) · 即時免費 · 唔 call AI (見 07)。 |
| 語意式消化 | Semantic Digestion | AI 背景消化 (摘要/角色沉澱/信念更新) · 慢但唔阻塞玩家 (見 07)。 |
| MemPalace | MemPalace | 開源 Python 記憶系統 · 我哋取佢 schema 設計做藍本 (見 04)。 |
| Director (deprecated) | Director Model | 舊系統嘅 verdict 仲裁 LLM · 新架構移除 (見 decisions ADR-001)。 |

---

_Last updated: 2026-06-01 (Session 16)_
