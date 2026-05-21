import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.library");

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-3">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
      </main>
      <SiteFooter />
    </>
  );
}
