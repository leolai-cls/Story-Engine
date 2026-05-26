import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const tFooter = await getTranslations("footer");
  const tNav = await getTranslations("nav");

  return (
    <footer className="border-t border-border/40 py-8 mt-16">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div>
          © {new Date().getFullYear()} Kieio · 讀「KEE-yo」. {tFooter("tagline")}.
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
