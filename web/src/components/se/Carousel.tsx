"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Horizontal carousel row — Netflix pattern.
 * Title + mono subtitle (e.g.「熱門 · TRENDING NOW」)
 * Smart-hide if items empty (returns null).
 * Optional「全部」link top-right.
 *
 * Children = pre-rendered cards (StoryCard / ContinueCard / etc).
 */

export function Carousel({
  title,
  sub,
  moreHref,
  icon,
  children,
  padX = 56,
  empty,
}: {
  title: string;
  sub?: string;
  moreHref?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  padX?: number;
  /** If true, returns null (smart-hide). */
  empty?: boolean;
}) {
  // Wave 2 i18n migration (2026-05-27): "全部" label localized.
  const tLib = useTranslations("library.rail");
  if (empty) return null;
  return (
    <section className="mt-7" style={{ paddingLeft: padX }}>
      <header
        className="flex items-baseline gap-3 mb-3"
        style={{ paddingRight: padX }}
      >
        {icon && (
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-md"
            style={{
              background: "var(--se-surface-2)",
              color: "var(--se-fg-muted)",
            }}
          >
            {icon}
          </span>
        )}
        <h2
          className="m-0 text-base font-semibold"
          style={{
            color: "var(--se-fg)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        {sub && (
          <span className="se-mono text-[10.5px]" style={{ color: "var(--se-fg-dim)" }}>
            {sub}
          </span>
        )}
        <div className="flex-1" />
        {moreHref && (
          <Link
            href={moreHref}
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: "var(--se-fg-muted)" }}
          >
            {tLib("all")} <ChevronRight size={11} />
          </Link>
        )}
      </header>
      <div
        className="se-row-scroll flex gap-3.5 overflow-x-auto pb-3.5"
        style={{ paddingRight: padX }}
      >
        {children}
      </div>
    </section>
  );
}
