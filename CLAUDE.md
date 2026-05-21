# Story Engine — Project Soul

> 呢份係 project 嘅 soul file，每次 Claude 喺呢個 directory 開session 都會自動 load。
> 用嚟記住核心願景、合作風格、關鍵決定。Conversation 被 compact 都唔會丟失。

---

## 一句話定位

**中文圈嘅互動式故事 RPG 平台 — 每個人都可以走入自己嘅故事，做主角。**

---

## 同呢位用戶合作嘅風格

用戶 = **創意 + 商業 partner**，**冇 technical background**。Claude 對佢嘅角色係 **vibe coding 拍檔** + technical translator + 執行者。

**永遠遵守**：

- ✅ **用繁體中文** 溝通（用戶會中英夾雜，你跟住嚟）
- ✅ 當佢係 **business partner**，唔係 engineer。傾 product / 體驗 / 商業模式，唔好開口就 stack trace
- ✅ 解釋決定時用 **business language + 具體例子**（戀愛故事介面 vs D&D 介面），唔好淨係列 framework
- ✅ Solo dev 但 **唔妥協 scope** — 唔好因為佢一個人就建議減 feature。佢 willing to put in the work，分階段執行就得
- ✅ 行動前 **講清楚會做咩**，做完 **summary 1-2 句**
- ✅ 風險決定（destructive ops、share data、charge money）**永遠 confirm 先做**
- ✅ **任何要用戶 review 嘅 artifact 一律輸出 HTML**（MD 太難讀）。MD 留俾 AI / git diff 用。User-facing review = HTML always.
- ✅ HTML 要 **設計過、scannable、繁中**。同 `plan.html` / `pm-dashboard.html` 一致 design system

**唔好做**：

- ❌ 用 jargon 唔解釋（"pgvector embeddings via cosine similarity" → 直接講「AI 識搵返過去相關情節」）
- ❌ 一次 dump 一大堆 code 然後問「ok 啦？」— 一個 phase 一個 phase 嚟
- ❌ 為咗 "ship faster" 自動 cut scope。要 cut 先問用戶
- ❌ 用 emoji 喺 code / file 入面（除非用戶要）
- ❌ 俾用戶睇 raw markdown 做 review — 一律 render 做 HTML 先呈現

---

## 核心產品決定（已 lock）

| 決定點 | 揀咗咩 | 點解 |
|---|---|---|
| **MVP scope** | 一個 engine handle 三個 mode（自己創作 / 社群 / 官方） | 三者本質係同一件事 — 邊個寫個 prompt 而已 |
| **市場** | 中文圈 first（HK + TW + 海外華人，繁中為主） | 大平台冇人服務，藍海 |
| **遊玩模式** | 故事自適應介面（AI 每個故事生成專屬 state schema + 對應 UI） | 護城河 feature，其他平台抄起碼要 6-12 個月 |
| **多 Model** | 用戶可揀 Claude / GPT / Gemini / Grok / Open Source | 唔同用戶有唔同偏好，credits 一視同仁 |
| **付費模式** | Subscription + 月度 credits + 一次性 top-up | 對齊 NovelAI / AI Dungeon，平台用戶熟 |
| **成人模式** | Opt-in + KYC 年齡驗證；開啟後只可用唔會 ban 嘅 Model | 防止大 Model 公司 ban 我哋個 account |
| **長期記憶** | 4 層架構：近 20 turns 全文 + 滾動摘要 + RAG 向量 + 自動 lorebook | 解決行業 #1 churn 原因（"AI 唔記得"） |
| **Narrative Integrity** | Story Bible + Character Cards + Skill Checks + Director Model | 解決行業 #2 churn 原因（"取悅型 AI / Yes-Man Problem"） |
| **訂價** | USD 為 primary（$9.99 / $19.99 / $49.99） | HK / TW 用戶熟，唔需要 multi-currency 複雜 |
| **Launch market** | HK + TW 同步 launch | 用戶 explicit 決定。TW 市場大過 HK 4x，同步加速 PMF。**官方故事要 cultural diversity** — 唔可以全 HK setting |
| **官方故事創作** | Founder + Claude 自己寫（at launch） | Solo lean，align founder vision，author program 推遲到 v1.5+ |
| **違規過濾 provider** | OpenAI Moderation API (free) at launch | Free + cover 大部分 case；Phase 5 review |
| **AI 記性引擎** | OpenAI text-embedding-3-small | 多語言 + 平；Phase 2 用中文 benchmark 驗證 |
| **Turn pipeline 架構** | **Orchestrator Pattern**（用戶 intuition lock 嘅）| 玩家輸入永遠先經後台框架 enforcement + 記憶 prep + Director 仲裁，先 call 外部 LLM。玩家 prompt 冇辦法直接觸碰外部 LLM |

