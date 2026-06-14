/**
 * Character design-sheet model bake-off (Wave 3 · 2026-06-14).
 *
 * Founder wants「設定圖」(character model sheets · turnaround + expression sheet +
 * wardrobe + palette + cinematic portrait) like the gpt-image-2 references they
 * shared. BUT our platform routes images through CrazyRouter, where gpt-image-2
 * is broken (falls back to grok-4-image) and we can't use OpenAI direct (HK).
 *
 * This runs the SAME character-sheet prompt across every candidate CrazyRouter
 * image model so we can SEE which one our platform can actually produce — verify,
 * don't guess (hard rule #38). Same pattern as the M1 embed bake-off.
 *
 * Run:  node scripts/sheet-bakeoff.mjs        (from web/)
 * Out:  scripts/sheet-bakeoff/<model>.png  + a console table of ok/fail/timing.
 * Cost: ~$0.04-0.05 per successful image · ~$0.3 total. Scratch · not committed.
 */
import fs from "fs";
import path from "path";

let env = "";
for (const p of [".env.local", ".env"]) {
  try {
    env = fs.readFileSync(p, "utf8");
    if (env) break;
  } catch {
    /* next */
  }
}
const key = (env.match(/CRAZYROUTER_API_KEY\s*=\s*"?([^"\r\n]+)"?/) || [])[1]?.trim();
if (!key) {
  console.error("CRAZYROUTER_API_KEY not found in .env.local / .env");
  process.exit(1);
}

// Character-sheet prompt — adapted from the founder's proven template structure
// (turnaround + expression sheet + wardrobe/prop close-ups + height chart +
// palette), concrete wuxia character to also test Chinese-market aesthetic.
const PROMPT = `Character design sheet (model sheet) on a light grey grid-paper background, formal character-design document layout, art-directed (not an evenly-spaced grid).

CHARACTER — Name: Lin Si-Nga (連思雅), Alias: "The Silent Bloom". Age 26. A calm, observant wuxia strategist. Slim athletic build, fair skin, shoulder-length black hair in a half-up style with a jade hairpin, sharp dark almond eyes, a small scar through the left eyebrow. Wears dark teal hanfu-inspired combat robes with bronze armour accents and a deep-red sash, black boots; carries a folding war fan.

LAYOUT PANELS:
- Centre: full-body TURNAROUND — front view, 3/4 view, side view, back view — IDENTICAL proportions, face and costume across all views, no drift.
- Expression sheet: six head studies (neutral, determined, surprised, faint smirk, sorrow, battle-ready), captured mid-emotion.
- Wardrobe + prop close-ups: the folding war fan detail, the bronze armour accent, the boots.
- Height comparison chart (168 cm).
- Colour palette swatches with labels.

STYLE: high-quality anime concept-art, clean linework, soft cel-shading, cinematic lighting, high detail. STRICT CONSISTENCY: the same face, proportions and costume across every view and panel.`;

// Candidate image models on CrazyRouter (from /v1/models · 2026-06-14).
const MODELS = [
  "gpt-image-2", // founder's references used this — reconfirm if it works on CR
  "grok-4-image", // our current platform default (baseline)
  "nano-banana-pro", // Google · strong character consistency
  "nano-banana-2", // Google
  "doubao-seedream-4-0", // ByteDance · strong layout + Chinese
  "doubao-seedream-5-0", // ByteDance · newest
  "qwen-image-max", // Alibaba · Chinese-native
];

const SIZES = ["1536x1024", "1024x1024"]; // wide sheet first, fall back smaller
const OUT = "scripts/sheet-bakeoff";
fs.mkdirSync(OUT, { recursive: true });

async function gen(model) {
  for (const size of SIZES) {
    const t0 = Date.now();
    try {
      const r = await fetch("https://crazyrouter.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          "X-Title": "Kieio",
        },
        body: JSON.stringify({ model, prompt: PROMPT, size, n: 1 }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!r.ok) {
        let e = {};
        try {
          e = await r.json();
        } catch {
          /* ignore */
        }
        const msg = e?.error?.message || "HTTP " + r.status;
        if (/size|dimension|width|height|resolution/i.test(msg) && size !== SIZES[SIZES.length - 1]) {
          console.log(`[${model}] size ${size} rejected → retrying smaller`);
          continue;
        }
        return { model, ok: false, msg: `${r.status}: ${msg}`.slice(0, 220) };
      }
      const j = await r.json();
      const d = j?.data?.[0];
      let buf;
      if (d?.b64_json) buf = Buffer.from(d.b64_json, "base64");
      else if (d?.url) {
        const ir = await fetch(d.url, { signal: AbortSignal.timeout(60_000) });
        buf = Buffer.from(await ir.arrayBuffer());
      } else return { model, ok: false, msg: "no image data in response" };
      const file = path.join(OUT, `${model}.png`);
      fs.writeFileSync(file, buf);
      return { model, ok: true, size, ms: Date.now() - t0, kb: Math.round(buf.length / 1024), file };
    } catch (e) {
      return { model, ok: false, msg: String(e?.message || e).slice(0, 220) };
    }
  }
}

console.log(`Bake-off: ${MODELS.length} models · prompt ${PROMPT.length} chars\n`);
const settled = await Promise.allSettled(MODELS.map(gen));
console.log("\n──── RESULTS ────");
for (const s of settled) {
  const v = s.value || s.reason;
  if (v.ok) console.log(`✅ ${v.model.padEnd(20)} ${v.size}  ${v.ms}ms  ${v.kb}KB  → ${v.file}`);
  else console.log(`❌ ${String(v.model).padEnd(20)} ${v.msg}`);
}
