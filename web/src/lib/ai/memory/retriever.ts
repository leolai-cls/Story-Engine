import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTextSafe } from "../embed";

/**
 * Memory retriever — Phase 2 / ADR-005.
 *
 * Combines 4 sources into one enriched context string for the Narrator
 * (and Director, when they need historical grounding):
 *
 *   1. RECENT — last N turn texts (caller already loaded; we just pass through)
 *   2. SUMMARIES — top-K rolling summaries by similarity to user action
 *   3. RAG — top-K individual past turns by similarity (excluding recent)
 *   4. LOREBOOK — all always_on entries + top-K matched non-always-on entries
 *
 * Graceful fallback: every step is wrapped in try/catch. If pgvector tables
 * don't exist yet (migrations 0002 + 0004 not applied) OR embedding API
 * fails, retriever returns just the recent turns with empty extra context.
 * The turn pipeline still works — just without long-term memory.
 *
 * Token budget targets (sum ≈ 3000 tokens at config defaults):
 *   - 3 summaries × ~300 tokens = ~900
 *   - 5 RAG turns × ~300 tokens = ~1500
 *   - 5 always_on lorebook × ~80 tokens = ~400
 *   - 3 matched lorebook × ~80 tokens = ~240
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecentTurn = {
  role: "user" | "ai";
  text: string;
  turn_index: number;
};

export type SummaryMatch = {
  id: string;
  turn_range: string; // pg int4range serialized as "[20,40)"
  summary_text: string;
  similarity: number;
};

export type TurnMatch = {
  turn_id: string;
  turn_index: number;
  role: string;
  text: string;
  similarity: number;
};

export type LorebookEntry = {
  id: string;
  entity_type: "character" | "place" | "item" | "event" | "concept";
  name: string;
  description: string;
  similarity?: number;
};

export type MemoryRetrievalResult = {
  /** Recent turns the caller already loaded — passed through for completeness. */
  recentTurns: RecentTurn[];
  /** Top-K rolling summaries by similarity (excludes ranges overlapping recent). */
  summaries: SummaryMatch[];
  /** Top-K past turns by similarity (excludes recent + summarized). */
  ragTurns: TurnMatch[];
  /** All always_on lorebook entries (story-critical, injected every turn). */
  alwaysOnLorebook: LorebookEntry[];
  /** Top-K non-always-on lorebook entries matched by similarity. */
  matchedLorebook: LorebookEntry[];
  /** Embedding of the user action query — reuse it for persisting the embedded user turn. */
  queryEmbedding: number[] | null;
  /** Pre-formatted memory section ready to inject into Narrator dynamic system block. */
  contextString: string;
  /** True if pgvector retrieval succeeded (telemetry / debugging). */
  pgvectorAvailable: boolean;
};

// ─── Config ──────────────────────────────────────────────────────────────────

export type RetrieverConfig = {
  /** How many summaries to pull. Default 3. */
  summariesK: number;
  /** How many individual past turns to pull. Default 5. */
  ragTurnsK: number;
  /** How many non-always-on lorebook to pull. Default 3. */
  lorebookK: number;
  /** Skip summaries with turn_range overlapping recentTurns. Default true. */
  excludeOverlappingSummaries: boolean;
};

const DEFAULT_CONFIG: RetrieverConfig = {
  summariesK: 3,
  ragTurnsK: 5,
  lorebookK: 3,
  excludeOverlappingSummaries: true,
};

// ─── Main retriever ─────────────────────────────────────────────────────────

