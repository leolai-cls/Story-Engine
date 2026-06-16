/**
 * Adaptive character design-sheet prompt composer (Wave 3 · 2026-06-14).
 *
 * Founder's directive: the two reference prompts they shared are a TEMPLATE, not
 * a fixed prompt. This must build the sheet prompt as an ARCHITECTURE that fuses
 * a different character × different world/background × different art style every
 * time — a cyberpunk swordsman sheet and a wuxia strategist sheet must each come
 * out coherent in their own world + style.
 *
 * How it adapts:
 *   - CHARACTER → name (+ native-language name), role, build, signature gear /
 *     weapons / clothing, distinguishing features — pulled from the character's
 *     soul (backstory + personality + the locked visual_description from B1).
 *   - WORLD → the story's title + description set the setting / era / faction.
 *   - STYLE → the story's chosen KIEIO style (style_key) supplies the art-medium
 *     descriptors (HK manhua / JP anime / wuxia ink / cyberpunk / …).
 *
 * The SHEET STRUCTURE (distilled from the founder's reference sheets) is fixed:
 * profile header · full turnaround (front/3-4/side/back · strict consistency) ·
 * six-expression head sheet · signature gear close-ups · height chart · colour
 * palette. An LLM fills that structure with THIS character's specifics so each
 * panel (e.g. which weapons get close-ups) is character-accurate, like the
 * reference prompts. Falls back to a deterministic template if the LLM fails.
 *
 * SFW/soft only in practice (sheets render on fal gpt-image-2 · adult stays on
 * Grok per hard rule #5) — but the composer is rating-aware so the utility model
 * routes correctly if ever called for an adult story.
 */

import { generateText } from "ai";
import { getProviderModel } from "./providers";
import { pickUtilityModel } from "./tier-router";
import { KIEIO_STYLES, matchStylesForSeed, type StyleKey } from "./image-styles";

export type CharacterForSheet = {
  name: string;
  role?: string | null;
  backstory?: string | null;
  personality_traits?: string[] | null;
  core_motivation?: string | null;
  /** Locked appearance from B1 (character-appearance.ts) — the visual anchor. */
  visual_description?: string | null;
};

/** The fixed sheet structure, distilled from the founder's reference sheets. */
const SHEET_STRUCTURE = [
  "A single character DESIGN SHEET (model sheet) image on a light grey grid / document background, art-directed layout (intentional, slightly asymmetrical — NOT a rigid even grid).",
  "It MUST contain, as labelled panels:",
  "1. Profile header: the character's name (include their native-language name if non-English), age, role/faction, build, height.",
  "2. Full-body TURNAROUND: front view, 3/4 view, side view, back view — IDENTICAL proportions, face and costume across all four, zero drift.",
  "3. Expression head sheet: six head studies showing distinct emotions (e.g. neutral, determined, surprised, faint smirk, sorrow, battle-ready), each captured mid-emotion.",
  "4. Signature gear / prop close-ups: detailed insets of THIS character's actual weapons, tools and key wardrobe items.",
  "5. Height comparison chart (with a silhouette).",
  "6. Colour palette swatches, labelled.",
  "STRICT CONSISTENCY: the same face, proportions, hair and costume in every view and panel — no reinterpretation between angles.",
].join("\n");

function resolveStyleDescriptor(
  styleKey: StyleKey | null,
  storyDescription: string | null,
): { label: string; descriptor: string } {
  let key = styleKey;
  if (!key || !(key in KIEIO_STYLES)) {
    key = matchStylesForSeed(storyDescription ?? "")[0] ?? "jp-anime";
  }
  const s = KIEIO_STYLES[key];
  return {
    label: s.name.en,
    // promptPrefix + promptSuffix together describe the art medium + look.
    descriptor: `${s.promptPrefix}; ${s.promptSuffix}`,
  };
}

function characterContext(c: CharacterForSheet): string {
  const traits = Array.isArray(c.personality_traits)
    ? c.personality_traits.filter(Boolean).join(", ")
    : "";
  return [
    `Name: ${(c.name ?? "").trim() || "Character"}`,
    c.role ? `Role: ${c.role}` : "",
    c.visual_description ? `Locked appearance: ${c.visual_description.slice(0, 600)}` : "",
    traits ? `Personality: ${traits}` : "",
    c.backstory ? `Backstory: ${c.backstory.slice(0, 600)}` : "",
    c.core_motivation ? `Motivation: ${c.core_motivation.slice(0, 280)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Deterministic fallback prompt if the LLM composer fails. */
function templateFallback(
  c: CharacterForSheet,
  world: string,
  style: { label: string; descriptor: string },
): string {
  const appearance =
    c.visual_description?.trim() ||
    `${c.name}${c.role ? `, ${c.role}` : ""}`;
  return [
    SHEET_STRUCTURE,
    "",
    `CHARACTER: ${c.name}${c.role ? ` — ${c.role}` : ""}. ${appearance}.`,
    world ? `WORLD / SETTING: ${world}.` : "",
    `ART STYLE: render the entire sheet in ${style.label} — ${style.descriptor}.`,
    "High detail, sharp focus, production-ready.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Compose ONE gpt-image-2 prompt that produces a full character design sheet,
 * adapted to this character, world and art style. ~150-280 words English.
 */
export async function composeCharacterSheetPrompt(opts: {
  character: CharacterForSheet;
  storyTitle: string;
  storyDescription: string | null;
  styleKey: StyleKey | null;
  contentRating: "sfw" | "soft" | "adult";
}): Promise<string> {
  const style = resolveStyleDescriptor(opts.styleKey, opts.storyDescription);
  const world = [opts.storyTitle, opts.storyDescription?.slice(0, 500)]
    .filter(Boolean)
    .join(" — ");

  try {
    const model = getProviderModel(pickUtilityModel(opts.contentRating, "text"));
    const { text } = await generateText({
      model,
      system: [
        "You are a character-sheet art director. Output ONE text-to-image prompt for gpt-image-2 that generates a SINGLE character design sheet image.",
        "The sheet structure is FIXED — your job is to fill it with THIS character's specifics so every panel is character-accurate (e.g. the close-up insets must show this character's actual weapons / tools / wardrobe, not generic ones).",
        "",
        SHEET_STRUCTURE,
        "",
        `Render the WHOLE sheet in this art style: ${style.label} — ${style.descriptor}.`,
        "Keep the character's look faithful to their locked appearance and their world/era.",
        "Output ONLY the image prompt — 150-280 English words, plain prose, no markdown, no headings, no preamble.",
      ].join("\n"),
      prompt: `CHARACTER:\n${characterContext(opts.character)}\n\nWORLD / SETTING:\n${world || "(unspecified)"}`,
      temperature: 0.6,
      maxOutputTokens: 600,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(20_000),
    });
    const cleaned = text.trim();
    if (cleaned.length >= 80) return cleaned;
  } catch {
    // fall through to template
  }
  return templateFallback(opts.character, world, style);
}
