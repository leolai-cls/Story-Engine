# ROADMAP — Story Engine

> Phase-by-phase 詳細 checklist。Claude 完成 task 之後 check off。
> 每個 phase 有明確 "done definition" — 達到先可以 move on。

---

## Status legend
- ⬜ Not started
- 🟡 In progress
- ✅ Done
- ⏸️ Blocked / paused

---

## Phase 0 — 地基 ⬜

**Done when**: 一個用戶可以登入網站、見到 marketing landing、navigate 基本頁面。

- ⬜ Next.js 15 project init（TypeScript + App Router）
- ⬜ Tailwind v4 + shadcn/ui setup
- ⬜ next-intl 國際化（繁中 default，簡中 + EN structure ready）
- ⬜ Supabase project（cloud project + local CLI setup）
- ⬜ Migration `0001_initial.sql`（profiles, stories, playthroughs, turns 基本欄位）
- ⬜ Supabase Auth（email + Google OAuth）
- ⬜ Auto-create profile trigger（auth.users → profiles）
- ⬜ App layout（header + nav + auth state）
- ⬜ Marketing landing page（hero + features + pricing preview）
- ⬜ Pricing page（static）
- ⬜ Settings skeleton（empty tabs：profile / billing / models）
- ⬜ Sentry + PostHog setup
- ⬜ Deploy to Vercel（連 Supabase 環境變量）
- ⬜ Domain（如果有，買咗住）

**Verify**：陌生人由 landing → sign up → 入到 dashboard。

---

## Phase 1 — 故事引擎 MVP ⬜

**Done when**: 用戶可以由零創作一個故事（AI 生成 schema + bible + character cards + 開場），玩到 3+ 回合，介面 reflect 狀態變化。

- ⬜ Migration `0002_state_schema.sql`（stories.state_schema, story_bible 等）
- ⬜ Migration `0003_characters.sql`（story_characters, playthrough_character_states）
- ⬜ State schema Zod validator + render_hint enum
- ⬜ 9 個 render hint component
  - ⬜ bar
  - ⬜ progress_ring
  - ⬜ number
  - ⬜ enum_chip
  - ⬜ inventory_list
  - ⬜ relationship_graph
  - ⬜ meter_with_label
  - ⬜ portrait
  - ⬜ note
- ⬜ `<DynamicStatePanel>` generic renderer
- ⬜ Schema generator service（lib/ai/schema-generator.ts）
  - ⬜ Generate state_schema
  - ⬜ Generate story_bible（3-tier：hard_locked / soft_guided）
  - ⬜ Generate story_characters (3-5 NPC + red_lines)
  - ⬜ Generate opening_narrative
- ⬜ Story creation wizard UI（multi-step + preview + edit）
- ⬜ Inline schema/bible/character editor（advanced 用戶可微調）
- ⬜ Playthrough creation flow
- ⬜ Turn endpoint with streaming（單一 provider 先：Claude Sonnet）
- ⬜ Turn-runner orchestration（prompt 構造 + tool calling + state delta apply）
- ⬜ JSON Patch (RFC6902) applier
- ⬜ Play screen UI（敘事 stream + state panel + input box）
- ⬜ Turn history scroll-back
- ⬜ Resume playthrough（refresh 都 work）

**Verify**：創作「戀愛校園故事」 → 預覽 schema（好感度 / 心情）+ bible + 3 個 NPC cards → 玩 3 turn → 介面跟住情節變 → refresh 接得返。

---

## Phase 1.5 — 故事完整性 ⬜

**Done when**: 玩家嘗試突破劇情/角色，AI 真正 in-fiction pushback 而唔係取悅。

- ⬜ Director Model service（lib/ai/director.ts）
- ⬜ Director system prompt（review against Bible + Cards + State）
- ⬜ Director tool schemas：reject_action / require_skill_check / allow_with_constraint / allow / flag_arc_drift
- ⬜ Skill Check engine（pure functions, lib/ai/skill-check.ts）
- ⬜ Skill Check UI（擲骰動畫）
- ⬜ Permanent flags system（playthrough_character_states.permanent_flags）
- ⬜ Earned exceptions registry（flag → red_line_relaxation mapping）
- ⬜ Director verdict → Narrator 整合
- ⬜ 2-LLM-call credit calculation（Director 用 cheap model）
- ⬜ turns 表加 director_verdict + skill_check 欄位

**Verify**：第 5 回合輸入「親林思雅同求婚」 → Director 拒絕觸發紅線 → Skill check 失敗 → Narrator 寫 in-fiction pushback（NPC 反應）→ 好感度大跌 → 永久記錄。

---

## Phase 2 — 長期記憶 ⬜

**Done when**: 玩家可以玩 50+ 回合，AI 答得返早期細節 + 仲記得每個 NPC 嘅 history。

