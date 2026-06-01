# 06 · 自適應介面 (Generative Panels)

> AI 揀 panel + 配置 · open-ended component kit。
> Anchor 原則：[01-philosophy] 原則 1 (emergent)。

---

## 核心理念

每個故事嘅介面唔同。AI 喺故事建立時 · 揀適合呢個故事嘅 panel 嚟顯示。

戀愛故事 → 關係 panel。寵物小精靈 → 圖鑑 panel。偵探 → 案件板。純哲學對話 → 乜 panel 都冇 (panel 全空 / 隱藏)。

呢個係「故事自適應介面」護城河嘅延伸 (CLAUDE.md 已 lock 數據自適應 · 呢度係連 widget 都自適應)。

---

## 解決「限死定無限」嘅兩難 (founder concern)

> Founder：限死 30 個怕唔夠 · 唔限死怕 AI 揀太多。

**Generative UI 嘅 open-ended kit 模型化解呢個兩難** (research 2026-06-01)：

- 唔係固定數量 catalog · 係一個 component kit · 隨時加新 component · 唔使預先封頂。
- AI 唔係生成 code (唔安全) · 係喺 kit 入面揀 + 出一個 schema-validated JSON 配置。
- Client 用 Zod schema 驗證個 JSON · 亂揀 / 揀唔存在嘅會被擋。
- Prompt 約束「揀最多 N 個」(同現有 Director npc_updates max 4 一樣 pattern) · 防 AI 揀太多。

即係：唔使糾結 30 定無限。架構係 **open-ended kit + AI 約束揀取 + JSON 驗證**。初期放 8-10 個最常用 component · 之後隨時加 · AI 永遠喺「當前 kit」揀。

---

## Component kit 初期建議 (8-10 個)

| Component | 適用 |
|---|---|
| 關係面板 | 戀愛 · 角色養成 (含 founder 想要嘅關係軌跡 · 但係 emergent 唔顯示數字) |
| 角色表 (HP/屬性/技能) | RPG · TRPG |
| 物品欄 | RPG · 冒險 |
| 圖鑑 / collection | 寵物小精靈 · 收集類 |
| 案件板 (線索+嫌疑人) | 偵探 · 懸疑 |
| 任務 / 章節進度 | 冒險 · 主線推進 |
| 地圖 (已探索) | 探索 · 開放世界 |
| 隊伍 / 戰友 | JRPG · 戰略 |
| 世界設定 codex | 重 lore 故事 |
| (空 / 隱藏) | 純小說 · 哲學對話 |

逐步加 · 唔使一次過寫晒。

---

## 關係軌跡點處理 (連住 founder 嘅沉浸感 concern)

> Founder：唔想顯示好感度數字 (好似睇小說唔會見到角色之間嘅 friendship meter) · 但又覺得某啲故事需要。

解決：**關係追蹤係 component kit 入面其中一個可選 panel · 唔係 default**。
- 戀愛 / 養成故事 → AI 揀關係 panel · 但顯示方式係**質性嘅** (文字描述關係狀態 · 唔係裸數字條)
- 偵探 / 解謎 / 純小說 → AI 唔揀呢個 panel · 保持沉浸感
- 由故事內容決定 · 唔係全域 feature

⚠️ 現有 state panel 嘅好感度/信任/尊重/恐懼**裸數字條** 違反 founder 沉浸感哲學。
**決定 (2026-06-01)**：唔獨立 fix 嗰個數字條 — 因為 panel 係呢個自適應系統嘅一部分 · 獨立 fix 會被本系統整個取代 (做嚿嘢然後掉)。裸數字條嘅修正**併入呢個自適應介面實作**：實作時 AI 決定每個故事用咩 panel / 用唔用關係顯示 / 質性定數字 · 自然落實「唔好裸數字條」。

## ⚠️ Memory Journal / dashboard = 唔做 (連 hard rule #19 修正)
Founder lock：護城河 (記憶/角色靈魂) 嘅「可見」= 玩家喺**敘事入面**感受到 (角色提起過去、語氣行動體現關係) · **唔係**列表式 journal / dashboard / 好感度數字條 (破壞沉浸感 · 「睇哈利波特唔會列晒所有嘢」)。CLAUDE.md hard rule #19 原本寫「一定要 Memory Journal UI (抄 NovelAI)」· 2026-06-01 已修正 — 嗰個係舊理解 · 同呢個哲學衝突。任何狀態/關係顯示都係本文件嘅自適應 panel (AI 揀·質性) · 唔係 dashboard。

---

## OpenDesign 研究結論 (2026-06-01)

讀咗 `C:\Users\user\Desktop\open-design-main` 真實 code。

**結論：唔 fit · 只取概念啟發 · code 用唔到。**

- OpenDesign 係「用 AI coding-agent CLI (Claude Code / Cursor 等 16 個) 嚟做設計稿」嘅工具 · 係 Claude Design / Figma 嘅開源替代品。
- 佢係**設計生成工具** (給設計師用) · 唔係**俾 app 內嵌嘅 generative-UI component kit**。
- Apache 2.0 license (可商用) 但結構同我哋需求無關 (apps/ craft/ design-systems/ skills/ — 全部係佢個設計工具嘅內部結構)。
- **可取嘅只係概念**：「有一個 design system / component 庫俾 AI 揀」呢個 idea · 但實際實現我哋跟 Vercel generative UI 嘅 json-render 模型更 fit (見上)。

---

## 實作狀態 (現狀 vs 目標)

| 環節 | 現狀 | 目標 |
|---|---|---|
| 介面 | 固定 state panel (數據自適應 widget) | AI 揀 panel + JSON 配置 |
| Component kit | 冇 | 8-10 個 React component + Zod schema |
| 關係顯示 | 裸數字條 | 質性顯示 · 或交 AI 決定 expose |

呢個係 visual polish 層 · 優先級喺角色靈魂 (03) + turn pipeline (02) 之後。

---

## 實作藍圖
詳細 milestone 拆解 (M1 panel config schema+DB → M2 component kit → M3 renderer → M4 AI 生成 config → M5 裸數字條退役 → M6 擴展) + 風險 + 待決定，見 **`IMPLEMENTATION-stage3.md`**。核心：現狀已有 field 級渲染 (render_hint) · Stage 3 加一層 panel 編排 (AI 揀 panel 組合 · JSON 配置 · 預製 component · 質性化)。

---

_Last updated: 2026-06-01 (Session 16 · OpenDesign 研究結論 grounded 喺真實 source · + IMPLEMENTATION-stage3 藍圖)_
