"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
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

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    const locale = await getLocale();
    redirect({ href: "/login?error=email_required", locale });
  }

  const supabase = await createClient();
  const origin = authRedirectBase();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  const locale = await getLocale();
  if (error) {
    // AUDIT FIX (SEC-L-01): Don't leak provider error details (rate limit
    // hints, signup-disabled state, etc.) which enable user enumeration.
    // Log server-side, return generic message to client. The "sent" path
    // is also taken on error so attacker can't distinguish via response.
    console.warn("[auth] signInWithOtp error:", error.message);
    redirect({
      href: `/login?error=otp_failed`,
      locale,
    });
  }
  redirect({
    href: `/login?sent=${encodeURIComponent(email)}`,
    locale,
  });
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
export async function signInAsGuest() {
  const supabase = await createClient();
  const locale = await getLocale();

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    redirect({
      href: `/login?error=${encodeURIComponent("Guest 登入失敗: " + error.message)}`,
      locale,
    });
  }

  // Send guest straight to story creation — they're here to try the product
  redirect({ href: "/stories/new" as never, locale });
}