- ⬜ Migration `0004_pgvector.sql`（vector(1536) + HNSW indexes）
- ⬜ OpenAI embedding integration
- ⬜ Embed pipeline on turn save（background）
- ⬜ Retriever service（recent + RAG + lorebook + character cards）
- ⬜ Summarizer Edge Function（每 20 turns 自動）
- ⬜ Lorebook 自動 entity extraction Edge Function
- ⬜ Lorebook UI tab（read + 手動 edit）
- ⬜ Character interaction summary（auto-update playthrough_character_states.recent_interactions_summary）

**Verify**：玩 30 回合，問「第 1 回合做過咩」答得啱；問「林思雅最近一次唔開心係幾時」答得啱。

---

## Phase 3 — 多 Model + Credits ⬜

**Done when**: 用戶可揀 AI Model，每個 Model 按比例扣 credits。

- ⬜ Migration `0005_credits.sql`（credit_ledger, llm_models registry）
- ⬜ LLM model registry（seed initial models）
- ⬜ Vercel AI SDK 接入所有 provider（Anthropic / OpenAI / Google / xAI / OpenRouter）
- ⬜ Credit-meter service（token → credit 公式）
- ⬜ Credit ledger writes（append-only）
- ⬜ Model picker UI（with credit estimate per turn）
- ⬜ Per-tier model gating
- ⬜ Free-tier daily credit refresh（Supabase cron）

**Verify**：由 Claude 切到 GPT-4o → 下回合用 GPT → credits 按比例扣 → ledger entry 正確。

---

## Phase 4 — 訂閱付費 ⬜

**Done when**: 用戶可以付 $9.99 訂閱，credits 入賬，自動續訂。

- ⬜ Migration `0006_subscriptions.sql`
- ⬜ Stripe Customer + Product + Price setup
- ⬜ Stripe Checkout（訂閱）
- ⬜ Stripe Checkout（一次性 top-up）
- ⬜ Stripe Customer Portal
- ⬜ Webhook handler（subscription.created / updated / canceled / invoice.paid）
- ⬜ Idempotency keys（重試唔會 double-grant）
- ⬜ Credit grant on subscription event
- ⬜ Billing settings page

**Verify**：Stripe test mode → $9.99 訂閱 → 5,000 credits 入賬 → cancel → 期末 credits 唔再 refresh → webhook 重試一次唔會 double-grant。

---

## Phase 5 — 社群 ⬜

**Done when**: 用戶可分享自己嘅故事，其他人可以玩到，獨立進度。

- ⬜ Migration `0007_community.sql`（ratings, comments, flags）
- ⬜ Story visibility（private / unlisted / public）
- ⬜ Library page（grid + filter + search）
- ⬜ Postgres FTS index（title + description）
- ⬜ "Play this story" 流程（建立 new playthrough，story 不變）
- ⬜ Rating UI（1-5 stars）
- ⬜ Comment thread
- ⬜ Report → moderation queue
- ⬜ "Trending" 排序算法（play_count × recency decay）

**Verify**：用戶 A 公開故事 → 用戶 B 喺 library 搵到 → 玩 → 兩個進度完全獨立 → A 嘅 character cards 唔受 B 影響。

---

## Phase 6 — 成人模式 ⬜

**Done when**: Storyteller tier 用戶完成年齡驗證可開成人模式，model picker 只顯示 OpenRouter。

- ⬜ Stripe Identity 整合
- ⬜ Age verification 頁面
- ⬜ Adult mode toggle 喺 profile
- ⬜ OpenRouter API 接入（Llama 3.1 / DeepSeek / Mistral）
- ⬜ LLM picker filtering by `allows_nsfw`
- ⬜ Content rating filter 喺 library
- ⬜ CSAM / 違法 pre-filter（無論咩 mode 都 on）
- ⬜ Adult mode UI watermark

**Verify**：未驗證 → 嘗試開啟 → 被擋 → 完成 Stripe Identity → 解鎖 → Model picker 只見 OpenRouter → adult-rated 故事可玩。

---

## Phase 7 — 上線打磨 ⬜

**Done when**: 5 條官方故事齊備，新手 onboarding 流暢，performance 達標，準備公開 launch。

- ⬜ Craft 5 條官方精品故事（中文圈 vibe，多元 genre）
- ⬜ Onboarding flow（first-run tour，30 秒體驗 vision）
- ⬜ Mobile responsive 全 audit
- ⬜ Anthropic prompt caching enabled（system + bible + cards）
- ⬜ Performance：p95 turn latency < 8s
- ⬜ Load test 50 並發 playthrough
- ⬜ Credit ledger consistency check（sum(deltas) == balance for all users）
- ⬜ PostHog event tracking（key funnels）
- ⬜ Error monitoring（Sentry）
- ⬜ TOS / Privacy / Cookie policy（請律師 review）
- ⬜ Public marketing pages refresh
- ⬜ Launch waitlist
- ⬜ Press kit / launch posts（HK 巴、TW Dcard、PTT、Twitter 中文圈）

**Verify**：每階段 verification 全部 pass，外人試玩 5 個 session 滿意度 > 80%。

---

## Post-launch backlog
睇 `BACKLOG.md`。
