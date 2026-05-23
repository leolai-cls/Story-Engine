"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, Lock } from "lucide-react";
import { MODELS, modelsForTier, type ModelEntry } from "@/lib/ai/models";
import { estimateTurnCredits, type Tier } from "@/lib/billing/credits";
import { setDefaultModel } from "@/app/[locale]/settings/actions";

export function ModelPicker({
  currentModelId,
  tier,
  adultModeEnabled,
}: {
  currentModelId: string;
  tier: Tier;
  /** Phase 6 non-money function: NSFW (allows_nsfw=true) models hidden when false */
  adultModeEnabled: boolean;
}) {
  const [selected, setSelected] = useState(currentModelId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Models user can access; locked ones still shown with upgrade CTA
  const allowedModels = useMemo(() => modelsForTier(tier), [tier]);
  const allowedIds = useMemo(() => new Set(allowedModels.map((m) => m.id)), [allowedModels]);

  // Filter to narrator-role models (player picks narrator; director is fixed Haiku).
  // Phase 6 non-money function: hide NSFW-only models when adult mode off.
  // CLAUDE.md hard rule #5: adult mode LLM isolation — keep NSFW traffic off
  // Anthropic/OpenAI direct providers to avoid platform ban risk.
  const narratorModels = useMemo(
    () =>
      Object.values(MODELS).filter(
        (m) => m.role === "narrator" && (adultModeEnabled || !m.allows_nsfw),
      ),
    [adultModeEnabled],
  );

  async function handleSelect(modelId: string) {
    if (!allowedIds.has(modelId)) return;
    setSelected(modelId);
    setSaving(true);
    setSaved(null);
    try {
      const result = await setDefaultModel(modelId);
      if (result.ok) {
        setSaved("已儲存");
        setTimeout(() => setSaved(null), 2000);
      } else {
        setSaved("儲存失敗");
      }
    } catch {
      setSaved("儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">敘事模型</CardTitle>
            <CardDescription className="text-xs">
              玩故事用嘅 LLM。Director 同 lorebook 永遠用 Haiku 4.5（cheap 仲裁）。
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
        {narratorModels.map((model) => {
          const allowed = allowedIds.has(model.id);
          const estimated = estimateTurnCredits(model.id);
          const isSelected = selected === model.id;
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => handleSelect(model.id)}
              disabled={!allowed || saving}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : allowed
                  ? "hover:border-primary/50 cursor-pointer"
                  : "opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{model.display_name}</span>
                    {model.allows_nsfw && (
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
                        要 {tierLabelForModel(model)}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {model.description}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    每 turn 估
                  </div>
                  <div className="font-mono text-sm font-semibold text-amber-600 dark:text-amber-300">
                    ~{estimated}
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

function tierLabelForModel(model: ModelEntry): string {
  if (!model.min_tier) return "Free";
  const map: Record<string, string> = {
    free: "Free",
    adventurer: "Adventurer",
    storyteller: "Storyteller",
    legend: "Legend",
  };
  return map[model.min_tier] ?? model.min_tier;
}
