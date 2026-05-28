"use client";

/**
 * Settings · Billing portal button.
 *
 * Renders for users who already have a Stripe customer (paid subscribers,
 * past subscribers). Clicking opens the Stripe-hosted Customer Portal where
 * the user can update payment, change plan, view invoices, or cancel.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { openBillingPortal } from "@/app/[locale]/pricing/actions";

export function BillingPortalButton() {
  // Wave 2 i18n migration (2026-05-27): localize "管理訂閱" + error fallback.
  const t = useTranslations("settings.billing");
  const tErrors = useTranslations("errors.billing");
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
              setErr(tErrors("portalFailed"));
            }
          })
        }
      >
        <CreditCard className="h-4 w-4" />
        {pending ? "..." : t("managePortal")}
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
