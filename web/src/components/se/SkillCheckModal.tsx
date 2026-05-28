"use client";

import { Sparkles, Info } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * C4-C5 audit fix · Skill check modal system (Hard rule #5: PERMANENT · no retry).
 *
 * 5 variants:
 *   - rolling (擲骰中 · pre-reveal suspense)
 *   - critical_success (NAT 20 · violet accent · sparkle)
 *   - success (ok-green)
 *   - failure (danger-red)
 *   - critical_failure (NAT 1 · danger + dramatic shadow ring)
 *
 * Triggered when most-recent turn has skill_check present. Modal overlay
 * displays the d20 result · permanent consequences · forces user to live
 * with outcome (no retry button per Hard rule #5).
 */

export type SkillCheckOutcome = "critical_success" | "success" | "failure" | "critical_failure";

/**
 * Wave 2 i18n migration (2026-05-27): outcome labels are now resolved via
 * `skillCheck.outcomes.*` catalog. The constants here keep only visual style.
 * `stamp` is uppercase canonical English (consistent visual identity across
 * locales — mono badge stays English-uppercase).
 */
const OUTCOME_CFG: Record<SkillCheckOutcome, {
  stamp: string;
  color: string;
  bg: string;
  line: string;
  sparkle: boolean;
  dramatic: boolean;
}> = {
  critical_success: {
    stamp: "CRITICAL SUCCESS",
    color: "var(--se-accent)",
    bg: "var(--se-accent-bg)",
    line: "var(--se-accent-line)",
    sparkle: true,
    dramatic: false,
  },
  success: {
    stamp: "SUCCESS",
    color: "var(--se-ok)",
    bg: "var(--se-ok-bg)",
    line: "oklch(0.55 0.13 160 / 0.4)",
    sparkle: false,
    dramatic: false,
  },
  failure: {
    stamp: "FAILURE",
    color: "var(--se-danger)",
    bg: "var(--se-danger-bg)",
    line: "var(--se-danger)",
    sparkle: false,
    dramatic: false,
  },
  critical_failure: {
    stamp: "CRITICAL FAILURE",
    color: "var(--se-danger)",
    bg: "var(--se-danger-bg)",
    line: "var(--se-danger)",
    sparkle: false,
    dramatic: true,
  },
};

/**
 * Rolling modal — pre-reveal suspense (擲骰中).
 * Backend skill check is deterministic but UI plays ~600-800ms shake animation
 * before showing result · designer's「Skill check · 擲骰中」moment.
 */
export function SkillCheckRolling({
  skillName,
  skillValue,
  difficulty,
  npcName,
  onSettle,
}: {
  skillName: string;
  skillValue: number;
  difficulty: number;
  npcName?: string;
  onSettle?: () => void;
}) {
  const t = useTranslations("skillCheck");
  return (
    <ModalShell>
      <div
        className="w-[520px] p-8 rounded-2xl text-center"
        style={{
          background: "var(--se-surface)",
          border: "1px solid var(--se-border-strong)",
          boxShadow: "var(--se-shadow-modal)",
        }}
      >
        <span
          className="se-mono uppercase"
          style={{
            fontSize: 11,
            color: "var(--se-accent)",
            letterSpacing: "0.06em",
          }}
        >
          {t("rolling")}
        </span>
        <h2
          className="mt-3 mb-1 se-cjk"
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "var(--se-fg)",
          }}
        >
          {skillName}
          {npcName && ` · ${npcName}`}
        </h2>
        <p
          className="m-0 text-sm se-cjk"
          style={{ color: "var(--se-fg-muted)" }}
        >
          {t("vsLabel", { skill: skillName, value: skillValue, difficulty })}
        </p>

        {/* Dice display */}
        <div className="my-7 flex items-center justify-center gap-4.5">
          <div
            className="relative inline-flex flex-col items-center justify-center"
            style={{
              width: 78,
              height: 78,
              borderRadius: 14,
              background: "var(--se-surface-2)",
              border: "1px solid var(--se-border-strong)",
              animation: "se-dice-shake 0.18s steps(2, end) infinite",
            }}
          >
            <svg width={36} height={36} viewBox="0 0 16 16" fill="none" stroke="var(--se-fg-2)" strokeWidth={1.2}>
              <rect x={2} y={2} width={12} height={12} rx={2} />
              <circle cx={5.5} cy={5.5} r={0.8} fill="currentColor" />
              <circle cx={10.5} cy={10.5} r={0.8} fill="currentColor" />
              <circle cx={10.5} cy={5.5} r={0.8} fill="currentColor" />
              <circle cx={5.5} cy={10.5} r={0.8} fill="currentColor" />
            </svg>
            <span
              className="se-mono absolute"
              style={{
                bottom: -22,
                left: 0,
                right: 0,
                fontSize: 11,
                color: "var(--se-fg-dim)",
              }}
            >
              d20
            </span>
          </div>
          <span style={{ fontSize: 24, color: "var(--se-fg-dim)" }}>+</span>
          <div
            className="inline-flex flex-col items-center justify-center"
            style={{
              width: 78,
              height: 78,
              borderRadius: 14,
              background: "var(--se-surface-2)",
              border: "1px solid var(--se-border)",
            }}
          >
            <span
              className="se-mono"
              style={{ fontSize: 32, color: "var(--se-fg)", lineHeight: 1 }}
            >
              {skillValue}
            </span>
            <span
              className="se-cjk"
              style={{ fontSize: 10, color: "var(--se-fg-dim)", marginTop: 2 }}
            >
              {skillName}
            </span>
          </div>
          <span style={{ fontSize: 24, color: "var(--se-fg-dim)" }}>vs</span>
          <div
            className="inline-flex flex-col items-center justify-center"
            style={{
              width: 78,
              height: 78,
              borderRadius: 14,
              background: "var(--se-warn-bg)",
              border: "1px solid var(--se-warn)",
            }}
          >
            <span
              className="se-mono"
              style={{ fontSize: 32, color: "var(--se-warn)", lineHeight: 1 }}
            >
              {difficulty}
            </span>
            <span
              className="se-cjk"
              style={{ fontSize: 10, color: "var(--se-fg-dim)", marginTop: 2 }}
            >
              {t("difficultyLabel")}
            </span>
          </div>
        </div>

        <p
          className="m-0 text-sm se-cjk"
          style={{ color: "var(--se-fg-muted)" }}
        >
          {t("willTheyBudge", { target: npcName ?? t("opponent") })}
        </p>

        {/* Auto-settle if onSettle provided */}
        {onSettle && (
          <button
            type="button"
            onClick={onSettle}
            className="mt-6 text-xs se-cjk"
            style={{ color: "var(--se-fg-muted)", textDecoration: "underline" }}
          >
            {t("reveal")}
          </button>
        )}
        <style>{`@keyframes se-dice-shake { 0% { transform: rotate(-3deg) } 100% { transform: rotate(3deg) } }`}</style>
      </div>
    </ModalShell>
  );
}

