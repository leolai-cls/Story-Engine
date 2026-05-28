"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getAppOrigin } from "@/lib/urls";
import { safeRelativeNextFromForm } from "@/lib/auth/safe-next";

/**
 * Magic link / OAuth redirect base.
 *
 * Always server-side env-based (SEC-M-01 fix). Must point at the APP
 * subdomain (app.kieio.com) so Supabase auth cookies land on the host
 * that serves protected routes. See lib/urls.ts for the helper.
 */
function authRedirectBase(): string {
  return getAppOrigin();
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
    // Wave 1 audit H-02 fix (2026-05-27): pass error code instead of raw 繁中
    // string. Login page resolves to localized copy via t("errors.auth.guestSigninFailed").
    // Also avoids leaking raw provider error message (SEC-L-01).
    console.error("[signInAsGuest] anonymous sign-in failed:", error.message);
    redirect({
      href: `/login?error=guest_signin_failed`,
      locale,
    });
  }

  // Founder product-flow rule (2026-05-25 · per CHANGE 4 of product-flow-
  // redesign.html): Guest first step = browse stories, NOT immediate creation.
  // /stories/new is too high-friction for a try-the-product first impression —
  // they don't yet know what kinds of stories exist. /library is browse-first
  // (Netflix takeover · "Continue Playing" carousel is empty for new Guest ·
  // public stories surface).
  //
  // `next` is still respected when caller explicitly passed it (Guest pulled
  // in from /my / /memory / /play/[id]).
  redirect({ href: (next || "/library") as never, locale });
}