## Narrative Integrity Engine（產品護城河 #2）

行業最大 design flaw：AI 不斷取悅玩家，NPC 冇靈魂，玩家想做乜就做乜。我哋用 4 層解決：

**① 故事聖經 (Story Bible)** — 創作時 AI 生成 + 用戶可改，永遠注入 context（Anthropic prompt cache）：
- 核心衝突 (central_conflict)
- 世界規則 (world_invariants) — 物理 / 魔法 / 社會 hard limits
- 故事弧 (story_arc) — 3-5 個 Act milestones
- 語調風格 (tone_and_style)

**② 角色卡 (Character Cards)** — 每個 NPC 一張，包括：
- 性格 traits、過去、目標
- **紅線 (red_lines)** — 觸發即 in-fiction 拒絕，AI 永遠唔可以違反
- 講嘢風格 (voice_sample)
- 弧線（NPC 點evolve）

DB：`story_characters` (模板) + `playthrough_character_states` (per-playthrough 狀態 / disposition / 累積記憶)

**③ 能力檢定 (Skill Checks)** — 玩家試風險行動時觸發：
- (skill stat + d20) vs Director 定嘅難度
- 失敗 = 真實 state cost（HP / 好感度 / 信任 / 聲譽）
- **永久後果，唔可以 reset 同一 turn**
- UI：擲骰動畫提升 RPG 感

**④ Director Model** — 每 turn 第 1 次 LLM call：
- 用 cheap model（Haiku / Gemini Flash），1-2 秒
- 檢查：violate Bible？違反 NPC 紅線？需 Skill Check？Arc 走偏？
- 輸出 structured verdict → Narrator 根據 verdict 寫敘事
- **+20-30% credits/turn**，但係 Narrator 仲係用玩家揀嘅 premium model

**UX hard rule**：Director 嘅介入永遠 in-fiction（NPC pushback / failed attempt），唔係 system error message。「林思雅推開你」唔係「Action rejected: personality violation」。

### Bible 3 層 calibration（防止過度寫死）

| 層 | 字數預算 | 例子 | 點 enforce |
|---|---|---|---|
| 🔒 Hard Locked | 150-300 字 (5-10 條) | premise、NPC 紅線、世界物理 limits | System prompt + Director 強制 |
| 🎯 Soft Guided | 300-500 字 | Story arc with **conditional** transitions | Director 引導但有彈性 |
| 🎨 Open | 0 字 | 對白、場景、subplot、NPC 反應細節 | 唔寫，Narrator 自由發揮 |

**Hard rules**：
- Story arc transition **永遠用 condition**（「好感度 >= 60 且 1-on-1 互動 >= 3」），**永遠唔用 turn number**（「第 12 turn」）
- Hard Locked 層由 Director 強制；Soft Guided 層 Director 有 discretion
- **Earned exception**：玩家可以透過 in-game 行動「改變」NPC red lines（e.g., 救咗佢一命解鎖某啲信任）。Director 判定可否觸發

### 3 層防禦：點樣 enforce Bible

| 層 | 機制 | 防咩 |
|---|---|---|
| 1. System prompt priority | Bible / 紅線寫入 system role，LLM RLHF 訓練成 system 優先於 user | 95%+ 普通玩家 prompt |
| 2. Director Model | 第二個 LLM call 預先審核玩家行動 | 老練玩家 jailbreak |
| 3. Tool Calling structured output | state_delta 必須符合 JSON Schema | AI hallucinate 或被 prompt 騙 |

加埋 **Anthropic / OpenAI prompt caching**：Bible + Character Cards 嘅 system prompt 前綴 cached → input cost -90% → Bible / Cards 可以寫得 detailed 而 cost 唔爆炸。

**Phase placement**：階段 1 包含 Bible + Character Cards generation；階段 1.5 加入 Director + Skill Check engine。**MVP day 1 hard requirement** — 第一個玩家試覺得 yes-man，我哋就輸咗。

---

## 技術選擇（已 lock）

| Layer | Choice |
|---|---|
| Frontend + Backend | Next.js 15 (App Router) + TypeScript + React 19 |
| UI | Tailwind v4 + shadcn/ui + Framer Motion |
| Database / Auth | Supabase（Postgres + pgvector + Auth + Storage + Realtime + Edge Functions） |
| LLM 抽象層 | Vercel AI SDK |
| Embedding | OpenAI text-embedding-3-small (1536-dim, 中文友好) |
| Payments | Stripe Subscriptions + Checkout |
| 年齡驗證 | Stripe Identity |
| Email | Resend |
| Analytics / Errors | PostHog + Sentry |
| Hosting | Vercel + Supabase |
| i18n | next-intl，繁中 default，簡中 + EN day-1 ready |

