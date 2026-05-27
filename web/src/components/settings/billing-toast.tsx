"use client";

/**
 * Billing-flow status banners · surfaces Stripe redirect query params.
 *
 * Audit Wave 2 B2: the success_url / cancel_url query params (?subscribed=1,
 * ?canceled=1, ?topup=1, ?topup_canceled=1, ?verified=pending) were
 * documented in the redirect strings but never read by the destination
 * pages — users hit Stripe, returned to /settings, saw the same page with
 * no indication anything happened. Toast component surfaces a one-line
 * message + auto-polls for webhook-driven state changes when relevant.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, ShieldCheck, X } from "lucide-react";

type Variant =
  | "subscribed"           // /settings?subscribed=1 · subscription Checkout succeeded
  | "topup"                // /settings?topup=1 · top-up Checkout succeeded
  | "topup_canceled"       // /settings?topup_canceled=1 · user closed top-up Checkout
  | "checkout_canceled"    // /pricing?canceled=1
  | "verifying";           // /settings?verified=pending · Identity submitted, awaiting webhook

const COPY = {
  zh: {
    subscribed: {
      title: "訂閱完成 ✓",
      body: "Stripe 已收到付款。Credits 會喺幾秒內自動到帳，page 自動 refresh。",
      icon: <CheckCircle2 size={16} />,
    },
    topup: {
      title: "充值完成 ✓",
      body: "Credits 會喺幾秒內到帳，page 自動 refresh。",
      icon: <CheckCircle2 size={16} />,
    },
    topup_canceled: {
      title: "充值取消",
      body: "你冇 charge 到。隨時可以再試。",
      icon: <AlertCircle size={16} />,
    },
    checkout_canceled: {
      title: "訂閱取消",
      body: "你冇 charge 到。隨時可以再試。",
      icon: <AlertCircle size={16} />,
    },
    verifying: {
      title: "驗證進行中…",
      body: "Stripe Identity 正在處理 · 通常 5-15 秒。Page 會自動 refresh 顯示結果。",
      icon: <ShieldCheck size={16} />,
    },
  },
  en: {
    subscribed: {
      title: "Subscription complete ✓",
      body: "Stripe confirmed payment. Credits will appear in a few seconds; the page auto-refreshes.",
      icon: <CheckCircle2 size={16} />,
    },
    topup: {
      title: "Top-up complete ✓",
      body: "Credits will appear in a few seconds; the page auto-refreshes.",
      icon: <CheckCircle2 size={16} />,
    },
    topup_canceled: {
      title: "Top-up canceled",
      body: "You were not charged. Try again anytime.",
      icon: <AlertCircle size={16} />,
    },
    checkout_canceled: {
      title: "Subscription canceled",
      body: "You were not charged. Try again anytime.",
      icon: <AlertCircle size={16} />,
    },
    verifying: {
      title: "Verifying age…",
      body: "Stripe Identity is processing (5-15 sec). Page will auto-refresh.",
      icon: <ShieldCheck size={16} />,
    },
  },
};

export function BillingToast({
  variant,
  lang = "zh",
  autoRefreshSeconds = 0,
}: {
  variant: Variant;
  lang?: "zh" | "en";
  /** If >0, schedules a page reload after N seconds (useful while waiting for webhook). */
  autoRefreshSeconds?: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(autoRefreshSeconds);
  const c = COPY[lang][variant];

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
  const isVerifying = variant === "verifying";

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3 flex items-start gap-3"
      style={{
        background: isSuccess
          ? "rgba(34, 197, 94, 0.08)"
          : isVerifying
            ? "rgba(85, 37, 131, 0.08)"
            : "rgba(245, 158, 11, 0.08)",
        border: `1px solid ${
          isSuccess
            ? "rgba(34, 197, 94, 0.35)"
            : isVerifying
              ? "rgba(85, 37, 131, 0.35)"
              : "rgba(245, 158, 11, 0.35)"
        }`,
      }}
    >
      <span
        style={{
          color: isSuccess
            ? "rgb(22, 163, 74)"
            : isVerifying
              ? "var(--k-purple, #552583)"
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
          {autoRefreshSeconds > 0 && secondsLeft > 0 && ` (${secondsLeft}s)`}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-[color:var(--se-fg-dim)] hover:text-[color:var(--se-fg)] flex-none"
        aria-label="關閉"
      >
        <X size={14} />
      </button>
    </div>
  );
}
