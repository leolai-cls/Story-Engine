# DECISIONS — Story Engine

> Architectural Decision Records (ADRs)。每個重要決定一條，capture **Decision / Context / Consequences**。
> 點解寫呢個：3 個月後重新諗，唔記得點解咁揀。呢度就係答案。
>
> 格式：每條 ADR 唔超過 200 字。Reverse chronological（最新喺最上）。

---

## ADR-017 — Product 同 Marketing 分 subdomain（xxx.com + app.xxx.com）
**Date**: 2026-05-25 · **Status**: ✅ Accepted (architectural prep · 實際 split 之後 ship)

**Decision**: 將來 marketing 同 product 用兩個 subdomain — `xxx.com` 放 `/` `/pricing` `/about` `/blog` `/terms` `/privacy`（marketing · SEO-friendly · public）；`app.xxx.com` 放 `/login` `/auth/callback` `/library` `/my` `/play/*` `/stories/new` `/settings` `/profile`（product · auth-gated · 真正 app surface）。今日仍係單一 origin · 但 code 已 architect 好等 env 一改即 split。

**Context**: Founder 觀察 SaaS standard pattern — Linear / Notion / Stripe / Vercel 全部都係 marketing vs product 分 subdomain。Pre-login 體驗（marketing）同 logged-in app 體驗本質唔同，cookie scope 都唔同。Founder 講「請 make sure 產品同 website 係分別之後會係 xxx.com and app.xxx.com」。

**Consequences**:
- 新增 `lib/urls.ts` · `appUrl()` / `marketingUrl()` helpers · env-driven · 今日 no-op
- 新增環境變數 `NEXT_PUBLIC_APP_URL` 同 `NEXT_PUBLIC_MARKETING_URL`（split 之前留空就單一 origin）
- Cross-subdomain link 用 plain `<a>` (e.g. Pricing in product nav) · 同 origin 用 `next-intl` `<Link>`
- Auth cookies 將來 scope `.xxx.com`（parent domain）等兩個 subdomain 都讀到 session
- 一次過拆只係 Vercel 加多個 domain + 設兩個 env var · 唔需要 code refactor

---

## ADR-016 — Post-login 永遠 ChatGPT-style smart landing
**Date**: 2026-05-25 · **Status**: ✅ Accepted

**Decision**: 用戶完成 login（任何方法 — Google OAuth / email magic link / Guest）之後，redirect 邏輯：有 playthrough → `/my`（回頭客 · ChatGPT-style「your conversations」）· 冇 playthrough → `/library`（新客 · Netflix-style browse）· **永遠唔再 default 去 `/profile`**。Root URL `/` 對 logged-in 用戶都 follow 同一個 logic。

**Context**: Founder 試用 Google login 之後扔咗去 `/profile`（empty placeholder · 1 個 title + 1 句 body）· 投訴「the product's flow logic is fucked」· 要求研究 Claude / ChatGPT / Grok 點做。三個 LLM apps 共同 pattern：登入 = 即刻入產品 · sidebar = past sessions · main = ready-to-use prompt 或 last session。Profile / Settings 永遠 secondary（avatar dropdown）。

**Consequences**:
- 新增 `lib/auth/landing.ts:getLandingPath(supabase, userId)` 做 single source of truth
- `/auth/callback` 同 `/[locale]/page.tsx` (root) 都用呢個 helper
- Guest sign-in default 由 `/stories/new` 改去 `/library`（browse 先 · creation 高 friction）
- `/profile` 仍存在但唔再做 default landing；遲啲 merge 入 `/settings` 或加 avatar dropdown surface
- 視覺 plan 見 `pm/product-flow-redesign.html`

---

## ADR-015 — Orchestrator Pattern 正式 lock
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: Turn pipeline 永遠採用 orchestrator pattern — 玩家輸入永遠先經過我哋嘅後台（Next.js Route Handler）做框架 enforcement + 記憶 prep + Director 仲裁 + Skill Check，先至 call 出去外部 LLM API。玩家 prompt **冇辦法直接觸碰外部 LLM**。

**Context**: 用戶獨立 intuition — 「call正式嘅api之前我哋先call一個內部用嘅api去過濾同埋去做嗰個幾層框架嘅東西」。呢個係 industry-standard pattern（ChatGPT plugins / Perplexity RAG / Cursor agent 都係咁做）。Formally lock 防止將來 architecture drift。

**Consequences**:
- Marginal cost ~5-15%/turn（Director 用 cheap model + Moderation 免費）
- Prompt caching 抵消大部分 system prompt 成本
- **記憶系統反而更強** — Orchestrator 智能挑 top-3 相關 memory 注入，比 dump 全部 raw history 嘅對手記性好
- 玩家 prompt 入嘅 jailbreak 攻擊 95%+ 攔得到
- 後台 = next.js route handler；可並行：moderation + memory retrieval + cache load 同時做
- User-perceived latency target: 5-7s/turn

---

## ADR-014 — AI 記性引擎用 OpenAI Embeddings（at launch）
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: 用 OpenAI `text-embedding-3-small`（1536-dim, $0.02/1M tokens）做 memory layer 3 嘅 vector embedding。Phase 2 開工前用 100 段中文 turn 做 A/B benchmark 比較 Cohere multilingual-v3 retrieval 質量，差距明顯先 switch。

**Context**: 用戶揀 A。OpenAI 中文已經 OK，cost 幾乎 free at 我哋 scale。Cohere 中文最強但貴 5x，差距未必值得。

**Consequences**: Embedding pipeline 簡單；如 Phase 2 benchmark 顯示 OpenAI 中文 retrieval 質量明顯差，可以 swap provider（pgvector 接口一樣，淨係要重新 embed 歷史 turn）。Cost negligible。

