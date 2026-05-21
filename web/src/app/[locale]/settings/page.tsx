import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, User, Cpu, type LucideIcon } from "lucide-react";

type SectionKey = "profile" | "billing" | "models";

const SECTION_ICONS: Record<SectionKey, LucideIcon> = {
  profile: User,
  billing: CreditCard,
  models: Cpu,
};

const SECTION_KEYS: SectionKey[] = ["profile", "billing", "models"];

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.settings");

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{t("title")}</h1>
        <p className="text-muted-foreground mb-8">{t("subtitle")}</p>

        <div className="grid sm:grid-cols-2 gap-4">
          {SECTION_KEYS.map((key) => {
            const Icon = SECTION_ICONS[key];
            return (
              <Card
                key={key}
                className="relative opacity-70 cursor-not-allowed h-full"
                aria-disabled
              >
                <Badge
                  variant="secondary"
                  className="absolute top-3 right-3 text-[10px] px-1.5"
                >
                  {t("comingSoon")}
                </Badge>
                <CardHeader>
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">
                    {t(`sections.${key}.title`)}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t(`sections.${key}.description`)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Phase 0.6 之後 wire up
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
