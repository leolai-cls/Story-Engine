import { z } from "zod";

/**
 * Story Bible — the "rules of the world" that the AI must respect.
 * Per ADR-008, split into 3 tiers:
 *
 *   - Hard Locked (~150-300字 total, 5-10 declarative statements):
 *       Premise, NPC red lines (referenced by character_card), world physics limits.
 *       Director NEVER overrides these. System prompt always includes them.
 *
 *   - Soft Guided (~300-500字):
 *       Story arc with CONDITIONAL transitions (never turn-count thresholds).
 *       Director uses as guidance, has discretion on pacing.
 *
 *   - Open (0字 — represented by absence):
 *       Dialogue, scene details, NPC reactions, side plots. Narrator free.
 *
 * Bible is immutable to AI mid-play. Owner can edit between sessions.
 */

export const HardLockedSchema = z.object({
  central_conflict: z.string().min(20).max(400),
  world_invariants: z.array(z.string().min(5).max(180)).min(1).max(6),
  themes_required: z.array(z.string().min(2).max(40)).max(5),
  tone: z.enum([
    "realistic",
    "romantic",
    "dark_humor",
    "epic_fantasy",
    "noir",
    "slice_of_life",
    "thriller",
    "comedy",
  ]),
  language: z.enum(["zh-Hant", "zh-Hans", "en"]),
  // Always provided — empty string if not applicable to the genre
  cultural_setting: z.string().max(120),
});

export type HardLocked = z.infer<typeof HardLockedSchema>;

/**
 * Story arc act. Transition condition is a boolean DSL over state fields —
 * Director evaluates against playthrough.current_state to decide if Act
 * should advance. The narrative_intent is a hint for the Narrator/Director,
 * NOT a script.
 */
export const StoryArcActSchema = z.object({
  act: z.number().int().min(1).max(5),
  name: z.string().min(1).max(40),
  narrative_intent: z.string().min(10).max(300),
  /**
   * Boolean DSL referencing state fields:
   *   e.g., "characters.linsiya.disposition.trust >= 60 AND interactions_1on1.linsiya >= 3"
   *   e.g., "state.hp > 0 AND state.act1_complete"
   * Director parses + evaluates each turn.
   */
  transition_condition: z.string().min(5).max(400),
});

export const SoftGuidedSchema = z.object({
  story_arc: z.array(StoryArcActSchema).min(2).max(5),
  // Always provided — empty string if no specific pacing hint
  pacing_hint: z.string().max(280),
});

export type SoftGuided = z.infer<typeof SoftGuidedSchema>;

/**
 * Top-level Bible. Stored as `stories.story_bible jsonb`.
 *
 * Cross-field refinement: story_arc acts must be contiguous starting from 1.
 * Without this, an LLM emitting `[{act:2},{act:4}]` would create a story that
 * can never advance past `persisted_act=1` (no matching entry to evaluate).
 */
export const StoryBibleSchema = z
  .object({
    hard_locked: HardLockedSchema,
    soft_guided: SoftGuidedSchema,
  })
  .superRefine((b, ctx) => {
    const acts = b.soft_guided.story_arc.map((a) => a.act).sort((x, y) => x - y);
    if (acts[0] !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `story_arc must start at act=1 (first act was ${acts[0]})`,
        path: ["soft_guided", "story_arc"],
      });
    }
    for (let i = 1; i < acts.length; i++) {
      if (acts[i] !== acts[i - 1] + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `story_arc acts must be contiguous (gap between ${acts[i - 1]} and ${acts[i]})`,
          path: ["soft_guided", "story_arc"],
        });
        break;
      }
    }
  });

export type StoryBible = z.infer<typeof StoryBibleSchema>;

/**
 * Compact text serialization of the Bible for inclusion in LLM system
 * prompts. Keeps it human-readable + token-efficient. Director and
 * Narrator both consume this.
 */
export function bibleToSystemPrompt(bible: StoryBible): string {
  const hl = bible.hard_locked;
  const sg = bible.soft_guided;
  const acts = sg.story_arc
    .map(
      (a) =>
        `  Act ${a.act}. ${a.name} — ${a.narrative_intent} (transitions when: ${a.transition_condition})`,
    )
    .join("\n");
  const themes = hl.themes_required.length
    ? `\nThemes: ${hl.themes_required.join(", ")}`
    : "";
  const setting = hl.cultural_setting
    ? `\nSetting: ${hl.cultural_setting}`
    : "";

  return `## Story Bible (immutable — never override)

Central conflict: ${hl.central_conflict}
Tone: ${hl.tone}${themes}${setting}

World invariants (hard rules):
${hl.world_invariants.map((r) => `  - ${r}`).join("\n")}

Story arc (guidance — pacing is flexible):
${acts}${sg.pacing_hint ? `\n\nPacing hint: ${sg.pacing_hint}` : ""}`;
}
