# Deep Mode — Phase 1 (NPC 內心戲) · ✅ COMPLETE (build + audit)

> Updated 2026-06-04. Branch: **`feat/deep-mode-1-npc-voices`** (build-verified + 2-agent audited · NOT merged · NOT on prod).
> Founder-facing design = `deep-mode-plan.html`. This file = technical state for AI/dev.

## 🔒 Locked design (founder · 2026-06-04)
- **NPC 內心戲 (agent mode)** = per-playthrough opt-in toggle · collapsible 心聲 panel (心聲 / 打算 / 考量).
- **Tiered by subscription** (founder 2026-06-04 · "Standard 都試到,但限量"):
  - free → **0** (toggle hidden · locked)
  - adventurer ($9.99 "Standard") → **1 NPC/turn**
  - storyteller ($19.99 "Pro") / legend → **3 NPC/turn**
  - Single source of truth: `npcVoicesCapForTier()` in `web/src/lib/ai/models.ts`.
- **擲骰/機制 + 任務** = story-intrinsic · ALL tiers · NOT toggles (Phase 2/3).
- Build order: ① NPC 內心戲 ✅ → ② 擲骰機制 → ③ 任務系統.

## ✅ Phase 1 — what shipped on the branch
- **`web/src/lib/ai/active-characters.ts`** (NEW) — GM-free trigger `deriveActiveCharacters(characters, action, recentTurns, maxAgents)`. Pure string scan of the player action (score 2) + last non-empty AI narrative (score 1) → top-N carded characters by score, capped at the tier cap. NOT an LLM = NOT a re-introduced GM. 1-turn lag accepted for brand-new arrivals.
- **`web/src/lib/ai/npc-agents.ts`** + **`npc-agents-retrieval.ts`** — recovered from `2235f26^`. Dropped the vestigial `verdict` arg fully (GM gone · ADR-001). Routing via `pickUtilityModel(contentRating,"structured")`: non-adult → Haiku · adult → Grok (hard rule #5). Docblocks refreshed.
- **`turn/route.ts`** — gate `npcVoicesCap = npcVoicesCapForTier(tierCheck.tier)` · `npcVoicesEnabled = npc_l3_enabled && cap>0`. Orchestration block (§4.27) is `if(npcVoicesEnabled)` + try/catch non-fatal → sets `ctx.npcInnerStreamsBlock` (internal · DO-NOT-QUOTE) + `npcOutputs`. `npcL3SuccessfulAgents = npcOutputs.length`. `npcThinking = npcAgentsToThinkingBlock(...)` → X-Think-Preamble header (byte-budgeted ≤6KB base64). Pre-charge reserve `expectedL3Agents = cap`.
- **Toggle re-exposed** — `page.tsx` `npcL3Enabled = pt.npc_l3_enabled ?? false` + `npcL3Available = (adventurer+)`; `play-client.tsx` threads `npcL3Available`; `ChatControls.tsx` `isTierEligibleForL3 = userIdx >= TIER_GATE.pro`.
- **Tier gate → paid (adventurer+)** — `setNpcL3Enabled` uses `getActiveTier` + `TIER_GATE.pro`; **migration `0059`** updates the `enforce_npc_l3_tier_gate` trigger (storyteller/legend → adventurer+; only `free` blocked).
- **Copy** — `agentTooltip / agentTierRequired / npcL3TierRequired / npcL3TierRequiredGeneric` updated × 3 locales (Storyteller → paid plan · Standard 1 / Pro 3).
- **Credits (hard rule #4)** — reserve (cap×6) ≥ actual (successful×6) for every tier · failed agents free · no double-charge. Audit CONFIRMED.

## 🔬 Audit (2 parallel agents · 2026-06-04)
- **Hard rule #4 (credits): HOLDS.** actual ≤ reserve every tier · only successful charged · throws→0 · append-only.
- **Hard rule #5 (adult isolation): HOLDS.** adult NPC agents → Grok via pickUtilityModel · no Anthropic NSFW.
- **Leak class: HOLDS.** inner_thought reaches the 心聲 panel ON PURPOSE (separate X-Think-Preamble header) but NEVER prose (4 barriers: separate transport · prose sanitized by stripReasoningMarkers · DB stores only sanitized prose · narrator prompt prose-only).
- **Regression: HOLDS.** non-voices path fully skipped (cap 0) · no added latency · state extraction untouched.
- Fixed post-audit: X-Think-Preamble byte budget (was char-slice → 8KB risk); trigger skips empty/failed AI turns.

## ⚠️ Open items (NOT done · for founder)
1. **🟡 MONEY-TIER — adult Grok token cost vs flat 6 credits.** The flat 6/agent (founder Q3 · GLM-era) may UNDER-cover Grok's real token cost on adult playthroughs (Grok ~2.6× Haiku). Gate is still SAFE (no free turn · just margin). Decide at money tier: raise adult NPC fee OR meter agent `details[].usage`. NOT a ship blocker.
2. **Migration 0059 — apply to prod at deploy time** (same as 0057 · awaiting founder; don't apply before merge/deploy or the OLD storyteller trigger blocks adventurer Pro users at DB layer).
3. **Merge/deploy** — branch not merged (auto-mode requires founder confirm per merge).
4. **Character-soul experience writing is DORMANT since light-core** (separate finding · not this PR) — `directorNpcUpdates.length>0` gates the interaction-count bump + 經歷日誌 + dynamic-state persist in turn route, and that's always [] now. Reserve + write are both off (no charge bug) but the 角色靈魂 累積經歷 moat feature is silently inactive. Could be revived using `deriveActiveCharacters` (same mechanism) — founder decision (changes behavior + credit reserve for ALL playthroughs).

## ▶️ Next (Phase 2 · 擲骰機制)
Story-intrinsic dice/skill-checks · ALL tiers · generated per-story at creation (D&D has dice, romance doesn't). Skill-check scaffolding still exists (`lib/ai/skill-check.ts` · `skillCheckResult` plumbing in route · X-Skill-Check header · play-client badge) but was unwired in light-core (`skillCheckResult = null`). Phase 2 = decide per-story whether dice apply (bible flag at creation) + re-wire the roll into the turn route (not a toggle · intrinsic).
