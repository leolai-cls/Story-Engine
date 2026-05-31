"use client";

import { useTranslations } from "next-intl";
import { AXIS_TOKEN, type DispositionAxisKey } from "./genre";

/**
 * 4-axis disposition bar — Grok-style stat readout.
 * HARD RULE #6: must be visible per NPC in Play screen.
 *
 * Backend stores axes as integers -100 to +100 in jsonb. Bar drawn from
 * center (0) → signed direction.
 */

export function DispositionAxis({
  axis,
  val,
  lastDelta,
}: {
  axis: DispositionAxisKey;
  val: number;
  /** If this axis changed last turn, render the delta inline. */
  lastDelta?: { axis: DispositionAxisKey; val: number } | null;
}) {
  // Wave 2 i18n migration (2026-05-27): label now resolved per locale.
  const tAxes = useTranslations("axes");
  const showDelta = lastDelta && lastDelta.axis === axis;
  const pct = Math.max(-100, Math.min(100, val));
  const positive = pct >= 0;
  return (
    <div className="flex items-center gap-2 text-xs" style={{ lineHeight: 1.4 }}>
      <span
        className="flex-none whitespace-nowrap"
        style={{ minWidth: 38, color: "var(--se-fg-muted)" }}
      >
        {tAxes(axis)}
      </span>
      <div
        className="relative flex-1"
        style={{
          height: 4,
          background: "var(--se-surface-2)",
          borderRadius: 2,
        }}
      >
        {/* Center marker (zero) */}
        <div
          className="absolute"
          style={{
            left: "50%",
            top: -2,
            width: 1,
            height: 8,
            background: "var(--se-border-strong)",
          }}
        />
        {/* Value bar drawn from center */}
        <div
          className="absolute top-0 h-full"
          style={{
            left: positive ? "50%" : `${50 + pct / 2}%`,
            width: `${Math.abs(pct) / 2}%`,
            background: AXIS_TOKEN[axis],
            borderRadius: 2,
          }}
        />
      </div>
      <span
        className="se-mono"
        style={{
          color: AXIS_TOKEN[axis],
          fontWeight: 500,
          width: 32,
          textAlign: "right",
        }}
      >
        {val > 0 ? "+" : ""}
        {val}
      </span>
      {showDelta && (
        <span
          className="se-mono"
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 3,
            background: "var(--se-surface-2)",
            color: AXIS_TOKEN[axis],
          }}
        >
          {lastDelta!.val > 0 ? "+" : ""}
          {lastDelta!.val}
        </span>
      )}
    </div>
  );
}

/**
 * NPC card — shows name + role + all 4 axes (Hard rule #6).
 */
export function NpcCard({
  name,
  role,
  axes,
  lastDelta,
  hue = 220,
}: {
  name: string;
  role?: string | null;
  axes: { trust: number; romance: number; respect: number; fear: number };
  lastDelta?: { axis: DispositionAxisKey; val: number } | null;
  hue?: number;
}) {
  return (
    <div
      className="p-3.5 rounded-lg flex flex-col gap-2.5"
      style={{
        background: "var(--se-surface)",
        border: "1px solid var(--se-border)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex items-center justify-center font-semibold text-white se-mono"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: `linear-gradient(135deg, oklch(0.55 0.12 ${hue}), oklch(0.42 0.14 ${hue + 30}))`,
            fontSize: 13,
          }}
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium se-cjk truncate" style={{ color: "var(--se-fg)" }}>
            {name}
          </div>
          {role && (
            <div className="text-[11px] truncate" style={{ color: "var(--se-fg-dim)" }}>
              {role}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {(["trust", "romance", "respect", "fear"] as const).map((a) => (
          <DispositionAxis key={a} axis={a} val={axes[a]} lastDelta={lastDelta} />
        ))}
      </div>
    </div>
  );
}
