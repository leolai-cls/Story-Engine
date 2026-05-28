import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Library, BookMarked, Sparkles } from "lucide-react";
import { KieioLogo } from "@/components/brand/KieioLogo";
import { LocaleSwitcher } from "@/components/se/LocaleSwitcher";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { marketingUrl } from "@/lib/urls";
import { createClient } from "@/lib/supabase/server";
import { getMyPlaythroughs } from "@/lib/community/queries";
import {
  MobileNavDrawer,
  type DrawerPlaythrough,
} from "@/components/se/MobileNavDrawer";
import { getLocale } from "next-intl/server";

/**
 * Top nav — auth-aware.
 *
 * Anon: Library / Pricing  +  Log in / Sign up
 * User: Library / 我嘅遊戲 / Pricing  +  Settings / Log out
 *
 * "我嘅遊戲" gives ChatGPT-style discoverability of all the user's
 * playthroughs (active + archived + abandoned) — distinct from /library
 * which is browse-public-stories first.
 */

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const locale = await getLocale();
  // AUDIT FIX MG-PERF-HIGH-01: dedupe via React cache() — if the page that
  // wraps this header already called getCachedUser(), zero extra Supabase
  // auth roundtrips. Saves ~30-80ms per page render on cold cookies.
  const user = await getCachedUser();

  // Fetch recent playthroughs for the mobile drawer (ChatGPT-style side menu
  // · founder request 2026-05-25). Authed only · server-side · cheap query.
  // Total count is exact-count for "全部 (N)" footer link.
  let drawerPlaythroughs: DrawerPlaythrough[] = [];
  let totalPlaythroughCount = 0;
  // Wave 2 i18n migration (2026-05-27): pass library `relativeTime` translator
  // into shortRelativeTime so the mobile drawer's per-playthrough timestamps
  // render in the user's locale (was hardcoded 繁中 "剛剛 / 分鐘前").
  const tLibTime = await getTranslations("library.relativeTime");
  // Wave 2 i18n cycle-5 fix (2026-05-28): localize untitled fallback.
  const tLibCard = await getTranslations("library.storyCard");
  if (user) {
    const supabase = await createClient();
    const [recent, { count }] = await Promise.all([
      getMyPlaythroughs(supabase, { userId: user.id, limit: 5 }),
      supabase
        .from("playthroughs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);
    const untitledLabel = tLibCard("untitled");
    drawerPlaythroughs = recent.map((p) => ({
      id: p.id,
      storyId: p.story_id,
      storyTitle: p.story_title || untitledLabel,
      storyGenre: p.story_genre,
      turnCount: p.turn_count,
      relativeTime: shortRelativeTime(p.last_played_at, tLibTime, locale),
    }));
    totalPlaythroughCount = count ?? recent.length;
  }

  // Pricing is a MARKETING route (per lib/urls.ts classification) — when
  // founder splits to xxx.com / app.xxx.com it'll move off the product domain.
  // Use marketingUrl() so the link auto-expands to absolute origin in split
  // world; today it returns "/pricing" relative.
  const pricingHref = marketingUrl("/pricing");
  // Marker so we know whether to render as internal i18n <Link> (same-origin)
  // or plain <a> (cross-origin to marketing domain).
  const pricingIsExternal = pricingHref.startsWith("http");

  const authedNav: Array<{
    href: string;
    label: string;
    icon: typeof Library;
    external: boolean;
  }> = [
    { href: "/library", label: t("library"), icon: Library, external: false },
    { href: "/my", label: t("myGames"), icon: BookMarked, external: false },
    { href: pricingHref, label: t("pricing"), icon: Sparkles, external: pricingIsExternal },
  ];
  const anonNav: Array<{ href: string; label: string; external: boolean }> = [
    { href: "/library", label: t("library"), external: false },
    { href: pricingHref, label: t("pricing"), external: pricingIsExternal },
  ];

  return (
    <header
      className="sticky top-0 z-40 w-full backdrop-blur"
      style={{
        background: "rgba(251,250,246,0.85)",
        borderBottom: "1px solid var(--se-border)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center px-4 sm:px-14">
        {/* Mobile hamburger + slide-out drawer (lg:hidden internally).
            ChatGPT / Claude / Grok pattern — top-left burger → left drawer
            with playthroughs list + nav links + settings/logout. */}
        <MobileNavDrawer
          locale={locale}
          isAuthed={!!user}
          playthroughs={drawerPlaythroughs}
          totalPlaythroughCount={totalPlaythroughCount}
          labels={{
            library: t("library"),
            myGames: t("myGames"),
            pricing: t("pricing"),
            settings: t("settings"),
            login: t("login"),
            signup: t("signup"),
            // Wave 2 i18n migration (2026-05-27): drawer-internal labels (was hardcoded 繁中).
            newStory: t("drawer.newStory"),
            continueSection: t("drawer.continueSection"),
            allPlaythroughs: t("drawer.allPlaythroughs"),
            logout: t("logout"),
            ariaClose: t("drawer.ariaClose"),
            ariaCloseDrawer: t("drawer.ariaCloseDrawer"),
            ariaOpenMenu: t("drawer.ariaOpenMenu"),
          }}
        />
        <Link
          href="/"
          aria-label="Kieio · home"
          className="mr-7 flex items-center"
          style={{ color: "var(--se-fg)" }}
        >
          {/* Brandbook v4 locked: (o) Lakers Purple + KIEIO Termina Bold.
              Inherits --se-fg via parent color so wordmark adapts to surface. */}
          <KieioLogo size={15} markColor="purple" wordColor="default" />
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          {user
            ? authedNav.map((item) => {
                const Ico = item.icon;
                const linkClass =
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-[color:var(--se-surface-2)]";
                const linkStyle = { color: "var(--se-fg-muted)" };
                // External (cross-subdomain to marketing) → plain <a>.
                // Same-origin (today + product routes always) → i18n <Link>.
                return item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    className={linkClass}
                    style={linkStyle}
                  >
                    <Ico size={14} />
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    className={linkClass}
                    style={linkStyle}
                  >
                    <Ico size={14} />
                    {item.label}
                  </Link>
                );
              })
            : anonNav.map((item) => {
                const linkClass = "px-3 py-1.5 rounded-md transition-colors hover:bg-[color:var(--se-surface-2)]";
                const linkStyle = { color: "var(--se-fg-muted)" };
                return item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    className={linkClass}
                    style={linkStyle}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    className={linkClass}
                    style={linkStyle}
                  >
                    {item.label}
                  </Link>
                );
              })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          {user ? (
            // Authed: settings + logout exist in the mobile drawer too · hide
            // duplicate buttons on small screens to avoid crowding the header.
            <div className="hidden lg:flex items-center gap-2">
              <Button variant="ghost" size="sm" render={<Link href="/settings" />}>
                {t("settings")}
              </Button>
              <SignOutButton />
            </div>
          ) : (
            // Anon: keep Sign up CTA visible on mobile too — primary conversion
            // surface. Hide the secondary "Log in" button on small screens
            // (drawer has it).
            <>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/login" />}
                className="hidden lg:inline-flex"
              >
                {t("login")}
              </Button>
              <Button
                size="sm"
                render={<Link href="/login" />}
                style={{
                  background: "var(--se-fg)",
                  color: "var(--se-bg)",
                }}
              >
                {t("signup")}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Compact relative time for the mobile drawer (no spaces — fits the 270px
 * drawer width nicely).
 *
 * Wave 2 i18n migration (2026-05-27): accepts the `library.relativeTime`
 * translator so the drawer is locale-aware (was hardcoded 繁中).
 */
function shortRelativeTime(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: string,
): string {
  const ms = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - ms) / 60_000);
  if (diffMin < 1) return t("justNow");
  if (diffMin < 60) return t("minutesAgo", { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t("hoursAgo", { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return t("yesterday");
  if (diffDay < 7) return t("daysAgo", { count: diffDay });
  if (diffDay < 30) return t("weeksAgo", { count: Math.floor(diffDay / 7) });
  // Session 16 audit MED-02 fix: pass locale arg
  return new Date(iso).toLocaleDateString(locale);
}
