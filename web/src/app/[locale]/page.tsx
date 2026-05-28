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

  // Session 16 PM Review #2 (P-06) fix: even on prod marketing host, detect
  // if the visiting user is already logged in (cookies scoped to .kieio.com
  // parent → marketing host CAN read auth session). If so, pass the user's
  // display_name to MarketingLanding so the nav can render「歡迎 X · 打開遊戲」
  // CTA instead of「Sign up」 — returning users 唔再以為 logged out。
  let authedUser: { displayName: string | null } | null = null;
  if (!isProdMarketingHost) {
    // Dev / preview: keep legacy behavior · authed user skips marketing landing
    const user = await getCachedUser();
    if (user) {
      const supabase = await createClient();
      const landingPath = await getLandingPath(supabase, user.id);
      redirect({ href: landingPath as never, locale });
    }
  } else {
    // Prod marketing host: render landing for everyone · but pass auth context
    // so authed users see「Open app」instead of「Sign up」
    const user = await getCachedUser();
    if (user) {
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      authedUser = {
        displayName: (profile?.display_name as string | null) ?? user.email?.split("@")[0] ?? null,
      };
    }
  }

  return (
    <MarketingLanding
      lang={langFromLocale(locale)}
      locale={locale}
      authedUser={authedUser}
    />
  );
}
