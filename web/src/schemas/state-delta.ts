import { z } from "zod";
import { InventoryItemSchema, type StateSchema, type Field } from "./state-schema";

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

/**
 * FLAT op schema (2026-05-29) — Gemini-compatible function-calling shape.
 *
 * Previously a `z.discriminatedUnion` of 4 variants with `z.unknown()` values
 * and a `z.record()` match map. That compiles to `anyOf` + `const` + untyped
 * `{}` + open `additionalProperties:{}`, which CrazyRouter→Gemini rejects with
 * a 400 "invalid_request / tool schema" (verified 2026-05-29) — so the Narrator
 * produced ZERO output on every Standard-tier turn (Anthropic/Claude tolerated
 * it, which is why Pro worked). Flattened to a single object using only the
 * primitives Gemini accepts: enum string, plain string, number.
 *
 *   - `value` is a STRING (set/push). applyDelta coerces it: numeric fields
 *     parse the string to a number; a bare push string becomes a minimal item.
 *     (Loses the rare ability to `set` a whole array/object — acceptable.)
 *   - `by` is the inc amount. `index` is the remove index.
 *   - the old `match` (object map) removal path is dropped — `index` covers it.
 */
export const StateOpSchema = z.object({
  op: z.enum(["set", "inc", "push", "remove"]),
  key: z.string().min(1),
  /** set / push value · always a string from the LLM · coerced at apply time. */
  value: z.string().optional(),
  /** inc amount (numeric fields only). */
  by: z.number().optional(),
  /** remove: array index to splice out. */
  index: z.number().optional(),
});

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
          // Validate item shape — LLM occasionally pushes raw string or partial object.
          // Auto-coerce a bare string to a minimum-viable item; reject everything else.
          let item: unknown = op.value;
          if (typeof item === "string") {
            item = { name: item, count: 1, icon: "" };
          }
          const parsed = InventoryItemSchema.safeParse(item);
          if (!parsed.success) {
            throw new Error(
              `inventory item shape invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
            );
          }
          const arr = Array.isArray(next[op.key]) ? [...(next[op.key] as unknown[])] : [];
          arr.push(parsed.data);
          next[op.key] = arr;
          break;
        }

        case "remove": {
          if (field.render_hint !== "inventory_list") {
            throw new Error(`remove only valid for inventory_list`);
          }
          const arr = Array.isArray(next[op.key]) ? [...(next[op.key] as unknown[])] : [];
          // Flat schema (2026-05-29): index-based removal only (the old
          // object-match path was dropped — it needed a Gemini-incompatible map).
          if (op.index !== undefined && op.index >= 0 && op.index < arr.length) {
            arr.splice(op.index, 1);
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
 * Returns null if not coercible OR not finite (rejects NaN, ±Infinity — those
 * silently break JSON round-trip and clamp logic).
 */
function coerceNumber(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
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
  if (field.render_hint === "bar" || field.render_hint === "meter_with_label") {
    return Math.max(0, Math.min(field.max, value));
  }
  if (field.render_hint === "progress_ring") {
    return Math.max(0, Math.min(100, value));
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

    case "inventory_list": {
      if (!Array.isArray(value)) {
        throw new Error(`Field ${field.key} expects array`);
      }
      // Validate each item shape; coerce bare strings to minimum-viable items.
      const validated: Array<{ name: string; count: number; icon: string }> = [];
      for (const raw of value) {
        let item: unknown = raw;
        if (typeof item === "string") {
          item = { name: item, count: 1, icon: "" };
        }
        const parsed = InventoryItemSchema.safeParse(item);
        if (!parsed.success) {
          throw new Error(
            `inventory_list item invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          );
        }
        validated.push(parsed.data);
      }
      return validated;
    }

    case "relationship_graph": {
      // Reject arrays — `typeof [] === "object"` would otherwise pass.
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`Field ${field.key} expects object map<string,number>`);
      }
      // Clamp every value to [-100, 100] and reject non-numeric entries.
      const clamped: Record<string, number> = {};
      for (const [k, v] of Object.entries(value)) {
        const n = coerceNumber(v);
        if (n === null) {
          throw new Error(`relationship_graph "${k}" not numeric`);
        }
        clamped[k] = Math.max(-100, Math.min(100, n));
      }
      return clamped;
    }
  }
}
