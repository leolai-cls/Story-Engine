import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 5 Community — read-only query helpers (server-side).
 *
 * Used by library page + story detail page. All queries respect RLS so
 * non-public stories aren't accidentally exposed; private playthroughs
 * stay user-scoped.
 *
 * Functions are pure server-side (callers create supabase client and pass
 * it in). NO "use server" — these aren't Server Actions, just helpers.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type LibraryStory = {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  genre: string | null;
  tags: string[];
  language: string;
  content_rating: string;
  rating_avg: number | null;
  rating_count: number;
  play_count: number;
  created_at: string;
};

export type StoryComment = {
  id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  deleted: boolean;
  created_at: string;
  updated_at: string;
  // display_name + avatar fetched via separate join in serializer
};

export type StoryRating = {
  user_id: string;
  score: number;
  review_text: string | null;
  created_at: string;
};

export type MyPlaythroughRow = {
  id: string;
  story_id: string;
  story_title: string;
  character_name: string | null;
  turn_count: number;
  status: string;
  last_played_at: string;
};

// ─── Trending + Search ───────────────────────────────────────────────────

/**
 * Get trending public stories ranked by hybrid score
 * (popularity × recency × quality boost). Uses trending_stories RPC.
 */
export async function getTrendingStories(
  supabase: SupabaseClient,
  params: {
    limit?: number;
    offset?: number;
    language?: string;
    minRating?: number;
    contentRating?: string;
  } = {},
): Promise<LibraryStory[]> {
  const { data, error } = await supabase.rpc("trending_stories", {
    p_limit: params.limit ?? 12,
    p_offset: params.offset ?? 0,
    p_language: params.language ?? null,
    p_min_rating: params.minRating ?? null,
    p_content_rating: params.contentRating ?? null,
  });
  if (error) {
    console.warn("[community] trending_stories failed:", error.message);
    return [];
  }
  return (data ?? []) as LibraryStory[];
}

/**
 * Full-text search public stories with optional filters.
 * Empty query returns trending (fallback path).
 */
export async function searchStories(
  supabase: SupabaseClient,
  params: {
    query: string;
    limit?: number;
    offset?: number;
    language?: string;
    contentRating?: string;
  },
): Promise<LibraryStory[]> {
  const trimmed = params.query.trim();
  if (!trimmed) {
    return getTrendingStories(supabase, {
      limit: params.limit,
      offset: params.offset,
      language: params.language,
      contentRating: params.contentRating,
    });
  }

  const { data, error } = await supabase.rpc("search_stories", {
    p_query: trimmed,
    p_limit: params.limit ?? 24,
    p_offset: params.offset ?? 0,
    p_language: params.language ?? null,
    p_content_rating: params.contentRating ?? null,
  });
  if (error) {
    console.warn("[community] search_stories failed:", error.message);
    return [];
  }
  return (data ?? []) as LibraryStory[];
}

// ─── Story detail ───────────────────────────────────────────────────────

/**
 * Get a single story by id. Returns null if not accessible
 * (RLS: must be public OR owned by caller).
 */
export async function getStoryById(
  supabase: SupabaseClient,
  storyId: string,
): Promise<LibraryStory | null> {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id, title, description, cover_image_url, genre, tags, language, content_rating, rating_avg, rating_count, play_count, created_at",
    )
    .eq("id", storyId)
    .single();
  if (error || !data) return null;
  return data as LibraryStory;
}

/**
 * Get top N ratings (with review text) for a story. Sorted by recency.
 * Skips ratings without review_text by default (only "rated + reviewed").
 */
export async function getStoryRatings(
  supabase: SupabaseClient,
  params: { storyId: string; limit?: number; onlyWithReview?: boolean },
): Promise<StoryRating[]> {
  let q = supabase
    .from("story_ratings")
    .select("user_id, score, review_text, created_at")
    .eq("story_id", params.storyId);
  if (params.onlyWithReview ?? true) {
    q = q.not("review_text", "is", null);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 10);
  if (error || !data) return [];
  return data as StoryRating[];
}

