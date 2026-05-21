import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { anthropicProvider } from "../providers";
import { DEFAULT_DIRECTOR } from "../models";
import { embedTextSafe } from "../embed";

/**
 * Summarizer — Phase 2 memory layer (tier 2: rolling summaries).
 *
 * Every 20 turns (configurable), compresses the just-completed block into
 * a 2-4 paragraph summary capturing:
 *   - Key events
 *   - Relationship shifts
 *   - Decisions / commitments the player made
 *   - Story progression
 *
 * Uses Haiku 4.5 (cheap, ~$0.001 per rollup) — model is good enough for
 * compression, and Sonnet pricing would burn budget on every 20 turns.
 *
 * Strategy: inline fire-and-forget from turn route's onFinish. Adds ~1-2s
 * to post-stream work but doesn't block client (stream already sent).
 *
 * Idempotent: checks existing summaries first — if the next 20-turn block
 * is already summarized (e.g., from a retried turn) it skips.
 */

const TURNS_PER_BLOCK = 20;
/**
 * AUDIT FIX (P2-UX-C-01): First summary triggered at turn 10 instead of 20.
 * Player needs to FEEL the memory layer engage within the first session
 * (~10-15 minutes of play) before they churn. Was: 20 turns ≈ 30-45 min of
 * desert during which Phase 2 was invisible. Now: first rollup at turn 10
 * gives the next batch of turns real long-term context. After that,
 * standard 20-turn cadence resumes.
 */
const FIRST_BLOCK_TURNS = 10;
const SUMMARIZER_MODEL = DEFAULT_DIRECTOR; // Haiku 4.5

type StoryLanguage = "zh-Hant" | "zh-Hans" | "en";

/**
 * AUDIT FIX (P2-UX-H-04 + P2-UX-H-09): locale-aware summarizer system prompts
 * + emotional texture preserved.
 *
 * H-04: Previous prompt forced "客觀紀實，唔加 fluff" + "唔好引用對白" +
 * "每段 1-3 句" → produced robotic CliffNotes. Romance/drama playthroughs
 * lost the emotional texture that makes "AI remembers" feel meaningful.
 * Now: explicitly KEEP 1-2 emotionally-weighted concrete details per
 * paragraph, allow ONE pivotal quoted line, 1-4 sentences per paragraph.
 *
 * H-09: SUMMARIZER_SYSTEM was hard-coded 繁中 → 簡中/EN playthroughs got
 * 繁中 summaries injected into Narrator → character set drift, Narrator
 * code-switching mid-paragraph. Now: branch by story.story_bible.hard_locked.language.
 */
