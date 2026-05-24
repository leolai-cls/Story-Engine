import { GENRE, type GenreKey } from "./genre";

/**
 * Story Engine — Cover placeholder
 * Used when story has no cover_image_url yet. Hue from story id (stable
 * pseudo-variation) or genre (if provided). Striped gradient + small mono
 * label. Genre icon overlaid faintly for visual variety.
 *
 * 3:4 aspect ratio default (Netflix card pattern). Can be overridden to
 * "auto" for hero full-bleed use.
 */

export interface CoverProps {
  storyId?: string | null;
  title?: string | null;
  genre?: GenreKey | null;
  /** Override the hue (0-360). Otherwise derived from genre or storyId. */
  hue?: number;
  /** "3 / 4" (default · Netflix card), "1 / 1", or "auto" (hero full-bleed). */
  ratio?: string;
  /** "sm" → 6px radius; "md" → 8px; "lg" → 12px; "none" → 0. */
  size?: "sm" | "md" | "lg" | "none";
  /** Hide the bottom mono tag label. */
  noLabel?: boolean;
  /** Optional override of the bottom mono tag. */
  tag?: string;
  className?: string;
  style?: React.CSSProperties;
}

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

export function Cover({
  storyId,
  title,
  genre,
  hue,
  ratio = "3 / 4",
  size = "md",
  noLabel = false,
  tag,
  className,
  style,
}: CoverProps) {
  const resolvedHue =
    typeof hue === "number"
      ? hue
      : genre && GENRE[genre]
        ? GENRE[genre].hue
        : storyId
          ? hueFromId(storyId)
          : 270;
  const radius =
    size === "none" ? 0 : size === "sm" ? 6 : size === "lg" ? 12 : 8;
  const labelText =
    tag ?? (storyId ? storyId.slice(0, 8).toUpperCase() : "COVER");
  return (
    <div
      className={`se-placeholder-cover ${className ?? ""}`}
      data-tag={noLabel ? "" : labelText}
      title={title ?? undefined}
      style={{
        aspectRatio: ratio === "auto" ? undefined : ratio,
        borderRadius: radius,
        width: "100%",
        background: `
          repeating-linear-gradient(135deg,
            rgba(255,255,255,0.04) 0 14px,
            rgba(255,255,255,0.08) 14px 28px),
          linear-gradient(180deg,
            oklch(0.32 0.13 ${resolvedHue}),
            oklch(0.18 0.10 ${resolvedHue}))`,
        border: "1px solid var(--se-border)",
        ...style,
      }}
    />
  );
}
