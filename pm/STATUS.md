# STATUS — Story Engine

> 單一 source of truth。Claude 每次重要進展後更新呢個 file。
> 開新 session 第一件事：read 呢個 file，知道而家喺邊。

---

## 🎯 而家狀態

**Phase**: **Phase 1 functionally complete · Backend polish (Option A) next**
**Live URL**: https://story-engine-drab.vercel.app
**Last updated**: 2026-05-21 (Session 3 — extensive Phase 1 iteration)

## 📍 What's next (decided this session)

**Order: A → B → C** (user explicit decision to focus backend first, UX later):

| | Plan item | Time | Why this order |
|---|---|---|---|
| 🥇 | **Option A: Phase 1 polish backend** (L-15 prompt caching, L-06 rate limit, L-07 partial-failure retry, L-08 LLM refusal fallback) | ~1 session | Prompt caching = 1-hour change, 90% input cost save. Rate limit / retry / refusal = stability before Phase 1.5 |
| 🥈 | **Option B: Phase 1.5 — Narrative Integrity** (Director Model, Skill Check, Earned Exceptions, Arc DSL, NPC disposition auto-update) | ~2 sessions | Core differentiator (ADR-006/015). Each turn quality jumps. |
| 🥉 | **Option C: Phase 2 — Memory** (pgvector, rolling summary, RAG, lorebook) | ~2 sessions | Long-play retention. Defer till real long-play user data exists. |

UI/UX polish (UX-01 progress feedback, UX-02 inline state delta, UX-04 library list) deferred — user explicitly chose backend focus.

## 🚧 Blockers

**冇** — Guest mode unblocks user access. Phase 1 code functional on prod.

## ✅ Recently completed (Session 3 — extensive iteration)

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

### Session 3 (most recent — extensive iteration) — 2026-05-21

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
