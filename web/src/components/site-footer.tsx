import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { KieioLogo } from "@/components/brand/KieioLogo";
import { CrossSubdomainLink } from "@/components/CrossSubdomainLink";

export async function SiteFooter() {
  const tFooter = await getTranslations("footer");
  const tNav = await getTranslations("nav");

  return (
    <footer className="border-t border-border/40 py-8 mt-16">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <Link
            href="/"
            aria-label="Kieio · home"
            style={{ color: "var(--se-fg)" }}
          >
            <KieioLogo size={12} markColor="purple" wordColor="default" />
          </Link>
          <span className="text-[11px]" style={{ color: "var(--se-fg-dim)" }}>
            {tFooter("pronunciation")} · © {new Date().getFullYear()} · {tFooter("tagline")}
          </span>
        </div>
        <nav className="flex items-center gap-4 flex-wrap justify-center">
          {/* Pricing is a MARKETING route — CrossSubdomainLink renders a
              non-prefetching <a> in the split world so the product-host footer
              never RSC-prefetches kieio.com (the CORS noise founder caught). */}
          <CrossSubdomainLink to="marketing" path="/pricing" className="hover:text-foreground transition">
            {tNav("pricing")}
          </CrossSubdomainLink>
          {/* Library is a PRODUCT route and this footer only renders on the
              product host → keep the smooth same-origin i18n <Link>. */}
          <Link href="/library" className="hover:text-foreground transition">
            {tNav("library")}
          </Link>
          {/* Session 16 P-01: legal links · Stripe + Apple/Google Ads required */}
          <span className="opacity-30">·</span>
          <CrossSubdomainLink to="marketing" path="/terms" className="hover:text-foreground transition">
            {(await getTranslations("legal"))("footerTerms")}
          </CrossSubdomainLink>
          <CrossSubdomainLink to="marketing" path="/privacy" className="hover:text-foreground transition">
            {(await getTranslations("legal"))("footerPrivacy")}
          </CrossSubdomainLink>
          <CrossSubdomainLink to="marketing" path="/cookies" className="hover:text-foreground transition">
            {(await getTranslations("legal"))("footerCookies")}
          </CrossSubdomainLink>
        </nav>
      </div>
    </footer>
  );
}
