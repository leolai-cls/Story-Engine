"use client";

import { z } from "zod";
import type { NoteFieldSchema } from "@/schemas/state-schema";

type Field = z.infer<typeof NoteFieldSchema>;

export function NoteRenderer({
  field,
  value,
}: {
  field: Field;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {field.label}
      </div>
      <div className="rounded-md border border-border/40 bg-card px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-wrap text-ink-soft min-h-[2rem]">
        {value || (
          <span className="italic text-muted-foreground">（空白）</span>
        )}
      </div>
    </div>
  );
}
