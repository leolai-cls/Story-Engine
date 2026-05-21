import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Magic link callback. Supabase sends user here after they click the email
 * link with ?code=... . We exchange the code for a session, set auth cookies,
 * and redirect to the destination (default /profile so user sees their new
 * profile created by the on_auth_user_created trigger).
 */

/**
 * AUDIT FIX (SEC-M-02): Validate `next` param is a relative path that won't
 * escape our origin. `//evil.com` and `\\evil.com` get treated by browsers
 * (and `NextResponse.redirect`) as protocol-relative external redirects.
 *
 * Accepts:
 *   - "/", "/library", "/play/abc-123", etc.
 * Rejects:
 *   - "//evil.com", "\\evil.com", "https://evil.com", "javascript:alert(1)"
 *   - Anything not starting with a single forward slash.
 */
function safeRelativeNext(raw: string | null): string {
  if (!raw) return "/profile";
  if (raw.length > 200) return "/profile";
  // Must start with single "/" and second char must NOT be "/" or "\"
  if (!raw.startsWith("/")) return "/profile";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/profile";
  // Block protocol-style strings just in case
  if (/^\/?[a-z]+:/i.test(raw)) return "/profile";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRelativeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=missing_code`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // AUDIT FIX (SEC-L-01 / SEC-M-04): generic client-facing error, log details server-side.
    console.warn("[auth] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=callback_failed`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
