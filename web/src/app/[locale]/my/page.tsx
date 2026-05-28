import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Cover } from "@/components/se/Cover";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { getMyPlaythroughs, type MyPlaythroughRow } from "@/lib/community/queries";
import { Play, Sparkles, Archive, Trash2, BookOpen, Plus, Lock, ArrowRight, Wand2 } from "lucide-react";
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

  // Session 16 PM Review #2 (P-12): fetch adult_mode_enabled so we can
  // surface lock badge on adult-rated playthroughs when user has adult
  // mode off (e.g., they cancelled Pro · markSubscriptionDeleted forced
  // adult_mode_enabled=false). Playthrough still listed but visibly locked.
  // Session 16 follow-up: also fetch display_name for lobby welcome.
  const { data: profileForGating } = await supabase
    .from("profiles")
    .select("adult_mode_enabled, display_name")
    .eq("id", user.id)
    .maybeSingle();
  const userAdultMode = profileForGating?.adult_mode_enabled === true;
  const displayName = (profileForGating?.display_name as string | null) ?? null;

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
            <EmptyState
              locale={locale}
              tab={tab}
              hasAny={counts.all > 0}
              displayName={displayName}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((p) => (
                <PlaythroughRow
                  key={p.id}
                  p={p}
                  locale={locale}
                  tLib={tLib}
                  tMy={tMy}
                  userAdultMode={userAdultMode}
                />
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
  userAdultMode,
}: {
  p: MyPlaythroughRow;
  locale: string;
  tLib: RelTimeFn;
  tMy: RelTimeFn;
  userAdultMode: boolean;
}) {
  const isActive = p.status === "active";
  // Session 16 PM Review #2 (P-12): lock if story is adult-rated but user
  // has adult mode off. Playthrough is still clickable but flagged so user
  // understands turn route will 403 until they re-enable adult mode.
  const isAdultLocked = p.story_content_rating === "adult" && !userAdultMode;
  return (
    <Link
      href={isAdultLocked ? (`/${locale}/settings` as never) : (`/${locale}/play/${p.id}` as never)}
      className="flex gap-4 p-4 rounded-xl transition-all group"
      style={{
        background: "var(--se-surface)",
        border: `1px solid ${isAdultLocked ? "var(--se-border-strong)" : "var(--se-border)"}`,
        boxShadow: "var(--se-shadow-card)",
        opacity: isAdultLocked ? 0.7 : 1,
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
          <div className="flex items-start gap-2 flex-wrap">
            <h3
              className="text-base font-semibold se-cjk truncate"
              style={{ color: "var(--se-fg)", letterSpacing: "-0.005em" }}
            >
              {/* Wave 2 i18n cycle-5 fix (2026-05-28): localize untitled fallback. */}
              {p.story_title || tLib("storyCard.untitled")}
            </h3>
            <StatusBadge status={p.status} tMy={tMy} />
            {isAdultLocked && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  color: "var(--se-rose, #b91c1c)",
                  background: "color-mix(in srgb, var(--se-rose, #b91c1c) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--se-rose, #b91c1c) 30%, transparent)",
                }}
                title={tMy("adultLockTooltip")}
              >
                <Lock size={9} />
                {tMy("adultLockBadge")}
              </span>
            )}
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
          <span>{relativeTime(p.last_played_at, tLib, locale).toUpperCase()}</span>
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
  displayName,
}: {
  locale: string;
  tab: Tab;
  hasAny: boolean;
  displayName: string | null;
}) {
  const tMy = await getTranslations("my");
  if (!hasAny) {
    // Session 16 follow-up · new-user activation lobby (2026-05-28):
    // Replace bland "you have no stories" empty state with a true onboarding
    // hub — ChatGPT-style. Big "Start your first story" CTA + 4 example
    // scenario cards (one-click to /stories/new?seed=...) + browse-public
    // secondary action.
    //
    // Founder feedback: "now after I register there is nothing in library,
    // don't even know how to start a new game".
    const tCreate = await getTranslations("createStory.examples");
    const tLobby = await getTranslations("my.lobby");
    const exampleKeys = ["0", "1", "2", "3"] as const;
    return (
      <div className="flex flex-col items-center py-12 text-center max-w-2xl mx-auto">
        {/* Hero · brand mark + welcome */}
        <div
          className="flex items-center justify-center rounded-2xl"
          style={{
            width: 56,
            height: 56,
            background: "var(--se-accent-bg, color-mix(in srgb, var(--se-accent) 12%, transparent))",
            border: "1px solid color-mix(in srgb, var(--se-accent) 30%, transparent)",
          }}
        >
          <Wand2 size={26} style={{ color: "var(--se-accent)" }} />
        </div>
        <h2
          className="mt-5 text-2xl font-bold se-cjk"
          style={{ color: "var(--se-fg)", letterSpacing: "-0.015em" }}
        >
          {displayName
            ? tLobby("welcomeNamed", { name: displayName })
            : tLobby("welcomeAnon")}
        </h2>
        <p
          className="mt-2.5 max-w-lg text-sm se-cjk"
          style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}
        >
          {tLobby("subtitle")}
        </p>

        {/* Primary CTA · big · centered */}
        <Link
          href={`/${locale}/stories/new` as never}
          className="mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-md font-semibold text-sm se-cjk"
          style={{
            background: "var(--se-fg)",
            color: "var(--se-bg)",
            boxShadow: "var(--se-shadow-cta, 0 4px 16px rgba(0,0,0,0.12))",
          }}
        >
          <Sparkles size={16} />
          {tLobby("primaryCta")}
          <ArrowRight size={14} />
        </Link>

        {/* Quick-start example cards · ChatGPT-style suggested prompts */}
        <div className="mt-9 w-full">
          <div
            className="se-mono uppercase mb-3"
            style={{ fontSize: 10.5, color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
          >
            {tLobby("examplesHeader")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {exampleKeys.map((k) => {
              const example = tCreate(k);
              const seed = encodeURIComponent(example);
              return (
                <Link
                  key={k}
                  href={`/${locale}/stories/new?seed=${seed}` as never}
                  className="group text-left p-3.5 rounded-lg transition-all hover:scale-[1.01]"
                  style={{
                    background: "var(--se-surface)",
                    border: "1px solid var(--se-border)",
                    boxShadow: "var(--se-shadow-card)",
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <Sparkles
                      size={13}
                      className="flex-none mt-1"
                      style={{ color: "var(--se-accent)" }}
                    />
                    <div
                      className="text-[12.5px] se-cjk line-clamp-3"
                      style={{ color: "var(--se-fg-2)", lineHeight: 1.55 }}
                    >
                      {example.length > 140 ? example.slice(0, 140) + "…" : example}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Secondary action · subtle */}
        <Link
          href={`/${locale}/library` as never}
          className="mt-8 inline-flex items-center gap-1.5 text-xs se-cjk transition-colors hover:text-foreground"
          style={{ color: "var(--se-fg-muted)" }}
        >
          <BookOpen size={12} />
          {tLobby("browseLibraryLink")}
          <ArrowRight size={11} />
        </Link>
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
function relativeTime(iso: string, tLib: RelTimeFn, locale: string): string {
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
  // Session 16 audit MED-02 fix: pass locale (Vercel default = en-US otherwise)
  return new Date(iso).toLocaleDateString(locale);
}
