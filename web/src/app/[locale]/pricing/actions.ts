"use server";

/**
 * Subscription server actions.
 *
 * - startCheckout · creates a Stripe Checkout Session and returns the URL
 *   for the page to redirect to. Used by /pricing's「Subscribe」buttons.
 *
 * - openBillingPortal · creates a Stripe Billing Portal Session and returns
 *   its URL. Used by /settings (or future /settings/billing) to let the user
 *   manage subscription / payment / invoices.
 *
 * Both actions require an authenticated user. Anon callers get redirected
 * to /login with ?next=/pricing.
 */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { createCheckoutSession } from "@/lib/stripe/checkout";
import { createBillingPortalSession } from "@/lib/stripe/portal";
import { getStripe } from "@/lib/stripe/client";
import type { PaidTier } from "@/lib/stripe/products";
import { getAppOrigin } from "@/lib/urls";

/**
 * Begin Stripe Checkout for a subscription tier. Returns the hosted-page URL.
 *
 * Caller (client component) should `window.location.href = url` after the
 * action resolves. We don't redirect() here because Stripe Checkout is on
 * a different origin and Next.js redirect() is same-origin only.
 */
export async function startCheckout(tier: PaidTier): Promise<
  | { ok: true; url: string }
  | { ok: false; error: "auth_required" | "unknown_tier" | "stripe_error"; message?: string }
> {
  if (tier !== "adventurer" && tier !== "storyteller") {
    return { ok: false, error: "unknown_tier" };
  }

  const user = await getCachedUser();
  if (!user) {
    return { ok: false, error: "auth_required" };
  }

  const supabase = await createClient();

  // Find existing Stripe customer for this user (resubscribe case).
  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const origin = getAppOrigin();
  const locale = await getLocale();

  try {
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email ?? undefined,
      tier,
      successUrl: `${origin}/${locale}/settings?subscribed=1`,
      cancelUrl: `${origin}/${locale}/pricing?canceled=1`,
      customerId: existingSub?.stripe_customer_id ?? null,
    });

    if (!session.url) {
      return { ok: false, error: "stripe_error", message: "no session URL returned" };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "stripe_error", message: msg };
  }
}

/**
 * Open Stripe Customer Portal · returns the portal URL for the user to manage
 * their subscription. Caller should redirect to the returned URL.
 */
export async function openBillingPortal(): Promise<
  | { ok: true; url: string }
  | { ok: false; error: "auth_required" | "no_customer" | "stripe_error"; message?: string }
> {
  const user = await getCachedUser();
  if (!user) {
    return { ok: false, error: "auth_required" };
  }

  const supabase = await createClient();

  // Need a customer id to open the portal — only paid users have one.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return { ok: false, error: "no_customer" };
  }

  const origin = getAppOrigin();
  const locale = await getLocale();

  try {
    const session = await createBillingPortalSession({
      customerId: sub.stripe_customer_id,
      returnUrl: `${origin}/${locale}/settings`,
    });
    return { ok: true, url: session.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "stripe_error", message: msg };
  }
}

/**
 * Helper to redirect anon users to login with ?next= back to /pricing.
 * Called by the page's Subscribe button when the action returns auth_required.
 *
 * Server-side wrapper so we keep the redirect type safe with i18n routing.
 */
export async function redirectToLoginForCheckout() {
  const locale = await getLocale();
  redirect({ href: { pathname: "/login", query: { next: "/pricing" } }, locale });
}

// Silence unused-import lint when checkout helpers are imported for type only.
export type { PaidTier };
void getStripe; // type-only re-anchor (helps tree-shaking detect import is intentional)
