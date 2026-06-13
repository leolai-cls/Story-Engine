/**
 * 中文記憶引擎離線基準 — 記憶手術 M1 prep (Session 19 · 2026-06-13)
 *
 * 量度「叫 AI 搵返相關情節」嗰對眼有幾準。用真實 playthrough 回合自動生成金標準
 * 探題,計 recall@5 / MRR。現有引擎 (model A = text-embedding-3-small) 嘅 baseline
 * 而家就 run 到;有候選中文引擎 (model B) 時設 EMBED_CANDIDATE_MODEL 就出 A vs B 對比。
 *
 * ⚠️ M1 換引擎本身仍然 BLOCKED:要 founder 先 (a) 確認 CrazyRouter / 阿里有冇一隻
 * 中文更強、**1536 維** 嘅引擎,(b) 拍板換。呢個 script 係攞「證據」嘅工具,唔係換。
 * 換 = 改 embed.ts:25 一個 const + MODEL_PRICING + 全量重新 embed (真正成本喺重embed)。
 *
 * 行法 (web/ 目錄):
 *   node scripts/embed-benchmark.mjs                      # 只 run model A baseline
 *   EMBED_CANDIDATE_MODEL=<slug> node scripts/embed-benchmark.mjs   # A vs B 對比
 *   EMBED_BENCH_PLAYTHROUGH=<uuid> ...                    # 指定局 (default: QA bot 最新局)
 *   EMBED_BENCH_PROBES=20 ...                             # 探題數 (default 15)
 *
 * Env (跟 qa-nightly 同一套 · QA_* 優先 · fallback .env.local):
 *   QA_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL · QA_SUPABASE_SERVICE_ROLE_KEY /
 *   SUPABASE_SERVICE_ROLE_KEY · QA_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY ·
 *   CRAZYROUTER_API_KEY (embedding 行 CrazyRouter · 同 prod embed.ts 一樣)。
 *
 * 金標準快取:scripts/.embed-bench-gold-<pt>.json (生成一次 · 之後 reuse · founder
 * 可手改 relevance)。
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// ─── env ─────────────────────────────────────────────────────────────────
function loadDotEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "").replace(/﻿/g, "");
  }
  return out;
}
const dotenv = loadDotEnvLocal();
const env = (...names) => {
  for (const n of names) {
    const v = process.env[n] ?? dotenv[n];
    if (v) return v.replace(/﻿/g, "").trim();
  }
  return undefined;
};

const SUPABASE_URL = env("QA_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = env("QA_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_KEY = env("QA_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY");
const CRKEY = env("CRAZYROUTER_API_KEY");
const MODEL_A = env("EMBED_MODEL_A") ?? "text-embedding-3-small";
const MODEL_B = env("EMBED_CANDIDATE_MODEL"); // 候選 · 冇就只 run A baseline
const PROBES = Number(env("EMBED_BENCH_PROBES") ?? 15);
const PT_OVERRIDE = env("EMBED_BENCH_PLAYTHROUGH");

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, ANTHROPIC_KEY, CRKEY })) {
  if (!v) { console.error(`missing env: ${k}`); process.exit(2); }
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── embedding (CrazyRouter · OpenAI-compatible · same as prod embed.ts) ───
async function embedBatch(model, texts) {
  const res = await fetch("https://crazyrouter.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CRKEY}`, "X-Title": "Kieio" },
    body: JSON.stringify({ model, input: texts.map((t) => t.slice(-8000)) }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`embed ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

async function haiku(system, prompt, maxTokens = 200) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = await res.json();
  return json.content.find((b) => b.type === "text")?.text ?? "";
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ─── 金標準:為 K 個抽中嘅回合,生成「玩家問返呢個回合內容」嘅探題 ───────────
async function buildGoldSet(turns) {
  const goldPath = path.join(process.cwd(), "scripts", `.embed-bench-gold-${PT}.json`);
  if (fs.existsSync(goldPath)) {
    console.log(`[bench] 用快取金標準 ${goldPath}`);
    return JSON.parse(fs.readFileSync(goldPath, "utf8"));
  }
  // 抽分散嘅 AI 回合 (有實質內容嘅) 做 gold target
  const aiTurns = turns.filter((t) => t.role === "ai" && (t.text?.length ?? 0) > 120);
  const step = Math.max(1, Math.floor(aiTurns.length / PROBES));
  const picks = [];
  for (let i = 0; i < aiTurns.length && picks.length < PROBES; i += step) picks.push(aiTurns[i]);

  const gold = [];
  for (const t of picks) {
    try {
      const q = await haiku(
        "你係測試出題員。睇一段故事敘事,寫一句『玩家之後想問返/提返呢段嘢』嘅短輸入(繁中,20字內,具體指向呢段獨有嘅人/物/事,唔好太空泛)。淨係出嗰句,唔好解釋。",
        `敘事:\n${t.text.slice(0, 1500)}\n\n玩家之後提返呢段嘅一句話:`,
        80,
      );
      const query = q.trim().replace(/^["「]|["」]$/g, "").slice(0, 80);
      if (query) gold.push({ query, gold_turn_index: t.turn_index });
    } catch (e) {
      console.warn(`[bench] gold gen skip turn ${t.turn_index}: ${e.message}`);
    }
  }
  fs.writeFileSync(goldPath, JSON.stringify(gold, null, 2));
  console.log(`[bench] 生成 ${gold.length} 條金標準 → ${goldPath} (可手改 relevance)`);
  return gold;
}

// ─── 評分:query 對全 corpus 排序,gold 回合喺 top-5 嗎 ───────────────────────
function scoreModel(queryVecs, corpusVecs, corpusIdx, gold) {
  let recallHits = 0, mrrSum = 0;
  for (let i = 0; i < gold.length; i++) {
    const qv = queryVecs[i];
    const ranked = corpusVecs
      .map((cv, j) => ({ idx: corpusIdx[j], sim: cosine(qv, cv) }))
      .sort((a, b) => b.sim - a.sim);
    const rank = ranked.findIndex((r) => r.idx === gold[i].gold_turn_index);
    if (rank >= 0 && rank < 5) recallHits++;
    if (rank >= 0) mrrSum += 1 / (rank + 1);
  }
  return { recallAt5: recallHits / gold.length, mrr: mrrSum / gold.length };
}

let PT;
async function main() {
  // 揀局
  if (PT_OVERRIDE) PT = PT_OVERRIDE;
  else {
    const { data } = await admin
      .from("playthroughs")
      .select("id, turn_count")
      .order("turn_count", { ascending: false })
      .limit(1);
    PT = data?.[0]?.id;
  }
  if (!PT) { console.error("搵唔到 playthrough — 設 EMBED_BENCH_PLAYTHROUGH"); process.exit(2); }

  const { data: turns } = await admin
    .from("turns")
    .select("turn_index, role, text, failed")
    .eq("playthrough_id", PT)
    .order("turn_index", { ascending: true });
  const corpus = (turns ?? []).filter((t) => !t.failed && (t.text?.length ?? 0) > 40);
  console.log(`[bench] playthrough ${PT} · ${corpus.length} 個 corpus 回合 · 探題 ${PROBES}`);
  if (corpus.length < 10) { console.error("回合太少 · 揀一個玩得長嘅局"); process.exit(2); }

  const gold = await buildGoldSet(corpus);
  if (gold.length < 5) { console.error("金標準太少"); process.exit(2); }

  const corpusTexts = corpus.map((t) => t.text);
  const corpusIdx = corpus.map((t) => t.turn_index);
  const queries = gold.map((g) => g.query);

  // Model A
  console.log(`[bench] 嵌入 corpus + 探題 with A=${MODEL_A} ...`);
  const aCorpus = await embedBatch(MODEL_A, corpusTexts);
  const aQueries = await embedBatch(MODEL_A, queries);
  if (aCorpus[0].length !== 1536) console.warn(`⚠️ A 維度 ${aCorpus[0].length} ≠ 1536`);
  const aScore = scoreModel(aQueries, aCorpus, corpusIdx, gold);

  console.log("\n========== 記憶引擎基準 ==========");
  console.log(`局: ${PT} · corpus ${corpus.length} · 探題 ${gold.length}`);
  console.log(`模型                              維度   recall@5   MRR`);
  console.log(`A: ${MODEL_A.padEnd(30)} ${String(aCorpus[0].length).padStart(4)}   ${(aScore.recallAt5 * 100).toFixed(1).padStart(6)}%  ${aScore.mrr.toFixed(3)}`);

  if (MODEL_B) {
    console.log(`[bench] 嵌入 corpus + 探題 with B=${MODEL_B} ...`);
    try {
      const bCorpus = await embedBatch(MODEL_B, corpusTexts);
      const bQueries = await embedBatch(MODEL_B, queries);
      const bDim = bCorpus[0].length;
      const bScore = scoreModel(bQueries, bCorpus, corpusIdx, gold);
      console.log(`B: ${MODEL_B.padEnd(30)} ${String(bDim).padStart(4)}   ${(bScore.recallAt5 * 100).toFixed(1).padStart(6)}%  ${bScore.mrr.toFixed(3)}`);
      if (bDim !== 1536) {
        console.log(`\n⚠️ B 維度 = ${bDim} ≠ 1536 → 換佢要改資料庫 vector(N) + 全量重embed (大工程 · 唔係一行)。`);
      } else {
        const better = bScore.recallAt5 > aScore.recallAt5;
        console.log(`\n${better ? "✅ B 較強" : "➖ B 唔見得較強"} (recall@5 ${(bScore.recallAt5 * 100).toFixed(1)}% vs ${(aScore.recallAt5 * 100).toFixed(1)}%) · 維度 1536 相容 → 換 = 改一行 + 重embed。`);
      }
    } catch (e) {
      console.log(`B: ${MODEL_B} — 失敗: ${e.message} (CrazyRouter 可能冇呢隻 / 唔係 embedding model)`);
    }
  } else {
    console.log(`\n(只 run 咗 A baseline · 設 EMBED_CANDIDATE_MODEL=<slug> 出 A vs B 對比)`);
  }
  console.log("==================================");
}

main().catch((e) => { console.error(`[bench] fatal: ${e?.stack ?? e}`); process.exit(1); });
