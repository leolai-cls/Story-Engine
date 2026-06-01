# DECISIONS — Story Engine

> Architectural Decision Records (ADRs)。每個重要決定一條，capture **Decision / Context / Consequences**。
> 點解寫呢個：3 個月後重新諗，唔記得點解咁揀。呢度就係答案。
>
> 格式：每條 ADR 唔超過 200 字。Reverse chronological（最新喺最上）。

---

## ADR-024 — 成人向 narrator: GLM 5.1 → Grok 4.1
**Date**: 2026-06-01 · **Status**: ✅ Accepted

**Decision**: 成人模式 narrator（同成人向 NPC L3 agent）由 GLM-5.1 換做 **Grok 4.1**（`grok-4.1` via CrazyRouter）。GLM-5.1 留低做 Standard pool 中文 SFW model。失敗處理用**通用機制**（同所有 model 一樣：maxRetries=1 連接層自動再試 + onFinish 誠實失敗 + 前端 retry 掣）· **唔自動轉做另一隻 model**。

**Context**: 真實 adult playthrough「生日轉運」(2026-06-01) GLM-5.1 retcon 即興角色名（turn 2 寫「阿俊」· turn 4 否認改「阿輝」）。根因 = 弱 model 記唔牢一閃名。Research（Reddit/JanitorAI 社群 + EQ-Bench 寫作評測）：GLM 中游 · DeepSeek benchmark 高但 RP「error-prone 要 babysit」· Grok 4.1 = 最 permissive（辛辣模式）+ 前沿級一致性。Founder 揀 Grok 主；否決 Kimi 自動後備（「失敗用返同正常 model 一樣機制」· 唔加特殊 model-switch code）。

**Consequences**:
- `models.ts`: 加 `grok-4-1` entry（allows_nsfw · crazyrouter · tier_pool null · multiplier 1.0 = 唔改 adult credit 價）· `ADULT_NSFW_MODEL` 改指向佢
- `tier-router.ts`: adult branch 自動解去 Grok（邏輯不變 · 只改 const + 註解）
- 失敗 = 通用 honest-fail · 冇 model-switch fallback（否決 Kimi 自動頂）
- 現有 adult playthrough 唔自動 migrate（留 GLM · 新 playthrough 至用 Grok · 開新嘅做乾淨測試 · 避免帶住污染歷史）
- ⚠️ 待 founder 實測:Grok via CrazyRouter 若出空白回合 → 查 xAI reasoning param 加 `providers.ts` 攔截（似 Gemini `thinking_budget=0` 嗰個 footgun）
- Pricing（Grok 真實成本可能略高）= money-tier 再議 · 暫維持 credit 1.0
- 長期結構性修正（即興名冊 / 角色升級階梯）仍見 `pm/architecture/03-character-soul.md`

---

## ADR-022 — Model 簡化做 2 tier + 唯一 NSFW model 用 GLM 5
**Date**: 2026-05-28 · **Status**: ✅ Accepted

**Decision**: Model 結構由 4 個 tier_pool 簡化做 2 個。
- Standard model = Gemini 3.5 Flash (via OpenRouter) + GLM 5.1 (Roleplay alt)
- Pro model = Claude Sonnet 4.6/4.7 (via Anthropic direct) + GPT-5.4 Pro (OpenRouter alt)
- **Pro Max tier (Opus 4.7) 移除**
- **Adult tier_pool (Llama 405B) 移除** · 用 GLM 5.1 + `allows_nsfw=true` flag 代替

Subscription tier 維持 3 個 (Free + Standard $9.99 + Pro $19.99) · model access:
- Free: 淨係 Standard model
- Standard $9.99: Standard + Pro model 都用得 · 可開成人模式 (KYC 後)
- Pro $19.99: 同 Standard 一樣 model · NPC L3 unlimited · adult mode

**Context**: 2026-05-28 founder explicit:「only 2 tiers of model like we said in md/html, stand use gemini 3.5flash, pro use sonnet 4.7」+「Standard 都可以用成人模式」+「we use GLM 5 fo nsfw story」。之前 code 用 4 個 tier_pool (standard/pro/pro-max/adult) + Llama 405B for NSFW · 過度複雜 + Opus 太貴 + Llama 405B 喺 OpenRouter 真實 cost 唔劃算。

