"use client";

import { z } from "zod";
import {
  type MeterWithLabelFieldSchema,
  numberFormatHints,
} from "@/schemas/state-schema";

type Field = z.infer<typeof MeterWithLabelFieldSchema>;

export function MeterWithLabelRenderer({
  field,
  value,
}: {
  field: Field;
  value: number;
}) {
  const min = 0;
  const pct = Math.max(
    0,
    Math.min(100, ((value - min) / (field.max - min)) * 100),
  );
  const { suffix } = numberFormatHints(field.key);

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {field.label}
      </div>
      <div className="rounded-lg border border-border/60 bg-card px-2.5 py-2">
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-base font-bold tabular-nums">{value}</span>
          <span className="text-xs text-muted-foreground">
            / {field.max}
            {suffix ? ` ${suffix.trim()}` : ""}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
