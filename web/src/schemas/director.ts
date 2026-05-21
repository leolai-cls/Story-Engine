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
  // `affected_character`: NPC whose red_line was crossed. Empty string when
  // the rejection is on world-invariant grounds (no specific NPC) — Narrator
  // instruction handles that case with a generic "故事規則" fallback.
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
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## Director Verdict
Director 允許呢個 action。正常 narrate 後果。`;

    case "reject": {
      const who = v.affected_character.trim() || "故事規則";
      const pushback = v.affected_character.trim()
        ? `**你必須**寫 in-fiction pushback — ${who} 拒絕、反抗、或離開。`
        : `**你必須**寫 in-fiction pushback — 環境 / 物理 / 場景強制阻止玩家。`;
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## Director Verdict — REJECT (你必須遵守)
玩家行動違反咗${v.affected_character.trim() ? ` ${who} 嘅紅線 / ` : ""}Bible 限制。
原因：${v.reasoning}

${pushback}
Pushback hint: ${v.in_fiction_pushback_hint}

⚠️ 唔好 narrate 玩家 action 成功 — 必須 narrate 失敗或 NPC / 環境 反抗。`;
    }

    case "allow_with_constraint":
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## Director Verdict — ALLOW WITH CONSTRAINT (你必須遵守)
玩家行動允許進行，但有特定 constraint：
${v.constraint}

原因：${v.reasoning}

正常 narrate 後果，但必須包含 constraint 描述嘅嘢。`;

    case "require_skill_check":
      // This case is handled separately in turn route — dice rolled BEFORE
      // Narrator is called, and skillCheckToNarratorInstruction produces
      // the actual instruction with the rolled outcome.
      // This text is a fallback if for some reason dice isn't rolled.
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## Director Verdict — SKILL CHECK NEEDED
\`${v.skill_key}\` vs difficulty ${v.difficulty}. Dice 應該已經喺 turn route 擲過 — 如果你睇到呢段，係 fallback path，pick 一個合理結果寫。`;
  }
}
