import { z } from "zod";

/**
 * Director verdict — output of the Director Model's pre-Narrator check.
 *
 * Per ADR-015 (Orchestrator Pattern): each turn flows
 *   user action → Director (cheap LLM) → verdict → Narrator (premium LLM)
 *
 * The Director审 the player's action against:
 *   - Story Bible hard_locked rules (premise, world_invariants)
 *   - NPC red_lines (with earned_exception flags)
 *   - Player skill levels (Phase 1.5.2 will use these for skill checks)
 *   - Story arc context (which Act we're in)
 *
 * Output is one of 4 discriminated variants. Narrator's system prompt is
 * adjusted based on the verdict.
 *
 * Phase 1.5.1: 3 variants implemented (allow / reject / allow_with_constraint).
 * Phase 1.5.2: require_skill_check will become functional (dice roller).
 */

/**
 * Phase 1 — Lorebook wing enum (controlled vocabulary).
 * MUST stay in sync with Migration 0023 `lorebook_wing_enum` check constraint.
 * CLAUDE.md hard rule #28: never LLM-generated free-text identifier — Director
 * must pick from this fixed set.
 */
export const LorebookWingEnum = z.enum([
  "characters",
  "places",
  "items",
  "events",
  "lore",
  "protagonist",
]);
export type LorebookWing = z.infer<typeof LorebookWingEnum>;

/**
 * Phase 1 — MemoryHints output from Director.
 * Tells the retriever which rooms (NPC names, scene tags) and wings to load
 * for this turn instead of blanket top-K. Reduces context noise + cost.
 */
export const MemoryHintsSchema = z.object({
  /** Rooms to preferentially load · examples: ["林思雅"], ["港大宿舍", "act1_confession"]. Max 6. */
  rooms_to_load: z.array(z.string().min(1).max(60)).max(6).default([]),
  /** Wings to preferentially load · subset of LorebookWingEnum. Max 4. */
  wings_to_load: z.array(LorebookWingEnum).max(4).default([]),
});
export type MemoryHints = z.infer<typeof MemoryHintsSchema>;

/**
 * Phase 1 — NPC Level 2 dynamic state update output by Director.
 * Transient per-scene state (mood / current_goal / topic_focus) that
 * complements the 4-axis disposition (long-term relationship metrics).
 *
 * Director infers from player action + current scene · turn route applies
 * to playthrough_character_states.dynamic_state jsonb (added in Migration 0024).
 */
export const NpcDynamicUpdateSchema = z.object({
  character_name: z.string().min(1).max(60),
  /** Direction of emotional shift this turn (one of 3) */
  emotional_shift: z.enum(["positive", "neutral", "negative"]),
  /** What the NPC wants right NOW (transient · changes per scene). e.g., "想知道主角嘅秘密" */
  current_goal: z.string().min(1).max(120),
  /** Current mood label · concise (e.g., "焦慮", "得意", "懷疑") */
  current_mood: z.string().min(1).max(40),
  /** What topic this NPC is fixated on this turn. e.g., "家族秘密" */
  topic_focus: z.string().min(1).max(60),
});
export type NpcDynamicUpdate = z.infer<typeof NpcDynamicUpdateSchema>;

export const VerdictSchema = z.discriminatedUnion("verdict", [
  // ─── ALLOW ─────────────────────────────────────────────────────────
  z.object({
    verdict: z.literal("allow"),
    reasoning: z.string().min(5).max(280),
  }),

  // ─── REJECT — Narrator must in-fiction pushback ─────────────────────
  // `affected_character`: NPC whose red_line was crossed. Empty string when
  // the rejection is on world-invariant grounds (no specific NPC) — Narrator
  // instruction handles that case with a generic "故事規則" fallback.
  z.object({
    verdict: z.literal("reject"),
    reasoning: z.string().min(10).max(280),
    in_fiction_pushback_hint: z.string().min(10).max(280),
    affected_character: z.string().max(40),
  }),

  // ─── ALLOW WITH CONSTRAINT — proceed but with specific consequence ──
  z.object({
    verdict: z.literal("allow_with_constraint"),
    reasoning: z.string().min(10).max(280),
    constraint: z.string().min(10).max(280),
  }),

  // ─── REQUIRE SKILL CHECK — Phase 1.5.2 makes this functional ───────
  z.object({
    verdict: z.literal("require_skill_check"),
    reasoning: z.string().min(10).max(280),
    skill_key: z.string().min(1).max(64),
    difficulty: z.number().int().min(5).max(25),
    success_consequence_hint: z.string().min(10).max(280),
    failure_consequence_hint: z.string().min(10).max(280),
  }),
]);

