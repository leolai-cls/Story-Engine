"use client";

import { z } from "zod";
import { useTranslations } from "next-intl";
import type { RelationshipGraphFieldSchema } from "@/schemas/state-schema";

type Field = z.infer<typeof RelationshipGraphFieldSchema>;

function scoreToColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 20) return "bg-sky-500";
  if (score >= -20) return "bg-amber-500";
  if (score >= -60) return "bg-rose-400";
  return "bg-rose-600";
}

/**
 * Wave 2 i18n migration (2026-05-28): disposition bucket labels resolve via
 * `statePanel.relationshipGraph.buckets.*` catalog. Were hardcoded 繁中.
 */
type BucketKey =
  | "trust"
  | "close"
  | "friendly"
  | "stranger"
  | "wary"
  | "hostile";

function scoreBucket(score: number): BucketKey {
  if (score >= 80) return "trust";
  if (score >= 50) return "close";
  if (score >= 20) return "friendly";
  if (score >= -20) return "stranger";
  if (score >= -50) return "wary";
  return "hostile";
}

export function RelationshipGraphRenderer({
  field,
  value,
}: {
  field: Field;
  value: Record<string, number>;
}) {
  const t = useTranslations("statePanel.relationshipGraph");
  const entries = Object.entries(value ?? {});

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {field.label}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-1.5">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([name, score]) => {
            const clamped = Math.max(-100, Math.min(100, score));
            const pct = ((clamped + 100) / 200) * 100;
            return (
              <div key={name} className="space-y-0.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium truncate">{name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t(`buckets.${scoreBucket(clamped)}`)} ({clamped > 0 ? "+" : ""}
                    {clamped})
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden relative">
                  <div className="absolute top-0 bottom-0 w-px bg-border left-1/2" />
                  <div
                    className={`h-full ${scoreToColor(clamped)} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
