"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Lock, Check, Drama, Brain, Bot } from "lucide-react";
import {
  setPlaythroughModel,
  setNpcL3Enabled,
  setThinkingMode,
} from "@/app/[locale]/play/[playthroughId]/actions";
import { MODELS, TIER_GATE, type ModelTier } from "@/lib/ai/models";

/**
 * Inline chat controls (2026-05-29 founder rule · ChatGPT-style):
 *   - Model picker — switch narrator model mid-story (server validates tier ·
 *     updates playthroughs.llm_model via service-role · turn route reads it
 *     live so next turn uses the new model)
 *   - Agent mode (NPC L3 inner voices) quick toggle
 *
 * Sits above the chat input · mobile + desktop. Replaces the old right-rail
 * NpcL3Toggle card (founder: move controls next to the input like an LLM app).
 */

type SubTier = "free" | "adventurer" | "storyteller" | "legend";

const SUB_ORDER: SubTier[] = ["free", "adventurer", "storyteller", "legend"];

// Narrator models surfaced in the picker · order matters (cheap → premium).
// Session 17 (2026-06-02 · light-core): 非成人全 Claude 直連 · Standard=Sonnet ·
// Pro=Opus。舊 gemini/deepseek/gpt 退役（留 MODELS 做 back-compat · 唔再上 picker）。
// 成人向 model (grok-4-1) 唔喺度 — 成人故事個 picker 會整個鎖死 (isAdult · 見下)。
const PICKER_MODEL_IDS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
] as const;

