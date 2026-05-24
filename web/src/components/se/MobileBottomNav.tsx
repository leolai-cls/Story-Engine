"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { Grid3X3, Play, Plus, User } from "lucide-react";

/**
 * A6 audit fix · Mobile bottom tab nav (md:hidden).
 * 4 tabs match designer mock: 故事 / 進行中 / 創作 / 我.
 * Sticky bottom · backdrop-blur surface · active state via pathname match.
 */

const TABS = [
  { id: "library", href: "/library", icon: Grid3X3, label: "故事" },
  { id: "play", href: "/library?continue=1", icon: Play, label: "進行中" },
  { id: "new", href: "/stories/new", icon: Plus, label: "創作" },
  { id: "settings", href: "/settings", icon: User, label: "我" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around"
      style={{
        height: 56,
        background: "rgba(251,250,246,0.92)",
        backdropFilter: "blur(14px)",
        borderTop: "1px solid var(--se-border)",
      }}
    >
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href.split("?")[0]);
        const Ico = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href as never}
            className="flex flex-col items-center justify-center gap-0.5 flex-1"
            style={{
              color: active ? "var(--se-fg)" : "var(--se-fg-dim)",
            }}
          >
            <Ico size={18} />
            <span className="text-[10px] se-cjk">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