function summarizerSystemPrompt(language: StoryLanguage): string {
  if (language === "en") {
    return `You are Story Engine's memory archivist. Compress the last 20 turns into a 2-4 paragraph summary that the next Narrator can use for coherence.

What to capture:
- Major events (what you did, NPC reactions, scene changes)
- Relationship / emotional shifts (trust / romance / fear / respect)
- Player's promises / decisions / public stances
- Story arc progression

Style:
- Second-person POV ("you...") — consistent voice
- Preserve 1-2 emotionally-weighted concrete details per paragraph (a smile, a turning sentence, a small gesture) — DON'T strip texture
- 2-4 paragraphs, 1-4 sentences each
- ONE pivotal quoted line per paragraph is OK if it was a turning point
- Concept-level summary on the rest — not a transcript

Don't:
- Invent things that didn't happen
- Editorialize / add opinions
- List what the player could do next
- Use "the player" — always "you"`;
  }
  if (language === "zh-Hans") {
    return `你是 Story Engine 的 memory archivist。将最近 20 个 turn 的叙事压缩成 2-4 段摘要，给未来 turn 的 Narrator 用来保持连贯性。

要 capture：
- 主要事件（玩家做了什么、NPC 反应、场景变化）
- 关系 / 情感变化（信任 / 浪漫 / 仇恨 / 尊重等）
- 玩家做出的承诺 / 决定 / 公开立场
- 故事进展 (story arc)

风格：
- 简中第二人称写法保持一致（"你..."）
- **保留 1-2 个有情感重量的具体细节** 每段（一个笑容、一句关键说话、一个小动作）— 不要把 texture stripped 走
- 2-4 段，每段 1-4 句
- **如果对白是关键转折点，可以引用一句**（每段最多一句）
- 其他部分用 concept-level 描述，不是 transcript

不要做的事：
- 不要 invent 东西
- 不要评论 / 加个人意见
- 不要 list 玩家以后可以做什么
- 不要用 "玩家" / "the player" — 永远用 "你"`;
  }
  // Default: zh-Hant
  return `你係 Story Engine 嘅 memory archivist。將最近 20 個 turn 嘅敘事壓縮成 2-4 段摘要，畀未來 turn 嘅 Narrator 用嚟保持連貫性。

要 capture：
- 主要事件（玩家做咗咩、NPC 反應、場景變化）
- 關係 / 情感變化（信任 / 浪漫 / 仇恨 / 尊重等）
- 玩家做出嘅承諾 / 決定 / 公開立場
- 故事進展 (story arc)

風格：
- 繁中第二人稱寫法保持一致（"你..."）
- **保留 1-2 個有情感重量嘅具體細節**每段（一個笑容、一句關鍵說話、一個小動作）— **唔好** 將 texture stripped 走
- 2-4 段，每段 1-4 句
- **如果對白係 pivotal turning point，可以引用一句**（每段最多一句）
- 其他用 concept-level 描述，唔係 transcript

唔好做嘅嘢：
- 唔好 invent 嘢
- 唔好評論 / 加個人意見
- 唔好 list 玩家以後可以做咩
- 唔好用 "玩家" / "the player" — 永遠用 "你"`;
}

type TurnRow = {
  turn_index: number;
  role: "user" | "ai";
  text: string;
};

/**
 * Check if a new 20-turn block is ready to summarize and trigger the rollup.
 * Idempotent — if the next block is already done, this is a fast no-op.
 *
 * Returns true if a summarization actually ran (telemetry / debugging).
 */
export async function maybeRunSummarization(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  currentMaxTurnIndex: number;
  /** Story language for locale-aware summary prompt (P2-UX-H-09). */
  language?: StoryLanguage;
}): Promise<boolean> {
  const { supabase, playthroughId, currentMaxTurnIndex, language = "zh-Hant" } = params;

  // Find highest turn_index already covered by an existing summary.
  let maxSummarized = 0;
  try {
    const { data, error } = await supabase
      .from("memory_summaries")
      .select("turn_range")
      .eq("playthrough_id", playthroughId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      // Most likely the table doesn't exist yet (migration 0004 not applied).
      // Silent no-op — turn pipeline continues.
      const msg = String(error.message ?? "");
      if (/relation .* does not exist/i.test(msg)) {
        console.warn(
          "[summarizer] memory_summaries table missing — apply migration 0004 to enable rolling summaries",
        );
        return false;
      }
      throw error;
    }

    if (data && data.length > 0) {
      const range = data[0].turn_range as string;
      const upper = parseIntRangeUpper(range);
      if (upper !== null) maxSummarized = upper;
    }
  } catch (e) {
    console.warn("[summarizer] could not query existing summaries:", e instanceof Error ? e.message : e);
    return false;
  }

  // AUDIT FIX (P2-UX-C-01): first block is shorter (10 turns) so the player
  // gets memory engagement within their first session. After that, 20-turn
  // blocks resume.
  const blockSize = maxSummarized === 0 ? FIRST_BLOCK_TURNS : TURNS_PER_BLOCK;
  const nextBlockUpper = maxSummarized + blockSize;
  if (currentMaxTurnIndex + 1 < nextBlockUpper) {
    // Not enough turns yet to complete the next block.
    return false;
  }

  // Run the rollup for [maxSummarized, nextBlockUpper)
  return await runSummarization({
    supabase,
    playthroughId,
    fromIndex: maxSummarized,
    toIndex: nextBlockUpper,
    language,
  });
}

