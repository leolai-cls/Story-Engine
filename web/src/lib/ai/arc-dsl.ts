/**
 * Arc Transition DSL — boolean condition evaluator for story_arc transitions.
 *
 * Per ADR-008, story_arc[].transition_condition is a string DSL like:
 *   - "characters.linsiya.trust >= 60"
 *   - "characters.linsiya.trust >= 60 AND characters.linsiya.romance >= 30"
 *   - "state.money >= 1000 OR state.influence >= 50"
 *   - "characters.aming.permanent_flags contains 'rescued'" (Phase 1.5.4 — not yet)
 *
 * This parser supports:
 *   - Comparison: >= <= > < == !=
 *   - Boolean: AND / OR (case-insensitive, no parentheses for v1)
 *   - Paths: state.X.Y / characters.NAME.AXIS
 *   - Values: numbers, "quoted strings", true/false
 *
 * Precedence: AND binds tighter than OR (standard).
 *
 * Phase 1.5.4 polish: parentheses, NOT, contains operator, interactions.X count.
 */

export type ArcContext = {
  state: Record<string, unknown>;
  characters: Map<
    string,
    { disposition: Record<string, number>; permanent_flags: string[] }
  >;
};

/**
 * Evaluate a transition_condition string against the current context.
 * Returns true/false. Logs warnings for unparseable clauses but doesn't throw.
 */
export function evaluateCondition(
  condition: string,
  ctx: ArcContext,
): boolean {
  if (!condition || !condition.trim()) return false;

  // OR has lower precedence — split first
  const orClauses = condition.split(/\s+OR\s+/i);
  return orClauses.some((orClause) => {
    const andClauses = orClause.split(/\s+AND\s+/i);
    return andClauses.every((clause) => evaluateLeaf(clause.trim(), ctx));
  });
}

function evaluateLeaf(s: string, ctx: ArcContext): boolean {
  // Match "path op value"
  const m = s.match(/^(\S+)\s*(>=|<=|==|!=|>|<)\s*(.+?)$/);
  if (!m) {
    // Maybe a bare boolean variable: "state.act1_complete"
    // Treat as truthiness check
    const v = resolvePath(s.trim(), ctx);
    if (v === undefined) {
      console.warn(`[arc-dsl] path "${s.trim()}" resolved to undefined`);
    }
    return Boolean(v);
  }
  const [, path, op, valueStr] = m;
  const lhs = resolvePath(path, ctx);
  if (lhs === undefined) {
    console.warn(
      `[arc-dsl] path "${path}" resolved to undefined (in condition: "${s}")`,
    );
  }
  const rhs = parseLiteral(valueStr.trim());
  return compare(lhs, op, rhs);
}

function resolvePath(path: string, ctx: ArcContext): unknown {
  const parts = path.split(".");
  if (parts.length === 0) return undefined;

  if (parts[0] === "state") {
    let cur: unknown = ctx.state;
    for (const p of parts.slice(1)) {
      if (cur === null || cur === undefined) return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }

  if (parts[0] === "characters") {
    if (parts.length < 2) return undefined;
    const charName = parts[1];
    const char = ctx.characters.get(charName);
    if (!char) return undefined;
    if (parts.length === 2) return char;

    // Accept BOTH path formats:
    //   characters.NAME.AXIS                  (3 parts — preferred, terse)
    //   characters.NAME.disposition.AXIS      (4 parts — verbose; schema-generator
    //                                         examples previously used this form)
    // If parts[2] is the literal word "disposition", skip it and use parts[3] as axis.
    const axisIdx = parts[2] === "disposition" && parts.length >= 4 ? 3 : 2;
    const axis = parts[axisIdx];

    // axis can be "trust", "romance", etc. or "permanent_flags" (array)
    if (axis === "permanent_flags") return char.permanent_flags;
    return char.disposition[axis];
  }

  // `interactions.X` namespace not tracked in Phase 1.5.3 — return 0 so
  // conditions like `interactions.linsiya >= 3` evaluate sensibly (false for
  // ">= positive number" but doesn't break parsing). Log so we know
  // schema-generator is still emitting these refs.
  if (parts[0] === "interactions") {
    console.warn(
      `[arc-dsl] interactions.X namespace not tracked yet — returning 0 for "${path}"`,
    );
    return 0;
  }

  return undefined;
}

function parseLiteral(s: string): number | string | boolean {
  if (s === "true") return true;
  if (s === "false") return false;
  // numeric (incl. negative)
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  // strip quotes
  return s.replace(/^["']|["']$/g, "");
}

function compare(
  lhs: unknown,
  op: string,
  rhs: number | string | boolean,
): boolean {
  // Numeric comparison
  if (typeof lhs === "number" && typeof rhs === "number") {
    switch (op) {
      case ">=":
        return lhs >= rhs;
      case "<=":
        return lhs <= rhs;
      case ">":
        return lhs > rhs;
      case "<":
        return lhs < rhs;
      case "==":
        return lhs === rhs;
      case "!=":
        return lhs !== rhs;
    }
  }
  // Treat undefined as 0 for numeric comparisons (e.g. "characters.unknown_npc.trust >= 50" → false)
  if (
    lhs === undefined &&
    typeof rhs === "number" &&
    (op === ">=" || op === ">" || op === "==")
  ) {
    return compare(0, op, rhs);
  }
  // String / bool equality
  if (op === "==") return lhs === rhs;
  if (op === "!=") return lhs !== rhs;
  return false;
}

/**
 * Determine current act based on story arc + ArcContext.
 * Acts are monotonic — once advanced, never roll back. Caller persists
 * `__act` in state to track high-watermark.
 *
 * Returns the highest act number whose transition_condition has been met,
 * OR the persisted current_act, whichever is greater. Capped at story_arc length.
 */
export function deriveCurrentAct(params: {
  story_arc: Array<{ act: number; name: string; transition_condition: string }>;
  ctx: ArcContext;
  persisted_act: number;
}): { act: number; just_advanced_to?: { act: number; name: string } } {
  let highest = params.persisted_act;
  let lastAdvancedAct: { act: number; name: string } | undefined;

  // Sort arc by act ascending for monotonic check
  const sorted = [...params.story_arc].sort((a, b) => a.act - b.act);

  for (const entry of sorted) {
    if (entry.act <= params.persisted_act) continue; // already past this act

    const ok = evaluateCondition(entry.transition_condition, params.ctx);
    if (ok) {
      highest = entry.act;
      lastAdvancedAct = { act: entry.act, name: entry.name };
    } else {
      // Once a condition fails, stop — can't skip acts
      break;
    }
  }

  return { act: highest, just_advanced_to: lastAdvancedAct };
}
