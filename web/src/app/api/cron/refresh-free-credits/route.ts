import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Daily cron — refresh free-tier credits.
 *
 * Schedule: 0 0 * * * (UTC midnight) via vercel.json.
 *
 * Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET` header.
 * We verify against CRON_SECRET env var.
 *
 * Behavior (Migration 0037 · additive): grants +100 credits/day to every
 * `subscription_tier='free'` user, capped at the 1,000 free-wallet ceiling
 * (grant = min(100, 1000 - balance)). 2026-05-29 founder bumped 50→100/day so
 * a free user can play ~2 turns/day. Idempotent via 23h ledger window. Each
 * grant writes a ledger row reason='free_tier_refresh'.
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

  // Daily additive increment (Migration 0037 interprets this as +N/day, capped
  // at the 1,000 free-wallet ceiling). 2026-05-29: 50 → 100/day (founder).
  const targetBalance = 100;
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
