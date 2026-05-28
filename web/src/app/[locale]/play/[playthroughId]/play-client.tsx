"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Loader2, ArrowLeft, Coins, Lock, Shield, NotebookPen, Menu } from "lucide-react";
import { DynamicStatePanel } from "@/components/state-panel";
import type { StateSchema } from "@/schemas/state-schema";
import { NpcCard } from "@/components/se/DispositionAxis";
import { NpcL3Toggle } from "@/components/se/NpcL3Toggle";
import {
  PlaythroughSidebar,
  type SidebarPlaythrough,
} from "@/components/se/PlaythroughSidebar";

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
      className="mt-3 inline-flex items-center gap-2.5 p-2.5 rounded-md"
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
            <Link
              href={"/settings" as never}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              <Coins className="h-3.5 w-3.5" />
              {t("insufficientCreditsCta")}
            </Link>
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
  subscriptionTier = "free",
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
  /** Session 14: user's subscription tier · controls toggle visibility. */
  subscriptionTier?: "free" | "adventurer" | "storyteller" | "legend";
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
  // C10 audit fix · mobile 3-tab pattern (敘事 / 角色 / 狀態)
  const [mobileTab, setMobileTab] = useState<"narrative" | "npc" | "state">("narrative");
  // Sidebar mobile drawer state (desktop rail always visible)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // W2-UX-M-07: show "正在審核 + 思考..." indicator during the moderation +
  // pre-stream window. The turn route does ~500-2000ms of moderation + DB
  // setup before the first stream byte arrives. Without a hint the user
  // sees "nothing happening" and may double-click. 600ms threshold avoids
  // flashing on fast paths.
  const [showSafetyHint, setShowSafetyHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (streaming && !streamText) {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      hintTimerRef.current = setTimeout(() => setShowSafetyHint(true), 600);
    } else {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      setShowSafetyHint(false);
    }
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [streaming, streamText]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, streamText]);

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
              if (event.type === "text-delta" && typeof event.delta === "string") {
                accumulated += event.delta;
                setStreamText(accumulated);
              }
            } catch {
              // ignore non-JSON lines
            }
          }
        }

        // Finalize: append AI turn locally, clear stream buffer
        const aiTurn: Turn = {
          role: "ai",
          text: accumulated,
          index: tempUserTurn.index + 1,
        };
        setTurns((t) => [...t, aiTurn]);
        setStreamText("");

        // Refresh state from server (delta was applied server-side)
        await refreshState();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStreamText("");
        // Roll back optimistic user turn
        setTurns((t) => t.filter((x) => x !== tempUserTurn));
      } finally {
        setStreaming(false);
      }
    },
    [playthroughId, refreshState, streaming, turns],
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
            { id: "npc", label: tPlay("tabs.npc", { count: npcs.length }) },
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
        <div className="flex-1 mx-auto max-w-[1520px] w-full px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 min-h-0">
        {/* Narrative + input · mobile: only when tab="narrative" */}
        <div className={`flex-col min-h-0 ${mobileTab === "narrative" ? "flex" : "hidden lg:flex"}`}>
          <div className="text-xs text-muted-foreground mb-2 line-clamp-1">
            {storyDescription}
          </div>

          {/* Turn history */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card/30 p-4 space-y-4 min-h-[400px]"
          >
            {turns.map((turn) => {
              // C6 audit fix · Hard rule #4: Director re-interpreted player
              // action — backend exposes verdict on turns.director_verdict
              // (jsonb). 'reject' or 'allow_with_constraint' means the AI
              // diverged from literal player intent. Render subtle amber
              // side-border + tooltip 「NPC 反應與你預期不同」(no system
              // jargon per designer spec).
              const isSoftDirector =
                turn.role === "ai" &&
                turn.directorVerdict?.verdict &&
                turn.directorVerdict.verdict !== "allow" &&
                turn.directorVerdict.verdict !== "require_skill_check";
              return (
                <div
                  key={turn.index}
                  title={isSoftDirector ? tPlay("turn.directorSoftTooltip") : undefined}
                  className={
                    turn.role === "user"
                      ? "rounded-lg bg-primary/8 border border-primary/20 p-3"
                      : "rounded-lg bg-card border border-border/40 p-4 leading-relaxed"
                  }
                  style={
                    isSoftDirector
                      ? {
                          borderLeft: "2px solid var(--se-warn)",
                          paddingLeft: 16,
                        }
                      : undefined
                  }
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {turn.role === "user"
                      ? tPlay("turn.userBadge", { protagonist: characterName })
                      : tPlay("turn.aiBadge")}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{turn.text}</div>
                  {/* C5a-d audit fix · Skill check 4 outcomes inline badge.
                      Backend rolls + stores on turns.skill_check. Hard rule #5:
                      PERMANENT · no retry · 4 outcomes (crit success / success
                      / failure / crit failure). */}
                  {turn.skillCheck && <SkillCheckInline check={turn.skillCheck} />}
                </div>
              );
            })}

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

            {streaming && !streamText && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {!showSafetyHint && tPlay("turn.aiThinking")}
              </div>
            )}
            {/* C3 audit fix · floating moderation pill chip after 600ms safety hint */}
            {streaming && !streamText && showSafetyHint && (
              <div
                className="fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-3"
                style={{
                  bottom: 120,
                  padding: "12px 18px",
                  borderRadius: 999,
                  background: "var(--se-surface)",
                  border: "1px solid var(--se-border-strong)",
                  boxShadow: "var(--se-shadow-pop)",
                  fontSize: 13,
                  color: "var(--se-fg-2)",
                }}
              >
                <span
                  className="inline-flex items-center justify-center"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: "var(--se-ok-bg)",
                  }}
                >
                  <Shield size={12} color="var(--se-ok)" />
                </span>
                <span className="se-cjk">{tPlay("turn.moderationPending")}</span>
              </div>
            )}

            {error && (
              <PlayErrorCard error={error} />
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendAction(input);
            }}
            className="mt-3 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={tPlay("input.placeholder")}
              disabled={streaming}
              maxLength={2000}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <Button type="submit" disabled={streaming || !input.trim()}>
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
        </div>

        {/* Right rail · NPC dispositions + State panel · mobile uses tabs */}
        <div
          className={`lg:sticky lg:top-16 lg:self-start lg:flex lg:flex-col gap-4 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto ${mobileTab !== "narrative" ? "block" : "hidden lg:flex"}`}
        >
          {/* NPC cards — Hard rule #6: 4-axis disposition visible per NPC · mobile: tab="npc" */}
          {npcs.length > 0 && (
            <div
              className={`flex-col gap-2.5 ${mobileTab === "npc" ? "flex" : "hidden lg:flex"}`}
            >
              <div
                className="se-mono uppercase flex items-center gap-1.5"
                style={{ fontSize: 10, color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
              >
                {tPlay("rail.npcCount", { count: npcs.length })}
              </div>
              {/* Session 14 · NPC L3 opt-in toggle (Storyteller tier only · button-click per founder Q4) */}
              <NpcL3Toggle
                playthroughId={playthroughId}
                initialEnabled={npcL3Enabled}
                subscriptionTier={subscriptionTier}
              />
              {npcs.map((npc) => (
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
    </div>
  );
}
