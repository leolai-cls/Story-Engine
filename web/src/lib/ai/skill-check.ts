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
 * Return list of numeric skill key names from the state schema.
 * Director should pick skill_key from this list — surfacing it in the
 * Director system prompt prevents hallucinated keys (D-01 fix).
 */
export function numericSkillKeys(schema: StateSchema): string[] {
  return schema.fields
    .filter(
      (f) =>
        f.render_hint === "bar" ||
        f.render_hint === "progress_ring" ||
        f.render_hint === "number" ||
        f.render_hint === "meter_with_label",
    )
    .map((f) => f.key);
}

/**
 * Extract numeric skill value from current state for the given key.
 * Fallback (when Director picks a non-existent key): use median of all
 * numeric fields in state — keeps Skill Check fair instead of guaranteed
 * failure on `skill_value = 0`. Logs warning so we can monitor.
 */
function extractSkillValue(
  state: Record<string, unknown>,
  schema: StateSchema,
  skill_key: string,
): number {
  // Happy path: key exists + value is numeric
  const value = state[skill_key];
  if (typeof value === "number") return value;

  // Field exists in schema but state value isn't numeric — use field default
  const field = schema.fields.find((f) => f.key === skill_key);
  if (field) {
    if (
      field.render_hint === "bar" ||
      field.render_hint === "progress_ring" ||
      field.render_hint === "number" ||
      field.render_hint === "meter_with_label"
    ) {
      return typeof field.default === "number" ? field.default : 0;
    }
  }

  // Director hallucinated a key — fall back to median of all numeric state
  // values. Better than 0 (which guarantees failure).
  const numericValues = numericSkillKeys(schema)
    .map((k) => {
      const v = state[k];
      return typeof v === "number" ? v : null;
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  if (numericValues.length > 0) {
    const median = numericValues[Math.floor(numericValues.length / 2)];
    console.warn(
      `[skill-check] Director picked unknown skill_key "${skill_key}". Falling back to median of numeric fields = ${median}.`,
    );
    return median;
  }

  console.warn(
    `[skill-check] Unknown skill_key "${skill_key}" and no numeric fields to median over. Using 10.`,
  );
  return 10; // neutral default — better than 0
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
