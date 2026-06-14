/**
 * End-to-end proof of the adaptive character-sheet ARCHITECTURE (Wave 3).
 * Runs the REAL composeCharacterSheetPrompt() (LLM) → generateFalImage() (fal
 * gpt-image-2) for two contrasting character/world/style combos, to verify the
 * one architecture fuses different characters · worlds · styles (founder pt 1).
 *
 * Run:  npx tsx scripts/sheet-compose-test.ts   (from web/)
 */
import fs from "fs";
import path from "path";

// Load .env.local into process.env BEFORE importing modules that read it.
const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const CASES = [
  {
    save: "compose-cyberpunk.png",
    styleKey: "cyberpunk" as const,
    storyTitle: "霓虹債務",
    storyDescription:
      "2099 年香港九龍,義體黑客同企業傭兵喺霓虹雨夜搏命。賽博龐克。",
    character: {
      name: "周梓朗 (Chow Tsz-Long)",
      role: "義體黑客",
      personality_traits: ["冷靜", "多疑", "重義氣"],
      backstory: "前企業安全專家,被出賣後流落地下世界,靠駭入維生。",
      core_motivation: "揾出當年出賣佢嘅人。",
      visual_description:
        "Late-20s East Asian man, lean, short messy black hair with a shaved undercut, cybernetic left eye glowing faint cyan, fingerless gloves, dark techwear jacket with neon-green circuit trim, a forearm hacking deck.",
    },
  },
  {
    save: "compose-romance.png",
    styleKey: "kr-webtoon" as const,
    storyTitle: "放學後的結他社",
    storyDescription: "現代台北高中,音樂社團嘅青春戀愛日常。",
    character: {
      name: "陳曉彤 (Chen Xiao-Tong)",
      role: "結他社學姊",
      personality_traits: ["溫柔", "有少少慢熱", "認真"],
      backstory: "從細學古典結他,夢想夾 band,默默暗戀社團學弟。",
      core_motivation: "鼓起勇氣表白 + 帶社團出 show。",
      visual_description:
        "17-year-old Taiwanese girl, slender, warm fair skin, long wavy chestnut-brown hair, gentle hazel eyes, navy-and-white school uniform with a soft cardigan, carries an acoustic guitar.",
    },
  },
];

const H = (s: string) => console.log("\n──── " + s + " ────");

async function main() {
  const { composeCharacterSheetPrompt } = await import(
    "../src/lib/ai/character-sheet-prompt"
  );
  const { generateFalImage } = await import("../src/lib/ai/fal-image");

  for (const c of CASES) {
  const t0 = Date.now();
  H(c.save + "  (" + c.styleKey + ")");
  const prompt = await composeCharacterSheetPrompt({
    character: c.character,
    storyTitle: c.storyTitle,
    storyDescription: c.storyDescription,
    styleKey: c.styleKey,
    contentRating: "sfw",
  });
  const looksTemplate = prompt.includes("A single character DESIGN SHEET");
  console.log(
    "composed prompt (" +
      prompt.length +
      " chars · " +
      (looksTemplate ? "TEMPLATE fallback — LLM compose failed locally" : "LLM-composed") +
      "):\n" +
      prompt.slice(0, 700) +
      (prompt.length > 700 ? "…" : ""),
  );
  const r = await generateFalImage({
    prompt,
    width: 1536,
    height: 1024,
    quality: "high",
    outputFormat: "png",
  });
  if (r.ok) {
    const out = path.join("scripts/sheet-bakeoff", c.save);
    fs.writeFileSync(out, Buffer.from(r.imageBase64, "base64"));
    console.log(
      "✅ " + ((Date.now() - t0) / 1000 | 0) + "s · saved " + out,
    );
  } else {
    console.log("❌ " + r.reason + ": " + r.message);
  }
  }
}

main();
