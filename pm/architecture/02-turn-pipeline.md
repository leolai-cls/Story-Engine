# 02 · 每回合流程 (Turn Pipeline)

> GM 係 prep 員唔係決策者 · 四層優先級 · 單一 Narrator LLM。
> Anchor 原則：[01-philosophy] 原則 2 (GM prep) + 原則 3 (Tier hierarchy)。

---

## 核心理念

每回合一個 LLM call (Narrator)。冇額外嘅 verdict / gatekeeper LLM。

GM (prep 層 · 純 code) 將「世界 → 角色 → 當下場景 → 玩家指令」按優先級分層砌成 context · 一次過交俾 Narrator · Narrator 自己根據分層自然敘事。

---

## 四層架構

每回合嘅 system prompt 按呢個順序砌：

| Tier | 內容 | 權威 | 變化頻率 |
|---|---|---|---|
| **Tier 1 · 世界法則** | 故事 premise · 世界規則 · tone · 物理/魔法/社會 hard limits | 絕對 · 不可推翻 | 故事建立時 lock |
| **Tier 2 · 角色設定** | 每個 active 角色嘅靈魂 (出身+經歷+當下 · 見 03) | 高 · 可隨經歷 evolve | 玩家行動觸發 · 罕變 |
| **Tier 3 · 當下場景** | 在場角色 · 最近 ~6 回合對白 · 當前 state (數值) · 拉返嘅相關記憶 (見 04) | 中 · 即時 | 每回合 |
| **Tier 4 · 玩家指令** | 玩家而家輸入嘅嘢 (包喺 `<player_action>` tag 防注入) | 最低 · 服從上面 | 每回合 |

---

## 衝突解決規則

**低層唔可推翻高層。當 Tier 4 試圖違反 Tier 1-3 → Tier 4 自然失敗 · Tier 2 角色按性格反應。**

角色反應永遠基於 Tier 2 嘅性格 + Tier 3 嘅當下情境 · 唔可以用寫死嘅模板。

### 例 A · 玩家打破世界規則 (Tier 4 vs Tier 1)
- Tier 1：寫實校園故事 · 冇魔法
- Tier 4：「我施展火球術」
- 結果：失敗 + 林思雅按性格困惑反應 ──「你揮咗下手 · 咩都冇發生。林思雅望住你 · 一臉問號」
- **唔係**：寫死嘅「場面停頓 / 眉頭微皺」

### 例 B · 玩家撞角色界線 (Tier 4 vs Tier 2)
- Tier 2：林思雅 · 高傲慢熱 · 起點唔接受快速進展
- Tier 4：第 3 回合即場求婚
- 結果：失敗 + 林思雅按高傲性格反應 ──「她後退一步 ──『…我哋先認識三日。』」

### 例 C · 經歷令角色演化後重試 (Tier 2 evolved)
- Tier 2：林思雅 · 但經歷日誌有「turn 23 主角為我擋刀」
- Tier 4：turn 40 握手錶白
- 結果：因為累積咗信任 · 同一動作唔再被推開 ──「她冇即時抽手 · 眼神多咗一份猶疑 ──『…俾我啲時間諗下。』」

### 例 D · 純內心動作 (Tier 4 屬內心 · 唔關角色事)
- Tier 4：「觀察佢 · 心入面估計佢係春野櫻」
- 結果：純內心 + 觀察 · 角色唔會知 → Narrator 純粹敘述觀察 ──「你望住佢 · 心入面隨手撈個熟悉嘅名標籤佢。佢察覺你目光 · 淺淺一笑」
- **呢個就係舊系統最大 bug 嘅 case** (見 decisions.md ADR-001)

---

## 每回合 Flow

```
玩家輸入
   │
   ▼
[GM Prep 層] ── 純 code · 唔係 LLM
   ├─ Tier 1: 抽 Story Bible
   ├─ Tier 2: 每個 active 角色嘅三層靈魂 (見 03)
   ├─ Tier 3: 最近回合 + 當前 state + 記憶拉取 (見 04)
   └─ Tier 4: 包裝玩家輸入入 <player_action> tag
   │
   ▼
[砌成分層 System Prompt]
   │
   ▼
[Narrator LLM] ── 玩家揀嘅 model · 收到呢個故事自己生成嘅 game-system tools (見 05)
   ├─ (需要時) tool call: 故事特定 mechanic (擲骰 / 捕捉 / 戰鬥…)
   ├─ tool call: 更新 state / 角色當下狀態
   │
   ▼
[輸出敘事]
   │
   ▼
[背景 Persistence 層 · code · 用 after() 包住唔阻塞回應]
   ├─ 寫入 turns
   ├─ 寫角色經歷日誌 + 更新沉澱張力 (見 03)
   ├─ 必要時 invalidate 角色舊信念 (見 04)
   ├─ embed turn for RAG
   └─ 必要時 summarize scene
```

