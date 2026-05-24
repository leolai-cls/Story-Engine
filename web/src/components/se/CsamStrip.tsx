import { TriangleAlert } from "lucide-react";

/**
 * CSAM hard-rule reminder strip — CLAUDE.md hard rule #2.
 *
 * MUST be visible in adult mode UI regardless of toggle state (per founder
 * + legal requirement). Used in:
 *   - Library page banner (top, when adult_mode_enabled=true)
 *   - Memory Journal footer (when accessed within an adult playthrough)
 *   - Settings AdultModeBlock (always-visible last child of card)
 *   - AdultConfirmDialog (re-displayed on each enable attempt · P6-LOW-01)
 *
 * Copy is identical across placements to maintain consistent messaging.
 *
 * Variants:
 *   "banner" — Library page (top strip · full width · with detail link)
 *   "footer" — Memory Journal (bottom of layout)
 *   "card"   — Settings AdultModeBlock (embedded in card)
 */

export function CsamStrip({
  variant = "banner",
  className,
}: {
  variant?: "banner" | "footer" | "card";
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 px-6 sm:px-14 ${className ?? ""}`}
      style={{
        padding: variant === "footer" ? "8px 24px" : "10px 56px",
        background: "var(--se-danger-bg)",
        borderTop: variant === "footer" ? "1px solid oklch(0.55 0.15 25 / 0.3)" : undefined,
        borderBottom: variant !== "footer" ? "1px solid oklch(0.55 0.15 25 / 0.3)" : undefined,
        fontSize: 11.5,
        color: "var(--se-fg-2)",
        lineHeight: 1.5,
      }}
    >
      <TriangleAlert
        size={13}
        color="var(--se-danger)"
        className="mt-0.5 flex-none"
      />
      <span
        className="se-mono uppercase flex-none mr-1.5"
        style={{
          fontSize: 9.5,
          color: "var(--se-danger)",
          letterSpacing: "0.06em",
        }}
      >
        HARD RULE
      </span>
      <span className="se-cjk flex-1">
        平台嚴禁涉及未成年人士、真實人物或非法內容嘅創作。違者帳號永久停權並依法通報。
      </span>
      <a
        className="se-cjk underline ml-auto whitespace-nowrap"
        style={{ color: "var(--se-fg-muted)" }}
      >
        了解詳情
      </a>
    </div>
  );
}
