/**
 * Stripe Billing Portal — Stripe-hosted self-service page where customers
 * can update payment method, cancel/resume subscription, download invoices,
 * change plan, etc.
 *
 * Requires "Customer portal" to be configured in the Stripe dashboard
 * (Billing → Customer portal). Enable: subscriptions can be cancelled,
 * plan switching between Standard ↔ Pro, payment method update.
 */

import { getStripe } from "./client";

/**
 * Wave 1 audit fix (2026-05-27): map app locale → Stripe portal locale
 * so the self-serve UI matches the rest of the site.
 * Narrow type union (Stripe's full enum is wider; SDK validates at runtime).
 */
type StripePortalLocale = "auto" | "en" | "zh" | "zh-HK";

function stripePortalLocaleFor(appLocale?: string): StripePortalLocale {
  if (!appLocale) return "auto";
  if (appLocale === "en") return "en";
  if (appLocale === "zh-Hans") return "zh";
  if (appLocale === "zh-Hant") return "zh-HK";
  return "auto";
}

export async function createBillingPortalSession({
  customerId,
  returnUrl,
  locale,
}: {
  customerId: string;
  returnUrl: string;
  /** App locale (en / zh-Hant / zh-Hans) for Stripe portal UI language. */
  locale?: string;
}) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    locale: stripePortalLocaleFor(locale),
  });
}
