"use client";

/**
 * Dark-themed subscribe button · for the marketing pricing page.
 *
 * Mirrors the SubscribeButton in /pricing/subscribe-button.tsx but renders
 * raw <button>/<a> elements with marketing-CSS classes (.btn-primary /
 * .btn-secondary) instead of shadcn's Button. Same server actions, same
 * logic — different visual chrome.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { startCheckout, openBillingPortal } from "@/app/[locale]/pricing/actions";
import type { PaidTier } from "@/lib/stripe/products";

type Props = {
  tier: PaidTier;
  isAuthed: boolean;
  currentTier: string | null;
  hasStripeCustomer: boolean;
  pendingCancel?: boolean;
  loginHref: string;
  labelSubscribe: string;
  labelCurrent: string;
  labelPendingCancel: string;
  labelManage: string;
  labelSwitch: string;
  labelLogin: string;
};

export function MarketingSubscribeButton({
  tier,
  isAuthed,
  currentTier,
  hasStripeCustomer,
  pendingCancel = false,
  loginHref,
  labelSubscribe,
  labelCurrent,
  labelPendingCancel,
  labelManage,
  labelSwitch,
  labelLogin,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Session 16 audit HIGH-06 fix: localize error code instead of leaking raw
  // code ("stripe_error") or English Stripe message at the $9.99 paywall.
  const tErrors = useTranslations("errors.billing");

  if (!isAuthed) {
    return (
      <a href={loginHref} className="mk-btn-primary">
        {labelLogin}
      </a>
    );
  }

  if (currentTier === tier) {
    return (
      <div className="mk-btn-stack">
        {pendingCancel ? (
          <button
            type="button"
            className="mk-btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setErr(null);
                const res = await openBillingPortal();
                if (res.ok) window.location.href = res.url;
                else setErr(tErrors("portalFailed"));
              })
            }
          >
            {labelPendingCancel}
          </button>
        ) : (
          <button type="button" className="mk-btn-disabled" disabled>
            {labelCurrent}
          </button>
        )}
        <button
          type="button"
          className="mk-btn-link"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setErr(null);
              const res = await openBillingPortal();
              if (res.ok) window.location.href = res.url;
              else setErr(res.message ?? res.error);
            })
          }
        >
          {labelManage}
        </button>
        {err && <p className="mk-err">{err}</p>}
      </div>
    );
  }

  const isSwitch = !!currentTier && currentTier !== "free";
  return (
    <div className="mk-btn-stack">
      <button
        type="button"
        className="mk-btn-primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setErr(null);
            if (isSwitch && hasStripeCustomer) {
              const res = await openBillingPortal();
              if (res.ok) window.location.href = res.url;
              else setErr(tErrors("portalFailed"));
              return;
            }
            const res = await startCheckout(tier);
            if (res.ok) window.location.href = res.url;
            else setErr(tErrors("checkoutFailed"));
          })
        }
      >
        {pending ? "…" : isSwitch ? labelSwitch : labelSubscribe}
      </button>
      {err && <p className="mk-err">{err}</p>}
    </div>
  );
}
