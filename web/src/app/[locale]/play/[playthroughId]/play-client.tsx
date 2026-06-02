"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Loader2, ArrowLeft, Coins, Lock, Shield, NotebookPen, Menu, Image as ImageIcon, Brain } from "lucide-react";
import { DynamicStatePanel } from "@/components/state-panel";
import type { StateSchema } from "@/schemas/state-schema";
import { NpcCard } from "@/components/se/DispositionAxis";
import { estimateTurnCredits } from "@/lib/billing/credits";
import { MODELS } from "@/lib/ai/models";
import { stripReasoningMarkers } from "@/lib/sanitize-narration";
import {
  PlaythroughSidebar,
  type SidebarPlaythrough,
} from "@/components/se/PlaythroughSidebar";
import { VisualizeSceneModal, type VisualizeRequest } from "@/components/se/VisualizeSceneModal";
import { ChatControls } from "@/components/se/ChatControls";
import type { StyleKey } from "@/lib/ai/image-styles";
import { estimateImageCredits } from "@/lib/ai/image-gen";
import { generateScene } from "./visualize-actions";

/**
 * NPC card data passed in from server.
 * 4-axis disposition (Hard rule #6) sourced from playthrough_character_states.disposition jsonb.
 */
export type NpcData = {
  name: string;
  role: string | null;
  axes: { trust: number; romance: number; respect: number; fear: number };
};


/**
 * Skill check inline badge (4 outcomes · Hard rule #5 permanent · no retry).
 * Renders below the AI turn text when backend stored a skill_check result.
 * Inline (not modal) — simpler · still surfaces the dice + outcome legibly.
 * NAT 20 / NAT 1 highlighted for critical outcomes (Phase B design spec).
 */
function SkillCheckInline({
  check,
}: {
  check: {
    d20_roll: number;
    skill_value: number;
    difficulty: number;
    total: number;
    outcome: "critical_success" | "success" | "failure" | "critical_failure";
    skill_key?: string;
  };
}) {
  // Wave 2 i18n migration (2026-05-27): tooltip + permanent badge localized.
  // Note: cfg.label is no longer used in render — kept for inline-skill-check
  // compatibility. stamp stays canonical English (consistent mono badge).
  const tPlay = useTranslations("play");
  const cfg = (
    {
      critical_success: {
        stamp: "CRITICAL SUCCESS",
        color: "var(--se-accent)",
        bg: "var(--se-accent-bg)",
        line: "var(--se-accent-line)",
        sparkle: true,
      },
      success: {
        stamp: "SUCCESS",
        color: "var(--se-ok)",
        bg: "var(--se-ok-bg)",
        line: "oklch(0.55 0.13 160 / 0.4)",
        sparkle: false,
      },
      failure: {
        stamp: "FAILURE",
        color: "var(--se-danger)",
        bg: "var(--se-danger-bg)",
        line: "var(--se-danger)",
        sparkle: false,
      },
      critical_failure: {
        stamp: "CRITICAL FAILURE",
        color: "var(--se-danger)",
        bg: "var(--se-danger-bg)",
        line: "var(--se-danger)",
        sparkle: false,
      },
    } as const
  )[check.outcome];
  const natBadge =
    check.d20_roll === 20
      ? { label: "NAT 20", bg: "var(--se-accent)" }
      : check.d20_roll === 1
        ? { label: "NAT 1", bg: "var(--se-danger)" }
        : null;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 p-2.5 rounded-md max-w-full"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.line}`,
        fontSize: 11,
      }}
    >
      <span
        className="se-mono uppercase flex items-center gap-1.5"
        style={{ color: cfg.color, fontWeight: 600, letterSpacing: "0.04em" }}
      >
        {cfg.sparkle && <Sparkles size={11} />}
        SKILL · {cfg.stamp}
      </span>
      <div className="flex items-center gap-1.5">
        <span
          className="se-mono inline-flex items-center justify-center relative"
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: "var(--se-surface-2)",
            border: "1px solid var(--se-border-strong)",
            color: "var(--se-fg-2)",
            fontSize: 11,
          }}
        >
          {check.d20_roll}
        </span>
        {natBadge && (
          <span
            className="se-mono"
            style={{
              fontSize: 8.5,
              padding: "1px 4px",
              borderRadius: 2,
              background: natBadge.bg,
              color: "#fff",
            }}
          >
            {natBadge.label}
          </span>
        )}
        <span className="se-mono" style={{ color: "var(--se-fg-dim)" }}>
          +{check.skill_value} ={" "}
        </span>
        <span
          className="se-mono"
          style={{
            color: cfg.color,
            fontWeight: 600,
          }}
        >
          {check.total} vs {check.difficulty}
        </span>
      </div>
      <span
        className="se-mono"
        style={{
          fontSize: 9.5,
          padding: "1px 5px",
          borderRadius: 3,
          background: "rgba(0,0,0,0.05)",
          color: "var(--se-fg-dim)",
          letterSpacing: "0.04em",
        }}
        title={tPlay("permanentTooltip")}
      >
        PERMANENT
      </span>
    </div>
  );
}

/**
 * Pending scene-image placeholder with a fake progress bar (2026-06-01 founder).
 *
 * "Progress UX to fake it faster" — fills the bar to 90% over the first 60% of
 * expected duration (feels fast), then slow-creeps the remaining 9% over the
 * next 40% (gives the real provider call time to land). When the parent swaps
 * `img.pending` to false, the placeholder is replaced by the real image so the
 * bar's final 1% never has to render. Tuned values from observed P50:
 *   - comic (gpt-image-2 primary): ~50s expected
 *   - illustration / wallpaper (nano-banana-2 primary): ~8s expected
 */