export function ChatControls({
  playthroughId,
  currentModel,
  subscriptionTier,
  isAdult,
  npcL3Enabled: initialNpcL3,
  npcL3Available = false,
  thinkingEnabled: initialThinking,
  onModelChange,
  onNpcL3Change,
  onThinkingChange,
}: {
  playthroughId: string;
  currentModel: string | null;
  subscriptionTier: SubTier;
  /** 成人故事 (content_rating='adult') · model 鎖死成 Grok · picker 唔畀切換。 */
  isAdult?: boolean;
  npcL3Enabled: boolean;
  /** light-core (2026-06-03): NPC L3 移出核心 → 預設 false 隱藏個掣。
   *  deep mode 重啟時傳 true 即可,toggle 同 state 都仲喺度 (dormant)。 */
  npcL3Available?: boolean;
  thinkingEnabled: boolean;
  /** Parent updates its cost-estimate when model changes. */
  onModelChange?: (modelId: string) => void;
  onNpcL3Change?: (enabled: boolean) => void;
  onThinkingChange?: (enabled: boolean) => void;
}) {
  const t = useTranslations("play.chatControls");
  const tErrors = useTranslations("errors");

  const [model, setModel] = useState<string | null>(currentModel);
  const [npcL3, setNpcL3] = useState(initialNpcL3);
  const [thinking, setThinking] = useState(initialThinking);
  const [menuOpen, setMenuOpen] = useState(false);
  // ChatGPT-style instant toggles: optimistic flip + background write (no
  // spinner · no disable · no revalidate). We don't read isPending — the
  // ON/OFF flip IS the feedback. (founder 2026-05-29: toggles felt like a reload.)
  const [, startModelTransition] = useTransition();
  const [, startNpcTransition] = useTransition();
  const [, startThinkingTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const userIdx = SUB_ORDER.indexOf(subscriptionTier);
  const isTierEligibleForL3 =
    subscriptionTier === "storyteller" || subscriptionTier === "legend";

  function tierUnlocks(modelId: string): boolean {
    const m = MODELS[modelId];
    if (!m || !m.tier_pool) return false;
    const required = TIER_GATE[m.tier_pool as ModelTier];
    return userIdx >= SUB_ORDER.indexOf(required);
  }

  function pickModel(modelId: string) {
    setError(null);
    setMenuOpen(false);
    if (modelId === model) return;
    if (!tierUnlocks(modelId)) {
      setError(t("modelLocked"));
      return;
    }
    const prev = model;
    setModel(modelId); // optimistic
    onModelChange?.(modelId);
    startModelTransition(async () => {
      const res = await setPlaythroughModel(playthroughId, modelId);
      if (!res.ok) {
        setModel(prev); // rollback
        if (prev) onModelChange?.(prev);
        setError(
          res.errorCode
            ? tErrors(
                res.errorCode as Parameters<typeof tErrors>[0],
                res.errorParams ?? {},
              )
            : tErrors("common.tryAgainLater"),
        );
      }
    });
  }

  function toggleNpcL3() {
    setError(null);
    if (!isTierEligibleForL3) {
      setError(t("agentTierRequired"));
      return;
    }
    const next = !npcL3;
    setNpcL3(next); // optimistic
    onNpcL3Change?.(next);
    startNpcTransition(async () => {
      const res = await setNpcL3Enabled(playthroughId, next);
      if (!res.ok) {
        setNpcL3(!next); // rollback
        onNpcL3Change?.(!next);
        setError(
          res.errorCode
            ? tErrors(
                res.errorCode as Parameters<typeof tErrors>[0],
                res.errorParams ?? {},
              )
            : tErrors("common.tryAgainLater"),
        );
      }
    });
  }

  // Deep-thinking toggle (founder 2026-05-29): NO tier gate · 人人可開.
  // ON = narrator reasons before writing (richer · more credits · slower).
  function toggleThinking() {
    setError(null);
    const next = !thinking;
    setThinking(next); // optimistic
    onThinkingChange?.(next);
    startThinkingTransition(async () => {
      const res = await setThinkingMode(playthroughId, next);
      if (!res.ok) {
        setThinking(!next); // rollback
        onThinkingChange?.(!next);
        setError(
          res.errorCode
            ? tErrors(res.errorCode as Parameters<typeof tErrors>[0], {})
            : tErrors("common.tryAgainLater"),
        );
      }
    });
  }

  const currentModelEntry = model ? MODELS[model] : null;
  const currentModelName = currentModelEntry?.display_name ?? t("modelDefault");

  // Mobile-compact controls (founder 2026-05-29): tight gaps + a hard-truncated
  // model name so all three chips fit ONE row on a ~390px phone instead of
  // wrapping. Still flex-wrap as a graceful fallback.
  return (
    <div className="mb-2 flex items-center gap-1.5 flex-wrap">
      {/* ─── Model picker (成人故事 → 鎖死 · 固定 Grok · 唔畀切換) ─── */}
      {isAdult ? (
        <div
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-xs cursor-default"
          title={t("adultLocked")}
        >
          <Bot className="h-3.5 w-3.5 text-muted-foreground flex-none" />
          <span className="se-cjk font-medium max-w-[84px] sm:max-w-[150px] truncate">
            {currentModelName}
          </span>
          <Lock className="h-3 w-3 text-muted-foreground flex-none" />
        </div>
      ) : (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-2 py-1.5 text-xs hover:border-foreground/40 transition-colors"
        >
          <Bot className="h-3.5 w-3.5 text-muted-foreground flex-none" />
          <span className="se-cjk font-medium max-w-[84px] sm:max-w-[150px] truncate">
            {currentModelName}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-none" />
        </button>

        {menuOpen && (
          <div
            role="listbox"
            className="absolute bottom-full left-0 mb-1.5 z-30 min-w-[220px] max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground se-cjk">
              {t("modelLabel")}
            </div>
            {PICKER_MODEL_IDS.map((id) => {
              const m = MODELS[id];
              if (!m) return null;
              const unlocked = tierUnlocks(id);
              const selected = id === model;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={!unlocked}
                  onClick={() => pickModel(id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors ${
                    selected
                      ? "bg-primary/10"
                      : unlocked
                        ? "hover:bg-muted cursor-pointer"
                        : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="se-cjk font-medium block truncate">
                      {m.display_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground se-cjk block truncate">
                      {m.tier_pool === "pro" ? t("poolPro") : t("poolStandard")}
                      {m.allows_nsfw ? ` · ${t("nsfwCapable")}` : ""}
                    </span>
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 text-primary flex-none" />}
                  {!unlocked && <Lock className="h-3 w-3 text-muted-foreground flex-none" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ─── Agent mode (NPC L3 inner voices) toggle ─── */}
      {/* light-core (2026-06-03): NPC L3 唔再喺核心跑 → 隱藏個掣,免得個 toggle 講大話
          (撳咗都唔會有效果)。toggleNpcL3 / state 全部保留做 dormant code ·
          deep mode 重開時 play-client 傳 npcL3Available={true} 就得。 */}
      {npcL3Available && (
      <button
        type="button"
        onClick={toggleNpcL3}
        aria-pressed={npcL3}
        title={t("agentTooltip")}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
          npcL3
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border/70 bg-card text-muted-foreground hover:border-foreground/40"
        }`}
      >
        <Drama className="h-3.5 w-3.5" />
        <span className="se-cjk font-medium">{t("agentMode")}</span>
        <span
          className={`text-[11px] font-bold uppercase ${
            npcL3 ? "text-primary" : "text-muted-foreground/60"
          }`}
        >
          {npcL3 ? "ON" : "OFF"}
        </span>
      </button>
      )}

      {/* ─── Deep thinking toggle (no tier gate · costs more credits) ─── */}
      <button
        type="button"
        onClick={toggleThinking}
        aria-pressed={thinking}
        title={t("thinkingTooltip")}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
          thinking
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border/70 bg-card text-muted-foreground hover:border-foreground/40"
        }`}
      >
        <Brain className="h-3.5 w-3.5" />
        <span className="se-cjk font-medium">{t("thinkingMode")}</span>
        <span
          className={`text-[11px] font-bold uppercase ${
            thinking ? "text-primary" : "text-muted-foreground/60"
          }`}
        >
          {thinking ? "ON" : "OFF"}
        </span>
      </button>

      {error && (
        <span className="text-[11px] text-destructive se-cjk w-full">{error}</span>
      )}
    </div>
  );
}