/**
 * Get top-level comments (parent_id IS NULL) for a story, sorted recent first.
 * UI fetches replies on demand via getCommentReplies.
 */
export async function getTopLevelComments(
  supabase: SupabaseClient,
  params: { storyId: string; limit?: number; offset?: number },
): Promise<StoryComment[]> {
  const { data, error } = await supabase
    .from("story_comments")
    .select("id, user_id, body, parent_id, deleted, created_at, updated_at")
    .eq("story_id", params.storyId)
    .is("parent_id", null)
    .eq("deleted", false)
    .order("created_at", { ascending: false })
    .range(
      params.offset ?? 0,
      (params.offset ?? 0) + (params.limit ?? 20) - 1,
    );
  if (error || !data) return [];
  return data as StoryComment[];
}

/**
 * Get replies for a specific top-level comment, sorted oldest first
 * (replies read like a conversation).
 */
export async function getCommentReplies(
  supabase: SupabaseClient,
  params: { parentId: string; limit?: number },
): Promise<StoryComment[]> {
  const { data, error } = await supabase
    .from("story_comments")
    .select("id, user_id, body, parent_id, deleted, created_at, updated_at")
    .eq("parent_id", params.parentId)
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(params.limit ?? 50);
  if (error || !data) return [];
  return data as StoryComment[];
}

/**
 * Get caller's own rating on a story (returns null if not rated yet).
 * Used by the "your rating" UI before showing the rate-this-story form.
 */
export async function getMyRating(
  supabase: SupabaseClient,
  params: { storyId: string; userId: string },
): Promise<StoryRating | null> {
  const { data, error } = await supabase
    .from("story_ratings")
    .select("user_id, score, review_text, created_at")
    .eq("story_id", params.storyId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as StoryRating;
}

// ─── My library (caller's own playthroughs) ────────────────────────────

/**
 * Get caller's recent playthroughs with story title joined.
 * For the "continue playing" section on /library.
 */
export async function getMyPlaythroughs(
  supabase: SupabaseClient,
  params: { userId: string; limit?: number; status?: string },
): Promise<MyPlaythroughRow[]> {
  let q = supabase
    .from("playthroughs")
    .select(
      "id, story_id, character_name, turn_count, status, last_played_at, story:stories!playthroughs_story_id_fkey(title)",
    )
    .eq("user_id", params.userId);
  if (params.status) {
    q = q.eq("status", params.status);
  }
  const { data, error } = await q
    .order("last_played_at", { ascending: false })
    .limit(params.limit ?? 12);
  if (error || !data) return [];
  return data.map((r) => {
    const storyJoin = (r as { story?: { title?: string } | { title?: string }[] | null }).story;
    const storyTitle = Array.isArray(storyJoin)
      ? (storyJoin[0]?.title ?? "(無標題)")
      : (storyJoin?.title ?? "(無標題)");
    return {
      id: r.id as string,
      story_id: r.story_id as string,
      story_title: storyTitle,
      character_name: r.character_name as string | null,
      turn_count: r.turn_count as number,
      status: r.status as string,
      last_played_at: r.last_played_at as string,
    };
  });
}

/**
 * Get caller's own stories (created by them, any visibility).
 * For the "my stories" section / management dashboard.
 */
export async function getMyStories(
  supabase: SupabaseClient,
  params: { userId: string; limit?: number },
): Promise<
  Array<LibraryStory & { visibility: string; owner_id: string | null }>
> {
  const { data, error } = await supabase
    .from("stories")
    .select(
      "id, title, description, cover_image_url, genre, tags, language, content_rating, rating_avg, rating_count, play_count, created_at, visibility, owner_id",
    )
    .eq("owner_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 24);
  if (error || !data) return [];
  return data as Array<LibraryStory & { visibility: string; owner_id: string | null }>;
}
