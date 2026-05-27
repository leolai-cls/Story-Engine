/**
 * Subscription state sync · Stripe → Supabase.
 *
 * Webhook handler calls these helpers after verifying the Stripe signature.
 * All writes use service_role (bypasses RLS · the user that owns the row
 * is identified via the Stripe Subscription metadata.user_id, not via
 * auth.uid()).
 *
 * Invariants
 * ----------
 * - `profiles.subscription_tier` is the SINGLE source of truth for what
 *   tier the user is currently entitled to. Webhook updates this; UI reads it.
 * - `subscriptions` table is the HISTORY · one row per Stripe Subscription.
 *   Used for billing dashboard ("when does my plan renew?") and audit.
 * - Credit grants always go through `credit_ledger` (append-only · hard
 *   rule #4: never mutate balance without writing a ledger entry).
 *
 * Schema reminder (existing tables · do not modify):
 *   subscriptions(id, user_id, stripe_customer_id, stripe_subscription_id,
 *                 tier, status, current_period_start, current_period_end,
 *                 cancel_at_period_end, created_at, updated_at)
 *   profiles(subscription_tier, credit_balance, credit_period_end, ...)
 *   credit_ledger(user_id, delta, balance_after, reason, ref_type, ref_id, metadata)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { tierFromPriceId, TIER_MONTHLY_CREDITS, type PaidTier } from "@/lib/stripe/products";

type AnySupabase = SupabaseClient<any, any, any>;

/**
 * Resolve which Kieio user a Stripe Subscription belongs to.
 *
 * Priority:
 *   1. subscription.metadata.user_id   (set when we created the checkout)
 *   2. existing subscriptions row by stripe_customer_id (resubscribe case)
 *   3. existing subscriptions row by stripe_subscription_id
 *
 * Returns null if we can't resolve — caller should log + bail.
 */
export async function resolveUserIdForSubscription(
  supabase: AnySupabase,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const metaUserId = sub.metadata?.user_id;
  if (metaUserId) return metaUserId;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { data: byCustomer } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .limit(1)
    .maybeSingle();
  if (byCustomer?.user_id) return byCustomer.user_id;

  const { data: bySub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", sub.id)
    .limit(1)
    .maybeSingle();
  return bySub?.user_id ?? null;
}

/** Pull the (single) item Price ID out of the subscription. */
function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  return sub.items.data[0]?.price.id ?? null;
}

/**
 * Convert Stripe subscription status into our internal tier.
 *
 * Stripe statuses:
 *   - active                                 → grant entitlement
 *   - trialing                               → grant entitlement (free trial)
 *   - past_due / unpaid                      → keep entitlement (user has time
 *                                              to update payment · most platforms
 *                                              wait until "canceled" before
 *                                              downgrading to avoid jarring UX)
 *   - canceled / incomplete / incomplete_expired
 *                                            → no entitlement (free tier)
 */
function isEntitled(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Upsert subscription row + update profile.subscription_tier.
 *
 * Idempotent — safe to call from multiple webhook event types
 * (customer.subscription.created / updated / deleted).
 */
export async function syncSubscriptionToDb(
  supabase: AnySupabase,
  sub: Stripe.Subscription,
  userId: string,
): Promise<{ ok: true; tier: PaidTier | "free" } | { ok: false; reason: string }> {
  const priceId = priceIdFromSubscription(sub);
  if (!priceId) {
    return { ok: false, reason: "subscription has no price item" };
  }

  const stripeTier = tierFromPriceId(priceId);
  if (!stripeTier) {
    return {
      ok: false,
      reason: `unknown price id ${priceId} · not in env STRIPE_PRICE_* mapping`,
    };
  }

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const entitled = isEntitled(sub.status);
  const effectiveTier: PaidTier | "free" = entitled ? stripeTier : "free";

  // Upsert subscriptions row · keyed on stripe_subscription_id (unique).
  // Cast item period dates from Unix seconds.
  const item = sub.items.data[0];
  const periodStart = item?.current_period_start;
  const periodEnd = item?.current_period_end;
  const { error: subErr } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        tier: stripeTier,
        status: sub.status,
        current_period_start: periodStart
          ? new Date(periodStart * 1000).toISOString()
          : null,
        current_period_end: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  if (subErr) {
    return { ok: false, reason: `subscriptions upsert failed: ${subErr.message}` };
  }

  // Update profile tier + period_end (UI reads from here).
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      subscription_tier: effectiveTier,
      credit_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profErr) {
    return { ok: false, reason: `profile update failed: ${profErr.message}` };
  }

  return { ok: true, tier: effectiveTier };
}

