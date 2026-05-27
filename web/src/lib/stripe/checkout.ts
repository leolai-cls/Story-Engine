/**
 * Create Stripe Checkout sessions for subscription purchase.
 *
 * Flow:
 *   1. User clicks「Subscribe Standard」on /pricing
 *   2. Server action calls createCheckoutSession() → gets a session URL
 *   3. Redirect user to that URL (Stripe-hosted page · handles card entry,
 *      Apple Pay, Google Pay, etc.)
 *   4. On success, Stripe redirects back to successUrl
 *   5. Webhook fires `checkout.session.completed` → we provision tier
 *
 * IMPORTANT: do NOT trust the success_url redirect alone to mark the user
 * as paid — that URL can be spoofed by the client. The DB state is only
 * updated when the WEBHOOK fires (signature-verified · server-to-server).
 */

import { getStripe } from "./client";
import { priceIdForTier, priceIdForTopUp, type PaidTier, type TopUpPack } from "./products";

export async function createCheckoutSession({
  userId,
  email,
  tier,
  successUrl,
  cancelUrl,
  customerId,
}: {
  /** Supabase auth user id · gets propagated via client_reference_id + metadata. */
  userId: string;
  /** Pre-fill email field if no existing Stripe customer. */
  email?: string;
  tier: PaidTier;
  successUrl: string;
  cancelUrl: string;
  /** If user already has a Stripe customer (e.g. resubscribing), reuse it. */
  customerId?: string | null;
}) {
  const stripe = getStripe();
  const priceId = priceIdForTier(tier);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : email,
    client_reference_id: userId,
    // Metadata persists on both the Session and the resulting Subscription.
    // Webhook handlers read this to identify which user the subscription
    // belongs to — Stripe's `customer.email` is unreliable as an FK because
    // users can change email on Stripe but our auth.users.id is immutable.
    metadata: { user_id: userId, internal_tier: tier },
    subscription_data: {
      metadata: { user_id: userId, internal_tier: tier },
    },
    allow_promotion_codes: true,
    // Tax collection set to "auto" lets Stripe Tax compute and add VAT/GST
    // based on customer location. Requires Stripe Tax to be enabled in the
    // dashboard; otherwise it no-ops gracefully.
    automatic_tax: { enabled: true },
  });
}

/**
 * Create a one-time top-up Checkout Session.
 *
 * Flow:
 *   1. User clicks「Top up」on /settings (or /pricing)
 *   2. Server action calls createTopUpCheckoutSession() → gets session URL
 *   3. Redirect user to that URL
 *   4. On success, Stripe fires `checkout.session.completed` with mode=payment
 *   5. Webhook grants credits based on Price metadata.credits
 *
 * Unlike subscription mode, payment mode is single-charge · no recurring
 * billing · no Stripe customer required (but we still pass it if available
 * so future portal flows can see the invoice history).
 */
export async function createTopUpCheckoutSession({
  userId,
  email,
  pack,
  successUrl,
  cancelUrl,
  customerId,
}: {
  userId: string;
  email?: string;
  pack: TopUpPack;
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
}) {
  const stripe = getStripe();
  const priceId = priceIdForTopUp(pack);

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : email,
    client_reference_id: userId,
    metadata: { user_id: userId, topup_pack: pack, purchase_kind: "topup" },
    payment_intent_data: {
      metadata: { user_id: userId, topup_pack: pack, purchase_kind: "topup" },
    },
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },
    // Show clear line item description in receipt
    invoice_creation: { enabled: true },
  });
}
