/**
 * Kieio brand logo · LOCKED per Brandbook v4 (2026-05-26).
 *
 * Renders the (o) KIEIO lockup using the brand fonts loaded in
 * app/[locale]/layout.tsx via next/font/local:
 *   - Gimbal Extended Regular = the (o) mark
 *   - Termina Bold            = the KIEIO wordmark
 *
 * Brandbook specs (from brandbook.jsx v4):
 *   - mark letter-spacing  -0.025em (PSD tracking -25)
 *   - word letter-spacing  -0.050em (PSD tracking -50)
 *   - mark/word ratio      1.35× (horizontal) · 1.60× (stacked)
 *   - gap                  0.35× wordmark size (horizontal) · 0.30× (stacked)
 *   - primary mark color   Lakers Purple #552583 (PMS 526 C)
 *   - rule                 solid fills only · NO gradients in production
 *
 * Single source of truth for the brand lockup. Use this anywhere the
 * Kieio identity needs to appear (site-header, footer, login, OG hero).
 */

import type { CSSProperties } from "react";

type MarkColor = "purple" | "white" | "charcoal";
type WordColor = "default" | "white" | "charcoal" | "purple";

const COLOR: Record<MarkColor | "default", string> = {
  purple: "#552583", // Lakers Purple primary
  white: "#ffffff",
  charcoal: "#0f0f11",
  default: "currentColor",
};

export interface KieioLogoProps {
  /** Wordmark font size in px. Mark sizes derive from this. */
  size?: number;
  /** Layout variant. */
  variant?: "horizontal" | "stacked" | "mark-only";
  /** Color of the (o) mark. */
  markColor?: MarkColor;
  /** Color of KIEIO wordmark. Default = inherit currentColor for theme adaptation. */
  wordColor?: WordColor;
  /** Optional aria-label override (defaults to "Kieio"). */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The (o) mark only — set in Gimbal Extended Regular.
 * Survives down to 16px (parens drop, lowercase o alone — see favicon).
 */
export function KieioMark({
  size = 24,
  color = "purple",
  className,
  style,
}: {
  size?: number;
  color?: MarkColor;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        fontFamily: "var(--font-gimbal), sans-serif",
        fontWeight: 400,
        fontSize: size,
        letterSpacing: "-0.025em",
        color: COLOR[color],
        lineHeight: 1,
        display: "inline-block",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      (o)
    </span>
  );
}

/**
 * The KIEIO wordmark only — set in Termina Bold.
 */
export function KieioWordmark({
  size = 16,
  color = "default",
  className,
  style,
}: {
  size?: number;
  color?: WordColor;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-termina), sans-serif",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.050em",
        color: COLOR[color === "default" ? "default" : color],
        lineHeight: 1,
        display: "inline-block",
      }}
    >
      KIEIO
    </span>
  );
}

/**
 * Full (o) KIEIO lockup — the canonical Kieio identity.
 *
 * Use defaults for header / footer. For light-on-dark surfaces, pass
 * wordColor="white". For single-ink fallback (print, monochrome
 * stamps), pass markColor="charcoal".
 */
export function KieioLogo({
  size = 16,
  variant = "horizontal",
  markColor = "purple",
  wordColor = "default",
  ariaLabel = "Kieio",
  className,
  style,
}: KieioLogoProps) {
  if (variant === "mark-only") {
    return (
      <KieioMark
        size={size * 1.35}
        color={markColor}
        className={className}
        style={style}
      />
    );
  }

  const isStacked = variant === "stacked";
  const markRatio = isStacked ? 1.6 : 1.35;
  const gap = size * (isStacked ? 0.3 : 0.35);

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: isStacked ? "column" : "row",
        alignItems: "center",
        gap,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <KieioMark size={size * markRatio} color={markColor} />
      <KieioWordmark size={size} color={wordColor} />
    </span>
  );
}
