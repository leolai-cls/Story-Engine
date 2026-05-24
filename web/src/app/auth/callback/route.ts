import { createClient } from "@/lib/supabase/server";
import { getLandingPath } from "@/lib/auth/landing";
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
 */

/**
 * AUDIT FIX (SEC-M-02): Validate `next` param is a relative path that won't
 * escape our origin. `//evil.com` and `\\evil.com` get treated by browsers
 * (and `NextResponse.redirect`) as protocol-relative external redirects.
 *
 * Returns null when raw is missing OR invalid · callers fall back to the
 * smart default landing path (getLandingPath).
 */
function safeRelativeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length > 200) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/^\/?[a-z]+:/i.test(raw)) return null;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRelativeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // AUDIT FIX (SEC-L-01 / SEC-M-04): generic client-facing error, log details server-side.
    console.warn("[auth] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(`${origin}/login?error=callback_failed`);
  }

  // If caller specified an explicit `next`, honor it (they came from a
  // protected route like /my or /memory and we want to return them there).
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Smart default: ChatGPT-style landing. Fetch the just-authenticated user
  // to scope getLandingPath. If something goes wrong, fall back to /library
  // (browsable safe default · never /profile).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/library`);
  }

  const landingPath = await getLandingPath(supabase, user.id);
  return NextResponse.redirect(`${origin}${landingPath}`);
}