**Consequences**:
- `lib/ai/models.ts`: 移除 `claude-opus-4-7` + `llama-3-1-405b-uncensored` · `TIER_POOLS` 簡化做 2 key · `TIER_GATE` 同步
- `pickModelForTier` / `tier-router.ts`: adult mode 路由直接 return GLM 5.1（唔再有獨立 adult pool）
- TierPicker UI: 只 show 2 個 model card · 唔再 show Pro Max card
- Stripe products.ts: bullets 修正 "Standard unlocks Pro Max" 假 claim
- 未來新 model 由 founder 拍板加 · 依 2-tier 原則歸類

---

## ADR-021 — HK founder = 只用 OpenRouter + Anthropic API key
**Date**: 2026-05-28 · **Status**: ✅ Accepted

**Decision**: Product 只可以依賴 2 個 LLM provider API key:
- `OPENROUTER_API_KEY` — 用嚟所有 model（Gemini · GLM · Sonnet · Haiku · Grok 等都經 OpenRouter）
- `ANTHROPIC_API_KEY` — Anthropic direct（OpenRouter baseURL bug fallback · Haiku 4.5 Director 直駁 較穩）

Forbidden: OpenAI direct (`api.openai.com/*`) · Google direct (Vertex / AI Studio) · xAI direct。

**Context**: Founder 喺香港 · 攞唔到 OpenAI API key（地理限制）。Code 入面 `lib/moderation/openai-moderation.ts` + `lib/ai/embed.ts` 直駁 OpenAI = 喺 prod 永遠 fail (`OPENAI_API_KEY` 唔可能 set)。Founder 2026-05-28 爆怒：「我已經講咗好多次我喺香港我拎唔到 openai 嘅 key」。

**Consequences**:
- Moderation 改用 Haiku 4.5（Anthropic direct）+ structured output classifier
- Embeddings：如果 OpenRouter 唔 expose embedding endpoint · defer to backlog（memory journal degrade gracefully）· 或者用 Cohere 等 HK-accessible 替代
- `providers.ts` dispatcher 移除 `openai / google / xai` 廢嘅 switch case
- `.env.example` 移除 `OPENAI_API_KEY` line
- 任何將來新 dependency 要 founder approve provider source（必須 OpenRouter or Anthropic only）

---

## ADR-020 — Customer-facing copy 同 internal strategy text 分得清楚
**Date**: 2026-05-28 · **Status**: ✅ Accepted

**Decision**: 任何 customer-facing UI copy (marketing pages · product UI text · email templates · error messages) 永遠唔可以直接 lift 自 internal strategy / competitive moat / 技術 advantage 文件 (CLAUDE.md / DECISIONS.md / pm/STATUS.md)。Customer-facing 寫法 = user-benefit framing。Internal 寫法 = candid 競爭 / 戰略 talk。每段 marketing copy 出之前必須過 filter「呢句 if 同行 / 競爭對手睇到 · 會唔會 embarrassing or self-defeating?」。

**Context**: Session 15 Claude 直接 lift CLAUDE.md 入面嘅「對手要 6-12 個月先抄到」(internal moat assessment 表達 product differentiator timeline) 入 marketing pill · 變成 customer-facing。Founder catch (繁中 vulgarities) — competitor trash-talk in own marketing 係 unprofessional + signal weakness (insecurity vibe)。問題唔係 false claim · 問題係場合錯。

**Consequences**:
- 新 CLAUDE.md hard rule #34: Customer-facing copy 永遠 user-benefit framing · NEVER competitive / strategy / technical advantage talk
- 換咗：「對手要 6-12 個月先抄到」/ "Months for competitors to copy" → 「為每個世界度身訂造」/ "Crafted for every world" × 3 locales
- 未來每次寫 marketing / product UI text 之前自問：呢句係寫俾用戶睇 · 定係寫俾自己 / 投資者 / 同事睇？只有後者啱寫 competitor / strategy talk
- Internal docs (CLAUDE.md · DECISIONS.md · pm/) 仍然繼續 candid 寫 strategic context — 但係只活喺呢度 · 唔輸出

