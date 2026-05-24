import Link from "next/link";
import { Cover } from "./Cover";
import { RatingBadge, Avatar } from "./Badges";
import type { GenreKey, ContentRating } from "./genre";

/**
 * Story Card — Netflix-style · cover-dominant.
 * Cover takes ~85% of visual weight. Sparse meta line below (avatar +
 * author + play count). Rating chip floats top-right of cover.
 *
 * Hover: subtle lift (translateY -3px) · 250ms ease.
 *
 * Used in Library carousels.
 */

export interface StoryCardData {
  id: string;
  title: string;
  author?: string | null;
  /** Author hue for avatar fallback. Optional. */
  authorHue?: number;
  genre?: GenreKey | string;
  rating: ContentRating | string;
  stars: number;
  plays: number;
  href?: string;
}

export function StoryCard({ s, w = 224, locale }: { s: StoryCardData; w?: number; locale: string }) {
  const href = s.href ?? `/${locale}/library/${s.id}`;
  return (
    <Link
      href={href}
      className="flex-none flex flex-col cursor-pointer transition-transform duration-[250ms] hover:-translate-y-[3px]"
      style={{ width: w, transitionTimingFunction: "var(--se-ease)" }}
    >
      <div className="relative">
        <Cover storyId={s.id} title={s.title} genre={s.genre as GenreKey} ratio="3 / 4" size="md" />
        <div className="absolute right-2.5 top-2.5 flex gap-1.5">
          <RatingBadge rating={s.rating} />
        </div>
        <div
          className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-white"
          style={{
            background: "rgba(20,18,14,0.55)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span style={{ color: "#f4d77a", fontSize: 11 }}>★</span>
          <span className="se-mono text-[11px] font-medium">{s.stars.toFixed(1)}</span>
        </div>
      </div>
      <div
        className="mt-2.5 pl-0.5 flex items-center gap-1.5 text-[11.5px]"
        style={{ color: "var(--se-fg-muted)" }}
      >
        <Avatar name={s.author} size={16} hue={s.authorHue ?? 200} />
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{ color: "var(--se-fg-2)" }}
        >
          {s.author ?? "匿名"}
        </span>
        <span style={{ color: "var(--se-fg-faint)" }}>·</span>
        <span className="se-mono">
          {s.plays >= 1000 ? (s.plays / 1000).toFixed(1) + "k" : s.plays}
        </span>
      </div>
    </Link>
  );
}
