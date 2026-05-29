"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertCircle, TriangleAlert, X } from "lucide-react";
import { setAdultMode } from "@/app/[locale]/settings/actions";

/**
 * Adult mode toggle — Phase 6 non-money function tier.
 *
 * 3 distinct states the user can be in:
 *
 * 1. is_age_verified = false  → toggle locked. CTA: "需要年齡驗證 — Phase 6 KYC
 *    (Stripe Identity) 嚟緊"。用戶 click 唔到，見到 explainer。
 *
 * 2. is_age_verified = true, adult_mode_enabled = false  → toggle on but OFF.
 *    用戶可以 flip 開。Flip 之後 NSFW model + adult story rating 解鎖。
 *
 * 3. is_age_verified = true, adult_mode_enabled = true   → toggle on + ON.
 *    可以揀 NSFW model · 創作 adult-rated story · 見到 adult content carousel。
 *
 * DB layer (Migration 0002) enforces: CHECK adult_mode_enabled=true requires
 * is_age_verified=true · trigger reverts unauthorized self-elevation。所以
 * UI toggle 係 advisory · DB 永遠 source of truth。
 */
export function AdultModeToggle({
  initialEnabled,
  isAgeVerified,
}: {
  initialEnabled: boolean;
  isAgeVerified: boolean;
}) {
  // Wave 2 i18n migration (2026-05-27): all strings localized via settings.adultModeToggle.*.
  const t = useTranslations("settings.adultModeToggle");
  const tErrors = useTranslations("errors");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // F4 / P6-LOW-01 audit fix: enabling adult mode now requires explicit
  // consent dialog re-display + checkbox. Disable path skips dialog
  // (low-friction off · safer default).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  // ADR-023 (2026-05-29 founder rule): self-attest 18+ · NO KYC.
  // isAgeVerified prop kept for back-compat but唔再用做 gate.
  void isAgeVerified;

  function handleToggleClick() {
    if (!enabled) {
      // Enabling → open consent dialog first
      setConsentChecked(false);
      setError(null);
      setConfirmOpen(true);
      return;
    }
    // Disabling → no dialog
    applyToggle(false);
  }

  function applyToggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setAdultMode(next);
      if (result.ok) {
        setEnabled(next);
        setConfirmOpen(false);
      } else {
        // Wave 1 audit fix (2026-05-27): localize via i18n catalog.
        const localized = result.errorCode
          ? tErrors(result.errorCode as Parameters<typeof tErrors>[0])
          : t("settingsFailed", { error: result.error });
        setError(localized);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${
              enabled
                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
            <CardDescription className="text-xs">{t("cardDescription")}</CardDescription>
          </div>
          {enabled && (
            <Badge
              variant="outline"
              className="ml-auto border-rose-300 text-rose-600 dark:text-rose-300"
            >
              {t("enabledBadge")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ADR-023 (2026-05-29 founder rule): self-attest 18+ · NO KYC.
            Toggle 永遠可見 · confirm dialog 入面 checkbox 做 self-attest. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {enabled ? t("stateOn") : t("stateOff")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {enabled ? t("enabledExplainer") : t("disabledExplainer")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleClick}
            disabled={pending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-rose-600" : "bg-input"
            } ${pending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            aria-checked={enabled}
            role="switch"
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-3 w-3 inline mr-1" />
            {error}
          </div>
        )}

        {/* CSAM / safety reminder — always show */}
        <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30 p-2 text-[11px] text-amber-800 dark:text-amber-200">
          {t("csamReminder")}
        </div>
      </CardContent>

      {/* F4 / P6-LOW-01 audit fix · Enabling adult mode requires explicit consent dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "var(--se-overlay)",
            backdropFilter: "blur(6px)",
          }}
          onClick={() => !pending && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[520px] rounded-2xl p-7"
            style={{
              background: "var(--se-surface)",
              border: "1px solid var(--se-border-strong)",
              boxShadow: "var(--se-shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <span
                className="se-mono uppercase"
                style={{
                  fontSize: 10.5,
                  color: "var(--se-danger)",
                  letterSpacing: "0.06em",
                }}
              >
                {t("consentDialog.eyebrow")}
              </span>
              <button
                type="button"
                onClick={() => !pending && setConfirmOpen(false)}
                disabled={pending}
                className="text-[color:var(--se-fg-muted)] hover:text-[color:var(--se-fg)]"
                aria-label={t("consentDialog.ariaClose")}
              >
                <X size={16} />
              </button>
            </div>
            <h2
              className="text-xl font-semibold m-0 mb-3 se-cjk"
              style={{
                letterSpacing: "-0.015em",
                color: "var(--se-fg)",
              }}
            >
              {t("consentDialog.title")}
            </h2>
            <p
              className="m-0 text-sm se-cjk"
              style={{
                color: "var(--se-fg-2)",
                lineHeight: 1.65,
              }}
            >
              {t("consentDialog.intro")}
            </p>
            <ul
              className="mt-2.5 mb-1.5 pl-5 text-sm se-cjk"
              style={{
                color: "var(--se-fg-2)",
                lineHeight: 1.85,
                listStyle: "disc",
              }}
            >
              <li>{t("consentDialog.bullet1")}</li>
              <li>{t("consentDialog.bullet2")}</li>
              <li>{t("consentDialog.bullet3")}</li>
              <li>{t("consentDialog.bullet4")}</li>
            </ul>
            <div
              className="p-3 rounded-lg mt-2 text-xs se-cjk flex items-start gap-2.5"
              style={{
                background: "var(--se-danger-bg)",
                border: "1px solid oklch(0.55 0.15 25 / 0.35)",
                color: "var(--se-fg-2)",
                lineHeight: 1.6,
              }}
            >
              <TriangleAlert
                size={13}
                color="var(--se-danger)"
                className="mt-0.5 flex-none"
              />
              <span>
                <strong>{t("consentDialog.csamStrong")}</strong>
                {t("consentDialog.csamBody")}
              </span>
            </div>
            <label
              className="mt-5 flex items-start gap-2.5 text-sm se-cjk cursor-pointer"
              style={{ color: "var(--se-fg-2)" }}
            >
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 flex-none"
                style={{ accentColor: "var(--se-accent)" }}
              />
              <span>{t("consentDialog.ageConfirm")}</span>
            </label>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => !pending && setConfirmOpen(false)}
                disabled={pending}
                className="flex-1 h-11 rounded-md text-sm font-medium se-cjk"
                style={{
                  background: "var(--se-surface-2)",
                  color: "var(--se-fg-2)",
                  border: "1px solid var(--se-border)",
                }}
              >
                {t("consentDialog.cancel")}
              </button>
              <button
                type="button"
                onClick={() => applyToggle(true)}
                disabled={pending || !consentChecked}
                className="flex-1 h-11 rounded-md text-sm font-semibold se-cjk transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--se-danger)",
                  color: "#fff",
                }}
              >
                {pending ? t("consentDialog.processing") : t("consentDialog.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
