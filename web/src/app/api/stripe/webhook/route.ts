/**
 * Stripe webhook receiver · /api/stripe/webhook
 *
 * Wired in Stripe dashboard → Developers → Webhooks → Add endpoint:
 *   URL:    https://app.kieio.com/api/stripe/webhook
 *   Events: customer.subscription.created
 *           customer.subscription.updated
 *           customer.subscription.deleted
 *           invoice.payment_succeeded
 *           invoice.payment_failed
 *           checkout.session.completed
 *
 * Why server-to-server is the only trust anchor: the success_url after
 * Stripe Checkout can be spoofed by the client (just type it in the bar).
 * Webhook delivery is signed by Stripe's secret, verified here, and that's
 * the ONLY signal we accept for marking a user as paid.
 *
 * Idempotency: each Stripe event has an immutable `event.id`. We persist
 * it in `stripe_webhook_events` and return 200 instantly on retry — Stripe
 * retries every event up to 3 days on non-2xx responses, so duplicate
 * deliveries are normal.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { tierFromPriceId } from "@/lib/stripe/products";
import {
  resolveUserIdForSubscription,
  syncSubscriptionToDb,
  grantMonthlyCreditsForInvoice,
  markSubscriptionDeleted,
  subscriptionIdFromInvoice,
} from "@/lib/billing/subscription";
import { grantTopUpCredits } from "@/lib/billing/topup";

// Stripe requires the raw request body to verify the signature — Next.js
// route handlers give us that via request.text() (NOT request.json(),
// which would re-serialize and break the signature).
export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase env vars missing in webhook context");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("Stripe webhook signature verification failed:", msg);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const supabase = serviceClient();

  // Idempotency · insert into stripe_webhook_events with unique constraint
  // on event_id. If already processed, exit early with 200 so Stripe stops
  // retrying. Audit Wave 1 A2 fix: on 23505 duplicate, check processed_at
  // — if NULL, the prior delivery FAILED mid-dispatch and we must retry
  // (otherwise state never converges).
  const { error: idempErr } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (idempErr) {
    if (idempErr.code === "23505") {
      // Already-logged event — fall through to the atomic claim below.
      // (Prior delivery may have succeeded OR failed mid-dispatch · we
      // can't tell from the duplicate alone.)
    } else {
      console.error("Webhook idempotency insert failed:", idempErr);
      return NextResponse.json(
        { error: "idempotency log failure" },
        { status: 500 },
      );
    }
  }

  // Session 16 audit HIGH-03 fix: atomic CLAIM of the event before dispatch.
  // Was racy — duplicate delivery between INSERT and UPDATE processed_at meant
  // two concurrent dispatchers ran the same event. apply_billing_credit has
  // its own idempotency dedup, but markSubscriptionDeleted + syncSubscriptionToDb
  // don't, so two concurrent UPSERTs would race.
  //
  // The UPDATE ... WHERE processed_at IS NULL RETURNING serves as the claim:
  //   - If RETURNING gives a row → we claimed it · dispatch
  //   - If RETURNING gives nothing → either (a) another worker is dispatching
  //     OR (b) it's already done · either way, exit as duplicate
  // On dispatch failure we null out processed_at so Stripe's next retry can
  // re-claim.
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from("stripe_webhook_events")
    .update({ processed_at: claimedAt })
    .eq("event_id", event.id)
    .is("processed_at", null)
    .select("event_id")
    .maybeSingle();

  if (claimErr) {
    console.error("Webhook claim failed:", claimErr);
    return NextResponse.json({ error: "claim failure" }, { status: 500 });
  }
  if (!claimed) {
    // Another worker already claimed (or finished) this event. Stripe will
    // not retry if we 200 here, so be safe and 200.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Dispatch — wrap each handler in try so we always return a useful response.
  try {
    await dispatch(event, supabase);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Webhook handler failed [${event.type}]:`, msg);
    // Release the claim so the next Stripe retry can re-dispatch.
    await supabase
      .from("stripe_webhook_events")
      .update({ processed_at: null })
      .eq("event_id", event.id);
    // 500 makes Stripe retry — usually what we want for transient failures.
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function dispatch(
  event: Stripe.Event,
  supabase: ReturnType<typeof serviceClient>,
) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdForSubscription(supabase, sub);
      if (!userId) {
        console.warn(`Could not resolve user for subscription ${sub.id}`);
        return;
      }
      const result = await syncSubscriptionToDb(supabase, sub, userId);
      if (!result.ok) {
        throw new Error(`syncSubscriptionToDb: ${result.reason}`);
      }
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdForSubscription(supabase, sub);
      if (!userId) {
        console.warn(`Could not resolve user for deleted subscription ${sub.id}`);
        return;
      }
      const result = await markSubscriptionDeleted(supabase, sub, userId);
      if (!result.ok) {
        throw new Error(`markSubscriptionDeleted: ${result.reason}`);
      }
      return;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      // Only grant credits for SUBSCRIPTION invoices, not one-time top-up
      // invoices. Use helper that handles both legacy `invoice.subscription`
      // and newer `invoice.parent.subscription_details.subscription` paths
      // (Stripe API ≥ 2024-09-30) — audit Wave 1 A3 fix.
      const subId = subscriptionIdFromInvoice(invoice);
      if (!subId) return; // not a subscription invoice (top-up, etc.)

      // Session 16 PM Review #2 (P-05) fix: skip proration invoices.
      // Stripe issues a new invoice with a unique id for EVERY billing event:
      //   - subscription_create  → first invoice when sub starts (GRANT)
      //   - subscription_cycle   → monthly renewal at period boundary (GRANT)
      //   - subscription_update  → PRORATION when user upgrades mid-cycle (SKIP)
      // Without this guard, mid-cycle upgrade Standard → Pro triggers full Pro
      // monthly grant (~$60 LLM value) while user only paid ~$10 proration.
      // Same risk on cancel → resubscribe within same billing period.
      const billingReason = invoice.billing_reason;
      const grantingReasons = new Set(["subscription_create", "subscription_cycle"]);
      if (billingReason && !grantingReasons.has(billingReason)) {
        console.log(
          `[webhook] invoice.payment_succeeded skipping credit grant for billing_reason=${billingReason} (invoice ${invoice.id}). Sync sub state only.`,
        );
        // Still sync subscription state (tier could have changed mid-cycle)
        const sub = await getStripe().subscriptions.retrieve(subId);
        const userId = await resolveUserIdForSubscription(supabase, sub);
        if (userId) {
          await syncSubscriptionToDb(supabase, sub, userId);
        }
        return;
      }

      const sub = await getStripe().subscriptions.retrieve(subId);
      const userId = await resolveUserIdForSubscription(supabase, sub);
      if (!userId) {
        console.warn(`Could not resolve user for invoice ${invoice.id}`);
        return;
      }

      const priceId = sub.items.data[0]?.price.id;
      if (!priceId) return;
      const tier = tierFromPriceId(priceId);
      if (!tier) {
        console.warn(`Unknown price id ${priceId} in invoice ${invoice.id}`);
        return;
      }

      const result = await grantMonthlyCreditsForInvoice(
        supabase,
        invoice,
        userId,
        tier,
      );
      if (!result.ok) {
        throw new Error(`grantMonthlyCredits: ${result.reason}`);
      }
      return;
    }

    case "invoice.payment_failed": {
      // We DON'T downgrade here — Stripe's smart retries (Smart Retries
      // setting) will keep trying for ~3 weeks. Only `customer.subscription.deleted`
      // means "give up, user actually lost access". Logging only here.
      const invoice = event.data.object as Stripe.Invoice;
      console.warn(`Invoice payment failed: ${invoice.id} customer=${invoice.customer}`);
      return;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Branch: top-up purchases need credit grant here. Subscription
      // entitlement is granted via customer.subscription.* events that fire
      // alongside this one — no action needed here for subscription mode.
      if (
        session.mode === "payment" &&
        session.metadata?.purchase_kind === "topup"
      ) {
        const userId = session.metadata?.user_id ?? session.client_reference_id;
        if (!userId) {
          console.warn(`Top-up session ${session.id} has no user_id metadata`);
          return;
        }
        const result = await grantTopUpCredits(
          getStripe(),
          supabase,
          session,
          userId,
        );
        if (!result.ok) {
          throw new Error(`grantTopUpCredits: ${result.reason}`);
        }
        console.log(
          `Top-up granted: session=${session.id} user=${userId} credits=${result.granted}`,
        );
        return;
      }
      // Subscription checkout · just log (the subscription.* webhooks handle it)
      console.log(
        `Checkout completed: session=${session.id} mode=${session.mode} customer=${session.customer} user=${session.metadata?.user_id ?? "?"}`,
      );
      return;
    }

    case "identity.verification_session.verified": {
      const session = event.data.object as Stripe.Identity.VerificationSession;
      const userId =
        session.metadata?.user_id ||
        (typeof session.client_reference_id === "string"
          ? session.client_reference_id
          : null);
      if (!userId) {
        console.warn(`Identity verified but no user_id metadata: ${session.id}`);
        return;
      }
      // CLAUDE.md hard rule: is_age_verified writes ONLY via service_role.
      // We're in the webhook · service-role client · safe to flip.
      const { error } = await supabase
        .from("profiles")
        .update({
          is_age_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) {
        throw new Error(`is_age_verified update failed: ${error.message}`);
      }
      console.log(`Identity verified: user=${userId} session=${session.id}`);
      return;
    }

    case "identity.verification_session.requires_input":
    case "identity.verification_session.canceled": {
      // User abandoned or failed verification · log only. UI will re-render
      // with verify button still active so they can retry.
      const session = event.data.object as Stripe.Identity.VerificationSession;
      console.log(
        `Identity ${event.type.split(".").pop()}: user=${session.metadata?.user_id ?? "?"} session=${session.id} last_error=${JSON.stringify(session.last_error)}`,
      );
      return;
    }

    default:
      // Other event types are stored in stripe_webhook_events for audit but
      // not actively handled. Add cases here as you wire more flows.
      return;
  }
}

// GET handler · health-check the route exists (Stripe doesn't use this).
export function GET() {
  return NextResponse.json({ ok: true, endpoint: "stripe-webhook" });
}
