"use client";

import { z } from "zod";
import type { BarFieldSchema } from "@/schemas/state-schema";

type BarField = z.infer<typeof BarFieldSchema>;

const COLOR_CLASSES: Record<NonNullable<BarField["color"]>, string> = {
  red: "from-rose-500 to-rose-600",
  blue: "from-sky-500 to-sky-600",
  green: "from-emerald-500 to-emerald-600",
  amber: "from-amber-500 to-amber-600",
  purple: "from-violet-500 to-violet-600",
};

export function BarRenderer({
  field,
  value,
}: {
  field: BarField;
  value: number;
}) {
  const pct = Math.max(
    0,
    Math.min(100, ((value - field.min) / (field.max - field.min)) * 100),
  );
  const colorClass = COLOR_CLASSES[field.color ?? "red"];

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {field.label}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}/{field.max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
