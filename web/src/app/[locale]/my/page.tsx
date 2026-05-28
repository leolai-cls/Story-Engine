import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Cover } from "@/components/se/Cover";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { getMyPlaythroughs, type MyPlaythroughRow } from "@/lib/community/queries";
import { Play, Sparkles, Archive, Trash2, BookOpen, Plus } from "lucide-react";
import type { GenreKey } from "@/components/se/genre";

type RelTimeFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export const dynamic = "force-dynamic";

/**
 * /[locale]/my — "我嘅遊戲" dedicated page.
 *
 * ChatGPT-style "your conversations" view. Lists ALL user playthroughs
 * (active + archived + abandoned) with status-tab filter + last-played
 * sort. Library page's Continue carousel only shows a slice — this is
 * the full management surface for resuming / reviewing past runs.
 *
 * Auth required (server redirect to /login if anon).
 */

type Tab = "all" | "active" | "archived" | "abandoned";

export default async function MyGamesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Wave 2 i18n migration (2026-05-27): all strings from messages catalog.
  const tMy = await getTranslations("my");
  const tLib = await getTranslations("library");
  const sp = await searchParams;
  const tab: Tab =
    sp.tab === "active" || sp.tab === "archived" || sp.tab === "abandoned"
      ? sp.tab
      : "all";

  // AUDIT FIX MG-PERF-HIGH-01: cached — SiteHeader dedupes against this call.
  const user = await getCachedUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/my`);
  }
  const supabase = await createClient();

  // High limit — realistic ceiling for a solo user's lifetime playthroughs.
  // RLS auto-scopes to user.id even though query passes it explicitly.
  const all = await getMyPlaythroughs(supabase, {
    userId: user.id,
    limit: 500,
  });

  const counts = {
    all: all.length,
    active: all.filter((p) => p.status === "active").length,
    archived: all.filter((p) => p.status === "archived").length,
    abandoned: all.filter((p) => p.status === "abandoned").length,
  };

  // AUDIT FIX MG-UX-MED-02: if user lands on /my?tab=archived but archived=0
  // (and they DO have other playthroughs), the archived tab pill is hidden,
  // so they have no obvious way back. Redirect to /my so they see the active
  // tab + the playthroughs they actually have.
  if (tab !== "all" && counts[tab] === 0 && counts.all > 0) {
    redirect(`/${locale}/my`);
  }

  const filtered =
    tab === "all" ? all : all.filter((p) => p.status === tab);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-12" style={{ background: "var(--se-bg)" }}>
        <div className="mx-auto max-w-[1200px] px-6 sm:px-14 py-8 sm:py-12">
          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-3xl sm:text-4xl font-bold se-cjk"
              style={{ color: "var(--se-fg)", letterSpacing: "-0.02em" }}
            >
              {tMy("pageTitle")}
            </h1>
            <p className="mt-2 se-cjk text-sm" style={{ color: "var(--se-fg-muted)" }}>
              {counts.all === 0
                ? tMy("subtitleEmpty")
                : tMy("subtitleCount", { total: counts.all, active: counts.active })}
            </p>
          </div>

          {/* Filter tabs */}
          {counts.all > 0 && (
            <div className="flex items-center gap-2 mb-6 overflow-x-auto se-row-scroll">
              <TabPill
                href={`/${locale}/my`}
                active={tab === "all"}
                label={tMy("tabs.all")}
                count={counts.all}
              />
              <TabPill
                href={`/${locale}/my?tab=active`}
                active={tab === "active"}
                label={tMy("tabs.active")}
                count={counts.active}
                icon={<Sparkles size={12} />}
              />
              {counts.archived > 0 && (
                <TabPill
                  href={`/${locale}/my?tab=archived`}
                  active={tab === "archived"}
                  label={tMy("tabs.archived")}
                  count={counts.archived}
                  icon={<Archive size={12} />}
                />
              )}
              {counts.abandoned > 0 && (
                <TabPill
                  href={`/${locale}/my?tab=abandoned`}
                  active={tab === "abandoned"}
                  label={tMy("tabs.abandoned")}
                  count={counts.abandoned}
                  icon={<Trash2 size={12} />}
                />
              )}
            </div>
          )}

          {/* List */}
          {filtered.length === 0 ? (
            <EmptyState locale={locale} tab={tab} hasAny={counts.all > 0} />
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((p) => (
                <PlaythroughRow key={p.id} p={p} locale={locale} tLib={tLib} tMy={tMy} />
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────

function TabPill({
  href,
  active,
  label,
  count,
  icon,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
      style={{
        background: active ? "var(--se-fg)" : "var(--se-surface)",
        color: active ? "var(--se-bg)" : "var(--se-fg-muted)",
        border: `1px solid ${active ? "var(--se-fg)" : "var(--se-border)"}`,
      }}
    >
      {icon}
      <span className="se-cjk">{label}</span>
      <span className="se-mono text-[11px] opacity-70">{count}</span>
    </Link>
  );
}

function PlaythroughRow({
  p,
  locale,
  tLib,
  tMy,
}: {
  p: MyPlaythroughRow;
  locale: string;
  tLib: RelTimeFn;
  tMy: RelTimeFn;
}) {
  const isActive = p.status === "active";
  return (
    <Link
      href={`/${locale}/play/${p.id}` as never}
      className="flex gap-4 p-4 rounded-xl transition-all group"
      style={{
        background: "var(--se-surface)",
        border: "1px solid var(--se-border)",
        boxShadow: "var(--se-shadow-card)",
      }}
    >
      <div style={{ width: 64, flex: "none" }}>
        <Cover
          storyId={p.story_id}
          genre={(p.story_genre as GenreKey) ?? undefined}
          ratio="3 / 4"
          size="sm"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-start gap-2">
            <h3
              className="text-base font-semibold se-cjk truncate"
              style={{ color: "var(--se-fg)", letterSpacing: "-0.005em" }}
            >
              {/* Wave 2 i18n cycle-5 fix (2026-05-28): localize untitled fallback. */}
              {p.story_title || tLib("storyCard.untitled")}
            </h3>
            <StatusBadge status={p.status} tMy={tMy} />
          </div>
          {p.character_name && (
            <p
              className="mt-1 text-xs se-cjk truncate"
              style={{ color: "var(--se-fg-muted)" }}
            >
              {tMy("row.character", { name: p.character_name })}
            </p>
          )}
        </div>
        <div
          className="flex items-center gap-2 mt-2 text-[11px] se-mono"
          style={{ color: "var(--se-fg-dim)", letterSpacing: "0.05em" }}
        >
          <span>{tMy("row.turn", { count: p.turn_count })}</span>
          <span>·</span>
          <span>{relativeTime(p.last_played_at, tLib).toUpperCase()}</span>
        </div>
      </div>
      <div className="flex items-center flex-none">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium se-cjk"
          style={{
            background: isActive ? "var(--se-fg)" : "var(--se-surface-2)",
            color: isActive ? "var(--se-bg)" : "var(--se-fg-muted)",
            border: `1px solid ${isActive ? "var(--se-fg)" : "var(--se-border)"}`,
          }}
        >
          <Play size={11} />
          {isActive ? tMy("row.resume") : tMy("row.review")}
        </span>
      </div>
    </Link>
  );
}

function StatusBadge({ status, tMy }: { status: string; tMy: RelTimeFn }) {
  const styleByStatus: Record<string, { color: string; bg: string }> = {
    active: { color: "var(--se-accent)", bg: "var(--se-accent-bg)" },
    archived: { color: "var(--se-fg-muted)", bg: "var(--se-surface-2)" },
    abandoned: { color: "var(--se-fg-dim)", bg: "var(--se-surface-2)" },
  };
  const v = styleByStatus[status] ?? styleByStatus.archived;
  // Wave 2 i18n migration: localized status label.
  const labelKey =
    status === "active" || status === "archived" || status === "abandoned"
      ? status
      : "archived";
  return (
    <span
      className="inline-flex flex-none items-center px-2 py-0.5 rounded-full text-[10px] font-medium se-cjk"
      style={{ color: v.color, background: v.bg }}
    >
      {tMy(`status.${labelKey}`)}
    </span>
  );
}

async function EmptyState({
  locale,
  tab,
  hasAny,
}: {
  locale: string;
  tab: Tab;
  hasAny: boolean;
}) {
  const tMy = await getTranslations("my");
  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 72,
            height: 72,
            background: "var(--se-surface-2)",
            border: "1px solid var(--se-border)",
          }}
        >
          <BookOpen size={32} style={{ color: "var(--se-fg-dim)" }} />
        </div>
        <h2
          className="mt-5 text-xl font-semibold se-cjk"
          style={{ color: "var(--se-fg)" }}
        >
          {tMy("empty.title")}
        </h2>
        <p
          className="mt-2 max-w-md text-sm se-cjk"
          style={{ color: "var(--se-fg-muted)", lineHeight: 1.6 }}
        >
          {tMy("empty.body")}
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href={`/${locale}/library` as never}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-medium text-sm se-cjk"
            style={{ background: "var(--se-fg)", color: "var(--se-bg)" }}
          >
            <BookOpen size={14} />
            {tMy("empty.browseLibrary")}
          </Link>
          <Link
            href={`/${locale}/stories/new` as never}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-medium text-sm se-cjk"
            style={{
              background: "var(--se-surface)",
              color: "var(--se-fg)",
              border: "1px solid var(--se-border)",
            }}
          >
            <Plus size={14} />
            {tMy("empty.createNew")}
          </Link>
        </div>
      </div>
    );
  }
  const tabLabel = tMy(`tabs.${tab}` as "tabs.active" | "tabs.archived" | "tabs.abandoned");
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm se-cjk" style={{ color: "var(--se-fg-muted)" }}>
        {tMy("empty.noPlaythroughsForTab", { tab: tabLabel })}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Localized relative-time formatter.
 * Wave 2 i18n migration (2026-05-27): was hardcoded 繁中.
 */
function relativeTime(iso: string, tLib: RelTimeFn): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - t) / 60_000);
  if (diffMin < 1) return tLib("relativeTime.justNow");
  if (diffMin < 60) return tLib("relativeTime.minutesAgo", { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return tLib("relativeTime.hoursAgo", { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return tLib("relativeTime.yesterday");
  if (diffDay < 7) return tLib("relativeTime.daysAgo", { count: diffDay });
  if (diffDay < 30) return tLib("relativeTime.weeksAgo", { count: Math.floor(diffDay / 7) });
  return new Date(iso).toLocaleDateString();
}
