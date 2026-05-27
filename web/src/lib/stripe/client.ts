/**
 * Stripe server-side client · lazy singleton.
 *
 * NEVER import this from client components — STRIPE_SECRET_KEY is a server-only
 * secret. Only server actions, route handlers, and server components may use it.
 *
 * The throw-on-missing-key behavior is intentional: better to crash fast at boot
 * than silently no-op a payment flow.
 */

import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not set · configure on Vercel before invoking checkout/portal/webhook",
    );
  }
  cached = new Stripe(key, {
    // Let SDK pick its pinned default — avoids drift between SDK release
    // and our explicit version string. SDK 22.x pins to its tested API.
    typescript: true,
    appInfo: {
      name: "Kieio",
      url: "https://kieio.com",
    },
  });
  return cached;
}

/**
 * Public Stripe publishable key — safe to ship to the client. Used for
 * loading @stripe/stripe-js if/when we need client-side Stripe Elements
 * (custom payment UI). For Checkout Sessions we just redirect to the
 * session URL, no client-side Stripe needed.
 */
export function getPublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}
