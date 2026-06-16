import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { ImageIcon, UserSquare, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /[locale]/memory — "我嘅圖庫" gallery.
 *
 * Wave 3 (2026-06-15): the user's collected generated images. Two tabs:
 *   - 場景圖 (scene_images · per-turn scenes · mixed aspect ratios)
 *   - 角色設定圖 (character_sheets · 1536×1024 landscape · the collectible)
 *
 * RLS scopes both tables to the owner; we still pass user.id + filter
 * moderation_status='approved'. Refetches on every load (force-dynamic) — this
 * is the gallery the play screen's hard-rule-#0 "never revalidatePath" note
 * defers freshness to.
 *
 * Auth required (server redirect to /login if anon).
 */

type Tab = "scenes" | "sheets";

const GALLERY_LIMIT = 60;

export default async function MemoryGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("memoryGallery");
  const sp = await searchParams;
  const tab: Tab = sp.tab === "sheets" ? "sheets" : "scenes";

  const user = await getCachedUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/memory`);
  }
  const supabase = await createClient();

  // Both tables are RLS-scoped to the owner; query the active tab's rows.
  const table = tab === "sheets" ? "character_sheets" : "scene_images";
  const { data: rows } = await supabase
    .from(table)
    .select("id, playthrough_id, storage_url, created_at")
    .eq("user_id", user.id)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .limit(GALLERY_LIMIT);

  const items = (rows ?? []) as Array<{
    id: string;
    playthrough_id: string;
    storage_url: string;
    created_at: string;
  }>;

  // Resolve story titles via playthrough_id → playthroughs → stories.title.
  // One small extra query keyed by the playthrough ids we actually fetched
  // (avoids fragile embedded-resource FK naming).
  const titleByPlaythrough = new Map<string, string>();
  const ptIds = [...new Set(items.map((i) => i.playthrough_id))];
  if (ptIds.length > 0) {
    const { data: pts } = await supabase
      .from("playthroughs")
      .select("id, stories(title)")
      .in("id", ptIds);
    for (const p of (pts ?? []) as Array<{
      id: string;
      stories: { title: string | null } | { title: string | null }[] | null;
    }>) {
      const s = Array.isArray(p.stories) ? p.stories[0] : p.stories;
      if (s?.title) titleByPlaythrough.set(p.id, s.title);
    }
  }

  const emptyKey = tab === "sheets" ? "emptySheets" : "emptyScenes";

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-12" style={{ background: "var(--se-bg)" }}>
        <div className="mx-auto max-w-[1200px] px-6 sm:px-14 py-8 sm:py-12">
          {/* Header */}
          <div className="mb-6">
            <Link
              href={`/${locale}/my` as never}
              className="inline-flex items-center gap-1.5 mb-4 text-xs se-cjk transition-colors hover:text-foreground"
              style={{ color: "var(--se-fg-muted)" }}
            >
              <ArrowLeft size={13} />
              {t("back")}
            </Link>
            <h1
              className="text-3xl sm:text-4xl font-bold se-cjk"
              style={{ color: "var(--se-fg)", letterSpacing: "-0.02em" }}
            >
              {t("pageTitle")}
            </h1>
            <p
              className="mt-2 se-cjk text-sm"
              style={{ color: "var(--se-fg-muted)" }}
            >
              {t("subtitle")}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-6">
            <TabPill
              href={`/${locale}/memory`}
              active={tab === "scenes"}
              label={t("tabs.scenes")}
              icon={<ImageIcon size={12} />}
            />
            <TabPill
              href={`/${locale}/memory?tab=sheets`}
              active={tab === "sheets"}
              label={t("tabs.sheets")}
              icon={<UserSquare size={12} />}
            />
          </div>

          {/* Grid */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p
                className="text-sm se-cjk max-w-md"
                style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}
              >
                {t(emptyKey)}
              </p>
            </div>
          ) : (
            <div
              className={
                tab === "sheets"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                  : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
              }
            >
              {items.map((img) => (
                <a
                  key={img.id}
                  href={img.storage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={titleByPlaythrough.get(img.playthrough_id) || t("openFull")}
                  className="group block overflow-hidden rounded-lg border transition-colors"
                  style={{
                    background: "var(--se-surface)",
                    border: "1px solid var(--se-border)",
                  }}
                >
                  <div
                    className="overflow-hidden"
                    style={{ aspectRatio: tab === "sheets" ? "3 / 2" : "1 / 1" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.storage_url}
                      alt={titleByPlaythrough.get(img.playthrough_id) || t("openFull")}
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  </div>
                  {titleByPlaythrough.get(img.playthrough_id) && (
                    <div
                      className="px-2.5 py-1.5 text-[11px] se-cjk truncate"
                      style={{ color: "var(--se-fg-muted)" }}
                    >
                      {titleByPlaythrough.get(img.playthrough_id)}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function TabPill({
  href,
  active,
  label,
  icon,
}: {
  href: string;
  active: boolean;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
      style={{
        background: active ? "var(--se-fg)" : "var(--se-surface)",
        color: active ? "var(--se-bg)" : "var(--se-fg-muted)",
        border: `1px solid ${active ? "var(--se-fg)" : "var(--se-border)"}`,
      }}
    >
      {icon}
      <span className="se-cjk">{label}</span>
    </Link>
  );
}