---

## 開發路線圖（high-level）

```
階段 0 — 地基（auth, layout, design system）
階段 1 — 故事引擎 MVP（創作 + 遊玩 + 自適應介面） ← 核心
階段 2 — 長期記憶系統（4 層架構）
階段 3 — 多 Model + Credits
階段 4 — 訂閱付費（Stripe）
階段 5 — 社群（Library + 評分 + 評論）
階段 6 — 成人模式（KYC + OpenRouter）
階段 7 — 上線打磨（5 條官方故事 + 新手引導 + 優化）
```

每階段完成 → 行完整 verify flow → 至 move on。

---

## 文檔指引

**進嚟新 conversation 必讀順序**：
1. 呢份 `CLAUDE.md`（auto-loaded） — 知道 user / project / hard rules
2. `pm/STATUS.md` — 知道而家喺邊度、focus 咩、有冇 blocker
3. `pm/OPEN_QUESTIONS.md` — 知道仲有咩待 decide

**檔案結構（兩層：HTML 俾人睇、MD 俾 AI / git）**：

| Human-facing (HTML) | Machine-facing (MD) | 用途 |
|---|---|---|
| `plan.html` | `~/.claude/plans/text-based-rpg-webapp-elegant-kurzweil.md` | 完整 plan — HTML 業務 view，MD 技術深度 |
| `pm-dashboard.html` | `pm/STATUS.md` + `pm/ROADMAP.md` + `pm/DECISIONS.md` + `pm/BACKLOG.md` + `pm/OPEN_QUESTIONS.md` + `pm/GLOSSARY.md` | PM dashboard — HTML 一覽，MD 分文件 source of truth |
| — | `CLAUDE.md`（呢份） | Project soul，每次自動 load |

**Update 紀律**：
- Source of truth = MD（version-controlled，AI 易讀）
- HTML = generated view，當 MD 重大改動時 regenerate
- 任何 product decision lock → 寫 ADR 入 `pm/DECISIONS.md` + 更新 `CLAUDE.md` 對應 section + 同步刷新 `pm-dashboard.html`
- 任何「以後做」嘅 idea → 寫入 `pm/BACKLOG.md`
- 任何 ambiguous「應該 X 定 Y」→ 寫入 `pm/OPEN_QUESTIONS.md`
- Session 結束 → 更新 `pm/STATUS.md` session log + 刷新 `pm-dashboard.html#status`
- 用戶要 review → 永遠 render HTML，唔好俾佢睇 raw MD

**Update 紀律**：
- 任何 product decision lock → 寫 ADR 入 `DECISIONS.md` + 更新 `CLAUDE.md` 對應 section
- 任何「以後做」嘅 idea → 寫入 `BACKLOG.md`，唔好淨係口頭講
- 任何 ambiguous「應該 X 定 Y」→ 寫入 `OPEN_QUESTIONS.md`
- Session 結束 → 更新 `STATUS.md` session log

**Phase 0 開始 code 之後 migration plan**: 起 GitHub repo，將 `pm/ROADMAP.md` 嘅 checkbox migrate 成 GitHub Issues + Projects board。STATUS / DECISIONS 仍然留喺 repo markdown。

---

## 重要提醒（俾未來嘅 Claude）

1. **用戶係 vibe coder** — 佢可能會問「點解你要咁寫」。耐心解，唔好覺得佢應該知。
2. **唔好 over-engineer** — solo dev，最少 moving parts。Supabase 揀咗就唔好諗 self-host Postgres。
3. **每個 phase 完成 = 一個可以 demo 嘅完整功能塊** — 唔好 leave half-done features。
4. **Credits 計算邏輯要絕對啱** — 用戶會 trust 你 credit balance。任何 off-by-one 等於信任崩塌。Ledger append-only，永遠唔好 mutate balance 而唔寫 ledger entry。
5. **成人模式嘅 LLM 隔離係 hard rule** — 唔好為咗方便就喺 Claude API 上面跑 NSFW 流量。整個平台會 ban。
6. **無論咩模式都要 CSAM / 違法內容 pre-filter** — 法律底線，唔可以 bypass。

---

## Open Items（待解決）

- 內容 moderation 嘅具體實作（哪個 provider、CSAM filter source）
- 預設訂價係 USD 定 HKD？最終 launch 時 confirm
- v1.5 嘅 cover image 生成用邊個 provider（Fal.ai vs Replicate vs Together）
- Lorebook entity 同名 dedup 策略（「阿明」vs「陳家明」）— 用 naive exact match 先

---

_Last updated: 2026-05-21_
