"use client";

import Link from "next/link";
import { Cover } from "./Cover";
import { X, Plus, ArrowRight, Sparkles } from "lucide-react";
import type { GenreKey } from "./genre";

/**
 * Playthrough sidebar — ChatGPT-style "your conversations" rail.
 *
 * Desktop (lg+): persistent left rail (~240px wide).
 * Mobile: hidden by default · drawer opens via `open` prop (parent owns
 * state so the trigger can live in the play screen header).
 *
 * Listing is a slice (top N recent playthroughs) so the sidebar stays
 * scannable. "查看全部" footer link sends user to /my for full management.
 */

export type SidebarPlaythrough = {
  id: string;
  storyId: string;
  storyTitle: string;
  storyGenre?: GenreKey | string | null;
  turnCount: number;
  status: string;
  relativeTime: string;
};

export function PlaythroughSidebar({
  locale,
  currentPlaythroughId,
  playthroughs,
  totalCount,
  open,
  onOpenChange,
}: {
  locale: string;
  currentPlaythroughId: string;
  playthroughs: SidebarPlaythrough[];
  totalCount: number;
  /** Mobile drawer state. Desktop rail ignores this. */
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <>
      {/* Desktop persistent rail */}
      <aside
        className="hidden lg:flex flex-col flex-none"
        style={{
          width: 240,
          background: "var(--se-bg-elev)",
          borderRight: "1px solid var(--se-border)",
          height: "calc(100vh - 48px)", // slim header is h-12 (48px)
          position: "sticky",
          top: 48,
        }}
      >
        <SidebarBody
          locale={locale}
          currentPlaythroughId={currentPlaythroughId}
          playthroughs={playthroughs}
          totalCount={totalCount}
          onItemClick={() => {}}
          showMobileClose={false}
          onMobileClose={() => {}}
        />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex-1 bg-black/40"
            onClick={() => onOpenChange(false)}
            aria-label="關閉清單"
          />
          <aside
            className="flex flex-col w-[280px] max-w-[80vw]"
            style={{
              background: "var(--se-bg-elev)",
              borderLeft: "1px solid var(--se-border)",
            }}
          >
            <SidebarBody
              locale={locale}
              currentPlaythroughId={currentPlaythroughId}
              playthroughs={playthroughs}
              totalCount={totalCount}
              onItemClick={() => onOpenChange(false)}
              showMobileClose={true}
              onMobileClose={() => onOpenChange(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarBody({
  locale,
  currentPlaythroughId,
  playthroughs,
  totalCount,
  onItemClick,
  showMobileClose,
  onMobileClose,
}: {
  locale: string;
  currentPlaythroughId: string;
  playthroughs: SidebarPlaythrough[];
  totalCount: number;
  onItemClick: () => void;
  showMobileClose: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-11 flex-none"
        style={{ borderBottom: "1px solid var(--se-border)" }}
      >
        <span
          className="se-mono text-[10.5px]"
          style={{
            color: "var(--se-fg-dim)",
            letterSpacing: "0.08em",
          }}
        >
          MY GAMES
        </span>
        {showMobileClose ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="p-1 rounded"
            style={{ color: "var(--se-fg-muted)" }}
            aria-label="關閉"
          >
            <X size={14} />
          </button>
        ) : (
          <Link
            href={`/${locale}/my`}
            onClick={onItemClick}
            className="se-mono text-[10px]"
            style={{
              color: "var(--se-fg-muted)",
              letterSpacing: "0.04em",
            }}
          >
            全部 ({totalCount})
          </Link>
        )}
      </div>

      {/* New story CTA — route fix (2026-05-27): was /library (browse)
          but label implies creation. Now points at /stories/new where the
          AI wizard lives. */}
      <Link
        href={`/${locale}/stories/new`}
        onClick={onItemClick}
        className="mx-3 mt-3 mb-2 inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium flex-none"
        style={{
          background: "var(--se-surface)",
          border: "1px solid var(--se-border)",
          color: "var(--se-fg-2)",
        }}
      >
        <Plus size={13} />
        <span className="se-cjk">開新故事</span>
      </Link>

      {/* List (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto se-row-scroll px-2 pb-2">
        {playthroughs.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs se-cjk"
            style={{ color: "var(--se-fg-dim)" }}
          >
            冇其他 playthrough
          </div>
        ) : (
          playthroughs.map((p) => (
            <SidebarItem
              key={p.id}
              p={p}
              locale={locale}
              active={p.id === currentPlaythroughId}
              onClick={onItemClick}
            />
          ))
        )}
      </div>

      {/* Footer: see all link */}
      {totalCount > playthroughs.length && (
        <Link
          href={`/${locale}/my`}
          onClick={onItemClick}
          className="flex items-center justify-between px-4 py-3 text-xs flex-none"
          style={{
            borderTop: "1px solid var(--se-border)",
            color: "var(--se-fg-muted)",
          }}
        >
          <span className="se-cjk">查看全部 {totalCount} 個</span>
          <ArrowRight size={12} />
        </Link>
      )}
    </>
  );
}

function SidebarItem({
  p,
  locale,
  active,
  onClick,
}: {
  p: SidebarPlaythrough;
  locale: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={`/${locale}/play/${p.id}`}
      onClick={onClick}
      className="flex gap-2.5 p-2 rounded-md mb-1 transition-colors"
      style={{
        background: active ? "var(--se-surface-hover)" : "transparent",
        border: `1px solid ${active ? "var(--se-border-strong)" : "transparent"}`,
      }}
    >
      <div style={{ width: 32, flex: "none" }}>
        <Cover
          storyId={p.storyId}
          genre={(p.storyGenre as GenreKey) ?? undefined}
          ratio="3 / 4"
          size="sm"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {active && (
            <Sparkles
              size={9}
              style={{ color: "var(--se-accent)", flex: "none" }}
            />
          )}
          <h4
            className="text-[12.5px] font-medium se-cjk truncate"
            style={{
              color: active ? "var(--se-fg)" : "var(--se-fg-2)",
              letterSpacing: "-0.005em",
            }}
          >
            {p.storyTitle}
          </h4>
        </div>
        <div
          className="se-mono text-[9.5px] mt-0.5"
          style={{
            color: "var(--se-fg-dim)",
            letterSpacing: "0.04em",
          }}
        >
          T{p.turnCount} · {p.relativeTime.toUpperCase()}
        </div>
      </div>
    </Link>
  );
}
