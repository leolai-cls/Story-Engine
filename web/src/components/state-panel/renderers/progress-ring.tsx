"use client";

import { z } from "zod";
import {
  type ProgressRingFieldSchema,
  pickRingColor,
} from "@/schemas/state-schema";

type Field = z.infer<typeof ProgressRingFieldSchema>;

const COLORS: Record<
  "red" | "blue" | "green" | "amber" | "purple" | "rose",
  string
> = {
  red: "stroke-rose-500",
  blue: "stroke-sky-500",
  green: "stroke-emerald-500",
  amber: "stroke-amber-500",
  purple: "stroke-violet-500",
  rose: "stroke-rose-400",
};

export function ProgressRingRenderer({
  field,
  value,
}: {
  field: Field;
  value: number;
}) {
  // Progress rings always 0-100 (hardcoded — LLM only outputs default value)
  const pct = Math.max(0, Math.min(100, value));
  const R = 18;
  const C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  const colorClass = COLORS[pickRingColor(field.key)];

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
          <circle
            cx="24"
            cy="24"
            r={R}
            className="stroke-secondary"
            strokeWidth="4"
            fill="none"
          />
          <circle
            cx="24"
            cy="24"
            r={R}
            className={`${colorClass} transition-all duration-500 ease-out`}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C - dash}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums">
          {Math.round(pct)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold truncate">{field.label}</div>
      </div>
    </div>
  );
}
