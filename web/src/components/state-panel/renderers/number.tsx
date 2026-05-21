"use client";

import { z } from "zod";
import {
  type NumberFieldSchema,
  numberFormatHints,
} from "@/schemas/state-schema";

type Field = z.infer<typeof NumberFieldSchema>;

export function NumberRenderer({
  field,
  value,
}: {
  field: Field;
  value: number;
}) {
  const { prefix, suffix } = numberFormatHints(field.key);
  return (
    <div className="rounded-lg bg-card border border-border/60 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {field.label}
      </div>
      <div className="text-lg font-bold tabular-nums">
        {prefix}
        {value.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
}