function PendingSceneImage({
  dims,
  imageType,
  loadingLabel,
}: {
  dims: { width: number; height: number };
  imageType: string;
  loadingLabel: string;
}) {
  const expectedMs = imageType === "comic" ? 50_000 : 8_000;
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const ratio = Math.min(elapsed / expectedMs, 1);
      // Two-segment ease: 0→90% across first 60% of time, 90→99% across rest.
      const p =
        ratio < 0.6
          ? (ratio / 0.6) * 0.9
          : 0.9 + ((ratio - 0.6) / 0.4) * 0.09;
      setProgressPct(Math.floor(p * 100));
    }, 120);
    return () => clearInterval(id);
  }, [expectedMs]);

  return (
    <div
      style={dims}
      className="relative flex flex-col items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-muted/40 overflow-hidden"
    >
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span className="text-[11px] se-cjk text-muted-foreground px-1 text-center leading-tight">
        {loadingLabel}
      </span>
      <div
        className="absolute bottom-0 left-0 h-[2px] bg-primary"
        style={{ width: `${progressPct}%`, transition: "width 120ms linear" }}
      />
    </div>
  );
}

/**
 * AUDIT FIX (P3-UX-M-13): friendly UX for credit / tier errors.
 * Parses prefixed error strings into actionable cards with Settings link.
 *
 * Wave 2 i18n migration (2026-05-27): titles + CTAs localized · body text
 * carries the dynamic params (balance/needed/tier/model) which the caller
 * passes in via the prefix. Moderation message is LLM-generated per input
 * so stays as-is (shown raw with localized title + helper hint).
 */
