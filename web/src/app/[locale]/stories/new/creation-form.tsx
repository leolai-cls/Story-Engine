"use client";

import { useState, useTransition } from "react";
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
 */
const TASKS = [
  { id: "meta", label: "故事 meta + opening 敘事", icon: BookOpen },
  { id: "schema", label: "自適應 state schema", icon: SettingsIcon },
  { id: "bible", label: "Story Bible · 世界規則", icon: Gem },
  { id: "chars", label: "NPC character cards", icon: Users },
] as const;

// AUDIT FIX (P3-UX-L-16): pre-display cost so user knows what threshold
// to hit before clicking. Previously they only learned via 402 error.
const ESTIMATED_STORY_COST = estimateStoryCreationCredits();

const EXAMPLE_PROMPTS = [
  "1980 年代香港古惑仔故事，我做新仔，幫師兄做嘢搵錢，順便照顧屋企人。江湖險惡，要 navigate 兄弟情同利益。",
  "TW 大學校園戀愛故事，我做轉校生男仔，社團要揀，3 個女仔可能有意思 — 文藝系思雅、運動系阿琳、活躍學姊 Cherry。",
  "中世紀奇幻冒險，我做被流放嘅前皇室護衛，要喺廢墟搵返家族失落嘅遺物。沿途遇到精靈、矮人、邪教徒。",
  "NBA 新秀第一年，我做被選去爛波隊嘅 controlled draft pick，要喺爛 team 證明自己。",
];

export function CreationForm({
  adultModeEnabled,
}: {
  /** Phase 6 non-money function: gate 'adult' content_rating button */
  adultModeEnabled: boolean;
}) {
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
        setError(result.error);
      }
      // success path: server action redirects to /play/[id]
    });
  }

  return (
    <Card className="border-border/60">
      <CardContent className="pt-6 space-y-5">
        <form action={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prompt">故事概念</Label>
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
              placeholder="例：1980 年代香港古惑仔故事，我做新仔幫師兄做嘢，要 navigate 兄弟情同江湖險惡…"
              disabled={isPending}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>越具體越好 — 包括時代、地點、主角設定、想體驗咩。</span>
              <span className="tabular-nums">{prompt.length} / 2000</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="protagonist_hint">
              主角設定提示{" "}
              <span className="text-xs text-muted-foreground">（可選）</span>
            </Label>
            <Input
              id="protagonist_hint"
              name="protagonist_hint"
              maxLength={280}
              value={protagonist}
              onChange={(e) => setProtagonist(e.target.value)}
              placeholder="例：「我做 18 歲新仔，瘦但拳腳功夫好」"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>內容分級</Label>
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
                    title={
                      adultDisabled
                        ? "需要喺 設定 開啟成人模式（需身份驗證）"
                        : undefined
                    }
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                      rating === r
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    } ${adultDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {r === "sfw"
                      ? "一般向 (SFW)"
                      : r === "soft"
                        ? "輕度暗示"
                        : adultModeEnabled
                          ? "成人 (18+)"
                          : "成人 (需身份驗證)"}
                  </button>
                );
              })}
              <input type="hidden" name="content_rating" value={rating} />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
              {error}
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
                AI 設計緊你嘅故事…（約 15-30 秒）
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                生成 + 即時開始
              </>
            )}
          </Button>

          {/* AUDIT FIX (P3-UX-L-16): pre-display cost */}
          {!isPending && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="h-3 w-3" />
              估計成本 ~{ESTIMATED_STORY_COST} credits
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
                  GENERATING · 4 PARALLEL TASKS · ~35-50s
                </span>
                <span className="se-mono" style={{ color: "var(--se-fg-dim)" }}>
                  你可以打開新 tab · 完成會自動跳轉
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {TASKS.map((t) => {
                  const Ico = t.icon;
                  return (
                    <div
                      key={t.id}
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
                          {t.label}
                        </div>
                        <div
                          className="se-mono mt-0.5"
                          style={{ fontSize: 10.5, color: "var(--se-fg-dim)" }}
                        >
                          <Ico size={9} className="inline mr-1" />
                          sonnet-4.6 · 生成中…
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
              冇靈感？試下：
            </div>
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_PROMPTS.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="text-left text-xs text-ink-soft hover:text-foreground transition rounded p-2 -mx-2 hover:bg-secondary/50"
                >
                  <Badge variant="outline" className="mr-2 text-[10px]">
                    {i + 1}
                  </Badge>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
