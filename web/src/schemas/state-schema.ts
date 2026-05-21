import { z } from "zod";

/**
 * Render hints — discriminator that tells the frontend which atomic
 * component to use for each state field. Story Engine's "故事自適應介面"
 * is just a generic renderer that dispatches per-field based on this.
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

/**
 * Per-field schema. Discriminated union on render_hint so each variant
 * can carry only the props it needs (e.g., bar has max, enum_chip has options).
 */

const baseField = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case keys"),
  label: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
});

export const BarFieldSchema = baseField.extend({
  render_hint: z.literal("bar"),
  min: z.number().default(0),
  max: z.number().positive(),
  default: z.number(),
  color: z.enum(["red", "blue", "green", "amber", "purple"]).optional(),
});

export const ProgressRingFieldSchema = baseField.extend({
  render_hint: z.literal("progress_ring"),
  min: z.number().default(0),
  max: z.number().positive().default(100),
  default: z.number(),
  color: z.enum(["red", "blue", "green", "amber", "purple", "rose"]).optional(),
});

export const NumberFieldSchema = baseField.extend({
  render_hint: z.literal("number"),
  default: z.number(),
  prefix: z.string().max(8).optional(), // e.g., "HK$"
  suffix: z.string().max(8).optional(), // e.g., " 分"
});

export const EnumChipFieldSchema = baseField.extend({
  render_hint: z.literal("enum_chip"),
  options: z.array(z.string().min(1)).min(2).max(12),
  default: z.string(),
  color_map: z.record(z.string(), z.string()).optional(), // option → color name
});

export const InventoryItemSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().nonnegative().optional(),
  icon: z.string().optional(), // emoji or short label
  note: z.string().optional(),
});

export const InventoryListFieldSchema = baseField.extend({
  render_hint: z.literal("inventory_list"),
  default: z.array(InventoryItemSchema).default([]),
  max_items: z.number().int().positive().optional(),
});

export const RelationshipGraphFieldSchema = baseField.extend({
  render_hint: z.literal("relationship_graph"),
  // Map of NPC name (or id) → relationship score (-100..100)
  default: z.record(z.string(), z.number()).default({}),
});

export const MeterWithLabelFieldSchema = baseField.extend({
  render_hint: z.literal("meter_with_label"),
  min: z.number().default(0),
  max: z.number().positive(),
  default: z.number(),
  unit: z.string().max(8).optional(),
});

export const PortraitFieldSchema = baseField.extend({
  render_hint: z.literal("portrait"),
  default: z.string().url().or(z.literal("")).default(""),
  fallback_emoji: z.string().max(4).default("👤"),
});

export const NoteFieldSchema = baseField.extend({
  render_hint: z.literal("note"),
  default: z.string().default(""),
  max_length: z.number().int().positive().default(500),
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
 * renders them in this sequence. Group headers can be inserted between
 * fields for visual grouping (v1.5).
 */
export const StateSchemaShape = z.object({
  version: z.literal("story-engine/state/v1").default("story-engine/state/v1"),
  fields: z.array(FieldSchema).min(1).max(20),
});

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
