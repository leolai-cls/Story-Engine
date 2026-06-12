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
  /** M2 (0066) — PGroonga keyword channel score (keyword-found turns only). */
  kw_score?: number;
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
  /** M2 (0066) — true when the PGroonga keyword channel independently found
   *  this entry (name/description matched the action's CJK bigram tokens). */
  kw_channel?: boolean;
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
  // Consistency v3 (2026-06-04): per-block + relevance-retrieved summaries are
  // RETIRED in favour of the single cumulative running digest
  // (playthroughs.running_summary · injected always-present by the turn route).
  // summariesK=0 stops pulling old per-block fragments (which could contradict
  // the running digest for pre-migration playthroughs). RAG-over-turns +
  // lorebook remain the deep backstop.
  summariesK: 0,
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

/**
 * M2 (0066) — keyword-channel hits get at least this keyword-dimension score.
 * Why: a PGroonga hit matched on name/DESCRIPTION text, but keywordMatchScore()
 * only looks at name + keywords[] — a description-matched entry would otherwise
 * score keyword=0, total ≈ temporal-only (~0.1) and never survive the top-K cut,
 * making the whole channel useless. 0.6 → contributes 0.18 to hybrid: keyword-only
 * finds land BELOW solid semantic matches (0.6×0.5=0.30+) but ABOVE the noise floor.
 * Candidates only reach this floor after the gradeKeywordCandidates precision
 * gate below (M2 audit F-2) — never on a single common-bigram hit.
 */
const KW_CHANNEL_KEYWORD_FLOOR = 0.6;

/**
 * M2 audit fix (F-2/F-3/F-4/F-5) — TS-side precision gate + re-rank for keyword
 * channel candidates. PGroonga is the RECALL machine (find rows containing any
 * query token); this is the PRECISION ranker:
 *   - count DISTINCT query tokens present in the candidate's text
 *   - require ≥2 matches when the action yielded many tokens (≥8) — a single
 *     common bigram (我哋/今日…) is noise, not signal. Short focused actions
 *     (few tokens) keep the 1-match bar — their tokens are already specific.
 *   - rank by match count desc (NOT by pgroonga_score, which silently returns 0
 *     whenever the planner doesn't drive the scan through the PGroonga index)
 */
function gradeKeywordCandidates<T>(
  items: T[],
  getText: (item: T) => string,
  userTokens: Set<string>,
): T[] {
  if (items.length === 0 || userTokens.size === 0) return [];
  const required = userTokens.size >= 8 ? 2 : 1;
  return items
    .map((item) => {
      const itemTokens = new Set(extractTokens(getText(item)));
      let matches = 0;
      for (const tok of userTokens) if (itemTokens.has(tok)) matches++;
      return { item, matches };
    })
    .filter((x) => x.matches >= required)
    .sort((a, b) => b.matches - a.matches)
    .map((x) => x.item);
}

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
      // M2 (0066): keyword-channel hits get a floor on the keyword dimension —
      // see KW_CHANNEL_KEYWORD_FLOOR rationale above.
      const kw = Math.max(
        keywordMatchScore(e, userTokens),
        e.kw_channel ? KW_CHANNEL_KEYWORD_FLOOR : 0,
      );
      const tmp = temporalScore(e);
      const hybrid =
        HYBRID_WEIGHTS.semantic * sem +
        HYBRID_WEIGHTS.keyword * kw +
        HYBRID_WEIGHTS.temporal * tmp;
      return { ...e, hybrid_score: hybrid };
    })
    .sort((a, b) => (b.hybrid_score ?? 0) - (a.hybrid_score ?? 0));
}

// C2 cleanup (2026-06-08 · audit): refineLorebookByHints + rebuildContextString
// (the Director memory-hints selective-retrieval refinement pass) removed — their
// only caller was the turn route's hints block, gated on the GM's memory hints,
// inert since the light-core pivot (ADR-006). The match_lorebook_by_rooms RPC
// stays in the DB (Wave-2 candidate · harmless unused).

/** Story language for locale-aware LTM block headers (Wave 1 audit C-03). */
type LtmLanguage = "zh-Hant" | "zh-Hans" | "en";

// ─── Main retriever ─────────────────────────────────────────────────────────

