"use client";

import { useMemo } from "react";
import type { Field, StateSchema } from "@/schemas/state-schema";
import { getFieldValue } from "@/schemas/state-schema";
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
  const fields = useMemo(() => schema.fields, [schema]);

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
      return <BarRenderer field={field} value={Number(value ?? field.default)} />;
    case "progress_ring":
      return (
        <ProgressRingRenderer field={field} value={Number(value ?? field.default)} />
      );
    case "number":
      return <NumberRenderer field={field} value={Number(value ?? field.default)} />;
    case "enum_chip":
      return (
        <EnumChipRenderer field={field} value={String(value ?? field.default)} />
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
            value && typeof value === "object"
              ? (value as Record<string, number>)
              : field.default
          }
        />
      );
    case "meter_with_label":
      return (
        <MeterWithLabelRenderer field={field} value={Number(value ?? field.default)} />
      );
    case "portrait":
      return (
        <PortraitRenderer field={field} value={String(value ?? field.default)} />
      );
    case "note":
      return <NoteRenderer field={field} value={String(value ?? field.default)} />;
  }
}
