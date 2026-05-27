"use client";

/**
 * Settings · Billing portal button.
 *
 * Renders for users who already have a Stripe customer (paid subscribers,
 * past subscribers). Clicking opens the Stripe-hosted Customer Portal where
 * the user can update payment, change plan, view invoices, or cancel.
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { openBillingPortal } from "@/app/[locale]/pricing/actions";

export function BillingPortalButton() {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
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
        <CreditCard className="h-4 w-4" />
        {pending ? "..." : "管理訂閱"}
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
