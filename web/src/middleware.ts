import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intl = createMiddleware(routing);

/**
 * Hard subdomain split (founder rule · 2026-05-27 · 「總之要分返開個網站同個product」).
 *
 *   kieio.com           = marketing/landing  (/, /pricing, /about, /blog, /terms, /privacy)
 *   app.kieio.com       = product            (/login, /auth/*, /library, /my, /play/*,
 *                                             /stories/*, /settings, /profile)
 *
 * If a user lands on the WRONG subdomain for a route, redirect them to the
 * canonical host with a 308 (permanent). Same-host requests pass through
 * untouched and continue to next-intl + Supabase session refresh.
 *
 * Preview deploys (vercel.app), localhost, and any other host bypass this
 * logic entirely so development + preview environments still serve the
 * whole app from one origin.
 */
const PRODUCT_ROUTE_PREFIXES = [
  "/login",
  "/auth/",
  "/library",
  "/my",
  "/play/",
  "/play", // catches /play exactly
  "/memory", // Wave 3 · generated-image gallery (product subdomain)
  "/stories/",
  "/stories", // catches /stories exactly
  "/settings",
  "/profile",
  "/admin/",
  "/admin", // Session 16 P-03 · admin moderation queue on app subdomain
];

const MARKETING_ROUTE_PREFIXES = [
  "/pricing",
  "/about",
  "/blog",
  "/terms",
  "/privacy",
  "/cookies",
];

const LOCALE_RE = /^\/(en|zh-Hans|zh-Hant)(\/.*|$)/;

function stripLocale(pathname: string): { locale: string | null; barePath: string } {
  const m = pathname.match(LOCALE_RE);
  if (!m) return { locale: null, barePath: pathname };
  return { locale: m[1], barePath: m[2] || "/" };
}

function classify(barePath: string): "product" | "marketing" | "shared" {
  // Exact match or prefix match (with trailing slash to avoid /libraries matching /library)
  for (const p of PRODUCT_ROUTE_PREFIXES) {
    if (barePath === p || barePath.startsWith(p === "/" ? p : p.endsWith("/") ? p : p + "/")) {
      return "product";
    }
  }
  for (const p of MARKETING_ROUTE_PREFIXES) {
    if (barePath === p || barePath.startsWith(p + "/")) return "marketing";
  }
  // "/" is shared — each host serves its own home (marketing landing on
  // kieio.com · product redirect to /library on app.kieio.com)
  return "shared";
}

function isProdMarketingHost(host: string): boolean {
  return host === "kieio.com" || host === "www.kieio.com";
}
function isProdAppHost(host: string): boolean {
  return host === "app.kieio.com";
}

export default async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();

  // Only run hostname routing on prod kieio.com hosts. Preview deploys,
  // localhost, etc. fall through to single-origin behavior.
  if (isProdMarketingHost(host) || isProdAppHost(host)) {
    const { locale, barePath } = stripLocale(request.nextUrl.pathname);
    const localePrefix = locale ? `/${locale}` : "";
    const classification = classify(barePath);

    // ① Product route landed on marketing host → redirect to app subdomain
    if (isProdMarketingHost(host) && classification === "product") {
      const url = request.nextUrl.clone();
      url.host = "app.kieio.com";
      url.protocol = "https:";
      url.port = "";
      return NextResponse.redirect(url, 308);
    }

    // ② Marketing route landed on app host → redirect to marketing
    if (isProdAppHost(host) && classification === "marketing") {
      const url = request.nextUrl.clone();
      url.host = "kieio.com";
      url.protocol = "https:";
      url.port = "";
      return NextResponse.redirect(url, 308);
    }

    // ③ app.kieio.com/ has no marketing landing — kick to /library
    //    (which itself will route auth: anon → /login · authed → library)
    if (isProdAppHost(host) && barePath === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `${localePrefix}/library`;
      return NextResponse.redirect(url, 302);
    }

    // ④ www → apex on marketing
    if (host === "www.kieio.com") {
      const url = request.nextUrl.clone();
      url.host = "kieio.com";
      url.protocol = "https:";
      url.port = "";
      return NextResponse.redirect(url, 308);
    }
  }

  // Default chain: next-intl locale resolution → Supabase session refresh
  const response = intl(request);
  await updateSession(request, response);
  return response;
}

export const config = {
  matcher: [
    // Exclude api/_next/_vercel, the bare /auth callback path, and files with extensions
    "/((?!api|_next|_vercel|auth|.*\\..*).*)",
  ],
};
