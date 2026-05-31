# 03 · 角色靈魂 (Character Soul)

> 角色點樣有獨立、會演化嘅性格。產品最重要嘅系統之一。
> Anchor 原則：[01-philosophy] 原則 1 (emergent) + 原則 4 (no censorship)。

---

## 核心理念

角色嘅性格唔係寫死嘅 trait 清單。係由「出身 + 經歷 + 沉澱」累積出嚟。

角色經歷一啲事 → 沉澱消化 → 先作決定。重大嘅事可能要累積多次先改變佢嘅行為。需要幾耐、幾多次，取決於：
1. 件事對佢嘅影響有幾大
2. 嗰個角色本身嘅性格 (有人易變 · 有人固執)

玩家可以透過長期相處同共同經歷 · 真正改變一個角色嘅性格同行為。**角色係活嘅。**

---

## 三層結構

每個角色喺 runtime 由三層組成：

### 第 1 層 · 出身 (Origin · 永久 anchor)
故事建立時 AI 生成 · 之後唔變。係角色嘅 identity 錨點。
- 出生 / 背景 / 來歷
- 起始性格 seed (3-5 關鍵特質 · 只係起點 · 唔係 lock)
- 初始講嘢風格樣本 (seed)
- 核心驅動力 (呢個人為咩而活)
- 同主角嘅起點關係
- **易變度 (volatility)**：0-1 · AI 按性格生成 (固執→低 · 情緒化→高) · 用嚟計沉澱 threshold

**呢層係 anchor**：經歷可以 colour / amplify / relax 性格 · 但唔可推翻 core identity。一個本來內向嘅人玩到 50 回合唔會無端變外向 · 但可以由「怕醜唔敢講嘢」演化成「對住信任嘅人先肯開口」。

### 第 2 層 · 經歷日誌 (Experience Log · 累積)
每個有意義嘅回合之後 · 為 active 角色寫一條 entry：
```
{
  turn_index: 23,
  what_happened: "主角為我擋咗一刀 · 自己受咗傷",
  my_response: "我決定收起對佢嘅戒備",
  weight: 0.9,              // 件事對佢影響有幾大 (0-1)
  emotional_tone: "震撼 + 感激",
  affects: ["對主角嘅信任"]
}
```
唔係每回合都寫 · 只係有 meaningful impact 嘅 moment 先寫。日常對白唔寫。

### 第 3 層 · 當下狀態 (Snapshot · 即時)
每回合更新：當下心情 · 今 scene 想做咩 · 注意緊咩 · 今回合對主角嘅情緒傾向。

---

## 「沉澱消化」點實現 (Pending Tension 機制)

> Founder vision：角色經歷咗嘢要沉澱消化先作決定 · 甚至要多次經歷先改變行為。

呢個唔係即時反應 · 係累積 threshold 機制：

```
每個角色有一組「未沉澱嘅張力」(pending tensions)：

一件事發生但未夠 trigger 行為改變時：
  → 累積入 pending tension · 唔即時改變角色
  → 例：主角第 1 次講大話 (weight 0.3) · 林思雅心存芥蒂但唔出聲

同類張力累積到超過該角色嘅 threshold 時：
  → 角色「消化完」· 作出行為改變
  → 例：第 4 次講大話 · 累積 0.3+0.4+0.3+0.5 = 1.5 > threshold 1.2
       → 林思雅終於攤牌 / 失去信任 / 質問

Threshold 由角色嘅易變度 (第 1 層) 決定：
  - 固執/慢熱 → 高 threshold (要好多次先變)
  - 敏感/情緒化 → 低 threshold (一兩次就反應)
```

- **重大單一事件** (weight 0.9 救命之恩) → 一次就觸發
- **細微累積事件** (weight 0.2 小磨擦) → 要累積多次

呢個就係「需要幾耐/幾多次取決於件事影響 + 角色性格」嘅技術實現。

---

## 矛盾、例外、情境跳 — 活喺故事 · 唔活喺結構 (founder 2026-06-01)

真實性格係矛盾、有層次、有例外、隨情境跳嘅。任何「結構化清單 / 框架」(trait 清單、紅線清單、九型人格、Big Five、Saville Wave 等) 都會把角色**壓扁** — 呢個正正係我哋拆走 Director 想避開嘅同一個錯 (把複雜有機嘅嘢變硬性規則)。

例子 (清單做唔到 · 故事做到)：
- **殺人狂但唔傷害小朋友**：唔好寫規則 `never_hurt_children=true`。喺第 1 層出身寫故事：「他在戰亂中長大，殺人如麻。但妹妹在他面前被殺，從此他無法對任何孩子下手。」→ Narrator 讀咗自然唔會叫佢傷害小朋友 · 唔係因為禁令 · 係因為理解咗呢個人。
- **有原則但阿媽一出聲就亂晒方寸**：寫「他母親是他唯一的軟肋，她一出聲他就回到那個無助的小孩。」→ 情境觸發嘅性格反轉 · 由 AI 讀完推導 · 唔係 if-then 規則。

