/**
 * Skill Check engine — pure functions, no LLM call.
 *
 * Per ADR-006/008: when Director judges a player action requires a skill
 * check, this engine rolls (skill_value + d20 + modifier) vs difficulty
 * and returns an outcome. The outcome is fed back to Narrator who must
 * narrate the result faithfully (no LLM hallucination of success when
 * the dice said failure).
 *
 * Outcome thresholds:
 *   - critical_success: total >= difficulty + 10
 *   - success:          total >= difficulty
 *   - failure:          total >= difficulty - 5
 *   - critical_failure: total <  difficulty - 5
 *
 * Phase 1.5.2 = this engine + Director integration.
 * Phase 1.5.2b = UI dice animation (deferred).
 */

import type { StateSchema } from "@/schemas/state-schema";

export type SkillCheckOutcome =
  | "critical_success"
  | "success"
  | "failure"
  | "critical_failure";

export type SkillCheckResult = {
  skill_key: string;
  skill_value: number; // extracted from current_state
  difficulty: number;
  d20_roll: number; // 1-20
  modifier: number;
  total: number; // d20 + skill_value + modifier
  outcome: SkillCheckOutcome;
  rolled_at: string; // ISO timestamp
};

/**
 * Extract numeric skill value from current state for the given key.
 * Falls back to 0 if key not found / not numeric.
 */
function extractSkillValue(
  state: Record<string, unknown>,
  schema: StateSchema,
  skill_key: string,
): number {
  // First check if key exists as a top-level state field
  const value = state[skill_key];
  if (typeof value === "number") return value;

  // Check schema — is the field numeric?
  const field = schema.fields.find((f) => f.key === skill_key);
  if (field) {
    // If we get here, the state value isn't a number even though the
    // schema says it should be. Use field default as fallback.
    if (
      field.render_hint === "bar" ||
      field.render_hint === "progress_ring" ||
      field.render_hint === "number" ||
      field.render_hint === "meter_with_label"
    ) {
      return typeof field.default === "number" ? field.default : 0;
    }
  }

  return 0;
}

/**
 * Roll a d20 — uniform 1-20.
 */
function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Roll a skill check. Pure function (Math.random impure but allowed —
 * Phase 2 can add seeded RNG for reproducibility / audit-replay).
 */
export function rollSkillCheck(params: {
  state: Record<string, unknown>;
  schema: StateSchema;
  skill_key: string;
  difficulty: number;
  modifier?: number;
}): SkillCheckResult {
  const skill_value = extractSkillValue(
    params.state,
    params.schema,
    params.skill_key,
  );
  const d20 = rollD20();
  const modifier = params.modifier ?? 0;
  const total = d20 + skill_value + modifier;

  let outcome: SkillCheckOutcome;
  if (total >= params.difficulty + 10) outcome = "critical_success";
  else if (total >= params.difficulty) outcome = "success";
  else if (total >= params.difficulty - 5) outcome = "failure";
  else outcome = "critical_failure";

  return {
    skill_key: params.skill_key,
    skill_value,
    difficulty: params.difficulty,
    d20_roll: d20,
    modifier,
    total,
    outcome,
    rolled_at: new Date().toISOString(),
  };
}

/**
 * Convert a skill check result + verdict's consequence hints into a
 * Narrator instruction. Forces Narrator to narrate the actual outcome
 * (not improvise success when dice said failure).
 */
export function skillCheckToNarratorInstruction(
  result: SkillCheckResult,
  successConsequenceHint: string,
  failureConsequenceHint: string,
): string {
  const tier =
    result.outcome === "critical_success"
      ? "重大成功 (critical_success)"
      : result.outcome === "success"
        ? "成功 (success)"
        : result.outcome === "failure"
          ? "失敗 (failure)"
          : "重大失敗 (critical_failure)";

  const isSuccess =
    result.outcome === "critical_success" || result.outcome === "success";
  const isCritical =
    result.outcome === "critical_success" ||
    result.outcome === "critical_failure";

  const baseHint = isSuccess ? successConsequenceHint : failureConsequenceHint;

  const intensityNote = isCritical
    ? isSuccess
      ? "\n⚡ 呢個係 **重大成功** — narrative 寫得特別精彩 / 戲劇性。"
      : "\n💥 呢個係 **重大失敗** — narrative 寫得特別慘 / 後果加倍。"
    : "";

  return `## Skill Check Result (你必須 narrate 呢個 outcome — 唔可以改寫成相反結果)

擲咗骰：
- Skill: \`${result.skill_key}\` (數值 = ${result.skill_value})
- D20 擲到: **${result.d20_roll}**
- 加埋 modifier ${result.modifier}: total = **${result.total}**
- Difficulty: ${result.difficulty}
- Outcome: **${tier}**

Consequence hint: ${baseHint}${intensityNote}

⚠️ 你必須 narrate 呢個 outcome 嘅結果。如果係 failure，玩家 action 失敗。如果係 success，玩家 action 成功。dice 已決定咗 — 你只負責寫 narrative。`;
}
