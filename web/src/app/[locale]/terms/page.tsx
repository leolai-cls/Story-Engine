import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

/**
 * Terms of Service · placeholder pages (Session 16 P-01).
 *
 * Stub content for Stripe / Apple Search Ads / Google Ads compliance —
 * platforms require a Terms URL or they flag the account / refuse ads.
 * Final copy pending lawyer review (HK + TW + EU jurisdictions).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return {
    title: `${t("title")} · Kieio`,
    description: t("subtitle"),
    robots: { index: true, follow: false },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.terms");
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 prose dark:prose-invert">
      <p className="text-sm text-muted-foreground uppercase tracking-wider">
        {t("eyebrow")}
      </p>
      <h1>{t("title")}</h1>
      <p className="text-muted-foreground">{t("subtitle")}</p>
      <p className="text-xs italic text-amber-700 dark:text-amber-300 mt-2">
        {t("placeholderNotice")}
      </p>

      <h2>{t("section1Title")}</h2>
      <p>{t("section1Body")}</p>

      <h2>{t("section2Title")}</h2>
      <p>{t("section2Body")}</p>

      <h2>{t("section3Title")}</h2>
      <p>{t("section3Body")}</p>

      <h2>{t("section4Title")}</h2>
      <p>{t("section4Body")}</p>

      <h2>{t("section5Title")}</h2>
      <p>{t("section5Body")}</p>

      <hr />
      <p className="text-xs text-muted-foreground">
        {t("lastUpdated", { date: "2026-05-28" })}
      </p>
    </main>
  );
}
