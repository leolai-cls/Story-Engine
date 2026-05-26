import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
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

export const metadata: Metadata = {
  title: "Kieio — 走入故事，做主角",
  description:
    "Kieio (讀「KEE-yo」) · 中文圈嘅互動式故事 RPG。你想像 · KIEIO 講述 · 你成為。AI 為你度身設計故事，永遠記得你嘅選擇，NPC 真有人格、唔會討好你。",
  metadataBase: new URL("https://kieio.com"),
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Kieio — 走入故事，做主角",
    description:
      "中文圈嘅互動式故事 RPG · You imagine · KIEIO narrates · You become",
    url: "https://kieio.com",
    siteName: "Kieio",
    locale: "zh_HK",
    type: "website",
  },
};

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

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansTc.variable} ${termina.variable} ${gimbalExtended.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
