"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cover } from "./Cover";
import { AXIS_TOKEN, type DispositionAxisKey, type GenreKey } from "./genre";
import { Play } from "lucide-react";

/**
 * Continue Playing card — Library row.
 * Wide (320-380px) · narrative snippet as resume anchor (NOT chapter — we
 * don't have chapters · per CLAUDE.md hard rule on emergent length).
 * Disposition delta surfaces 4-axis backend signal.
 */

export interface ActivePlaythroughData {
  playthroughId: string;
  storyId: string;
  storyTitle: string;
  storyGenre?: GenreKey | string;
  turn: number;
  /** Last AI narration snippet (1-2 sentences · for resume context). */
  snippet?: string | null;
  /** Most-recent disposition movement to surface. */
  delta?: {
    npc: string;
    axis: DispositionAxisKey;
    val: number;
  } | null;
  lastPlayed: string;
}

export function ContinueCard({
  p,
  locale,
}: {
  p: ActivePlaythroughData;
  locale: string;
}) {
  // Wave 2 i18n migration (2026-05-27): localize axis label + "繼續" button.
  const tAxes = useTranslations("axes");
  const tCard = useTranslations("library.continueCard");
  return (
    <Link
      href={`/${locale}/play/${p.playthroughId}`}
      className="flex-none flex gap-4 p-3.5 rounded-xl cursor-pointer transition-all"
      style={{
        width: "min(380px, 85vw)",
        background: "var(--se-surface)",
        border: "1px solid var(--se-border)",
        boxShadow: "var(--se-shadow-card)",
        transitionDuration: "200ms",
        transitionTimingFunction: "var(--se-ease)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--se-border-strong)";
        e.currentTarget.style.boxShadow = "var(--se-shadow-pop)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--se-border)";
        e.currentTarget.style.boxShadow = "var(--se-shadow-card)";
      }}
    >
      <div style={{ width: 92, flex: "none" }}>
        <Cover storyId={p.storyId} genre={p.storyGenre as GenreKey} ratio="3 / 4" size="sm" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div
          className="se-mono text-[10px]"
          style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
        >
          TURN {p.turn} · {p.lastPlayed.toUpperCase()}
        </div>
        <h3
          className="mt-1 text-[15px] font-semibold se-cjk whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ letterSpacing: "-0.005em" }}
        >
          {p.storyTitle}
        </h3>
        {p.snippet && (
          <p
            className="mt-1.5 text-xs se-cjk overflow-hidden"
            style={{
              color: "var(--se-fg-muted)",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {p.snippet}
          </p>
        )}
        <div className="flex-1 min-h-2" />
        <div
          className="flex items-center gap-2.5 pt-2.5"
          style={{ borderTop: "1px solid var(--se-border)" }}
        >
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background: "var(--se-fg)",
              color: "var(--se-bg)",
            }}
          >
            <Play size={10} />
            {tCard("resume")}
          </button>
          {p.delta && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--se-fg-2)" }}>
              <span style={{ color: "var(--se-fg-dim)" }}>{p.delta.npc}</span>
              <span
                className="se-mono font-medium"
                style={{ color: AXIS_TOKEN[p.delta.axis] }}
              >
                {tAxes(p.delta.axis)} {p.delta.val > 0 ? "+" : ""}
                {p.delta.val}
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
