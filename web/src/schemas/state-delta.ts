import { z } from "zod";
import type { StateSchema, Field } from "./state-schema";

/**
 * State delta — what the Narrator outputs via tool calling each turn.
 *
 * We use a custom delta format (NOT raw JSON Patch) because:
 *   1. LLM generates cleaner output with explicit op names
 *   2. We can validate per-op against the schema BEFORE applying
 *   3. We can reject impossible ops (e.g., setting HP > max) without
 *      a separate validation pass
 *
 * Each op references a top-level field key. Nested ops (push/remove)
 * apply to that field's value as an array.
 */

export const StateOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set"),
    key: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({
    op: z.literal("inc"),
    key: z.string().min(1),
    by: z.number(),
  }),
  z.object({
    op: z.literal("push"),
    key: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({
    op: z.literal("remove"),
    key: z.string().min(1),
    /** Index in array, OR matching object identity for simple removal */
    index: z.number().int().nonnegative().optional(),
    match: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export type StateOp = z.infer<typeof StateOpSchema>;

export const StateDeltaSchema = z.object({
  ops: z.array(StateOpSchema).max(10),
});

export type StateDelta = z.infer<typeof StateDeltaSchema>;

export type ApplyDeltaResult = {
  state: Record<string, unknown>;
  applied: number;
  skipped: Array<{ op: StateOp; reason: string }>;
};

/**
 * Apply a delta to a state instance. Pure function — returns a new state
 * along with which ops were skipped (and why).
 *
 * Per-op error tolerance: invalid ops (unknown key, wrong type, numeric
 * coercion failure) are skipped + reported, NOT thrown. This way one bad
 * op from the LLM doesn't lose the rest of the turn's state changes.
 *
 * Caller decides whether to log / surface skipped ops.
 */
export function applyDelta(
  state: Record<string, unknown>,
  delta: StateDelta,
  schema: StateSchema,
): ApplyDeltaResult {
  const next = { ...state };
  const fieldsByKey = new Map<string, Field>(
    schema.fields.map((f) => [f.key, f]),
  );
  const skipped: Array<{ op: StateOp; reason: string }> = [];
  let applied = 0;

  for (const op of delta.ops) {
    const field = fieldsByKey.get(op.key);
    if (!field) {
      skipped.push({ op, reason: `unknown field: ${op.key}` });
      continue;
    }

    try {
      switch (op.op) {
        case "set":
          next[op.key] = validateValue(field, op.value);
          break;

        case "inc": {
          if (!isNumericField(field)) {
            throw new Error(`inc only valid for numeric fields (${field.render_hint})`);
          }
          const cur = coerceNumber(next[op.key]) ?? 0;
          const by = coerceNumber(op.by) ?? 0;
          next[op.key] = clampNumeric(field, cur + by);
          break;
        }

        case "push": {
          if (field.render_hint !== "inventory_list") {
            throw new Error(`push only valid for inventory_list`);
          }
          const arr = Array.isArray(next[op.key]) ? [...(next[op.key] as unknown[])] : [];
          if (field.max_items && arr.length >= field.max_items) {
            throw new Error(`inventory at max_items (${field.max_items})`);
          }
          arr.push(op.value);
          next[op.key] = arr;
          break;
        }

        case "remove": {
          if (field.render_hint !== "inventory_list") {
            throw new Error(`remove only valid for inventory_list`);
          }
          const arr = Array.isArray(next[op.key]) ? [...(next[op.key] as unknown[])] : [];
          if (op.index !== undefined && op.index < arr.length) {
            arr.splice(op.index, 1);
          } else if (op.match) {
            const idx = arr.findIndex(
              (item) =>
                item !== null &&
                typeof item === "object" &&
                Object.entries(op.match!).every(
                  ([k, v]) => (item as Record<string, unknown>)[k] === v,
                ),
            );
            if (idx >= 0) arr.splice(idx, 1);
          }
          next[op.key] = arr;
          break;
        }
      }
      applied++;
    } catch (e) {
      skipped.push({
        op,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { state: next, applied, skipped };
}

/**
 * Coerce a value to a number if possible. Handles strings like "42" or "3.14".
 * Returns null if not coercible.
 */
function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function isNumericField(field: Field): field is Extract<
  Field,
  { render_hint: "bar" | "progress_ring" | "number" | "meter_with_label" }
> {
  return ["bar", "progress_ring", "number", "meter_with_label"].includes(
    field.render_hint,
  );
}

function clampNumeric(field: Field, value: number): number {
  if (
    field.render_hint === "bar" ||
    field.render_hint === "progress_ring" ||
    field.render_hint === "meter_with_label"
  ) {
    const min = "min" in field ? field.min : 0;
    const max = "max" in field ? field.max : Number.POSITIVE_INFINITY;
    return Math.max(min, Math.min(max, value));
  }
  return value; // raw number — no bounds
}

function validateValue(field: Field, value: unknown): unknown {
  switch (field.render_hint) {
    case "bar":
    case "progress_ring":
    case "meter_with_label": {
      const n = coerceNumber(value);
      if (n === null) {
        throw new Error(`Field ${field.key} expects number, got ${typeof value}`);
      }
      return clampNumeric(field, n);
    }

    case "number": {
      const n = coerceNumber(value);
      if (n === null) {
        throw new Error(`Field ${field.key} expects number, got ${typeof value}`);
      }
      return n;
    }

    case "enum_chip":
      if (typeof value !== "string" || !field.options.includes(value)) {
        throw new Error(
          `Field ${field.key} value "${String(value)}" not in [${field.options.join(", ")}]`,
        );
      }
      return value;

    case "portrait":
    case "note":
      if (typeof value !== "string") {
        throw new Error(`Field ${field.key} expects string, got ${typeof value}`);
      }
      return value;

    case "inventory_list":
      if (!Array.isArray(value)) {
        throw new Error(`Field ${field.key} expects array`);
      }
      return value;

    case "relationship_graph":
      if (typeof value !== "object" || value === null) {
        throw new Error(`Field ${field.key} expects object`);
      }
      return value;
  }
}
