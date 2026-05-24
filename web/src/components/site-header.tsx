import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Sparkles, Library, BookMarked } from "lucide-react";
import { LocaleSwitcher } from "@/components/se/LocaleSwitcher";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { marketingUrl } from "@/lib/urls";

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
  // AUDIT FIX MG-PERF-HIGH-01: dedupe via React cache() — if the page that
  // wraps this header already called getCachedUser(), zero extra Supabase
  // auth roundtrips. Saves ~30-80ms per page render on cold cookies.
  const user = await getCachedUser();

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
      <div className="mx-auto flex h-16 max-w-[1600px] items-center px-6 sm:px-14">
        <Link href="/" className="mr-7 flex items-center gap-2 font-bold">
          <Sparkles className="h-5 w-5" style={{ color: "var(--se-accent)" }} />
          <span
            className="se-mono"
            style={{ letterSpacing: "-0.01em", fontSize: 15, color: "var(--se-fg)" }}
          >
            story.engine
          </span>
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
            <>
              <Button variant="ghost" size="sm" render={<Link href="/settings" />}>
                {t("settings")}
              </Button>
              <SignOutButton />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
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
