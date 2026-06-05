import { z } from "zod";

/**
 * Game system declaration — the per-story 「藍圖」 (pm/architecture/05).
 *
 * Generated once at story creation (alongside the state_schema · same
 * AI-decides-per-story spirit as the panel). Declares what mechanics this story
 * has, so the runtime can decide whether to enable dice (②) / quest tracking (③)
 * for THIS story — D&D rolls dice, a pure romance does not.
 *
 * Kept deliberately tiny + runtime-agnostic (works for whichever dice-trigger
 * approach the founder picks):
 *   - mechanic: the headline mechanic class.
 *   - objectives: 0-5 opening quest lines (③) · empty for pure narrative.
 *
 * NOTE: the "skill stat" keys for dice are NOT declared here — they are derived
 * at runtime from the state_schema's numeric fields (numericSkillKeys in
 * skill-check.ts), so they always reference fields that actually exist.
 */
export const GameSystemSchema = z.object({
  /**
   * narrative — pure story, no mechanics (romance / drama / slice-of-life).
   * dice      — skill-check rolls (D&D-like · TRPG).
   * combat    — turn-based battle (JRPG-like).
   * capture   — capture / collection (pet-monster-like).
   * mixed     — more than one of the above.
   */
  mechanic: z.enum(["narrative", "dice", "combat", "capture", "mixed"]),
  /** 0-5 opening objectives / quest lines · empty for pure narrative (③). */
  objectives: z.array(z.string().min(2).max(120)).max(5),
});

export type GameSystem = z.infer<typeof GameSystemSchema>;

/** Default for stories created before 0061 (no declaration) → pure narrative. */
export const DEFAULT_GAME_SYSTEM: GameSystem = {
  mechanic: "narrative",
  objectives: [],
};
