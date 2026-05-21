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
