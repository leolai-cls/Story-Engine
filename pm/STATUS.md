# STATUS — Story Engine

> 單一 source of truth。Claude 每次重要進展後更新呢個 file。
> 開新 session 第一件事：read 呢個 file，知道而家喺邊。

---

## 🎯 而家狀態

**Phase**: **🟢 Phase 0 DONE + Phase 1 DONE (Session 11 · 7 migrations 0019-0026 · 7-wave audit converged across 2 phases · 12 ship blockers caught) · 落 🟡 MONEY tier (Phase 4 Stripe + Phase 6 KYC)**
**Live URL**: https://story-engine-drab.vercel.app
**Last updated**: 2026-05-25 (Session 11 — Phase 0 tier abstraction + Phase 1 MemPalace memory + NPC L2 + Knowledge Graph · 3 audit cycles converged)

## 🎯 Founder priority rule（鎖死）

**Function → UI → Money**。Phase number 唔等於 priority — 按下面 tier 排：

- 🟢 **FUNCTION (in progress, scope expanded)** — Session 8 6-phase complete · **Session 11 pre-launch Phase 0 added** (tier abstraction · 4 migrations · 5 ship blockers caught) · Phase 1 next (MemPalace memory + NPC Level 2)
- 🟣 **UI** ✅ DONE Session 9 (revisit after function 完晒 + money)
- 🟡 **MONEY**：Phase 4 Stripe · Phase 6 KYC (deferred until function 完)
- 🏁 **Final stage**（launch eve）：Phase 7 5 條官方故事 + Comprehensive Manual E2E

## 📍 What's next（按 function-first priority）

| 排 | Plan item | Tier | Time | Why |
|---|---|---|---|---|
| 🥇 | **Phase 1 — MemPalace 4-layer memory + NPC Level 2** — hierarchical namespace (Wings/Rooms/Drawers) · Director rooms_to_load + npc_updates · hybrid retrieval (semantic + keyword + temporal) · NPC dynamic state via Director output · knowledge graph (mem_nodes + mem_edges) · scoped scene-level rolling summary · tier-based turn trim (8/12/20) | 🟢 FUNCTION | ~2-3 sessions | Solves #1 churn driver "AI 唔記得" · cost optimization + quality 一齊 |
| 🥈 | **Money tier** — Phase 4 Stripe (subscription + checkout + top-up) · Phase 6 KYC (Stripe Identity) · Phase 3 deferred (refund saga · OpenRouter dynamic pricing) | 🟡 MONEY | ~2 sessions | 收錢 backbone (after function 完) |
| 🏁 | **Final stage (launch eve)** — (a) Phase 7 content: 5 條 launch-ready 官方故事 (小工作) · (b) Comprehensive Manual E2E (founder ~1-2 session) covers community + UI + adult mode + 5 stories + entire happy path | 🟢 + 🧪 | ~2-3 session 一氣呵成 | Founder rule: 寫故事細工作 · 等所有 backend/UI/money 完晒先 polish 內容 · 同時 final E2E 測 launch-ready product |

## 🟣 UI tier deliverables (Session 9 · 14 commits · all 47 designer artboards covered)

