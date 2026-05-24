"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";

/**
 * Magic link redirect base. AUDIT FIX (SEC-M-01): Previously fell back to
 * `headers().get("origin")` which is browser-controlled — a phishing page
 * could trigger a magic link sent to attacker.com/auth/callback. We now use
 * ONLY the server-side env var (NEXT_PUBLIC_SITE_URL); local dev defaults
 * to localhost:3001.
 */
function authRedirectBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
}

/**
 * AUDIT FIX MG-UX-HIGH-01: Validate the `next` param from FormData using the
 * same safety contract as auth/callback's safeRelativeNext (≤200 chars,
 * starts with single "/", not protocol-relative, no protocol-scheme prefix).
 * Returns "" if invalid so callers can decide the default destination.
 */
function safeRelativeNextFromForm(formData: FormData): string {
  const raw = String(formData.get("next") || "");
  if (!raw) return "";
  if (raw.length > 200) return "";
  if (!raw.startsWith("/")) return "";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "";
  if (/^\/?[a-z]+:/i.test(raw)) return "";
  return raw;
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const next = safeRelativeNextFromForm(formData);
  if (!email) {
    const locale = await getLocale();
    // Bounce back to login preserving the next so user doesn't lose context.
    const errHref = next
      ? `/login?error=email_required&next=${encodeURIComponent(next)}`
      : "/login?error=email_required";
    redirect({ href: errHref, locale });
  }

  const supabase = await createClient();
  const origin = authRedirectBase();

  // Forward `next` to auth/callback so the magic-link landing returns the
  // user to their original destination (e.g. /my, /memory) instead of
  // /profile default. auth/callback re-validates via safeRelativeNext.
  const callbackUrl = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl,
    },
  });

  const locale = await getLocale();
  if (error) {
    // AUDIT FIX (SEC-L-01): Don't leak provider error details (rate limit
    // hints, signup-disabled state, etc.) which enable user enumeration.
    // Log server-side, return generic message to client. The "sent" path
    // is also taken on error so attacker can't distinguish via response.
    console.warn("[auth] signInWithOtp error:", error.message);
    const errHref = next
      ? `/login?error=otp_failed&next=${encodeURIComponent(next)}`
      : `/login?error=otp_failed`;
    redirect({ href: errHref, locale });
  }
  const sentHref = next
    ? `/login?sent=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`
    : `/login?sent=${encodeURIComponent(email)}`;
  redirect({ href: sentHref, locale });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/", locale });
}

/**
 * Anonymous sign-in — creates a guest session without email.
 * Useful for visitors trying the product without committing to a real account.
 * Profile row still auto-created by on_auth_user_created trigger (display_name
 * will be NULL since no email/metadata).
 *
 * Anonymous users can later "upgrade" by linking an email — Phase 6 feature.
 */
/**
 * Google OAuth sign-in (Supabase native provider).
 *
 * Flow:
 *   1. User clicks 「用 Google 繼續」on /login
 *   2. We call signInWithOAuth({ provider: 'google' }) — Supabase returns a
 *      consent URL pointing at Google
 *   3. nextRedirect(data.url) sends user out to Google's consent screen
 *   4. Google completes auth → redirects to Supabase's project callback
 *      (https://oivhvdfjmthydxqpcncp.supabase.co/auth/v1/callback)
 *   5. Supabase exchanges Google's code for a session, then redirects to our
 *      app's /auth/callback?code=...&next=... (the `redirectTo` we set below)
 *   6. /auth/callback route exchanges code → cookie → redirects to ${next}
 *
 * Config dependencies (founder one-time setup):
 *   - Google Cloud Console: OAuth 2.0 Client ID with authorized redirect URI:
 *     https://oivhvdfjmthydxqpcncp.supabase.co/auth/v1/callback
 *   - Supabase Dashboard → Auth → Providers → Google: enable + paste client
 *     id + secret
 *
 * Without config: Supabase returns "provider is not enabled" error → user
 * lands back on /login?error=google_unavailable (generic — don't leak provider).
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeRelativeNextFromForm(formData);
  const supabase = await createClient();
  const origin = authRedirectBase();

  // Round-trip the `next` param through the OAuth flow so user lands back at
  // their intended destination (e.g. /zh-Hant/my). Supabase preserves the
  // redirectTo across Google's hop. Our /auth/callback handler re-validates
  // safe-relative again before final redirect (defense in depth).
  const callbackUrl = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error) {
    console.warn("[auth] signInWithOAuth(google) error:", error.message);
    const locale = await getLocale();
    const errHref = next
      ? `/login?error=google_unavailable&next=${encodeURIComponent(next)}`
      : "/login?error=google_unavailable";
    redirect({ href: errHref, locale });
  }

  if (data?.url) {
    // External redirect to Google consent screen. Must use nextRedirect (not
    // the locale-wrapped one) since this is an absolute URL on google.com.
    nextRedirect(data.url);
  }

  // Unreachable — both branches above redirect. Defensive fallback only.
  const locale = await getLocale();
  redirect({ href: "/login?error=google_unavailable", locale });
}

export async function signInAsGuest(formData: FormData) {
  const supabase = await createClient();
  const locale = await getLocale();
  const next = safeRelativeNextFromForm(formData);

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    redirect({
      href: `/login?error=${encodeURIComponent("Guest 登入失敗: " + error.message)}`,
      locale,
    });
  }

  // AUDIT FIX MG-UX-HIGH-01: respect `next` so guests pulled in from /my,
  // /memory, /play/[id], etc. land on their original destination. Default
  // remains /stories/new for the "I came to try the product" landing.
  redirect({ href: (next || "/stories/new") as never, locale });
}
