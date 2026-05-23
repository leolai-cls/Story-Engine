"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Lock, AlertCircle } from "lucide-react";
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
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canToggle = isAgeVerified;

  function handleToggle() {
    if (!canToggle) return;
    const next = !enabled;
    setError(null);
    startTransition(async () => {
      const result = await setAdultMode(next);
      if (result.ok) {
        setEnabled(next);
      } else {
        setError(`設定失敗：${result.error}`);
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
            <CardTitle className="text-base">成人模式 (18+)</CardTitle>
            <CardDescription className="text-xs">
              開啟之後可以揀 NSFW model · 創作 + 玩 adult-rated 故事。
            </CardDescription>
          </div>
          {enabled && (
            <Badge
              variant="outline"
              className="ml-auto border-rose-300 text-rose-600 dark:text-rose-300"
            >
              已開啟
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* State 1: age not verified — locked */}
        {!isAgeVerified && (
          <div className="rounded-md border border-muted bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
              <div className="flex-1 text-xs space-y-2">
                <p className="font-semibold text-foreground">需要年齡驗證</p>
                <p className="text-muted-foreground">
                  根據平台政策 · 成人模式需要 Stripe Identity 驗證年齡（KYC）·
                  確保只有 18+ 用戶 access。呢個 flow Phase 6 money tier 開放
                  之後就可以做。
                </p>
                <p className="text-muted-foreground">
                  暫時 toggle 鎖死 · 你 SFW + Soft 內容齊備可玩。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* State 2/3: age verified — actual toggle */}
        {isAgeVerified && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-sm">
              <p className="font-medium">
                {enabled ? "成人模式已開啟" : "成人模式關閉"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {enabled
                  ? "你可以揀 OpenRouter NSFW model · 創作 adult-rated 故事 · Library 顯示成人內容。"
                  : "限定 SFW + Soft 內容。NSFW model + adult-rated 故事不可見。"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggle}
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
        )}

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertCircle className="h-3 w-3 inline mr-1" />
            {error}
          </div>
        )}

        {/* CSAM / safety reminder — always show */}
        <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30 p-2 text-[11px] text-amber-800 dark:text-amber-200">
          <strong>注意</strong>：所有模式都禁止 CSAM、未成年人性描寫、違法內容 ·
          無論 adult mode 開唔開都會被 moderation 攔截 (hard rule)。
        </div>
      </CardContent>
    </Card>
  );
}
