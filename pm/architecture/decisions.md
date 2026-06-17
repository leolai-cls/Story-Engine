# 架構決定記錄 (Architecture Decision Records)

> 每個 lock 咗嘅架構決定 + 點解。ADR-style。
> 呢度只記**架構級**決定。產品級決定喺 `pm/DECISIONS.md`。

---

## 🆕 ADR-007 · 角色深化 = 經歷漸變浮現 · 移除沉澱張力 threshold + 升級閘（2026-06-18）

> ⚠️ 修正 ADR-003 / `03-character-soul.md`。動角色深化系統前先讀呢個。

**決定**：角色嘅深化**完全由累積經歷自然浮現**，敘事者每回合讀返在場角色嘅出身 + 成段經歷，holistic 演繹返一個被經歷塑造過嘅人。**移除**以下兩個「數夠就觸發」嘅機制：

1. **沉澱張力 threshold（Pending Tension）** — 舊設計：每件事俾 weight、累積過 threshold（由「易變度」公式計）就**觸發一次「進化」改寫性格**。移除：冇 weight 累積、冇 threshold、冇易變度公式、冇「進化事件」、冇「改寫性格」嗰一步。角色「當下性格」唔係一個會被改寫嘅儲存欄位，係每回合由（出身 + 經歷）推導。
2. **角色升級閘（interaction_count ≥ 3）** — 舊設計：互動夠 3 次先「升級」開靈魂。移除：改成**漸變斜坡** —— 任何有名角色，一有有意義嘅事發生喺佢身上就記一條經歷；路人提一次就空、玩家不停互動就一條條累積、自動越嚟越深。「路人 → 真角色」係連續斜坡、跟投入度走，**冇 unlock 嗰一刻**。

**機制（threshold-free）**：
- **寫**：搭順風車現有每回合 Haiku extractor（已讀緊敘事抽狀態/信念）多抽「今回合邊個角色經歷咗咩 + 點反應」· ~零新成本 · run==charge 無 drift。
- **存**：經歷住喺 MemPalace 角色房（重用 lorebook characters wing · 一座宮殿開 N 個房 · 唔係 N 倍文件量 · 見 `04-memory.md`）。
- **餵**：只注入今個場景**在場**角色嘅經歷（唔餵晒所有出現過嘅角色）。
- **壓縮**：長故事舊經歷喺房內壓成「佢經歷過/變成點」摘要 + 保留近期全文 + 重大里程碑。⚠️「重要度」**只用嚟揀儲存優先級，永不用嚟觸發角色改變** —— 全系統零數字觸發，否則就係種返一個假 threshold。

**背景 / 觸發**：founder（2026-06-18）：「我主要係想透過角色嘅經歷自然深化，唔想強行『夠 N 次就進化/深化一次』，咁個角色塑造係假㗎。」呢個其實**解返 ADR-003 自己嘅內部矛盾** —— 沉澱張力 threshold 本身就係一個結構化籠，違反原則 1（emergent over hardcoded · 同 `03` 自己「性格活喺故事唔活喺結構」段衝突）。

**對其他 ADR 嘅影響**：
- **ADR-003（角色三層靈魂）**：三層結構（出身 anchor + 經歷日誌 + 當下狀態）**維持**；當中**沉澱張力 threshold + 升級階梯 count-gate → SUPERSEDED**（由本 ADR 取代）。
- **ADR-006（經歷「寫入」推遲 Wave 2）**：經歷日誌寫入**重新啟動**，但用本 ADR 嘅漸變式（無 sediment）。舊 `sediment.ts` 概念**永久移除**（唔只係推遲）；`experience-writer` 概念以漸變式重建。
- **信念圖譜（M4 · 事實層 · 已 live）**：不變 · 同經歷日誌互補（信念=事實一致性 · 經歷=性格/關係浮現）。

**狀態**：✅ DESIGN LOCKED（2026-06-18）· 實作分階段 pending（見實作計劃）。

---

## 🆕 ADR-006 · LIGHT-CORE PIVOT — 拎走 GM/四層 · 非成人轉 Claude（2026-06-02）

> ⚠️ 呢個 ADR 取代咗下面 ADR-001 + 四層架構。新 session 讀架構文件前，先讀呢個。

**決定**：放棄「四層 GM 仲裁」架構。每回合近乎直出：玩家輸入 → 搵記憶 → 單 Narrator 直接講故事，似 raw LLM、最少干預。非成人 narrator 改用 **Claude 直連**（Standard=Sonnet · Pro=Opus · 真逐字串流 + prompt cache）；成人維持 **Grok**（CrazyRouter · hard rule #5）。擲骰 / skill-check 移出核心（→ 將來「深模式」opt-in）。

**背景 / 觸發**：founder 親手玩 Session 16 實作出嚟嘅四層架構 → 發現**比 raw LLM（ChatGPT）更慢 + 回合間更唔一致 + 感受唔到差異**。市場研究 + 7 人策略委員會驗證：行業「更長記憶 / 更快回覆」賣唔到錢；真護城河 = 中文圈 + 唔審查 + 體驗層 + 用戶累積嘅關係連續性。

**對其他 ADR / 原則嘅影響**：
- **ADR-001（GM 降做 prep 員）→ SUPERSEDED**：唔再 demote，係**整個拎走**。GM/Director 喺核心路徑 0 live caller（neuter + dead scaffolding · 留 cleanup PR）。
- **ADR-002（只守法律底線）→ 維持**（成人 post-hoc 法律檢查 + 非成人 CSAM input floor）。
- **ADR-003（角色三層靈魂 + 沉澱張力）→ 推遲去 Wave 2**（角色 MD + keyword 調用 · MemPalace 式）。經歷「寫入」暫時關咗。
- **原則 1（emergent）+ 原則 4（零自我審查）→ 維持**；**原則 2（GM as prep）+ 原則 3（四層優先）→ 廢除**。

**狀態**：✅ Wave 1 已實作 + build + 兩輪審計修好（branch `feat/light-core-wave1` · 3 commit · **未 merge · 未部署測**）。Wave 2 pending。完整實作計劃 + 交叉檢查見 repo 根 `rebuild-plan-light-core.html`。

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

**狀態**：⚠️ **SUPERSEDED by ADR-006**（2026-06-02 light-core）—— GM 唔再 demote，係**整個拎走**。以下保留作歷史記錄。
**驗證（已過時）**：實作後用「觀察+估計春野櫻」case 跑 · 必須出 character-driven response · 唔再 canned。

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
