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
const SUMMARIZER_MODEL = DEFAULT_DIRECTOR; // Haiku 4.5

const SUMMARIZER_SYSTEM = `你係 Story Engine 嘅 memory archivist。將最近 20 個 turn 嘅敘事壓縮成 2-4 段精簡摘要，畀未來 turn 嘅 Narrator 用嚟保持連貫性。

要 capture：
- 主要事件（玩家做咗咩、NPC 反應、場景變化）
- 關係 / 情感變化（信任 / 浪漫 / 仇恨 / 尊重等）
- 玩家做出嘅承諾 / 決定 / 公開立場
- 故事進展 (story arc)

風格：
- 繁中第二人稱寫法保持一致（"你..."）
- 客觀紀實，唔加 fluff
- 2-4 段，每段 1-3 句
- 唔好引用具體對白 — concept-level 描述

唔好做嘅嘢：
- 唔好 invent 嘢
- 唔好評論 / 加個人意見
- 唔好 list 玩家以後可以做咩
- 唔好用 "玩家" / "the player" — 永遠用 "你"`;

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
}): Promise<boolean> {
  const { supabase, playthroughId, currentMaxTurnIndex } = params;

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

  // Is there at least one complete unsummarized block?
  const nextBlockUpper = maxSummarized + TURNS_PER_BLOCK;
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
}): Promise<boolean> {
  const { supabase, playthroughId, fromIndex, toIndex } = params;

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

    // 2. Build prompt with the actual turn texts
    const turnsText = (turns as TurnRow[])
      .map((t) => `[Turn ${t.turn_index} — ${t.role === "user" ? "玩家" : "Narrator"}]\n${t.text}`)
      .join("\n\n");

    // 3. Call Haiku for compression
    const llmResult = await generateText({
      model: anthropicProvider(SUMMARIZER_MODEL),
      system: SUMMARIZER_SYSTEM,
      prompt: `請壓縮以下 ${turns.length} 個 turn 嘅敘事：\n\n${turnsText}\n\n依照 system prompt 規則寫 2-4 段繁中摘要：`,
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
