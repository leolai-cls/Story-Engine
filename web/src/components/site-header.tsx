import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export async function SiteHeader() {
  const t = await getTranslations("nav");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="mr-6 flex items-center gap-2 font-bold">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="tracking-tight">Story Engine</span>
        </Link>

        <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/library" className="transition hover:text-foreground">
            {t("library")}
          </Link>
          <Link href="/pricing" className="transition hover:text-foreground">
            {t("pricing")}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link href="/login" />}>
            {t("login")}
          </Button>
          <Button size="sm" render={<Link href="/login" />}>
            {t("signup")}
          </Button>
        </div>
      </div>
    </header>
  );
}
