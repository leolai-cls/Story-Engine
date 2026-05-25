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
  /** Phase 1 — hierarchical wing (set after Migration 0023 backfill) */
  wing?: string;
  /** Phase 1 — sub-namespace within wing (free text · nullable) */
  room?: string | null;
  /** Phase 1 — keywords for hybrid scoring (denormalized from DB) */
  keywords?: string[];
  /** Phase 1 — updated_at for temporal boost */
  updated_at?: string;
  /** Phase 1 — hybrid score (semantic + keyword + temporal) when applicable */
  hybrid_score?: number;
};

/**
 * Phase 1 — MemoryHints input from Director.
 * Mirrors `MemoryHintsSchema` in @/schemas/director · duplicated here to avoid
 * circular dependency (director.ts → retriever.ts via ctx).
 */
export type RetrieverMemoryHints = {
  rooms_to_load: string[];
  wings_to_load: string[];
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
  /**
   * AUDIT FIX (P2-UX-C-02 / P2-LOGIC-M-10): per-source minimum cosine
   * similarity. Below these floors, results are dropped at the RPC level
   * (Returning EMPTY beats returning noise — better to inject nothing than
   * to surface irrelevant 5-turn-ago walk-on NPCs).
   *
   * Tuning notes: cosine similarity in [-1, 1] for normalized vectors.
   * For text-embedding-3-small on 中文 narrative:
   *   - 0.5+ tends to be topically related
   *   - 0.7+ is "clearly about the same event/entity"
   *   - <0.4 is essentially noise
   *
   * Thresholds are differentiated by source — RAG turns and lorebook can
   * accept slightly lower floors (broad recall), while summaries should be
   * tighter (each is ~300-1000 tokens injected, so low-relevance summaries
   * are very expensive).
   */
  summariesMinSimilarity: number;
  ragTurnsMinSimilarity: number;
  lorebookMinSimilarity: number;
};

const DEFAULT_CONFIG: RetrieverConfig = {
  summariesK: 3,
  ragTurnsK: 5,
  lorebookK: 3,
  excludeOverlappingSummaries: true,
  summariesMinSimilarity: 0.55,
  ragTurnsMinSimilarity: 0.5,
  lorebookMinSimilarity: 0.45,
};

// ─── Phase 1 hybrid scoring ─────────────────────────────────────────────────

/**
 * Phase 1 — hybrid score weights (sum to 1.0).
 * - Semantic dominates (60%) — pgvector cosine is the strongest signal
 * - Keyword boost (30%) — explicit keyword match means high recall confidence
 * - Temporal decay (10%) — recently-updated entries slightly favored (player
 *   is actively interacting with these entities)
 */
const HYBRID_WEIGHTS = {
  semantic: 0.6,
  keyword: 0.3,
  temporal: 0.1,
} as const;

/** Temporal half-life · how fast recency boost decays (days). 7 = week-scale. */
const TEMPORAL_HALF_LIFE_DAYS = 7;

/**
 * CJK-aware token extraction from user action · used for keyword matching.
 * Mirrors the Phase 5 FTS pattern (Migration 0012 cjk_bigram_tokenize).
 *
 * - Latin alphanumeric: split on whitespace, lowercase, drop short tokens
 * - CJK characters: emit sliding 2-char bigrams (no word boundary in Chinese)
 * - Strips zero-width chars + combining marks to neutralize injection attempts
 */
function extractTokens(text: string): string[] {
  // Strip zero-width + combining marks (Migration 0013 W2-FTS-M-09 pattern)
  const cleaned = text
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  const tokens = new Set<string>();

  // Latin tokens (length >= 2)
  const latinRe = /[a-z0-9]{2,30}/g;
  let m: RegExpExecArray | null;
  while ((m = latinRe.exec(cleaned)) !== null) {
    tokens.add(m[0]);
  }

  // CJK bigrams (any 2 consecutive CJK chars)
  const cjkRe = /[㐀-鿿぀-ゟ゠-ヿ]/;
  for (let i = 0; i < cleaned.length - 1; i++) {
    if (cjkRe.test(cleaned[i]) && cjkRe.test(cleaned[i + 1])) {
      tokens.add(cleaned[i] + cleaned[i + 1]);
    }
  }

  return Array.from(tokens);
}

