# 角色靈魂 + 記憶 實作藍圖 (Implementation Plan)

> 由概念架構 (01-07) 落到可執行嘅 milestone。開工前嘅地圖。
> Grounded 喺真實 DB schema (2026-06-01 讀過 prod)。

---

## 好消息：唔係由零起

讀咗 prod DB · 角色靈魂嘅三層**已經有兩層嘅雛形**：

| 靈魂層 (見 03) | 現有 DB 對應 | 狀態 |
|---|---|---|
| 第 1 層 · 出身 | `story_characters` (name/personality_traits/backstory/core_motivation/voice_sample/arc_description) | ✅ 雛形齊 · 缺「易變度」欄位 |
| 第 2 層 · 經歷日誌 | **冇** | ❌ 主要新 build |
| 第 3 層 · 當下狀態 | `playthrough_character_states` (disposition/dynamic_state/permanent_flags/recent_interactions_summary) | ✅ 雛形齊 |
| 沉澱張力 | **冇** | ❌ 新 build (可放 dynamic_state jsonb · 唔使新表) |
| 信念演化圖譜 | **冇** (mem_edges 係 lorebook 關係 · 唔係 temporal belief) | ❌ 主要新 build |

記憶宮殿地基亦已有：`lorebook_entries` 有 wing/room + vector embedding。

**結論：主要新 build = (a) 經歷日誌 (b) 信念演化圖譜 (c) 沉澱張力邏輯。其餘係喺現有結構上擴展。**

---

## ✅ 實作進度 (Session 16 · 2026-06-01)

第二階段全部 milestone 完成 (branch feat/character-soul-m1)：
- ✅ **M1 經歷日誌** (baf89dd): character_experiences 表 + 動態升級 (出場≥3先有靈魂) + 背景 AI 寫入
- ✅ **M4 讀取整合** (e99421a): Narrator 讀返角色經歷 (Tier 2) · 重用 query embedding
- ✅ **M2 沉澱張力** (dd7dba5): pending_tensions column + 純邏輯 sediment + volatility threshold
- ✅ **M6 機械清潔** (8c42612): cron 清走 failed turn (語意消化/去重 = backlog)
- ✅ **M3 信念圖譜** (8ecef2e): character_beliefs temporal · 收窄做事實一致性 · 同 M1 call 合併
- ✅ **M5 移除硬紅線** (c14ce37): red_lines 改出身傾向 · 角色卡 + npc-agents (director.ts 殘留留 Phase 6)

實際執行順序 M1→M4→M2→M6→M3→M5 (M4 提前等讀取框架早建 · 增量安全)。每個 build verified ·
所有 migration (0048/0049/0050) 已 apply prod。