| Chunk | Commit | Delivery |
|---|---|---|
| 1 Foundation | `e81dfab` | Story Engine tokens (additive · `--se-*` prefix preserves shadcn) · 7 atomic components (Cover · StoryCard · ContinueCard · GenreChip · RatingBadge · Stars · DispositionAxis · NpcCard · Avatar · Carousel) |
| 2 Phase A | `489b7b7` | Library Netflix hero + cover-dominant carousels · Story Detail full-bleed hero + cast preview + descriptive stats (NO completion %) + 403 friendly card |
| 3 Phase B | `2f4a5a5` | NEW Memory Journal route + API + 3 tabs · Play NPC right rail with 4-axis disposition · Memory link in play header |
| 4 Phase C | `4b43763` | Locale switcher (繁中/简中/EN dropdown) · Login Guest honest copy · Creation KYC jargon fix |
| 5 Hard rules | `bb879d9` | CSAM banner (Library + MJ · Hard #2) · F4 Adult mode consent dialog (P6-LOW-01) · Director verdict amber border (Hard #4) |
| 6 Skill check + Director | `84558a1` | 4-outcome inline badges (NAT 20/1) · verdict-driven amber · floating moderation pill chip |
| 7 Creation + Fork | `e81ce58` | 4-task generation dashboard ("peak Grok moment") · Fork modal redesign with per-playthrough explainer |
| 8 Visitor + Skeleton | `651877c` | 3-pillar visitor landing · Library loading.tsx Suspense skeleton |
| 9 Mobile | `ec81776` | Bottom tab nav · Story Detail sticky CTA · Memory Journal mobile tabs · Wizard reject card reskin |
| 10 Settings | `df1f3f4` | Sticky sidebar nav + atomic SettingsCard/Row pattern · 5 sections |
| 10.5 KYC residual | `05cf683` | 3 user-facing KYC sites → 身份驗證 |
| 11 100% push | `4be7e92` | Search inset over hero · cycle indicator · 64px headline · mobile compact Story Detail hero · 138px mobile card width · Play screen 3-tab mobile · Visitor collage absolute offsets · SkillCheckModal (rolling + 4 outcomes ready) |

**~100% pixel-match to designer's v5 mockup**。Backend RPC unchanged · all functional flows preserved · 14 commits pushed sequentially. SkillCheckModal components built but not wired to PlayClient yet (5-min follow-up).

## 🚧 Blockers

**冇 launch blocker · function tier truly complete**。

**Phase 5 5-cycle audit converged** — Wave 2.5 audit (17 · 0 blocker) → Wave 2.6 fix → Wave 2.6 audit (16 · 0 blocker · convergence holds) → Wave 2.7 fix → Wave 2.7 audit (12 · 0 ship blocker · 1 HIGH on E2E checklist 已修)。Finding count declining: 29 → 24 → 17 → 16 → 12。**35 個 issue caught & fixed pre-prod (21 ship blocker + 14 polish)**。

**Phase 6 + 1.5/2 polish audit 2-cycle converged**：
- **Cycle 1** (16 finding · 1 CRIT (Llama MODEL_PRICING key) + 2 HIGH (llm_provider hardcoded · Library Adult option) + 3 MED + 10 LOW) → 6 inline-fixed + Migration 0016 加 fork RPC p_llm_provider param · 10 LOW deferred to BACKLOG。
- **Cycle 2** (7 finding · post-fix verify · 兩個 agent 獨立 reach「0 NEW CRIT/HIGH」結論) → 2 NEW MED inline-fixed：(a) Migration 0017 drop legacy 3-arg fork RPC overload (sanity verified overloads=1) (b) turn route 合併 adult_mode + credit_balance reads 做 ONE select · drop unused getBalanceAndCheck import · 慳一個 PG roundtrip per turn for all users。
- **Declining trend 16 → 7** · 2 consecutive zero-blocker cycle 已夠 declare convergence (Phase 5 overshoot 至 5 cycle 證明小 fix surface 上 diminishing return real)。
- **+8 issues caught pre-prod** (3 ship blocker + 5 polish) · 加 Phase 5 嘅 35 = **43 total issues caught pre-prod across function tier**。

**🧪 Manual E2E DEFERRED 到 UI tier 完之後**（founder rule · 2026-05-23）：唔再逐 phase 跑 E2E。等 function tier 全部 ship 晒 + UI tier polish 完 → 一次過 comprehensive test 整個 final product。manual-e2e-phase5.html 留住做 future E2E suite 嘅 starting point · 屆時 expand 覆蓋 community + UI + adult mode + 5 官方故事 + 完整 happy path。理由：minimal UI 測完仲要 UI tier 完再測一次 · 浪費 founder 時間 · 而且 final product 嘅 test 先有真正信號。

**Migrated to backlog** (per pm/BACKLOG.md「Phase 5 deferred polish」section · 20 IDs 跨 4 sub-bucket)：W2.5-GENRE-M-02 alias gap · W2.5-FTS-L-03/L-04 tokenizer polish · W2-COST-H-04 anon ISR · W2.6-MIG-L-02 'curated' enum doc · W2.6-PLAY-L-03/L-04 defensive · W2.6-LIB-L-05 1-char Latin hint · W2.6-LIB-I-06 Settings display_name trim · W2.6-UX-L-03 English error strings · W2.6-MIG-I-07 createStory+trigger origin redundancy · W2.6-INFO-03 getCommentReplies UI TODO · W2.6-MIGRATION-L-04 sanity check pattern · 等等。

## ✅ Just completed (Session 11 cont. — 🟢 Phase 1 MemPalace + NPC L2 + Knowledge Graph · 3-wave audit converged)

### TL;DR
- 4 個新 Migration 上 prod (0023 / 0024 / 0025 / 0026 Wave 2 fix) · 8 個 file 改動
- 7 個 Phase 1 sub-task 全部完成 (MemPalace hierarchical · Director output extension · hybrid retrieval · NPC Level 2 · knowledge graph · scene-aware summary · tier-aware turn trim)
- 3-wave audit cycle converged (Wave 1: 33 finding · 7 HIGH → Wave 2 fix → Wave 2 audit: 0 CRIT/HIGH/MED → Wave 3: 0 finding · CONVERGED per CLAUDE.md hard rule #29)
- **7 ship blockers caught pre-prod** (3 security/correctness + 4 UX/cost)

### 🗃️ 4 Migrations applied prod
| Migration | Delivery | Sanity |
|---|---|---|
| **0023** MemPalace hierarchical | `lorebook_entries.wing` (6-enum) + `room` (free text) · `match_lorebook_by_rooms` + `list_lorebook_rooms` RPCs · `protect_lorebook_wing` BEFORE UPDATE trigger | ✅ 7/7 |
| **0024** NPC Level 2 | `playthrough_character_states.dynamic_state` jsonb · `apply_npc_dynamic_state` RPC (rolling 8-entry trajectory) | ✅ 3/3 |
| **0025** Knowledge graph | `mem_edges` table (21 edge_type controlled enum · weight 0..1) · `walk_lorebook_graph` BFS RPC · `add_lorebook_edge` RPC | ✅ 1/4/5/1/1/1 |
| **0026** Wave 2 audit fix | Canonical JWT pattern (0022/0023 fix) · trajectory trim WITH ORDINALITY (0024 fix) | ✅ verified |

### 🎯 7 sub-tasks completed
1. ✅ **P1.1** Migration 0023 — hierarchical namespace (Wings/Rooms/Drawers)
2. ✅ **P1.2** Director schema — memory_hints + npc_updates + scene_boundary
3. ✅ **P1.3** Hybrid retrieval — 60% semantic + 30% keyword (graded · post-Wave-2) + 10% temporal · CJK bigram + 7-day half-life
4. ✅ **P1.4** NPC Level 2 — in-memory pre-Narrator apply (skipped on verdict=reject · narrative-integrity guard) + async DB persist
5. ✅ **P1.5** Knowledge graph — 21 edge types · BFS walk 1-3 hops · service-role only writes
6. ✅ **P1.6** Scene-aware summary — Director scene_boundary trigger · 25-turn runaway cap · 4-turn min
7. ✅ **P1.7** Tier-aware turn trim — standard/pro=12 · pro-max=20 · adult=12 (post-Wave-2 bump from 8 to preserve continuity)

### 🛡️ 3-wave audit converged (per CLAUDE.md hard rule #29)
| Wave | Findings | Verdict |
|---|---|---|
| **Wave 1** (initial code surface) | 33 total · 0 CRIT · **7 HIGH** (F-01 JWT pattern · F-02 trajectory ORDER BY · F-03 director_fallback · F-06 npc_update bypass · F-11 Zod defaults · UX-H-02 Standard 8 regression · COST-H-01 max_output overrun · UX-H-03 NaN) · 13 MED · rest LOW/INFO | **NEEDS FIX** |
| **Wave 2** fix wave | Migration 0026 + code fixes for all 7 HIGH + select MED (graded keyword · npc_updates max 4) | **applied** |
| **Wave 2** audit | 0 CRIT · 0 HIGH · 0 MED NEW · 5/5 Wave 1 HIGH closures verified PASS | **CONVERGE-1** |
| **Wave 3** audit | 0 finding · all closures re-verified · no regressions · TypeScript clean | **CONVERGED (ship)** |

### 🔐 Wave 1 → Wave 2 ship blockers caught
| ID | Severity | Found by | Fix |
|---|---|---|---|
| F-01 | 🟠 HIGH SEC | Agent A | Migration 0026 · canonical `request.jwt.claims::jsonb` JWT pattern (applies to 0022 + 0023 triggers) |
| F-02 | 🟠 HIGH CORR | Agent A | Migration 0026 · `jsonb_array_elements WITH ORDINALITY` + ORDER BY in apply_npc_dynamic_state |
| F-03 | 🟠 HIGH OPS | Agent A | turn route · `directorFailed` flag · persisted as `{ ...verdict, fallback: true }` for postmortem visibility |
| F-06 | 🟠 HIGH SEC | Agent A | turn route · skip + clear npc_updates when `verdict.verdict === "reject"` (narrative-integrity defense) |
| F-11 | 🟠 HIGH CORR | Agent A | director schema · `.default([])` / `.default(false)` on memory_hints / npc_updates / scene_boundary |
| UX-H-02 | 🟠 HIGH UX | Agent B | models.ts · Standard tier 8 → 12 (matches Pro · preserves mid-scene continuity for existing players) |
| COST-H-01 | 🟠 HIGH COST | Agent B | director schema · npc_updates `.max(4)` (down from 8) · enforces stated rule · prevents structured-output overrun |
| UX-H-03 | 🟠 HIGH CORR | Agent B | retriever · `Number.isFinite(updated)` NaN guard in temporalScore + applyHybridScoring (defense-in-depth on corrupt rows) |
| UX-M-01 | 🟡 MED → fixed in Wave 2 | Agent B | retriever · graded keyword score (matches/max-set vs binary 1.0) — 60/30/10 now actually re-ranks |

### ⏳ Deferred to BACKLOG (carry-over · dormant by design)
- F-04 (walk_lorebook_graph cycle detection) — no caller yet · acceptable defer
- F-05 (walk RPC zero-weight propagation) — no caller yet · same
- F-07 (CJK Extension A/B in extractTokens regex) — BMP-only coverage · pre-launch market mostly BMP
- F-08 (add_lorebook_edge merge-vs-replace semantic) — no caller yet · document when wiring
- F-NEW-01 / F-16 (hybrid score denominator inversion · entries with rich keywords penalized) — defer · semantic dominates 60% anyway
- M-04 (locale-branch Director system prompt) — 繁中-only at launch · expand for zh-Hans + EN before those markets ship
- P1-UX-H-01 (Memory Journal UI for dynamic_state) — UI tier work · per founder Function-first rule

### 📊 Phase 0 + Phase 1 totals (Session 11)
- **8 migrations** applied prod (0019-0026)
- **12 ship blockers caught** pre-prod (5 Phase 0 + 7 Phase 1)
- **TypeScript clean** across all changes
- **2 phases function tier complete** · ready for Money tier OR continue function audits

---

## ✅ Earlier (Session 11 — 🟢 Pre-launch Phase 0 tier abstraction + 5-wave audit converged)

### TL;DR
- 由「10 model 直選」轉做「4 tier 簡單選」（Standard / Pro / Pro Max / Adult）— 對齊 ChatGPT / Claude UX
- 內部 routing 自動揀最啱 model（中文 → GLM 5.1 / Claude Sonnet；英文 → Gemini Flash / GPT 5.4 Pro）
- 4 migrations applied prod (0019-0022) · 5-wave audit converged · **5 ship blockers caught pre-prod**
- Phase 1 (MemPalace + NPC Level 2) 解鎖

### 🎯 Tier abstraction architecture
| Tier | Pool models | Routing | Subscription |
|---|---|---|---|
| **Standard** | Gemini 3.5 Flash · GLM 5.1 | CJK → GLM · EN → Gemini | Free |
| **Pro** | Claude Sonnet 4.6 · GPT 5.4 Pro | CJK → Sonnet · EN → GPT | Adventurer |
| **Pro Max** | Claude Opus 4.7 | single | Storyteller |
| **Adult** | Llama 3.1 405B uncensored | NSFW isolated | Adventurer + 18+ KYC |
| **Director** | Claude Haiku 4.5 | locked global | — (always) |

### 🆕 Migrations applied prod
| Migration | What |
|---|---|
| `0019_phase0_default_tier` | `profiles.default_tier` text column + check constraint · backfilled 6 users → 'pro' |
| `0020_phase0_rag_similarity_floor` | Cleanup — DROP 3 ghost RPC overloads (RAG floor was already implemented via `p_min_similarity` runtime param earlier) |
| `0021_phase0_audit_fix_opus_backfill` | Idempotent · UPDATE Opus users 'pro' → 'pro-max' (defensive · 0 users today · CASE-order bug fix) |
| `0022_phase0_lock_llm_model_postcreate` | BEFORE UPDATE trigger `protect_playthrough_llm_model` — blocks llm_model / llm_provider writes by authenticated users (service_role bypass for Stripe webhook) |

### 🛡️ 5-wave audit cycle · 5 ship blockers caught
| Wave | Finding | Severity | Fix |
|---|---|---|---|
| **Wave 1 → 2** | `userTierAllowsModel` returned `{allowed:true, reason:'legacy_model'}` for **ANY unknown id** → credit-undercharge attack via browser console RLS write | 🔴 CRIT-01 | Changed to `modelId in MODEL_PRICING` check |
| **Wave 2 → 3** | `MODEL_PRICING` allowlist 太寬 — embedding model `text-embedding-3-small` 可以 pass 做 narrator id → 99% undercharge with Sonnet quality (silent provider fallback) | 🔴 CRIT-02 | Explicit `LEGACY_NARRATORS` Set replaces price-table check |
| **Wave 3 → 4** | `LEGACY_NARRATORS` bypasses min_tier check — Free user could set llm_model='gpt-4o' (was Adventurer tier pre-Phase 0) | 🔴 CRIT-03 | **Architectural fix**: Migration 0022 trigger + remove bypass entirely + add tier-gate to forkStoryToPlaythrough |
| Wave 4 → 5 | CASE clause in Migration 0019 had Opus in 'pro' IN-list BEFORE dedicated 'pro-max' branch — Opus users silently downgraded | 🟠 HIGH-01 | Migration 0021 defensive idempotent fix (0 users today · latent if re-run) |
| Wave 5 | `userTierAllowsModel` still returned `{allowed:true}` for unknown models — final attack surface | 🟠 HIGH-02 | Strict reject `{ allowed: false, reason: "unknown_model" }` for anything not in MODELS catalog |

**Convergence signal**: Wave 5 ended with 0 ship blocker · architectural 3-layer defense (DB trigger + code allowlist + server action validation) replaces 4 scoped patches.

### 🆕 New files
- `web/src/lib/ai/tier-router.ts` — `pickModelForTier(tier, context?)` · `isChineseContent(text)` (CJK ratio ≥30%) · `fallbackChainForTier(tier, context?)` for vendor diversification
- `web/src/components/settings/tier-picker.tsx` — 4 visual tier cards · dynamic credit estimates via `tierAvgCredits` · hides Adult tier when `adult_mode_enabled=false`

### ✏️ Modified files
- `web/src/lib/ai/models.ts` — 10 → 7 model curation · NEW `ModelTier` type · `TIER_POOLS` · `TIER_GATE` · `DIRECTOR_MODEL` · `DEFAULT_TIER` consts
- `web/src/lib/billing/credits.ts` — MODEL_PRICING updated 2026 rates (Haiku $1/$5 · Opus $5/$25 · Gemini Flash $1.50/$9 critical fix) · added GLM 5.1 ($0.98/$3.08) + GPT 5.4 Pro ($2.50/$15) · `userTierAllowsModel` strict-reject unknown
- `web/src/app/[locale]/settings/actions.ts` — `setDefaultTier` action with subscription gate + Adult tier extra gate (`adult_mode_enabled + is_age_verified`) · `setAdultMode` symmetric-resets both `default_model` AND `default_tier`
- `web/src/app/[locale]/stories/new/actions.ts` — wired `default_tier` priority chain (tier → legacy model → DEFAULT_NARRATOR)
- `web/src/lib/community/actions.ts` — `forkStoryToPlaythrough` tier resolution via `pickModelForTier` + Wave 4 tier-gate via `userTierAllowsModel` BEFORE fork RPC call

### 🔐 3-layer defense pattern (replaces scoped patches)
1. **DB trigger** (Migration 0022) — blocks direct RLS write to `llm_model` / `llm_provider` for authenticated users
2. **Code allowlist** (`userTierAllowsModel` strict reject) — unknown model ids → `{ allowed: false, reason: "unknown_model" }`
3. **Server action validation** (`forkStoryToPlaythrough` pre-fork tier-gate) — returns friendly error before RPC call

---

## ✅ Earlier (Session 10 — Multi-LLM + My Games + ChatGPT Sidebar + Audit wave 1)

### Session 10 — 4 commits · 0 CRIT audit verdict

| Commit | Delivery |
|---|---|
| `3a4092d` | Multi-LLM catalog expand to 10 models (2-per-vendor pattern · Anthropic direct + OpenRouter aggregate) |
| `c580a1b` | Gemini 3.1 Pro slug fix: `google/gemini-3.1-pro-preview` (founder provided URL proof) |
| `c26c9ba` | NEW `/[locale]/my` page + `PlaythroughSidebar` component · auth-aware SiteHeader · MobileBottomNav 進行中 repoint |
| `37e9a13` | Audit wave 1 fixes (5 HIGH + 1 MED · 0 CRIT) · NEW `lib/supabase/cached-user.ts` |

### Multi-LLM expansion (10 models · 2-per-vendor)
- **Anthropic direct**: Claude Sonnet 4.6 (narrator · 3.0x · adventurer) · Claude Opus 4.7 (narrator · 5.0x · storyteller) · Claude Haiku 4.5 (director · 1.0x · free)
- **OpenAI via OpenRouter**: GPT-4o (2.5x · adventurer) · GPT-4o mini (0.5x · free)
- **Google via OpenRouter**: Gemini 3.1 Pro Preview (2.0x · adventurer) · Gemini 3.5 Flash (0.5x · free)
- **xAI via OpenRouter**: Grok 2 (2.5x · adventurer) · Grok 2 Mini (0.8x · free)
- **Meta NSFW via OpenRouter**: Llama 3.1 405B (2.5x · storyteller · allows_nsfw=true · CLAUDE.md hard rule #5 isolation)
- Tier gating: free / adventurer / storyteller / legend
- Model selection locked at story creation (not switchable mid-game) — Director model also locked

### My Games dedicated page + ChatGPT-style Sidebar (founder UX gap)
- Founder feedback: "where the F is my chat record? no main menu like LLM apps?" — Library was Netflix-style (browse-first), needed your-work-first surface
- NEW `/[locale]/my/page.tsx` — list ALL playthroughs · 3 status tab (進行中/已封存/棄置) · status badge + 角色名 + turn count + relative time · empty state CTAs (去 Library / 創作新故事)
- NEW `components/se/PlaythroughSidebar.tsx` — desktop 240px persistent rail (lg+) + mobile drawer via hamburger button in slim header · 12 個最近 run · current 高亮 · "查看全部 (N)" footer link
- Site header rewritten **auth-aware** — anon (Library/Pricing + Log in/Sign up) vs authed (Library/我嘅遊戲/Pricing + Settings/Log out)
- `getMyPlaythroughs` query extended with `story.genre` + `cover_image_url` join (non-breaking)
- i18n keys added (nav.myGames × 繁中/简中/EN)
- MobileBottomNav 進行中 link 修返指 /my (was broken /library?continue=1)

### Audit wave 1 — 2-agent parallel · 0 CRIT verdict
**Findings**: 0 CRIT · 5 HIGH (overlap-deduped) · 7 MED · 9 LOW · saved to `pm/my-games-audit-security.html` + `pm/my-games-audit-ux.html`

**Inline-fixed (all 5 HIGH + 1 MED)**:
- ✅ **MG-UX-HIGH-01** Login `?next=` chain — login page hidden input + sanitize + actions FormData + emailRedirectTo forward to callback · 4-file chain · also fixes pre-existing memory page locale prefix bug
- ✅ **MG-PERF-HIGH-02** totalPlaythroughCount into Promise.all batch · saves ~50-80ms / play page render
- ✅ **MG-UX-HIGH-03** mobile play header overflow — 返回 + 記憶 icon-only on mobile · "玩緊：" hidden lg+ only · 360px viewport no overflow
- ✅ **MG-PERF-HIGH-04** React `cache()` wrap on `auth.getUser()` — NEW `lib/supabase/cached-user.ts` · migrated 6 server pages (site-header + library + library/[id] + my + settings + stories/new) · ~30-80ms saved / authed page · estimated ~500K Supabase auth call/月 saved @ 10k MAU
- ✅ **MG-REG-HIGH-05** narrative width regression — max-w-7xl → max-w-[1520px] compensates for 240px sidebar · designer v5 pixel intent restored on 1440-1520 viewports
- ✅ **MG-UX-MED-02** /my?tab=X dead-end — server redirect to /my if counts[tab]===0 && counts.all>0

**Deferred to BACKLOG** (10 LOW from UX agent + 3 INFO from security agent): mostly polish items (loading skeleton on /my · auto-scroll-to-current-item in sidebar · pagination/virtualization once user has >50 plays · etc).

---

## ✅ Earlier (Session 9 — 🟣 UI tier shipped · 14 commits · ~100% pixel-match to v5 design)

### UI tier implementation summary
- **Designer**: Claude Design produced v5 mockup (Grok × Netflix light theme · 47 artboards across 3 phases · audited 5 cycles)
- **Implementation**: 14 commits (`e81dfab..4be7e92`) port v5 to actual Next.js + Tailwind + shadcn codebase
- **Token system**: Story Engine tokens additive (`--se-*` prefix) · preserves shadcn defaults · light palette + 4-axis disposition + warm paper aesthetic
- **Pages**: All 8 pages re-implemented (Library · Story Detail · Play · Memory Journal NEW · Creation · Settings · Login · Locale switcher cross-cutting)
- **Hard rules**: All 11 enforced in UI (繁中 default · CSAM reach · NSFW gate · Director in-fiction · Skill permanent · 4-axis disposition · Memory 4-layer · empty/loading/error states · mobile-first · Adult button gated · Memory per-playthrough read-only)
- **Audit fixes**: 6 Phase C corrections (drop 儲存草稿 / drop 預覽 / Guest honest copy / per-task model labels / KYC jargon × 5 sites / Phase 6 → v1.5+) all propagated
- **Vercel deploy**: Auto-deployed each commit · live at https://story-engine-drab.vercel.app

### What's truly complete · what's still deferred

**Completed UI tier (47 artboards)**:
- ✅ All hard rules enforced
- ✅ All audit fixes propagated
- ✅ All visual moments (hero · cinematic landing · 4-axis · 4 skill outcomes · 4-task generation · Memory Journal differentiator)
- ✅ All mobile dedicated layouts (bottom tab nav · sticky CTAs · 3-tab Play · compact Story Detail hero · 138px cards · Memory Journal mobile top tabs)

**Pre-Money-tier polish work deferred**:
- ⏳ Wire SkillCheckModal (rolling + 4 outcomes) into PlayClient · components built but not triggered yet · 5-min wire
- ⏳ i18n key extraction (繁中 hardcoded · zh-Hans + EN stubs would unblock locale switcher fully)
- ⏳ SSE per-task progress for creation (current shows synchronous task list · designer's mockup also synchronous-looking · acceptable)

### Backend changes during UI tier
- NEW `/api/playthroughs/[id]/memory-journal` GET endpoint (returns summaries + grouped lorebook)
- NEW `web/src/app/[locale]/play/[playthroughId]/memory/` route
- play page.tsx now fetches `turns.skill_check + turns.director_verdict + story_characters + playthrough_character_states` for full UI surface
- KYC user-facing copy normalized to 「身份驗證」across 5 sites (server actions + components)

## ✅ Earlier (Session 8 cont. — Phase 6 + 1.5/2 polish 2-cycle audit converged · function tier truly complete)

### Phase 6 + 1.5/2 polish audit cycle 2 — 0 ship blocker · 2 NEW MED inline-fixed · Migration 0017 applied
- **Cycle 2 audit on the cycle-1 fix surface** (2-agent parallel · 7 finding) · 兩個 agent 獨立 reach「0 NEW CRIT/HIGH」結論 · convergence signal achieved
- **Migration 0017 applied** — drop legacy 3-arg `fork_story_to_playthrough` overload (created by 0009, re-created by 0015) · Migration 0016 用 `create or replace` 唔 drop overload · 形成 ghost RPC · 將來 caller omit 4th arg → 命中 ghost → re-introduce P6-HIGH-01 attribution bug · Migration 0017 explicitly drops 3-arg signature · sanity verified `overloads=1, has_param=true`
- **Turn route merged profile reads** (P6P2-COST-M-01) — `adult_mode_enabled` + `credit_balance` 合併做 ONE combined `select` · inline `getBalanceAndCheck` fail-open semantics · drop unused import · 慳一個 PG roundtrip per turn for all users (was 2 sequential reads after P6-MED-01 refactor)
- **Declining trend 16 → 7** · 2 consecutive zero-blocker cycle 已夠 declare convergence
- **TypeScript clean** · audit HTML updated with cycle 2 narrative
- **Function tier truly complete**: 6 phases · 8 migrations (0009-0017) · Phase 5 5-cycle audit + Phase 6/1.5/2 polish 2-cycle audit converged · **43 issues caught pre-prod** (24 ship blocker + 19 polish) · 10 LOW deferred to BACKLOG
- **下一步：🟣 UI tier** — Library polish · Memory Journal UI (Phase 2 differentiator) · Locale switcher · Settings i18n · audit-deferred UX

## ✅ Earlier (Session 8 cont. — Phase 6 + 1.5/2 polish audit + 1st fix wave)

### Phase 6 + 1.5/2 polish audit (1st cycle) — 1 CRIT + 2 HIGH + 3 MED inline-fixed · Migration 0016 applied
- **🎯 Walks back premature「FUNCTION TIER COMPLETE」claim** — audit caught 1 CRIT (Llama MODEL_PRICING key mismatch · Settings page crash for adult-mode-on users) + 2 HIGH (llm_provider hardcoded 'anthropic' across 3 write sites · Library Adult 18+ option visible to all users → 0-result UX dead-loop)
- **🆕 Migration 0016 applied** — `fork_story_to_playthrough` RPC 加 `p_llm_provider text default 'anthropic'` param · used in both `playthroughs.llm_provider` + `turns.llm_provider` (turn 0 opening) insert · sanity verified · backward-compat retained
- **6 inline fixes**:
  - **P6-CRIT-01** — Llama MODEL_PRICING key 由 `"meta-llama/llama-3.1-405b-instruct"` 改成 `"llama-3-1-405b-uncensored"` (web/src/lib/billing/credits.ts) · 配合 MODELS catalog internal id · computeCredits 唔再 throw
  - **P6-HIGH-01** — llm_provider derive from `MODELS[modelId]?.provider ?? "anthropic"` at 3 write sites: turn route persist · createStoryFromPrompt insert · forkStoryToPlaythrough RPC call · Migration 0016 完成 DB-side fix
  - **P6-HIGH-02** — Library Adult 18+ option conditional `{adultModeEnabled && <option value="adult">...}` · 解死循環 UX
  - **P1.5P-LOGIC-M-01** — `resolveCharacter()` tighten: `norm.length >= 2` + multi-candidate ambiguity 用 log warning + abstain return null (CLAUDE.md hard rule #8 path-format drift telemetry)
  - **P6-UX-M-02** — `setAdultMode(false)` atomic reset NSFW default_model 返 DEFAULT_NARRATOR · user 唔再 stuck
  - **P6-MED-01** — Turn route 加 secondary gate `story.content_rating='adult' && !userAdultMode` → 403 adult_mode_required · 雙重 defense
- **10 LOW deferred** to pm/BACKLOG.md「Phase 6 + 1.5/2 polish deferred」section (UI tier + perf + tech debt sub-buckets)
- **TypeScript clean** · audit report HTML written (`audit-report-phase6-and-1.5polish.html`)
- **Audit-as-gating discipline (CLAUDE.md #7 + #29) 再一次救咗 launch-day-killing self-report claim** — function tier「complete」唔可以淨係靠開發者 self-report · 要 audit verify

### Phase 1.5/2 polish — 2 quick wins shipped + 4 deferred items moved to BACKLOG
- **M-02 NPC name fuzzy match** (turn route) — new `resolveCharacter()` resolver in onFinish · 3-layer ladder: exact → NFKC-normalize lowercase trim → bidirectional substring match。Narrator says「阿明」、DB has「陳家明」→ substring match · disposition + flags now correctly applied。Logged warnings for unresolved + fuzzy-matched cases (CLAUDE.md hard rule #8 path-format drift telemetry)。Applied 喺 disposition merge + arc transition check 兩個 site
- **4-axis disposition init** — `dispositionFromDefault()` (createStoryFromPrompt) + `fork_story_to_playthrough` RPC (Migration 0015) 都 seed 4 standard axes (trust mapped from 6-level enum · romance/respect/fear at 0)。Predictable starting state · Narrator update on any axis 唔再 undefined · UI display 完整
- **Migration 0015 applied** to prod · 3/3 sanity (romance + respect + fear all present in fork RPC source)

### 4 items deferred to pm/BACKLOG.md「Phase 1.5/2 deferred polish」section
- P2-UX-H-05 always_on lorebook demote pathway — needs cron job + scoring algorithm
- Refusal embed flow — scope unclear pending audit clarification
- P2-UX-C-03 Memory Journal UI backend prep — UI tier work (will be picked up by Memory Journal UI in 🟣 tier)
- P2-PERF-C-01 recent turns cache breakpoint reshape — Anthropic prompt cache message structure work · ~1 session + audit

### 🟢 FUNCTION TIER COMPLETE — Phase 5 community + Phase 6 non-money + Phase 1.5/2 polish
- **6 phases done**: Phase 0 地基 · Phase 1 story engine MVP · Phase 1.5 Narrative Integrity · Phase 2 4-layer memory · Phase 3 multi-LLM + credits · Phase 5 community · Phase 6 non-money function · Phase 1.5/2 polish quick wins
- **6 migrations** applied prod (0009-0015 sequential · Phase 5 community → polish)
- **5-cycle audit converged** on Phase 5 (29 → 24 → 17 → 16 → 12 declining finding count · 35 issues caught pre-prod)
- **20 deferred items** tracked in pm/BACKLOG.md across Phase 5 deferred polish + Phase 1.5/2 deferred polish sections
- **TypeScript clean** across all changes
- **Next: 🟣 UI tier** — library polish · Memory Journal UI · locale switcher · Settings i18n · all audit-deferred UX items

## ✅ Earlier — Phase 6 non-money function shipped

### Phase 6 non-money function — adult mode infrastructure live
- **🆕 web/src/components/settings/adult-mode-toggle.tsx** — 3-state UI: (1) age not verified → locked + KYC explainer · (2) verified + off → flippable · (3) verified + on → showing「已開啟」badge。CSAM hard-rule reminder embedded · regardless of toggle state
- **setAdultMode server action** — verifies `is_age_verified` server-side before flipping · DB CHECK constraint + protect trigger are 2nd defense layer (Migration 0002)
- **ModelPicker filters NSFW models** — narratorModels filtered by `(adultModeEnabled || !m.allows_nsfw)` · OpenRouter NSFW model hidden until adult mode on
- **setDefaultModel adult mode gate** — defense-in-depth at action layer · NSFW model setting blocked without adult mode (CLAUDE.md hard rule #5)
- **creation-form.tsx adult button gate** — 「adult」rating button disabled unless `adultModeEnabled` · title attribute explains 「需要喺 Settings 開啟」 · button label changes 「成人 (需 KYC)」→「成人 (18+)」
- **createStoryFromPrompt adult gate** — server action rejects content_rating='adult' without adult_mode_enabled
- **Library content filter** — page fetches user's adult_mode_enabled · applies post-RPC filter `content_rating !== 'adult'` to trending/latest/genre/search results when off · anonymous visitors default to !adult (hidden)
- **Turn route NSFW model gate** — when pt.llm_model.allows_nsfw=true AND user.adult_mode_enabled=false → 403 「adult_mode_required」 with friendly play-client message
- TypeScript clean

### Phase 5 → Phase 6 transition summary
- Phase 5 community function tier completed Session 8 (5-cycle audit converged · 35 issues caught + 14 polish + 20 deferred)
- Phase 6 non-money function shipped Session 8 cont. — pure UI/logic work · 4 file new/edit · 0 migration needed (DB layer already done Migration 0002)
- Next: Phase 1.5/2 audit-deferred polish OR UI tier (function tier 仍剩 1 item · 完晒 entire function tier)

## ✅ Earlier — Phase 5 Wave 2.7 + E2E ready

### Wave 2.7 micro-patch — 2 items closed + Manual E2E checklist + Wave 2.7 audit fixes inline
- **W2.6-CODE-M-01** — Deleted 4-line dead-code downgrade branch in library/page.tsx Stage 2 (logically unreachable inner condition since outer guarantees trending.length >= 8). Behavior unchanged · empty carousel smart-hide handled by render layer.
- **W2.6-INFO-01** — Migrated **20 IDs** Phase 5 deferred polish items into pm/BACKLOG.md「Phase 5 deferred polish」section. 4 sub-buckets: Phase 7 content tier (genre alias gap) · UI polish wave (1-char Latin hint copy, Settings trim, ACTION_BLOCKED craft hint, safety hint flicker, English error strings) · perf sprint (anon ISR) · 技術 debt / defensive hardening (tokenizer combining marks, word-boundary, sanity asymmetry, trigger ordering, defensive guards, etc).
- **🆕 manual-e2e-phase5.html** — Founder-runnable E2E checklist with 6 checks (3 happy + 2 negative + 1 SQL). Standalone HTML with step-by-step actions + expected results + fail handling. Linked from pm-dashboard.html quick-links.

### Wave 2.7 audit (5th cycle) — 12 finding · 0 ship blocker · inline fixes applied
- 0 CRIT + 0 HIGH (after E2E fixes) + 2 MEDIUM resolved + 8 LOW + 2 INFO
- E2E checklist fixes inline applied: Check 6 SQL role context clarified (postgres role · auth.role() returns NULL · trigger fires correctly) · Check 1 logout path documented (/settings or incognito) · Check 4 navigation hint added (返 /library → 繼續玩 carousel → playthrough)
- STATUS.md count fix: 「14 deferred items」→ 「20 IDs」 (actual BACKLOG count)
- Convergence pattern proven at 5 cycles · 29 → 24 → 17 → 16 → 12 declining trend

### Phase 5 timeline 收工 summary
- 17 commits across 2 sessions
- 6 migrations applied (0009 → 0014)
- 5 audit cycles · 21 ship blocker + 14 polish issues caught & fixed pre-prod (35 total)
- 20 deferred items documented in BACKLOG
- Ready for founder manual E2E → Phase 5 真正 closed

## ✅ Earlier — Session 8 cont. — Phase 5 Wave 2.6 audit · 4-cycle convergence holds

### Wave 2.6 audit (4th cycle) — 0 ship blocker · convergence holds
- 16 finding · 0 CRIT + 0 HIGH + 1 MEDIUM (dead-code) + 8 LOW + 7 INFO
- 兩個 agent (Security/Correctness + UX/Cost/Regression) 獨立 reach 同一 conclusion
- Both flag W2.6-CODE-M-01 (library/page.tsx Stage 2 dead-code) + W2.6-INFO-01 (pm/BACKLOG.md stale) as the only actionable Wave 2.7 items
- Both recommend declining 5th cycle · diminishing return signal clear
- See [audit-report-phase5-wave2.6.html](audit-report-phase5-wave2.6.html)

### 4-cycle convergence chart confirms pattern reusable for future phases
```
Wave 1 audit  : 29 finding · 6 blocker
Wave 2 audit  : 24 finding · 5 blocker
Wave 2.5 audit: 17 finding · 0 blocker ← first convergence
Wave 2.6 audit: 16 finding · 0 blocker ← convergence holds
```

## ✅ Just completed (Session 8 cont. — Phase 5 Wave 2.6 micro-patch + convergence)

### Wave 2.6 micro-patch — 6 polish items closed (commit pending)
- **W2.5-UX-M-01** — play-client `if (!res.ok)` 讀 body 一次 at top + key off body?.error per status. Eliminates "body stream already read" leak for non-special-case errors
- **W2.5-PERF-M-02** — Library 2-stage fetch: stage 1 trending+latest, stage 2 genre boards only if multi-board engages. Saves ~36 RPCs at launch
- **W2.5-DOC-M-01** — 1-char search amber hint card「請輸入至少 2 個字」with phrase examples
- **W2.5-UX-L-07** — Drop `trendingCount > 0` from useLaunchFallback → zero trending also routes to single-list fallback
- **W2.5-SEC-L-04** — Migration 0014 adds `new.origin := 'user'` to stories INSERT lock trigger
- **W2.5-UX-L-06** — `display_name?.trim() ||` instead of bare `||` (whitespace-only render fix)
- Sanity verified on prod (origin lock landed) · TypeScript clean

### 3-cycle audit convergence pattern verified (Wave 2.5 audit)
- Wave 1 audit (29 finding · 6 ship blockers) → Wave 1.5 fix
- Wave 2 audit (24 finding · 5 ship blockers) → Wave 2.5 fix
- Wave 2.5 audit (17 finding · 0 ship blockers) → Wave 2.6 polish → **converged**
- 11 launch-day-killing issues caught and fixed before they hit prod
- Pattern proven for future phases: each function ship gets ≥1 audit cycle until 0 ship blockers
- See [pattern_audit_3cycle_convergence](~/.claude/.../memory/) in local memory for reusable discipline

## ✅ Just completed (Session 8 cont. — Phase 5 Wave 2.5)

### Migration 0013 — 5 ship blocker fixes + 4 audit fold-in applied on prod
- **W2-TREND-H-01 (HIGH)** — Trending exploit closed via two layers: (a) `trending_stories` + `stories_by_genre` formulas use `greatest(0, now() - created_at)` clamp; (b) new `stories_lock_server_columns_on_insert` BEFORE INSERT trigger forces `created_at:=now()` · `visibility:='private'` · counter columns to 0/null for non-service-role callers. Browser console INSERT setting future created_at no longer poisons trending.
- **W2-FTS-M-09** — `cjk_bigram_tokenize` strips zero-width chars (U+200B/U+200C/U+200D/U+2060/U+FEFF) before iterating. ZWJ injection bypass closed.
- **W2-FTS-M-10** — Tokenizer changed to bigram-only emission. Single-char CJK queries (`'的'`, `'是'`, `'我'`) return zero results instead of matching all titles. Search noise dramatically reduced. Backfilled all stories.
- **W2-MOD-L-11** — Dead `last_was_cjk` variable removed from tokenizer.

### Code-layer fixes
- **W2-GENRE-C-01 (CRITICAL)** — library/page.tsx GENRE_BOARDS rebuilt with CJK titles + alias arrays (each board has 5-7 variants: 戀愛/戀愛校園/愛情/romance/純愛/言情 etc). New `fetchBoard(aliases)` tries each alias until non-empty. Schema-generator's CJK output now matches the carousels.
- **W2-FILTER-H-02 (HIGH)** — Library page sanitizes `sp.language?.trim() || undefined` (replacing `?? null` which let empty string through). Search form re-submit no longer kills all carousels.
- **W2-UX-H-03 (HIGH)** — play-client adds 400 (`action_blocked`) + 503 (`moderation_misconfigured`) branches. New `ACTION_BLOCKED:` prefix triggers PlayErrorCard amber Shield card with friendly framing. Raw JSON is gone.
- **W2-LAUNCH-H-05 (HIGH)** — Library `useLaunchFallback` boolean: when trending count < 8 AND no genre populated, renders single «公開故事» list instead of mostly-empty multi-board. Auto-engages multi-board once content crosses threshold.
- **W2-PERF-M-06** — Turn route moderate + characters + char_states + recent_turns now `Promise.all` parallel. Saves ~500-2000ms per successful turn.
- **W2-UX-M-07** — Play-client shows «內容審核 + AI 思考中...» indicator with Shield icon after 600ms of `streaming && !streamText` window. Consistent with Comment/Rate/Report panels.
- **W2-UI-L-12** — Story detail page renders `display_name || user_id.slice(0,8) + '…'` fallback on comments + ratings. Wave 2 profile join finally surfaces.
- **W2-MOD-M-07** — Moderation wrapper retry comment corrected: actual worst case ~11.5s (or ~19s with Retry-After upper bound), not the misleading ~5.5s.

### TypeScript clean (npx tsc --noEmit exit 0) · Sanity 6/6 pass on prod

## ✅ Just completed (Session 8 cont. — Phase 5 Wave 2)

### Migration 0012 — multi-board library + CJK FTS + audit polish
- **P5-LOGIC-H-03 FTS CJK** — new `cjk_bigram_tokenize()` PL/pgSQL function emits sliding 2-char bigrams for CJK + lowercase tokens for Latin. `stories_update_search_text` trigger + `search_stories` RPC both use it symmetrically. Backfilled existing rows. Roundtrip verified: `'校園戀愛'` query matches `'TW 大學校園戀愛故事'` ✓ · `'古惑仔'` matches `'1980 年代香港古惑仔故事'` ✓
- **P5-LOGIC-H-02 trending cold-start** — `trending_stories` RPC adds newcomer boost `exp(-age_days / 3)`. New 0-play story scores ~1.0 at hour 0 · ~0.5 at day 3 · popularity dominates after ~10 days
- **New RPCs `latest_stories` + `stories_by_genre`** — separate carousels for 🆕 最新 + 6 genre boards
- **W1-REGRESS-H-05** — `story_comments_lock_immutable_columns` RAISE EXCEPTION instead of silent revert (Phase 5 UI tier zombie-success bug closed)
- **W1-RLS-M-04** — `story_ratings_own_update` policy adds visibility=public for INSERT/UPDATE consistency

### Library page rewrite (`/library`)
- Multi-board layout: 🔥 熱門 · 🆕 最新 · 💕 戀愛 · ⚔️ 冒險 · 🎓 校園 · 🔮 奇幻 · 🏀 運動 · 🕵️ 懸疑
- Smart-hide empty genre carousels (only show when story exists)
- 我嘅故事 + 繼續玩 sections on top for returning users
- Search overlay mode when `?q=` URL param (uses CJK-aware search_stories RPC)
- New `StoryCarousel` shared component
- Parallel fetch of all 8 boards via Promise.all for SSR speed

### Audit fold-ins
- **W1-MOD-H-03** Turn route user action moderation — moderateText before Director pipeline · failClosed:true · 503 deployment error mapping
- **W1-UX-H-01** Loading hint — after 800ms pending, button text becomes "AI 審核中..." with Shield icon (Rate / Comment / Report all 3)
- **W1-MOD-M-05/M-08** reportContent details moderation — failClosed:true · block → null fallback (file report without abuse payload)
- **W1-MOD-M-02** Moderation wrapper Unicode NFKC normalize + zero-width strip (U+200B-U+200D, U+2060, U+FEFF) + combining marks strip (U+0300-U+036F Zalgo defense)
- **W1-INFO-14** OpenAI 429/5xx retry with exponential backoff (500ms/2s) + Retry-After header parsing
- **W1-UX-L-11** Report success uses inline emerald banner instead of alert()
- **profiles join in comments + ratings** — `display_name` + `avatar_url` joined via FK; UI can render real names (next UI tier picks up)

### TypeScript clean · 8/8 prod sanity pass · 7 commits total since Phase 5 ship

## ✅ Just completed (Session 8 cont. — Phase 5 Wave 1.5)

### Migration 0011 — 6 ship blocker fixes applied on prod
- **W1-MOD-C-01 (CRIT) CSAM bypass via direct browser INSERT** — REVOKE INSERT/UPDATE on story_comments + story_ratings from authenticated + anon · 3 SECURITY DEFINER RPCs granted to service_role only · action layer creates service-role client to call (browser can't, no JWT)
- **W1-AGG-H-02 rating UPDATE story_id swap** — aggregate trigger recomputes BOTH sides when story_id changes · belt-and-suspenders `story_ratings_lock_immutable_columns` BEFORE UPDATE trigger
- **W1-RLS-H-01 post-publish CSAM title mutation** — `stories_lock_content_columns` BEFORE UPDATE trigger locks title/description/prompt_seed/story_bible/opening_narrative/state_schema/tags/language/content_rating/genre/origin. visibility / counters / cover_image_url / updated_at remain mutable so publishStory still works
- **W1-MOD-C-02 fail-open on missing key** — `ModerationConfigError` always throws (deployment misconfig surfaces loudly) · 3 actions pass `failClosed:true` (transient API errors block) · OPENAI_API_KEY missing now hard-fails
- **W1-FP-H-03 sexual/minors 0.15 floor too aggressive** — raised to 0.5 (TW 校園戀愛 false-positive resolved)
- **W1-FP-H-04 general violence blocks 古惑仔** — removed from SFW_ADDITIONAL_BLOCK · keep violence/graphic in HARD with 0.6 floor
- **W1-FP-M-09 threatening categories block villain dialogue** — moved out of HARD_BLOCK · added 0.7 score floor (boolean flag still triggers genuine abuse)
- **W1-COST-C-01 moderation before credit check** — reorder: auth → Promise.all(balance + tier + moderation) → schema-gen · broke users fail fast
- **W1-COST-H-02 10s timeout** — 10s → 3s · worst-case story create ~63s instead of ~70s
- **New file**: `web/src/lib/supabase/service-role.ts` (service-role client helper)
- 8/8 sanity pass on prod (oivhvdfjmthydxqpcncp via Management API)
- TypeScript clean (npx tsc --noEmit exit 0)

## ✅ Just completed (Session 8 cont. — Phase 5 Wave 1)

### Migration 0010 — 4 SHOWSTOPPER fixes applied on prod
- **P5-RACE-C-01 (play_count inflation)** — `playthroughs_decrement_play_count` AFTER DELETE trigger mirrors INSERT bump with same owner-skip logic + `greatest(... - 1, 0)` underflow guard
- **P5-SEC-C-02 (owner self-rating)** — `story_ratings_own_insert` + `story_ratings_own_update` policies gained `s.owner_id <> auth.uid()` guard. Self-rating now RLS-rejected
- **P5-SEC-H-02 (comment UPDATE column-wide open)** — new `story_comments_lock_immutable_columns` BEFORE UPDATE trigger reverts changes to body / parent_id / story_id / user_id / created_at / un-delete. Only false→true on `deleted` permitted for end users. Service role bypasses for admin moderation
- **P5-LOGIC-H-04 (report spam)** — UNIQUE index `moderation_flags_one_per_reporter_content` on `(reporter_id, content_type, content_id)` partial WHERE reporter_id not null

### OpenAI Moderation API wired into 3 user-input sites (CLAUDE.md hard rule #6)
- **New `web/src/lib/moderation/openai-moderation.ts`** — fetch-based wrapper for `omni-moderation-latest` model · 13 categories · HARD_BLOCK list (csam, hate/threatening, violence/graphic, illicit/violent, self-harm/intent, harassment/threatening) + SFW additional list (sexual, violence, self-harm) · score-floor recall boost for sexual/minors (0.15) and violence/graphic (0.6) · 繁中 verdict messages · 10s timeout · fail-open default
- **createStoryFromPrompt** — moderates `prompt + protagonist_hint` BEFORE burning ~$0.20 on schema-gen
- **upsertComment** — moderates body, content-rating-aware via story lookup
- **rateStory** — moderates `review_text` if present + defense-in-depth owner check before upsert
- **reportContent** — 23505 unique violation now maps to friendly "you already reported this" message

### TypeScript: clean (npx tsc --noEmit exit 0)
### Sanity SQL: 5/5 verify pass on prod via Management API

## ✅ Recently completed (Session 6 — Phase 2 ship + audit + 3 fix waves)

## ✅ Recently completed (Session 6 — Phase 2 ship + audit + 3 fix waves)

### Phase 2 — 4-layer Memory shipped (commit 0f650c7)
- **Migration 0004** — `turn_embeddings` · `memory_summaries` · `lorebook_entries` + HNSW indexes + RLS + 3 match RPCs
- **`embed.ts`** — OpenAI text-embedding-3-small wrapper (single + batch + safe)
- **`memory/retriever.ts`** — embed query + 3 parallel RPCs + 1 SELECT, returns pre-formatted context for Director + Narrator
- **`memory/summarizer.ts`** — every-20-turn Haiku rollup with embedding (idempotent against existing summaries)
- **`memory/lorebook.ts`** — per-turn Haiku entity extraction (character/place/item/event/concept) with upsert + embedding
- **Turn route wired** — retriever pre-Director · user turn pre-persisted with reused query embedding · onFinish fires AI turn embed + summarizer + lorebook
- ~$0.023/turn (memory adds ~35% on Narrator baseline, NOT 2% — Phase 4 pricing math needs update)

### Phase 2 Deep Audit (3 parallel agents · 43 findings)
- 3 dimension audit: Correctness · Performance/Cost · Player UX
- 7 Critical, 17 High, 14 Medium, 5 Low
- `audit-report-phase2-deep.html` written + linked in dashboard
- **🛑 SHOWSTOPPER discovered**: Vercel kills `void (async () => ...)` fire-and-forget when stream ends → Phase 2 tier 2/3/4 silently non-functional in prod

### Phase 2 Wave 1 — SHOWSTOPPER + critical (commit ab51c34)
- **P2-PERF-C-02 SHOWSTOPPER**: `void (async () => {...})` → `after()` from `next/server` for all 3 fire-and-forget sites. Phase 2 background path NOW actually runs in prod
- **Migration 0005** — UNIQUE on memory_summaries(playthrough_id, turn_range) · UNIQUE btrim() on lorebook for whitespace dedup · vector dimension CHECK constraint · match RPCs gain `p_min_similarity` param + overprovision for exclusions
- **P2-LOGIC-C-01**: lorebook description merge changed from "longer wins" to "recency wins" — text + embedding now stay in sync
- **P2-UX-C-02 + LOGIC-M-10**: similarity floor per source (RAG 0.5 · lorebook 0.45 · summaries 0.55) — empty result beats noise
- **Retriever**: always_on lorebook `.limit(8)` + order by `updated_at` desc (partial P2-PERF-H-07 fix)
- **Lorebook**: client-side trim before dedup + protagonist compare

### Phase 2 Wave 2 — Quality + cost (commit 7a716c7)
- **P2-PERF-H-05**: OpenAI 429 retry with exponential backoff (500ms→2s→8s, parses Retry-After if present)
- **P2-PERF-H-06**: Lorebook batched `embedTexts` (5 → 1 API call · ~80% RPM reduction)
- **P2-UX-H-04 + H-09**: Summarizer prompt allows emotional texture (1-2 weighted details/paragraph, 1 quoted line OK, 1-4 sentences) + locale branch (zh-Hant/zh-Hans/en)
- **P2-UX-H-09**: Lorebook extractor also locale-branched
- **P2-UX-H-08**: Director system prompt teaches memory use (earned exception relax, arc coherence, commitment callback)

### Phase 2 Wave 3 — Player visibility backend (commit d9f6c8d)
- **P2-UX-C-01**: First summary at turn 10 (not 20) — player feels memory engage within first session
- **P2-UX-H-06**: RAG `truncateToSentence` keeps RESOLUTION (last sentences) instead of cutting mid-sentence at openings/conflicts
- **P2-UX-M-10**: Stronger anti-quote header on memory block + matching NARRATOR_RULES line
- **P2-UX-L-14**: Top similarity score per source logged in turn telemetry

### 18 of 43 Phase 2 audit findings fixed across 3 waves. Deferred:
- P2-UX-C-03 Memory Journal UI (UX work, separate session)
- P2-UX-H-05 always_on demote pathway (needs cron job)
- P2-PERF-C-01 recent turns cache breakpoint (message reshape)
- P2-PERF-M-09 dimensions 1024 (destructive — user decision)
- P2-UX-M-12 cost capture for Phase 4 billing
- Several Medium/Low logic edge cases

## ✅ Earlier — Session 5 (Foundation Deep Audit + 7-wave hardening)

### Foundation Deep Audit (5 parallel agents)
- 5 dimension audit (Security · AI Pipeline · State+Render · DB · UX) — 95 finding 合計
- Critical: 12 · High: 35 · Medium: 33 · Low: 14
- `audit-report-foundation-deep.html` 寫入 dashboard quick-link
- 揪出 3 個 silent corruption pattern：RLS 冇 with check / disposition race / prompt cache embed dynamic data

### Wave 1 — Schema + DSL refinements (commit 69cd185)
- state-schema.ts superRefine: bar/meter/ring/enum/relationship default 範圍驗證
- INTERNAL_STATE_KEY_PREFIX exported
- state-delta.ts: coerceNumber reject Infinity/NaN · inventory push validate item shape · relationship_graph clamp + reject array
- bible.ts story_arc contiguous-from-1 check
- arc-dsl.ts compare() undefined→0 for ALL ops (not just >=/>/==)
- deriveCurrentAct floor + cap guards
- director.ts userAction prompt-injection sandbox + tag escape
- director schema affected_character empty → "故事規則" fallback

### Wave 2 — AI pipeline hardening (commit c98f633)
- schema-generator.ts: REMOVED `"use server"` (was unauth $0.20/call attack vector!)
- providers.ts: OpenRouter now uses createOpenAI (was createAnthropic → would 404 in Phase 6)
- New `getProviderModel(modelId)` dispatcher — turn route routes to right SDK
- Added @ai-sdk/openai dep
- turn-runner extract* helpers: .find → .filter + merge across calls
- buildDynamicSystemPrompt strips __-prefix keys from LLM view
- isLLMRefusal regex tightened (no longer false-positive on 對不起 NPC dialogue)
- refusalFallbackNarrative locale-aware (zh-Hant/zh-Hans/en)
- schema-generator + director: 1s backoff before retry, skip 4xx
- Dropped onFinish rate-limit clobber (was racy)

### Wave 3 — Auth + dispatcher + error handling (commit 4b42c39)
- Magic link emailRedirectTo: dropped headers.origin → only NEXT_PUBLIC_SITE_URL
- OTP errors normalized to "otp_failed" (no enumeration leak)
- auth/callback: safeRelativeNext rejects //evil.com / javascript: open-redirect
- state-panel: safeNumber/safeString prevent NaN / "null" rendering
- Dispatcher default arm: unknown render_hint shows "(未支援)" + warn-once
- Story creation + turn route: generic 繁中 error messages, raw details logged server-side
- play/page.tsx + turn/route.ts: Zod parse at boundary instead of `as Schema` cast

### Wave 4 — Migration 0002 RLS hardening (commit 331fcdc — file only, ⚠️ NOT applied)
- All write policies get `with check` clause (SEC-C-01 cross-user data write)
- profiles INSERT/DELETE policies + with check on UPDATE (SEC-H-01)
- adult_mode_enabled CHECK constraint + sensitive-column protection trigger (SEC-H-02)
- handle_new_user EXCEPTION block — idempotent + anon-safe (DB-C-02)
- 3 new indexes (official-visible / turns-by-role / playthroughs-by-story-recent)
- UNIQUE story_characters(story_id, lower(name))
- pgvector extension
- turns + pcs policies split (no DELETE for users — append-only ledger)
- Dropped redundant stories_official_read + unlisted from public_read

### Wave 5 — Atomic RPCs + pre-persist user turn (commit 331fcdc SQL + b212875 code)
- Migration 0003 with `acquire_next_turn_pair` + `apply_turn_npc_changes` RPCs (⚠️ NOT applied)
- Turn route refactored to use RPCs with GRACEFUL FALLBACK (works whether migration applied or not)
- User turn pre-persisted before stream (AI-H-04 — durable input even if stream aborts)
- Disposition + flag changes grouped by character → single atomic RPC per NPC

### Wave 6 — Prompt cache split + token capture (commit f14377e)
- characterCardStaticTemplate (no disposition/flags) vs characterDynamicState (the dynamic bits)
- buildStableSystemPrompt: only static cached prefix
- buildDynamicSystemPrompt: dynamic NPC state + game state (not cached)
- Cost: cache hit on long playthroughs should jump from ~0% → >90%
- Director returns DirectorResult {verdict, usage} — turn route persists director tokens
- Schema-gen logs total token usage + approx $ cost per story

### Wave 7 — TypeScript types regen + prod verify (commit 18f1acf)
- npm run db:types — generates types via `supabase gen types typescript`
- types.ts went 32 → 505 lines, 5 tables left `any` land
- Confirmed Migration 0001 IS deployed to prod ref `oivhvdfjmthydxqpcncp`
  (audit's SEC-C-03 was false alarm — MCP was on wrong project)

## ✅ Earlier — Session 4 (Phase 1.5.x ship + C-01 hotfix)

### Phase 1.5.1 — Director Model
- `lib/ai/director.ts` — Haiku 4.5 cheap pre-Narrator check with prompt caching
- 4-variant verdict discriminated union (allow / reject / allow_with_constraint / require_skill_check)
- Verdict → Narrator instruction translator with `[INTERNAL CONTEXT]` prefix (L-12 fix)
- 1-retry wrapper via `callDirectorOnce` → `callDirector`

### Phase 1.5.2 — Skill Check engine
- Pure dice roller `lib/ai/skill-check.ts` (no LLM call) — d20 + skill_value vs difficulty
- Outcome map: critical_success / success / failure / critical_failure
- Seed stored on turn row for replay/audit
- `extractSkillValue` falls back to median of numeric fields (D-01 fix)

### Phase 1.5.3 — Arc DSL + NPC disposition + Earned Exceptions
- Arc DSL boolean evaluator `lib/ai/arc-dsl.ts` — supports >= <= > < == != + AND/OR
- 3 Narrator tools registered: `update_state`, `update_character_disposition`, `set_permanent_flag`
- `playthrough_character_states` disposition jsonb auto-updated per turn
- `permanent_flags` registry for earned red_line exceptions (e.g., rescued_linsiya_act2)
- `__act` field stored in state, monotonic advance via `deriveCurrentAct`
- `isLLMRefusal` + `refusalFallbackNarrative` in turn-runner
- audit-report-phase1.5.3.html — found 1 critical (C-01), 4 medium (M-02..M-05)

### Phase 1.5.3 C-01 hotfix — Arc DSL path mismatch
- **Bug**: schema-generator BIBLE_SYSTEM prompt taught LLM `characters.X.disposition.Y` + `interactions.X` paths, but parser only accepted `characters.X.Y` — every Arc transition silently failed
- **Fix**: arc-dsl.ts resolvePath accepts BOTH 3-part and 4-part character paths; interactions.X returns 0 with warning; evaluateLeaf logs undefined-path warnings for future drift visibility
- **Fix**: schema-generator BIBLE_SYSTEM prompt now explicitly lists supported path formats + concrete examples + bans interactions.X / parentheses
- Shipped commit d2292e3 → Vercel build 27s → live on prod

## ✅ Earlier — Session 3 (Phase 1 build)

### Phase 1 build (Session 3 main work)
- 4 Zod schemas (state, bible 3-tier, character, state_delta)
- 9 atomic renderers + DynamicStatePanel dispatcher
- /dev/state-demo (3 schemas side-by-side)
- AI SDK + Anthropic + OpenRouter providers + model catalog
- Schema generator (Claude Sonnet 4.6 structured output)
- Story creation wizard /stories/new + Server Action
- Streaming turn endpoint /api/playthroughs/[id]/turn
- Play screen /play/[id] with state panel refresh
- audit-report-phase1.html — 26 finding, 4 MED fixed (M1-M4)

### Phase 1 critical fixes (Session 3 — multiple iterations)
- **Schema optionals → 0** (Anthropic 24-optional limit fix)
- **SDK baseURL bug** — `@ai-sdk/anthropic` v3.0.78 default URL missing `/v1` → 404 on all calls. Fixed with explicit createAnthropic config.
- **Schema grammar too large** — even after optionals removed, full combined schema blew Anthropic's grammar size limit. **Split into 4 parallel LLM calls** (meta+opening, state_schema, bible, characters). Total latency ~35-50s (max of 4) vs sequential ~95s.
- **Narrative hook rules** — opening + turn endings must trigger player reaction (NPC speaks/acts, env change, sensory tension). Banned static descriptions, list options, direct "你想點做?" questions.

### Phase 0.10 final
- Guest mode (Supabase anonymous sign-in) — bypasses PKCE magic link cross-browser issue. One-click in.
- Audit reports:
  - audit-report.html — Phase 0 (26 finding, 5 fixed)
  - audit-report-phase1.html — Phase 1 code audit (26 finding, 4 fixed)
  - audit-report-phase1-ux.html — Phase 1 UX + logic audit (18 finding, 2 critical UX deferred, 10 backend defer to A/B/C)

### E2E verified on prod
- User created story via Guest mode → schema generator produced full story package → /play/[id] loaded with opening + state panel
- Discovered narrative quality issue (opening ending was static description); fixed with hook rules
- User confirmed AI now ends with NPC trigger that demands reaction

---

## 📦 Phase 1 — Code complete (10/10 sub-tasks + multiple iterations)

All sub-tasks done. UI/UX polish (UX-01 / UX-02 / UX-04) parked — user decision is backend first.

| Task | Status |
|---|---|
| 1.1 Zod schemas | ✅ Iterated 3× (optionals → 0, then redesign for grammar limit) |
| 1.2 9 render components | ✅ Decoupled from schema (heuristics for colors/format hints) |
| 1.3 DynamicStatePanel | ✅ |
| 1.4 Demo route | ✅ /dev/state-demo |
| 1.5 Anthropic SDK setup | ✅ With baseURL fix |
| 1.6 Schema generator | ✅ Split into 4 parallel calls + hook rules in META_SYSTEM |
| 1.7 Creation wizard | ✅ /stories/new with cleanup-on-failure |
| 1.8 Turn endpoint | ✅ Streaming + tool calling + state delta apply |
| 1.9 Play screen | ✅ |
| 1.10 E2E verify | ✅ Via Guest mode on prod |

---

## 📓 Session Log

### Session 11 (Pre-launch Phase 0 — tier abstraction + 5-wave audit) — 2026-05-25

**Major outcomes**:
- Pivot from 10-model direct selection → 4-tier abstraction (Standard / Pro / Pro Max / Adult)
- 4 migrations applied prod (0019-0022) · 5-wave audit converged · 5 ship blockers caught pre-prod
- 3-layer defense pattern shipped (DB trigger + code allowlist + server action validation)
- Founder feedback validated the direction: "畀咁多公司 LLM 用家去選擇 vs change to standard / pro" — pivot decision lock

**Key learnings**:
- **Scope creep in audit waves = wrong fix direction** — Waves 1-3 each applied scoped patch which next wave audit broke through. Wave 4 was the architectural root-cause fix (DB trigger replaces all bypasses). Lesson: when audit catches related issue 3 waves in a row, root-cause is needed, not another patch.
- **User intuition saves us — "點解你整極都仲有錯誤嘅"** caught wave 4-5 still leaving residual unknown-model attack surface · final strict-reject only happened because founder pushed back
- **Locked-at-creation fields need column-level protection** — RLS `with check` alone insufficient because it permits the column write even if min_tier mismatch. BEFORE UPDATE trigger is the proper enforcement (CLAUDE.md hard rule #15 corollary)
- **MCP project namespacing is critical** — Initial config pointed at CLS Studio (epimog...) with --read-only · split into supabase-cls (RO) + supabase-story-engine (RW) to prevent cross-project pollution

**Decisions effective**:
- User picks tier, internal routing handles model selection (matches ChatGPT/Claude UX)
- Director model locked globally to Claude Haiku 4.5 (not user-selectable)
- Model selection locked at playthrough creation (NOT switchable mid-game · hard rule #15 corollary)
- 3-layer defense pattern is the standard for any locked-at-creation field going forward

**Next session opening**:
- 🟢 Phase 1 — MemPalace 4-layer memory architecture + NPC Level 2 dynamic state
- Migration 0023 hierarchical namespace (Wings/Rooms/Drawers)
- Director output schema extension (rooms_to_load + npc_updates)
- Hybrid retrieval (semantic + keyword + temporal boosting)
- Migration knowledge graph (mem_nodes + mem_edges)

### Session 6 (Phase 2 ship + audit + 3 fix waves) — 2026-05-22

**Major outcomes**:
- Phase 2 4-layer long-term memory shipped end-to-end (5 new files, 1 migration, 1 turn route refactor)
- Phase 2 Deep Audit done — 3 parallel agents catalogued 43 findings
- 🛑 SHOWSTOPPER discovered + immediately fixed — Vercel kills `void (async)` fire-and-forget, Phase 2 was silently broken in prod
- 3 fix waves shipped — 18 of 43 findings closed
- 5 migrations now committed (0001-0005); 4 of 5 still need user to apply

**Key learnings**:
- **Vercel kills `void (async)` background tasks** — must use `after()` from `next/server` or Vercel's `waitUntil` from `@vercel/functions`. The pattern works locally + in long-running Node servers but fails silently in serverless. Universal hazard for any Next.js app using fire-and-forget post-stream work.
- **Top-K retrieval without similarity threshold = noise by design** — players experience "AI keeps referencing walk-on NPCs" as broken AI, but it's the by-product of `ORDER BY similarity LIMIT K` always returning K rows even when all are irrelevant. Per-source thresholds (0.45/0.5/0.55) immediately fix it.
- **Memory differentiator is unfalsifiable without UI** — even if memory works PERFECTLY backend-side, players can't verify "AI 真係記得" unless they see lorebook + recall surfaced. NovelAI's lorebook UI is their #1 retention driver because users can SEE the AI's notebook on their story.
- **Cost reality check**: Phase 2 memory adds ~35% overhead on Narrator-only baseline, not 2% as originally estimated. Real per-turn ~$0.023. Subscription pricing math needs revisit before Phase 3.

**Decisions effective**:
- All fire-and-forget in turn route uses `after()` going forward (project-wide rule)
- Default similarity floors codified per source: summaries 0.55, RAG 0.5, lorebook 0.45
- First summary at turn 10 (not 20) — memory engagement during the player's hook window
- Lorebook description merge: recency wins (not longer wins)

**Next session opening**:
- User applies 4 pending migrations to prod
- E2E test 30+ turn playthrough — verify summaries fire at turn 10, lorebook populates, RAG retrieves
- Then Phase 3 (Multi-LLM + credits) OR Memory Journal UI (P2-UX-C-03)

### Session 5 (Foundation Deep Audit + 7-wave hardening) — 2026-05-22

**Major outcomes**:
- Foundation Deep Audit (5 parallel agents) — 95 findings catalogued in HTML
- 7 hardening waves shipped — 45+ findings fixed across schemas, AI pipeline, auth, RLS, atomic RPCs, prompt cache, TS types
- 2 migration files written (0002 RLS hardening + 0003 atomic RPCs) — committed but NOT YET APPLIED to prod
- All Vercel deploys clean (each wave's commit deployed within 30s)
- Code uses resilient fallback pattern so RPCs work whether migration applied or not

**Key learnings**:
- **Multi-agent parallel audit catches what serial audits miss**: 5 agent dimensions × 95 findings dwarfs anything a single agent / sequential pass would surface. The cost of running 5 in parallel is small vs. the visibility into systemic patterns.
- **Resilient deploy pattern enables independent migration timing**: Code calls new RPC with try/catch → on RPC-doesn't-exist error, falls back to old non-atomic path. Logs warning but doesn't break prod. Once migration lands, RPC path activates automatically. Decouples code deploy from migration apply.
- **Prompt cache is fragile to dynamic data in "stable" prefix**: Every byte change → cache miss. The static/dynamic split for character cards is a pattern worth replicating any time cached content has fast-changing sub-fields. Cost impact ~10x.
- **Server Action accidental-public-export is a real attack vector**: `"use server"` directive at the top of a "library" file made the whole module exposed to anonymous POST. Discovered during security agent's review. Worth checking all such directives in any Next.js codebase.

**Decisions effective (worth ADR if not yet)**:
- Always use static / dynamic prompt split for any LLM call with prompt caching
- Always use Zod parse at the DB-to-domain boundary instead of cast
- All write policies need `with check`, period

**Next session opening**:
- User applies migrations 0002 + 0003 to prod
- Confirm prod RPCs work (server logs lose the "RPC unavailable" warning)
- Open Phase 2 (pgvector + embedding + rolling summary + RAG + lorebook) OR address Foundation Audit UX-C-01..04 critical findings

### Session 4 (Phase 1.5.x ship + C-01 hotfix) — 2026-05-21

**Major outcomes**:
- Phase 1.5.1 / 1.5.2 / 1.5.3 all functionally complete on prod
- C-01 critical Arc DSL bug found via audit → fixed → deployed (commit d2292e3)
- Phase 1.5.3 audit report produced (audit-report-phase1.5.3.html): 1 critical + 4 medium

**Key learnings**:
- **Audit-before-next-phase discipline pays off**: Deep audit of Phase 1.5.3 caught C-01 before user noticed broken Arc progression in real playthroughs. Pattern: ship → audit → fix critical → next phase.
- **Path-format drift between prompt and parser is a recurring class of bug**: LLM was taught one format, parser expected another, silently failed at eval time. Mitigation: log undefined-path resolutions as warnings + accept both formats when reasonable.

**Next session opening**:
- E2E test: create a story, play enough turns to trigger Act 1 → Act 2 transition, confirm it advances
- Then either polish Phase 1.5.3 mediums (M-02..M-05) or jump to Phase 2 Memory

### Session 3 — 2026-05-21

**Major outcomes**:
- Phase 1 functionally complete on prod
- 2 critical bugs found + fixed (baseURL, schema grammar limit via 4-call split)
- 1 critical narrative quality fix (hook rules)
- 3 audit reports produced (Phase 0 + Phase 1 code + Phase 1 UX)
- User decision: backend polish next (Option A → B → C), UX defer

**Key learnings**:
- **User's pattern-recognition saves us repeatedly**: Caught「秒速 error」suggesting non-LLM issue → led to discovery of SDK baseURL bug. Without their push-back I would've shipped wrong fix.
- **Anthropic has 2 separate limits on structured output schemas**: (a) ≤24 optional params, (b) compiled grammar size. Both must be respected. Splitting into parallel sub-calls is the architectural solution.
- **Quality of LLM output is dominated by system prompt clarity**: Vague「留 emergence 空間」produced static endings. Explicit「最後 1-2 句必須係 NPC 講嘢／NPC 動作／環境事件／sensory tension」+ ❌ banned patterns + examples produced strong reaction-triggering endings.
- **@ai-sdk/anthropic v3.0.78 has baseURL bug** — must use `createAnthropic({ baseURL: 'https://api.anthropic.com/v1' })` explicitly. Default `anthropic` import hits broken /messages endpoint.

**Decisions (effective ADRs but not formal — yet)**:
- Schema generation = 4 parallel LLM calls (not 1 combined) — architectural decision worth ADR-016 entry
- LLM tool-mode schemas = no optionals + no defaults (move polish to renderer heuristics)
- Narrative endings strict rule (hook trigger required)

**Next session opening**:
- Confirm A → B → C order still preferred
- Execute Option A: Phase 1 backend polish (4 items)