/**
 * Actually do the rollup — fetch turns, call LLM, embed, insert.
 * Fire-and-forget safe: errors are caught + logged, return false on failure.
 */
export async function runSummarization(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  fromIndex: number; // inclusive
  toIndex: number; // exclusive (Postgres int4range upper)
  language?: StoryLanguage;
}): Promise<boolean> {
  const { supabase, playthroughId, fromIndex, toIndex, language = "zh-Hant" } = params;

  try {
    // 1. Fetch the turns to summarize
    const { data: turns, error: turnsErr } = await supabase
      .from("turns")
      .select("turn_index, role, text")
      .eq("playthrough_id", playthroughId)
      .gte("turn_index", fromIndex)
      .lt("turn_index", toIndex)
      .order("turn_index", { ascending: true });

    if (turnsErr || !turns || turns.length === 0) {
      console.warn(`[summarizer] no turns to summarize [${fromIndex},${toIndex}):`, turnsErr?.message ?? "empty");
      return false;
    }

    // 2. Build prompt with the actual turn texts. Player role label varies
    //    by language so the LLM sees consistent terminology.
    const playerLabel = language === "en" ? "Player" : "玩家";
    const turnsText = (turns as TurnRow[])
      .map((t) => `[Turn ${t.turn_index} — ${t.role === "user" ? playerLabel : "Narrator"}]\n${t.text}`)
      .join("\n\n");

    // 3. Call Haiku for compression — locale-aware system + user prompt
    const userPrompt =
      language === "en"
        ? `Compress the following ${turns.length} turns of narrative:\n\n${turnsText}\n\nWrite a 2-4 paragraph summary following the system prompt rules:`
        : language === "zh-Hans"
        ? `请压缩以下 ${turns.length} 个 turn 的叙事：\n\n${turnsText}\n\n依照 system prompt 规则写 2-4 段摘要：`
        : `請壓縮以下 ${turns.length} 個 turn 嘅敘事：\n\n${turnsText}\n\n依照 system prompt 規則寫 2-4 段繁中摘要：`;

    const llmResult = await generateText({
      model: anthropicProvider(SUMMARIZER_MODEL),
      system: summarizerSystemPrompt(language),
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: 1000,
    });

    const summaryText = llmResult.text.trim();
    if (!summaryText) {
      console.warn("[summarizer] LLM returned empty summary");
      return false;
    }

    // 4. Embed the summary
    const embedResult = await embedTextSafe(summaryText, "summarizer");
    if (!embedResult) return false;

    // 5. Insert into memory_summaries
    // Postgres int4range "[fromIndex,toIndex)" — half-open interval
    const turnRangeLiteral = `[${fromIndex},${toIndex})`;

    const { error: insertErr } = await supabase
      .from("memory_summaries")
      .insert({
        playthrough_id: playthroughId,
        turn_range: turnRangeLiteral,
        summary_text: summaryText,
        embedding: embedResult.vector,
      });

    if (insertErr) {
      console.warn(`[summarizer] insert failed for [${fromIndex},${toIndex}):`, insertErr.message);
      return false;
    }

    console.log(
      `[summarizer] rolled up turns [${fromIndex},${toIndex}) — ` +
        `summary ${summaryText.length} chars · ` +
        `LLM ${llmResult.usage?.inputTokens ?? "?"}/${llmResult.usage?.outputTokens ?? "?"} tokens · ` +
        `embed ${embedResult.tokens} tokens`,
    );
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[summarizer] failed [${fromIndex},${toIndex}): ${msg}`);
    return false;
  }
}

/**
 * Parse the upper bound out of a Postgres int4range string like "[20,40)".
 * Returns null on parse failure.
 */
function parseIntRangeUpper(s: string): number | null {
  const m = s.match(/^[\[(]\d+,(\d+)[)\]]$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}
