import { z } from "zod";

/**
 * Render hints — discriminator that tells the frontend which atomic
 * component to use for each state field. Story Engine's "故事自適應介面"
 * is just a generic renderer that dispatches per-field based on this.
 *
 * CRITICAL: Anthropic's structured output (tool input schema) has a hard
 * limit of 24 optional fields total (grammar compilation cost). To stay
 * under that ceiling, this schema is INTENTIONALLY MINIMAL — only fields
 * the LLM MUST provide. Display polish (colors, icons, prefixes etc.) is
 * hardcoded in renderer components based on key heuristics instead.
 */

export const RENDER_HINTS = [
  "bar",
  "progress_ring",
  "number",
  "enum_chip",
  "inventory_list",
  "relationship_graph",
  "meter_with_label",
  "portrait",
  "note",
] as const;

export type RenderHint = (typeof RENDER_HINTS)[number];

// All field types share: key (machine name) + label (human display name).
// No description / no metadata — kept tight to stay under Anthropic 24-optional limit.
const baseField = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case keys"),
  label: z.string().min(1).max(80),
});

export const BarFieldSchema = baseField.extend({
  render_hint: z.literal("bar"),
  max: z.number().positive(),
  default: z.number(),
});

export const ProgressRingFieldSchema = baseField.extend({
  render_hint: z.literal("progress_ring"),
  default: z.number(),
});

export const NumberFieldSchema = baseField.extend({
  render_hint: z.literal("number"),
  default: z.number(),
});

export const EnumChipFieldSchema = baseField.extend({
  render_hint: z.literal("enum_chip"),
  options: z.array(z.string().min(1)).min(2).max(12),
  default: z.string(),
});

export const InventoryItemSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().nonnegative(),
  icon: z.string(),
});

export const InventoryListFieldSchema = baseField.extend({
  render_hint: z.literal("inventory_list"),
  default: z.array(InventoryItemSchema),
});

export const RelationshipGraphFieldSchema = baseField.extend({
  render_hint: z.literal("relationship_graph"),
  default: z.record(z.string(), z.number()),
});

export const MeterWithLabelFieldSchema = baseField.extend({
  render_hint: z.literal("meter_with_label"),
  max: z.number().positive(),
  default: z.number(),
});

export const PortraitFieldSchema = baseField.extend({
  render_hint: z.literal("portrait"),
  default: z.string(),
});

export const NoteFieldSchema = baseField.extend({
  render_hint: z.literal("note"),
  default: z.string(),
});

export const FieldSchema = z.discriminatedUnion("render_hint", [
  BarFieldSchema,
  ProgressRingFieldSchema,
  NumberFieldSchema,
  EnumChipFieldSchema,
  InventoryListFieldSchema,
  RelationshipGraphFieldSchema,
  MeterWithLabelFieldSchema,
  PortraitFieldSchema,
  NoteFieldSchema,
]);

export type Field = z.infer<typeof FieldSchema>;

/**
 * Full state schema attached to a story. Fields are ordered — frontend
 * renders them in this sequence.
 */
export const StateSchemaShape = z
  .object({
    fields: z.array(FieldSchema).min(1).max(20),
  })
  .refine(
    (s) => new Set(s.fields.map((f) => f.key)).size === s.fields.length,
    { message: "Field keys must be unique" },
  );

export type StateSchema = z.infer<typeof StateSchemaShape>;

/**
 * Build a zeroed state instance from a schema using each field's `default`.
 */
export function initialStateFromSchema(
  schema: StateSchema,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const field of schema.fields) {
    state[field.key] = field.default;
  }
  return state;
}

/**
 * Type-safe lookup: given a schema field and the current state, return
 * the field's current value cast to the right type for its renderer.
 */
export function getFieldValue(
  state: Record<string, unknown>,
  field: Field,
): unknown {
  const value = state[field.key];
  if (value === undefined || value === null) return field.default;
  return value;
}

// =============================================================================
// Renderer-side display polish helpers (hardcoded, NOT in schema)
// =============================================================================

/**
 * Pick a color class for a bar/progress_ring/meter based on field.key.
 * Heuristic: `hp`/`health` → red, `mp`/`mana`/`magic` → blue,
 * `stamina`/`energy` → amber, anything with `affinity`/`affection`/`love` → rose,
 * etc. Default red for bars, rose for rings.
 */
export function pickBarColor(
  key: string,
): "red" | "blue" | "green" | "amber" | "purple" {
  const k = key.toLowerCase();
  if (/hp|health|life/.test(k)) return "red";
  if (/mp|mana|magic/.test(k)) return "blue";
  if (/stamina|energy|體力/.test(k)) return "amber";
  if (/exp|level|growth/.test(k)) return "green";
  return "red";
}

export function pickRingColor(
  key: string,
): "red" | "blue" | "green" | "amber" | "purple" | "rose" {
  const k = key.toLowerCase();
  if (/affinity|affection|love|trust|好感|信任/.test(k)) return "rose";
  if (/loyalty|honor|忠誠|榮譽/.test(k)) return "purple";
  if (/wealth|money|wealth|money/.test(k)) return "amber";
  if (/health|status|健康/.test(k)) return "green";
  return "rose";
}

/**
 * Map field.key to suffix/prefix hints for number rendering.
 * Currency keys get "$" prefix, score keys get " 分" suffix, etc.
 */
export function numberFormatHints(key: string): {
  prefix?: string;
  suffix?: string;
} {
  const k = key.toLowerCase();
  if (/money|cash|coins|gold|現金|金錢/.test(k))
    return { prefix: "HK$" };
  if (/score|point|分/.test(k)) return { suffix: " 分" };
  if (/xp|experience|exp/.test(k)) return { suffix: " XP" };
  if (/level|lv/.test(k)) return { prefix: "Lv " };
  return {};
}
