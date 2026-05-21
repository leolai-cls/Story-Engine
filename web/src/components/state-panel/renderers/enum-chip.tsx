"use client";

import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import type { EnumChipFieldSchema } from "@/schemas/state-schema";

type Field = z.infer<typeof EnumChipFieldSchema>;

const DEFAULT_COLORS = ["sky", "emerald", "amber", "rose", "violet", "fuchsia"];

function pickColorClass(idx: number): string {
  const named = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
  return `bg-${named}-100 dark:bg-${named}-950/40 text-${named}-700 dark:text-${named}-300 border-${named}-200/60 dark:border-${named}-900/60`;
}

export function EnumChipRenderer({
  field,
  value,
}: {
  field: Field;
  value: string;
}) {
  const currentIdx = field.options.indexOf(value);
  const colorClass =
    currentIdx >= 0
      ? pickColorClass(currentIdx)
      : "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {field.label}
      </div>
      <Badge
        variant="outline"
        className={`text-xs font-medium px-2.5 py-0.5 ${colorClass}`}
      >
        {value}
      </Badge>
    </div>
  );
}
