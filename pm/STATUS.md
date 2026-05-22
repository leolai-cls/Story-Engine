# STATUS — Story Engine

> 單一 source of truth。Claude 每次重要進展後更新呢個 file。
> 開新 session 第一件事：read 呢個 file，知道而家喺邊。

---

## 🎯 而家狀態

**Phase**: **Phase 5 Wave 1 SHOWSTOPPERS 全部修咗 ✅ · Migration 0010 applied + 5/5 sanity pass · 落 Wave 2（multi-board library + FTS 中文 + trending cold-start）**
**Live URL**: https://story-engine-drab.vercel.app
**Last updated**: 2026-05-22 (Session 8 cont. — Wave 1 closed · Multi-board library next)

## 🎯 Founder priority rule（鎖死）

**Function → UI → Money**。Phase number 唔等於 priority — 按下面 tier 排：

- 🟢 **FUNCTION（先做晒）**：Phase 5 Community · Phase 1.5/2 audit deferred polish · Phase 6 non-money bits · Phase 7 content
- 🟣 **UI（function 完之後）**：Library / Memory Journal / Locale switcher / Settings i18n / audit deferred UX
- 🟡 **MONEY（最後）**：Phase 4 Stripe · Phase 6 KYC · Phase 3 deferred items (refund saga / OpenRouter pricing)

## 📍 What's next（按 function-first priority）

| 排 | Plan item | Tier | Time | Why |
|---|---|---|---|---|
| 🥇 | **Phase 5 Wave 2 — Multi-board library + 中文搜尋 + cold-start** — Genre carousels（熱門/最新/戀愛/冒險/校園/奇幻/運動/懸疑/編輯精選）· FTS Chinese bigram tokenization · trending cold-start boost (newcomer term) · fork null check · adult tier gate · profiles.display_name join in comments · smart-hide empty genre boards | 🟢 FUNCTION | ~1 session | Solves discovery + HK/TW market #1 search + community bootstrap dead-end 一氣呵成 |
| 🥈 | **Phase 1.5/2 polish** — NPC name fuzzy match · 4-axis disposition init · always_on demote · refusal embed flow · audit deferred | 🟢 FUNCTION | ~1 session | Audit backlog cleanup |
| 🥉 | **Phase 6 function bits** — adult mode toggle · content rating filter · provider gating（唔包 KYC） | 🟢 FUNCTION | ~1 session | Adult flow narrative gating |
| 4 | **Phase 5 Wave 3 polish** — parent_id RLS · rating row-lock · depth cap · private FTS opt-out · moderation content_id check · unlisted decision | 🟢 FUNCTION | ~30 分鐘 | Defense in depth |
| 5 | **Phase 7 content** — Founder + Claude 寫 5 條 launch-ready 官方故事（亦填 multi-board library） | 🟢 FUNCTION | 多 session slow-burn | 官方故事支撐 public launch + 填空蕩 genre 榜 |
| ↓ | _function 完晒_ |  |  |  |
| 6 | **UI design wave** — Library page polish · Memory Journal · Locale switcher · Settings i18n · 全部 UX-C-01..04 + audit deferred UX | 🟣 UI | ~2 sessions | 玩家可見嘅嘢 |
| ↓ | _UI 完晒_ |  |  |  |
| 7 | **Phase 4 Stripe + Phase 6 KYC + Phase 3 deferred** | 🟡 MONEY | ~2 sessions | 收錢 |

## 🚧 Blockers

**冇 launch blocker**。4 個 Phase 5 SHOWSTOPPERS 全部修咗（Migration 0010 applied · 5/5 sanity pass）。Wave 2 multi-board library 唔係 launch blocker — 係 discovery + 中文 search UX 提升。可以照計劃進 Wave 2。

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

### Session 6 (most recent — Phase 2 ship + audit + 3 fix waves) — 2026-05-22

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