/**
 * Score a lorebook entry on the keyword dimension.
 * Returns [0, 1] · graded by intersection size / max(userTokens, entryTokens).
 *
 * AUDIT FIX P1-UX-M-01 (Wave 2): pre-Wave-2 was binary 0/1 · any single CJK
 * bigram match returned 1.0. With user actions like "我問林思雅" producing
 * 4 bigram tokens · ANY mention of an NPC name produced score 1.0 · flat
 * +0.3 boost above true semantic ordering · 60/30/10 became "60 + 30 const".
 * Now: graded by overlap proportion · 1 token match in a 5-token action
 * scores 0.2, not 1.0.
 *
 * Match strategy: token-set intersection (case-insensitive, CJK bigram-aware).
 */
function keywordMatchScore(entry: LorebookEntry, userTokens: Set<string>): number {
  if (userTokens.size === 0) return 0;
  const entryTokens = new Set<string>();
  // Entry name tokens
  for (const t of extractTokens(entry.name)) entryTokens.add(t);
  // Entry keyword tokens (don't bigram-split keywords — they're authored)
  if (entry.keywords) {
    for (const kw of entry.keywords) {
      entryTokens.add(kw.toLowerCase());
      for (const t of extractTokens(kw)) entryTokens.add(t);
    }
  }
  if (entryTokens.size === 0) return 0;
  let matches = 0;
  for (const tok of userTokens) {
    if (entryTokens.has(tok)) matches++;
  }
  if (matches === 0) return 0;
  // Graded: intersection / max(userTokens, entryTokens) capped at 1
  return Math.min(1, matches / Math.max(userTokens.size, entryTokens.size));
}

/**
 * Score temporal recency · returns [0, 1] · 1 = updated today, decays
 * exponentially. Half-life 7 days · 14 days = 0.25 · 21 days = 0.125.
 *
 * AUDIT FIX P1-UX-H-03 (Wave 2): added NaN guard. `new Date("garbage").getTime()`
 * returns NaN · all downstream arithmetic would propagate NaN into hybrid_score ·
 * sort with NaN scores is non-deterministic. Now: invalid timestamps fall back
 * to neutral 0.5 (matching missing-timestamp behavior · same finding will be
 * addressed for asymmetry concern in future polish).
 */
function temporalScore(entry: LorebookEntry): number {
  if (!entry.updated_at) return 0.5; // unknown timestamp = neutral
  const updated = new Date(entry.updated_at).getTime();
  if (!Number.isFinite(updated)) return 0.5; // corrupted timestamp · defensive
  const now = Date.now();
  const ageDays = Math.max(0, (now - updated) / (1000 * 60 * 60 * 24));
  return Math.exp(-ageDays / TEMPORAL_HALF_LIFE_DAYS);
}

/**
 * Apply hybrid scoring to a set of lorebook entries.
 * Returns same entries sorted by hybrid_score desc · each entry gets
 * hybrid_score field set for telemetry.
 */
function applyHybridScoring(
  entries: LorebookEntry[],
  userTokens: Set<string>,
): LorebookEntry[] {
  return entries
    .map((e) => {
      // AUDIT FIX F-14 (Wave 2): defensive NaN/Infinity guard on similarity ·
      // protects sort determinism if upstream emits non-finite cosine
      const sem = Number.isFinite(e.similarity) ? (e.similarity as number) : 0;
      const kw = keywordMatchScore(e, userTokens);
      const tmp = temporalScore(e);
      const hybrid =
        HYBRID_WEIGHTS.semantic * sem +
        HYBRID_WEIGHTS.keyword * kw +
        HYBRID_WEIGHTS.temporal * tmp;
      return { ...e, hybrid_score: hybrid };
    })
    .sort((a, b) => (b.hybrid_score ?? 0) - (a.hybrid_score ?? 0));
}

/**
 * Phase 1 — refine lorebook retrieval given Director's memory hints.
 *
 * Called by turn route AFTER Director returns hints (if non-empty). Replaces
 * the initial semantic top-K matched lorebook with hint-guided selective
 * retrieval. Hybrid scored + trimmed to config K.
 *
 * Returns empty array if RPCs fail (caller keeps original retrieval).
 *
 * Reuses the SAME queryEmbedding from the first retrieval pass · no extra
 * embedding API call.
 */
