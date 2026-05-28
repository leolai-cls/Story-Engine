import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ArrowLeft, Star, MessageSquare, Lock, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import {
  getStoryById,
  getStoryRatings,
  getTopLevelComments,
  getMyRating,
} from "@/lib/community/queries";
import { StoryDetailActions } from "./story-detail-actions";
import { Cover } from "@/components/se/Cover";
import { RatingBadge, GenreChip, Stars, Avatar } from "@/components/se/Badges";
import { MobileStickyForkCta } from "./mobile-sticky-cta";
import type { GenreKey } from "@/components/se/genre";

export const dynamic = "force-dynamic";

/**
 * Story Detail page — UI tier v1 (Grok × Netflix · light theme).
 *
 * Mental anchor: "scenario landing page", NOT product page.
 * Story = scenario template. Each playthrough is unique emergent narrative.
 * NO "完成率" · NO "全程 cost" · NO "建議長度" — length is emergent.
 *
 * Layout:
 *   1. Full-bleed cover hero with gradient overlay · title overlay · CTAs
 *   2. Below hero · 2-col scroll:
 *      - Main col: opening narrative preview · cast preview · comments
 *      - Sidebar: stats (descriptive · NOT prescriptive) · 評分分佈
 */
export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; storyId: string }>;
}) {
  const { locale, storyId } = await params;
  setRequestLocale(locale);
  // Wave 2 deferred-file migration (2026-05-28): full story-detail page localized.
  const t = await getTranslations("storyDetail");

  const supabase = await createClient();
  // AUDIT FIX MG-PERF-HIGH-01: cached — SiteHeader piggybacks on same call.
  const user = await getCachedUser();

  const story = await getStoryById(supabase, storyId);
  if (!story) notFound();

  // Phase 6 audit fix (P6-MED-01): if story is adult-rated and user adult_mode
  // off, show 403-friendly card instead of full page (info-only · no fork
  // action surfaced).
  let adultModeEnabled = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("adult_mode_enabled")
      .eq("id", user.id)
      .single();
    adultModeEnabled = profile?.adult_mode_enabled ?? false;
  }
  const adultBlocked = story.content_rating === "adult" && !adultModeEnabled;

  // Owner check + extra story fields (opening_narrative)
  const { data: extra } = await supabase
    .from("stories")
    .select("owner_id, visibility, opening_narrative")
    .eq("id", storyId)
    .single();
  const isOwner = !!user && extra?.owner_id === user.id;
  const visibility = extra?.visibility ?? "private";
  const openingNarrative = extra?.opening_narrative as string | null | undefined;

  // Cast preview · query story_characters
  const { data: characters } = await supabase
    .from("story_characters")
    .select("name, role, traits")
    .eq("story_id", storyId)
    .order("created_at", { ascending: true })
    .limit(4);

  const [ratings, comments, myRating] = await Promise.all([
    getStoryRatings(supabase, { storyId, limit: 5 }),
    getTopLevelComments(supabase, { storyId, limit: 20 }),
    user ? getMyRating(supabase, { storyId, userId: user.id }) : Promise.resolve(null),
  ]);

  // Aggregate stats for sidebar (descriptive only · no completion %).
  // play_count + rating_avg + rating_count come from LibraryStory.
  // TODO (backend): median_session_turn_count via view, fork_count via count(*).

  if (adultBlocked) {
    return <StoryDetail403 locale={locale} />;
  }
  const visibilityLabel =
    visibility === "public"
      ? t("visibility.public")
      : visibility === "unlisted"
        ? t("visibility.unlisted")
        : t("visibility.private");

  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-20 md:pb-0" style={{ background: "var(--se-bg)" }}>
        {/* B3 audit · Mobile compact hero (110px side cover + title beside · md:hidden) */}
        <section
          className="md:hidden relative px-4 pt-6 pb-5"
          style={{
            background: `linear-gradient(180deg, var(--se-surface-2) 0%, var(--se-bg) 100%)`,
            borderBottom: "1px solid var(--se-border)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-4">
            <Link
              href={"/library" as never}
              locale={locale}
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: "var(--se-fg-muted)" }}
            >
              <ArrowLeft size={11} />
              {t("breadcrumbLibrary")}
            </Link>
          </div>
          <div className="flex items-start gap-3.5">
            <div className="flex-none" style={{ width: 110 }}>
              <Cover storyId={story.id} genre={story.genre as GenreKey} ratio="3 / 4" size="md" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {story.genre && <GenreChip genre={story.genre as GenreKey} />}
                <RatingBadge rating={story.content_rating} />
              </div>
              <h1
                className="m-0 se-cjk"
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  color: "var(--se-fg)",
                }}
              >
                {story.title}
              </h1>
              <div
                className="flex items-center gap-1.5 mt-2 text-xs"
                style={{ color: "var(--se-fg-muted)" }}
              >
                <Avatar name="·" size={16} hue={220} />
                <span style={{ color: "var(--se-fg-2)" }}>{t("community")}</span>
              </div>
              <div className="mt-2">
                <Stars value={story.rating_avg ?? 0} count={story.rating_count} size={11} />
              </div>
            </div>
          </div>
          {story.description && (
            <p
              className="mt-4 mb-0 text-sm se-cjk"
              style={{
                color: "var(--se-fg-2)",
                lineHeight: 1.7,
              }}
            >
              {story.description}
            </p>
          )}
        </section>

        {/* HERO — full-bleed cover · desktop only (md+) */}
        <section className="hidden md:block relative overflow-hidden border-b" style={{
          height: 480,
          borderColor: "var(--se-border)",
        }}>
          {/* Background cover */}
          <div className="absolute inset-0">
            <Cover
              storyId={story.id}
              genre={story.genre as GenreKey}
              ratio="auto"
              size="none"
              noLabel
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: 0,
              }}
            />
          </div>
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(0deg, var(--se-bg) 0%, transparent 40%),
                linear-gradient(90deg, rgba(20,18,14,0.55) 0%, transparent 60%)`,
            }}
          />
          {/* Breadcrumb top-left */}
          <div className="absolute top-5 left-14 z-10">
            <Link
              href={"/library" as never}
              locale={locale}
              className="inline-flex items-center gap-1.5 text-xs"
              style={{
                color: "rgba(255,255,255,0.85)",
                textShadow: "0 1px 4px rgba(0,0,0,0.4)",
              }}
            >
              <ArrowLeft size={12} />
              {t("breadcrumbLibrary")}
            </Link>
          </div>
          {/* Hero content bottom-left */}
          <div
            className="absolute z-10 text-white"
            style={{
              left: 56,
              right: 56,
              bottom: 56,
              maxWidth: 640,
              textShadow: "0 1px 8px rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-2 mb-3.5 flex-wrap">
              {story.genre && <GenreChip genre={story.genre as GenreKey} />}
              <RatingBadge rating={story.content_rating} />
              <span className="se-mono text-[10.5px]" style={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.08em" }}>
                {(story.language || "zh-Hant").toUpperCase()}
              </span>
            </div>
            <h1
              className="se-cjk text-white m-0"
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
                textWrap: "balance",
              }}
            >
              {story.title}
            </h1>
            {story.description && (
              <p
                className="mt-5 se-cjk"
                style={{
                  fontSize: 16,
                  lineHeight: 1.65,
                  color: "rgba(255,255,255,0.88)",
                  maxWidth: 540,
                }}
              >
                {story.description}
              </p>
            )}
            <div className="mt-6 flex items-center gap-2 flex-wrap" style={{ rowGap: 6 }}>
              <Avatar name="·" size={20} hue={220} />
              <span className="text-sm" style={{ color: "#fff" }}>{t("community")}</span>
              {isOwner && (
                <span
                  className="ml-2 se-mono"
                  style={{
                    fontSize: 10,
                    padding: "2px 7px",
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.18)",
                    color: "#fff",
                    letterSpacing: "0.05em",
                  }}
                >
                  {visibilityLabel}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Body · 2-col layout: main + sidebar (1-col on mobile) */}
        <div
          className="max-w-[1200px] mx-auto px-4 sm:px-14 py-6 md:py-10 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6 md:gap-12"
        >
          {/* MAIN column */}
          <div className="min-w-0">
            {/* Actions cluster (Fork / Continue / Rate / etc) */}
            <div id="story-actions" className="mb-10 scroll-mt-20">
              <StoryDetailActions
                storyId={storyId}
                isOwner={isOwner}
                isAuthenticated={!!user}
                currentVisibility={visibility}
                myRating={myRating ?? null}
              />
            </div>

            {/* Opening narrative preview */}
            {openingNarrative && (
              <section className="mb-10">
                <div className="flex items-baseline gap-3 mb-3.5">
                  <h2 className="text-base font-semibold m-0 se-cjk" style={{ color: "var(--se-fg)" }}>
                    {t("openingHeader")}
                  </h2>
                  <span className="se-mono text-[10.5px]" style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}>
                    OPENING NARRATIVE
                  </span>
                </div>
                <div
                  className="relative p-6 rounded-xl se-cjk"
                  style={{
                    background: "var(--se-surface)",
                    border: "1px solid var(--se-border)",
                  }}
                >
                  <p
                    className="m-0"
                    style={{
                      fontSize: 16,
                      lineHeight: 1.85,
                      color: "var(--se-fg)",
                      letterSpacing: "0.01em",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {openingNarrative}
                  </p>
                </div>
                <p
                  className="mt-3 text-xs se-cjk text-center"
                  style={{ color: "var(--se-fg-muted)" }}
                >
                  {t("openingHint")}
                </p>
              </section>
            )}

            {/* Cast preview */}
            {characters && characters.length > 0 && (
              <section className="mb-10">
                <div className="flex items-baseline gap-3 mb-3.5">
                  <h2 className="text-base font-semibold m-0 se-cjk" style={{ color: "var(--se-fg)" }}>
                    {t("castHeader")}
                  </h2>
                  <span className="se-mono text-[10.5px]" style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}>
                    {t("castSubFormat", { count: characters.length })}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {characters.map((c) => (
                    <div
                      key={c.name}
                      className="p-3.5 rounded-lg flex flex-col gap-2.5"
                      style={{
                        background: "var(--se-surface)",
                        border: "1px solid var(--se-border)",
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} size={36} hue={(c.name.charCodeAt(0) * 13) % 360} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium se-cjk truncate">{c.name}</div>
                          {c.role && (
                            <div className="text-[11px] truncate" style={{ color: "var(--se-fg-dim)" }}>
                              {c.role}
                            </div>
                          )}
                        </div>
                      </div>
                      {Array.isArray(c.traits) && c.traits.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(c.traits as string[]).slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="se-mono"
                              style={{
                                fontSize: 10,
                                padding: "2px 6px",
                                borderRadius: 3,
                                background: "var(--se-surface-2)",
                                color: "var(--se-fg-muted)",
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Reviews + Comments */}
            <section className="mb-12">
              <div className="flex items-baseline gap-3 mb-4">
                <h2 className="text-base font-semibold m-0 se-cjk" style={{ color: "var(--se-fg)" }}>
                  {t("commentsHeader")}
                </h2>
                <span className="se-mono text-[10.5px]" style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}>
                  {t("commentsSubFormat", { comments: comments.length, ratings: story.rating_count })}
                </span>
              </div>

              {ratings.length > 0 && (
                <div className="space-y-2.5 mb-6">
                  {ratings.map((r) => (
                    <div
                      key={r.user_id + r.created_at}
                      className="p-4 rounded-lg"
                      style={{
                        background: "var(--se-surface)",
                        border: "1px solid var(--se-border)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Avatar name={r.display_name ?? "?"} size={22} hue={200} />
                        <span className="text-sm font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
                          {r.display_name?.trim() || `${r.user_id.slice(0, 8)}…`}
                        </span>
                        <span style={{ color: "oklch(0.78 0.13 80)" }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} style={{ fontSize: 12 }}>
                              {n <= r.score ? "★" : "☆"}
                            </span>
                          ))}
                        </span>
                        <span
                          className="se-mono ml-auto text-[10.5px]"
                          style={{ color: "var(--se-fg-dim)" }}
                        >
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {r.review_text && (
                        <p
                          className="text-sm whitespace-pre-wrap se-cjk"
                          style={{ color: "var(--se-fg-2)", lineHeight: 1.6 }}
                        >
                          {r.review_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {comments.length === 0 ? (
                <div
                  className="p-8 rounded-lg text-center"
                  style={{
                    background: "var(--se-surface)",
                    border: "1px dashed var(--se-border-strong)",
                  }}
                >
                  <MessageSquare size={20} className="mx-auto mb-2" color="var(--se-fg-dim)" />
                  <p className="text-sm se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                    {t("commentsEmpty")}
                    {user ? t("commentsEmptyAuthed") : t("commentsEmptyAnon")}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 rounded-lg"
                      style={{
                        background: "var(--se-surface)",
                        border: "1px solid var(--se-border)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Avatar name={c.display_name ?? "?"} size={22} hue={150} />
                        <span className="text-sm font-medium se-cjk">
                          {c.display_name?.trim() || `${c.user_id.slice(0, 8)}…`}
                        </span>
                        <span
                          className="se-mono ml-auto text-[10.5px]"
                          style={{ color: "var(--se-fg-dim)" }}
                        >
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {c.deleted ? (
                        <p className="text-sm italic se-cjk" style={{ color: "var(--se-fg-dim)" }}>
                          {t("commentDeleted")}
                        </p>
                      ) : (
                        <p
                          className="text-sm whitespace-pre-wrap se-cjk"
                          style={{ color: "var(--se-fg-2)", lineHeight: 1.6 }}
                        >
                          {c.body}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* SIDEBAR · stats (descriptive only) */}
          <aside style={{ alignSelf: "start", position: "sticky", top: 76 }}>
            <div
              className="p-5 rounded-xl"
              style={{
                background: "var(--se-surface)",
                border: "1px solid var(--se-border)",
              }}
            >
              {/* Rating headline */}
              <div className="flex items-baseline gap-2">
                <span
                  className="se-mono"
                  style={{
                    fontSize: 32,
                    fontWeight: 600,
                    color: "oklch(0.55 0.13 80)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {(story.rating_avg ?? 0).toFixed(1)}
                </span>
                <Stars value={story.rating_avg ?? 0} size={13} />
              </div>
              <div className="text-[11.5px] mt-0.5" style={{ color: "var(--se-fg-dim)" }}>
                {story.rating_count}{t("ratingCountSuffix")}
              </div>

              <div
                style={{
                  height: 1,
                  background: "var(--se-border)",
                  margin: "18px 0",
                }}
              />

              {/* Descriptive stats grid · NO completion % · NO 建議長度 */}
              <div className="grid grid-cols-2 gap-3.5 text-xs">
                <StatTile label={t("stats.playthroughs")} value={story.play_count.toLocaleString()} />
                <StatTile label={t("stats.ratings")} value={String(story.rating_count)} />
                <StatTile label={t("stats.comments")} value={String(comments.length)} />
                <StatTile label={t("stats.published")} value={new Date(story.created_at).toLocaleDateString()} />
              </div>

              {/* Cost framing · per-turn only · NO 全程 estimate */}
              <div
                style={{
                  marginTop: 18,
                  padding: "10px 12px",
                  borderRadius: 7,
                  background: "var(--se-surface-2)",
                  border: "1px solid var(--se-border)",
                  fontSize: 11.5,
                  color: "var(--se-fg-muted)",
                  lineHeight: 1.55,
                }}
              >
                <div className="se-mono uppercase mb-1 text-[10px]" style={{ color: "var(--se-fg-dim)", letterSpacing: "0.06em" }}>
                  {t("costLabel")}
                </div>
                <span className="se-mono" style={{ color: "var(--se-fg-2)" }}>{t("costPerTurn")}</span>
                <span className="se-cjk">{t("costTagline")}</span>
              </div>

              {/* Tags */}
              {story.tags.length > 0 && (
                <>
                  <div
                    style={{
                      height: 1,
                      background: "var(--se-border)",
                      margin: "18px 0 14px",
                    }}
                  />
                  <div className="se-mono uppercase text-[10px] mb-2" style={{ color: "var(--se-fg-dim)", letterSpacing: "0.06em" }}>
                    TAGS
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {story.tags.slice(0, 8).map((tag) => (
                      <span
                        key={tag}
                        className="se-cjk"
                        style={{
                          fontSize: 11.5,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: "var(--se-surface-2)",
                          color: "var(--se-fg-muted)",
                          border: "1px solid var(--se-border)",
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
      {/* B3 audit fix · Mobile sticky bottom CTA · jumps to actions section */}
      <MobileStickyForkCta disabled={!user} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Stat tile (sidebar)
// ─────────────────────────────────────────────────────────────
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="se-mono uppercase"
        style={{
          fontSize: 10,
          color: "var(--se-fg-dim)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div className="se-mono mt-1" style={{ fontSize: 16, color: "var(--se-fg)" }}>
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Adult 403 friendly card (P6-UX-L-03 backlog · UI tier addressed)
// ─────────────────────────────────────────────────────────────
async function StoryDetail403({ locale }: { locale: string }) {
  // Wave 2 deferred-file migration (2026-05-28): localize 403 panel.
  const tBlock = await getTranslations("storyDetail.block403");
  return (
    <>
      <SiteHeader />
      <main className="flex-1" style={{ background: "var(--se-bg)" }}>
        <div className="max-w-[560px] mx-auto px-6 pt-20 pb-12 text-center">
          <span
            className="inline-flex items-center justify-center mb-4"
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--se-warn-bg)",
              color: "var(--se-warn)",
            }}
          >
            <Lock size={22} />
          </span>
          <div className="se-mono uppercase text-xs" style={{ color: "var(--se-warn)", letterSpacing: "0.06em" }}>
            {tBlock("httpLabel")}
          </div>
          <h1 className="text-[22px] font-semibold mt-3.5 mb-2.5 se-cjk" style={{ letterSpacing: "-0.015em" }}>
            {tBlock("title")}
          </h1>
          <p className="text-sm se-cjk max-w-[440px] mx-auto" style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}>
            {tBlock.rich("body", {
              plus: (chunks) => (
                <span className="se-mono" style={{ color: "var(--se-fg)" }}>{chunks}</span>
              ),
              settings: (chunks) => (
                <span style={{ color: "var(--se-fg)" }}>{chunks}</span>
              ),
            })}
          </p>
          <div className="flex gap-2.5 justify-center mt-6">
            <Link
              href={"/settings" as never}
              locale={locale}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{ background: "var(--se-fg)", color: "var(--se-bg)" }}
            >
              {tBlock("cta")}
            </Link>
            <Link
              href={"/library" as never}
              locale={locale}
              className="px-4 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--se-border)", color: "var(--se-fg-muted)" }}
            >
              {tBlock("back")}
            </Link>
          </div>
          <div
            className="mt-8 p-4 rounded-lg text-left text-xs se-cjk"
            style={{
              background: "var(--se-surface)",
              border: "1px solid var(--se-border)",
              color: "var(--se-fg-muted)",
              lineHeight: 1.65,
            }}
          >
            <div className="flex items-start gap-2.5">
              <Info size={14} color="var(--se-fg-muted)" className="mt-0.5 flex-none" />
              <div>
                <div className="font-medium mb-1" style={{ color: "var(--se-fg-2)" }}>
                  {tBlock("whyTitle")}
                </div>
                {tBlock("whyBody")}
                <span style={{ color: "var(--se-fg-dim)" }}>{tBlock("phaseNote")}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
