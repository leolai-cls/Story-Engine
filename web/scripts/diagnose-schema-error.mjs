#!/usr/bin/env node
/**
 * Diagnostic: probe where the "grammar too large" error actually starts.
 *
 * Tests 3 schemas (small → medium → full Story Engine) against Anthropic
 * via Vercel AI SDK. Captures real error response + timing so we know
 * for sure whether the schema is the root cause or something else.
 *
 * Run: node scripts/diagnose-schema-error.mjs
 */

import "dotenv/config";
import { z } from "zod";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY missing in .env.local");
  process.exit(1);
}

const MODEL = process.env.TEST_MODEL || "claude-sonnet-4-6";

async function tryGenerate(label, schema, prompt) {
  console.log(`\n=== ${label} ===`);
  const t0 = Date.now();
  try {
    const result = await generateObject({
      model: anthropic(MODEL),
      schema,
      prompt,
      maxOutputTokens: 1000,
    });
    const dt = Date.now() - t0;
    console.log(`✅ Success in ${dt}ms`);
    console.log("Output preview:", JSON.stringify(result.object).slice(0, 200));
  } catch (e) {
    const dt = Date.now() - t0;
    console.log(`❌ Failed in ${dt}ms`);
    console.log("Error name:", e?.name);
    console.log("Error message:", e?.message);
    if (e?.cause) console.log("Cause:", JSON.stringify(e.cause).slice(0, 500));
    if (e?.data) console.log("Data:", JSON.stringify(e.data).slice(0, 500));
    if (e?.response) console.log("Response:", JSON.stringify(e.response).slice(0, 500));
    // Anthropic raw error often in body
    if (e?.responseBody) console.log("Body:", String(e.responseBody).slice(0, 500));
  }
}

// ─── Test 1: Tiny schema (sanity — confirms key + model + SDK work) ─────
const tiny = z.object({
  title: z.string().min(2).max(40),
  summary: z.string().min(10).max(200),
});

// ─── Test 2: Medium schema (string arrays + nested object — moderate) ──
const medium = z.object({
  title: z.string(),
  description: z.string(),
  characters: z.array(
    z.object({
      name: z.string(),
      traits: z.array(z.string()),
    }),
  ).min(1).max(5),
});

// ─── Test 3: Our actual StoryGenerationResultSchema (replicate exactly) ─
const baseField = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
});
const bar = baseField.extend({
  render_hint: z.literal("bar"),
  max: z.number(),
  default: z.number(),
});
const ring = baseField.extend({
  render_hint: z.literal("progress_ring"),
  default: z.number(),
});
const number = baseField.extend({
  render_hint: z.literal("number"),
  default: z.number(),
});
const enumChip = baseField.extend({
  render_hint: z.literal("enum_chip"),
  options: z.array(z.string()).min(2).max(12),
  default: z.string(),
});
const inv = baseField.extend({
  render_hint: z.literal("inventory_list"),
  default: z.array(
    z.object({ name: z.string(), count: z.number(), icon: z.string() }),
  ),
});
const rel = baseField.extend({
  render_hint: z.literal("relationship_graph"),
  default: z.record(z.string(), z.number()),
});
const meter = baseField.extend({
  render_hint: z.literal("meter_with_label"),
  max: z.number(),
  default: z.number(),
});
const portrait = baseField.extend({
  render_hint: z.literal("portrait"),
  default: z.string(),
});
const note = baseField.extend({
  render_hint: z.literal("note"),
  default: z.string(),
});
const fieldUnion = z.discriminatedUnion("render_hint", [
  bar, ring, number, enumChip, inv, rel, meter, portrait, note,
]);
const full = z.object({
  title: z.string(),
  description: z.string(),
  state_schema: z.object({ fields: z.array(fieldUnion).min(1).max(20) }),
  story_bible: z.object({
    hard_locked: z.object({
      central_conflict: z.string(),
      world_invariants: z.array(z.string()).min(1).max(6),
      themes_required: z.array(z.string()).max(5),
      tone: z.enum(["realistic","romantic","dark_humor","epic_fantasy","noir","slice_of_life","thriller","comedy"]),
      language: z.enum(["zh-Hant","zh-Hans","en"]),
      cultural_setting: z.string(),
    }),
    soft_guided: z.object({
      story_arc: z.array(z.object({
        act: z.number(),
        name: z.string(),
        narrative_intent: z.string(),
        transition_condition: z.string(),
      })).min(2).max(5),
      pacing_hint: z.string(),
    }),
  }),
  characters: z.array(z.object({
    name: z.string(),
    role: z.string(),
    personality_traits: z.array(z.string()).min(2).max(6),
    backstory: z.string(),
    core_motivation: z.string(),
    red_lines: z.array(z.string()).min(1).max(5),
    voice_sample: z.string(),
    arc_description: z.string(),
    default_disposition_toward_protagonist: z.enum(["hostile","wary","neutral","friendly","warm","devoted"]),
  })).min(1).max(6),
  opening_narrative: z.string(),
});

// Bisect schemas: also test JUST the discriminated union as standalone
const justFields = z.object({
  fields: z.array(fieldUnion).min(1).max(20),
});

await tryGenerate("Test 1: Tiny", tiny, "Write a story about a robot detective.");
await tryGenerate("Test 2: Medium (3 chars)", medium, "Design a romance with 3 named characters.");
await tryGenerate("Test 3a: Just discriminated union", justFields, "Design a state schema for a D&D story.");
await tryGenerate("Test 3b: Full Story Engine schema", full, "Design a HK 1980s 古惑仔 story.");