**未做 (backlog / 待 founder)**：
- volatility 由 schema-generator 按性格生成 (暫 fallback 0.5)
- M6 語意消化整合 + 經歷去重壓縮
- director.ts 完全 deprecate (ADR-001 Phase 6)
- 5 平 model vs 1 貴 model benchmark (M4 後)
- 角色經歷 Memory Journal UI surface (hard rule #19)

---

## Milestone 拆解 (按 dependency 排)

### M1 · 經歷日誌 (Experience Log) — 地基
**目標**：角色開始「累積經歷」。

- DB：新表 `character_experiences`
  ```
  character_experiences (
    id, playthrough_id, character_id, turn_index,
    what_happened text,        -- 「主角為我擋咗一刀」
    my_response text,          -- 「我決定收起戒備」
    weight real,               -- 0-1 件事影響有幾大
    emotional_tone text,       -- 「震撼+感激」
    affects text[],            -- ["對主角嘅信任"]
    embedding vector(1536),    -- RAG retrieve 用
    created_at
  )
  ```
- 寫入：背景層 (回合後 after()) · 一個 AI call 評估「今回合對每個 active 角色有冇 meaningful impact」· 有就寫 entry。**呢個 AI call 同時做緊『理解意義』(第二層) · 順手認晒邊個角色 (見 04 兩階段讀取討論)。**
- 讀取：Prep 層每回合 · 對 active 角色 RAG 拉返相關經歷 (by current-scene similarity · floor 要 tune)。
- **動態升級 (founder #2 · 唔靜態標主要角色)**：唔係故事建立時 lock 死邊個係主要角色。改為**角色累積咗夠互動先「升級」開始有經歷日誌** — 例如出場 ≥ N 次 OR 玩家同佢直接互動過。路人甲 (出場一次就走) 永遠唔會有日誌 (慳)；玩家鍾意嘅配角會自然「長出」靈魂。**由玩家行為決定邊個重要 · 唔係我哋決定。** 呢個亦對齊「劇本隨時間演變」 — 一個本來嘅配角玩玩下變主線 · 佢就開始有靈魂。
  - 實作：`playthrough_character_states` 已有 `last_interaction_turn` · 可加一個 `interaction_count` 或者數經歷 entry 數。升級 threshold 初版用簡單規則 (出場 ≥ 3 次)。
- Demo：玩幾個回合 · 查 DB 見到**有互動嘅**角色累積經歷 entry · 路人甲冇。

### M2 · 沉澱張力 (Pending Tension) — 演化機制
**目標**：角色唔係即時反應 · 累積夠先變 (見 03)。
**Depends on M1。**

- DB：唔使新表 · 放 `playthrough_character_states.dynamic_state` jsonb 加一個 `pending_tensions` array。
- 第 1 層加「易變度」：`story_characters` 加 `volatility real default 0.5` (故事建立時 AI 生成 · 固執→低 · 情緒化→高)。
- 邏輯 (背景層)：每次寫經歷 entry 時 · 累加同類 tension · 超過 threshold (由 volatility 計) → 標記角色「消化完一個演化」· 影響佢之後反應。
- Demo：主角連續做同類事 (e.g. 講大話) · 見到角色由隱忍到 threshold 爆發。

### M3 · 信念演化圖譜 (Temporal Belief Graph) — 事實一致性工具
**目標**：記錄事實性、需要前後一致嘅信念 · 隨經歷更新 (見 04 · **範圍已收窄**)。
**Depends on M1。可同 M2 並行。**

⚠️ **範圍收窄 (founder 2026-06-01)**：只記**事實性**信念 (「陳家明 以為 主角死咗」) · **唔記性格/情緒/價值** (嗰啲會壓扁角色 · 留出身故事 + 經歷日誌)。信念圖譜係一致性工具 · 唔係性格工具。詳見 04。

- DB：新表 `character_beliefs` (參考 MemPalace knowledge_graph.py · temporal)
  ```
  character_beliefs (
    id, playthrough_id, character_id,
    subject, predicate, object,   -- (陳家明, 以為, 主角死咗) ← 事實 · 唔係 (林思雅,信任,主角)
    valid_from timestamptz, valid_to timestamptz null,
    invalidated_by_turn int null, weight real, created_at
  )
  ```
- 寫入：背景層 · **同 M1 經歷日誌合併一個 AI call** (慳錢 · founder #3)。prompt 明確界定「只抽事實性信念 · 唔抽性格判斷」 · 否則 AI 會亂塞軟嘢變硬清單。
- 讀取：Prep 層 · query 當前有效信念 (valid_to IS NULL)。
- Demo：陳家明 turn 10 信「主角死咗」→ turn 41 撞破 → 查 DB 見舊 belief invalidated · AI 寫出陳家明見到主角嘅震驚 (而唔係平靜)。

**注意 (founder 擔憂)**：M3 唔係必須。如果初版淨做 M1 經歷日誌已經夠角色立體 · M3 可以延後。M3 嘅唯一價值 = 防跨回合事實穿崩 · 唔加角色深度 (深度喺 M1)。

### M4 · Narrator 整合三層靈魂
**目標**：寫故事嘅 AI 真正用到三層靈魂 (見 02 Tier 2)。
**Depends on M1+M2+M3。**

- Prep 層：每個 active 角色 · 砌埋 (出身 + 相關經歷 + 當下狀態 + pending tensions + 當前信念) 入 Tier 2。
- Narrator prompt：教佢「角色反應基於佢累積嘅經歷同信念 · 唔係查 trait list」。
- Demo：同一個角色 · 喺兩個經歷唔同嘅 playthrough · 對同一動作反應唔同。

### M5 · 移除角色硬紅線 (ADR-002)
**目標**：角色界線變 emergent (見 03 紅線去咗邊)。
**Depends on M4 (要有靈魂先可以移除硬清單)。**

- `story_characters.red_lines` 由「硬 enforce 清單」改做「出身傾向之一」(餵入第 1 層 · 但唔再係絕對禁令)。
- 平台法律底線 (CSAM/真實傷害) 由 moderation 把守 · 同角色系統分離 · 不變。
- Demo：玩家透過長期經歷 · 改變角色一個原本嘅「界線」。

### M6 · 記憶整理/清潔系統 (07) — 背景管家
**目標**：壓縮 + 消化 + 清潔搬晒去背景 (見 07)。
**可獨立做 · 但 M1-M3 寫入越多 · 越需要。**

- 機械清潔 (純 code)：清走 failed turn · 去重。
- 語意消化：piggyback 現有 summarizer 觸發點 · 順手做角色沉澱 (M2) + 信念更新 (M3)。
- 審計「玩家等緊嗰刻只做寫故事+拉記憶」· 其他搬背景。

---

## 次序 + 並行

```
M1 經歷日誌 (地基)
  ├─→ M2 沉澱張力
  ├─→ M3 信念圖譜      (M2 M3 可並行)
  │     └─→ M4 Narrator 整合
  │           └─→ M5 移除硬紅線
  └─→ M6 清潔系統 (可任何時候插入 · M1 後越早越好)
```

建議實作順序：**M1 → M2 → M4 → M6 → M3 → M5**。
- M1 經歷日誌 = 地基 + 角色立體嘅主力 · 先做。
- M2 沉澱張力 = 角色「會演化」嘅核心體驗 · 緊接。
- M4 Narrator 整合 = 等 M1+M2 真正用到。
- M6 清潔系統 = M1/M2 寫入多咗 · 要管理。
- **M3 信念圖譜排後咗** (原本排前) · 因為佢收窄做「事實一致性工具」(founder 2026-06-01) · 唔再係角色深度主力 · 係防穿崩嘅加分項。如果 M1+M2 已夠立體 · M3 可再延後甚至唔做。
- M5 移除硬紅線 = 最後 · 要靈魂夠成熟先拆。

---

## 成本影響 (要老實 re-baseline)

每個 milestone 加 AI call · 要 re-baseline per-turn 成本 (hard rule #20)：
- M1 寫經歷：背景 1 個 AI call / 回合 (~$0.001)
- M3 信念抽取：背景 · 可同 M1 合併一個 call (慳)
- M4 整合：Narrator prompt 長咗 · input token 多 (但 prompt cache 食到大部分)

⚠️ 開工每個 milestone 前 · 估真實 per-turn 成本 vs tier 定價。可能某啲 (M1 全部角色寫日誌) 要限 active 角色數 · 或 Pro tier 先全開。

---

## 每個 Milestone 嘅 ship 紀律

跟 CLAUDE.md hard rule #7 + #29：每個 milestone = 一個可 demo 嘅完整塊 · 完成後 audit 先入下一個。唔好 M1 未穩就衝 M2。

---

## Founder 決定 (2026-06-01 · 已 lock)

1. ✅ 實作順序 OK (調整後 M1→M2→M4→M6→M3→M5 · M3 收窄後排後)。
2. ✅ 經歷日誌只**動態升級**嘅角色先寫 (出場夠多 / 玩家有互動) · 唔係全部 active 角色 · 唔靜態標主要角色 (見 M1)。
3. ✅ 信念圖譜用 AI 抽 · 同 M1 合併一個 call (慳)。範圍收窄做事實一致性 (見 M3 + 04)。
4. ✅ NPC Agent L3 **維持付費**。定位收緊 (見下「Agent 定位」)。

## Agent 定位 (founder #4 · 誠實校正)

NPC Agent (每角色獨立 LLM call) **維持付費**。但定位要誠實 · 唔可以行銷成「畀錢先有靈魂」：

- **基本層 (所有玩家) 都有靈魂**：靠三層靈魂系統 (M1-M4) + 強 Narrator model 一個 call 演多角色。一個夠強嘅 model 同一 call 演多角色係做得到嘅。
- **獨立 call 真正嘅價值** (唔係「唯一立體方法」)：(a) 逼弱 model 都唔忽略配角 (冇主角光環) (b) 多角色並行思考快 (c) 每角色 POV 更獨立。
- ❌ 唔好 marketing 成「畀錢先有靈魂」(基本層都有 · 會得罪免費用戶)。
- ✅ 定位「畀錢令多角色場景更深、更快、每角色思考更獨立」。

## 待 benchmark (完成工作後測 · founder #3 · 唔靠估)

**5 個平 model 並行 vs 1 個貴 model — 邊個遊戲體驗 + 成本好啲？**
- 5 平並行：角色公平 (各自獨立 call) · 多角色快 · 但各自盲要 synthesis
- 1 貴：一個腦睇晒連貫 · 但可能主角光環 · 角色多就慢
- **冇普世贏家 · 視乎角色數 + 平 model 質素 + 場景互動密度。用真實產品實測 · 唔靠估。**
- 喺 M4 (Narrator 整合) 完成後 · 用真實多角色場景 benchmark · 出數據先定 Agent 用咩 model。

---

_Last updated: 2026-06-01 (Session 16 · grounded 喺 prod DB schema · founder 決定 + 信念圖譜收窄 + Agent 定位校正)_