對比舊系統：舊係 2 個 LLM call (Director verdict + Narrator) · 新係 1 個。

---

## 失敗處理機制 (Failure Handling · 安全網)

> Anchor 原則：[01-philosophy] 原則 5 (技術失敗要誠實)。
> 呢個係新架構嘅**必要零件** —— 唔係 optional polish。就算架構幾完美，外部 model (Gemini 等) 偶然會慢 / 抽風 / 撞自己 safety filter，所以一定要有安全網。

### 兩種失敗，相反處理

```
玩家做嘢 → Narrator 生成
                │
      ┌─────────┴─────────┐
      ▼                   ▼
  成功出文字           失敗 (超時/空白/拒絕/出錯)
      │                   │
   正常顯示          ┌─────┴─────┐
                     ▼           ▼
              第 1 步：自動重試   (重試 1-2 次)
                     │
              ┌──────┴──────┐
              ▼             ▼
          重試成功       重試都唔得
              │             │
           正常顯示    第 2 步：誠實告知玩家
                       「呢次整唔到，請再試一次」
                       (似 ChatGPT · 俾個 retry 掣)
```

### Hard rules

1. **技術失敗（超時 / 空白 / model 拒絕 / 出錯）≠ 故事失敗。** 永遠唔好用一段假故事文字（例如「眉頭微皺 / 你係咪認真」）去遮技術失敗。
2. **先自動重試**（auto-retry 1-2 次，玩家完全唔知）。大部分 model 抽風重試就好。
3. **重試都唔得 → 誠實系統訊息**：清楚話玩家「呢次生成唔成功，請再試」+ 一個 retry 掣。似 ChatGPT regenerate。
4. **失敗嘅回合唔可以污染故事 / 記憶**：唔好將失敗 / 重試 / 假文字存入 turns 歷史或者 RAG。玩家 retry = 當呢回合冇發生過。
5. **故事失敗（玩家動作喺世界唔成立）唔行呢條路** —— 嗰個係正常劇情，用 in-fiction 演出（見上面衝突解決規則）。

### 點分辨「故事失敗」定「技術失敗」

- Narrator **成功寫咗故事文字** → 一定係成功（就算劇情上玩家動作失敗，都係成功嘅一個回合）
- Narrator **冇寫到文字**（空白 / 超時 / 報錯 / 明確拒絕）→ 技術失敗 → 行安全網

關鍵：**唔好靠「分析 Narrator 寫咗咩」去估係咪失敗**（之前 `isLLMRefusal` 就係咁誤判）。只睇「有冇文字出到」—— 有就成功，冇就技術失敗。

---

## 多角色場景點保持各自靈魂

當多個角色同場 · Narrator 點寫到每個都有獨立 voice？

**基本層 (所有玩家)**：每個 active 角色嘅完整靈魂 (出身+經歷+當下 · 見 03) 全部入 Tier 2。Narrator 基於每個角色嘅累積經歷推導佢點反應。靈魂深度視乎 Narrator model 強弱。

**加強層 (Agent mode · 見 05 game-system / 現有 NPC Agent L3)**：每個在場角色自己一個 LLM call 做 POV 思考 (回憶→預估別人反應→動機) · 輸出內心獨白+意圖 · Narrator 整合所有 POV 成一段敘事。每個角色有獨立「思想流」。

**Narrator 點知邊個角色今回合主導**：Tier 3 提供 NPC priority signal (最近有對白 / 同當前事件相關 / 經歷變化最大) · 等 Narrator 排 spotlight · 避免多角色場景花瓶化。

---

## 實作狀態 (現狀 vs 目標)

| 環節 | 現狀 (code) | 目標 (呢份文件) |
|---|---|---|
| LLM call 數 | 2 (Director + Narrator) | 1 (Narrator) |
| GM 角色 | 出 verdict 做 gate | 純 prep |
| Tier 標籤 | context 全部 dump 入去 · 冇明確層 | 明確 Tier 1/2/3/4 標籤 |
| 擲骰 | Director 預判 require_skill_check | 故事生成 mechanics · Narrator 自決 (見 05) |
| 角色紅線 | 硬 red_lines + Director enforce | emergent (見 03) · 移除硬清單 |

**遷移 roadmap 喺 decisions.md ADR-001。** Director 相關 code (`director.ts` / `verdictToNarratorInstruction`) 最終 deprecate。

---

_Last updated: 2026-06-01 (Session 16)_
