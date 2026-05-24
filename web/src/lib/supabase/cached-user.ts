import { cache } from "react";
import { createClient } from "./server";
import type { User } from "@supabase/supabase-js";

/**
 * Cached current user — dedupes `auth.getUser()` across one React render tree.
 *
 * AUDIT FIX (MG-PERF-HIGH-01 / MG-SEC-MED-01): Before this helper, every
 * server component that needed the user called `createClient().auth.getUser()`
 * directly. On a typical authenticated page render, that meant:
 *   - page.tsx: getUser() — call #1
 *   - SiteHeader: getUser() — call #2 (auth-aware nav)
 *   - any auth-gated child component: getUser() — call #3+
 *
 * Each call is a 10-30ms warm / 30-80ms cold roundtrip (cookie read + JWT
 * decode + Supabase auth endpoint validate). React's `cache()` wraps the
 * helper so all calls within the same request share a single underlying
 * fetch, regardless of who calls it. Off-render, cache is invalidated.
 *
 * Use this everywhere a server component needs the current user. If you also
 * need a Supabase client for queries, still call `createClient()` separately
 * — its construction is cheap (cookie read only). Only the AUTH roundtrip
 * is the expensive part this dedupes.
 *
 * Returns `null` for anonymous users instead of throwing — callers handle
 * redirect / branching themselves.
 */
export const getCachedUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