export async function refineLorebookByHints(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  queryEmbedding: number[];
  userAction: string;
  hints: RetrieverMemoryHints;
  config?: Partial<RetrieverConfig>;
}): Promise<LorebookEntry[]> {
  const cfg = { ...DEFAULT_CONFIG, ...params.config };
  const { supabase, playthroughId, queryEmbedding, userAction, hints } = params;

  if (hints.rooms_to_load.length === 0 && hints.wings_to_load.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase.rpc("match_lorebook_by_rooms", {
      p_playthrough_id: playthroughId,
      p_query_embedding: queryEmbedding,
      p_wings: hints.wings_to_load,
      p_rooms: hints.rooms_to_load,
      p_match_count: cfg.lorebookK * 2,
      p_min_similarity: cfg.lorebookMinSimilarity,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (/does not exist/i.test(msg)) {
        console.warn("[retriever] match_lorebook_by_rooms RPC missing — apply Migration 0023");
      }
      return [];
    }
    const candidates = (data as LorebookEntry[]) ?? [];
    if (candidates.length === 0) return [];

    // Enrich with keywords + updated_at for hybrid scoring
    const ids = candidates.map((e) => e.id);
    const { data: enrichRows } = await supabase
      .from("lorebook_entries")
      .select("id, keywords, updated_at")
      .in("id", ids);
    const enrichById = new Map<string, { keywords: string[] | null; updated_at: string }>();
    for (const row of enrichRows ?? []) {
      enrichById.set(row.id as string, {
        keywords: (row.keywords as string[] | null) ?? null,
        updated_at: row.updated_at as string,
      });
    }
    const enriched = candidates.map((e) => {
      const enr = enrichById.get(e.id);
      return {
        ...e,
        keywords: enr?.keywords ?? [],
        updated_at: enr?.updated_at,
      };
    });

    const userTokens = new Set(extractTokens(userAction));
    return applyHybridScoring(enriched, userTokens).slice(0, cfg.lorebookK);
  } catch (e) {
    console.warn("[retriever] refineLorebookByHints failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Phase 1 — re-build the memory context string given a swapped lorebook set.
 * Exposed for turn route to call after refineLorebookByHints.
 */
export function rebuildContextString(parts: {
  alwaysOnLorebook: LorebookEntry[];
  matchedLorebook: LorebookEntry[];
  summaries: SummaryMatch[];
  ragTurns: TurnMatch[];
}): string {
  return buildContextString(parts);
}

// ─── Main retriever ─────────────────────────────────────────────────────────

export async function retrieveMemory(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  userAction: string;
  recentTurns: RecentTurn[];
  config?: Partial<RetrieverConfig>;
  /**
   * Phase 1 — optional memory hints from Director.
   * If present (rooms_to_load or wings_to_load non-empty), retriever uses
   * `match_lorebook_by_rooms` RPC for selective retrieval. Otherwise falls
   * back to top-K semantic match.
   *
   * Empty arrays = unconstrained (semantic top-K · default behavior).
   */
  memoryHints?: RetrieverMemoryHints;
}): Promise<MemoryRetrievalResult> {
  const cfg = { ...DEFAULT_CONFIG, ...params.config };
  const { supabase, playthroughId, userAction, recentTurns, memoryHints } = params;

  // Pre-tokenize user action ONCE · reused across hybrid scoring loops.
  const userTokenSet = new Set(extractTokens(userAction));

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
  // AUDIT FIX (P2-UX-C-02): pass per-source similarity floor so low-quality
  // matches don't bloat the prompt with irrelevant noise.
  // AUDIT FIX (P2-PERF-H-07): cap always_on count + sort by recent-update.
  // PHASE 1: if memoryHints specified → use match_lorebook_by_rooms (selective);
  //          else fall back to match_lorebook_entries (semantic top-K).
  //          Pull 2x lorebook candidates so hybrid scoring has room to re-rank.
  const useHints =
    !!memoryHints &&
    (memoryHints.rooms_to_load.length > 0 || memoryHints.wings_to_load.length > 0);
  const lorebookCandidateCount = cfg.lorebookK * 2;

  const lorebookRpcCall = useHints
    ? supabase.rpc("match_lorebook_by_rooms", {
        p_playthrough_id: playthroughId,
        p_query_embedding: queryEmbedding,
        p_wings: memoryHints!.wings_to_load,
        p_rooms: memoryHints!.rooms_to_load,
        p_match_count: lorebookCandidateCount,
        p_min_similarity: cfg.lorebookMinSimilarity,
      })
    : supabase.rpc("match_lorebook_entries", {
        p_playthrough_id: playthroughId,
        p_query_embedding: queryEmbedding,
        p_match_count: lorebookCandidateCount,
        p_min_similarity: cfg.lorebookMinSimilarity,
      });

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
      p_min_similarity: cfg.summariesMinSimilarity,
    }),
    supabase.rpc("match_turn_embeddings", {
      p_playthrough_id: playthroughId,
      p_query_embedding: queryEmbedding,
      p_match_count: cfg.ragTurnsK,
      p_exclude_turn_indexes: recentIndexes,
      p_min_similarity: cfg.ragTurnsMinSimilarity,
    }),
    lorebookRpcCall,
    supabase
      .from("lorebook_entries")
      .select("id, entity_type, name, description, wing, room, keywords, updated_at")
      .eq("playthrough_id", playthroughId)
      .eq("always_on", true)
      .order("updated_at", { ascending: false })
      .limit(8),
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
  const matchedLorebookRaw = unwrapRpc<LorebookEntry>(matchedLorebookResult);
  const alwaysOnLorebook = unwrapSelect<LorebookEntry>(alwaysOnLorebookResult);

  // PHASE 1: enrich matched lorebook with keywords + updated_at for hybrid
  // scoring · candidates returned 2x · re-rank by hybrid score · trim to K.
  let matchedLorebook: LorebookEntry[] = matchedLorebookRaw;
  if (matchedLorebookRaw.length > 0) {
    const ids = matchedLorebookRaw.map((e) => e.id);
    const { data: enrichRows } = await supabase
      .from("lorebook_entries")
      .select("id, keywords, updated_at")
      .in("id", ids);
    const enrichById = new Map<string, { keywords: string[] | null; updated_at: string }>();
    for (const row of enrichRows ?? []) {
      enrichById.set(row.id as string, {
        keywords: (row.keywords as string[] | null) ?? null,
        updated_at: row.updated_at as string,
      });
    }
    const enriched = matchedLorebookRaw.map((e) => {
      const enr = enrichById.get(e.id);
      return {
        ...e,
        keywords: enr?.keywords ?? [],
        updated_at: enr?.updated_at,
      };
    });
    // Hybrid score + trim to configured K
    matchedLorebook = applyHybridScoring(enriched, userTokenSet).slice(0, cfg.lorebookK);
  }

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
            `[Turn ${t.turn_index} — ${t.role === "user" ? "玩家" : "AI"}]: ${truncateToSentence(t.text, 320)}`,
        )
        .join("\n")}`,
    );
  }

  if (sections.length === 0) return "";

  // AUDIT FIX (P2-UX-M-10): stronger anti-quote framing. Sonnet at temp
  // 0.85 occasionally parrots prose from system context — the original
  // "唔好直接引用" hint is too weak. Belt-and-braces wording below + matching
  // line in NARRATOR_RULES.
  return `## Long-Term Memory ⚠️ INTERNAL FACTS ONLY — NEVER quote or paraphrase verbatim into narrative\n\n呢度嘅文字係 system 私底下俾你睇嘅 facts / reference。**絕對禁止**將呢度任何句子原文搬入你嘅敘事入面 — 用你自己嘅 prose 表達 callback / continuity。Verbatim quote 會打破 immersion。\n\n${sections.join("\n\n")}`;
}

