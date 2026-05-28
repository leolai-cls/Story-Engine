import { createClient } from "@/lib/supabase/server";
import { getLandingPath } from "@/lib/auth/landing";
import { safeRelativeNext, resolveLocale, localizePath } from "@/lib/auth/safe-next";
import { captureServerEvent } from "@/lib/posthog/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Magic link / Google OAuth callback. Supabase sends user here with ?code=...
 * after they complete the provider flow. We exchange the code for a session,
 * set auth cookies, then redirect.
 *
 * Redirect priority:
 *   1. `next` searchParam (validated via safeRelativeNext) — user was bounced
 *      from a protected route, return them there
 *   2. Smart default per founder product-flow rule (2026-05-25):
 *        - User has any playthrough → /my (ChatGPT-style "your conversations")
 *        - User has zero playthroughs → /library (Netflix browse-first)
 *      Never /profile (empty placeholder · dead-end).
 *
 * Session 16 audit CRIT-06 fix: this route lives at /auth/callback (NOT
 * under /[locale]/), so middleware skips next-intl locale resolution. Without
 * explicit handling, every redirect emitted here drops the user's locale.
 * Now resolves locale from: next param → NEXT_LOCALE cookie → Accept-Language →
 * default, and prepends the locale prefix on all redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRelativeNext(searchParams.get("next"));

  // Resolve locale outside of [locale]/ route — see safe-next.ts
  const locale = resolveLocale({
    next,
    cookieLocale: request.cookies.get("NEXT_LOCALE")?.value ?? null,
    acceptLanguage: request.headers.get("accept-language"),
  });

  const localizedRedirect = (path: string) =>
    NextResponse.redirect(`${origin}${localizePath(path, locale)}`);

  if (!code) {
    return localizedRedirect("/login?error=missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // AUDIT FIX (SEC-L-01 / SEC-M-04): generic client-facing error, log details server-side.
    console.warn("[auth] exchangeCodeForSession error:", error.message);
    return localizedRedirect("/login?error=callback_failed");
  }

  // If caller specified an explicit `next`, honor it (they came from a
  // protected route like /my or /memory and we want to return them there).
  if (next) {
    return NextResponse.redirect(`${origin}${localizePath(next, locale)}`);
  }

  // Smart default: ChatGPT-style landing. Fetch the just-authenticated user
  // to scope getLandingPath. If something goes wrong, fall back to /library
  // (browsable safe default · never /profile).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return localizedRedirect("/library");
  }

  // Session 16 PM Review #2 (P-02): fire signup event if this is the user's
  // FIRST authenticated session ever. Heuristic: profile.created_at within
  // last 60s = brand new (handle_new_user trigger fired just before us).
  // Cheap: 1 row read, server-side only · no client roundtrip impact.
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("id", user.id)
      .maybeSingle();
    const createdAt = profile?.created_at ? new Date(profile.created_at as string).getTime() : 0;
    const isNewSignup = createdAt > 0 && Date.now() - createdAt < 60_000;
    if (isNewSignup) {
      await captureServerEvent(user.id, "signup", {
        provider: user.app_metadata?.provider ?? "unknown",
        locale,
        is_anonymous: user.is_anonymous ?? false,
      });
    }
  } catch (e) {
    console.warn("[auth/callback] PostHog signup event failed:", e);
  }

  const landingPath = await getLandingPath(supabase, user.id);
  return localizedRedirect(landingPath);
}