function PlayErrorCard({ error }: { error: string }) {
  const t = useTranslations("play.errors");
  if (error.startsWith("INSUFFICIENT_CREDITS:")) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-start gap-3">
          <Coins className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-100">
              {t("insufficientCreditsTitle")}
            </div>
            <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              {error.replace("INSUFFICIENT_CREDITS:", "")}
            </div>
            {/* Session 16 PM Review #2 (P-13): subscribe-first CTA · higher LTV
                than one-time top-up. Secondary text-link for top-up users. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={"/pricing" as never}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                <Coins className="h-3.5 w-3.5" />
                {t("insufficientCreditsSubscribeCta")}
              </Link>
              <Link
                href={"/settings" as never}
                className="text-[11px] underline text-amber-700 dark:text-amber-300 hover:text-amber-900"
              >
                {t("insufficientCreditsTopupCta")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (error.startsWith("MODEL_TIER:")) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-300" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-rose-900 dark:text-rose-100">
              {t("modelTierTitle")}
            </div>
            <div className="mt-1 text-xs text-rose-800 dark:text-rose-200">
              {error.replace("MODEL_TIER:", "")}
            </div>
            <Link
              href={"/settings" as never}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              {t("modelTierCta")}
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (error.startsWith("ACTION_BLOCKED:")) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-100">
              {t("moderationTitle")}
            </div>
            <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              {error.replace("ACTION_BLOCKED:", "")}
            </div>
            <div className="mt-2 text-[11px] text-amber-700/80 dark:text-amber-300/80">
              {t("moderationBody")}
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Default error display
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      {error}
    </div>
  );
}

/**
 * Skill check shape — mirrors lib/ai/skill-check.ts SkillCheckResult.
 * Backend stores on turns.skill_check (jsonb) when Director required a roll.
 */
export type SkillCheckSnapshot = {
  d20_roll: number;
  skill_value: number;
  difficulty: number;
  total: number;
  outcome: "critical_success" | "success" | "failure" | "critical_failure";
  skill_key?: string;
};

/**
 * Director verdict snapshot — backend stores on turns.director_verdict (jsonb).
 * Subset used by UI to drive Director amber border.
 */
export type DirectorVerdictSnapshot = {
  verdict: "allow" | "reject" | "allow_with_constraint" | "require_skill_check";
  reason?: string;
};

export type Turn = {
  role: "user" | "ai";
  text: string;
  index: number;
  /** When Director required a skill check on this turn · backend rolls + stores. */
  skillCheck?: SkillCheckSnapshot | null;
  /** Verdict that drove this AI turn · used to render Director amber side-border. */
  directorVerdict?: DirectorVerdictSnapshot | null;
  /** 2026-05-29: narrator reasoning (deep-thinking mode) · collapsible panel.
   *  Only populated for the in-session turn (not persisted to DB yet). */
  reasoning?: string;
};

/** Phase 8 · cached scene image displayed inline under its turn. */
export type SceneImageEntry = {
  id: string;
  turnIndex: number;
  storageUrl: string;
  imageType: "illustration" | "comic" | "wallpaper";
  styleMode: string;
  styleValue: string;
  /** 2026-05-30: background generation — image is still rendering (placeholder). */
  pending?: boolean;
  /** Background generation failed — show an inline retry. */
  failed?: boolean;
};

export function PlayClient({
  playthroughId,
  storyTitle,
  storyDescription,
  stateSchema,
  initialState,
  initialTurns,
  characterName,
  npcs = [],
  sidebarPlaythroughs = [],
  sidebarTotalCount = 0,
  npcL3Enabled = false,
  thinkingModeEnabled = false,
  subscriptionTier = "free",
  playthroughModel = null,
  storyContentRating = "sfw",
  storyDefaultStyleKey = null,
  currentBalance = 0,
  initialSceneImages = [],
}: {
  playthroughId: string;
  storyTitle: string;
  storyDescription: string;
  stateSchema: StateSchema;
  initialState: Record<string, unknown>;
  initialTurns: Turn[];
  characterName: string;
  npcs?: NpcData[];
  /** Top N of user's recent playthroughs for the sidebar rail. */
  sidebarPlaythroughs?: SidebarPlaythrough[];
  /** Total playthrough count (sidebar shows "see all" link if > visible). */
  sidebarTotalCount?: number;
  /** Session 14: NPC L3 Agents opt-in flag (Storyteller tier exclusive). */
  npcL3Enabled?: boolean;
  /** 2026-05-29: deep-thinking opt-in flag (no tier gate · founder rule). */
  thinkingModeEnabled?: boolean;
  /** Session 14: user's subscription tier · controls toggle visibility. */
  subscriptionTier?: "free" | "adventurer" | "storyteller" | "legend";
  /** Session 16 P-07: playthrough's locked LLM model · drives per-turn cost preview. */
  playthroughModel?: string | null;
  /** Phase 8: drives image-provider routing + adult mode gate. */
  storyContentRating?: "sfw" | "soft" | "adult";
  /** Phase 8: pre-selected style preset (from story creation). */
  storyDefaultStyleKey?: string | null;
  /** Phase 8: credit balance for visualize-scene CTA. */
  currentBalance?: number;
  /** Phase 8: scene_images already generated for this playthrough. */
  initialSceneImages?: SceneImageEntry[];
}) {
  const locale = useLocale();
  // Wave 2 i18n migration (2026-05-27): full client localized via play.* namespace.
  const tPlay = useTranslations("play");
  const tPlayErr = useTranslations("play.errors");
  const tModeration = useTranslations("errors.moderation");
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [state, setState] = useState<Record<string, unknown>>(initialState);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 2026-06-01 (ADR-001 原則 5): 技術失敗時記住啱啱嘅 action · 俾「再試」掣
  // 一撳就重新送同一個 action (似 ChatGPT regenerate)。
  const [retryAction, setRetryAction] = useState<string | null>(null);
  // C10 audit fix · mobile 3-tab pattern (敘事 / 角色 / 狀態)
  const [mobileTab, setMobileTab] = useState<"narrative" | "npc" | "state">("narrative");
  // Sidebar mobile drawer state (desktop rail always visible)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 2026-05-30 (founder · mobile): the composer auto-grows like ChatGPT/Claude —
  // single-line <input> hid the start of long text (horizontal scroll). ref +
  // effect resize the <textarea> to its content (capped, then internal scroll).
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 2026-05-29 · inline chat controls (ChatGPT-style): model + agent mode are
  // now reactive state (seeded from props) so the cost estimate + UI update
  // live when the user switches mid-story via ChatControls.
  const [activeModel, setActiveModel] = useState<string | null>(playthroughModel);
  const [activeNpcL3, setActiveNpcL3] = useState<boolean>(npcL3Enabled);
  const [activeThinking, setActiveThinking] = useState<boolean>(thinkingModeEnabled);
  // Live narrator reasoning while streaming (deep-thinking mode · collapsible panel).
  const [streamReasoning, setStreamReasoning] = useState("");

  // 2026-05-29 (founder #3): NPC rail used to dump ALL story characters at
  // turn 1 — including ones the Story Bible plans for later acts. Only show
  // characters whose name actually appears in the narrative so far (reactive
  // to `turns`). They populate the rail as they get introduced.
  const appearedNpcs = useMemo(() => {
    const allText = turns.map((t) => t.text).join("\n");
    return npcs.filter(
      (n) =>
        typeof n.name === "string" &&
        n.name.trim().length >= 2 &&
        allText.includes(n.name.trim()),
    );
  }, [turns, npcs]);

  // Phase 8 · Visualize Scene modal state · which turn is being visualized
  const [visualizeTurnIndex, setVisualizeTurnIndex] = useState<number | null>(null);
  const [sceneImages, setSceneImages] =
    useState<SceneImageEntry[]>(initialSceneImages);
  // Phase 8 · grouped by turnIndex for fast lookup during render
  const sceneImagesByTurn = sceneImages.reduce<Record<number, SceneImageEntry[]>>(
    (acc, img) => {
      (acc[img.turnIndex] ??= []).push(img);
      return acc;
    },
    {},
  );
  // Credit balance shown in the visualize modal · seeded from server, decremented
  // optimistically when a background gen fires (refunded if it fails).
  const [balance, setBalance] = useState(currentBalance);

  // 2026-05-30 (founder): background, non-blocking scene-image generation
  // (ChatGPT-style). The modal hands us the request + closes immediately; we
  // drop an inline pending placeholder on the turn and run generateScene in the
  // background (this component stays mounted, so the promise survives). When it
  // resolves the placeholder becomes the image; on failure it flips to an
  // inline error. No blocking spinner, no page refresh.
  const handleGenerateScene = useCallback(
    (req: VisualizeRequest) => {
      const turnIdx = visualizeTurnIndex;
      if (turnIdx === null) return;
      const tempId = `pending-${crypto.randomUUID()}`;
      setSceneImages((prev) => [
        ...prev,
        {
          id: tempId,
          turnIndex: turnIdx,
          storageUrl: "",
          imageType: req.imageType,
          styleMode: req.styleMode,
          styleValue: req.styleValue,
          pending: true,
        },
      ]);
      const cost = estimateImageCredits(
        storyContentRating,
        req.imageType,
        req.proQuality ?? false,
      );
      setBalance((b) => b - cost);
      generateScene({
        playthroughId,
        turnIndex: turnIdx,
        imageType: req.imageType,
        styleMode: req.styleMode,
        styleKey: req.styleKey,
        styleReferenceId: req.styleReferenceId,
        customPrompt: req.customPrompt,
        proQuality: req.proQuality,
      })
        .then((res) => {
          if (res.ok) {
            setSceneImages((prev) =>
              prev.map((e) =>
                e.id === tempId
                  ? { ...e, id: res.sceneImageId, storageUrl: res.storageUrl, pending: false }
                  : e,
              ),
            );
          } else {
            setBalance((b) => b + cost); // server already refunded · keep display honest
            setSceneImages((prev) =>
              prev.map((e) =>
                e.id === tempId ? { ...e, pending: false, failed: true } : e,
              ),
            );
          }
        })
        .catch(() => {
          setBalance((b) => b + cost);
          setSceneImages((prev) =>
            prev.map((e) =>
              e.id === tempId ? { ...e, pending: false, failed: true } : e,
            ),
          );
        });
    },
    [visualizeTurnIndex, playthroughId, storyContentRating],
  );

  // (2026-05-29) Removed the 600ms "內容審核" safety-hint timer — the loading
  // indicator is now always a neutral "AI 諗緊…" (founder: never show
  // moderation wording to the player). Moderation still runs in the pipeline.

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, streamText]);

  // Auto-grow the composer to fit its content (ChatGPT/Claude-style). Reset to
  // auto first so it can SHRINK when text is deleted / cleared after sending,
  // then grow to scrollHeight. max-h-40 (CSS) caps it; overflow then scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch(`/api/playthroughs/${playthroughId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.current_state) {
          setState(data.current_state);
        }
      }
    } catch (e) {
      console.error("refreshState failed", e);
    }
  }, [playthroughId]);

  const sendAction = useCallback(
    async (action: string) => {
      if (!action.trim() || streaming) return;
      setError(null);
      setStreaming(true);
      setStreamText("");
      setStreamReasoning("");

      // Optimistically append user turn
      const tempUserTurn: Turn = {
        role: "user",
        text: action,
        index: (turns[turns.length - 1]?.index ?? -1) + 1,
      };
      setTurns((t) => [...t, tempUserTurn]);
      setInput("");

      try {
        const res = await fetch(`/api/playthroughs/${playthroughId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (!res.ok) {
          // Wave 2.6 W2.5-UX-M-01 fix: Fetch Response body is single-consume.
          // Previously each branch did `await res.json()` and fell through to
          // `await res.text()` — second consume threw "body stream already
          // read" which leaked to the user instead of the real server error.
          // Now: read once at the top, key off body?.error per status.
          const body = await res.json().catch(() => null);

          if (res.status === 402) {
            // AUDIT FIX (P3-UX-M-13): friendly UX for credit errors.
            // Wave 2 i18n migration: body text localized via play.errors catalog.
            const currentBalance = body?.currentBalance ?? "?";
            const estimatedCost = body?.estimatedCost ?? "?";
            throw new Error(
              `INSUFFICIENT_CREDITS:${tPlayErr("insufficientCreditsBody", {
                balance: currentBalance,
                needed: estimatedCost,
              })}`,
            );
          }
          if (res.status === 403 && body?.error === "model_tier_required") {
            throw new Error(
              `MODEL_TIER:${tPlayErr("modelTierBody", {
                tier: body.currentTier ?? "?",
                model: body.modelId ?? "?",
              })}`,
            );
          }
          // Wave 2 i18n cycle-3 fix (2026-05-28): 403 adult_mode_required.
          // Server sends `reason: "nsfw_model" | "adult_story"` + optional modelName.
          // Client localizes title + body per user locale.
          if (res.status === 403 && body?.error === "adult_mode_required") {
            const bodyText =
              body?.reason === "nsfw_model"
                ? tPlayErr("adultModeRequiredBodyModel", {
                    model: body.modelName ?? "?",
                  })
                : tPlayErr("adultModeRequiredBodyStory");
            throw new Error(`MODEL_TIER:${bodyText}`);
          }
          // W2-UX-H-03 fix: 400 action_blocked from turn moderation.
          // Session 16 PM Review #2 (C-01 sweep): turn route now returns
          // `code` (verdictToCode mapping) instead of raw `message` (繁中).
          // Client maps to localized via errors.moderation.* catalog.
          if (res.status === 400 && body?.error === "action_blocked") {
            const modCode = body?.code as string | undefined;
            const modKey =
              modCode === "moderation_csam_sexual_minor" ? "csam" :
              modCode === "moderation_self_harm" ? "selfHarm" :
              modCode === "moderation_hate_violence" ? "hateViolence" :
              modCode === "moderation_sexual" ? "sexual" :
              "blocked";
            throw new Error(`ACTION_BLOCKED:${tModeration(modKey)}`);
          }
          if (res.status === 503 && body?.error === "moderation_misconfigured") {
            throw new Error(tPlayErr("moderationConfigBody"));
          }
          if (res.status === 503 && body?.error === "moderation_failed") {
            throw new Error(tPlayErr("moderationUnavailableBody"));
          }
          // Wave 2 i18n cycle-3 fix: 429 rate-limit
          if (res.status === 429 && body?.error === "rate_limited") {
            throw new Error(tPlayErr("rateLimitedBody"));
          }
          // Fallback: server sends error code only · localize generic HTTP.
          // NO body.message consumption — server stopped sending raw 繁中 in cycle-3.
          const fallbackMsg = tPlayErr("httpError", { status: res.status });
          throw new Error(String(fallbackMsg));
        }

        // Consume the data stream: AI SDK's UIMessageStream sends JSON chunks
        // We extract text-delta events and accumulate. Other event types are ignored.
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no stream body");
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        // Deep-thinking mode: narrator reasoning streamed as reasoning-* frames
        // (route sets sendReasoning when thinking is on). Shown in a collapsible panel.
        // 2026-05-31: the GM (Director) + NPC-agent thinking arrives UP-FRONT in the
        // X-Think-Preamble response header (base64 UTF-8) — decoupled from the
        // narrator stream so the narrator's prose can't get cut off. Seed the panel
        // with it; the narrator's own reasoning-delta frames append below.
        let reasoningAccumulated = "";
        const preambleB64 = res.headers.get("X-Think-Preamble");
        if (preambleB64) {
          try {
            reasoningAccumulated = new TextDecoder().decode(
              Uint8Array.from(atob(preambleB64), (c) => c.charCodeAt(0)),
            );
            setStreamReasoning(reasoningAccumulated);
          } catch {
            // ignore a malformed header · panel just stays empty
          }
        }
        // 2026-06-01 (founder bug fix): the live turn's skill-check badge + the
        // Director amber border used to appear only after a page reload, because
        // the SSE stream carried prose only. The turn route now ships them as
        // base64-JSON response headers (same pattern as X-Think-Preamble above)
        // so we can attach them to the freshly-built turn below — no extra
        // round-trip. Fixes both desktop and mobile (the "desktop yes / mobile
        // no" was just a reload artifact).
        const decodeHeaderJson = <T,>(b64: string | null): T | undefined => {
          if (!b64) return undefined;
          try {
            return JSON.parse(
              new TextDecoder().decode(
                Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
              ),
            ) as T;
          } catch {
            return undefined;
          }
        };
        const liveSkillCheck = decodeHeaderJson<NonNullable<Turn["skillCheck"]>>(
          res.headers.get("X-Skill-Check"),
        );
        const liveDirectorVerdict = decodeHeaderJson<
          NonNullable<Turn["directorVerdict"]>
        >(res.headers.get("X-Director-Verdict"));
        // W4 fix 2026-05-28 (agent retest post-PR-#5): SSE stream 可能包
        // {"type":"error","errorText":"..."} frame (e.g. OpenRouter upstream
        // TOS violation · Gemini safety filter rejection). 之前嘅 code 只認
        // text-delta event · error frame 完全 silent · UI 出空白 narrator
        // block · 用戶唔知出咩事. 而家 capture error frame · throw 出去
        // catch 用 error UI 顯示俾用戶睇.
        let streamError: string | null = null;
        // Session 17 (light-core audit fix #1): Anthropic 直連 (Sonnet/Opus) 係真逐字
        // 串流 → 即時 render（唔再等成段先假打字）。Buffered provider (Grok/Gemini via
        // CrazyRouter · 一次過 dump 全部 frame) 維持 client 假打字。
        const realStream =
          !!activeModel && MODELS[activeModel]?.provider === "anthropic";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by \n\n. Parse line-by-line.
          let nlIdx;
          while ((nlIdx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 1);
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const event = JSON.parse(data);
              // AI SDK v6 emits 'text-delta' with { delta: "chunk" }
              // Only ACCUMULATE here — the client-side typing animator (below)
              // paces the on-screen reveal. CrazyRouter buffers Gemini (dumps
              // all frames in one ~200ms burst at the end), so relying on the
              // network to pace typing = "pops out". Animating client-side gives
              // ChatGPT-style word-by-word on EVERY model. (founder 2026-05-29)
              if (event.type === "text-delta" && typeof event.delta === "string") {
                accumulated += event.delta;
                // 真串流 (Anthropic 直連) → 即時 render，玩家睇到逐粒字浮出嚟。
                // Buffered provider 唔即時 render（會一次過 dump）· 留俾下面假打字。
                if (realStream) setStreamText(accumulated);
              } else if (
                event.type === "reasoning-delta" &&
                typeof event.delta === "string"
              ) {
                // Deep-thinking narration · accumulate the model's reasoning for
                // the collapsible "AI 思考過程" panel (GLM / Claude expose it;
                // Gemini usually hides its chain-of-thought → stays empty).
                reasoningAccumulated += event.delta;
                setStreamReasoning(reasoningAccumulated);
              } else if (event.type === "error") {
                // Capture error · render below outside loop (don't break stream
                // mid-iteration · let SSE finish so we got [DONE]).
                const msg = typeof event.errorText === "string"
                  ? event.errorText
                  : typeof event.error === "string"
                    ? event.error
                    : "Stream error";
                streamError = msg;
                console.error("[turn] SSE error frame:", msg, event);
              }
            } catch {
              // ignore non-JSON lines
            }
          }
        }

        // W4 fix: if SSE delivered an error frame AND no text accumulated ·
        // throw to outer catch · roll back the optimistic user turn + render
        // the error to UI (founder feedback: silent fail = 用戶 instinct push back).
        if (streamError && !accumulated.trim()) {
          throw new Error(streamError);
        }

        // ─── Client-side typing animation (ChatGPT-style · founder 2026-05-29) ───
        // Reveal the accumulated prose into streamText progressively (~2s total,
        // scaled by length) so it types out word-by-word — even though
        // CrazyRouter delivered the whole thing in one burst. This is the only
        // way to get the typing effect for Gemini (CrazyRouter doesn't truly
        // stream it). Skipped automatically when the prose is empty.
        // 2026-05-31 (founder): strip a leading ```json {...}``` block the
        // narrator sometimes echoes from the state context (Gemini mimicry) so
        // the player never sees raw JSON — matches the server-side strip.
        const fullText = accumulated
          .replace(/^\s*```(?:json)?\s*\{[\s\S]*?\}\s*```\s*/i, "")
          .trimStart();

        // 2026-06-01 (ADR-001 原則 5 · 技術失敗要誠實 · 唔好假扮故事):
        // Narrator 超時 / 交白卷 → stream 完冇實質文字。後端會插一個 failed=true
        // 標記回合（text 空）· 前端即時靠「冇文字」判斷 · 唔好砌空白故事回合 ·
        // 改為 roll back 玩家 turn + 顯示「整唔到請再試」+ retry 掣（似 ChatGPT）。
        const isTechnicalFailure = !fullText.trim();
        if (isTechnicalFailure) {
          setStreamText("");
          setStreamReasoning("");
          setTurns((t) => t.filter((x) => x !== tempUserTurn)); // roll back 玩家 turn
          setRetryAction(action); // 記住啱啱嘅 action · 俾 retry 掣用
          setError("TECHNICAL_FAILURE");
          return;
        }

        // 真串流 (Anthropic) 已經喺 loop 入面逐粒字 render 咗 → 直接 set 最終 (stripped)
        // 文字就算 · 唔好再假打字（會 double-animate）。Buffered provider 先行假打字。
        if (realStream) {
          setStreamText(fullText);
        } else {
          await new Promise<void>((resolve) => {
            let shown = 0;
            const step = Math.max(2, Math.ceil(fullText.length / 130));
            const tick = () => {
              shown = Math.min(fullText.length, shown + step);
              setStreamText(fullText.slice(0, shown));
              if (shown < fullText.length) {
                setTimeout(tick, 16);
              } else {
                resolve();
              }
            };
            tick();
          });
        }

        // Finalize: append AI turn locally, clear stream buffer
        const aiTurn: Turn = {
          role: "ai",
          text: fullText,
          index: tempUserTurn.index + 1,
          reasoning: reasoningAccumulated.trim() || undefined,
          // Attach the live skill-check + director verdict decoded from the
          // response headers so the badge + amber border render immediately on
          // this turn (no reload needed).
          skillCheck: liveSkillCheck,
          directorVerdict: liveDirectorVerdict,
        };
        setTurns((t) => [...t, aiTurn]);
        setStreamText("");
        setStreamReasoning("");

        // Refresh state from server (delta was applied server-side)
        await refreshState();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStreamText("");
        setStreamReasoning("");
        // Roll back optimistic user turn
        setTurns((t) => t.filter((x) => x !== tempUserTurn));
      } finally {
        setStreaming(false);
      }
    },
    [playthroughId, refreshState, streaming, turns],
  );

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Slim header — AUDIT FIX MG-UX-HIGH-03: mobile 360px viewport had
          ~140px overflow with all 6 elements visible at full size. Now:
          mobile shows [Menu] [back-icon-only] [title-truncate] [memory-icon-only],
          desktop adds back-label + memory-label + "玩緊：characterName". */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-6 h-12 flex items-center gap-1.5 sm:gap-2">
          {/* Mobile sidebar trigger (lg:hidden) */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-md flex-none"
            style={{
              color: "var(--se-fg-2)",
              background: "var(--se-surface)",
              border: "1px solid var(--se-border)",
            }}
            aria-label={tPlay("header.ariaOpenList")}
          >
            <Menu size={14} />
          </button>
          {/* Back: icon-only on mobile, icon+label on sm+ */}
          <Link
            href="/library"
            className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs flex-none"
            style={{ color: "var(--se-fg-muted)" }}
            aria-label={tPlay("header.ariaBack")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tPlay("header.back")}</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2 font-bold text-sm min-w-0 flex-1">
            <Sparkles className="h-4 w-4 text-primary flex-none" />
            <span className="truncate min-w-0">{storyTitle}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-none">
            <Link
              href={`/play/${playthroughId}/memory` as never}
              className="inline-flex items-center gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-md text-xs font-medium"
              style={{
                background: "var(--se-surface)",
                border: "1px solid var(--se-border)",
                color: "var(--se-fg-2)",
              }}
              aria-label={tPlay("header.ariaMemory")}
              title={tPlay("header.memoryTooltip")}
            >
              <NotebookPen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tPlay("header.memory")}</span>
            </Link>
            {/* "Playing as: characterName" — desktop-only (mobile hides to save ~100px) */}
            <div className="hidden lg:block text-xs text-muted-foreground">
              {tPlay("header.playingAs")}<span className="font-medium text-foreground">{characterName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* C10 audit fix · Mobile 3-tab bar (lg:hidden) */}
      <div
        className="lg:hidden flex border-b"
        style={{
          background: "var(--se-bg-elev)",
          borderColor: "var(--se-border)",
        }}
      >
        {(
          [
            { id: "narrative", label: tPlay("tabs.narrative") },
            { id: "npc", label: tPlay("tabs.npc", { count: appearedNpcs.length }) },
            { id: "state", label: tPlay("tabs.state") },
          ] as const
        ).map((t) => {
          const a = mobileTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setMobileTab(t.id as typeof mobileTab)}
              className="flex-1 py-2.5 text-xs se-cjk"
              style={{
                color: a ? "var(--se-fg)" : "var(--se-fg-muted)",
                borderBottom: `2px solid ${a ? "var(--se-accent)" : "transparent"}`,
                fontWeight: a ? 500 : 400,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Outer flex: sidebar (lg+) | main (narrative + state panel) */}
      <div className="flex-1 flex min-h-0">
        <PlaythroughSidebar
          locale={locale}
          currentPlaythroughId={playthroughId}
          playthroughs={sidebarPlaythroughs}
          totalCount={sidebarTotalCount}
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
        />
        {/* Two-column layout: narrative left, state panel right · mobile uses tabs.
            AUDIT FIX MG-REG-HIGH-05: max-w bumped from 7xl (1280) → 1520 so
            sidebar (240) doesn't steal width from the narrative+state grid.
            Net effect on lg viewports: narrative recovers ~80px lost to sidebar,
            matching designer v5 pixel intent (designer never had a sidebar). */}
        <div className="flex-1 mx-auto max-w-[1520px] w-full px-4 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] grid grid-cols-1 lg:grid-cols-[1fr_320px] grid-rows-[minmax(0,1fr)] gap-4 min-h-0">
        {/* Narrative + input · mobile: only when tab="narrative" */}
        <div className={`flex-col min-h-0 ${mobileTab === "narrative" ? "flex" : "hidden lg:flex"}`}>
          <div className="text-xs text-muted-foreground mb-2 line-clamp-1">
            {storyDescription}
          </div>

          {/* Turn history */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/60 bg-card/30 p-4 space-y-4 lg:min-h-[400px]"
          >
            {turns.map((turn) => {
              // 2026-06-01 (founder/Codex · 沉浸感原則): 移除咗 GM 調整嘅 meta UI —
              // 之前 allow_with_constraint / reject 會畫一條淺黃左邊框 + tooltip
              // 「NPC 反應與你預期不同」。但 GM 加嘅限制應該**喺敘事文字入面感受到** ·
              // 唔好用 UI 標籤向玩家解釋 (immersion 原則)。verdict metadata 仍然存喺
              // turns.director_verdict (debug / audit 用) · 只係唔再 render 出嚟。
              return (
                <div
                  key={turn.index}
                  className={
                    turn.role === "user"
                      ? "rounded-lg bg-primary/8 border border-primary/20 p-3"
                      : "rounded-lg bg-card border border-border/40 p-4 leading-relaxed"
                  }
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {turn.role === "user"
                      ? tPlay("turn.userBadge", { protagonist: characterName })
                      : tPlay("turn.aiBadge")}
                  </div>
                  {/* Deep-thinking · collapsible reasoning panel (founder 2026-05-29).
                      Session-only (not persisted) · shows for GLM/Claude that
                      expose their reasoning. Collapsed by default for history. */}
                  {turn.role === "ai" && turn.reasoning && (
                    <details className="mb-2 rounded-md border border-border/50 bg-muted/30">
                      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] se-cjk text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                        <Brain className="h-3 w-3 flex-none" />
                        {tPlay("turn.thinkingLabel")}
                      </summary>
                      <div
                        className="px-2.5 pb-2.5 pt-0.5 text-xs whitespace-pre-wrap se-cjk"
                        style={{ color: "var(--se-fg-dim)", lineHeight: 1.6 }}
                      >
                        {turn.reasoning}
                      </div>
                    </details>
                  )}
                  <div className="text-sm whitespace-pre-wrap">
                    {turn.role === "ai" ? stripReasoningMarkers(turn.text) : turn.text}
                  </div>
                  {/* C5a-d audit fix · Skill check 4 outcomes inline badge.
                      Backend rolls + stores on turns.skill_check. Hard rule #5:
                      PERMANENT · no retry · 4 outcomes (crit success / success
                      / failure / crit failure). */}
                  {turn.skillCheck && <SkillCheckInline check={turn.skillCheck} />}

                  {/* Phase 8 · cached scene images for this turn (inline thumbs) */}
                  {turn.role === "ai" && sceneImagesByTurn[turn.index]?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sceneImagesByTurn[turn.index].map((img) => {
                        // Wave 3 fix UX-MED-04: exact aspect ratios
                        // illustration 16:9 = 168×94.5 → 95 · comic 4:3 = 168×126
                        // wallpaper 9:19.5 = 80×173 (was 168 · squish 3%)
                        const dims =
                          img.imageType === "wallpaper"
                            ? { width: 80, height: 173 }
                            : img.imageType === "comic"
                              ? { width: 168, height: 126 }
                              : { width: 168, height: 95 };
                        // Background generation (founder 2026-05-30): pending →
                        // inline placeholder. 2026-06-01: + fake progress bar
                        // so the wait feels faster (90% bar in first 60% of
                        // expected time · then slow creep until real result).
                        if (img.pending) {
                          return (
                            <PendingSceneImage
                              key={img.id}
                              dims={dims}
                              imageType={img.imageType}
                              loadingLabel={
                                img.imageType === "comic"
                                  ? tPlay("visualize.loadingComic")
                                  : tPlay("visualize.loading")
                              }
                            />
                          );
                        }
                        if (img.failed) {
                          return (
                            <button
                              key={img.id}
                              type="button"
                              style={dims}
                              onClick={() => {
                                // Retry: drop the failed placeholder + reopen the
                                // visualize modal for this turn (founder · audit).
                                setSceneImages((prev) =>
                                  prev.filter((e) => e.id !== img.id),
                                );
                                setVisualizeTurnIndex(turn.index);
                              }}
                              className="flex flex-col items-center justify-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-1.5 text-center hover:border-destructive/70 transition-colors"
                            >
                              <ImageIcon className="h-4 w-4 text-destructive/70" />
                              <span className="text-[11px] se-cjk text-destructive leading-tight">
                                {tPlay("visualize.bgFailed")}
                              </span>
                            </button>
                          );
                        }
                        return (
                          <a
                            key={img.id}
                            href={img.storageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-md border border-border/60 hover:border-primary/60 transition-colors"
                            style={dims}
                            title={tPlay("visualize.thumbnailHover", {
                              imageType: tPlay(`visualize.imageType.${img.imageType}`),
                              style: img.styleValue || img.styleMode,
                            })}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.storageUrl}
                              alt={tPlay("visualize.fullSizeAlt", {
                                imageType: tPlay(`visualize.imageType.${img.imageType}`),
                              })}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {/* Phase 8 · per-AI-turn Visualize button · shown to ALL tiers.
                      Free tier sees button → clicks → modal shows tier_required
                      paywall with 「升級 →」CTA (upsell moment). Hiding the button
                      entirely from free users (prior implementation) prevented
                      free→paid conversion + made the feature invisible. */}
                  {turn.role === "ai" && (
                    <button
                      type="button"
                      onClick={() => setVisualizeTurnIndex(turn.index)}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                      title={tPlay("visualize.button")}
                    >
                      <ImageIcon className="h-3 w-3" />
                      <span className="se-cjk">{tPlay("visualize.buttonShort")}</span>
                    </button>
                  )}
                </div>
              );
            })}

            {/* Live deep-thinking reasoning · open while the model thinks
                (often before any prose streams). Founder 2026-05-29. */}
            {streaming && streamReasoning && (
              <details open className="rounded-md border border-primary/30 bg-muted/30">
                <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[11px] se-cjk text-primary flex items-center gap-1.5">
                  <Brain className="h-3 w-3 flex-none animate-pulse" />
                  {tPlay("turn.thinkingLive")}
                </summary>
                <div
                  className="px-2.5 pb-2.5 pt-0.5 text-xs whitespace-pre-wrap se-cjk"
                  style={{ color: "var(--se-fg-dim)", lineHeight: 1.6 }}
                >
                  {streamReasoning}
                </div>
              </details>
            )}

            {streaming && streamText && (
              <div className="rounded-lg bg-card border border-primary/30 p-4 leading-relaxed">
                <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">
                  {tPlay("turn.aiPending")}
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  {streamText}
                  <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
                </div>
              </div>
            )}

            {/* 2026-05-29 (founder): loading shows INLINE in the chat flow (like
                ChatGPT) — no floating popup. Same line whether we're moderating
                or the model is thinking; text just swaps after the 600ms hint. */}
            {streaming && !streamText && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="se-cjk">
                  {/* 2026-05-29 (founder): never surface "內容審查中" to the
                      player — it reads as censorious. Always a neutral thinking
                      indicator (moderation still runs silently in the pipeline). */}
                  {tPlay("turn.aiThinking")}
                </span>
              </div>
            )}

            {/* 2026-06-01 (ADR-001 原則 5): 技術失敗 → 誠實告知 + retry 掣
                (似 ChatGPT)。唔當故事內容。其餘 error 照用 PlayErrorCard。 */}
            {error === "TECHNICAL_FAILURE" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {tPlay("turn.failedTitle")}
                </div>
                <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  {tPlay("turn.failedBody")}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const a = retryAction;
                    setError(null);
                    setRetryAction(null);
                    if (a) sendAction(a);
                  }}
                  disabled={streaming}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {tPlay("turn.failedRetry")}
                </button>
              </div>
            ) : error ? (
              <PlayErrorCard error={error} />
            ) : null}
          </div>

          {/* 2026-05-29 · inline chat controls (model picker + agent toggle) ·
              ChatGPT-style · mobile + desktop · sits above the input. */}
          <div className="mt-3">
            <ChatControls
              playthroughId={playthroughId}
              currentModel={activeModel}
              subscriptionTier={subscriptionTier}
              isAdult={storyContentRating === "adult"}
              npcL3Enabled={activeNpcL3}
              thinkingEnabled={activeThinking}
              onModelChange={setActiveModel}
              onNpcL3Change={setActiveNpcL3}
              onThinkingChange={setActiveThinking}
            />
          </div>

          {/* Input · w-full + min-w-0 on the field so the flex row never
              exceeds the viewport (founder 2026-05-29: bottom row overflowed
              → page scrolled left-right on mobile). Send button stays fixed. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendAction(input);
            }}
            className="flex items-end gap-2 w-full"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends · Shift+Enter = newline (ChatGPT/Claude/Grok).
                // CRITICAL for CJK: skip while an IME candidate is composing —
                // pressing Enter to confirm a Chinese candidate must NOT submit.
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (!streaming && input.trim()) sendAction(input);
                }
              }}
              placeholder={tPlay("input.placeholder")}
              disabled={streaming}
              maxLength={2000}
              rows={1}
              className="flex-1 min-w-0 resize-none max-h-40 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <Button type="submit" className="flex-none transition-transform active:scale-95" disabled={streaming || !input.trim()}>
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  {tPlay("input.submit")}
                </>
              )}
            </Button>
          </form>
          {/* Session 16 PM Review #2 (P-07) fix: per-turn cost preview below
              input. Reactive to NPC L3 enabled state · L3 adds ~6 credits per
              active NPC (max 3 → +18 credits). Free user with 60 credits left
              can now tell whether they have 1 turn or 3 turns remaining. */}
          {activeModel && (
            <div
              className="mt-2 se-mono"
              style={{ fontSize: 11, color: "var(--se-fg-dim)", letterSpacing: "0.04em" }}
            >
              {tPlay("input.costEstimate", {
                // 傳 storyContentRating → 成人故事顯示嘅估算包埋背景步驟用 Grok 嘅成本
                // (同 turn route reserve 一致 · 唔會顯示低咗)。
                credits: estimateTurnCredits(activeModel, activeNpcL3 ? 3 : 0, activeThinking, storyContentRating),
              })}
              {activeNpcL3 ? (
                <span style={{ marginLeft: 8, color: "var(--se-accent)" }}>
                  {tPlay("input.l3Note")}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Right rail · NPC dispositions + State panel · mobile uses tabs */}
        <div
          className={`min-h-0 overflow-y-auto lg:sticky lg:top-16 lg:self-start lg:flex lg:flex-col gap-4 lg:max-h-[calc(100vh-5rem)] ${mobileTab !== "narrative" ? "block" : "hidden lg:flex"}`}
        >
          {/* NPC cards — Hard rule #6: 4-axis disposition visible per NPC · mobile: tab="npc"
              2026-05-29 (founder #3): only show characters who've appeared in
              the narrative so far (appearedNpcs · reactive) · not all future-act
              characters at turn 1. */}
          {appearedNpcs.length > 0 && (
            <div
              className={`flex-col gap-2.5 ${mobileTab === "npc" ? "flex" : "hidden lg:flex"}`}
            >
              <div
                className="se-mono uppercase flex items-center gap-1.5"
                style={{ fontSize: 10, color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
              >
                {tPlay("rail.npcCount", { count: appearedNpcs.length })}
              </div>
              {/* 2026-05-29 · NPC L3 toggle moved to inline ChatControls
                  (above chat input · ChatGPT-style · founder rule). Rail now
                  shows just the NPC disposition cards. */}
              {appearedNpcs.map((npc) => (
                <NpcCard
                  key={npc.name}
                  name={npc.name}
                  role={npc.role}
                  axes={npc.axes}
                  hue={(npc.name.charCodeAt(0) * 13) % 360}
                />
              ))}
            </div>
          )}
          {/* Adaptive state panel · 9 atomic renderers · mobile: tab="state" */}
          <div className={mobileTab === "state" ? "block" : "hidden lg:block"}>
            <DynamicStatePanel
              schema={stateSchema}
              state={state}
              title={tPlay("rail.stateTitle", { protagonist: characterName })}
            />
          </div>
        </div>
        {/* /grid (narrative + state panel) */}
        </div>
        {/* /outer flex (sidebar + main) */}
      </div>

      {/* Phase 8 · Visualize Scene modal · per-turn image gen entry point */}
      {visualizeTurnIndex !== null && (
        <VisualizeSceneModal
          open={visualizeTurnIndex !== null}
          onClose={() => setVisualizeTurnIndex(null)}
          playthroughId={playthroughId}
          turnIndex={visualizeTurnIndex}
          storyContentRating={storyContentRating}
          storyDescription={storyDescription}
          storyDefaultStyleKey={(storyDefaultStyleKey ?? null) as StyleKey | null}
          subscriptionTier={subscriptionTier}
          currentBalance={balance}
          onGenerate={handleGenerateScene}
        />
      )}
    </div>
  );
}
