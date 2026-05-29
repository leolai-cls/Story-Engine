import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Embedding wrapper — Phase 2 memory layer foundation.
 *
 * ADR-021 (2026-05-29): HK founder 攞唔到 OpenAI API key · embedding 行
 * CrazyRouter (OpenAI-compatible · 同 chat completion sharing 嘅同一個
 * `CRAZYROUTER_API_KEY`). CrazyRouter 解封咗 embedding（OpenRouter 喺香港
 * block 埋 text-embedding） → RAG semantic search 喺香港終於 work。
 *
 * Model: text-embedding-3-small (CrazyRouter bare slug · 1536 dim · 中文-friendly).
 *
 * 注: 如果 CrazyRouter 暫時 503 / embed 失敗 · embed() 會 throw · 上層
 * embedTextSafe() catch return null · memory journal 自動 degrade (lorebook
 * 仍然 work via keyword scan · RAG semantic search 暫時失效).
 */

const openaiEmbedClient = createOpenAI({
  apiKey: process.env.CRAZYROUTER_API_KEY,
  baseURL: "https://crazyrouter.com/v1",
  headers: { "X-Title": "Kieio" },
});

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

/**
 * Result type — flat shape so callers can persist directly to pgvector
 * (Supabase stores `vector(1536)` as JSON array of numbers).
 */
export type EmbeddingResult = {
  vector: number[];
  /** Tokens consumed by the embedding call (for cost ledger). */
  tokens: number;
};

/**
 * AUDIT FIX (P2-PERF-H-05): retry-on-429 with exponential backoff so
 * rate-limit spikes don't silently degrade memory quality (calling
 * embedTextSafe → null → retriever returns empty memory context for that
 * turn). Without this, one bad burst day cascades into systematic memory
 * failures across the whole platform.
 *
 * Strategy: detect 429 / "rate limit" in error message, parse Retry-After
 * if present, otherwise exponential backoff. Max 3 attempts.
 */
async function withRateLimitRetry<T>(
  label: string,
  op: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await op();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isRateLimit =
        /\b429\b/.test(msg) || /rate[_\s-]?limit/i.test(msg) || /too[_\s-]?many[_\s-]?requests/i.test(msg);
      if (!isRateLimit) throw e; // non-rate-limit errors fail fast

      // Try parsing Retry-After in seconds from message (OpenAI puts it in headers
      // but error.message often includes "Retry-After: N" or just "X seconds")
      const retryAfterMatch = msg.match(/retry[_\s-]?after[:\s]+(\d+(?:\.\d+)?)/i);
      const retryAfterSec = retryAfterMatch ? parseFloat(retryAfterMatch[1]) : null;
      // Exponential backoff: 500ms, 2s, 8s — unless server suggested otherwise
      const backoffMs = retryAfterSec
        ? Math.min(retryAfterSec * 1000, 10_000)
        : Math.pow(4, attempt) * 500;
      console.warn(
        `[embed] ${label} rate-limited (attempt ${attempt + 1}/3), backing off ${backoffMs}ms`,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`embed ${label}: rate-limit retries exhausted`);
}

/**
 * Embed a single text string. Truncates to ~8000 chars before sending to
 * keep us well under the 8192-token limit (~32K char ceiling) of
 * text-embedding-3-small. Trailing portion is what gets kept — we
 * generally want the most recent narrative when summarizing.
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  if (!text || !text.trim()) {
    throw new Error("embedText: empty input");
  }
  // Hard cap to ~8000 chars (rough = ~2000 tokens for 繁中). Well below
  // the 8192 token model limit. Take the trailing portion so recent
  // content survives in case the caller passed a long blob.
  const trimmed = text.length > 8000 ? text.slice(-8000) : text;

  const result = await withRateLimitRetry("embedText", () =>
    embed({
      model: openaiEmbedClient.embedding(EMBED_MODEL),
      value: trimmed,
    }),
  );

  if (result.embedding.length !== EMBED_DIMS) {
    throw new Error(
      `embedText: unexpected dimension ${result.embedding.length}, expected ${EMBED_DIMS}`,
    );
  }

  return {
    vector: result.embedding,
    tokens: result.usage?.tokens ?? 0,
  };
}

/**
 * Embed multiple texts in a single API call (cheaper + fewer round trips).
 * Use for batched lorebook extraction / bulk backfill.
 */
export async function embedTexts(texts: string[]): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return [];
  const trimmed = texts.map((t) => (t.length > 8000 ? t.slice(-8000) : t));

  const result = await withRateLimitRetry("embedTexts", () =>
    embedMany({
      model: openaiEmbedClient.embedding(EMBED_MODEL),
      values: trimmed,
    }),
  );

  return result.embeddings.map((vec) => {
    if (vec.length !== EMBED_DIMS) {
      throw new Error(
        `embedTexts: unexpected dimension ${vec.length}, expected ${EMBED_DIMS}`,
      );
    }
    // Vercel AI SDK returns total usage; we approximate per-item by even split.
    const tokensPerItem = result.usage?.tokens
      ? Math.ceil(result.usage.tokens / texts.length)
      : 0;
    return { vector: vec, tokens: tokensPerItem };
  });
}

/**
 * Safely embed — returns null on failure instead of throwing. Use this in
 * fire-and-forget background paths where a single failed embed shouldn't
 * break the turn pipeline (e.g., embedding an AI turn after it's already
 * been saved to the DB).
 */
export async function embedTextSafe(
  text: string,
  context: string = "unknown",
): Promise<EmbeddingResult | null> {
  try {
    return await embedText(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[embed] ${context} failed (continuing): ${msg}`);
    return null;
  }
}

/**
 * Convert a number array to Postgres array literal syntax for vector(1536).
 * Supabase's JS client serializes it correctly when passed as a JS array,
 * but if you need to manually craft a SQL string for the RPC call, use this.
 *
 * Example: vectorToPgLiteral([1, 2, 3]) === "[1,2,3]"
 */
export function vectorToPgLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export const EMBEDDING_DIMENSIONS = EMBED_DIMS;
export const EMBEDDING_MODEL = EMBED_MODEL;