/**
 * Outcome reveal modal — one of 4 variants based on backend result.
 * Hard rule #5: NO retry button · only「繼續」CTA. Cost shown before button
 * so player sees the price BEFORE acknowledging.
 */
export function SkillCheckResult({
  outcome,
  dice,
  skill,
  difficulty,
  title,
  body,
  aftermath,
  onContinue,
}: {
  outcome: SkillCheckOutcome;
  dice: number;
  skill: number;
  difficulty: number;
  /** AI-rendered title (e.g.「阿薇縮埋身，瞪住你」). */
  title: string;
  /** AI-rendered narrative body (in-fiction consequence). */
  body: string;
  /** Disposition / state changes · permanent · shown as receipt. */
  aftermath: Array<{ target: string; axis: string; val: number; label: string }>;
  onContinue: () => void;
}) {
  const t = useTranslations("skillCheck");
  const cfg = OUTCOME_CFG[outcome];
  const natBadge =
    dice === 20
      ? { label: "NAT 20", bg: "var(--se-accent)" }
      : dice === 1
        ? { label: "NAT 1", bg: "var(--se-danger)" }
        : null;
  const total = dice + skill;

  return (
    <ModalShell>
      <div
        className="w-[580px] p-7 rounded-2xl"
        style={{
          background: "var(--se-surface)",
          border: `1px solid ${cfg.line}`,
          boxShadow: cfg.dramatic
            ? "0 0 0 4px var(--se-danger-bg), var(--se-shadow-modal)"
            : "var(--se-shadow-modal)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4.5">
          <span
            className="se-mono uppercase inline-flex items-center gap-1.5"
            style={{
              fontSize: 11,
              color: cfg.color,
              letterSpacing: "0.04em",
            }}
          >
            {cfg.sparkle && <Sparkles size={12} />}
            {t("stampSuffix", { stamp: cfg.stamp })}
          </span>
          <span
            className="se-mono"
            style={{ fontSize: 11, color: "var(--se-fg-dim)" }}
            title={t("permanentTooltip")}
          >
            {t("permanent")}
          </span>
        </div>

        {/* Dice result */}
        <div className="flex items-center justify-center gap-3.5 mb-5.5">
          <div
            className="relative inline-flex flex-col items-center justify-center"
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              background: "var(--se-surface-2)",
              border: "1px solid var(--se-border-strong)",
            }}
          >
            <span
              className="se-mono"
              style={{ fontSize: 28, color: "var(--se-fg-2)", lineHeight: 1 }}
            >
              {dice}
            </span>
            {natBadge && (
              <span
                className="se-mono absolute"
                style={{
                  top: -8,
                  right: -8,
                  fontSize: 9.5,
                  padding: "2px 5px",
                  borderRadius: 3,
                  background: natBadge.bg,
                  color: "#fff",
                }}
              >
                {natBadge.label}
              </span>
            )}
            <span
              style={{ fontSize: 9, color: "var(--se-fg-dim)", marginTop: 2 }}
            >
              d20
            </span>
          </div>
          <span
            className="se-mono"
            style={{ fontSize: 16, color: "var(--se-fg-dim)" }}
          >
            + {skill} =
          </span>
          <div
            className="inline-flex flex-col items-center justify-center"
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              background: cfg.bg,
              border: `1px solid ${cfg.color}`,
            }}
          >
            <span
              className="se-mono"
              style={{ fontSize: 24, color: cfg.color, lineHeight: 1 }}
            >
              {total}
            </span>
            <span
              style={{ fontSize: 9, color: "var(--se-fg-dim)", marginTop: 2 }}
            >
              vs {difficulty}
            </span>
          </div>
        </div>

        {/* In-fiction narrative title + body */}
        <h3
          className="m-0 se-cjk"
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "var(--se-fg)",
          }}
        >
          {title}
        </h3>
        <p
          className="m-0 mt-2.5 se-cjk"
          style={{
            fontSize: 15,
            lineHeight: 1.8,
            color: "var(--se-fg-2)",
            whiteSpace: "pre-wrap",
          }}
        >
          {body}
        </p>

        {/* Cost · price of result shown BEFORE continue button (Hard rule #5) */}
        {aftermath.length > 0 && (
          <div
            className="mt-5 p-3 rounded-lg flex flex-col gap-1.5"
            style={{ background: "var(--se-surface-2)" }}
          >
            <div
              className="se-mono uppercase"
              style={{
                fontSize: 10,
                color: "var(--se-fg-dim)",
                letterSpacing: "0.06em",
              }}
            >
              {t("consequencesHeader")}
            </div>
            {aftermath.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span style={{ color: "var(--se-fg-2)", width: 50 }}>{d.target}</span>
                <span
                  className="se-mono"
                  style={{ color: `var(--se-axis-${d.axis})` }}
                >
                  {d.label} {d.val > 0 ? "+" : ""}{d.val}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* NO RETRY BUTTON — Hard Rule #5 */}
        <div className="flex items-center gap-3 mt-5">
          <span
            className="flex-1 inline-flex items-center gap-1.5 text-[11.5px] se-cjk"
            style={{ color: "var(--se-fg-dim)" }}
          >
            <Info size={11} />
            {t("writtenFooter")}
          </span>
          <button
            type="button"
            onClick={onContinue}
            className="px-5 h-9 rounded-md text-sm font-medium se-cjk"
            style={{
              background: "var(--se-fg)",
              color: "var(--se-bg)",
            }}
          >
            {t("continue")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "var(--se-overlay)",
        backdropFilter: "blur(8px)",
      }}
    >
      {children}
    </div>
  );
}
