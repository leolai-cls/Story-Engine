"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    const locale = await getLocale();
    redirect({ href: "/login?error=email_required", locale });
  }

  const supabase = await createClient();
  const hdrs = await headers();
  const origin =
    hdrs.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3001";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  const locale = await getLocale();
  if (error) {
    redirect({
      href: `/login?error=${encodeURIComponent(error.message)}`,
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
