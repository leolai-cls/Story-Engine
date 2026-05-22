import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * Wave 1.5 audit fix W1-MOD-C-01: certain table writes (story_comments,
 * story_ratings) had INSERT/UPDATE revoked from `authenticated` role in
 * Migration 0011. The legitimate write path is now SECURITY DEFINER RPCs
 * granted to service_role only. Action layer uses this client to call
 * those RPCs after moderation passes.
 *
 * Browser users CANNOT bypass this — they have no service-role JWT. They
 * can call other RPCs granted to authenticated, but the ones we use here
 * (`insert_story_comment_secure` etc) are service-role only.
 *
 * USAGE:
 *   import { createServiceRoleClient } from "@/lib/supabase/service-role";
 *   const supabase = createServiceRoleClient();
 *   const { data, error } = await supabase.rpc("insert_story_comment_secure", { ... });
 *
 * IMPORTANT:
 *   - This client bypasses RLS. Never expose it to a request handler that
 *     accepts user-provided IDs without verifying the user owns them first.
 *   - The action layer pattern is: (1) auth-client `getUser()` to identify
 *     the caller, (2) moderation, (3) service-role-client RPC call with
 *     p_user_id = user.id (the RPC trusts the action layer to have verified).
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing — server misconfigured",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
