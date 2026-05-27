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
  // Idempotency: have we already granted for this exact Session?
  const { data: existing } = await supabase
    .from("credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", "topup_purchase")
    .eq("ref_type", "stripe_session")
    .eq("metadata->>session_id", session.id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { ok: true, granted: 0, pack: null }; // already credited
  }

  const info = await readCreditsFromSession(stripe, session);
  if (!info) {
    return { ok: false, reason: "session has no top-up price metadata" };
  }
  const { credits, priceId, pack } = info;

  // Read current balance to compute balance_after for the ledger row.
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .single();
  if (profErr || !profile) {
    return { ok: false, reason: `profile read failed: ${profErr?.message}` };
  }
  const newBalance = (profile.credit_balance ?? 0) + credits;

  const { error: ledgerErr } = await supabase.from("credit_ledger").insert({
    user_id: userId,
    delta: credits,
    balance_after: newBalance,
    reason: "topup_purchase",
    ref_type: "stripe_session",
    ref_id: null,
    metadata: {
      session_id: session.id,
      pack,
      price_id: priceId,
      amount_total_cents: session.amount_total,
    },
  });
  if (ledgerErr) {
    return { ok: false, reason: `ledger insert failed: ${ledgerErr.message}` };
  }

  const { error: bumpErr } = await supabase
    .from("profiles")
    .update({ credit_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (bumpErr) {
    return { ok: false, reason: `balance bump failed: ${bumpErr.message}` };
  }

  return { ok: true, granted: credits, pack };
}
