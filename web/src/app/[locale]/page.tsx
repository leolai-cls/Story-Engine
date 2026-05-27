import { setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { createClient } from "@/lib/supabase/server";
import { getLandingPath } from "@/lib/auth/landing";
import { MarketingLanding } from "@/components/marketing/MarketingLanding";
import { langFromLocale } from "@/components/marketing/copy";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Hard subdomain split (per CLAUDE.md / middleware.ts):
  //   kieio.com/        → marketing landing (this component) for everyone
  //   app.kieio.com/    → middleware already redirected to /library
  //   localhost/dev     → preserve old behavior (logged-in users skip
  //                       marketing · drop into product)
  //
  // The auth-aware redirect is kept only for dev/preview convenience.
  // On prod kieio.com, even authed users see the marketing landing —
  // they intentionally visited the marketing domain.
  const host = (await headers()).get("host") ?? "";
  const isProdMarketingHost = host === "kieio.com" || host === "www.kieio.com";

  if (!isProdMarketingHost) {
    const user = await getCachedUser();
    if (user) {
      const supabase = await createClient();
      const landingPath = await getLandingPath(supabase, user.id);
      redirect({ href: landingPath as never, locale });
    }
  }

  return <MarketingLanding lang={langFromLocale(locale)} locale={locale} />;
}
