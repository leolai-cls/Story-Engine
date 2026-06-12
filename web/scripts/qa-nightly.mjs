/**
 * QA 夜間自動試玩 (deep-plan 第 1 波 · Session 19 · 2026-06-12)
 *
 * 每晚自動:用 QA bot 帳號 fork 種子故事 → 真人式玩 N 回合 (行 prod 嘅真實
 * turn API · 同玩家行同一條 pipeline) → 機械指標 + AI 評審 → 寫入 qa_reports。
 *
 * 評啲乜 (對應 Session 18 嗰兩個 prod bug 嘅 bug class):
 *   1. 記憶 — 第 3/6 回合種兩粒事實 (鑰匙刻字 · 生日) · 第 25/27 回合問返 ·
 *      評審判斷敘事有冇答中 (RAG/digest/lorebook 全鏈路的 end-to-end 測試)
 *   2. 翻炒 — 相鄰 AI 回合 char-trigram 相似度 (機械) + 評審觀感
 *   3. 推進 — 故事有冇實質推進定原地踏步 (防「卡第一幕」class)
 *   4. 摘要健康 — running_summary 30 回合後必須存在 + 長度喺預算內 (防死亡螺旋)
 *   5. 失敗回合 / TTFB (sin1 搬遷後嘅真實玩家延遲數據)
 *
 * 行法: node scripts/qa-nightly.mjs   (喺 web/ 目錄 · GitHub Actions 或本機)
 * Env (QA_* 優先 · 冇就 fallback .env.local 嘅標準名):
 *   QA_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   QA_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   QA_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY
 *   QA_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY
 *   QA_TEST_EMAIL · QA_TEST_PASSWORD
 *   QA_APP_ORIGIN (default https://app.kieio.com)
 *   QA_SEED_STORY_ID (default [QA] 遺忘之劍)
 *   QA_TURNS (default 30)
 *
 * 安全: 唔落 repo 任何 key。SFW only — 永不掂成人內容 (hard rule #5 無關此路徑)。
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import fs from "node:fs";
import path from "node:path";

// ─── env (with .env.local fallback for local runs) ─────────────────────────
function loadDotEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
  return out;
}
const dotenv = loadDotEnvLocal();
const env = (...names) => {
  for (const n of names) {
    const v = process.env[n] ?? dotenv[n];
    // 清洗 BOM (U+FEFF) + 前後空白 — Windows 工具寫 secret 時可能黏入隱形字元,
    // 落到 fetch header 會炸 "ByteString ... 65279" (CI run #2 真實事故)。
    if (v) return v.replace(/﻿/g, "").trim();
  }
  return undefined;
};

const SUPABASE_URL = env("QA_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = env("QA_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY = env("QA_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_KEY = env("QA_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY");
const QA_EMAIL = env("QA_TEST_EMAIL");
const QA_PASSWORD = env("QA_TEST_PASSWORD");
const APP_ORIGIN = env("QA_APP_ORIGIN") ?? "https://app.kieio.com";
const SEED_STORY_ID = env("QA_SEED_STORY_ID") ?? "9a0eb1b8-4c10-490b-8454-7a7824ae8b3b";
const TURNS = Number(env("QA_TURNS") ?? 30);
const NIGHTLY_GRANT = 5000;

for (const [k, v] of Object.entries({ SUPABASE_URL, ANON_KEY, SERVICE_KEY, ANTHROPIC_KEY, QA_EMAIL, QA_PASSWORD })) {
  if (!v) { console.error(`missing env: ${k}`); process.exit(2); }
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── 登入 + 砌 cookie (用 @supabase/ssr 自己嘅序列化 · 零格式 drift) ─────────
async function loginAndBuildCookies() {
  const jar = new Map();
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { data, error } = await ssr.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });
  if (error) throw new Error(`login failed: ${error.message}`);
  // signInWithPassword 觸發 setAll → jar 而家有正確 chunked cookie
  if (jar.size === 0) {
    // fallback: 手動 base64url 格式 (@supabase/ssr 0.x)
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
    const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
    jar.set(`sb-${ref}-auth-token`, value);
  }
  const cookieHeader = [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
  return { cookieHeader, userId: data.user.id };
}

// ─── Anthropic helpers ──────────────────────────────────────────────────────
async function anthropic(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 防 hang:卡 2 分鐘就放棄 (上層自有 retry/降級)
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.content.find((b) => b.type === "text")?.text ?? "";
}

async function playerAction(lastNarration, myRecentActions) {
  const text = await anthropic({
    model: "claude-haiku-4-5",
    max_tokens: 150,
    system:
      "你係一個互動小說嘅測試玩家。根據最新一段故事,寫出『玩家嘅下一步行動』。" +
      "規則:繁體中文;一至兩句(40字內);具體、推進劇情;同你最近嘅行動唔好重複;" +
      "唔好寫旁白或者代AI寫結果,只寫你做咩/講咩;內容全年齡。直接出行動,唔好解釋。",
    messages: [{
      role: "user",
      content: `最新故事:\n${lastNarration.slice(-1500)}\n\n你最近嘅行動:\n${myRecentActions.slice(-3).join("\n") || "(未有)"}\n\n你嘅下一步行動:`,
    }],
  });
  return text.trim().replace(/^["「]|["」]$/g, "").slice(0, 120) || "我環顧四周,留意有冇異樣。";
}

// 記憶探針 (位置跟總回合數自動調整 · 種喺早段 · 問返喺尾段)
// 短 run (<12 回合 · smoke test) 唔做探針 · 評審跳過記憶評分。
const PROBES_ENABLED = TURNS >= 12;
const PROBE_AT = PROBES_ENABLED
  ? { plant1: 3, plant2: 6, ask1: TURNS - 5, ask2: TURNS - 3 }
  : {};
const PROBES = PROBES_ENABLED
  ? {
      [PROBE_AT.plant1]: "我喺行裝深處摸出一條刻住「北斗七星」四個字嘅黃銅舊鑰匙,望咗一眼,又小心收返好。",
      [PROBE_AT.plant2]: "我同身邊嘅同伴閒談時提起:「話時話,我生日就快到——十月初七。到時記得提我慶祝下。」",
      [PROBE_AT.ask1]: "我攞返之前收好嗰條黃銅舊鑰匙出嚟細睇——上面刻住嘅究竟係咩字?",
      [PROBE_AT.ask2]: "我問身邊嗰位同伴:「你仲記唔記得我生日係幾月幾號?」",
    }
  : {};

// ─── 行一個回合 (prod turn API · 同玩家同一條路) ────────────────────────────
async function playTurn(playthroughId, action, cookieHeader) {
  const t0 = Date.now();
  let ttfb = null;
  let res;
  try {
    res = await fetch(`${APP_ORIGIN}/api/playthroughs/${playthroughId}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ action }),
      // 防 hang (首個 30-turn run 真實事故:第 27 回合 fetch 永久卡死,成個 run 收唔到尾):
      // turn route maxDuration=300s · 我哋俾 320s 就放棄當失敗 · 上層有 retry。
      signal: AbortSignal.timeout(320_000),
    });
  } catch (e) {
    return { ok: false, status: 0, error: `fetch failed/timeout: ${String(e).slice(0, 200)}`, ms: Date.now() - t0 };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: body.slice(0, 400), ms: Date.now() - t0 };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", narration = "", streamError = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let i;
      while ((i = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "text-delta" && typeof ev.delta === "string") {
            if (ttfb === null) ttfb = Date.now() - t0;
            narration += ev.delta;
          } else if (ev.type === "error") {
            streamError = ev.errorText ?? "stream error";
          }
        } catch { /* 非 JSON frame 忽略 */ }
      }
    }
  } catch (e) {
    // 串流中途斷線 / 超時 abort — 當失敗回合處理 (上層 retry)
    return { ok: false, status: res.status, error: `stream aborted: ${String(e).slice(0, 200)}`, ms: Date.now() - t0, ttfb };
  }
  const ms = Date.now() - t0;
  if (streamError) return { ok: false, status: 200, error: streamError, ms, ttfb };
  if (!narration.trim()) return { ok: false, status: 200, error: "empty narration", ms, ttfb };
  return { ok: true, narration, ms, ttfb };
}

