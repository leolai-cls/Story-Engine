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
import { createCheckoutSession, createTopUpCheckoutSession } from "@/lib/stripe/checkout";
import { createBillingPortalSession } from "@/lib/stripe/portal";
import { createIdentityVerificationSession } from "@/lib/stripe/identity";
import { getStripe } from "@/lib/stripe/client";
import type { PaidTier, TopUpPack } from "@/lib/stripe/products";
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

  // Find existing Stripe customer — Wave 3 fix: check both sources.
  // Free user who did a top-up has a customer on profile (Migration 0032)
  // but no subscription row · should reuse not create duplicate.
  const [{ data: existingSub }, { data: existingProfile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const customerId =
    existingSub?.stripe_customer_id ?? existingProfile?.stripe_customer_id ?? null;

  const origin = getAppOrigin();
  const locale = await getLocale();

  try {
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email ?? undefined,
      tier,
      successUrl: `${origin}/${locale}/settings?subscribed=1`,
      cancelUrl: `${origin}/${locale}/pricing?canceled=1`,
      customerId,
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

  // Audit Wave 3 🟡 fix: check BOTH subscriptions table AND profiles column.
  // Free user who only did a top-up has a Stripe customer (stored on profile
  // via Migration 0032) but no subscriptions row → previously returned
  // no_customer error · could not manage saved card.
  const [{ data: sub }, { data: profile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const customerId = sub?.stripe_customer_id ?? profile?.stripe_customer_id ?? null;
  if (!customerId) {
    return { ok: false, error: "no_customer" };
  }

  const origin = getAppOrigin();
  const locale = await getLocale();

  try {
    const session = await createBillingPortalSession({
      customerId,
      returnUrl: `${origin}/${locale}/settings`,
    });
    return { ok: true, url: session.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "stripe_error", message: msg };
  }
}

/**
 * One-time top-up credit purchase. Returns Stripe Checkout URL.
 * No subscription created · just a single-charge credit pack.
 */
export async function startTopUpCheckout(pack: TopUpPack): Promise<
  | { ok: true; url: string }
  | { ok: false; error: "auth_required" | "unknown_pack" | "stripe_error"; message?: string }
> {
  if (pack !== "small" && pack !== "medium" && pack !== "large") {
    return { ok: false, error: "unknown_pack" };
  }

  const user = await getCachedUser();
  if (!user) {
    return { ok: false, error: "auth_required" };
  }

  const supabase = await createClient();
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
    const session = await createTopUpCheckoutSession({
      userId: user.id,
      email: user.email ?? undefined,
      pack,
      successUrl: `${origin}/${locale}/settings?topup=1`,
      cancelUrl: `${origin}/${locale}/settings?topup_canceled=1`,
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
 * Phase 6 KYC · Stripe Identity age verification.
 *
 * Returns the hosted verification URL. Client redirects to it; user
 * completes the selfie + ID flow; Stripe webhook
 * (identity.verification_session.verified) sets profiles.is_age_verified.
 *
 * Test mode: use Stripe test ID images at https://docs.stripe.com/identity/verification-sessions
 */
export async function startAgeVerification(): Promise<
  | { ok: true; url: string }
  | { ok: false; error: "auth_required" | "already_verified" | "stripe_error"; message?: string }
> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "auth_required" };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_age_verified")
    .eq("id", user.id)
    .single();

  if (profile?.is_age_verified) {
    return { ok: false, error: "already_verified" };
  }

  const origin = getAppOrigin();
  const locale = await getLocale();

  try {
    // Audit Wave 2 B3/A6 fix: reuse a recent unfinished verification
    // session if one exists (last 1 hour, this user, not terminal status).
    // Without this, a user re-clicking 「開始年齡驗證」after returning to
    // /settings would spawn a fresh session — in live mode each session
    // costs $1.50. List endpoint can't filter by metadata server-side, so
    // we filter client-side over the most recent batch.
    const stripe = getStripe();
    const cutoff = Math.floor(Date.now() / 1000) - 3600;
    const recent = await stripe.identity.verificationSessions.list({
      created: { gte: cutoff },
      limit: 20,
    });
    const reusable = recent.data.find(
      (s) =>
        s.metadata?.user_id === user.id &&
        s.status !== "verified" &&
        s.status !== "canceled" &&
        typeof s.url === "string",
    );
    if (reusable?.url) {
      return { ok: true, url: reusable.url };
    }

    const session = await createIdentityVerificationSession({
      userId: user.id,
      email: user.email ?? undefined,
      returnUrl: `${origin}/${locale}/settings?verified=pending`,
    });
    if (!session.url) {
      return { ok: false, error: "stripe_error", message: "no url returned" };
    }
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
export type { PaidTier, TopUpPack };
void getStripe; // type-only re-anchor (helps tree-shaking detect import is intentional)
