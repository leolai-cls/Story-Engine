"use client";

/**
 * Theme toggle — light / dark / system (settings overhaul 2026-06-01).
 *
 * globals.css already ships a full `.dark` token set; this surfaces the
 * control. Source of truth for rendering is localStorage("kieio-theme") so
 * the no-flash inline script in layout.tsx can apply `.dark` before paint.
 * We ALSO persist to profiles.theme_preference for cross-device sync.
 */

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor } from "lucide-react";
import { setThemePreference } from "@/app/[locale]/settings/actions";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "kieio-theme";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle({ initial }: { initial: Theme }) {
  const t = useTranslations("settings.preferences");
  const [theme, setTheme] = useState<Theme>(initial);
  const [, startTransition] = useTransition();

  // On mount, seed localStorage from the server value if the device has none
  // yet (first visit on this browser), so the inline script picks it up next load.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (!stored) {
        localStorage.setItem(STORAGE_KEY, initial);
      } else if (stored !== theme) {
        setTheme(stored);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    applyTheme(next);
    startTransition(() => {
      void setThemePreference(next);
    });
  }

  const OPTS: { v: Theme; icon: typeof Sun; label: string }[] = [
    { v: "light", icon: Sun, label: t("themeLight") },
    { v: "dark", icon: Moon, label: t("themeDark") },
    { v: "system", icon: Monitor, label: t("themeSystem") },
  ];

  return (
    <div
      className="inline-flex rounded-lg p-0.5 gap-0.5"
      style={{ background: "var(--se-surface-2)", border: "1px solid var(--se-border)" }}
    >
      {OPTS.map((o) => {
        const Ico = o.icon;
        const active = theme === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => pick(o.v)}
            aria-pressed={active}
            className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs se-cjk transition-colors"
            style={{
              background: active ? "var(--se-surface)" : "transparent",
              color: active ? "var(--se-fg)" : "var(--se-fg-muted)",
              fontWeight: active ? 600 : 400,
              boxShadow: active ? "var(--se-shadow-pop, none)" : "none",
            }}
          >
            <Ico size={13} />
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
