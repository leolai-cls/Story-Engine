import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Check } from "lucide-react";

const TIER_KEYS = ["free", "adventurer", "storyteller", "legend"] as const;

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.pricing");

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="container mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
              {t("title")}
            </h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("usdNotice")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIER_KEYS.map((key) => (
              <TierCard key={key} tierKey={key} />
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

async function TierCard({
  tierKey,
}: {
  tierKey: (typeof TIER_KEYS)[number];
}) {
  const t = await getTranslations(`marketing.pricing.tiers.${tierKey}`);
  const tCta = await getTranslations("marketing.pricing");
  const isPopular = tierKey === "storyteller";
  const isFree = tierKey === "free";

  const features = (t.raw("features") as string[]) ?? [];
  const popularLabel = isPopular ? t("popular") : null;

  return (
    <Card
      className={`relative flex flex-col ${
        isPopular ? "border-primary shadow-lg" : "border-border/60"
      }`}
    >
      {popularLabel && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
          {popularLabel}
        </Badge>
      )}
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{t("name")}</CardTitle>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold tracking-tight">
            {t("price")}
          </span>
          {!isFree && (
            <span className="text-sm text-muted-foreground">
              {tCta("perMonth")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("credits")}</p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ul className="space-y-2.5 text-sm flex-1 mb-6">
          {features.map((feat: string) => (
            <li key={feat} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-muted-foreground">{feat}</span>
            </li>
          ))}
        </ul>
        <Button
          className="w-full"
          variant={isPopular ? "default" : "outline"}
          render={<Link href="/login" />}
        >
          {isFree ? tCta("ctaFree") : tCta("ctaPaid")}
        </Button>
      </CardContent>
    </Card>
  );
}
