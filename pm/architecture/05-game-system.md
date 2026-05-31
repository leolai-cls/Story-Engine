# 05 · 故事自適應系統 (Adaptive Game System)

> 每個故事 AI 生成適合佢嘅 mechanics + state + panel。
> Anchor 原則：[01-philosophy] 原則 1 (emergent · 唔用固定 enum)。

---

## 核心理念

唔係每個故事都用同一套系統。AI 喺故事建立時 · 根據故事內容生成適合呢個故事嘅遊戲系統。

龍與地下城 → 擲骰系統。勇者鬥惡龍 → 回合制戰鬥。寵物小精靈 → 捕捉系統。純戀愛小說 → 冇 mechanics · 純敘事。

呢個唔係預先寫死嘅幾個 mode · 係故事生成嘅。

---

## 故事建立時 AI 生成嘅「藍圖」

```
用戶寫故事 prompt
   ▼
AI 一次過生成 (現有 schema-generator.ts 嘅 parallel 流程擴展)：
├── State schema       → 追蹤咩數值 (HP? 好感度? 隊伍? 線索?)
├── Game system tools  → Narrator 可 call 嘅 mechanics 定義 (新加)
├── Panel 配置          → 從 component kit 揀邊幾個介面 (見 06)
└── 角色靈魂出身         → 每個 NPC 起點人格 (見 03)
全部存入 story record
```

---

## 例子

| 故事類型 | State schema | Game system tools |
|---|---|---|
| 校園戀愛 | 好感度 · 信任 · 聲譽 | 純敘事 · 冇工具 |
| 龍與地下城 | HP · MP · STR/DEX/INT/CHA · 裝備 | 擲骰 (d20+) · 戰鬥輪 · 施法檢定 |
| 勇者鬥惡龍 | HP · MP · 隊伍 · 金幣 · 等級 | 回合制戰鬥 · 商店 · 隊伍管理 |
| 寵物小精靈 | 隊伍小精靈 · 捕獲球 · 徽章 · 圖鑑 | 捕捉判定 · 屬性相克 · 訓練 |
| 偵探懸疑 | 線索 · 嫌疑人 · 信譽 | 線索整合 · 推理 · 對質 |
| 純小說 | (空) | 純敘事 · 冇工具 |

---

## Runtime 點 work

Narrator 收到呢個故事自己生成嘅 tools 集合 · 喺需要時自己決定 call 邊個 (Vercel AI SDK tool calling)：
- 玩家攻擊強敵 (TRPG) → Narrator call `roll_attack` → 後台計 → 結果送返 → 寫敘事
- 玩家捉小精靈 → Narrator call `attempt_capture` → 後台計捕獲率 → 寫敘事
- 玩家同 NPC 對白 (純小說) → Narrator 冇 tool 揀 · 純敘事

由 Narrator 自決何時 call · 冇預判層 (跟原則 2)。「觀察+內心估計」呢類 case · Narrator 識唔 call。

---

## 同擲骰嘅關係

擲骰唔再係一個 on/off 設定 · 係 game system 嘅其中一種 mechanic。有啲故事生成擲骰 (TRPG) · 有啲生成回合制戰鬥 (JRPG) · 有啲乜 mechanic 都冇 (純戀愛)。

預設按 genre suggest · 創作者可改。

---

## 同 NPC Agent mode 嘅關係

現有 NPC Agent L3 (每個角色 POV LLM call · 見 02 多角色場景) 可以視為其中一種「角色深度」mechanic。

待決定 (founder open question)：Agent mode 喺新架構應該 (a) 維持 Storyteller 付費 · (b) 全部玩家 default · 定 (c) hybrid (基本層平 model 全部人用 · premium 用強 model)。

---

## 實作狀態 (現狀 vs 目標)

| 環節 | 現狀 | 目標 |
|---|---|---|
| State schema 生成 | ✅ schema-generator.ts 已生成 | 不變 |
| Game system tools 生成 | ❌ 冇 | 故事建立時生成 tools 定義 |
| Narrator tool calling | 部分 (update_state 等) | 加故事特定 mechanics |
| 擲骰 | Director 預判 | Narrator 自決 via tool |

---

_Last updated: 2026-06-01 (Session 16)_
