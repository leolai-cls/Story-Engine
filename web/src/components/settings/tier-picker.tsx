"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, Lock, Sparkles, Zap, Crown, Flame } from "lucide-react";
import { type ModelTier, TIER_GATE, TIER_POOLS } from "@/lib/ai/models";
import { type Tier, estimateTurnCredits } from "@/lib/billing/credits";
import { setDefaultTier } from "@/app/[locale]/settings/actions";

/**
 * Session 10 tier picker (replaces ModelPicker).
 *
 * Founder rule: users pick TIER not vendor model. Internal routing
 * (lib/ai/tier-router.ts) decides which underlying LLM to call based on
 * content language. UI shows 4 visual tier cards · greyed-out ones if
 * subscription doesn't unlock them.
 */

const TIER_META: Record<
  ModelTier,
  {
    label: string;
    icon: typeof Sparkles;
    blurb: string;
    color: string;
    bgColor: string;
  }
> = {
  standard: {
    label: "Standard",
    icon: Zap,
    blurb: "快 · 平 · 中文流暢 · 對標 NovelAI",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  pro: {
    label: "Pro",
    icon: Sparkles,
    blurb: "深層敘事 · 情感細膩 · 中英都強",
    color: "text-indigo-700 dark:text-indigo-300",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/30",
  },
  "pro-max": {
    label: "Pro Max",
    icon: Crown,
    blurb: "最深層 · 多角色互動 · 複雜情節",
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
  adult: {
    label: "Adult NSFW",
    icon: Flame,
    blurb: "成人模式專用 · 需身份驗證",
    color: "text-rose-700 dark:text-rose-300",
    bgColor: "bg-rose-50 dark:bg-rose-950/30",
  },
};

/**
 * AUDIT FIX P0B-HIGH-02 (2026-05-25): TierPicker previously hardcoded
 * credit estimates (50/120/200/70) which were 50-100% inflated vs the
 * actual estimateTurnCredits() output used by the turn route balance gate.
 * Compute live from the pool models · use AVG so the user sees a fair
 * representation (router picks between pool models based on language).
 */
function tierAvgCredits(tier: ModelTier): number {
  const pool = TIER_POOLS[tier];
  if (!pool || pool.length === 0) return 0;
  const estimates = pool.map((id) => estimateTurnCredits(id));
  const sum = estimates.reduce((a, b) => a + b, 0);
  return Math.round(sum / estimates.length);
}

const SUB_TIER_LABEL: Record<string, string> = {
  free: "Free",
  adventurer: "Adventurer",
  storyteller: "Storyteller",
  legend: "Legend",
};

export function TierPicker({
  currentTier,
  subscriptionTier,
  adultModeEnabled,
  ageVerified,
}: {
  currentTier: ModelTier;
  subscriptionTier: Tier;
  adultModeEnabled: boolean;
  /** is_age_verified · Adult tier additionally gated on KYC */
  ageVerified: boolean;
}) {
  const [selected, setSelected] = useState<ModelTier>(currentTier);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const tierOrder = ["free", "adventurer", "storyteller", "legend"] as const;
  const userSubIdx = tierOrder.indexOf(subscriptionTier as (typeof tierOrder)[number]);

  const allTiers: ModelTier[] = ["standard", "pro", "pro-max", "adult"];

  // Compute credit estimates ONCE per render via useMemo (pure function · no
  // DB · safe in client component). AUDIT FIX P0B-HIGH-02.
  const tierEstimates = useMemo(() => {
    const out: Record<ModelTier, number> = {
      standard: 0,
      pro: 0,
      "pro-max": 0,
      adult: 0,
    };
    for (const t of allTiers) out[t] = tierAvgCredits(t);
    return out;
  }, []);

  async function handleSelect(tier: ModelTier) {
    if (!isAllowed(tier)) return;
    setSelected(tier);
    setSaving(true);
    setSaved(null);
    try {
      const result = await setDefaultTier(tier);
      if (result.ok) {
        setSaved("已儲存");
        setTimeout(() => setSaved(null), 2000);
      } else {
        setSaved("儲存失敗 · " + result.error);
      }
    } catch {
      setSaved("儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  function isAllowed(tier: ModelTier): boolean {
    const requiredSub = TIER_GATE[tier];
    const requiredIdx = tierOrder.indexOf(requiredSub);
    if (userSubIdx < requiredIdx) return false;
    if (tier === "adult" && (!adultModeEnabled || !ageVerified)) return false;
    return true;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">敘事 AI Tier</CardTitle>
            <CardDescription className="text-xs">
              揀 tier · 我哋幫你揀最啱嘅 model（語言 + vendor availability）。Director 永遠用 Haiku 4.5。
            </CardDescription>
          </div>
          {saved && (
            <Badge variant="secondary" className="ml-auto">
              {saved}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {allTiers.map((tier) => {
          const meta = TIER_META[tier];
          const allowed = isAllowed(tier);
          const isSelected = selected === tier;
          const Ico = meta.icon;
          const requiredSub = TIER_GATE[tier];

          // Hide Adult tier entirely when adult mode off (cleaner UX · matches
          // CLAUDE.md hard rule #5 — don't expose NSFW path to non-adult-mode
          // users · they shouldn't even see it as "locked").
          if (tier === "adult" && !adultModeEnabled) return null;

          return (
            <button
              key={tier}
              type="button"
              onClick={() => handleSelect(tier)}
              disabled={!allowed || saving}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : allowed
                  ? "hover:border-primary/50 cursor-pointer"
                  : "opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${meta.bgColor} ${meta.color} flex-shrink-0`}
                >
                  <Ico className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{meta.label}</span>
                    {tier === "adult" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-rose-300 text-rose-600 dark:text-rose-300"
                      >
                        18+
                      </Badge>
                    )}
                    {!allowed && (
                      <Badge variant="outline" className="text-[10px]">
                        <Lock className="h-3 w-3" />
                        要 {SUB_TIER_LABEL[requiredSub]}
                        {tier === "adult" && !ageVerified ? " + 身份驗證" : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {meta.blurb}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    每 turn 估
                  </div>
                  <div className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-300">
                    ~{tierEstimates[tier]}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
