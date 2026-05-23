import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
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
  PlayCircle,
  Star,
  Users,
  Plus,
  Search,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StoryCarousel } from "./story-carousel";

export const dynamic = "force-dynamic";

/**
 * Library page — Phase 5 Wave 2 (multi-board comic-app style).
 *
 * Layout:
 *   1. Header + search bar
 *   2. (logged-in) 繼續玩 — resume in-progress playthroughs
 *   3. (logged-in) 我嘅故事 — own stories of any visibility
 *   4. Search overlay (if ?q= query param)
 *      OR multi-board genre carousels (default browse view):
 *        🔥 熱門 (trending with cold-start boost)
 *        🆕 最新 (pure recency)
 *        💕 戀愛 · ⚔️ 冒險 · 🎓 校園 · 🔮 奇幻 · 🏀 運動 · 🕵️ 懸疑
 *        👑 編輯精選 (TODO: official picks tag — Phase 7 content tier)
 *      Empty boards auto-hide (smart-hide rule).
 *
 * Phase 5 Wave 2 audit fix folds: P5-LOGIC-H-02 trending cold-start (newcomer
 * boost in trending RPC) + P5-LOGIC-H-03 FTS CJK (bigram tokenizer in
 * Migration 0012).
 */

/**
 * Multi-board genre carousel definitions.
 *
 * Wave 2.5 W2-GENRE-C-01 fix: keys were originally English ("romance",
 * "adventure"), but schema-generator.ts:112 prompt teaches Claude to emit
 * CJK genre strings ("戀愛校園", "古惑仔", "玄幻冒險"). Keys never matched,
 * 6 boards permanently empty.
 *
 * New design: each board has a CJK display title PLUS an `aliases` array
 * of likely tag/genre values the schema-generator might emit. The
 * `stories_by_genre` RPC matches any of these aliases. This keeps the UI
 * taxonomy clean while accommodating the LLM's varied output.
 */
const GENRE_BOARDS: Array<{
  title: string;
  icon: string;
  aliases: string[];
}> = [
  {
    title: "戀愛",
    icon: "💕",
    aliases: ["戀愛", "戀愛校園", "愛情", "romance", "純愛", "言情"],
  },
  {
    title: "冒險",
    icon: "⚔️",
    aliases: ["冒險", "古惑仔", "黑道", "江湖", "adventure", "action", "武俠"],
  },
  {
    title: "校園",
    icon: "🎓",
    aliases: ["校園", "戀愛校園", "青春", "school", "学院", "學園"],
  },
  {
    title: "奇幻",
    icon: "🔮",
    aliases: ["奇幻", "玄幻", "玄幻冒險", "魔法", "fantasy", "魔幻", "仙俠"],
  },
  {
    title: "運動",
    icon: "🏀",
    aliases: ["運動", "體育", "sports", "競技"],
  },
  {
    title: "懸疑",
    icon: "🕵️",
    aliases: ["懸疑", "推理", "mystery", "thriller", "驚悚", "犯罪"],
  },
];

/**
 * Threshold for engaging multi-board layout vs falling back to single list.
 * W2-LAUNCH-H-05 fix: at launch (or any time content is sparse), multi-board
 * shows mostly empty boards which hurts first-impression. Below this
 * threshold we render a single «公開故事» list instead.
 */
