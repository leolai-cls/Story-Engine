import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, Star, Users, MessageSquare, Flag, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getStoryById,
  getStoryRatings,
  getTopLevelComments,
  getMyRating,
} from "@/lib/community/queries";
import { StoryDetailActions } from "./story-detail-actions";

export const dynamic = "force-dynamic";

/**
 * Story detail page — Phase 5 function tier minimal UI.
 *
 * Shows: title + description + stats + top reviews + comments thread.
 * Owner sees publish/unpublish; others see "Play this story" (fork) + Report.
 *
 * Server-rendered for SEO friendliness on public stories.
 */
export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; storyId: string }>;
}) {
  const { locale, storyId } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const story = await getStoryById(supabase, storyId);
  if (!story) notFound();

  // Owner check via separate query (getStoryById strips owner_id)
  const { data: ownerCheck } = await supabase
    .from("stories")
    .select("owner_id, visibility")
    .eq("id", storyId)
    .single();
  const isOwner = !!user && ownerCheck?.owner_id === user.id;
  const visibility = ownerCheck?.visibility ?? "private";

  const [ratings, comments, myRating] = await Promise.all([
    getStoryRatings(supabase, { storyId, limit: 5 }),
    getTopLevelComments(supabase, { storyId, limit: 20 }),
    user ? getMyRating(supabase, { storyId, userId: user.id }) : Promise.resolve(null),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <Link
          href={"/library" as never}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          返回 Library
        </Link>

        {/* Header card */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl">{story.title}</CardTitle>
                  {story.description && (
                    <CardDescription className="mt-1">
                      {story.description}
                    </CardDescription>
                  )}
                </div>
              </div>
              <Badge
                variant={visibility === "public" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {visibility === "public" ? "公開" : visibility === "unlisted" ? "Link 分享" : "私人"}
              </Badge>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {story.play_count} 次玩過
              </span>
              {story.rating_count > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-amber-500" />
                  {story.rating_avg?.toFixed(1)} ({story.rating_count} 個評分)
                </span>
              )}
              {story.genre && <Badge variant="outline" className="text-[10px]">{story.genre}</Badge>}
              {story.content_rating !== "sfw" && (
                <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-600 dark:text-rose-300">
                  {story.content_rating}
                </Badge>
              )}
            </div>
            {story.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {story.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {/* Actions */}
            <StoryDetailActions
              storyId={storyId}
              isOwner={isOwner}
              isAuthenticated={!!user}
              currentVisibility={visibility}
              myRating={myRating ?? null}
            />
          </CardContent>
        </Card>

        {/* Reviews */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            玩家評論 ({story.rating_count})
          </h2>
          {ratings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                未有評論。{user ? "玩完之後留低你嘅評論。" : "登入之後可以評論。"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {ratings.map((r) => (
                <Card key={r.user_id + r.created_at}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">
                        {r.display_name || `${r.user_id.slice(0, 8)}…`}
                      </span>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-4 w-4 ${
                              n <= r.score
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.review_text && (
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {r.review_text}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Comments */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            留言 ({comments.length})
          </h2>
          {comments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                仲冇留言。{user ? "做第一個留言。" : "登入之後可以留言。"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <Card key={c.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-foreground">
                        {c.display_name || (
                          <span className="font-mono text-muted-foreground">
                            {c.user_id.slice(0, 8)}…
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
