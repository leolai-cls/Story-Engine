"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Drama } from "lucide-react";
import { setNpcL3Enabled } from "@/app/[locale]/play/[playthroughId]/actions";
import { NPC_L3_CREDITS_PER_NPC, MAX_NPC_L3_AGENTS_PER_TURN } from "@/schemas/npc-agent";

/**
 * Session 14 · NPC L3 Agents opt-in toggle (founder Q4 sign-off: button-click only).
 *
 * Three display states:
 *   1. Storyteller / Legend tier · enabled=false → toggle ON button
 *   2. Storyteller / Legend tier · enabled=true → toggle OFF button + indicator
 *   3. Free / Adventurer tier → upsell card (no toggle · directs to subscription)
 *
 * Defense in depth (matches server action):
 *   - UI hides toggle for non-Storyteller (this component)
 *   - Server action setNpcL3Enabled validates auth + tier + owner
 *   - Migration 0028 trigger DB-level tier enforcement
 *
 * Marketing positioning: "NPC Inner Voices · Storyteller 獨享 · 每個 active NPC
 * 都有自己嘅 POV + 心理活動"
 */
export function NpcL3Toggle({
  playthroughId,
  initialEnabled,
  subscriptionTier,
}: {
  playthroughId: string;
  initialEnabled: boolean;
  subscriptionTier: "free" | "adventurer" | "storyteller" | "legend";
}) {
  const tErrors = useTranslations("errors");
  // Wave 2 i18n migration (2026-05-27): all card strings localized via npcL3.*.
  const tCard = useTranslations("npcL3");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isTierEligible = subscriptionTier === "storyteller" || subscriptionTier === "legend";

  function handleToggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setNpcL3Enabled(playthroughId, next);
      if (result.ok) {
        setEnabled(result.enabled);
      } else {
        // Wave 1 audit C-01 fix (2026-05-27): localize server errorCode.
        if (result.errorCode) {
          setError(
            tErrors(
              result.errorCode as Parameters<typeof tErrors>[0],
              result.errorParams ?? {},
            ),
          );
        } else if (result.errorRaw) {
          setError(result.errorRaw);
        } else {
          setError(tErrors("common.tryAgainLater"));
        }
      }
    });
  }

  // Free / Adventurer tier — upsell card (no toggle)
  if (!isTierEligible) {
    return (
      <div
        className="rounded-lg border p-3"
        style={{
          background: "var(--se-bg-dim, #faf8f3)",
          borderColor: "var(--se-fg-faint, #e6e1d6)",
        }}
      >
        <div className="flex items-start gap-2">
          <Drama size={18} style={{ color: "var(--se-fg, #2c1810)", flexShrink: 0 }} aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold mb-1">{tCard("cardTitle")}</div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--se-fg-dim)" }}>
              {tCard("upsellBody")}
            </div>
            <div
              className="mt-2 inline-block text-xs font-semibold px-2 py-1 rounded"
              style={{
                background: "var(--se-amber-bg, #fef3c7)",
                color: "var(--se-amber-fg, #78350f)",
              }}
            >
              {tCard("upsellCta")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Storyteller / Legend tier — toggle
  const maxCost = MAX_NPC_L3_AGENTS_PER_TURN * NPC_L3_CREDITS_PER_NPC;
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        background: enabled ? "var(--se-accent-bg, #f0fdf4)" : "var(--se-bg-dim, #faf8f3)",
        borderColor: enabled
          ? "var(--se-accent-fg, #22c55e)"
          : "var(--se-fg-faint, #e6e1d6)",
        transition: "all 0.2s ease",
      }}
    >
      <div className="flex items-start gap-2">
        <span style={{ fontSize: 18 }}>🎭</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold mb-0.5 flex items-center gap-2">
            {tCard("cardTitle")}
            {enabled && (
              <span
                className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--se-accent-fg, #22c55e)",
                  color: "white",
                  letterSpacing: "0.05em",
                }}
              >
                ON
              </span>
            )}
          </div>
          <div className="text-xs leading-relaxed mb-2" style={{ color: "var(--se-fg-dim)" }}>
            {enabled
              ? tCard("activeDescription", { cost: NPC_L3_CREDITS_PER_NPC, max: maxCost })
              : tCard("inactiveDescription", { cost: NPC_L3_CREDITS_PER_NPC, max: maxCost })}
          </div>
          <button
            type="button"
            onClick={() => handleToggle(!enabled)}
            disabled={isPending}
            aria-pressed={enabled}
            aria-busy={isPending}
            className="text-xs font-semibold px-3 py-2 min-h-[36px] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: enabled
                ? "var(--se-fg-faint, #e6e1d6)"
                : "var(--se-ok, #22c55e)",
              color: enabled ? "var(--se-fg, #2c1810)" : "white",
            }}
          >
            {isPending ? tCard("buttonPending") : enabled ? tCard("buttonOn") : tCard("buttonOff")}
          </button>
          {error && (
            <div
              className="mt-2 text-xs px-2 py-1 rounded"
              style={{
                background: "var(--se-rose-bg, #fee2e2)",
                color: "var(--se-rose-fg, #991b1b)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