// ─── 機械指標 ────────────────────────────────────────────────────────────────
function trigrams(s) {
  const t = new Set();
  const c = s.replace(/\s/g, "");
  for (let i = 0; i < c.length - 2; i++) t.add(c.slice(i, i + 3));
  return t;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[qa] start · seed=${SEED_STORY_ID} · turns=${TURNS} · target=${APP_ORIGIN}`);
  const { cookieHeader, userId } = await loginAndBuildCookies();
  console.log(`[qa] logged in as ${userId}`);

  // 補幣 (hard rule #4 — 經 ledger 函數)
  const { data: bal, error: grantErr } = await admin.rpc("qa_grant_credits", {
    p_user: userId, p_amount: NIGHTLY_GRANT, p_note: `nightly_${new Date().toISOString().slice(0, 10)}`,
  });
  if (grantErr) console.warn(`[qa] grant failed (continuing): ${grantErr.message}`);
  else console.log(`[qa] credits topped up → ${bal}`);

  // 清走 7 日前嘅舊 QA playthrough
  await admin.from("playthroughs").delete().eq("user_id", userId)
    .lt("created_at", new Date(Date.now() - 7 * 864e5).toISOString());

  // fork 今晚嘅 playthrough (以 QA 用戶身份 · 行 RLS)
  const user = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signin, error: siErr } = await user.auth.signInWithPassword({ email: QA_EMAIL, password: QA_PASSWORD });
  if (siErr) throw new Error(`user signin failed: ${siErr.message}`);
  const { data: forked, error: forkErr } = await user.rpc("fork_story_to_playthrough", {
    p_story_id: SEED_STORY_ID,
    p_character_name: "阿研",
    p_llm_model: "claude-sonnet-4-6",
    p_llm_provider: "anthropic",
  });
  if (forkErr) throw new Error(`fork failed: ${forkErr.message}`);
  const playthroughId = Array.isArray(forked) ? forked[0]?.playthrough_id : forked?.playthrough_id;
  if (!playthroughId) throw new Error("fork returned no playthrough id");
  console.log(`[qa] playthrough ${playthroughId}`);

  // 攞開場白做 player agent 嘅起點
  const { data: opening } = await admin.from("turns").select("text").eq("playthrough_id", playthroughId).eq("turn_index", 0).single();
  let lastNarration = opening?.text ?? "(故事開始)";

  const myActions = [];
  const turnLog = []; // {i, action, ok, ms, ttfb, status?, error?, len}
  let consecutiveFailures = 0;

  for (let i = 1; i <= TURNS; i++) {
    const action = PROBES[i] ?? (await playerAction(lastNarration, myActions));
    myActions.push(action);
    let r = await playTurn(playthroughId, action, cookieHeader);
    if (!r.ok) {
      console.warn(`[qa] turn ${i} failed (${r.status}): ${String(r.error).slice(0, 160)} — retry in 8s`);
      await new Promise((s) => setTimeout(s, 8000));
      r = await playTurn(playthroughId, action, cookieHeader);
    }
    turnLog.push({ i, action, ok: r.ok, ms: r.ms, ttfb: r.ttfb ?? null, status: r.status, error: r.ok ? undefined : String(r.error).slice(0, 300), len: r.ok ? r.narration.length : 0 });
    if (r.ok) {
      lastNarration = r.narration;
      consecutiveFailures = 0;
      console.log(`[qa] turn ${i}/${TURNS} ok · ttfb=${r.ttfb}ms · total=${r.ms}ms · ${r.narration.length} chars`);
    } else {
      consecutiveFailures++;
      console.error(`[qa] turn ${i}/${TURNS} FAILED: ${String(r.error).slice(0, 200)}`);
      if (consecutiveFailures >= 3) { console.error("[qa] 3 consecutive failures — aborting run"); break; }
    }
    await new Promise((s) => setTimeout(s, 3000));
  }

  // ─── 收數據 ───
  const { data: turns } = await admin.from("turns")
    .select("turn_index, role, text")
    .eq("playthrough_id", playthroughId)
    .order("turn_index", { ascending: true });
  const { data: pt } = await admin.from("playthroughs")
    .select("running_summary, turn_count")
    .eq("id", playthroughId).single();

  const aiTurns = (turns ?? []).filter((t) => t.role === "ai" && t.turn_index > 0);
  const okTurns = turnLog.filter((t) => t.ok);
  const failures = turnLog.filter((t) => !t.ok).length;

  // 翻炒 (機械)
  let maxSim = 0, highSimPairs = 0, sameOpenings = 0;
  for (let i = 1; i < aiTurns.length; i++) {
    const sim = jaccard(trigrams(aiTurns[i - 1].text ?? ""), trigrams(aiTurns[i].text ?? ""));
    if (sim > maxSim) maxSim = sim;
    if (sim > 0.35) highSimPairs++;
    if ((aiTurns[i - 1].text ?? "").slice(0, 12) === (aiTurns[i].text ?? "").slice(0, 12)) sameOpenings++;
  }
  const ttfbs = okTurns.map((t) => t.ttfb).filter((x) => x != null).sort((a, b) => a - b);
  const med = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);
  const digestLen = (pt?.running_summary ?? "").length;

  const metrics = {
    turns_attempted: turnLog.length,
    turns_ok: okTurns.length,
    failures,
    ttfb_median_ms: med(ttfbs),
    ttfb_p90_ms: ttfbs.length ? ttfbs[Math.floor(ttfbs.length * 0.9)] : null,
    total_median_ms: med(okTurns.map((t) => t.ms).sort((a, b) => a - b)),
    repetition_max_trigram_sim: Number(maxSim.toFixed(3)),
    repetition_high_pairs: highSimPairs,
    repetition_same_openings: sameOpenings,
    digest_present: digestLen > 0,
    digest_chars: digestLen,
    avg_narration_chars: aiTurns.length ? Math.round(aiTurns.reduce((s, t) => s + (t.text?.length ?? 0), 0) / aiTurns.length) : 0,
  };

  // ─── AI 評審 (Sonnet · 結構輸出) ───
  const transcript = aiTurns.map((t) => `【第${t.turn_index}回合】${(t.text ?? "").slice(0, 700)}`).join("\n\n");
  const playerLines = turnLog.map((t) => `【第${t.i}回合·玩家】${t.action}`).join("\n");
  let judge = {};
  try {
    const judgeText = await anthropic({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              memory_probe_key: { type: "integer", enum: [0, 1], description: "第25回合敘事有冇正確記得鑰匙刻住「北斗七星」(1=記得)" },
              memory_probe_birthday: { type: "integer", enum: [0, 1], description: "第27回合敘事有冇正確記得生日係十月初七 (1=記得)" },
              coherence: { type: "integer", description: "整體連貫一致 0-10 (人物/地點/事實有冇穿崩)" },
              progression: { type: "integer", description: "劇情實質推進 0-10 (0=原地踏步/卡死)" },
              repetition: { type: "integer", description: "10=完全冇翻炒重複, 0=嚴重翻炒" },
              notable_issues: { type: "array", items: { type: "string" }, description: "最多5個具體問題 (引用回合號)" },
            },
            required: ["memory_probe_key", "memory_probe_birthday", "coherence", "progression", "repetition", "notable_issues"],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: "user",
        content:
          (PROBES_ENABLED
            ? `你係互動小說品質評審。下面係一個自動測試局:玩家喺第${PROBE_AT.plant1}回合收起一條刻住「北斗七星」嘅黃銅鑰匙、第${PROBE_AT.plant2}回合講咗生日係十月初七;第${PROBE_AT.ask1}回合問返鑰匙刻字、第${PROBE_AT.ask2}回合問返生日。請按 schema 評分。\n\n`
            : `你係互動小說品質評審。下面係一個短測試局(冇記憶探針):memory_probe 兩項一律填 1 (不適用),其餘照評。\n\n`) +
          `=== 玩家行動 ===\n${playerLines}\n\n=== AI 敘事 ===\n${transcript.slice(0, 60000)}`,
      }],
    });
    judge = JSON.parse(judgeText);
  } catch (e) {
    judge = { error: String(e).slice(0, 300) };
    console.warn(`[qa] judge failed: ${judge.error}`);
  }

  // ─── 紅黃綠燈 ───
  const issues = [];
  if (failures >= 3) issues.push(`失敗回合 ${failures} 次`);
  if (!metrics.digest_present && okTurns.length >= 12) issues.push("30回合後滾動摘要不存在 (死亡螺旋 class)");
  if (metrics.digest_chars > 4500) issues.push(`摘要過長 ${metrics.digest_chars} 字 (預算內應 <~4500)`);
  if (judge.memory_probe_key === 0) issues.push("記憶探針①失敗:唔記得鑰匙刻字");
  if (judge.memory_probe_birthday === 0) issues.push("記憶探針②失敗:唔記得生日");
  if ((judge.progression ?? 10) <= 3) issues.push("劇情原地踏步 (卡幕 class)");
  if ((judge.coherence ?? 10) <= 4) issues.push("連貫性差 (穿崩)");
  if (highSimPairs >= 3 || (judge.repetition ?? 10) <= 4) issues.push("翻炒重複偏高");
  for (const x of judge.notable_issues ?? []) issues.push(`評審: ${x}`);

  let verdict = "green";
  // 劇情推進/連貫 紅燈只適用於正式長度 run (>=12 回合) — 3 回合 smoke 推進低係正常
  const fullRun = okTurns.length >= 12;
  const redConds = [
    failures >= 3,
    fullRun && !metrics.digest_present,
    fullRun && judge.memory_probe_key === 0 && judge.memory_probe_birthday === 0,
    fullRun && (judge.progression ?? 10) <= 3,
    fullRun && (judge.coherence ?? 10) <= 4,
  ];
  const amberConds = [
    failures > 0,
    judge.memory_probe_key === 0 || judge.memory_probe_birthday === 0,
    highSimPairs >= 3 || (judge.repetition ?? 10) <= 4,
    metrics.digest_chars > 4500,
    judge.error != null,
  ];
  if (redConds.some(Boolean)) verdict = "red";
  else if (amberConds.some(Boolean)) verdict = "amber";

  const { error: repErr } = await admin.from("qa_reports").insert({
    playthrough_id: playthroughId,
    turns_played: okTurns.length,
    verdict,
    metrics,
    judge,
    issues,
  });
  if (repErr) console.error(`[qa] report insert failed: ${repErr.message}`);

  console.log("\n========== QA NIGHTLY REPORT ==========");
  console.log(`verdict: ${verdict.toUpperCase()}`);
  console.log(JSON.stringify({ metrics, judge, issues }, null, 1));
  console.log("=======================================");

  if (verdict === "red") process.exit(1);
}

main().catch((e) => { console.error(`[qa] fatal: ${e?.stack ?? e}`); process.exit(1); });
