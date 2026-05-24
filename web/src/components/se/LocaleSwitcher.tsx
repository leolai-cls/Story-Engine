"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { useTransition, useState, useRef, useEffect } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";

/**
 * Locale switcher — cross-cutting · 繁中 / 简中 / EN.
 * Placement: SiteHeader topbar (right of nav).
 * Persistence: next-intl middleware handles cookie + URL prefix on switch.
 *
 * Affects UI strings only — story narrative language is set per-story
 * (separate `language` field on creation).
 */

const LOCALES = [
  { v: "zh-Hant", label: "繁中", full: "繁體中文 · 香港 / 台灣" },
  { v: "zh-Hans", label: "简中", full: "简体中文" },
  { v: "en", label: "EN", full: "English" },
] as const;

export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = LOCALES.find((o) => o.v === locale) ?? LOCALES[0];

  function pick(v: string) {
    setOpen(false);
    startTransition(() => {
      router.replace(pathname, { locale: v as "zh-Hant" | "zh-Hans" | "en" });
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs"
        style={{
          color: "var(--se-fg-2)",
          background: "var(--se-surface)",
          border: "1px solid var(--se-border)",
        }}
      >
        <Globe size={13} color="var(--se-fg-muted)" />
        {current.label}
        <ChevronDown size={10} color="var(--se-fg-muted)" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] py-1 rounded-md"
          style={{
            background: "var(--se-surface)",
            border: "1px solid var(--se-border)",
            boxShadow: "var(--se-shadow-pop)",
          }}
        >
          {LOCALES.map((o) => {
            const a = o.v === locale;
            return (
              <button
                key={o.v}
                onClick={() => pick(o.v)}
                className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors hover:bg-[color:var(--se-surface-hover)]"
              >
                <span
                  style={{
                    width: 14,
                    color: a ? "var(--se-accent)" : "transparent",
                  }}
                >
                  <Check size={12} />
                </span>
                <div className="flex-1">
                  <div
                    className="text-sm se-cjk"
                    style={{
                      fontWeight: a ? 500 : 400,
                      color: a ? "var(--se-fg)" : "var(--se-fg-2)",
                    }}
                  >
                    {o.label}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--se-fg-muted)" }}>
                    {o.full}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
