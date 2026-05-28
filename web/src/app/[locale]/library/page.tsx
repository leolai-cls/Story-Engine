import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import {
  getTrendingStories,
  getLatestStories,
  getStoriesByGenre,
  searchStories,
  getMyPlaythroughs,
  getMyStories,
  type LibraryStory,
} from "@/lib/community/queries";
import {
  Sparkles,
  Flame,
  Search,
  Plus,
  Heart,
  Swords,
  GraduationCap,
  Trophy,
  Bookmark,
  Lock,
  Info,
} from "lucide-react";
import { StoryCard, type StoryCardData } from "@/components/se/StoryCard";
import { ContinueCard, type ActivePlaythroughData } from "@/components/se/ContinueCard";
import { Carousel } from "@/components/se/Carousel";
import { Cover } from "@/components/se/Cover";
import { RatingBadge, GenreChip, Avatar } from "@/components/se/Badges";
import { CsamStrip } from "@/components/se/CsamStrip";
import { VisitorLanding } from "@/components/se/VisitorLanding";
import { GENRE, type GenreKey } from "@/components/se/genre";

export const dynamic = "force-dynamic";

/**
 * Library page — UI tier v1 (Grok × Netflix · light theme).
 *
 * Layout:
 *   1. Cinematic full-bleed hero (Netflix takeover · featured trending story)
 *   2. Sticky genre rail (filter strip · sticky below hero)
 *   3. Continue Playing carousel (if user has active runs · pinned first)
 *   4. My Stories carousel (if user has created stories)
 *   5. Search overlay (if ?q=)  OR  multi-board genre carousels (browse default)
 *      Empty boards smart-hide via Carousel component.
 *
 * Backend RPC calls IDENTICAL to previous version — only render layer rebuilt.
 * All Phase 5/6/audit logic preserved (CJK FTS · trending cold-start · adult mode filter · etc).
 */

const GENRE_BOARDS: Array<{
  key: GenreKey;
  aliases: string[];
}> = [
  { key: "romance", aliases: ["戀愛", "戀愛校園", "愛情", "romance", "純愛", "言情"] },
  { key: "adventure", aliases: ["冒險", "古惑仔", "黑道", "江湖", "adventure", "action", "武俠"] },
  { key: "campus", aliases: ["校園", "戀愛校園", "青春", "school", "学院", "學園"] },
  { key: "fantasy", aliases: ["奇幻", "玄幻", "玄幻冒險", "魔法", "fantasy", "魔幻", "仙俠"] },
  { key: "sports", aliases: ["運動", "體育", "sports", "競技"] },
  { key: "mystery", aliases: ["懸疑", "推理", "mystery", "thriller", "驚悚", "犯罪"] },
];

const MULTI_BOARD_THRESHOLD = 8;

const GENRE_ICONS: Record<GenreKey, React.ComponentType<{ size?: number }>> = {
  romance: Heart,
  adventure: Swords,
  campus: GraduationCap,
  fantasy: Sparkles,
  sports: Trophy,
  mystery: Search,
  slice: Bookmark,
  horror: Flame,
};

/** Adapt LibraryStory → StoryCardData for the new StoryCard component. */
function toCardData(s: LibraryStory): StoryCardData {
  return {
    id: s.id,
    title: s.title,
    author: null, // author display_name not yet on LibraryStory (TODO: backend join profiles)
    authorHue: 220,
    genre: (s.genre as GenreKey) ?? undefined,
    rating: s.content_rating,
    stars: s.rating_avg ?? 0,
    plays: s.play_count ?? 0,
  };
}

