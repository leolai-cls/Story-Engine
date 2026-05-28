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

  // Audit-fix Wave 1 (2026-05-27): switched from manual SELECT→INSERT→UPDATE
  // race-prone pattern to atomic `apply_billing_credit` RPC (Migration 0030).
  // RPC handles idempotency via metadata.idempotency_key (= invoice.id) and
  // uses single-statement `UPDATE … RETURNING` to eliminate the lost-update
  // race when concurrent grants fire (B1 audit). Also fixes the enum
  // violations: 'monthly_subscription_grant' → 'sub_renewal' + 'stripe_invoice'
  // → 'subscription' (D7/B3 ship-blocker — previous code silently
  // CHECK-constraint-failed and rolled back the webhook).
  const subId = subscriptionIdFromInvoice(invoice);
  const { data, error } = await supabase.rpc("apply_billing_credit", {
    p_user_id: userId,
    p_delta: credits,
    p_reason: "sub_renewal",
    p_ref_type: "subscription",
    p_idempotency_key: invoice.id,
    p_metadata: {
      invoice_id: invoice.id,
      subscription_id: subId,
      tier,
      amount_paid_cents: invoice.amount_paid,
    },
  });

  if (error) {
    return { ok: false, reason: `apply_billing_credit failed: ${error.message}` };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    return { ok: false, reason: "apply_billing_credit returned no row" };
  }
  return { ok: true, granted: row.was_duplicate ? 0 : credits };
}

/**
 * Pull the subscription ID out of an Invoice across Stripe API versions.
 *
 * - Pre-2024-09-30 API: invoice.subscription (string | null)
 * - 2024-09-30+ API:    invoice.parent.subscription_details.subscription
 *
 * Return null if neither path resolves (top-up invoice etc.).
 */
export function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // Try modern API path first (newer pinned versions).
  // Session 16 audit HIGH-05: Stripe may return either a string (subscription id)
  // OR an expanded Stripe.Subscription object. Was returning null for objects
  // → monthly grant silently skipped if Stripe ever auto-expands.
  const parent = (invoice as Stripe.Invoice & {
    parent?: {
      subscription_details?: { subscription?: string | Stripe.Subscription | null } | null;
    } | null;
  }).parent;
  const modern = parent?.subscription_details?.subscription;
  if (typeof modern === "string") return modern;
  if (modern && typeof modern === "object" && "id" in modern) return modern.id;
  // Fallback to legacy API path.
  const legacy = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null })
    .subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id;
  return null;
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

  // Audit Wave 1 D1: also clear adult_mode_enabled. Adult mode is Pro-only
  // (TIER_DISPLAY.storyteller bullet). After cancel→free, the toggle should
  // visually + logically reset. Keep is_age_verified intact so a re-subscribe
  // user doesn't have to re-KYC. CLAUDE.md hard rule #5 (NSFW LLM isolation)
  // is enforced by the DB CHECK on adult_mode_enabled needing is_age_verified
  // PLUS by routing at credits.ts userTierAllowsModel — but flipping the bit
  // off here closes a UI footgun where canceled users see "已開啟" while
  // routing has actually blocked them.
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      subscription_tier: "free",
      credit_period_end: null,
      adult_mode_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profErr) {
    return { ok: false, reason: `profile downgrade failed: ${profErr.message}` };
  }

  return { ok: true };
}
