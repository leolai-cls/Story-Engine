import { z } from "zod";

/**
 * Director verdict — output of the Director Model's pre-Narrator check.
 *
 * Per ADR-015 (Orchestrator Pattern): each turn flows
 *   user action → Director (cheap LLM) → verdict → Narrator (premium LLM)
 *
 * The Director审 the player's action against:
 *   - Story Bible hard_locked rules (premise, world_invariants)
 *   - NPC red_lines (with earned_exception flags)
 *   - Player skill levels (Phase 1.5.2 will use these for skill checks)
 *   - Story arc context (which Act we're in)
 *
 * Output is one of 4 discriminated variants. Narrator's system prompt is
 * adjusted based on the verdict.
 *
 * Phase 1.5.1: 3 variants implemented (allow / reject / allow_with_constraint).
 * Phase 1.5.2: require_skill_check will become functional (dice roller).
 */

export const VerdictSchema = z.discriminatedUnion("verdict", [
  // ─── ALLOW ─────────────────────────────────────────────────────────
  z.object({
    verdict: z.literal("allow"),
    reasoning: z.string().min(5).max(280),
  }),

  // ─── REJECT — Narrator must in-fiction pushback ─────────────────────
  z.object({
    verdict: z.literal("reject"),
    reasoning: z.string().min(10).max(280),
    in_fiction_pushback_hint: z.string().min(10).max(280),
    affected_character: z.string().max(40),
  }),

  // ─── ALLOW WITH CONSTRAINT — proceed but with specific consequence ──
  z.object({
    verdict: z.literal("allow_with_constraint"),
    reasoning: z.string().min(10).max(280),
    constraint: z.string().min(10).max(280),
  }),

  // ─── REQUIRE SKILL CHECK — Phase 1.5.2 makes this functional ───────
  z.object({
    verdict: z.literal("require_skill_check"),
    reasoning: z.string().min(10).max(280),
    skill_key: z.string().min(1).max(64),
    difficulty: z.number().int().min(5).max(25),
    success_consequence_hint: z.string().min(10).max(280),
    failure_consequence_hint: z.string().min(10).max(280),
  }),
]);

export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Convert verdict into a system-prompt addendum that the Narrator consumes.
 * Each verdict shapes Narrator's behavior differently.
 */
export function verdictToNarratorInstruction(v: Verdict): string {
  switch (v.verdict) {
    case "allow":
      return "## Director Verdict\nDirector 允許呢個 action。正常 narrate 後果。";

    case "reject":
      return `## Director Verdict — REJECT (你必須遵守)
玩家行動違反咗 ${v.affected_character} 嘅紅線 / Bible 限制。
原因：${v.reasoning}

**你必須**寫 in-fiction pushback — ${v.affected_character} 拒絕、反抗、或離開。
Pushback hint: ${v.in_fiction_pushback_hint}

⚠️ 唔好 narrate 玩家 action 成功 — 必須 narrate 失敗或 NPC 反抗。`;

    case "allow_with_constraint":
      return `## Director Verdict — ALLOW WITH CONSTRAINT (你必須遵守)
玩家行動允許進行，但有特定 constraint：
${v.constraint}

原因：${v.reasoning}

正常 narrate 後果，但必須包含 constraint 描述嘅嘢。`;

    case "require_skill_check":
      // Phase 1.5.2 will do actual dice roll. For 1.5.1, treat as constraint.
      return `## Director Verdict — SKILL CHECK NEEDED (Phase 1.5.2 will roll dice)
玩家行動需要 \`${v.skill_key}\` skill check (difficulty ${v.difficulty}).
而家 Phase 1.5.1 — 暫時當 50/50 narrate:
- 如果成功：${v.success_consequence_hint}
- 如果失敗：${v.failure_consequence_hint}

Narrate 一個結果，包含失敗 / 成功 都得（pick 一個合理嘅）。`;
  }
}