---

## ADR-019 — Subdomain split cookie scope + `getAppOrigin()` 做 single source of truth
**Date**: 2026-05-28 · **Status**: ✅ Accepted

**Decision**: Cross-subdomain auth flow (OAuth callback / magic link redirect) 永遠用 `getAppOrigin()` helper from `lib/urls.ts` 揀 redirect URL — 唔可以 fall back 去 `headers().get("origin")` (browser-controlled · phishing vector) · 都唔可以直接用 `NEXT_PUBLIC_SITE_URL` (post-split 已經 = marketing host = kieio.com)。Auth cookies scope 到 `.kieio.com` (parent domain) 等 marketing + product subdomain 都讀到 session。

**Context**: Session 15 founder 試 Google login · OAuth 表面成功但 user 表面 not-logged-in。Root cause：`authRedirectBase()` 用咗 `NEXT_PUBLIC_SITE_URL` (post-split = kieio.com) → OAuth callback 落 kieio.com (marketing host) → Supabase 喺 kieio.com 域 set 個 cookie → middleware redirect 入 app.kieio.com → 個 host 睇唔到 cookie → user 表面 unauth。Silent failure mode · Supabase logs 顯示 session created · 但 client 完全 invisible。

**Consequences**:
- `web/src/app/[locale]/login/actions.ts` `authRedirectBase()` 永遠 return `getAppOrigin()` (NOT `NEXT_PUBLIC_SITE_URL`)
- Applied 喺 Google OAuth `redirectTo` + magic link `emailRedirectTo` (兩處都係 auth flow 入口)
- `/auth/callback` route 一定要喺 product subdomain (app.kieio.com)
- Supabase Dashboard → Auth → URL Configuration redirect URLs 全部更新成 `https://app.kieio.com/auth/callback` (was kieio.com)
- Pattern reusable for any cross-subdomain auth flow · helper file 係 single source of truth
- Defense in depth: middleware 同時 enforce auth-route subdomain (`/auth/*` 一定喺 app.kieio.com)

---

## ADR-018 — Signup grant 1000 credits 對齊 Pricing v3 spec
**Date**: 2026-05-28 · **Status**: ✅ Accepted (founder explicit auth · Migration 0033 applied)

**Decision**: Free tier signup grant = 1000 credits one-time + 50 credits daily refresh (cron)。對齊 pm/STATUS.md Pricing v3 spec line 74「Free signup 1k + 50/day」。Migration 0033 三步走：(1) `profiles.credit_balance` column default 50 → 1000 · (2) `handle_new_user()` trigger grant 1000 + write `sub_grant` ledger entry marked `source: signup_initial_grant` · (3) backfill DO block scan + UPDATE existing under-granted users +950 with ledger entry marked `source: signup_grant_backfill_0033`。

**Context**: Session 15 founder 問「register 之後到底拎幾多 token?」· 發覺 spec (pm/STATUS.md) 同 code (Migration 0001 default + Migration 0008 trigger) drift — spec 講 1000 + 50/day · code 淨係 grant 50。Drift from launch · undetected。Founder 用 Cantonese vulgarities 表達 frustration「read the fucking cost/status md」。Production 影響 minimal (0 users actually existed) 但係 spec-vs-code drift 係 documentation hygiene 紅旗。

**Consequences**:
- Migration 0033 applied prod (founder authorized option A: full fix + backfill)
- Pattern: 每次 ship new feature 應該 scan spec docs for related claims · validate code 真係 match · 唔好 trust the doc just because 你 wrote it
- pm/STATUS.md Pricing v3 spec line 仍然 authoritative · code 而家對齊
- Header comment in Migration 0033 documents that Migrations 0029-0032 were applied via Supabase MCP during money tier ship but not yet committed to repo · 0033 是 first migration to land in source after that batch
- Future TODO: backfill Migrations 0029-0032 into repo file form (currently exist in prod via MCP but not in source) — tracked in BACKLOG

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
