import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { LocaleSwitcher } from "@/components/se/LocaleSwitcher";

export async function SiteHeader() {
  const t = await getTranslations("nav");

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
          {[
            { href: "/library", label: t("library") },
            { href: "/pricing", label: t("pricing") },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href as never}
              className="px-3 py-1.5 rounded-md transition-colors hover:bg-[color:var(--se-surface-2)]"
              style={{ color: "var(--se-fg-muted)" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/login" />}
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
        </div>
      </div>
    </header>
  );
}
