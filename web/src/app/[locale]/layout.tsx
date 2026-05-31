import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { createClient } from "@/lib/supabase/server";
import { PostHogProvider } from "@/components/posthog-provider";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

/**
 * Kieio brand fonts · LOCKED per Brandbook v4 (2026-05-26).
 * - Termina Bold = KIEIO wordmark + brand headlines (geometric, cinematic, uppercase)
 * - Gimbal Extended Regular = the (o) mark + supporting display moments
 *
 * Loaded as CSS variables so brand surfaces (site-header, footer, login,
 * landing hero) can opt-in via inline style without affecting product UI —
 * which intentionally stays on Geist/Noto Sans TC warm-paper system.
 */
const termina = localFont({
  src: "../fonts/Termina-Bold.otf",
  variable: "--font-termina",
  weight: "700",
  display: "swap",
});

const gimbalExtended = localFont({
  src: "../fonts/GimbalExtended-Regular.otf",
  variable: "--font-gimbal",
  weight: "400",
  display: "swap",
});

/**
 * Wave 2 i18n migration (2026-05-27): metadata now per-locale via
 * `generateMetadata`. Previously was hardcoded 繁中 — browser tab + Open Graph
 * share preview displayed Cantonese to EN / zh-Hans users on every page.
 */
const OG_LOCALE: Record<string, string> = {
  en: "en_US",
  "zh-Hant": "zh_HK",
  "zh-Hans": "zh_CN",
};

// 2026-05-30 (founder · mobile-first): when the on-screen keyboard opens, resize
// the layout (shrink the viewport) instead of overlaying it — so the composer
// stays pinned above the keyboard and typing doesn't shift/scroll the page.
// Pairs with the play screen's h-dvh fixed-viewport layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 2026-05-31 (founder): it's a webapp, not a zoomable page — lock pinch/double-
  // tap zoom so it feels like a native app (maximumScale 1 + userScalable false).
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "siteMetadata" });
  // Session 16 audit MED-01 fix: hreflang annotations for SEO. Without
  // these, Google can't route HK/TW users → zh-Hant page vs CN users →
  // zh-Hans page. Launch markets are HK + TW, so this is real SEO leak.
  // localePrefix: "as-needed" → zh-Hant (default) has no prefix.
  const canonical = locale === "zh-Hant" ? "/" : `/${locale}`;
  return {
    title: t("title"),
    description: t("description"),
    metadataBase: new URL("https://kieio.com"),
    alternates: {
      canonical,
      languages: {
        "en": "/en",
        "zh-Hant": "/",
        "zh-Hans": "/zh-Hans",
        "x-default": "/",
      },
    },
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    },
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      url: "https://kieio.com",
      siteName: "Kieio",
      locale: OG_LOCALE[locale] ?? "en_US",
      type: "website",
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // Session 16 P-02: identify authed user to PostHog so all events link
  // to their distinct_id. Anonymous visitors get a generated id from
  // posthog-js. Resets on signout via PostHogProvider effect.
  const user = await getCachedUser();
  let userTraits: { email?: string | null; displayName?: string | null; locale?: string } | undefined;
  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    userTraits = {
      email: user.email,
      displayName: (profile?.display_name as string | null) ?? null,
      locale,
    };
  }

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansTc.variable} ${termina.variable} ${gimbalExtended.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <NextIntlClientProvider>
          <PostHogProvider userId={user?.id ?? null} userTraits={userTraits}>
            {children}
          </PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
