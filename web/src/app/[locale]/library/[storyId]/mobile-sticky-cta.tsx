"use client";

import { Play } from "lucide-react";

/**
 * B3 audit fix · Story Detail mobile sticky bottom CTA.
 * Hidden on md+ (desktop has CTA in main flow). On mobile, sticks to
 * bottom of viewport so user can act without scrolling back to top.
 *
 * Scrolls smoothly to the actions section in main flow (where the real
 * fork button lives) — avoids duplicating fork logic + modal.
 */
export function MobileStickyForkCta({ disabled }: { disabled?: boolean }) {
  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 px-4 py-3"
      style={{
        background: "rgba(251,250,246,0.95)",
        backdropFilter: "blur(14px)",
        borderTop: "1px solid var(--se-border)",
      }}
    >
      <a
        href="#story-actions"
        className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-md font-semibold se-cjk disabled:opacity-50"
        style={{
          background: disabled ? "var(--se-surface-2)" : "var(--se-fg)",
          color: disabled ? "var(--se-fg-muted)" : "var(--se-bg)",
        }}
        aria-disabled={disabled}
      >
        <Play size={14} />
        {disabled ? "登入之後可以玩" : "開始扮演"}
      </a>
    </div>
  );
}