export async function retrieveMemory(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  userAction: string;
  recentTurns: RecentTurn[];
  config?: Partial<RetrieverConfig>;
}): Promise<MemoryRetrievalResult> {
  const cfg = { ...DEFAULT_CONFIG, ...params.config };
  const { supabase, playthroughId, userAction, recentTurns } = params;

  // ── 1. Embed the user action (graceful fallback if it fails) ────────────
  const embedResult = await embedTextSafe(userAction, "retriever:user_action");
  const queryEmbedding = embedResult?.vector ?? null;

  if (!queryEmbedding) {
    // No embedding → no RAG. Return recent turns only.
    return {
      recentTurns,
      summaries: [],
      ragTurns: [],
      alwaysOnLorebook: [],
      matchedLorebook: [],
      queryEmbedding: null,
      contextString: "",
      pgvectorAvailable: false,
    };
  }

  const recentIndexes = recentTurns.map((t) => t.turn_index);

  // ── 2. Parallel queries: 3 RPCs + 1 SELECT ──────────────────────────────
  const [
    summariesResult,
    ragTurnsResult,
    matchedLorebookResult,
    alwaysOnLorebookResult,
  ] = await Promise.allSettled([
    supabase.rpc("match_memory_summaries", {
      p_playthrough_id: playthroughId,
      p_query_embedding: queryEmbedding,
      p_match_count: cfg.summariesK,
    }),
    supabase.rpc("match_turn_embeddings", {
      p_playthrough_id: playthroughId,
      p_query_embedding: queryEmbedding,
      p_match_count: cfg.ragTurnsK,
      p_exclude_turn_indexes: recentIndexes,
    }),
    supabase.rpc("match_lorebook_entries", {
      p_playthrough_id: playthroughId,
      p_query_embedding: queryEmbedding,
      p_match_count: cfg.lorebookK,
    }),
    supabase
      .from("lorebook_entries")
      .select("id, entity_type, name, description")
      .eq("playthrough_id", playthroughId)
      .eq("always_on", true),
  ]);

  // Helper: check if any of these results indicate "tables/RPCs don't exist"
  // → migrations 0002 / 0004 not applied. Caller uses pgvectorAvailable.
  const rpcMissing = (r: PromiseSettledResult<{ error: unknown } | unknown>): boolean => {
    if (r.status === "rejected") return true;
    const v = r.value as { error?: { message?: string } } | null;
    if (!v?.error) return false;
    const msg = String(v.error.message ?? "");
    return /does not exist|function .* does not exist|relation .* does not exist/i.test(msg);
  };

  const anyMissing =
    rpcMissing(summariesResult) ||
    rpcMissing(ragTurnsResult) ||
    rpcMissing(matchedLorebookResult) ||
    rpcMissing(alwaysOnLorebookResult);

  if (anyMissing) {
    console.warn(
      "[retriever] pgvector tables / RPCs not available yet — apply migrations 0002 + 0004 to enable long-term memory",
    );
  }

  // Unwrap results — silently dropping any that failed
  const summaries = unwrapRpc<SummaryMatch>(summariesResult);
  const ragTurnsRaw = unwrapRpc<TurnMatch>(ragTurnsResult);
  const matchedLorebook = unwrapRpc<LorebookEntry>(matchedLorebookResult);
  const alwaysOnLorebook = unwrapSelect<LorebookEntry>(alwaysOnLorebookResult);

  // ── 3. Filter overlapping summaries if requested ────────────────────────
  let filteredSummaries = summaries;
  if (cfg.excludeOverlappingSummaries && recentIndexes.length > 0) {
    const recentMin = Math.min(...recentIndexes);
    const recentMax = Math.max(...recentIndexes);
    filteredSummaries = summaries.filter((s) => {
      const range = parseIntRange(s.turn_range);
      if (!range) return true; // can't parse, keep it
      // overlap test: not strictly above recent_max AND not strictly below recent_min
      return range.upper <= recentMin || range.lower > recentMax;
    });
  }

  // ── 4. Build context string for Narrator system block ───────────────────
  const contextString = buildContextString({
    alwaysOnLorebook,
    matchedLorebook,
    summaries: filteredSummaries,
    ragTurns: ragTurnsRaw,
  });

  return {
    recentTurns,
    summaries: filteredSummaries,
    ragTurns: ragTurnsRaw,
    alwaysOnLorebook,
    matchedLorebook,
    queryEmbedding,
    contextString,
    pgvectorAvailable: !anyMissing,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function unwrapRpc<T>(
  result: PromiseSettledResult<{ data: T[] | null; error: unknown } | unknown>,
): T[] {
  if (result.status === "rejected") return [];
  const v = result.value as { data?: T[] | null; error?: unknown };
  if (v?.error) return [];
  return v?.data ?? [];
}

function unwrapSelect<T>(
  result: PromiseSettledResult<{ data: T[] | null; error: unknown } | unknown>,
): T[] {
  return unwrapRpc<T>(result);
}

/**
 * Parse Postgres int4range string "[20,40)" into {lower, upper} numbers.
 * Returns null if format unexpected.
 */
function parseIntRange(s: string): { lower: number; upper: number } | null {
  // Supabase serializes int4range as "[lower,upper)" string
  const m = s.match(/^[\[(](\d+),(\d+)[)\]]$/);
  if (!m) return null;
  return { lower: parseInt(m[1], 10), upper: parseInt(m[2], 10) };
}

function buildContextString(parts: {
  alwaysOnLorebook: LorebookEntry[];
  matchedLorebook: LorebookEntry[];
  summaries: SummaryMatch[];
  ragTurns: TurnMatch[];
}): string {
  const sections: string[] = [];

  // Always-on lorebook (story-critical facts)
  if (parts.alwaysOnLorebook.length > 0) {
    sections.push(
      `### 故事核心設定 (always-on)\n${parts.alwaysOnLorebook
        .map((e) => `- (${e.entity_type}) **${e.name}** — ${e.description}`)
        .join("\n")}`,
    );
  }

  // Matched lorebook by similarity to current action
  if (parts.matchedLorebook.length > 0) {
    sections.push(
      `### 相關角色 / 地點 / 物件 (此 turn 相關)\n${parts.matchedLorebook
        .map((e) => `- (${e.entity_type}) **${e.name}** — ${e.description}`)
        .join("\n")}`,
    );
  }

  // Rolling summaries
  if (parts.summaries.length > 0) {
    sections.push(
      `### 過去故事大綱 (rolling summaries)\n${parts.summaries
        .map((s) => {
          const range = parseIntRange(s.turn_range);
          const label = range ? `[Turns ${range.lower}-${range.upper - 1}]` : `[${s.turn_range}]`;
          return `${label}: ${s.summary_text}`;
        })
        .join("\n\n")}`,
    );
  }

  // RAG over individual past turns
  if (parts.ragTurns.length > 0) {
    sections.push(
      `### 過去具體場景 (recalled by similarity)\n${parts.ragTurns
        .map(
          (t) =>
            `[Turn ${t.turn_index} — ${t.role === "user" ? "玩家" : "AI"}]: ${truncate(t.text, 280)}`,
        )
        .join("\n")}`,
    );
  }

  if (sections.length === 0) return "";

  return `## Long-Term Memory (內部參考 — 唔好直接引用)\n\n${sections.join("\n\n")}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
