import { z } from "zod";

/**
 * Character Card — NPC template per story. Stored as `story_characters`
 * row. The card itself is immutable per story; per-playthrough disposition
 * lives in `playthrough_character_states`.
 *
 * Red lines are HARD behavioral limits the Director enforces. They can be
 * unlocked via earned exceptions (in-game actions that set permanent_flags),
 * never via player prompts.
 */

export const CharacterCardSchema = z.object({
  version: z
    .literal("story-engine/character/v1")
    .default("story-engine/character/v1"),
  name: z.string().min(1).max(40),
  role: z.string().max(40).optional(), // e.g., "女主角候選" / "宿敵" / "導師"
  personality_traits: z.array(z.string().min(2).max(20)).min(2).max(6),
  backstory: z.string().min(20).max(600),
  core_motivation: z.string().min(10).max(280),
  red_lines: z.array(z.string().min(5).max(140)).min(1).max(5),
  voice_sample: z.string().min(20).max(400), // 2-3 sentences of how they speak
  arc_description: z.string().min(10).max(280),
  default_disposition_toward_protagonist: z.enum([
    "hostile",
    "wary",
    "neutral",
    "friendly",
    "warm",
    "devoted",
  ]),
});

export type CharacterCard = z.infer<typeof CharacterCardSchema>;

/**
 * Per-playthrough disposition state. Maps to
 * `playthrough_character_states.disposition jsonb`.
 *
 * `trust`, `affection`, `respect`, `fear` are common axes — Director may
 * add story-specific ones. Range: -100 (max negative) to 100 (max positive).
 */
export const DispositionSchema = z.record(z.string(), z.number().min(-100).max(100));

export type Disposition = z.infer<typeof DispositionSchema>;

/**
 * Permanent flag — set by Director when an in-game action earns an exception
 * or marks a significant event. Used by Director to unlock red_line relaxations.
 * Examples: "rescued_linsiya_act2", "betrayed_brother", "saved_orphans_park".
 */
export const PermanentFlagSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case flags");

export type PermanentFlag = z.infer<typeof PermanentFlagSchema>;

/**
 * Compact serialization of all character cards for the LLM system prompt.
 * Disposition is filled in per-playthrough.
 */
export function characterCardToSystemPrompt(
  card: CharacterCard,
  disposition?: Disposition,
  permanentFlags?: string[],
): string {
  const traits = card.personality_traits.join(", ");
  const redLines = card.red_lines.map((r) => `    - ${r}`).join("\n");
  const dispositionStr = disposition
    ? `  Current disposition: ${Object.entries(disposition)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}\n`
    : "";
  const flagsStr =
    permanentFlags && permanentFlags.length
      ? `  Permanent flags: ${permanentFlags.join(", ")}\n`
      : "";

  return `### ${card.name}${card.role ? ` (${card.role})` : ""}
  Traits: ${traits}
  Backstory: ${card.backstory}
  Motivation: ${card.core_motivation}
  Voice: ${card.voice_sample}
  Arc: ${card.arc_description}
  Default disposition toward player: ${card.default_disposition_toward_protagonist}
  RED LINES (Director must enforce unless earned exception):
${redLines}
${dispositionStr}${flagsStr}`;
}

export function allCharactersToSystemPrompt(
  cards: Array<{
    card: CharacterCard;
    disposition?: Disposition;
    permanent_flags?: string[];
  }>,
): string {
  if (cards.length === 0) return "";
  return `## Characters (each has a soul — respect red lines)\n\n${cards
    .map((c) =>
      characterCardToSystemPrompt(c.card, c.disposition, c.permanent_flags),
    )
    .join("\n\n")}`;
}