export async function retrieveMemory(params: {
  supabase: SupabaseClient;
  playthroughId: string;
  userAction: string;
  recentTurns: RecentTurn[];
  config?: Partial<RetrieverConfig>;
  /**
   * Wave 1 audit C-03 fix (2026-05-27): story language for locale-aware LTM
   * block headers + anti-quote preamble. Defaults to "zh-Hant" for callers
   * who haven't been updated yet (legacy preserves original 繁中 behavior).
   */
  language?: LtmLanguage;
}): Promise<MemoryRetrievalResult> {
  const cfg = { ...DEFAULT_CONFIG, ...params.config };
  const { supabase, playthroughId, userAction, recentTurns, language } = params;

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
  // Pull 2x lorebook candidates so hybrid scoring has room to re-rank.
  // (C2 cleanup 2026-06-08: the Director memoryHints → match_lorebook_by_rooms
  // selective branch removed — hints were inert since light-core · ADR-006.)
  const lorebookCandidateCount = cfg.lorebookK * 2;

  const lorebookRpcCall = supabase.rpc("match_lorebook_entries", {
    p_playthrough_id: playthroughId,
    p_query_embedding: queryEmbedding,
    p_match_count: lorebookCandidateCount,
    p_min_similarity: cfg.lorebookMinSimilarity,
  });

  // M2 (0066) — independent PGroonga keyword channel. Fixes the「篩漏」blind
  // spot (04-memory.md): vector-only candidate retrieval means anything the
  // embedding misses is invisible to keyword RE-scoring. Query = the action's
  // CJK bigrams / latin tokens OR-ed (PGroonga &@~ query syntax · tokens come
  // from extractTokens so the charset is safe — no quotes/parens/operators).
  // Audit fix F-6: keep the LAST 24 tokens — in Cantonese actions the salient
  // object usually sits at the end (「…幫我搵返嗰把青銅鑰匙」); first-24 dropped it.
  const kwQuery = Array.from(userTokenSet).slice(-24).join(" OR ");

  const [
    summariesResult,
    ragTurnsResult,
    matchedLorebookResult,
    alwaysOnLorebookResult,
    kwLorebookResult,
    kwTurnsResult,
  ] = await Promise.allSettled([
    // Per-block summaries retired (Consistency v3) — skip the RPC when K=0.
    cfg.summariesK > 0
      ? supabase.rpc("match_memory_summaries", {
          p_playthrough_id: playthroughId,
          p_query_embedding: queryEmbedding,
          p_match_count: cfg.summariesK,
          p_min_similarity: cfg.summariesMinSimilarity,
        })
      : Promise.resolve({ data: [], error: null }),
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
    // M2 keyword channels (skip when the action produced no tokens)
    kwQuery
      ? supabase.rpc("match_lorebook_keyword", {
          p_playthrough_id: playthroughId,
          p_query: kwQuery,
          p_match_count: lorebookCandidateCount,
        })
      : Promise.resolve({ data: [], error: null }),
    kwQuery
      ? supabase.rpc("match_turns_keyword", {
          p_playthrough_id: playthroughId,
          p_query: kwQuery,
          p_match_count: cfg.ragTurnsK,
          p_exclude_turn_indexes: recentIndexes,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Helper: check if any of these results indicate "tables/RPCs don't exist"
  // → migrations 0002 / 0004 not applied. Caller uses pgvectorAvailable.
  const rpcMissing = (r: PromiseSettledResult<{ error: unknown } | unknown>): boolean => {
    if (r.status === "rejected") return true;
    const v = r.value as { error?: { message?: string } } | null;
    if (!v?.error) return false;
    const msg = String(v.error.message ?? "");
    // Audit fix F-6(A): PostgREST's missing-RPC message is "Could not find the
    // function ... in the schema cache" — the old regex never matched it.
    return /does not exist|function .* does not exist|relation .* does not exist|could not find the function/i.test(msg);
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

  // M2 keyword channels — missing RPCs (migration 0066 not applied yet) are a
  // SOFT condition: warn once, run vector-only. Deliberately NOT folded into
  // pgvectorAvailable (resilient deploy · hard rule #12).
  if (rpcMissing(kwLorebookResult) || rpcMissing(kwTurnsResult)) {
    console.warn(
      "[retriever] keyword-channel RPCs not available — apply migration 0066 to enable CJK keyword retrieval",
    );
  }

  // Unwrap results — silently dropping any that failed
  const summaries = unwrapRpc<SummaryMatch>(summariesResult);
  const ragTurnsVector = unwrapRpc<TurnMatch>(ragTurnsResult);
  const matchedLorebookVector = unwrapRpc<LorebookEntry>(matchedLorebookResult);
  const alwaysOnLorebook = unwrapSelect<LorebookEntry>(alwaysOnLorebookResult);
  const kwLorebookRaw = unwrapRpc<LorebookEntry>(kwLorebookResult);
  const kwTurnsRaw = unwrapRpc<TurnMatch>(kwTurnsResult);

  // ── M2: keyword turns FILL ONLY the slots vector left empty ──────────────
  // Audit fix F-4 (HIGH · hard rule #18): the keyword channel has no relevance
  // floor, so equal-weight fusion would let "best of noise" evict solid
  // above-floor vector matches on nearly every turn. Fill-only-empty is
  // faithful to the channel's purpose (rescue the 篩漏 blind spot — things the
  // embedding MISSED) with zero displacement risk: vector picks are untouched;
  // keyword candidates (precision-gated + re-ranked in TS, see
  // gradeKeywordCandidates) only occupy remaining slots.
  let ragTurnsRaw: TurnMatch[] = ragTurnsVector.slice(0, cfg.ragTurnsK);
  if (kwTurnsRaw.length > 0 && ragTurnsRaw.length < cfg.ragTurnsK) {
    const have = new Set(ragTurnsRaw.map((t) => t.turn_id));
    const fillers = gradeKeywordCandidates(kwTurnsRaw, (t) => t.text, userTokenSet)
      .filter((t) => !have.has(t.turn_id))
      .slice(0, cfg.ragTurnsK - ragTurnsRaw.length)
      .map((t) => ({ ...t, similarity: Number.isFinite(t.similarity) ? t.similarity : 0 }));
    ragTurnsRaw = [...ragTurnsRaw, ...fillers];
  }

  // ── M2: merge lorebook candidates (vector ∪ keyword) before hybrid rank ──
  // Keyword candidates pass the TS precision gate first (audit F-2): a single
  // common-bigram hit on a long action does NOT qualify. Gated entries join the
  // candidate pool and compete in hybrid scoring (bounded blast radius: K=3,
  // short entries; a 2+-token name/description match deserves to beat a
  // barely-above-floor stale vector match).
  const kwLorebookGated = gradeKeywordCandidates(
    kwLorebookRaw,
    (e) => `${e.name} ${e.description}`,
    userTokenSet,
  );
  const vectorLoreIds = new Set(matchedLorebookVector.map((e) => e.id));
  const kwLoreIds = new Set(kwLorebookGated.map((e) => e.id));
  const loreById = new Map<string, LorebookEntry>();
  for (const e of matchedLorebookVector) {
    loreById.set(e.id, { ...e, kw_channel: kwLoreIds.has(e.id) });
  }
  for (const e of kwLorebookGated) {
    if (!loreById.has(e.id)) {
      loreById.set(e.id, { ...e, similarity: 0, kw_channel: true });
    }
  }
  const matchedLorebookRaw = Array.from(loreById.values());
  const kwOnlyLoreCount = matchedLorebookRaw.filter(
    (e) => e.kw_channel && !vectorLoreIds.has(e.id),
  ).length;
  const kwOnlyTurnCount = ragTurnsRaw.filter((t) =>
    !ragTurnsVector.some((v) => v.turn_id === t.turn_id),
  ).length;
  if (kwOnlyLoreCount > 0 || kwOnlyTurnCount > 0) {
    // Telemetry: how often the keyword channel rescues things vector missed
    console.log(
      `[retriever] keyword channel rescued ${kwOnlyLoreCount} lorebook + ${kwOnlyTurnCount} turns missed by vector search`,
    );
  }

  // PHASE 1: enrich matched lorebook with keywords + updated_at for hybrid
  // scoring · candidates returned 2x (per channel) · re-rank by hybrid score ·
  // trim to K.
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
    language,
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

/**
 * Locale-aware copy for the LTM block. Wave 1 audit C-03 fix (2026-05-27).
 * Previously all hardcoded 繁中 — non-繁中 stories got a Cantonese system
 * preamble + Cantonese section headers every turn → code-switching risk and
 * token waste. Now branched per story language.
 */
function ltmCopy(language: LtmLanguage) {
  if (language === "en") {
    return {
      alwaysOnHeader: "### Core story facts (always-on)",
      matchedHeader: "### Relevant characters / places / items (this turn)",
      summariesHeader: "### Past story arcs (rolling summaries)",
      ragHeader: "### Past specific scenes (recalled by similarity)",
      playerLabel: "Player",
      aiLabel: "AI",
      antiQuotePreamble:
        "## Long-Term Memory ⚠️ INTERNAL FACTS ONLY — NEVER quote or paraphrase verbatim into narrative\n\nThis text is private system reference for you. **Strictly forbidden** to copy any sentence here verbatim into your narrative — use your own prose to express callbacks / continuity. Verbatim quotes break immersion.",
    } as const;
  }
  if (language === "zh-Hans") {
    return {
      alwaysOnHeader: "### 故事核心设定 (always-on)",
      matchedHeader: "### 相关角色 / 地点 / 物件 (此 turn 相关)",
      summariesHeader: "### 过去故事大纲 (rolling summaries)",
      ragHeader: "### 过去具体场景 (recalled by similarity)",
      playerLabel: "玩家",
      aiLabel: "AI",
      antiQuotePreamble:
        "## Long-Term Memory ⚠️ INTERNAL FACTS ONLY — NEVER quote or paraphrase verbatim into narrative\n\n这里的文字是 system 私底下给你看的 facts / reference。**绝对禁止**将这里任何句子原文搬入你的叙事 — 用你自己的 prose 表达 callback / continuity。Verbatim quote 会打破 immersion。",
    } as const;
  }
  // Default: zh-Hant (HK Cantonese — original founder voice)
  return {
    alwaysOnHeader: "### 故事核心設定 (always-on)",
    matchedHeader: "### 相關角色 / 地點 / 物件 (此 turn 相關)",
    summariesHeader: "### 過去故事大綱 (rolling summaries)",
    ragHeader: "### 過去具體場景 (recalled by similarity)",
    playerLabel: "玩家",
    aiLabel: "AI",
    antiQuotePreamble:
      "## Long-Term Memory ⚠️ INTERNAL FACTS ONLY — NEVER quote or paraphrase verbatim into narrative\n\n呢度嘅文字係 system 私底下俾你睇嘅 facts / reference。**絕對禁止**將呢度任何句子原文搬入你嘅敘事入面 — 用你自己嘅 prose 表達 callback / continuity。Verbatim quote 會打破 immersion。",
  } as const;
}

function buildContextString(parts: {
  alwaysOnLorebook: LorebookEntry[];
  matchedLorebook: LorebookEntry[];
  summaries: SummaryMatch[];
  ragTurns: TurnMatch[];
  /** Wave 1 audit C-03 fix · default zh-Hant for backward compat with legacy callers */
  language?: LtmLanguage;
}): string {
  const copy = ltmCopy(parts.language ?? "zh-Hant");
  const sections: string[] = [];

  // Always-on lorebook (story-critical facts)
  if (parts.alwaysOnLorebook.length > 0) {
    sections.push(
      `${copy.alwaysOnHeader}\n${parts.alwaysOnLorebook
        .map((e) => `- (${e.entity_type}) **${e.name}** — ${e.description}`)
        .join("\n")}`,
    );
  }

  // Matched lorebook by similarity to current action
  if (parts.matchedLorebook.length > 0) {
    sections.push(
      `${copy.matchedHeader}\n${parts.matchedLorebook
        .map((e) => `- (${e.entity_type}) **${e.name}** — ${e.description}`)
        .join("\n")}`,
    );
  }

  // Rolling summaries
  if (parts.summaries.length > 0) {
    sections.push(
      `${copy.summariesHeader}\n${parts.summaries
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
      `${copy.ragHeader}\n${parts.ragTurns
        .map(
          (t) =>
            `[Turn ${t.turn_index} — ${t.role === "user" ? copy.playerLabel : copy.aiLabel}]: ${truncateToSentence(t.text, 320)}`,
        )
        .join("\n")}`,
    );
  }

  if (sections.length === 0) return "";

  // AUDIT FIX (P2-UX-M-10): stronger anti-quote framing. Sonnet at temp
  // 0.85 occasionally parrots prose from system context — the original
  // "唔好直接引用" hint is too weak. Belt-and-braces wording below + matching
  // line in NARRATOR_RULES.
  return `${copy.antiQuotePreamble}\n\n${sections.join("\n\n")}`;
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
