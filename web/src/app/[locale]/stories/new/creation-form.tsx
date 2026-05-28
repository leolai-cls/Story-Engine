"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Coins,
  BookOpen,
  Settings as SettingsIcon,
  Gem,
  Users,
} from "lucide-react";
import { createStoryFromPrompt } from "./actions";
import { estimateStoryCreationCredits } from "@/lib/billing/credits";

/**
 * E4/E5 audit fix · Generation 4-parallel-task progress UI ("peak Grok moment")
 * Backend uses Promise.all so we can't get per-task progress events without SSE.
 * UI mocks all 4 tasks as concurrently running · all flip to done on form return.
 * Indeterminate spinners + mono task labels reinforce the「AI dashboard」feel.
 *
 * Wave 2 i18n migration (2026-05-27): labels read from messages catalog.
 */
const TASK_IDS = ["meta", "schema", "bible", "chars"] as const;
const TASK_ICONS = { meta: BookOpen, schema: SettingsIcon, bible: Gem, chars: Users } as const;

// AUDIT FIX (P3-UX-L-16): pre-display cost so user knows what threshold
// to hit before clicking. Previously they only learned via 402 error.
const ESTIMATED_STORY_COST = estimateStoryCreationCredits();

const EXAMPLE_KEYS = ["0", "1", "2", "3"] as const;

export function CreationForm({
  adultModeEnabled,
}: {
  /** Phase 6 non-money function: gate 'adult' content_rating button */
  adultModeEnabled: boolean;
}) {
  const tErrors = useTranslations("errors");
  const tForm = useTranslations("createStory.form");
  const tTasks = useTranslations("createStory.tasks");
  const tExamples = useTranslations("createStory.examples");
  const [prompt, setPrompt] = useState("");
  const [protagonist, setProtagonist] = useState("");
  const [rating, setRating] = useState<"sfw" | "soft" | "adult">("sfw");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createStoryFromPrompt(formData);
      if (result && !result.ok) {
        // Wave 1 i18n migration (2026-05-27): server returns errorCode + params
        // for static catalog-lookup messages, or errorRaw for LLM-generated text
        // (moderation reason). Localize via next-intl when code is present.
        if (result.errorCode) {
          setError(
            tErrors(
              // Cast: next-intl `t()` requires a literal-narrow key; runtime
              // codes from server are accepted but TS can't prove safety.
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
      // success path: server action redirects to /play/[id]
    });
  }

  return (
    <Card className="border-border/60">
      <CardContent className="pt-6 space-y-5">
        <form action={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prompt">{tForm("promptLabel")}</Label>
            <textarea
              id="prompt"
              name="prompt"
              required
              minLength={20}
              maxLength={2000}
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              placeholder={tForm("promptPlaceholder")}
              disabled={isPending}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{tForm("promptHint")}</span>
              <span className="tabular-nums">
                {tForm("promptCounter", { count: prompt.length, max: 2000 })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="protagonist_hint">
              {tForm("protagonistLabel")}{" "}
              <span className="text-xs text-muted-foreground">
                {tForm("protagonistOptional")}
              </span>
            </Label>
            <Input
              id="protagonist_hint"
              name="protagonist_hint"
              maxLength={280}
              value={protagonist}
              onChange={(e) => setProtagonist(e.target.value)}
              placeholder={tForm("protagonistPlaceholder")}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>{tForm("ratingLabel")}</Label>
            <div className="flex gap-2 flex-wrap">
              {(["sfw", "soft", "adult"] as const).map((r) => {
                // Phase 6 non-money function: adult content rating requires
                // adult_mode_enabled (which itself requires is_age_verified).
                const adultDisabled = r === "adult" && !adultModeEnabled;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => !adultDisabled && setRating(r)}
                    disabled={isPending || adultDisabled}
                    title={adultDisabled ? tForm("ratingAdultTooltip") : undefined}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                      rating === r
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    } ${adultDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {r === "sfw"
                      ? tForm("ratingSfw")
                      : r === "soft"
                        ? tForm("ratingSoft")
                        : adultModeEnabled
                          ? tForm("ratingAdult18")
                          : tForm("ratingAdultLocked")}
                  </button>
                );
              })}
              <input type="hidden" name="content_rating" value={rating} />
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg p-4 flex items-start gap-3"
              style={{
                background: "var(--se-warn-bg)",
                border: "1px solid var(--se-warn)",
              }}
            >
              <AlertCircle
                size={16}
                color="var(--se-warn)"
                className="mt-0.5 flex-none"
              />
              <div className="flex-1">
                <div
                  className="se-mono uppercase mb-1"
                  style={{
                    fontSize: 10,
                    color: "var(--se-warn)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {tForm("moderationCode")}
                </div>
                <div
                  className="text-sm font-medium mb-1 se-cjk"
                  style={{ color: "var(--se-fg)" }}
                >
                  {tForm("moderationTitle")}
                </div>
                <div
                  className="text-xs se-cjk"
                  style={{
                    color: "var(--se-fg-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {error}
                </div>
                <div
                  className="mt-2 text-[11px] se-cjk"
                  style={{ color: "var(--se-fg-dim)" }}
                >
                  {tForm("moderationTip")}
                </div>
              </div>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isPending || prompt.length < 20}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tForm("submitBusy")}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {tForm("submit")}
              </>
            )}
          </Button>

          {/* AUDIT FIX (P3-UX-L-16): pre-display cost */}
          {!isPending && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="h-3 w-3" />
              {tForm("estimatedCost", { count: ESTIMATED_STORY_COST })}
            </div>
          )}

          {isPending && (
            <div className="space-y-2.5">
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--se-fg-muted)" }}
              >
                <span
                  className="se-mono uppercase inline-flex items-center gap-1.5"
                  style={{
                    color: "var(--se-accent)",
                    letterSpacing: "0.06em",
                  }}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {tForm("generatingHeader")}
                </span>
                <span className="se-mono" style={{ color: "var(--se-fg-dim)" }}>
                  {tForm("generatingHint")}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {TASK_IDS.map((id) => {
                  const Ico = TASK_ICONS[id];
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg"
                      style={{
                        background: "var(--se-surface)",
                        border: "1px solid var(--se-border)",
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: "var(--se-accent-bg)",
                          color: "var(--se-accent)",
                        }}
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium se-cjk"
                          style={{ color: "var(--se-fg)" }}
                        >
                          {tTasks(id)}
                        </div>
                        <div
                          className="se-mono mt-0.5"
                          style={{ fontSize: 10.5, color: "var(--se-fg-dim)" }}
                        >
                          <Ico size={9} className="inline mr-1" />
                          {tForm("generatingModelLine")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>

        {!isPending && (
          <div className="pt-3 border-t border-border/40">
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              {tForm("ideasHeader")}
            </div>
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_KEYS.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPrompt(tExamples(k))}
                  className="text-left text-xs text-ink-soft hover:text-foreground transition rounded p-2 -mx-2 hover:bg-secondary/50"
                >
                  <Badge variant="outline" className="mr-2 text-[10px]">
                    {i + 1}
                  </Badge>
                  {tExamples(k)}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
