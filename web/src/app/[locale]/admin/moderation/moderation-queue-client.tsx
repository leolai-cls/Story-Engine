"use client";

import { useState, useTransition } from "react";
import { Shield, AlertTriangle, Check, X, EyeOff, FileText, MessageSquare } from "lucide-react";
import { processModerationFlag } from "./actions";

type ModerationFlag = {
  id: string;
  content_type: string;
  content_id: string;
  reporter_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  snippet: string;
  ownerName: string | null;
};

const REASON_LABEL: Record<string, string> = {
  csam: "CSAM (sexual content involving minors)",
  sexual_minor: "Implied sexual content · minors",
  hate: "Hate speech",
  harassment: "Harassment",
  illegal: "Illegal content",
  spam: "Spam",
  other: "Other",
};

const REASON_SEVERITY: Record<string, "crit" | "high" | "med"> = {
  csam: "crit",
  sexual_minor: "crit",
  illegal: "crit",
  hate: "high",
  harassment: "high",
  spam: "med",
  other: "med",
};

export function ModerationQueueClient({
  flags,
  stats,
}: {
  flags: ModerationFlag[];
  stats: { pending: number; total: number };
}) {
  const [pending, startTransition] = useTransition();
  const [pendingFlagId, setPendingFlagId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "crit" | "high" | "med">("all");

  function handleAction(
    flagId: string,
    action: "approve" | "dismiss" | "soft_delete",
  ) {
    setError(null);
    setPendingFlagId(flagId);
    startTransition(async () => {
      const res = await processModerationFlag(flagId, action);
      if (!res.ok) {
        setError(`Action failed: ${res.error}`);
      }
      setPendingFlagId(null);
    });
  }

  const filtered = flags.filter(
    (f) => filter === "all" || REASON_SEVERITY[f.reason] === filter,
  );

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="h-6 w-6 text-rose-600" />
        <h1 className="text-2xl font-bold">Moderation Queue</h1>
        <span className="ml-auto text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Admin · {stats.pending} pending / {stats.total} total
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Review user reports. Approve = content reviewed, stays online (warning
        issued). Dismiss = report unfounded. Soft-delete = hide content (audit
        trail preserved · reversible).
      </p>

      {/* Filter chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["all", "crit", "high", "med"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === f
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-accent"
            }`}
          >
            {f === "all"
              ? `All (${flags.length})`
              : f === "crit"
                ? `🔴 Critical (${flags.filter((x) => REASON_SEVERITY[x.reason] === "crit").length})`
                : f === "high"
                  ? `🟠 High (${flags.filter((x) => REASON_SEVERITY[x.reason] === "high").length})`
                  : `🟡 Med (${flags.filter((x) => REASON_SEVERITY[x.reason] === "med").length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          <Check className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
          <div className="text-sm font-medium">No pending reports in this filter.</div>
          <div className="text-xs mt-1">Queue is clean.</div>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((flag) => {
          const sev = REASON_SEVERITY[flag.reason] ?? "med";
          const isPending = pendingFlagId === flag.id;
          return (
            <div
              key={flag.id}
              className={`rounded-lg border p-5 ${
                sev === "crit"
                  ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
                  : sev === "high"
                    ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                    : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {sev === "crit" && <AlertTriangle className="h-5 w-5 flex-shrink-0 text-rose-600" />}
                  {flag.content_type === "story" ? (
                    <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <MessageSquare className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      {flag.content_type} · {REASON_LABEL[flag.reason] ?? flag.reason}
                    </div>
                    <div className="text-sm font-medium break-words">{flag.snippet}</div>
                    {flag.details && (
                      <div className="mt-2 text-xs text-muted-foreground italic">
                        Reporter said: <q>{flag.details}</q>
                      </div>
                    )}
                    <div className="mt-2 text-[10.5px] font-mono text-muted-foreground">
                      flag={flag.id.slice(0, 8)} · content={flag.content_id.slice(0, 8)} ·
                      {flag.ownerName ? ` owner=${flag.ownerName}` : " owner=?"} ·{" "}
                      {new Date(flag.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-border/50">
                <button
                  onClick={() => handleAction(flag.id, "soft_delete")}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  {isPending ? "..." : "Hide content"}
                </button>
                <button
                  onClick={() => handleAction(flag.id, "approve")}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  Reviewed · keep
                </button>
                <button
                  onClick={() => handleAction(flag.id, "dismiss")}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Dismiss · unfounded
                </button>
                <span className="ml-auto self-center text-[10px] font-mono uppercase text-muted-foreground">
                  Reporter: {flag.reporter_id?.slice(0, 8) ?? "anonymous"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
