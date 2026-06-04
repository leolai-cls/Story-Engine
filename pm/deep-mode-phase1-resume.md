# Deep Mode — Phase 1 (NPC 內心戲) · RESUME NOTE

> Checkpoint 2026-06-04. Branch: **`feat/deep-mode-1-npc-voices`** (NOT merged · NOT on prod).
> Founder-facing design = `deep-mode-plan.html` (open in browser). This file = the technical continuation for AI/dev.

## 🔒 Locked design (founder · 2026-06-04)
- **NPC 內心戲 (agent mode)** = the ONE player toggle · **Pro-tier only** · costs extra credits/turn · player can expand a collapsible "心聲" panel to see the inner voices (decision **B**).
- **擲骰/機制 + 任務** = story-intrinsic · **available to ALL tiers** · NOT toggles · generated per-story at creation (D&D has dice, romance doesn't).
- **Build order: ① NPC 內心戲 → ② 擲骰機制 → ③ 任務系統** (one at a time).
- "Deep mode" is NOT one big mode — it = the NPC-voices Pro toggle + story-intrinsic dice/quests (all tiers).

## ✅ Done at this checkpoint
- Branch created off `main` (after PR #74 image fix merged · prod is at `dd4a06e`).
- Recovered the 2 deleted NPC-agent modules from git `2235f26^`:
  - `web/src/lib/ai/npc-agents.ts` (579 lines) — **UNBLOCKED**: replaced `import type { Verdict } from "@/schemas/director"` (deleted GM schema) with a minimal local `type Verdict`. `verdict` was already decoupled from the agent prompt (ADR-001) → pure vestigial threading → **drop it fully during route wiring**.
  - `web/src/lib/ai/npc-agents-retrieval.ts` (133 lines) — clean, only imports SupabaseClient + uses `walk_lorebook_graph` RPC (migration 0025, exists).
- `web/src/schemas/npc-agent.ts` was **NEVER deleted** (kept — credits.ts uses it). Contains: `NpcAgentOutputSchema`, `npcAgentToNarratorBlock` (internal [DO NOT QUOTE] block), `npcAgentsToThinkingBlock` (player-facing 心聲 block), `NPC_L3_CREDITS_PER_NPC = 6`, `MAX_NPC_L3_AGENTS_PER_TURN = 3`.
- Both recovered modules compile (build exit 0). They are **orphan** (nothing imports them yet — no behaviour change).

## 🔨 Remaining Phase 1 steps (precise)
1. **Active-NPC trigger (the ONLY real new piece)** — without a GM, derive `activeCharacters`. Founder-agreed approach: use the **post-turn extractor's `mentioned_characters`** (turn-runner `extractTurnState`) joined back to carded `ctx.characters`, and/or the **name-detection** in `visualize-actions.ts` (~lines 270-279: CJK `includes()` / Latin word-boundary). Accept the **1-turn lag** (NPC reacts to what just happened — natural). **DO NOT** add a pre-Narrator scan (re-creates the GM light-core removed).
2. **Wire into turn route** (`web/src/app/api/playthroughs/[id]/turn/route.ts`): when `pt.npc_l3_enabled === true` AND tier is Pro → compute activeCharacters → `callNpcAgentsParallel({...})` → set `ctx.npcInnerStreamsBlock = npcAgentToNarratorBlock(outputs)` (narrator prompt already consumes it). Re-add the import (removed in PR #72). Fully drop the vestigial `verdict` arg.
3. **Re-expose the toggle** — `ChatControls.tsx`: the "Agent mode" button is hidden behind `npcL3Available = false` (default). Pass `npcL3Available={true}` from play-client **only for Pro**. `page.tsx` currently hardcodes `npcL3Enabled={false}` (PR #71) → restore to `pt.npc_l3_enabled ?? false`.
4. **Tier gate fix** — `setNpcL3Enabled` (`play/[playthroughId]/actions.ts`) + migration **0028** trigger both check `'storyteller'/'legend'` (old 4-tier). Update to the current 2-tier Pro gate (see `TIER_GATE`/`SUB_ORDER` in `models.ts` — Pro pool unlocks at `adventurer`). **NEW migration** to update the 0028 trigger.
5. **Inner-voices panel** — `npcAgentsToThinkingBlock(outputs, storyLanguage)` → ship via the `X-Think-Preamble` response header (existing mechanism, route ~line 1900) → client already renders it in the collapsible 思考過程 panel. Gate to deep mode. **MUST NOT** leak `inner_thought` into prose (leak-class was just hardened in #70).
6. **Credits (hard rule #4 — exact)** — `expectedL3Agents` in route.ts is hardcoded `0` (PR #72). Re-wire to `npc_l3_enabled (Pro) ? 3 : 0`. Charge `NPC_L3_CREDITS_PER_NPC × successfulAgents` (only successful — failed = free). Add to BOTH `estimateTurnCredits` (pre-turn) + `computeTurnCredits` (actual). The L3 telemetry fields (`npc_l3_active_agents` / `npc_l3_credits`) still exist in the charge metadata.
7. **Build + verify** + a focused audit cycle (credits + adult isolation especially).

## ⚠️ Gotchas
- **hard rule #5**: adult-rated playthroughs MUST route NPC agents to Grok (CrazyRouter), never Haiku/Claude. `pickUtilityModel(contentRating, "structured")` already does this — reuse verbatim.
- **hard rule #4**: credits exact. The redo `state_before` snapshot (PR #72) shows state-mutation ordering is delicate.
- migrations **0027** (`npc_inner_thoughts` table) + **0028** (tier gate) still exist in prod — reclaim, don't rebuild.
- **PR #73** (STATUS.md doc update for the earlier 3-PR batch) is still OPEN/unmerged — merge it so STATUS reflects reality. Also note: my STATUS edits are NOT on `main` yet (they live in PR #73), so STATUS on this branch is stale.
- Image fix shipped this session: non-adult images → `gpt-image-2` only (PR #74). Migration **0057** (old-playthrough → Claude backfill) still UNAPPLIED (awaiting founder).
