import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Smart post-login landing destination.
 *
 * Founder product-flow rule (2026-05-25 · per ChatGPT / Claude / Grok pattern):
 *   - 有 playthrough → /my (回頭客 · ChatGPT-style "your conversations")
 *   - 冇 playthrough → /library (新客 · game lobby with start-new-game hero +
 *     community discovery + trending ranking)
 *
 * Never default to /profile (empty placeholder · dead-end).
 *
 * Returns a path WITHOUT locale prefix. Caller composes with locale or
 * lets next-intl middleware localize.
 *
 * Session 16 follow-up (founder UX feedback 2026-05-28): /library is the
 * game lobby for new users. LobbyHero component renders prominent
 * "Start a new game" CTA + 4 example scenarios at top of /library for
 * any authed user. So new user landing = sees lobby + community + ranking
 * in one place. Returning user with playthroughs lands /my (ChatGPT-style).
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
