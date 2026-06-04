import { MAX_NPC_L3_AGENTS_PER_TURN } from "@/schemas/npc-agent";

/**
 * Active-NPC trigger — GM-free (Deep Mode · NPC 內心戲 · 2026-06-04).
 *
 * Light-core removed the GM/Director, so there is no longer a pre-Narrator
 * decision-maker that marks which NPCs are "active" this turn. To decide which
 * carded characters get a parallel POV inner-voice agent WITHOUT re-introducing
 * a GM (a pre-Narrator LLM scan would be exactly that), we derive activeness
 * from data we ALREADY hold by the time the turn starts:
 *
 *   1. The player's just-submitted action — who they are addressing NOW.
 *   2. The most recent AI narrative — who is currently on-stage.
 *
 * Both are pure string scans (no LLM, no decision-making) so this is NOT a GM.
 * A character who appears for the very first time in THIS turn's narrative will
 * only get an inner voice on the NEXT turn (the accepted "1-turn lag") — natural,
 * since an NPC reacts to what just happened.
 *
 * Name detection mirrors visualize-actions.ts (Wave 3 SEC fix): min 2-char name
 * to block 1-char substring exploits; naive substring for CJK (word boundaries
 * are impractical for CJK); word-boundary regex for Latin/mixed names.
 */

/** Min shape this helper needs from a character. Generic preserves caller's T. */
type CharLike = { card: { name: string }; character_id?: string | null };
type RecentTurnLike = { role: "user" | "ai"; text: string };

function nameAppears(name: string, text: string): boolean {
  const n = name.trim();
  // SEC (visualize-actions parity): a 1-char name substring-matches almost
  // anything — require ≥2 chars before we treat a hit as real.
  if (n.length < 2 || !text) return false;
  // Pure-ish CJK names → naive substring (CJK has no word boundary).
  const isCJK = /[一-鿿㐀-䶿]/.test(n);
  if (isCJK) return text.includes(n);
  // Latin / mixed names → word boundary, case-insensitive.
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * Derive the active carded characters for this turn (GM-free).
 *
 * Scoring: named in the player's action = 2 (most relevant to what the player
 * is doing right now) · on-stage in the last narrative = 1 (1-turn lag). A
 * character matching both scores 3. Sorted desc, capped at `maxAgents` (the
 * tier cap · npcVoicesCapForTier · Standard 1 / Pro 3). Only carded characters
 * (with character_id) are eligible — walk-on names from the extractor never get
 * an agent.
 *
 * Returns the caller's own character objects (full type preserved) so the turn
 * route can map them straight into callNpcAgentsParallel's input shape.
 */
export function deriveActiveCharacters<T extends CharLike>(
  characters: T[],
  userAction: string,
  recentTurns: RecentTurnLike[],
  maxAgents: number = MAX_NPC_L3_AGENTS_PER_TURN,
): T[] {
  if (characters.length === 0 || maxAgents <= 0) return [];
  // Never exceed the hard schema cap regardless of the tier value passed.
  const cap = Math.min(maxAgents, MAX_NPC_L3_AGENTS_PER_TURN);
  const action = userAction ?? "";
  // Most recent NON-EMPTY AI narrative — skip failed turns (persisted with
  // text="") so the turn right after a failure still scans real on-stage text.
  const lastAiNarrative =
    [...recentTurns]
      .reverse()
      .find((t) => t.role === "ai" && t.text.trim().length > 0)?.text ?? "";

  const scored = characters
    .filter((c) => !!c.character_id)
    .map((c) => {
      const inAction = nameAppears(c.card.name, action) ? 2 : 0;
      const inNarrative = nameAppears(c.card.name, lastAiNarrative) ? 1 : 0;
      return { c, score: inAction + inNarrative };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);

  return scored.map((x) => x.c);
}