**規則 (跟原則 1)**：
- 性格嘅複雜 / 矛盾 / 例外 / 情境觸發 → 寫入**豐富嘅出身故事** (第 1 層) + 累積嘅**經歷日誌** (第 2 層) · 由 AI holistic 讀同推導。
- **唔好**用任何結構化 trait / 清單 / 心理學框架做**運行時嘅籠**。
- 心理學框架 (九型 / OCEAN 等) 最多做一個 **optional 創作時工具** (故事建立時幫 AI 生成更有內在邏輯嘅起點角色) · 但**唔係必須** · 而且現代 AI 直接叫佢「創造一個複雜有矛盾有隱藏深度嘅角色」可能好過硬套框架。邊際價值未證實 · 唔當已知。

### 編劇理論驗證：角色塑造 vs 真實性格 (McKee)
我哋個三層靈魂本質上就係一個「塑造 → 壓力下揭露真實性格」嘅引擎：

| McKee 概念 | 我哋系統 |
|---|---|
| **角色塑造** (表面：外貌/職業/講嘢方式/習慣) | 第 1 層 · 出身 |
| **真實性格** (只喺壓力下做選擇嗰刻揭露) | 經歷日誌 (M1) + 沉澱張力 (M2) |

殺人狂唔傷害小朋友 — 佢「塑造」係殘忍 · 佢「真實性格」喺被逼要傷害小朋友、佢拒絕嗰刻先揭露。呢個壓力下嘅選擇就係經歷日誌要記低嘅嘢。我哋唔需要硬裝框架 · 系統本身就係呢個引擎。

---

## 角色一致性 vs 自由演化 嘅平衡

- **下界 (一致性)**：第 1 層出身 + 核心驅動力係**永久 anchor** · Narrator 永遠睇得到。經歷只可 colour / relax / amplify · 唔可推翻 core identity。
- **上界 (自由)**：角色冇任何「絕對唔做」嘅硬清單 (原則 4)。任何界線都係 emergent · 玩家可透過長期經歷改變。
- **中間 (沉澱)**：Pending tension threshold 確保改變係漸進、要累積嘅 · 唔會一個 prompt 就令角色 180 度轉。

研究參考 (2026-06-01)：學界 2025 嘅 Letta「sleep-time compute」(背景非同步消化記憶) + belief revision (`write/update/deprecate_belief` 工具) 證實呢類機制 production 可行。

---

## 紅線去咗邊

跟 [01-philosophy] 原則 4：**移除角色級硬 red_lines**。角色行為完全由三層推導。

唯一保留 = 平台級法律底線 (CSAM / 真實傷害指引) · 由 platform moderation 把守 · 同角色靈魂系統完全分離。靈魂系統內零自我審查。

---

## 角色記憶點儲存

見 [04-memory.md]。重點：**唔為每個角色起一座記憶宮殿** · 用共享宮殿 + 每角色一個 wing 嘅 namespace 隔離 (MemPalace 模型)。角色嘅信念演化用 temporal graph 嘅 invalidate 機制。

---

## 同 Turn Pipeline 嘅關係

Narrator 每回合收到每個 active 角色嘅三層 + pending tensions (入 Tier 2)。基於呢啲推導反應 · 唔查 trait list。

背景 process (回合後 · after() 包住)：
1. 評估今回合對每個 active 角色有冇 meaningful impact
2. 有 → 寫經歷 entry
3. 更新 pending tensions · 檢查超 threshold → 觸發演化
4. 必要時 invalidate 舊信念

---

## 實作狀態 (現狀 vs 目標)

| 環節 | 現狀 (code) | 目標 |
|---|---|---|
| 角色卡 | static voice_sample + traits + 硬 red_lines + permanent_flags | 三層靈魂 (出身+經歷+當下) |
| 演化 | permanent_flags (粗粒度標籤) | 經歷日誌 + pending tension threshold |
| 紅線 | 硬 red_lines + Director enforce | emergent · 移除硬清單 |
| 信念變化 | 冇 | temporal graph invalidate (見 04) |

現有 NPC Agent L3 (`npc-agents.ts`) 嘅 POV 思考機制可以保留做加強層。

---

## 待解決 (Open Questions)

1. Pending tension threshold 調參：易變度 → threshold 嘅 mapping 公式。
2. 冷啟動：前 5-10 回合經歷日誌空 · 靠 origin seed 推導 · 性格可能浮動 (可接受)。
3. 超長故事：200 回合太多 entry · 用 scene-summarization pattern 壓縮舊 entry · 保留 high-weight milestone。
4. 寫入成本：每個 active 角色一個輕量 LLM call 抽 impact (~$0.0008) · 定用 MemPalace 嘅零-LLM regex 判斷 (慳但要驗證準確度)。

---

_Last updated: 2026-06-01 (Session 16)_
