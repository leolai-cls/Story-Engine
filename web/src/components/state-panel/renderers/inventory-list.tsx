"use client";

import { z } from "zod";
import type {
  InventoryListFieldSchema,
  InventoryItemSchema,
} from "@/schemas/state-schema";

type Field = z.infer<typeof InventoryListFieldSchema>;
type Item = z.infer<typeof InventoryItemSchema>;

export function InventoryListRenderer({
  field,
  value,
}: {
  field: Field;
  value: Item[];
}) {
  const items = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {field.label}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-1.5">空</div>
      ) : (
        <div className="grid grid-cols-1 gap-1">
          {items.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center gap-2 rounded-md bg-card border border-border/40 px-2 py-1"
            >
              <span className="text-base shrink-0">{item.icon || "🎒"}</span>
              <span className="text-xs font-medium truncate flex-1">
                {item.name}
              </span>
              {item.count > 1 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  ×{item.count}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
