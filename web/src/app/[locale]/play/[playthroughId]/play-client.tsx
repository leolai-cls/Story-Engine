"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Loader2, ArrowLeft, Coins, Lock, Shield } from "lucide-react";
import { DynamicStatePanel } from "@/components/state-panel";
import type { StateSchema } from "@/schemas/state-schema";

/**
 * AUDIT FIX (P3-UX-M-13): friendly UX for credit / tier errors.
 * Parses prefixed error strings into actionable cards with Settings link.
 */
function PlayErrorCard({ error }: { error: string }) {
  if (error.startsWith("INSUFFICIENT_CREDITS:")) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-start gap-3">
          <Coins className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-100">
              Credit 唔夠
            </div>
            <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              {error.replace("INSUFFICIENT_CREDITS:", "")}
            </div>
            <Link
              href={"/settings" as never}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              <Coins className="h-3.5 w-3.5" />
              去 Settings 升級 / Top-up
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
              Model 需要升級 tier
            </div>
            <div className="mt-1 text-xs text-rose-800 dark:text-rose-200">
              {error.replace("MODEL_TIER:", "")}
            </div>
            <Link
              href={"/settings" as never}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              去 Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }
  // W2-UX-H-03 fix: turn moderation returns 400 with action_blocked.
  // Previously the raw JSON body flowed through to the default branch.
  // Now play-client throws "ACTION_BLOCKED:..." prefix → friendly card.
  if (error.startsWith("ACTION_BLOCKED:")) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
          <div className="flex-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-100">
              內容審核：呢個 action 過唔到
            </div>
            <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              {error.replace("ACTION_BLOCKED:", "")}
            </div>
            <div className="mt-2 text-[11px] text-amber-700/80 dark:text-amber-300/80">
              試下換個方式描述你嘅行動，或者調整劇情走向。
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

type Turn = {
  role: "user" | "ai";
  text: string;
  index: number;
};

export function PlayClient({
  playthroughId,
  storyTitle,
  storyDescription,
  stateSchema,
  initialState,
  initialTurns,
  characterName,
}: {
  playthroughId: string;
  storyTitle: string;
  storyDescription: string;
  stateSchema: StateSchema;
  initialState: Record<string, unknown>;
  initialTurns: Turn[];
  characterName: string;
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [state, setState] = useState<Record<string, unknown>>(initialState);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
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
          // AUDIT FIX (P3-UX-M-13): friendly UX for credit / tier errors.
          // Previously threw raw JSON / HTTP text into the error box.
          if (res.status === 402) {
            const body = await res.json().catch(() => null);
            const currentBalance = body?.currentBalance ?? "?";
            const estimatedCost = body?.estimatedCost ?? "?";
            throw new Error(
              `INSUFFICIENT_CREDITS:Credit 唔夠（剩 ${currentBalance}，需要約 ${estimatedCost}）。去 Settings 升級或 top-up。`,
            );
          }
          if (res.status === 403) {
            const body = await res.json().catch(() => null);
            if (body?.error === "model_tier_required") {
              throw new Error(
                `MODEL_TIER:你嘅 tier (${body.currentTier ?? "?"}) 唔可以用 ${body.modelId ?? "呢個 model"}。去 Settings 揀其他 model 或升級。`,
              );
            }
          }
          // W2-UX-H-03 fix (Phase 5 Wave 2.5 audit): 400 action_blocked from
          // turn moderation. Friendly Shield card instead of raw JSON dump.
          if (res.status === 400) {
            const body = await res.json().catch(() => null);
            if (body?.error === "action_blocked" && body?.message) {
              throw new Error(`ACTION_BLOCKED:${body.message}`);
            }
          }
          if (res.status === 503) {
            const body = await res.json().catch(() => null);
            if (body?.error === "moderation_misconfigured") {
              throw new Error(
                body.message ?? "內容審核系統設定問題，請稍後再試。",
              );
            }
          }
          const errBody = await res.text();
          throw new Error(errBody || `HTTP ${res.status}`);
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
      {/* Slim header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 h-12 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/library" />}
            className="text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </Button>
          <div className="flex items-center gap-2 font-bold text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="truncate max-w-[300px]">{storyTitle}</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            玩緊：<span className="font-medium text-foreground">{characterName}</span>
          </div>
        </div>
      </header>

      {/* Two-column layout: narrative left, state panel right */}
      <div className="flex-1 container mx-auto max-w-7xl px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 min-h-0">
        {/* Narrative + input */}
        <div className="flex flex-col min-h-0">
          <div className="text-xs text-muted-foreground mb-2 line-clamp-1">
            {storyDescription}
          </div>

          {/* Turn history */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card/30 p-4 space-y-4 min-h-[400px]"
          >
            {turns.map((turn) => (
              <div
                key={turn.index}
                className={
                  turn.role === "user"
                    ? "rounded-lg bg-primary/8 border border-primary/20 p-3"
                    : "rounded-lg bg-card border border-border/40 p-4 leading-relaxed"
                }
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {turn.role === "user" ? `→ ${characterName}` : "↳ 敘事"}
                </div>
                <div className="text-sm whitespace-pre-wrap">{turn.text}</div>
              </div>
            ))}

            {streaming && streamText && (
              <div className="rounded-lg bg-card border border-primary/30 p-4 leading-relaxed">
                <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">
                  ↳ 敘事 (打緊...)
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
                {showSafetyHint ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    內容審核 + AI 思考中...
                  </span>
                ) : (
                  "AI 諗緊..."
                )}
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
              placeholder="你想做咩？（描述行動、對白、決定…）"
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
                  行動
                </>
              )}
            </Button>
          </form>
        </div>

        {/* State panel */}
        <div className="lg:sticky lg:top-16 lg:self-start">
          <DynamicStatePanel
            schema={stateSchema}
            state={state}
            title={`${characterName} 嘅狀態`}
          />
        </div>
      </div>
    </div>
  );
}
