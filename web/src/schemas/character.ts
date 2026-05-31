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
  name: z.string().min(1).max(40),
  // Always provided — empty string if no specific role
  role: z.string().max(40),
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
 * Phase 1 — NPC Level 2 dynamic state.
 * Transient per-scene NPC state updated by Director each turn. Mirrors
 * Migration 0024 `playthrough_character_states.dynamic_state` jsonb shape.
 *
 * Distinction from disposition (long-term 4-axis numeric):
 *   - disposition = relationship metrics (trust / romance / respect / fear)
 *                   change slowly over many turns
 *   - dynamic_state = current scene mood / goal / focus
 *                     refreshed every turn by Director
 *
 * `emotional_trajectory` is a rolling window (last 8 emotional shifts) so
 * Narrator can see the NPC's emotional arc within this scene.
 */
export const EmotionalShiftSchema = z.enum(["positive", "neutral", "negative"]);
export type EmotionalShift = z.infer<typeof EmotionalShiftSchema>;

export const TrajectoryEntrySchema = z.object({
  shift: EmotionalShiftSchema,
  turn: z.number().int().min(0),
  mood: z.string().max(40),
});

export const NpcDynamicStateSchema = z.object({
  current_mood: z.string().max(40).optional(),
  current_goal: z.string().max(120).optional(),
  topic_focus: z.string().max(60).optional(),
  last_emotional_shift: EmotionalShiftSchema.optional(),
  last_updated_turn: z.number().int().min(0).optional(),
  emotional_trajectory: z.array(TrajectoryEntrySchema).max(8).optional(),
}).passthrough(); // allow future fields without breaking

export type NpcDynamicState = z.infer<typeof NpcDynamicStateSchema>;

/**
 * AUDIT FIX (AI-C-02) — split character serialization into STATIC template
 * (never changes per playthrough → cacheable as prompt prefix) and DYNAMIC
 * state (disposition + flags → changes every turn, must NOT enter cached
 * prefix or the entire cache busts).
 *
 * Previously `characterCardToSystemPrompt(card, disposition, flags)` mashed
 * everything together and that whole block got `cacheControl: ephemeral`.
 * Disposition values shifted every turn → cache miss every turn → ~10x
 * higher input cost. Now: static template stays in cached prefix; dynamic
 * state goes into a per-turn (uncached) message block.
 */

// ─── STATIC: cacheable, never changes per playthrough ────────────────────

/**
 * Static character template — name, role, traits, backstory, motivation,
 * voice, arc, red lines, default disposition (the personality blueprint,
 * not the running per-playthrough numbers). Safe to put in cached prefix.
 */
export function characterCardStaticTemplate(card: CharacterCard): string {
  const traits = card.personality_traits.join(", ");
  // 2026-06-01 (ADR-002 · 移除角色硬紅線): red_lines 由「Director 強制嘅絕對禁令」
  // 改做「呢個角色起點傾向唔做嘅事」—— 係出身傾向之一 · 唔係硬規則 · 可隨經歷
  // 演化 (玩家可透過長期相處改變)。平台法律底線 (CSAM/真實傷害) 另由 moderation
  // 把守 · 同角色系統分離。Director 已降做 prep (GM 重構) · 唔再 enforce verdict。
  const boundaries = card.red_lines.length
    ? card.red_lines.map((r) => `    - ${r}`).join("\n")
    : "    - （無特別傾向）";
  return `### ${card.name}${card.role && card.role.length ? ` (${card.role})` : ""}
  Traits: ${traits}
  Backstory: ${card.backstory}
  Motivation: ${card.core_motivation}
  Voice: ${card.voice_sample}
  Arc: ${card.arc_description}
  Default disposition toward player: ${card.default_disposition_toward_protagonist}
  起點上傾向唔會做嘅事（呢啲係佢出身形成嘅傾向 · 唔係鐵律 · 會隨經歷同關係演化 · 由你按佢累積嘅經歷判斷佢而家會點）：
${boundaries}`;
}

export function allCharactersStaticTemplate(
  cards: Array<{ card: CharacterCard }>,
): string {
  if (cards.length === 0) return "";
  return `## Characters (每個都有獨立靈魂 — 由佢哋嘅出身、性格、累積經歷推導反應 · 唔好當扁平 NPC)\n\n${cards
    .map((c) => characterCardStaticTemplate(c.card))
    .join("\n\n")}`;
}

// ─── DYNAMIC: changes per turn, MUST NOT enter cached prefix ─────────────

/**
 * Per-turn character state — running disposition values + earned permanent
 * flags + Phase 1 dynamic state (mood / goal / focus / emotional trajectory).
 * Lives outside the cached prefix.
 */
export function characterDynamicState(
  name: string,
  disposition?: Disposition,
  permanentFlags?: string[],
  dynamicState?: NpcDynamicState,
): string {
  const lines: string[] = [];

  // Phase 1 — dynamic scene state (mood / goal / focus / trajectory)
  if (dynamicState) {
    const ds: string[] = [];
    if (dynamicState.current_mood) ds.push(`心情=${dynamicState.current_mood}`);
    if (dynamicState.current_goal) ds.push(`當下目標=${dynamicState.current_goal}`);
    if (dynamicState.topic_focus) ds.push(`焦點=${dynamicState.topic_focus}`);
    if (ds.length > 0) lines.push(`Scene state: ${ds.join(" · ")}`);

    const traj = dynamicState.emotional_trajectory;
    if (traj && traj.length > 0) {
      const arc = traj
        .map((t) => {
          const arrow =
            t.shift === "positive" ? "↑" : t.shift === "negative" ? "↓" : "→";
          return `${arrow}${t.mood}`;
        })
        .join(" ");
      lines.push(`Emotional arc (recent): ${arc}`);
    }
  }

  if (disposition && Object.keys(disposition).length > 0) {
    lines.push(
      `Current disposition: ${Object.entries(disposition)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }
  if (permanentFlags && permanentFlags.length > 0) {
    lines.push(`Permanent flags: ${permanentFlags.join(", ")}`);
  }
  if (lines.length === 0) {
    return `**${name}**: (neutral baseline — no relationship history yet)`;
  }
  return `**${name}**: ${lines.join(" · ")}`;
}

export function allCharactersDynamicState(
  cards: Array<{
    card: CharacterCard;
    disposition?: Disposition;
    permanent_flags?: string[];
    dynamic_state?: NpcDynamicState;
  }>,
): string {
  if (cards.length === 0) return "";
  return `## NPC State (this turn — relationship + earned flags + scene mood)\n\n${cards
    .map((c) =>
      characterDynamicState(
        c.card.name,
        c.disposition,
        c.permanent_flags,
        c.dynamic_state,
      ),
    )
    .join("\n")}`;
}

// ─── LEGACY: combined call — kept for backward compat callers, but avoid
//     using in cached prompt prefix or you'll bust cache.
// ─────────────────────────────────────────────────────────────────────────

/** @deprecated Use `allCharactersStaticTemplate` + `allCharactersDynamicState` separately to preserve prompt-cache hits. */
export function characterCardToSystemPrompt(
  card: CharacterCard,
  disposition?: Disposition,
  permanentFlags?: string[],
): string {
  const staticPart = characterCardStaticTemplate(card);
  const dynamicPart = characterDynamicState(card.name, disposition, permanentFlags);
  return `${staticPart}\n  ${dynamicPart}`;
}

/** @deprecated Use the split static / dynamic helpers. */
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
