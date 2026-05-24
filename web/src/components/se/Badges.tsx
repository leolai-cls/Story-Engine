import { GENRE, RATING_LABEL, type GenreKey, type ContentRating } from "./genre";
import { Heart, Swords, GraduationCap, Sparkles, Trophy, Search, BookOpen, Flame } from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  Heart, Swords, GraduationCap, Sparkles, Trophy, Search, BookOpen, Flame,
};

/**
 * Genre chip — small CJK label + icon · color-tinted by genre hue.
 * Used on Story Card overlay, Story Detail hero, Library filter rail.
 */
export function GenreChip({
  genre,
  size = "sm",
}: {
  genre: GenreKey | string;
  size?: "sm" | "md";
}) {
  const g = (GENRE as Record<string, { label: string; icon: string; hue: number }>)[genre] ?? {
    label: genre,
    icon: "BookOpen",
    hue: 240,
  };
  const Ico = ICONS[g.icon] ?? BookOpen;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full whitespace-nowrap se-cjk"
      style={{
        fontSize: size === "sm" ? 11 : 12,
        padding: size === "sm" ? "3px 9px" : "4px 11px",
        background: `oklch(0.94 0.04 ${g.hue} / 0.55)`,
        color: `oklch(0.30 0.13 ${g.hue})`,
        border: `1px solid oklch(0.55 0.10 ${g.hue} / 0.25)`,
      }}
    >
      <Ico size={size === "sm" ? 10 : 11} />
      {g.label}
    </span>
  );
}

/**
 * Content rating badge — mono uppercase · semantic-colored.
 */
export function RatingBadge({ rating }: { rating: ContentRating | string }) {
  const cfg = (
    {
      general: { label: "一般", fg: "var(--se-fg-muted)", bg: "var(--se-surface-2)" },
      pg13: { label: "PG-13", fg: "var(--se-fg-muted)", bg: "var(--se-surface-2)" },
      mature: { label: "成熟", fg: "var(--se-warn)", bg: "var(--se-warn-bg)" },
      adult: { label: "18+", fg: "var(--se-danger)", bg: "var(--se-danger-bg)" },
    } as Record<string, { label: string; fg: string; bg: string }>
  )[rating] ?? { label: rating, fg: "var(--se-fg-muted)", bg: "var(--se-surface-2)" };
  return (
    <span
      className="inline-flex items-center se-mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.05em",
        padding: "2px 6px",
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.fg,
      }}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Stars — read-only display · gold-filled · with optional count.
 */
export function Stars({
  value,
  count,
  size = 11,
}: {
  value: number;
  count?: number;
  size?: number;
}) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1 text-[color:var(--se-fg-muted)]">
      <span className="inline-flex" style={{ color: "oklch(0.78 0.13 80)", gap: 1 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ fontSize: size }}>
            {i <= filled ? "★" : "☆"}
          </span>
        ))}
      </span>
      <span className="se-mono text-[11px]">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="se-mono text-[11px] text-[color:var(--se-fg-dim)]">
          · {count.toLocaleString()}
        </span>
      )}
    </span>
  );
}

/**
 * Avatar — initial letter circle · color from hue.
 */
export function Avatar({
  name,
  size = 20,
  hue = 200,
}: {
  name?: string | null;
  size?: number;
  hue?: number;
}) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="inline-flex items-center justify-center font-semibold se-mono"
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: "50%",
        background: `linear-gradient(135deg, oklch(0.55 0.12 ${hue}), oklch(0.42 0.14 ${hue + 30}))`,
        color: "#fff",
        fontSize: size * 0.45,
        letterSpacing: "-0.02em",
        border: "1px solid var(--se-border)",
      }}
    >
      {initial}
    </span>
  );
}