/**
 * Grant the monthly credit allowance to the user.
 *
 * Called from webhook on `invoice.payment_succeeded` (NOT on subscription
 * creation — we want grants to fire exactly when the invoice is paid, so
 * that a failed first payment doesn't grant credits).
 *
 * Uses a ledger entry keyed on the Stripe Invoice id so duplicate webhook
 * deliveries are idempotent.
 */
export async function grantMonthlyCreditsForInvoice(
  supabase: AnySupabase,
  invoice: Stripe.Invoice,
  userId: string,
  tier: PaidTier,
): Promise<{ ok: true; granted: number } | { ok: false; reason: string }> {
  const credits = TIER_MONTHLY_CREDITS[tier];
  if (!credits) {
    return { ok: false, reason: `no credit grant for tier ${tier}` };
  }

  // Idempotency check: have we already credited for THIS invoice?
  const { data: existing } = await supabase
    .from("credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("ref_type", "stripe_invoice")
    .eq("reason", "monthly_subscription_grant")
    .eq("metadata->>invoice_id", invoice.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { ok: true, granted: 0 }; // already granted
  }

  // Read current balance (need balance_after for the ledger row).
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();
  if (profErr || !profile) {
    return { ok: false, reason: `profile read failed: ${profErr?.message}` };
  }

  const newBalance = (profile.credit_balance ?? 0) + credits;

  // Atomic-ish: write the ledger row first (immutable history), then bump
  // balance. If the balance update fails after ledger write, we have a row
  // saying we "intended" to grant — reconciler can replay.
  const { error: ledgerErr } = await supabase.from("credit_ledger").insert({
    user_id: userId,
    delta: credits,
    balance_after: newBalance,
    reason: "monthly_subscription_grant",
    ref_type: "stripe_invoice",
    ref_id: null, // ledger.ref_id is uuid; Stripe ids are strings → put in metadata
    metadata: {
      invoice_id: invoice.id,
      subscription_id:
        typeof (invoice as Stripe.Invoice & { subscription?: unknown }).subscription === "string"
          ? (invoice as Stripe.Invoice & { subscription: string }).subscription
          : null,
      tier,
      amount_paid_cents: invoice.amount_paid,
    },
  });

  if (ledgerErr) {
    return { ok: false, reason: `ledger insert failed: ${ledgerErr.message}` };
  }

  const { error: bumpErr } = await supabase
    .from("profiles")
    .update({
      credit_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (bumpErr) {
    return { ok: false, reason: `balance bump failed: ${bumpErr.message}` };
  }

  return { ok: true, granted: credits };
}

/**
 * Mark subscription as deleted · downgrade tier to free.
 *
 * Stripe fires `customer.subscription.deleted` either:
 *   - User cancels immediately (no proration)
 *   - Cancel-at-period-end fires when period rolls over
 *   - Payment fails N times and Stripe abandons retries
 *
 * In all cases, by the time we get this event the user should lose
 * entitlement. We do NOT zero out credit_balance — credits already granted
 * stay until consumed (fair use · matches NovelAI/AID convention).
 */
export async function markSubscriptionDeleted(
  supabase: AnySupabase,
  sub: Stripe.Subscription,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({
      status: sub.status, // typically "canceled"
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id);
  if (subErr) {
    return { ok: false, reason: `subscriptions update failed: ${subErr.message}` };
  }

  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      subscription_tier: "free",
      credit_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profErr) {
    return { ok: false, reason: `profile downgrade failed: ${profErr.message}` };
  }

  return { ok: true };
}
