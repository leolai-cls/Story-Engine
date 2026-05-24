import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Smart post-login landing destination.
 *
 * Founder product-flow rule (2026-05-25 · per ChatGPT / Claude / Grok pattern):
 *   - 有 playthrough → /my (回頭客 · ChatGPT-style "your conversations")
 *   - 冇 playthrough → /library (新客 · Netflix-style browse-first)
 *
 * Never default to /profile (empty placeholder · dead-end).
 *
 * Returns a path WITHOUT locale prefix. Caller composes with locale or
 * lets next-intl middleware localize.
 *
 * Uses `head: true, count: 'exact', limit: 1` — fast EXISTS-style probe,
 * doesn't fetch rows, RLS-scoped to user.id even when query is filtered
 * explicitly (defense in depth).
 */
export async function getLandingPath(
  supabase: SupabaseClient,
  userId: string,
): Promise<"/my" | "/library"> {
  const { count } = await supabase
    .from("playthroughs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .limit(1);
  return (count ?? 0) > 0 ? "/my" : "/library";
}
