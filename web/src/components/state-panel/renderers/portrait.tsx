"use client";

import { z } from "zod";
import type { PortraitFieldSchema } from "@/schemas/state-schema";
import Image from "next/image";

type Field = z.infer<typeof PortraitFieldSchema>;

export function PortraitRenderer({
  field,
  value,
}: {
  field: Field;
  value: string;
}) {
  const hasImage = value && value.length > 0 && /^https?:\/\//.test(value);

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-12 w-12 shrink-0 rounded-full overflow-hidden bg-secondary border-2 border-border">
        {hasImage ? (
          <Image
            src={value}
            alt={field.label}
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-2xl">
            👤
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold truncate">{field.label}</div>
      </div>
    </div>
  );
}
