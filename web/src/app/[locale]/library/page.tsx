import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import {
  getTrendingStories,
  searchStories,
  getMyPlaythroughs,
  getMyStories,
} from "@/lib/community/queries";
import { Sparkles, Globe, BookOpen, PlayCircle, Star, Users, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Library page — Phase 5 function tier.
 *
 * Functional minimal UI (not polished — UI tier work later). Sections:
 *   1. My playthroughs (resume in-progress stories)
 *   2. My stories (created by me, any visibility)
 *   3. Trending public stories (FTS search if ?q= query param)
 *
 * Search is server-rendered via ?q= URL param so SSR + bookmarkable.
 */
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

  // Always render trending (for anon visitors too)
  const stories = sp.q
    ? await searchStories(supabase, {
        query: sp.q,
        language: sp.language,
        contentRating: sp.rating,
        limit: 24,
      })
    : await getTrendingStories(supabase, {
        language: sp.language,
        contentRating: sp.rating,
        limit: 12,
      });

  // User-specific sections
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
              <BookOpen className="h-7 w-7" />
              Library
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

        {/* Search */}
        <form className="mb-8" method="get">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="搵故事（標題 / 描述 / 標籤）..."
              className="flex-1 min-w-[200px] rounded-md border px-3 py-2 text-sm bg-background"
            />
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
          </div>
        </form>

        {/* My playthroughs */}
        {user && myPlaythroughs.length > 0 && (
          <section className="mb-12">
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
          <section className="mb-12">
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

        {/* Trending / search results */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            {sp.q ? `搜尋結果：${sp.q}` : "Trending 公開故事"}
          </h2>
          {stories.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {sp.q
                    ? "搵唔到符合嘅故事 — 試下其他關鍵字"
                    : "仲冇公開故事 — 你嘅故事可以做第一個 publish 嘅嘢"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stories.map((s) => (
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
                        {s.genre && <Badge variant="outline" className="text-[10px]">{s.genre}</Badge>}
                        {s.content_rating !== "sfw" && (
                          <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-600 dark:text-rose-300">
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
      </main>
      <SiteFooter />
    </>
  );
}
