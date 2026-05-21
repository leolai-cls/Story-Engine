import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Brain, Sparkles, Shield, ArrowRight } from "lucide-react";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)]" />
          <div className="container mx-auto max-w-6xl px-4 sm:px-6 pt-20 pb-24 text-center">
            <Badge
              variant="secondary"
              className="mb-6 px-3 py-1 text-xs font-semibold uppercase tracking-widest"
            >
              {t("hero.eyebrow")}
            </Badge>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-transparent leading-[1.05]">
              {t("hero.title")}
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {t("hero.subtitle")}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="text-base px-6"
                render={<Link href="/login" />}
              >
                {t("hero.ctaPrimary")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-base px-6"
                render={<Link href="/library" />}
              >
                {t("hero.ctaSecondary")}
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto max-w-6xl px-4 sm:px-6 py-20">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-12">
            {t("features.title")}
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard
              icon={<Brain className="h-6 w-6" />}
              title={t("features.memory.title")}
              body={t("features.memory.body")}
            />
            <FeatureCard
              icon={<Sparkles className="h-6 w-6" />}
              title={t("features.adaptive.title")}
              body={t("features.adaptive.body")}
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title={t("features.integrity.title")}
              body={t("features.integrity.body")}
            />
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto max-w-4xl px-4 sm:px-6 py-20">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/8 via-background to-background">
            <CardContent className="py-12 px-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight mb-3">
                {t("cta.title")}
              </h2>
              <p className="text-muted-foreground mb-6">{t("cta.body")}</p>
              <Button size="lg" render={<Link href="/login" />}>
                {t("cta.button")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="border-border/60 transition hover:border-primary/30 hover:shadow-md">
      <CardContent className="pt-6">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}
