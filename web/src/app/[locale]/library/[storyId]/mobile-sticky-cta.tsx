"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * B3 audit fix · Story Detail mobile sticky bottom CTA.
 * Hidden on md+ (desktop has CTA in main flow). On mobile, sticks to
 * bottom of viewport so user can act without scrolling back to top.
 *
 * Wave 2 i18n migration (2026-05-27): localized via storyDetail.* catalog.
 */
export function MobileStickyForkCta({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("storyDetail.cta");
  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
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
        {disabled ? t("loginToPlay") : t("startPlaying")}
      </a>
    </div>
  );
}