/**
 * AUDIT FIX (P2-UX-H-06): truncate to sentence boundary instead of
 * mid-word with "…". Previous mid-sentence cut systematically biased
 * recall toward turn openings (often conflicts / setup) and stripped
 * resolutions (which often come at turn endings). Now: prefer the LAST
 * complete sentences in long turn texts, so the EMOTIONAL RESOLUTION of
 * each past scene survives rather than the setup.
 *
 * Strategy:
 *   - If <= n chars, return as-is
 *   - Else: split on sentence terminators (。！？!?\n), prefer the
 *     latter half of the turn, then prepend "…" if we dropped the start.
 */
function truncateToSentence(s: string, n: number): string {
  if (s.length <= n) return s;

  // Split on sentence boundaries (Chinese + English). Keep terminators.
  const parts = s.split(/(?<=[。！？!?\n])\s*/).filter((p) => p.trim().length > 0);
  if (parts.length === 0) {
    // No sentence boundary found — fall back to char truncate.
    return s.slice(0, n - 1).trimEnd() + "…";
  }

  // Build result from END backwards — take as many sentences as fit
  // under budget, then prepend "…" if any sentences dropped.
  const selected: string[] = [];
  let charsRemaining = n;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.length + 2 > charsRemaining) break; // +2 for "… " prefix budget
    selected.unshift(part);
    charsRemaining -= part.length;
  }

  if (selected.length === 0) {
    // Even the last sentence is bigger than n — truncate it from the END
    // (keep the resolution if possible).
    const last = parts[parts.length - 1];
    return "…" + last.slice(-n + 2).trimStart();
  }

  const prefix = selected.length < parts.length ? "…" : "";
  return prefix + selected.join("").trimEnd();
}
