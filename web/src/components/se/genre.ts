/**
 * Story Engine — Genre catalog
 * Used by GenreChip, Cover gradient generation, Library filter rail.
 * Hue values drive cover placeholder gradients + chip tints.
 *
 * Wave 2 i18n migration (2026-05-27): labels were hardcoded 繁中
 * ("戀愛" / "冒險" etc.). Now: keys + icons + hues only; labels resolve via
 * next-intl catalog `genres.*` / `ratings.*` / `axes.*`. Use the helpers
 * `genreLabel(key, t)` / `ratingLabel(key, t)` / `axisLabel(key, t)` or
 * call `useTranslations("genres")` directly at the render site.
 */

export type GenreKey =
  | "romance"
  | "adventure"
  | "campus"
  | "fantasy"
  | "sports"
  | "mystery"
  | "slice"
  | "horror";

export type GenreMeta = {
  /**
   * @deprecated Wave 2 i18n migration — read label from i18n catalog instead
   * (`t(\`genres.\${key}\`)`). This field is kept for fallback only and now
   * always holds the 繁中 label; do NOT rely on it from new code.
   */
  label: string;
  icon: string; // lucide-react icon name
  hue: number; // OKLCH hue 0-360 for placeholder gradient
};

export const GENRE: Record<GenreKey, GenreMeta> = {
  romance: { label: "戀愛", icon: "Heart", hue: 0 },
  adventure: { label: "冒險", icon: "Swords", hue: 30 },
  campus: { label: "校園", icon: "GraduationCap", hue: 80 },
  fantasy: { label: "奇幻", icon: "Sparkles", hue: 290 },
  sports: { label: "運動", icon: "Trophy", hue: 160 },
  mystery: { label: "懸疑", icon: "Search", hue: 240 },
  slice: { label: "日常", icon: "BookOpen", hue: 200 },
  horror: { label: "恐怖", icon: "Flame", hue: 350 },
};

export type ContentRating = "general" | "pg13" | "mature" | "adult";

/**
 * @deprecated Wave 2 i18n migration — read from i18n catalog
 * `t(\`ratings.\${key}\`)`. Kept for fallback only; always 繁中.
 */
export const RATING_LABEL: Record<ContentRating, string> = {
  general: "一般",
  pg13: "PG-13",
  mature: "成熟",
  adult: "18+",
};

export type DispositionAxisKey = "trust" | "romance" | "respect" | "fear";

/**
 * @deprecated Wave 2 i18n migration — read from i18n catalog
 * `t(\`axes.\${key}\`)`. Kept for fallback only; always 繁中.
 */
export const AXIS_LABEL: Record<DispositionAxisKey, string> = {
  trust: "信任",
  romance: "戀慕",
  respect: "敬重",
  fear: "懼怕",
};

export const AXIS_TOKEN: Record<DispositionAxisKey, string> = {
  trust: "var(--se-axis-trust)",
  romance: "var(--se-axis-romance)",
  respect: "var(--se-axis-respect)",
  fear: "var(--se-axis-fear)",
};

// ─── i18n helpers ───────────────────────────────────────────────────────
// Use these from server/client components instead of reading `.label` off
// the constants. The `t` param is the next-intl translator function bound
// to the appropriate namespace ("genres" / "ratings" / "axes").

export function genreLabel(
  key: GenreKey,
  t: (k: GenreKey) => string,
): string {
  return t(key);
}
export function ratingLabel(
  key: ContentRating,
  t: (k: ContentRating) => string,
): string {
  return t(key);
}
export function axisLabel(
  key: DispositionAxisKey,
  t: (k: DispositionAxisKey) => string,
): string {
  return t(key);
}
