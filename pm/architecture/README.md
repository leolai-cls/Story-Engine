# Kieio 核心架構文件 (Architecture Folder)

> 呢個 folder 係 Kieio **產品靈魂級系統**嘅完整概念架構記錄。
> 當將來有混亂、唔記得、或者新 session 接手時 · 打開呢個 folder 就會知道：
> 角色嘅靈魂點運作 · 記憶架構點設計 · AI 點做 GM · 故事介面點生成。
>
> 呢度記錄嘅係 **我哋將會落實嘅架構**（target architecture）· 唔係而家 code 嘅現狀。
> 現狀 vs 目標嘅差距 (drift) 喺每份文件嘅實作狀態 section 標明。

---

## 點解呢個 folder 存在 (CTO note)

Founder 定位：**記憶 + 角色靈魂 = 產品最重要嘅嘢**。

互動式故事 RPG 行業 churn 兩大主因：
1. 「AI 唔記得」(記憶問題)
2. 「AI 係 yes-man / NPC 冇靈魂」(角色問題)

呢兩樣就係我哋嘅護城河。所以佢哋值得有自己一套**正式、版本化、互相連結**嘅架構文件 · 而唔係散落喺 code comment 同對話入面。

呢個 folder 用「一個系統一份文件 + 一份索引 (呢份) + 一份名詞表 + 決定記錄」嘅方式組織 · 等任何人 (或未來嘅 Claude) 一打開就 navigate 到。

---

## 文件地圖

| 文件 | 系統 | 一句講佢係咩 |
|---|---|---|
| `README.md` (呢份) | 索引 | folder 入口 · 讀邊份文件嘅順序 |
| `01-philosophy.md` | 設計哲學 | 4 條不可違反嘅核心原則 · 所有其他文件嘅 anchor |
| `02-turn-pipeline.md` | 每回合流程 | GM 係 prep 員唔係決策者 · 四層優先級 · 單 LLM |
| `03-character-soul.md` | 角色靈魂 | 角色點樣有獨立、會演化嘅性格 (出身+經歷+沉澱) |
| `04-memory.md` | 記憶架構 | 4 層記憶 + 角色記憶共享宮殿 + temporal 信念演化 |
| `05-game-system.md` | 故事自適應系統 | 每個故事 AI 生成適合佢嘅 mechanics + state + panel |
| `06-generative-panels.md` | 自適應介面 | AI 揀 panel + 配置 · open-ended component kit |
| `07-memory-maintenance.md` | 記憶整理 / 清潔系統 | 背景管家 · 壓縮 + 消化 + 清潔 · 唔阻塞玩家 |
| `99-glossary.md` | 名詞表 | 所有專有名詞嘅定義 (中英對照) |
| `decisions.md` | 架構決定記錄 | 每個 lock 咗嘅架構決定 + 點解 (ADR-style) |

**新 session 必讀順序**：`01-philosophy` → `02-turn-pipeline` → `03-character-soul` → `04-memory`。其餘按需要。

---

## 5 個系統點扣埋一齊

```
故事建立時 · AI 一次過生成成個故事嘅「藍圖」：
├── State schema      → 呢個故事追蹤咩數值 (見 05)
├── Game system       → Narrator 可以用咩 mechanics (見 05)
├── Panel 配置         → 從 component kit 揀邊幾個介面 (見 06)
└── 角色靈魂出身        → 每個 NPC 嘅起點人格 (見 03)

玩 runtime 每回合 (見 02 turn pipeline)：
├── [Prep 層 · 純 code] 按四層優先級砌 context
│     Tier 1 世界法則 → Tier 2 角色 → Tier 3 當下場景 → Tier 4 玩家指令
│     + 從記憶系統 (見 04) 拉返相關記憶 + 每個 active 角色嘅三層靈魂
├── [Narrator LLM · 單一] 讀晒上面 · 自然敘事 · 需要時 call game-system tool
└── [背景 · code] 寫角色經歷日誌 + 更新沉澱張力 + 必要時 invalidate 舊信念
```

哲學貫穿全部：**移除硬寫死 · 改用 AI 基於豐富 context 推導**。GM 唔做決定 · 角色唔查 trait list · 介面唔係 fixed · 全部由故事內容同累積經歷 emergent。

---

## 外部參考 project (已 research · 2026-06-01)

| Project | 結論 | 點用 |
|---|---|---|
| **MemPalace** (`C:\Users\user\Desktop\mempalace-develop`) | ✅ 啱用做記憶地基 · 但係 Python+ChromaDB · 唔可內嵌 Next.js | 見 `04-memory.md` 嘅整合決定 |
| **OpenDesign** (`C:\Users\user\Desktop\open-design-main`) | ❌ 唔 fit (係 AI 做設計稿工具 · 唔係 app 內嵌 component kit) | 只取概念啟發 · 見 `06-generative-panels.md` |

---

_Folder 建立: 2026-06-01 (Session 16) · 由 Director over-rejection bug 觸發嘅核心架構梳理_
