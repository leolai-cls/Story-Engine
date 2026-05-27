"use client";

/**
 * Top-up credit purchase · 3 single-tier buttons rendered as compact card row.
 *
 * Each click → startTopUpCheckout(pack) → redirect to Stripe Checkout.
 * After success, Stripe → /settings?topup=1 → webhook grants credits.
 */

import { useState, useTransition } from "react";
import { Coins, Sparkles } from "lucide-react";
import { startTopUpCheckout } from "@/app/[locale]/pricing/actions";
import { TOPUP_DISPLAY, type TopUpPack } from "@/lib/stripe/products";

const PACKS: TopUpPack[] = ["small", "medium", "large"];

export function TopUpButtons({ lang = "zh" }: { lang?: "zh" | "en" }) {
  const [pending, startTransition] = useTransition();
  const [pendingPack, setPendingPack] = useState<TopUpPack | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div
        className="se-mono uppercase"
        style={{ fontSize: 10, color: "var(--se-fg-dim)", letterSpacing: "0.06em" }}
      >
        {lang === "zh" ? "一次性充值 · TOP-UP" : "ONE-TIME TOP-UP"}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PACKS.map((pack) => {
          const d = TOPUP_DISPLAY[pack];
          const isThisPending = pending && pendingPack === pack;
          return (
            <button
              key={pack}
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setPendingPack(pack);
                  setErr(null);
                  const res = await startTopUpCheckout(pack);
                  if (res.ok) {
                    window.location.href = res.url;
                  } else {
                    setErr(res.message ?? res.error);
                    setPendingPack(null);
                  }
                })
              }
              className="text-left p-3 rounded-md border transition-colors hover:bg-[color:var(--se-surface-2)] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--se-border)", background: "var(--se-surface)" }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {pack === "large" ? (
                  <Sparkles size={12} style={{ color: "var(--k-purple, #552583)" }} />
                ) : (
                  <Coins size={12} style={{ color: "var(--se-fg-muted)" }} />
                )}
                <span
                  className="se-cjk font-medium text-xs"
                  style={{ color: "var(--se-fg)" }}
                >
                  {lang === "zh" ? d.nameZh : d.name}
                </span>
                {d.bonusPct > 0 && (
                  <span
                    className="se-mono ml-auto"
                    style={{
                      fontSize: 9,
                      color: "var(--k-purple, #552583)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    +{d.bonusPct}%
                  </span>
                )}
              </div>
              <div
                className="font-bold"
                style={{ color: "var(--se-fg)", fontSize: 18, letterSpacing: "-0.01em" }}
              >
                ${d.priceUsd.toFixed(0)}
              </div>
              <div
                className="se-mono mt-0.5"
                style={{ fontSize: 10, color: "var(--se-fg-muted)", letterSpacing: "0.02em" }}
              >
                {d.credits.toLocaleString()} credits
              </div>
              {isThisPending && (
                <div
                  className="se-mono mt-1"
                  style={{ fontSize: 9, color: "var(--se-fg-dim)" }}
                >
                  …loading
                </div>
              )}
            </button>
          );
        })}
      </div>
      {err && (
        <p className="text-xs text-destructive">
          {lang === "zh" ? "錯誤：" : "Error: "}
          {err}
        </p>
      )}
    </div>
  );
}
