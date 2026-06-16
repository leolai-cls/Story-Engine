"use client";

/**
 * Billing-flow status banners · surfaces Stripe redirect query params.
 *
 * Audit Wave 2 B2: the success_url / cancel_url query params (?subscribed=1,
 * ?canceled=1, ?topup=1, ?topup_canceled=1) were
 * documented in the redirect strings but never read by the destination
 * pages — users hit Stripe, returned to /settings, saw the same page with
 * no indication anything happened. Toast component surfaces a one-line
 * message + auto-polls for webhook-driven state changes when relevant.
 *
 * Wave 2 i18n migration (2026-05-27): removed `lang` prop · uses next-intl.
 * Previously hard defaulted `lang="zh"` for zh-Hans users.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Variant =
  | "subscribed"           // /settings?subscribed=1 · subscription Checkout succeeded
  | "topup"                // /settings?topup=1 · top-up Checkout succeeded
  | "topup_canceled"       // /settings?topup_canceled=1 · user closed top-up Checkout
  | "checkout_canceled";   // /pricing?canceled=1

const VARIANT_TO_KEY: Record<Variant, { title: string; body: string }> = {
  subscribed: { title: "subscribedTitle", body: "subscribedBody" },
  topup: { title: "topupTitle", body: "topupBody" },
  topup_canceled: { title: "topupCanceledTitle", body: "topupCanceledBody" },
  checkout_canceled: { title: "checkoutCanceledTitle", body: "checkoutCanceledBody" },
};

const VARIANT_ICONS: Record<Variant, React.ReactNode> = {
  subscribed: <CheckCircle2 size={16} />,
  topup: <CheckCircle2 size={16} />,
  topup_canceled: <AlertCircle size={16} />,
  checkout_canceled: <AlertCircle size={16} />,
};

export function BillingToast({
  variant,
  autoRefreshSeconds = 0,
}: {
  variant: Variant;
  /** If >0, schedules a page reload after N seconds (useful while waiting for webhook). */
  autoRefreshSeconds?: number;
}) {
  const t = useTranslations("settings.billingToast");
  const [dismissed, setDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(autoRefreshSeconds);
  const keys = VARIANT_TO_KEY[variant];
  const c = {
    title: t(keys.title),
    body: t(keys.body),
    icon: VARIANT_ICONS[variant],
  };

  useEffect(() => {
    if (autoRefreshSeconds <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // Strip query params before reload so toast doesn't re-fire
          const u = new URL(window.location.href);
          u.search = "";
          window.location.href = u.toString();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [autoRefreshSeconds]);

  if (dismissed) return null;

  const isSuccess = variant === "subscribed" || variant === "topup";

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3 flex items-start gap-3"
      style={{
        background: isSuccess
          ? "rgba(34, 197, 94, 0.08)"
          : "rgba(245, 158, 11, 0.08)",
        border: `1px solid ${
          isSuccess
            ? "rgba(34, 197, 94, 0.35)"
            : "rgba(245, 158, 11, 0.35)"
        }`,
      }}
    >
      <span
        style={{
          color: isSuccess
            ? "rgb(22, 163, 74)"
            : "rgb(217, 119, 6)",
          marginTop: 1,
        }}
      >
        {c.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
          {c.title}
        </div>
        <div
          className="text-xs mt-0.5 se-cjk"
          style={{ color: "var(--se-fg-muted)" }}
        >
          {c.body}
          {autoRefreshSeconds > 0 && secondsLeft > 0 && t("secondsLeft", { count: secondsLeft })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-[color:var(--se-fg-dim)] hover:text-[color:var(--se-fg)] flex-none"
        aria-label={t("ariaClose")}
      >
        <X size={14} />
      </button>
    </div>
  );
}
