/**
 * One-off repair — rebuild stuck/missing running_summary digests.
 *
 * Context (2026-06-08): the summarizer hit a death-spiral bug (digest grew past
 * the 2000-token cap → truncated → never advanced → folded ever-more turns →
 * stuck forever). The engine fix (4096 ceiling + hard-recompress retry + a hard
 * length budget in the prompt) lives in lib/ai/memory/summarizer.ts. This script
 * rebuilds the digests for playthroughs that were already stuck, in SMALL batches
 * (so the first rebuild compact doesn't itself blow the ceiling), reusing the
 * (fixed) updateRunningSummary code path — no duplicated logic.
 *
 * Run from the `web/` dir:
 *   npx tsx scripts/repair-running-summary.ts
 *
 * NOTE: non-adult playthroughs summarise via Haiku (Anthropic · needs
 * ANTHROPIC_API_KEY). Adult playthroughs route to Grok (needs CRAZYROUTER_API_KEY)
 * — if that key isn't in your local .env.local, skip the adult ids here and let
 * them self-heal on the next played turn (the engine fix makes that safe).
 *
 * Idempotent + safe: only writes running_summary / running_summary_through.
 * Never deletes turns. Re-runnable (resumes from wherever `through` currently is).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// 1. Load .env.local into process.env BEFORE importing modules that read env at
//    module-load time (providers.ts builds the Anthropic client at load).
const envPath = resolve(process.cwd(), ".env.local");
for (const raw of readFileSync(envPath, "utf8").split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (process.env[k] === undefined) process.env[k] = v;
}

type Lang = "zh-Hant" | "zh-Hans" | "en";
type Rating = "sfw" | "soft" | "adult";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
const supabase = createClient(supabaseUrl, serviceKey);

// Dynamic-import AFTER env is loaded (providers.ts reads env at module-load).
// tsx runs this file as CJS → no top-level await, so the import + loop live in
// main() below.
type UpdateFn = typeof import("../src/lib/ai/memory/summarizer")["updateRunningSummary"];
let updateRunningSummary: UpdateFn;

// Playthroughs to repair. Non-adult only (Haiku) unless you have CRAZYROUTER_API_KEY.
const TARGETS: string[] = [
  "5c3168ff-9699-4df8-886f-11be0529646f", // 骰子覺醒 (soft · stuck at 73/117)
  "4c3c5cd7-0f9c-49ca-b91c-da9223e0be87", // 末世香港 (sfw · null/29)
];

const BATCH = 15; // fold ~15 turns per compact → clean incremental rebuild

async function repairOne(id: string) {
  const { data: pt, error: ptErr } = await supabase
    .from("playthroughs")
    .select("turn_count, running_summary_through, story_id")
    .eq("id", id)
    .single();
  if (ptErr || !pt) {
    console.error(`[repair] ${id} — playthrough not found: ${ptErr?.message}`);
    return;
  }
  const { data: story, error: sErr } = await supabase
    .from("stories")
    .select("title, content_rating, language")
    .eq("id", pt.story_id)
    .single();
  if (sErr || !story) {
    console.error(`[repair] ${id} — story not found: ${sErr?.message}`);
    return;
  }

  const turnCount = pt.turn_count as number;
  const language = (story.language as Lang) ?? "zh-Hant";
  const contentRating = (story.content_rating as Rating) ?? "sfw";
  console.log(
    `\n[repair] ${story.title} (${id})\n  rating=${contentRating} lang=${language} turns=${turnCount} startThrough=${pt.running_summary_through}`,
  );

  let guard = 0;
  while (guard++ < 100) {
    // Re-read fresh state each batch (updateRunningSummary CAS's on through).
    const { data: cur } = await supabase
      .from("playthroughs")
      .select("running_summary, running_summary_through")
      .eq("id", id)
      .single();
    const through = (cur?.running_summary_through as number) ?? 0;
    if (through >= turnCount) {
      console.log(`  ✓ done — through ${through}/${turnCount}`);
      return;
    }
    const toIndex = Math.min(through + BATCH, turnCount);
    const ok = await updateRunningSummary({
      supabase,
      playthroughId: id,
      prevSummary: (cur?.running_summary as string | null) ?? null,
      fromIndex: through,
      toIndex,
      language,
      contentRating,
    });
    if (!ok) {
      console.error(`  ✗ batch [${through},${toIndex}) failed — stopping this playthrough`);
      return;
    }
    console.log(`  → folded [${through},${toIndex})`);
  }
}

async function main() {
  const mod = await import("../src/lib/ai/memory/summarizer");
  updateRunningSummary = mod.updateRunningSummary;
  for (const id of TARGETS) {
    await repairOne(id);
  }
  console.log("\n[repair] all done.");
}

main().catch((e) => {
  console.error("[repair] fatal:", e);
  process.exit(1);
});