const MULTI_BOARD_THRESHOLD = 8; // trending stories needed to engage multi-board

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const searchMode = !!sp.q?.trim();

  // W2-FILTER-H-02 fix: empty string from <select value=""> default option
  // must NOT be passed as a filter value. `??` only catches null/undefined;
  // here we explicitly coerce empty strings to undefined so the RPC
  // `(p_language is null or s.language = p_language)` correctly treats
  // "no filter".
  const language = sp.language?.trim() || undefined;
  const contentRating = sp.rating?.trim() || undefined;

  // W2-GENRE-C-01 fix: for each genre board, try each alias and keep the
  // first non-empty result. Falls back to empty array if nothing matches.
  // This makes the board match across CJK / English / variant tag spellings.
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

  // Search mode → single result list (one RPC).
  const searchResults = searchMode
    ? await searchStories(supabase, {
        query: sp.q ?? "",
        language,
        contentRating,
        limit: 24,
      })
    : null;

  // Browse mode: 2-stage fetch (Wave 2.6 W2.5-PERF-M-02 fix).
  //   Stage 1: trending + latest. Decide useLaunchFallback from result.
  //   Stage 2: genre boards ONLY if multi-board mode engages.
  //
  // At launch with sparse content, the launch fallback engages and we skip
  // up to 36 alias RPCs (6 boards × ~6 aliases each) that would have been
  // wasted (their results discarded by the fallback render path).
  let trending: LibraryStory[] = [];
  let latest: LibraryStory[] = [];
  let genreResults: LibraryStory[][] = [];

  // W2-LAUNCH-H-05 + W2.5-UX-L-07: also fallback when trendingCount === 0
  // (zero trending + zero genre = render single «公開故事» list, not 1 empty
  // 熱門 card + 6 hidden boards).
  let useLaunchFallback = false;

  if (!searchMode) {
    const [t, l] = await Promise.all([
      getTrendingStories(supabase, { language, contentRating, limit: 8 }),
      getLatestStories(supabase, { language, contentRating, limit: 8 }),
    ]);
    trending = t;
    latest = l;

    // Decide layout BEFORE fetching genre boards
    useLaunchFallback = trending.length < MULTI_BOARD_THRESHOLD;

    if (!useLaunchFallback) {
      // Multi-board mode: fetch genre carousels in parallel.
      // Empty-genre smart-hide is handled by StoryCarousel render layer —
      // no need for a stage-2 downgrade check (Wave 2.7 W2.6-CODE-M-01 fix:
      // the previous downgrade check was logically unreachable since the
      // outer condition guarantees trending.length >= MULTI_BOARD_THRESHOLD).
      genreResults = await Promise.all(
        GENRE_BOARDS.map((g) => fetchBoard(g.aliases)),
      );
    }
  }

  // User-specific sections (parallel with browse fetch)
  const [myPlaythroughs, myStories] = user
    ? await Promise.all([
        getMyPlaythroughs(supabase, { userId: user.id, limit: 6 }),
        getMyStories(supabase, { userId: user.id, limit: 6 }),
      ])
    : [[], []];

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              故事圖書館
            </h1>
            <p className="text-muted-foreground text-sm">
              繼續舊故事 · 探索社群分享 · 創作新故事
            </p>
          </div>
          <Link
            href={"/stories/new" as never}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            創作新故事
          </Link>
        </div>

        {/* Search bar */}
        <form className="mb-8" method="get">
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="搵故事（標題 / 描述 / 標籤 / 中文都得）..."
                className="w-full rounded-md border pl-10 pr-3 py-2 text-sm bg-background"
              />
            </div>
            <select
              name="language"
              defaultValue={sp.language ?? ""}
              className="rounded-md border px-3 py-2 text-sm bg-background"
            >
              <option value="">所有語言</option>
              <option value="zh-Hant">繁中</option>
              <option value="zh-Hans">簡中</option>
              <option value="en">English</option>
            </select>
            <select
              name="rating"
              defaultValue={sp.rating ?? ""}
              className="rounded-md border px-3 py-2 text-sm bg-background"
            >
              <option value="">所有 rating</option>
              <option value="sfw">SFW</option>
              <option value="soft">Soft</option>
              <option value="adult">Adult 18+</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              搜尋
            </button>
            {searchMode && (
              <Link
                href={"/library" as never}
                className="inline-flex items-center rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
              >
                清除
              </Link>
            )}
          </div>
        </form>

        {/* My playthroughs (always above the fold for returning users) */}
        {user && myPlaythroughs.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              繼續玩
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPlaythroughs.map((pt) => (
                <Link
                  key={pt.id}
                  href={`/play/${pt.id}` as never}
                  className="block"
                >
                  <Card className="hover:border-primary transition-colors h-full">
                    <CardHeader>
                      <CardTitle className="text-base">{pt.story_title}</CardTitle>
                      <CardDescription className="text-xs">
                        {pt.character_name ?? "主角"} · {pt.turn_count} turns ·{" "}
                        {pt.status === "active" ? "進行中" : pt.status}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground">
                        最近：{new Date(pt.last_played_at).toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* My stories */}
        {user && myStories.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              我嘅故事
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myStories.map((s) => (
                <Link
                  key={s.id}
                  href={`/library/${s.id}` as never}
                  className="block"
                >
                  <Card className="hover:border-primary transition-colors h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          {s.visibility === "public"
                            ? "公開"
                            : s.visibility === "unlisted"
                            ? "Link 分享"
                            : "私人"}
                        </Badge>
                      </div>
                      {s.description && (
                        <CardDescription className="text-xs line-clamp-2">
                          {s.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {s.play_count} plays
                        </span>
                        {s.rating_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            {s.rating_avg?.toFixed(1)} ({s.rating_count})
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Search mode: single result list */}
        {searchMode && searchResults !== null && (
          <section>
            <h2 className="text-xl font-bold mb-4">
              搜尋結果：「{sp.q}」 ({searchResults.length})
            </h2>
            {/* W2.5-DOC-M-01 fix (Wave 2.6): 1-char CJK query hint. Bigram-only
                tokenizer (Migration 0013) drops single CJK chars — searching
                「愛」 or 「校」 returns empty. Without this card the user thinks
                the platform is broken. */}
            {searchResults.length === 0 && (sp.q?.trim().length ?? 0) === 1 ? (
              <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
                <CardContent className="py-8 text-center">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                    請輸入至少 2 個字
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    中文搜索要 2 字以上嘅 bigram 組合至 work — 試下「校園」「戀愛」「古惑仔」呢類有 phrase 嘅 keyword。
                  </p>
                </CardContent>
              </Card>
            ) : searchResults.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    搵唔到符合嘅故事 — 試下其他關鍵字。提示：搜尋會 match 標題 + 描述 + 標籤，支援中文片段搜索。
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.map((s) => (
                  <Link
                    key={s.id}
                    href={`/library/${s.id}` as never}
                    className="block"
                  >
                    <Card className="hover:border-primary transition-colors h-full">
                      <CardHeader>
                        <CardTitle className="text-base">{s.title}</CardTitle>
                        {s.description && (
                          <CardDescription className="text-xs line-clamp-2">
                            {s.description}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                          {s.genre && (
                            <Badge variant="outline" className="text-[10px]">
                              {s.genre}
                            </Badge>
                          )}
                          {s.content_rating !== "sfw" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-rose-300 text-rose-600 dark:text-rose-300"
                            >
                              {s.content_rating}
                            </Badge>
                          )}
                          <span className="ml-auto flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {s.play_count}
                          </span>
                          {s.rating_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {s.rating_avg?.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {s.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {s.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Browse mode: launch-fallback single list OR multi-board carousels.
            W2-LAUNCH-H-05: sparse-content phase shows a unified list so
            visitors don't see "wow this place is empty" with 6 hidden boards. */}
        {!searchMode && useLaunchFallback && (
          <StoryCarousel
            title="公開故事"
            icon="📚"
            stories={trending ?? []}
            emptyMessage={"仲冇公開故事 — 創作一個成為先驅。"}
          />
        )}

        {!searchMode && !useLaunchFallback && (
          <>
            <StoryCarousel
              title="熱門"
              icon="🔥"
              stories={trending ?? []}
              emptyMessage={
                "仲冇 trending 故事 — 平台 launching!  創作一個成為先驅。"
              }
            />
            <StoryCarousel
              title="最新"
              icon="🆕"
              stories={latest ?? []}
            />
            {GENRE_BOARDS.map((g, i) => (
              <StoryCarousel
                key={g.title}
                title={g.title}
                icon={g.icon}
                stories={genreResults[i] ?? []}
                /* Smart-hide: don't show empty genre carousels until there's content */
                emptyMessage={undefined}
              />
            ))}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
