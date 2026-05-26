"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Cover } from "./Cover";
import {
  Menu,
  X,
  Plus,
  Sparkles,
  Library,
  BookMarked,
  Settings as SettingsIcon,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { signOut } from "@/app/[locale]/login/actions";
import { KieioLogo } from "@/components/brand/KieioLogo";
import type { GenreKey } from "./genre";

/**
 * Global mobile slide-out drawer · ChatGPT / Claude / Grok pattern.
 *
 * Founder feedback (2026-05-25): "I thought we said side menu works like
 * Grok, Claude, ChatGPT" — those 3 apps all have a top-left hamburger that
 * opens a left drawer with: recent conversations + new chat + settings.
 *
 * This is the GLOBAL mobile drawer (every authed page). Separate from
 * PlaythroughSidebar (which is specific to the /play/[id] screen and shows
 * a desktop persistent rail).
 *
 * Mobile-only render (lg:hidden). Desktop has the SiteHeader nav buttons.
 */

export type DrawerPlaythrough = {
  id: string;
  storyId: string;
  storyTitle: string;
  storyGenre?: GenreKey | string | null;
  turnCount: number;
  relativeTime: string;
};

export function MobileNavDrawer({
  locale,
  isAuthed,
  playthroughs,
  totalPlaythroughCount,
  labels,
}: {
  locale: string;
  isAuthed: boolean;
  playthroughs: DrawerPlaythrough[];
  totalPlaythroughCount: number;
  labels: {
    library: string;
    myGames: string;
    pricing: string;
    settings: string;
    login: string;
    signup: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const close = () => setOpen(false);

  // Track mount status so createPortal only runs client-side (avoids SSR
  // hydration mismatch · document.body doesn't exist on server).
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while drawer open — otherwise mobile users can scroll
  // the page behind the backdrop, which feels broken.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /**
   * SHIP BUG FIX (2026-05-25): drawer was rendered as descendant of
   * SiteHeader which has `backdrop-blur`. Per CSS spec, `backdrop-filter`
   * creates a NEW containing block for descendants with `position: fixed`,
   * so `fixed inset-0` resolved to the SiteHeader's 64px box instead of
   * the viewport — drawer was squashed to header height, body collapsed,
   * footer crammed under header. Founder saw "only menu's text".
   *
   * Fix: portal the overlay to document.body so it escapes the
   * containing-block trap. Hamburger trigger button stays inside header
   * (no fixed positioning · normal flow OK).
   */
  const drawerOverlay = open ? (
    <div
      className="fixed inset-0 z-[100] flex"
      role="dialog"
      aria-modal="true"
    >
          {/* Drawer (slides in from left) */}
          <aside
            className="flex flex-col w-[290px] max-w-[85vw] h-full"
            style={{
              background: "var(--se-bg-elev)",
              borderRight: "1px solid var(--se-border)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 h-14 flex-none"
              style={{ borderBottom: "1px solid var(--se-border)" }}
            >
              <div
                className="flex items-center"
                style={{ color: "var(--se-fg)" }}
              >
                {/* Brandbook v4: (o) Lakers Purple + KIEIO Termina Bold */}
                <KieioLogo size={13} markColor="purple" wordColor="default" />
              </div>
              <button
                type="button"
                onClick={close}
                className="p-1 rounded"
                style={{ color: "var(--se-fg-muted)" }}
                aria-label="關閉"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body (scrollable) */}
            <div className="flex-1 min-h-0 overflow-y-auto se-row-scroll">
              {isAuthed ? (
                <AuthedBody
                  locale={locale}
                  playthroughs={playthroughs}
                  totalPlaythroughCount={totalPlaythroughCount}
                  labels={labels}
                  onItemClick={close}
                />
              ) : (
                <AnonBody locale={locale} labels={labels} onItemClick={close} />
              )}
            </div>

            {/* Footer */}
            {isAuthed && (
              <div
                className="flex-none px-3 py-3"
                style={{ borderTop: "1px solid var(--se-border)" }}
              >
                <Link
                  href={`/${locale}/settings`}
                  onClick={close}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm"
                  style={{ color: "var(--se-fg-2)" }}
                >
                  <SettingsIcon size={14} />
                  <span className="se-cjk">{labels.settings}</span>
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm"
                    style={{ color: "var(--se-fg-muted)" }}
                  >
                    <LogOut size={14} />
                    <span className="se-cjk">登出</span>
                  </button>
                </form>
              </div>
            )}
      </aside>

      {/* Backdrop (click to close) */}
      <div
        className="flex-1 bg-black/40"
        onClick={close}
        aria-label="關閉抽屜"
      />
    </div>
  ) : null;

  return (
    <>
      {/* Hamburger trigger — stays inside SiteHeader (no fixed positioning) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-md mr-2"
        style={{
          color: "var(--se-fg-2)",
          background: "transparent",
        }}
        aria-label="開啟選單"
      >
        <Menu size={18} />
      </button>

      {/* Drawer overlay rendered into document.body to escape any
          containing-block trap (SiteHeader's backdrop-blur). */}
      {mounted && drawerOverlay && createPortal(drawerOverlay, document.body)}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Body — Authed
// ─────────────────────────────────────────────────────────────

function AuthedBody({
  locale,
  playthroughs,
  totalPlaythroughCount,
  labels,
  onItemClick,
}: {
  locale: string;
  playthroughs: DrawerPlaythrough[];
  totalPlaythroughCount: number;
  labels: { library: string; myGames: string; pricing: string; settings: string; login: string; signup: string };
  onItemClick: () => void;
}) {
  return (
    <>
      {/* New story CTA */}
      <div className="px-3 pt-3">
        <Link
          href={`/${locale}/library`}
          onClick={onItemClick}
          className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium"
          style={{
            background: "var(--se-fg)",
            color: "var(--se-bg)",
          }}
        >
          <Plus size={14} />
          <span className="se-cjk">開新故事</span>
        </Link>
      </div>

      {/* Playthroughs section */}
      {playthroughs.length > 0 && (
        <div className="px-3 pt-4">
          <div
            className="flex items-center justify-between px-1 mb-2"
            style={{ color: "var(--se-fg-dim)" }}
          >
            <span
              className="se-mono text-[10px]"
              style={{ letterSpacing: "0.08em" }}
            >
              繼續玩
            </span>
            {totalPlaythroughCount > playthroughs.length && (
              <Link
                href={`/${locale}/my`}
                onClick={onItemClick}
                className="se-mono text-[10px]"
                style={{
                  color: "var(--se-fg-muted)",
                  letterSpacing: "0.04em",
                }}
              >
                全部 ({totalPlaythroughCount})
              </Link>
            )}
          </div>
          {playthroughs.map((p) => (
            <DrawerPlaythroughItem
              key={p.id}
              p={p}
              locale={locale}
              onClick={onItemClick}
            />
          ))}
        </div>
      )}

      {/* Divider before nav links */}
      <div className="px-3 mt-4">
        <div
          style={{
            height: 1,
            background: "var(--se-border)",
            margin: "0 4px",
          }}
        />
      </div>

      {/* Nav links */}
      <nav className="px-3 pt-2 pb-3">
        <DrawerNavLink
          href={`/${locale}/library`}
          icon={<Library size={14} />}
          label={labels.library}
          onClick={onItemClick}
        />
        <DrawerNavLink
          href={`/${locale}/my`}
          icon={<BookMarked size={14} />}
          label={labels.myGames}
          onClick={onItemClick}
        />
        <DrawerNavLink
          href={`/${locale}/pricing`}
          icon={<Sparkles size={14} />}
          label={labels.pricing}
          onClick={onItemClick}
        />
      </nav>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Body — Anon
// ─────────────────────────────────────────────────────────────

function AnonBody({
  locale,
  labels,
  onItemClick,
}: {
  locale: string;
  labels: { library: string; myGames: string; pricing: string; settings: string; login: string; signup: string };
  onItemClick: () => void;
}) {
  return (
    <>
      {/* Login CTA */}
      <div className="px-3 pt-3">
        <Link
          href={`/${locale}/login`}
          onClick={onItemClick}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium"
          style={{
            background: "var(--se-fg)",
            color: "var(--se-bg)",
          }}
        >
          {labels.signup}
        </Link>
      </div>

      <nav className="px-3 pt-4">
        <DrawerNavLink
          href={`/${locale}/library`}
          icon={<Library size={14} />}
          label={labels.library}
          onClick={onItemClick}
        />
        <DrawerNavLink
          href={`/${locale}/pricing`}
          icon={<Sparkles size={14} />}
          label={labels.pricing}
          onClick={onItemClick}
        />
        <DrawerNavLink
          href={`/${locale}/login`}
          icon={<LogOut size={14} style={{ transform: "rotate(180deg)" }} />}
          label={labels.login}
          onClick={onItemClick}
        />
      </nav>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Atoms
// ─────────────────────────────────────────────────────────────

function DrawerNavLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm"
      style={{ color: "var(--se-fg-2)" }}
    >
      {icon}
      <span className="se-cjk">{label}</span>
    </Link>
  );
}

function DrawerPlaythroughItem({
  p,
  locale,
  onClick,
}: {
  p: DrawerPlaythrough;
  locale: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={`/${locale}/play/${p.id}`}
      onClick={onClick}
      className="flex gap-2.5 p-2 rounded-md mb-1"
      style={{ background: "transparent" }}
    >
      <div style={{ width: 34, flex: "none" }}>
        <Cover
          storyId={p.storyId}
          genre={(p.storyGenre as GenreKey) ?? undefined}
          ratio="3 / 4"
          size="sm"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className="text-[13px] font-medium se-cjk truncate"
          style={{
            color: "var(--se-fg)",
            letterSpacing: "-0.005em",
          }}
        >
          {p.storyTitle}
        </h4>
        <div
          className="se-mono text-[10px] mt-0.5"
          style={{
            color: "var(--se-fg-dim)",
            letterSpacing: "0.04em",
          }}
        >
          T{p.turnCount} · {p.relativeTime.toUpperCase()}
        </div>
      </div>
      <ArrowRight
        size={12}
        style={{ color: "var(--se-fg-dim)", flex: "none", alignSelf: "center" }}
      />
    </Link>
  );
}