export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Phase 1 — DirectorOutputSchema wraps verdict + Phase 1 additions
 * (memory_hints + npc_updates) into one structured response.
 *
 * Backwards-compat: the Verdict alone is still exposed via `output.verdict`
 * for existing consumers (turn route reads result.verdict.verdict for the
 * discriminator). New consumers can use `output.memory_hints` +
 * `output.npc_updates` for Phase 1 features.
 *
 * Why wrap rather than extend each Verdict variant: Anthropic structured
 * output works better with simple top-level objects · keeps the discriminated
 * union intact · and centralizes Phase 1 fields in one place.
 */
export const DirectorOutputSchema = z.object({
  verdict: VerdictSchema,
  memory_hints: MemoryHintsSchema.default({ rooms_to_load: [], wings_to_load: [] }),
  // AUDIT FIX P1-COST-H-01: cap at 4 (down from 8) to enforce stated "Max 4" rule
  // in DIRECTOR_SYSTEM prompt + reduce risk of structured-output overrun.
  npc_updates: z.array(NpcDynamicUpdateSchema).max(4).default([]),
  /**
   * Phase 1 — scene-level summary trigger.
   * Director marks true when:
   *   - Player explicitly leaves scene (時間跳轉 / 場景切換 / 入睡)
   *   - Major beat closes (confession resolved, fight ended, decision made)
   *   - Story arc transitions (act change · checkpoint completion)
   *
   * When true, summarizer fires for [lastSummary, currentTurn] · captures the
   * just-closed scene · stays scoped rather than arbitrary 20-turn chunks.
   *
   * Most turns should be false (mid-scene). Bias toward false.
   */
  scene_boundary: z.boolean().default(false),
});
export type DirectorOutput = z.infer<typeof DirectorOutputSchema>;

/**
 * Convert verdict into a system-prompt addendum that the Narrator consumes.
 * Each verdict shapes Narrator's behavior differently.
 */
