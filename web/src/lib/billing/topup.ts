/**
 * One-time top-up credit grants · driven by Stripe checkout.session.completed
 * webhook events (mode=payment, NOT subscription).
 *
 * Credit amount per pack is encoded in Stripe Price metadata (`credits`)
 * — webhook reads from there at grant time so changing pack sizes is a
 * Stripe-dashboard-only operation.
 *
 * Idempotency keyed on Stripe Session id stored in credit_ledger.metadata.session_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

type AnySupabase = SupabaseClient<any, any, any>;

/**
 * Read the credits amount from the Stripe Price metadata of a Session's
 * single line-item. Returns null if the price has no metadata.credits
 * (defensive · skip processing rather than guess).
 */
async function readCreditsFromSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{ credits: number; priceId: string; pack: string | null } | null> {
  // Need line items expanded · session payload doesn't include them.
  const items = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 1,
    expand: ["data.price"],
  });
  const line = items.data[0];
  if (!line || !line.price) return null;
  const price = line.price as Stripe.Price;
  const meta = price.metadata ?? {};
  const credits = parseInt(meta.credits ?? "0", 10);
  if (!Number.isFinite(credits) || credits <= 0) return null;
  return { credits, priceId: price.id, pack: meta.pack ?? null };
}

/**
 * Grant credits for a completed top-up purchase.
 *
 * Webhook calls this on `checkout.session.completed` events where
 * mode === "payment" and metadata.purchase_kind === "topup".
 */
export async function grantTopUpCredits(
  stripe: Stripe,
  supabase: AnySupabase,
  session: Stripe.Checkout.Session,
  userId: string,
): Promise<
  | { ok: true; granted: number; pack: string | null }
  | { ok: false; reason: string }
> {
  const info = await readCreditsFromSession(stripe, session);
  if (!info) {
    return { ok: false, reason: "session has no top-up price metadata" };
  }
  const { credits, priceId, pack } = info;

  // Audit-fix Wave 1 (2026-05-27): route through atomic apply_billing_credit
  // RPC (Migration 0030). Fixes B1 race + B3/D7 enum violations:
  //   reason 'topup_purchase' → 'topup'
  //   ref_type 'stripe_session' → 'topup'
  // Idempotency keyed on session.id at DB level.
  const { data, error } = await supabase.rpc("apply_billing_credit", {
    p_user_id: userId,
    p_delta: credits,
    p_reason: "topup",
    p_ref_type: "topup",
    p_idempotency_key: session.id,
    p_metadata: {
      session_id: session.id,
      pack,
      price_id: priceId,
      amount_total_cents: session.amount_total,
    },
  });

  if (error) {
    return { ok: false, reason: `apply_billing_credit failed: ${error.message}` };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    return { ok: false, reason: "apply_billing_credit returned no row" };
  }

  // Audit Wave 3 🟡: persist Stripe customer_id on profile so Free users who
  // only did a top-up (no subscription row) can still reach Customer Portal
  // to manage saved card / view invoice history. Subscriptions table writes
  // a customer_id too · this is the only path for top-up-only users.
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (stripeCustomerId) {
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId)
      .is("stripe_customer_id", null);
  }

  return { ok: true, granted: row.was_duplicate ? 0 : credits, pack };
}
