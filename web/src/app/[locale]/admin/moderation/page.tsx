import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { notFound } from "next/navigation";
import { ModerationQueueClient } from "./moderation-queue-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin moderation queue · Session 16 P-03 launch blocker.
 *
 * Lists pending moderation_flags + lets admin approve / dismiss / soft-delete
 * offending content. Gate: auth.users.raw_app_meta_data.role = 'admin'
 * (founder sets manually via Supabase Dashboard → Auth → Users).
 *
 * Hidden from search engines via metadata robots. notFound() if user is not
 * admin — same 404 as accessing any unknown route (information leakage
 * mitigation).
 */
export default async function AdminModerationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCachedUser();
  if (!user) {
    redirect({
      href: `/login?next=/${locale}/admin/moderation` as never,
      locale,
    });
    return null; // unreachable · for TS narrowing
  }

  const supabase = await createClient();

  // Check admin via is_admin() RPC (reads auth.users.raw_app_meta_data.role)
  const { data: isAdmin, error: adminCheckErr } = await supabase.rpc("is_admin", {
    p_user_id: user.id,
  });
  if (adminCheckErr || !isAdmin) {
    // Non-admin gets 404 · don't reveal route exists
    notFound();
  }

  // Fetch pending moderation flags · admin RLS policy permits this read
  const { data: flags, error: flagsErr } = await supabase
    .from("moderation_flags")
    .select(
      "id, content_type, content_id, reporter_id, reason, details, status, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (flagsErr) {
    console.error("[admin/moderation] flags fetch error:", flagsErr);
  }

  // Enrich with content snippet (title for story · body excerpt for comment)
  const enrichedFlags = await Promise.all(
    (flags ?? []).map(async (f) => {
      let snippet = "";
      let ownerName: string | null = null;
      if (f.content_type === "story") {
        const { data: s } = await supabase
          .from("stories")
          .select("title, description, owner_id, is_hidden")
          .eq("id", f.content_id)
          .maybeSingle();
        snippet = s?.title ? `${s.title} — ${(s.description ?? "").slice(0, 120)}` : "(deleted)";
        if (s?.owner_id) {
          const { data: p } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", s.owner_id)
            .maybeSingle();
          ownerName = (p?.display_name as string | null) ?? null;
        }
      } else if (f.content_type === "comment") {
        const { data: c } = await supabase
          .from("story_comments")
          .select("body, user_id, is_hidden")
          .eq("id", f.content_id)
          .maybeSingle();
        snippet = c?.body ? c.body.slice(0, 240) : "(deleted)";
        if (c?.user_id) {
          const { data: p } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", c.user_id)
            .maybeSingle();
          ownerName = (p?.display_name as string | null) ?? null;
        }
      } else if (f.content_type === "playthrough") {
        snippet = "(playthrough · admin view limited)";
      }
      return { ...f, snippet, ownerName };
    }),
  );

  // Fetch stats · total + pending + by reason
  const { count: totalCount } = await supabase
    .from("moderation_flags")
    .select("id", { count: "exact", head: true });

  return (
    <ModerationQueueClient
      flags={enrichedFlags}
      stats={{ pending: enrichedFlags.length, total: totalCount ?? 0 }}
    />
  );
}
