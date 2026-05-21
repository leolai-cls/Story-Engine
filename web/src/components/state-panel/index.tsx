"use client";

import { useMemo } from "react";
import type { Field, StateSchema } from "@/schemas/state-schema";
import { getFieldValue, INTERNAL_STATE_KEY_PREFIX } from "@/schemas/state-schema";
import { BarRenderer } from "./renderers/bar";
import { ProgressRingRenderer } from "./renderers/progress-ring";
import { NumberRenderer } from "./renderers/number";
import { EnumChipRenderer } from "./renderers/enum-chip";
import { InventoryListRenderer } from "./renderers/inventory-list";
import { RelationshipGraphRenderer } from "./renderers/relationship-graph";
import { MeterWithLabelRenderer } from "./renderers/meter-with-label";
import { PortraitRenderer } from "./renderers/portrait";
import { NoteRenderer } from "./renderers/note";

/**
 * Type-safe coercions for renderer values. AUDIT FIX (STATE-M-12):
 * Previously the dispatcher did `Number(value ?? field.default)` and
 * `String(value ?? field.default)` blindly — `Number({foo:1})` returns
 * NaN, `String(null)` returns "null". Both render as visually-broken
 * fields with no recovery. Now: if the value doesn't match the expected
 * shape, fall back to `field.default` instead of fabricating bad data.
 */
function safeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function safeString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  return fallback;
}

const warnedHints = new Set<string>();
function warnUnknownHint(hint: string) {
  if (warnedHints.has(hint)) return;
  warnedHints.add(hint);
  console.warn(
    `[state-panel] unknown render_hint "${hint}" — skipping. ` +
      `Schema may have drifted from current code; check state_schema vs. RENDER_HINTS.`,
  );
}

/**
 * DynamicStatePanel — the heart of "故事自適應介面".
 *
 * Walks story.state_schema.fields, dispatches each to its matching
 * renderer based on render_hint, pulling current value from playthrough
 * state. Reorder + animate state changes via CSS transition (per-renderer).
 *
 * Props:
 *   - schema: the story's StateSchema (defines field set + render hints)
 *   - state: the playthrough's current_state (key → value lookup)
 *   - title: optional panel header (e.g., character name)
 */
export function DynamicStatePanel({
  schema,
  state,
  title,
  className,
}: {
  schema: StateSchema;
  state: Record<string, unknown>;
  title?: string;
  className?: string;
}) {
  // AUDIT FIX (STATE-M-09 follow-through): hide any engine-internal `__*` keys
  // even if they somehow ended up in schema.fields (regex disallows them but
  // belt-and-braces).
  const fields = useMemo(
    () => schema.fields.filter((f) => !f.key.startsWith(INTERNAL_STATE_KEY_PREFIX)),
    [schema],
  );

  return (
    <aside
      className={`rounded-xl border border-border/60 bg-card/50 backdrop-blur p-4 space-y-4 ${className ?? ""}`}
    >
      {title && (
        <div className="flex items-center gap-2 pb-3 border-b border-border/40">
          <h3 className="font-bold text-sm tracking-tight">{title}</h3>
        </div>
      )}

      <div className="space-y-4">
        {fields.map((field) => (
          <FieldRow key={field.key} field={field} value={getFieldValue(state, field)} />
        ))}
      </div>
    </aside>
  );
}

function FieldRow({ field, value }: { field: Field; value: unknown }) {
  // Dispatch to renderer based on render_hint. Each renderer is responsible
  // for its own type narrowing via z.infer<typeof XSchema>.
  switch (field.render_hint) {
    case "bar":
      return <BarRenderer field={field} value={safeNumber(value, field.default)} />;
    case "progress_ring":
      return (
        <ProgressRingRenderer field={field} value={safeNumber(value, field.default)} />
      );
    case "number":
      return <NumberRenderer field={field} value={safeNumber(value, field.default)} />;
    case "enum_chip":
      return (
        <EnumChipRenderer field={field} value={safeString(value, field.default)} />
      );
    case "inventory_list":
      return (
        <InventoryListRenderer
          field={field}
          value={Array.isArray(value) ? value : field.default}
        />
      );
    case "relationship_graph":
      return (
        <RelationshipGraphRenderer
          field={field}
          value={
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as Record<string, number>)
              : field.default
          }
        />
      );
    case "meter_with_label":
      return (
        <MeterWithLabelRenderer field={field} value={safeNumber(value, field.default)} />
      );
    case "portrait":
      return (
        <PortraitRenderer field={field} value={safeString(value, field.default)} />
      );
    case "note":
      return <NoteRenderer field={field} value={safeString(value, field.default)} />;
    default: {
      // AUDIT FIX (STATE-M-10): exhaustive fallback + visible warning.
      // TS will catch new hints at compile time via this never-cast; this
      // runtime branch handles legacy data (older schema versions). Renders
      // a small muted line so the player isn't left wondering what happened.
      const _exhaustive: never = field;
      void _exhaustive;
      const hint = (field as { render_hint?: string }).render_hint ?? "unknown";
      warnUnknownHint(hint);
      return (
        <div className="text-xs text-muted-foreground italic">
          (未支援嘅 field：{hint})
        </div>
      );
    }
  }
}