export function verdictToNarratorInstruction(v: Verdict): string {
  switch (v.verdict) {
    case "allow":
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## Director Verdict
Director 允許呢個 action。正常 narrate 後果。`;

    case "reject": {
      const who = v.affected_character.trim() || "在場角色 / 環境";
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## GM 裁定 — 呢個行動喺故事世界唔成立 (方向指引 · 唔係台詞)
玩家嘗試嘅嘢違反咗${v.affected_character.trim() ? ` ${who} 嘅紅線 / ` : ""}故事世界規則。
內部原因（唔好出喺敘事）：${v.reasoning}
世界點回應（in-fiction 方向）：${v.in_fiction_pushback_hint}

你要寫一段完整、生動嘅故事文字（最少 2-3 句 · 絕對唔可以空白 · 唔可以系統訊息 · 唔可以出「動作被拒絕 / action rejected」呢類字眼），喺故事世界入面自然咁體現「呢個嘗試失敗咗」：

- **在場每個角色按返佢自己嘅性格、講嘢風格(voice)、當下心情、同主角嘅關係去反應** —— 上面只係方向，**唔係台詞**。同一件荒謬嘅事：一個威嚴武將、一個膽小村民、一個曖昧對象嘅反應應該**完全唔同**；同一個角色喺緊張 / 放鬆 / 嬲 嘅時候反應都唔同。**唔好每次都用同一句**（例如次次都「你傻咗呀？」就係寫死咗，失敗）。由角色本身嘅人設去決定佢點反應。
- 玩家嘅嘗試喺世界入面具體咁失敗 —— 冇任何超自然 / 違反規則嘅嘢發生，現實照舊運作。點樣失敗都可以有變化（默默冇反應 / 旁人側目 / 自己都覺得尷尬…）。
- 最後 1-2 句反應式結尾，等玩家接落去。

⚠️ 當呢個係故事入面一個真實、有血有肉、會隨角色同情境變化嘅場面去寫，唔係一個系統判定。唔好 narrate 行動成功。`;
    }

    case "allow_with_constraint":
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## Director Verdict — ALLOW WITH CONSTRAINT (你必須遵守)
玩家行動允許進行，但有特定 constraint：
${v.constraint}

原因：${v.reasoning}

正常 narrate 後果，但必須包含 constraint 描述嘅嘢。`;

    case "require_skill_check":
      // This case is handled separately in turn route — dice rolled BEFORE
      // Narrator is called, and skillCheckToNarratorInstruction produces
      // the actual instruction with the rolled outcome.
      // This text is a fallback if for some reason dice isn't rolled.
      return `[INTERNAL CONTEXT — DO NOT QUOTE OR PARAPHRASE IN YOUR NARRATIVE]
## Director Verdict — SKILL CHECK NEEDED
\`${v.skill_key}\` vs difficulty ${v.difficulty}. Dice 應該已經喺 turn route 擲過 — 如果你睇到呢段，係 fallback path，pick 一個合理結果寫。`;
  }
}

type DirectorThinkingLang = "zh-Hant" | "zh-Hans" | "en";

/**
 * Render the Director's verdict as a PLAYER-FACING "GM thinking" block.
 *
 * Founder 2026-05-30: the deep-thinking toggle should surface a visible
 * thinking process on EVERY model. But Gemini hides its chain-of-thought (and
 * we force its thinking off — it eats the output budget), and only premium
 * models (Claude) expose real reasoning. The Director (GM) runs on every turn
 * regardless of which narrator model is picked, so its reasoning is the ONE
 * universal thinking surface. We stream it into the collapsible reasoning panel
 * before the narrator's prose. A premium model's own reasoning (if any) appends
 * after, so the panel can show GM-thinking + model-thinking together.
 *
 * The verdict.reasoning field is already written in the story's language
 * (directorSystemFor enforces this). We add a short, non-spoiler tail per
 * verdict type to give the thinking RPG flavour without revealing the prose.
 */
export function verdictToGmThinking(v: Verdict, lang: DirectorThinkingLang): string {
  const lead = lang === "en" ? "〈Game Master〉" : "〈遊戲主持〉";
  const reasoning = v.reasoning.trim();
  let tail = "";
  switch (v.verdict) {
    case "reject":
      tail =
        lang === "en"
          ? "\n(This doesn't hold up in the story world — let's see how everyone present reacts.)"
          : lang === "zh-Hans"
            ? "\n（这在故事世界里不成立 —— 看看在场角色怎么反应。）"
            : "\n（呢個喺故事世界唔成立 —— 睇下在場角色點反應。）";
      break;
    case "allow_with_constraint":
      tail =
        lang === "en"
          ? "\n(Allowed — but it won't come without a cost.)"
          : lang === "zh-Hans"
            ? "\n（可以 —— 不过不会没有代价。）"
            : "\n（可以 —— 不過唔會冇代價。）";
      break;
    case "require_skill_check":
      tail =
        lang === "en"
          ? "\n(Outcome uncertain — the dice decide.)"
          : lang === "zh-Hans"
            ? "\n（成败未定 —— 掷骰决定。）"
            : "\n（成敗未定 —— 擲骰決定。）";
      break;
    case "allow":
    default:
      tail = "";
  }
  return `${lead}\n${reasoning}${tail}`;
}
