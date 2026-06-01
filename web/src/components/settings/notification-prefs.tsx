"use client";

/**
 * Email notification preferences (settings overhaul 2026-06-01).
 *
 * Stored on profiles (notify_product / notify_marketing). Resend wiring is
 * a later task — for now this records intent so we never email users who
 * opted out. Marketing defaults OFF (opt-in).
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setNotificationPrefs } from "@/app/[locale]/settings/actions";

function Toggle({
  on,
  pending,
  onClick,
}: {
  on: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={onClick}
      className="relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors"
      style={{
        background: on ? "var(--se-accent, #7c5cff)" : "var(--se-border-strong)",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? "translateX(24px)" : "translateX(4px)" }}
      />
    </button>
  );
}

export function NotificationPrefs({
  initialProduct,
  initialMarketing,
}: {
  initialProduct: boolean;
  initialMarketing: boolean;
}) {
  const t = useTranslations("settings.preferences");
  const [product, setProduct] = useState(initialProduct);
  const [marketing, setMarketing] = useState(initialMarketing);
  const [, startTransition] = useTransition();

  function flip(which: "product" | "marketing") {
    const next = which === "product" ? !product : !marketing;
    if (which === "product") setProduct(next);
    else setMarketing(next);
    startTransition(() => {
      void setNotificationPrefs({ [which]: next });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
            {t("notifyProductLabel")}
          </div>
          <div className="text-[11.5px] mt-0.5 se-cjk" style={{ color: "var(--se-fg-muted)", lineHeight: 1.5 }}>
            {t("notifyProductHint")}
          </div>
        </div>
        <Toggle on={product} pending={false} onClick={() => flip("product")} />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
            {t("notifyMarketingLabel")}
          </div>
          <div className="text-[11.5px] mt-0.5 se-cjk" style={{ color: "var(--se-fg-muted)", lineHeight: 1.5 }}>
            {t("notifyMarketingHint")}
          </div>
        </div>
        <Toggle on={marketing} pending={false} onClick={() => flip("marketing")} />
      </div>
    </div>
  );
}
