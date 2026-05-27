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

export async function createBillingPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}
