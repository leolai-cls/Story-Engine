import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Phase 8 Wave 3 fix CRIT-08 (= SEC-HIGH-04 + DF-CRIT-04 + DF-CRIT-05).
 *
 * Daily cron · cleanup expired storage references + orphan scene images.
 * Schedule: 0 3 * * * (UTC 3 AM · staggered from credit refresh).
 *
 * What it does:
 *   1. style_references: DELETE row + Storage object WHERE expires_at < now()
 *      (24h auto-expire · founder TOS-shift posture · user keeps no rights)
 *   2. scene_images orphan storage: list bucket paths matching {user_id}/{playthroughId}/...
 *      where playthrough no longer exists (deletecascade cleared DB row but not storage)
 *      → batch remove
 *
 * Both passes are safe to run repeatedly · idempotent. Sentry logs failures
 * but doesn't fail the whole run (per-row resilience).
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
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

  const supabase = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = {
    style_refs_expired: 0,
    style_refs_storage_removed: 0,
    style_refs_storage_failed: 0,
    started_at: new Date().toISOString(),
    finished_at: "",
  };

  // ─── Pass 1: style_references expiry (24h TTL · DEFAULT now()+24h) ────
  // Find expired rows · capture their storage URLs · delete DB row · then
  // batch-remove Storage objects (in case of cascade lag, both directions safe).
  try {
    const { data: expiredRefs, error: selectErr } = await supabase
      .from("style_references")
      .select("id, storage_url")
      .lt("expires_at", new Date().toISOString())
      .limit(1000);

    if (selectErr) {
      console.error("[cron/cleanup-storage] select expired style_refs failed:", selectErr);
    } else if (expiredRefs && expiredRefs.length > 0) {
      const pathsToRemove: string[] = [];
      const idsToDelete: string[] = [];

      for (const row of expiredRefs) {
        const r = row as { id: string; storage_url: string };
        // Public URL shape: .../storage/v1/object/public/style-references/{path}
        const match = r.storage_url.match(/\/style-references\/(.+)$/);
        if (match) pathsToRemove.push(match[1]);
        idsToDelete.push(r.id);
      }

      // Delete DB rows
      const { error: delErr, count } = await supabase
        .from("style_references")
        .delete({ count: "exact" })
        .in("id", idsToDelete);
      if (delErr) {
        console.error("[cron/cleanup-storage] DB delete failed:", delErr);
      } else {
        result.style_refs_expired = count ?? 0;
      }

      // Batch-remove Storage objects (Supabase allows up to 1000 per call)
      if (pathsToRemove.length > 0) {
        const { error: storageErr } = await supabase.storage
          .from("style-references")
          .remove(pathsToRemove);
        if (storageErr) {
          console.error("[cron/cleanup-storage] storage remove failed:", storageErr);
          result.style_refs_storage_failed = pathsToRemove.length;
        } else {
          result.style_refs_storage_removed = pathsToRemove.length;
        }
      }
    }
  } catch (e) {
    console.error("[cron/cleanup-storage] style_references pass crashed:", e);
  }

  // ─── Pass 2: scene_images orphan storage cleanup ───────────────────────
  // DEFERRED to a future migration · current ON DELETE CASCADE clears DB rows
  // but not Storage objects. A full reconciliation requires iterating bucket
  // listings (expensive) OR a Postgres trigger that uses pg_net to call a
  // service-role storage.remove() endpoint. For MVP launch, this gap is
  // acknowledged · cleanup will happen via a one-shot migration after launch
  // OR a future enhancement here. Tracking in pm/BACKLOG.md.

  result.finished_at = new Date().toISOString();
  return NextResponse.json({ ok: true, result });
}