export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; language?: string; rating?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  // Wave 2 i18n migration (2026-05-27): library page now reads strings from
  // messages catalog (was hardcoded 繁中).
  const tLib = await getTranslations("library");
  const tGenres = await getTranslations("genres");

  const supabase = await createClient();
  // AUDIT FIX MG-PERF-HIGH-01: cached so SiteHeader doesn't repeat the call.
  const user = await getCachedUser();

  let adultModeEnabled = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("adult_mode_enabled")
      .eq("id", user.id)
      .single();
    adultModeEnabled = profile?.adult_mode_enabled ?? false;
  }

  const searchMode = !!sp.q?.trim();
  const language = sp.language?.trim() || undefined;
  const contentRating = sp.rating?.trim() || undefined;

  async function fetchBoard(aliases: string[]) {
    for (const alias of aliases) {
      const stories = await getStoriesByGenre(supabase, {
        genre: alias,
        language,
        contentRating,
        limit: 8,
      });
      if (stories.length > 0) return stories;
    }
    return [];
  }

  const filterByAdultMode = <T extends { content_rating: string }>(arr: T[]) =>
    adultModeEnabled ? arr : arr.filter((s) => s.content_rating !== "adult");

  const searchResults = searchMode
    ? filterByAdultMode(
        await searchStories(supabase, {
          query: sp.q ?? "",
          language,
          contentRating,
          limit: 24,
        }),
      )
    : null;

  let trending: LibraryStory[] = [];
  let latest: LibraryStory[] = [];
  let genreResults: LibraryStory[][] = [];
  let useLaunchFallback = false;

  if (!searchMode) {
    const [t, l] = await Promise.all([
      getTrendingStories(supabase, { language, contentRating, limit: 12 }),
      getLatestStories(supabase, { language, contentRating, limit: 8 }),
    ]);
    trending = filterByAdultMode(t);
    latest = filterByAdultMode(l);
    useLaunchFallback = trending.length < MULTI_BOARD_THRESHOLD;
    if (!useLaunchFallback) {
      const fetched = await Promise.all(
        GENRE_BOARDS.map((g) => fetchBoard(g.aliases)),
      );
      genreResults = fetched.map((arr) => filterByAdultMode(arr));
    }
  }

  const [myPlaythroughs, myStories] = user
    ? await Promise.all([
        getMyPlaythroughs(supabase, { userId: user.id, limit: 6 }),
        getMyStories(supabase, { userId: user.id, limit: 6 }),
      ])
    : [[], []];

  // Hero = top trending story (or first latest if no trending)
  const heroStory = trending[0] ?? latest[0] ?? null;

  // Continue cards: adapt MyPlaythroughRow → ActivePlaythroughData
  // Wave 2 i18n cycle-5 fix (2026-05-28): localize empty-title fallback (queries.ts
  // now returns "" for deleted-story rows · was hardcoded "(無標題)").
  const untitledLabel = tLib("storyCard.untitled");
  const activeCards: ActivePlaythroughData[] = myPlaythroughs.map((pt) => ({
    playthroughId: pt.id,
    storyId: pt.story_id,
    storyTitle: pt.story_title || untitledLabel,
    turn: pt.turn_count,
    snippet: null,
    delta: null,
    lastPlayed: relativeTime(pt.last_played_at, tLib),
  }));

  return (
    <>
      <SiteHeader />
      <main className="flex-1" style={{ background: "var(--se-bg)" }}>
        {/* A4 audit fix · Hard rule #2 CSAM reminder always visible in adult mode UI */}
        {adultModeEnabled && <CsamStrip variant="banner" />}

        {/* A2 audit fix · Visitor landing for anon users (3-pillar pitch + collage) */}
        {!user && !searchMode && <VisitorLanding locale={locale} />}

        {/* HERO — cinematic Netflix takeover (skipped for anon · landing replaces) */}
        {!searchMode && heroStory && user && (
          <LibraryHero locale={locale} story={heroStory} adultModeEnabled={adultModeEnabled} />
        )}

        {/* Search bar — full filters · shown in search mode or when no hero */}
        {(searchMode || !heroStory || !user) && (
          <div className="px-6 sm:px-14 py-6">
            <SearchForm
              q={sp.q ?? ""}
              language={sp.language ?? ""}
              rating={sp.rating ?? ""}
              adultModeEnabled={adultModeEnabled}
              searchMode={searchMode}
              locale={locale}
            />
          </div>
        )}

        {/* Genre rail (sticky filter strip · below hero) */}
        {!searchMode && (
          <GenreRail
            adultModeEnabled={adultModeEnabled}
            locale={locale}
          />
        )}

        {/* Continue Playing — pinned first for returning users */}
        {user && activeCards.length > 0 && (
          <Carousel
            title={tLib("carousels.continue")}
            sub={tLib("carousels.continueSub", { count: activeCards.length })}
            icon={<Bookmark size={13} />}
          >
            {activeCards.map((p) => (
              <ContinueCard key={p.playthroughId} p={p} locale={locale} />
            ))}
          </Carousel>
        )}

        {/* My Stories */}
        {user && myStories.length > 0 && (
          <Carousel
            title={tLib("carousels.myStories")}
            sub={tLib("carousels.myStoriesSub", { count: myStories.length })}
            icon={<Sparkles size={13} />}
          >
            {myStories.map((s) => (
              <StoryCard
                key={s.id}
                s={{
                  id: s.id,
                  title: s.title,
                  author: tLib("you"),
                  authorHue: 290,
                  rating: s.content_rating,
                  stars: s.rating_avg ?? 0,
                  plays: s.play_count ?? 0,
                }}
                locale={locale}
              />
            ))}
          </Carousel>
        )}

        {/* Search results */}
        {searchMode && searchResults !== null && (
          <SearchResults
            q={sp.q ?? ""}
            results={searchResults}
            locale={locale}
          />
        )}

        {/* Browse mode: launch fallback OR multi-board */}
        {!searchMode && useLaunchFallback && (
          <Carousel
            title={tLib("carousels.publicLibrary")}
            sub={tLib("carousels.publicLibrarySub")}
            icon={<Sparkles size={13} />}
            empty={trending.length === 0}
          >
            {trending.map((s) => (
              <StoryCard key={s.id} s={toCardData(s)} locale={locale} />
            ))}
          </Carousel>
        )}

        {!searchMode && !useLaunchFallback && (
          <>
            <Carousel
              title={tLib("carousels.trending")}
              sub={tLib("carousels.trendingSub")}
              icon={<Flame size={13} />}
            >
              {trending.map((s) => (
                <StoryCard key={s.id} s={toCardData(s)} locale={locale} />
              ))}
            </Carousel>
            <Carousel
              title={tLib("carousels.latest")}
              sub={tLib("carousels.latestSub")}
              icon={<Sparkles size={13} />}
              empty={latest.length === 0}
            >
              {latest.map((s) => (
                <StoryCard key={s.id} s={toCardData(s)} locale={locale} />
              ))}
            </Carousel>
            {GENRE_BOARDS.map((g, i) => {
              const Ico = GENRE_ICONS[g.key];
              return (
                <Carousel
                  key={g.key}
                  title={tGenres(g.key)}
                  sub={g.key.toUpperCase()}
                  icon={<Ico size={13} />}
                  empty={(genreResults[i] ?? []).length === 0}
                >
                  {(genreResults[i] ?? []).map((s) => (
                    <StoryCard key={s.id} s={toCardData(s)} locale={locale} />
                  ))}
                </Carousel>
              );
            })}
          </>
        )}

        {/* Anon visitor: VisitorLanding renders above instead of this footer-CTA */}

        <div style={{ height: 80 }} />
      </main>
      <SiteFooter />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Hero — full-bleed cinematic takeover (Netflix DNA)
// ─────────────────────────────────────────────────────────────
async function LibraryHero({
  story,
  locale,
}: {
  story: LibraryStory;
  locale: string;
  adultModeEnabled: boolean;
}) {
  const tLib = await getTranslations("library");
  const tGenres = await getTranslations("genres");
  // Wave 2 i18n migration: resolve genre label from catalog instead of GENRE.label.
  const genreKey = story.genre as string;
  const isKnownGenre = !!GENRE[genreKey as GenreKey];
  const genreLabel = isKnownGenre ? tGenres(genreKey as GenreKey) : null;
  return (
    <section
      className="relative overflow-hidden border-b"
      style={{
        height: 520,
        borderColor: "var(--se-border)",
      }}
    >
      {/* Background full-bleed cover */}
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
            linear-gradient(90deg, rgba(20,18,14,0.55) 0%, rgba(20,18,14,0.25) 30%, transparent 55%),
            linear-gradient(0deg, var(--se-bg) 0%, transparent 30%),
            linear-gradient(270deg, var(--se-bg) 0%, transparent 45%)`,
        }}
      />

      {/* Search inset over hero · top-right (Netflix-style nav-search-over-hero) */}
      <div
        className="absolute z-20 hidden md:flex items-center gap-3.5"
        style={{ top: 22, left: 56, right: 56 }}
      >
        <form
          method="get"
          className="flex items-center gap-2 h-[38px] px-3.5 rounded-lg flex-1"
          style={{
            maxWidth: 480,
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--se-border)",
          }}
        >
          <Search size={14} color="var(--se-fg-dim)" />
          <input
            type="text"
            name="q"
            placeholder={tLib("search.heroPlaceholder")}
            className="flex-1 bg-transparent outline-none text-sm se-cjk"
            style={{ color: "var(--se-fg)" }}
          />
          <span
            className="se-mono"
            style={{
              fontSize: 10,
              color: "var(--se-fg-dim)",
              padding: "2px 5px",
              borderRadius: 3,
              background: "rgba(20,18,14,0.06)",
            }}
          >
            ⌘K
          </span>
        </form>
        {/* Create-story CTA · primary brand action over hero
            (2026-05-27: previously only reachable via /my page or direct
            URL · added here so library landers have a clear entry into
            the AI wizard) */}
        <Link
          href={`/${locale}/stories/new`}
          className="inline-flex items-center gap-2 h-[38px] px-4 rounded-lg text-sm font-medium se-cjk"
          style={{
            background: "var(--se-fg)",
            color: "var(--se-bg)",
            whiteSpace: "nowrap",
          }}
        >
          <Plus size={14} />
          {tLib("header.newStory")}
        </Link>
      </div>

      {/* Cycle indicator · bottom-right (designer: 01 / 04 pagination + active dot) */}
      <div
        className="absolute z-10 hidden md:flex items-center gap-3.5"
        style={{ right: 56, bottom: 56 }}
      >
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: i === 0 ? 28 : 8,
                height: 3,
                borderRadius: 2,
                background: i === 0 ? "#fff" : "rgba(255,255,255,0.35)",
                transition: "width .25s var(--se-ease)",
              }}
            />
          ))}
        </div>
        <span
          className="se-mono"
          style={{
            fontSize: 10.5,
            color: "rgba(255,255,255,0.65)",
            letterSpacing: "0.08em",
          }}
        >
          01 / 04
        </span>
      </div>

      {/* Hero content — bottom-left aligned (Netflix pattern) */}
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
        <div
          className="se-mono uppercase"
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.78)",
          }}
        >
          <span style={{ color: "#f4d77a" }}>{tLib("hero.editorPick")}</span>
          <span style={{ marginLeft: 12, color: "rgba(255,255,255,0.55)" }}>
            {tLib("hero.featured")}
            {genreLabel ? ` · ${genreLabel}` : ""}
            {story.rating_avg ? ` · ${story.rating_avg.toFixed(1)}/5` : ""}
          </span>
        </div>
        <h1
          className="mt-3 se-cjk text-white"
          style={{
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.05,
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
              textWrap: "pretty",
              maxWidth: 540,
            }}
          >
            {story.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-7 flex-wrap">
          <Link
            href={`/library/${story.id}` as never}
            locale={locale}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md font-semibold"
            style={{ background: "#fff", color: "#0a0a0b" }}
          >
            {tLib("hero.playNow")}
          </Link>
          <Link
            href={`/library/${story.id}` as never}
            locale={locale}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md"
            style={{
              background: "rgba(20,18,14,0.32)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.32)",
            }}
          >
            {tLib("hero.details")}
          </Link>
          <div
            style={{
              width: 1,
              height: 28,
              background: "rgba(255,255,255,0.18)",
              margin: "0 6px",
            }}
          />
          <span
            className="flex items-center gap-2 text-xs"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            <Avatar name="·" size={20} hue={220} />
            <span style={{ color: "#fff" }}>{tLib("hero.community")}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
//  Genre Rail — sticky below hero · filter chips
// ─────────────────────────────────────────────────────────────
async function GenreRail({
  adultModeEnabled,
  locale,
}: {
  adultModeEnabled: boolean;
  locale: string;
}) {
  const tLib = await getTranslations("library");
  const tGenres = await getTranslations("genres");
  return (
    <div
      className="se-row-scroll sticky z-[5] flex items-center gap-2.5 overflow-x-auto"
      style={{
        top: 64,
        padding: "14px 56px",
        background: "rgba(251,250,246,0.92)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--se-border)",
      }}
    >
      <Link
        href={"/library" as never}
        locale={locale}
        className="flex-none h-8 px-3.5 rounded-full text-sm font-medium se-cjk"
        style={{
          background: "var(--se-fg)",
          color: "var(--se-bg)",
        }}
      >
        {tLib("rail.all")}
      </Link>
      {Object.entries(GENRE).map(([key]) => (
        <Link
          key={key}
          href={`/library?genre=${key}` as never}
          locale={locale}
          className="flex-none h-8 px-3.5 rounded-full text-sm se-cjk inline-flex items-center"
          style={{
            color: "var(--se-fg-muted)",
            border: "1px solid var(--se-border)",
            background: "transparent",
          }}
        >
          {tGenres(key as GenreKey)}
        </Link>
      ))}
      <div
        style={{
          width: 1,
          height: 18,
          background: "var(--se-border)",
          margin: "0 4px",
          flex: "none",
        }}
      />
      {!adultModeEnabled && (
        <Link
          href={"/settings" as never}
          locale={locale}
          className="flex-none h-8 px-3.5 rounded-full text-sm inline-flex items-center gap-1.5"
          style={{
            color: "var(--se-fg-dim)",
            border: "1px solid var(--se-border)",
            opacity: 0.6,
          }}
          title={tLib("rail.adultLockTooltip")}
        >
          <Lock size={10} />
          18+
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Search form
// ─────────────────────────────────────────────────────────────
async function SearchForm({
  q,
  language,
  rating,
  adultModeEnabled,
  searchMode,
  locale,
}: {
  q: string;
  language: string;
  rating: string;
  adultModeEnabled: boolean;
  searchMode: boolean;
  locale: string;
}) {
  const tLib = await getTranslations("library");
  const tRatings = await getTranslations("ratings");
  return (
    <form className="flex gap-2 flex-wrap items-center" method="get">
      <div className="flex-1 min-w-[220px] relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2"
          size={14}
          color="var(--se-fg-dim)"
        />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder={tLib("search.fullPlaceholder")}
          className="w-full rounded-md pl-10 pr-3 py-2 text-sm"
          style={{
            background: "var(--se-surface)",
            border: "1px solid var(--se-border)",
          }}
        />
      </div>
      <select
        name="language"
        defaultValue={language}
        className="rounded-md px-3 py-2 text-sm"
        style={{
          background: "var(--se-surface)",
          border: "1px solid var(--se-border)",
        }}
      >
        <option value="">{tLib("search.languageAll")}</option>
        <option value="zh-Hant">{tLib("search.languageZhHant")}</option>
        <option value="zh-Hans">{tLib("search.languageZhHans")}</option>
        <option value="en">{tLib("search.languageEn")}</option>
      </select>
      <select
        name="rating"
        defaultValue={rating}
        className="rounded-md px-3 py-2 text-sm"
        style={{
          background: "var(--se-surface)",
          border: "1px solid var(--se-border)",
        }}
      >
        <option value="">{tLib("search.ratingAll")}</option>
        <option value="general">{tRatings("general")}</option>
        <option value="pg13">{tRatings("pg13")}</option>
        <option value="mature">{tRatings("mature")}</option>
        {/* P6-HIGH-02: Adult option only when adult mode enabled */}
        {adultModeEnabled && <option value="adult">{tLib("search.ratingAdultOption")}</option>}
      </select>
      <button
        type="submit"
        className="rounded-md px-4 py-2 text-sm font-semibold"
        style={{ background: "var(--se-fg)", color: "var(--se-bg)" }}
      >
        {tLib("search.submit")}
      </button>
      {searchMode && (
        <Link
          href={"/library" as never}
          locale={locale}
          className="inline-flex items-center rounded-md px-3 py-2 text-sm"
          style={{ border: "1px solid var(--se-border)", color: "var(--se-fg-muted)" }}
        >
          {tLib("search.clear")}
        </Link>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
//  Search results
// ─────────────────────────────────────────────────────────────
async function SearchResults({
  q,
  results,
  locale,
}: {
  q: string;
  results: LibraryStory[];
  locale: string;
}) {
  const tLib = await getTranslations("library");
  return (
    <section className="px-6 sm:px-14">
      <h2 className="text-xl font-bold mb-4 se-cjk" style={{ color: "var(--se-fg)" }}>
        {tLib("search.resultsHeader", { query: q })}
        <span className="se-mono ml-2 text-xs" style={{ color: "var(--se-fg-dim)" }}>
          {tLib("search.resultsCount", { count: results.length })}
        </span>
      </h2>
      {results.length === 0 && q.trim().length === 1 ? (
        <div
          className="p-6 rounded-lg flex gap-4 items-start"
          style={{
            background: "var(--se-warn-bg)",
            border: "1px solid var(--se-warn)",
          }}
        >
          <Info size={16} color="var(--se-warn)" className="mt-0.5 flex-none" />
          <div>
            <h3 className="font-semibold text-sm mb-1.5 se-cjk" style={{ color: "var(--se-fg)" }}>
              {tLib("search.tooShortTitle")}
            </h3>
            <p className="text-xs se-cjk" style={{ color: "var(--se-fg-muted)" }}>
              {tLib("search.tooShortBody")}
            </p>
          </div>
        </div>
      ) : results.length === 0 ? (
        <div
          className="p-12 rounded-lg text-center"
          style={{
            background: "var(--se-surface)",
            border: "1px solid var(--se-border)",
          }}
        >
          <p className="text-sm se-cjk" style={{ color: "var(--se-fg-muted)" }}>
            {tLib("search.noResults")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {results.map((s) => (
            <StoryCard key={s.id} s={toCardData(s)} locale={locale} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────
/**
 * Localized relative-time formatter.
 * Wave 2 i18n migration (2026-05-27): was hardcoded 繁中 (剛剛 / 分鐘前 / 日前).
 * Accepts the `library` namespace translator so all 3 locales render correctly.
 */
function relativeTime(
  iso: string,
  tLib: (key: string, params?: Record<string, string | number>) => string,
): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - t) / 60_000);
  if (diffMin < 1) return tLib("relativeTime.justNow");
  if (diffMin < 60) return tLib("relativeTime.minutesAgo", { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return tLib("relativeTime.hoursAgo", { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return tLib("relativeTime.yesterday");
  if (diffDay < 7) return tLib("relativeTime.daysAgo", { count: diffDay });
  if (diffDay < 30) return tLib("relativeTime.weeksAgo", { count: Math.floor(diffDay / 7) });
  return new Date(iso).toLocaleDateString();
}
