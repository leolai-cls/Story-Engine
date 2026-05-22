import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Daily cron — refresh free-tier credits.
 *
 * Schedule: 0 0 * * * (UTC midnight) via vercel.json.
 *
 * Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET` header.
 * We verify against CRON_SECRET env var. Phase 4 audit fix
 * (P3-BILL-H-11): mechanism for the "50 credits 每日" claim that the
 * pricing page advertised but didn't actually exist.
 *
 * Behavior: tops every `subscription_tier='free'` user UP TO 50 credits.
 * Doesn't accumulate (50 is the floor, not the addition). Users with
 * credit_balance >= 50 are no-op. Each top-up writes a ledger row with
 * reason='free_tier_refresh'.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth: Vercel cron sets Authorization header
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    );
  }

  // Service-role client bypasses RLS — only it has execute permission on
  // refresh_free_tier_credits (RPC granted to service_role only).
  const supabase = createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const targetBalance = 50;
  const { data, error } = await supabase.rpc("refresh_free_tier_credits", {
    p_target_balance: targetBalance,
  });

  if (error) {
    console.error("[cron:refresh-free-credits] RPC failed:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const refreshedCount = row?.refreshed_count ?? 0;
  const totalGranted = row?.total_credits_granted ?? 0;

  console.log(
    `[cron:refresh-free-credits] refreshed ${refreshedCount} users, granted ${totalGranted} credits (target=${targetBalance})`,
  );

  return NextResponse.json({
    ok: true,
    refreshedCount,
    totalGranted,
    targetBalance,
    runAt: new Date().toISOString(),
  });
}
