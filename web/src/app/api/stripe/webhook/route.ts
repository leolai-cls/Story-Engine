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
} from "@/lib/billing/subscription";

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
  // retrying.
  const { error: idempErr } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (idempErr) {
    // Unique violation = duplicate delivery · we already handled this event.
    if (idempErr.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("Webhook idempotency insert failed:", idempErr);
    return NextResponse.json(
      { error: "idempotency log failure" },
      { status: 500 },
    );
  }

  // Dispatch — wrap each handler in try so we always return a useful response.
  try {
    await dispatch(event, supabase);
    await supabase
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Webhook handler failed [${event.type}]:`, msg);
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
      // invoices (which we'll handle separately later via a different
      // metadata marker).
      // In Stripe API ≥ 2025, invoice.subscription is a string id when set.
      const subId = (invoice as Stripe.Invoice & { subscription?: string | null })
        .subscription;
      if (!subId) return; // not a subscription invoice (top-up, etc.)

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
      // Logging only. The actual entitlement is granted via the subscription
      // events that fire alongside this one.
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(
        `Checkout completed: session=${session.id} customer=${session.customer} user=${session.metadata?.user_id ?? "?"}`,
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