---

## ADR-013 — 違規過濾用 OpenAI Moderation API（at launch）
**Date**: 2026-05-21 · **Status**: ✅ Accepted（Claude decided per user request）

**Decision**: Phase 1 trial 起步用 OpenAI Moderation API（免費）做 CSAM + 違法內容 pre-filter。Phase 5 社群分享上線之前 review 漏網數據，決定升唔升 B（OpenAI + Hive 雙重過濾）。

**Context**: 用戶話「you decide」。我揀 A 因為 free + 已 cover 大部分 case；Phase 5 之前 risk 仲未 scale 到 Hive 必要嘅程度。

**Consequences**:
- Moderation 成本 = $0
- Edge case 漏網 risk 存在但可接受 at small scale
- Phase 5 social launch 前必 review；如果漏網率明顯，升級 Hive（USD$50-200/月）
- CSAM detection 永遠用第三方 API（自建唔負責任）

---

## ADR-012 — Lorebook 同名 entity dedup 用 naive exact match 起步
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: Phase 2 implement lorebook 自動 entity extraction 時用 naive exact-name match dedup。「阿明」同「陳家明」會當兩個 entity。Phase 5 累積 >1k playthrough 後 upgrade embedding-based fuzzy dedup。

**Context**: 純技術細節（Claude auto-decided）。Business 影響有限。

**Consequences**: Phase 2 implementation 快；early users 可能見重複 entity；upgrade 路徑清晰。

---

## ADR-011 — 官方故事由 founder + Claude 自己創作（at launch）
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: Phase 7 launch 嘅 5 條官方故事由 founder + Claude collaboration 創作，唔請外面 writer at launch。

**Context**: 用戶揀「me + you, can do it later」。Solo lean，align founder vision。

**Consequences**: 唔需要 Phase 7 前準備 writer 合約 template。Author program / monetization defer 去 v1.5+（搬入 backlog）。

---

## ADR-010 — Launch HK + TW 同步
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: Public launch 同步 target HK + TW，唔做 sequential。

**Context**: 用戶揀 B。TW 市場大 4x，文字遊戲社群更活躍。

**Consequences**: 官方故事 cultural diversity（HK + TW 平衡）。Marketing budget day 1 split。Beta tester dual channel（HK + TW）。繁中 locale awareness（HK繁 vs TW繁 用字）。PR 兩邊都要 plan。

---

## ADR-009 — 預設訂價用 USD
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: 所有 tier 用 USD ($9.99/$19.99/$49.99)。HK + TW 用戶都睇 USD。

**Context**: HK + TW 用戶 subscription 習慣睇 USD。Multi-currency 複雜。

**Consequences**: Stripe 設置最簡單。Pricing page 加 "約 NT$X / HK$X" display only。Multi-currency 推遲到 v2。

---

## ADR-008 — Bible 3-tier calibration（hard / soft / open）
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: Story Bible 分 3 層 — Hard Locked (150-300字) / Soft Guided (300-500字) / Open (0字)。

**Context**: 用戶 raise — 太強框架會寫死故事。

**Consequences**: 故事弧 transition 用 condition 而非 turn count；NPC 紅線可被 in-game earned exception unlock；對白/場景/反應 100% Open layer。

---

## ADR-007 — 3-layer API defense
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: Bible enforcement 用 3 層 — system prompt priority + Director Model + tool calling structured output。

**Context**: 單靠 system prompt 95% 攔到但老練玩家可 jailbreak。

**Consequences**: 每 turn 兩個 LLM call。Prompt caching 抵消 Bible/Cards 大 system prompt 成本。

---

## ADR-006 — Narrative Integrity Engine
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: 加 4 層 narrative integrity system 解決 "Yes-Man AI" 問題。MVP day 1 hard requirement。

**Context**: 業界 #2 churn 痛點。

**Consequences**: DB 加 story_bible, story_characters, playthrough_character_states 同 turns 表 director/skill_check 欄位。Phase 1.5 加入。

---

## ADR-005 — 4-layer memory system
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: 4 層記憶 — Recent 20 turns + rolling summary + pgvector RAG + 自動 lorebook。

**Context**: 業界 #1 churn = AI 唔記得。

**Consequences**: pgvector + OpenAI embedding。Background Edge Functions 做 summary + entity extraction。

---

## ADR-004 — Adult mode 用 LLM 隔離設計
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: 成人模式 opt-in + Stripe Identity + 開啟後 model picker 限 OpenRouter。

**Context**: 大 model 公司 TOS 違規會 ban platform。

**Consequences**: OpenRouter 接入 Phase 6 必須。CSAM pre-filter 永遠 on。

---

## ADR-003 — 多 LLM 用戶可揀
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: 用 Vercel AI SDK 統一接 Anthropic + OpenAI + Google + xAI + OpenRouter。

**Context**: 用戶 explicitly want。

**Consequences**: Model registry 喺 DB。每 model 有 credit_multiplier。Phase 3 implementation。

---

## ADR-002 — 一個 engine handle 三個 mode
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: 用戶創作 / 社群 / 官方 用同一個 engine。

**Context**: 三個 mode 本質都係 prompt-seeded continuation。

**Consequences**: MVP scope simpler。

---

## ADR-001 — Tech stack lock
**Date**: 2026-05-21 · **Status**: ✅ Accepted

**Decision**: Next.js 15 + Supabase + Vercel AI SDK + Stripe + Vercel hosting。

**Context**: Solo dev 要 minimize moving parts。

**Consequences**: Vendor lock-in 到 Supabase（acceptable）。
