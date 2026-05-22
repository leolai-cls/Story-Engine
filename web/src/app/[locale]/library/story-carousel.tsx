import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Users } from "lucide-react";
import type { LibraryStory } from "@/lib/community/queries";

/**
 * Genre carousel — one horizontal row of story cards.
 *
 * Phase 5 Wave 2: multi-board library layout. Each carousel shows ≤ 8
 * stories for a given genre/filter. Caller is responsible for fetching
 * the stories (so multiple carousels can fetch in parallel).
 *
 * Smart-hide rule applied at parent: if stories.length === 0, parent
 * should skip rendering the carousel (or show a "fresh content soon"
 * placeholder).
 */
export function StoryCarousel({
  title,
  icon,
  stories,
  emptyMessage,
}: {
  title: string;
  icon: string;
  stories: LibraryStory[];
  /** Shown when stories.length === 0. If undefined, carousel is hidden. */
  emptyMessage?: string;
}) {
  if (stories.length === 0 && !emptyMessage) return null;

  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      {stories.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {stories.map((s) => (
            <Link
              key={s.id}
              href={`/library/${s.id}` as never}
              className="block"
            >
              <Card className="hover:border-primary transition-colors h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm leading-snug">{s.title}</CardTitle>
                  {s.description && (
                    <CardDescription className="text-xs line-clamp-2">
                      {s.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5 flex-wrap">
                    {s.genre && (
                      <Badge variant="outline" className="text-[10px] py-0">
                        {s.genre}
                      </Badge>
                    )}
                    {s.content_rating !== "sfw" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 border-rose-300 text-rose-600 dark:text-rose-300"
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
                      {s.tags.slice(0, 3).map((tag) => (
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
  );
}
