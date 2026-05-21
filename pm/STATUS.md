# STATUS — Story Engine

> 單一 source of truth。Claude 每次重要進展後更新呢個 file。
> 開新 session 第一件事：read 呢個 file，知道而家喺邊。

---

## 🎯 而家狀態

**Phase**: **Phase 1.5.3 done + C-01 hotfix shipped · Phase 2 (Memory) next**
**Live URL**: https://story-engine-drab.vercel.app
**Last updated**: 2026-05-21 (Session 4 — A → B done + C-01 Arc DSL hotfix)

## 📍 What's next

**Option A (polish) ✅ done · Option B (Phase 1.5 Narrative Integrity) ✅ done · Option C (Phase 2 Memory) is next**

| | Plan item | Time | Why this order |
|---|---|---|---|
| 🥇 | **Phase 1.5.3 medium follow-ups** (M-02 NPC name fuzzy match, M-03 init all 4 disposition axes, M-04 stream act-advance toast, M-05 earned-exception consistency testing) | ~1 session | Polish before Phase 2 amplifies prompt cost — fix Director-Narrator drift now |
| 🥈 | **Option C: Phase 2 — Memory** (pgvector + embedding pipeline + rolling summary every 20 turns + RAG retriever + auto-lorebook entity extraction) | ~2 sessions | Long-play retention. Solves #1 churn driver across competitors. |
| 🥉 | **UI/UX polish** (UX-01 progress feedback, UX-02 inline state delta toast, UX-04 library list) | ~1 session | Deferred from Phase 1 — backend stable enough now to layer on. |

⚠️ **E2E test still pending** for C-01 fix — need real story playthrough to confirm Arc transitions actually advance past Act 1.

## 🚧 Blockers

**冇** — Phase 1.5.3 functional on prod with C-01 fix shipped.

## ✅ Recently completed (Session 4 — Phase 1.5.x ship + C-01 hotfix)

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

### Session 4 (most recent — Phase 1.5.x ship + C-01 hotfix) — 2026-05-21

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
