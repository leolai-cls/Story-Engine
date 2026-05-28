import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { KieioLogo } from "@/components/brand/KieioLogo";

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
        <nav className="flex items-center gap-5">
          <Link href="/pricing" className="hover:text-foreground transition">
            {tNav("pricing")}
          </Link>
          <Link href="/library" className="hover:text-foreground transition">
            {tNav("library")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
