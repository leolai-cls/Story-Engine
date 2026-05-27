"use client";

/**
 * Client-side Subscribe CTA · talks to the startCheckout server action and
 * redirects the browser to the returned Stripe Checkout URL.
 *
 * For anon users we fall through to a regular /login link (no action call).
 * For users already on this tier we show「Current plan」disabled state.
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { startCheckout, openBillingPortal } from "./actions";
import type { PaidTier } from "@/lib/stripe/products";

type Props = {
  tier: PaidTier;
  isAuthed: boolean;
  /** User's current subscription tier (or null if not subscribed). */
  currentTier: string | null;
  /** Whether the user has any Stripe customer record (used for "Manage" fallback). */
  hasStripeCustomer: boolean;
  /** Label shown on the button — keeps copy in the parent component. */
  labelSubscribe: string;
  labelCurrent: string;
  labelManage: string;
  labelSwitch: string;
  labelLogin: string;
};

export function SubscribeButton({
  tier,
  isAuthed,
  currentTier,
  hasStripeCustomer,
  labelSubscribe,
  labelCurrent,
  labelManage,
  labelSwitch,
  labelLogin,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Anon → straight to login (no action call).
  if (!isAuthed) {
    return (
      <Button className="w-full" render={<Link href={{ pathname: "/login", query: { next: "/pricing" } }} />}>
        {labelLogin}
      </Button>
    );
  }

  // Already on this tier · disabled "Current plan" + Manage link.
  if (currentTier === tier) {
    return (
      <div className="space-y-2">
        <Button className="w-full" disabled variant="secondary">
          {labelCurrent}
        </Button>
        <button
          type="button"
          className="w-full text-xs underline text-muted-foreground hover:text-foreground"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setErr(null);
              const res = await openBillingPortal();
              if (res.ok) {
                window.location.href = res.url;
              } else {
                setErr(res.message ?? res.error);
              }
            })
          }
        >
          {labelManage}
        </button>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    );
  }

  // On a different tier (incl. free) · trigger checkout / switch flow.
  const isSwitch = !!currentTier && currentTier !== "free";
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setErr(null);
            // If user already has a Stripe customer + active sub on another
            // tier, route them through the customer portal where they can
            // switch plan (cleaner than creating a duplicate subscription).
            if (isSwitch && hasStripeCustomer) {
              const res = await openBillingPortal();
              if (res.ok) {
                window.location.href = res.url;
              } else {
                setErr(res.message ?? res.error);
              }
              return;
            }
            const res = await startCheckout(tier);
            if (res.ok) {
              window.location.href = res.url;
            } else {
              setErr(res.message ?? res.error);
            }
          })
        }
      >
        {pending ? "..." : isSwitch ? labelSwitch : labelSubscribe}
      </Button>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
