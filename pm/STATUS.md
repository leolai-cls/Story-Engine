# STATUS — Story Engine

> 單一 source of truth。Claude 每次重要進展後更新呢個 file。
> 開新 session 第一件事：read 呢個 file，知道而家喺邊。

---

## 🎯 而家狀態

**Phase**: ✅ **Phase 1 code-complete — Story Engine MVP ready for E2E test**
**Live URL**: https://story-engine-drab.vercel.app
**Last updated**: 2026-05-21 Session 3 (Phase 1)

## 📍 What's next

**E2E test on prod** — 你 manually 行一次完整 flow:
1. 打開 https://story-engine-drab.vercel.app/login → 入你 email → click magic link → /profile
2. Navigate to https://story-engine-drab.vercel.app/stories/new
3. Paste 任何一個故事 prompt（form 有 4 個 example）
4. 等 15-30 秒 AI 生成（schema + bible + 3-5 characters + opening）
5. 自動 redirect 去 /play/[id]，見到狀態 panel + opening narrative
6. 輸入第一個 action（e.g.「我行去林思雅旁邊講聲早晨」）
7. 等 5-10 秒，AI 串流敘事 + side panel 更新（好感度應該變）
8. 玩 2-3 個 turns 確認 state changes 真係 reflect

如果順利，呢個就係 Phase 1 verification 完成 — full Story Engine MVP live。

## 🚧 Blockers

**冇** — code 全部 push 上 prod，Vercel env vars (ANTHROPIC_API_KEY + OPENROUTER_API_KEY + Supabase) 全部加咗。
Local dev 有 cache issue（proxy.ts → middleware.ts rename 殘留），但唔影響 prod。
下次 session 開頭如果要 local dev，rm -rf .next + restart 應該得。

## ✅ Recently completed (Session 3 — Phase 1)

**Schemas + types (Phase 1.1)**:
- `src/schemas/state-schema.ts` — 9 render hints + Zod discriminated union + JSON Patch state delta
- `src/schemas/bible.ts` — 3-tier (hard_locked / soft_guided) per ADR-008
- `src/schemas/character.ts` — Character cards with red_lines + disposition
- `src/schemas/state-delta.ts` — Custom ops (set/inc/push/remove) + clamp + validation applier

**UI components (Phase 1.2-1.3)**:
- 9 atomic renderers: bar / progress_ring / number / enum_chip / inventory_list / relationship_graph / meter_with_label / portrait / note
- `<DynamicStatePanel>` generic dispatcher

**Demo (Phase 1.4)**:
- `/dev/state-demo` — 3 hardcoded schemas (戀愛 / D&D / NBA) side-by-side proves dynamic rendering works

**AI integration (Phase 1.5-1.6)**:
- @ai-sdk/anthropic + ai SDK
- Provider factory (Anthropic + OpenRouter Phase 6 ready)
- Model catalog (Sonnet 4.6 default Narrator, Haiku 4.5 future Director)
- Schema generator — calls Claude with structured Zod output → full story package

**Story creation flow (Phase 1.7)**:
- `/stories/new` form with prompt + protagonist hint + content rating
- Server Action: validate → call generator → insert story + characters + playthrough + opening turn → redirect to /play

**Play loop (Phase 1.8-1.9)**:
- POST /api/playthroughs/[id]/turn — load context, streamText with update_state tool, onFinish persist user+AI turn and apply state delta
- GET /api/playthroughs/[id] — state refresh after turn
- `/play/[playthroughId]` — 2-col layout (narrative + state panel), streaming narrative display, optimistic user turn, state panel refresh after each turn

---

## 📦 Phase 1 — Code complete (10/10 sub-tasks)

| Task | Status |
|---|---|
| 1.1 Zod schemas | ✅ |
| 1.2 9 render components | ✅ |
| 1.3 DynamicStatePanel | ✅ |
| 1.4 Demo route | ✅ /dev/state-demo |
| 1.5 Anthropic SDK setup | ✅ |
| 1.6 Schema generator | ✅ uses Claude Sonnet 4.6 |
| 1.7 Creation wizard | ✅ /stories/new |
| 1.8 Turn endpoint | ✅ streaming + tool calling |
| 1.9 Play screen | ✅ /play/[id] |
| 1.10 E2E verify | 🟡 waiting user manual test |

**Not in Phase 1 (deferred)**:
- Phase 1.5 = Director Model (separate from Narrator) — ADR-006/015 Narrative Integrity full implementation
- Phase 2 = pgvector memory layers (summarization + RAG + lorebook)
- Inline schema/bible/character editor (post-MVP UX polish)
- Schema generator NSFW guidance for adult mode (Phase 6)
- Credit metering on turn API (Phase 3)

---

## 📓 Session Log

### Session 3 — 2026-05-21 (Phase 1 build)

**Major outcome**: Story Engine MVP code-complete on prod. User can create a story from prompt + play with streaming narrative + dynamic state panel.

**Did**:
- All 10 Phase 1 sub-tasks (Zod schemas, 9 renderers, DynamicStatePanel, demo, AI SDK setup, generator, wizard, turn endpoint, play screen)
- Demo at /dev/state-demo proves 故事自適應介面 (3 genres rendering correctly)
- Added ANTHROPIC_API_KEY + OPENROUTER_API_KEY to Vercel env vars via Chrome MCP
- Fixed web/.gitignore to allow .env.example
- Committed paranoid-safe: no API keys in git (`.env.local` properly ignored)

**Architecture decisions reinforced this session**:
- State schema = discriminated union on render_hint (instead of JSON Schema) for type safety end-to-end (Zod → tool calling → renderer dispatch)
- State delta = custom ops (set/inc/push/remove) NOT raw JSON Patch (LLM generates cleaner output, easier validation)
- Turn endpoint uses Vercel AI SDK streamText with `update_state` tool — narrative streams to client, state mutation happens in onFinish callback (server-side, atomic with DB writes)
- Client refetches /api/playthroughs/[id] for fresh state after stream finishes (simple, avoids client-side delta replication)
- Phase 1.5 Director Model deferred to next phase — Phase 1 just runs Narrator with bible/cards in system prompt

**Local dev issues encountered**:
- HMR cache held stale reference to proxy.ts after rename → SyntaxError on env reload
- `rm -rf .next` blocked by zombie node process
- Pushed straight to prod; local dev to be revisited next session

**Next session**:
- User E2E test results — fix any bugs
- If all green → mark Phase 1 done, plan Phase 1.5 (Director + Skill Check) or Phase 2 (memory layers)
