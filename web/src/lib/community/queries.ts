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
  /** Joined from profiles. Null when profile row missing or display_name unset. */
  display_name: string | null;
  avatar_url: string | null;
};

export type StoryRating = {
  user_id: string;
  score: number;
  review_text: string | null;
  created_at: string;
  /** Joined from profiles. */
  display_name: string | null;
  avatar_url: string | null;
};

export type MyPlaythroughRow = {
  id: string;
  story_id: string;
  story_title: string;
  story_genre: string | null;
  story_cover_image_url: string | null;
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
 * Get latest public stories (pure recency, no scoring). Used by the 🆕 最新
 * carousel — gives new stories a "always visible" surface that bypasses
 * trending cold-start.
 */
export async function getLatestStories(
  supabase: SupabaseClient,
  params: { limit?: number; language?: string; contentRating?: string } = {},
): Promise<LibraryStory[]> {
  const { data, error } = await supabase.rpc("latest_stories", {
    p_limit: params.limit ?? 12,
    p_language: params.language ?? null,
    p_content_rating: params.contentRating ?? null,
  });
  if (error) {
    console.warn("[community] latest_stories failed:", error.message);
    return [];
  }
  return (data ?? []) as LibraryStory[];
}

/**
 * Get public stories matching a genre (matches stories.genre column OR
 * any tag equal to the genre string, case-insensitive). Used by genre
 * carousels — 💕 戀愛 / ⚔️ 冒險 / 🎓 校園 / 🔮 奇幻 / 🏀 運動 / 🕵️ 懸疑.
 *
 * The genre value should be either an English code ("romance") or the
 * CJK term ("戀愛") — the RPC matches both. This lets the official
 * taxonomy use English codes while user-uploaded stories tag in 中文.
 */
export async function getStoriesByGenre(
  supabase: SupabaseClient,
  params: {
    genre: string;
    limit?: number;
    offset?: number;
    language?: string;
    contentRating?: string;
  },
): Promise<LibraryStory[]> {
  const { data, error } = await supabase.rpc("stories_by_genre", {
    p_genre: params.genre,
    p_limit: params.limit ?? 12,
    p_offset: params.offset ?? 0,
    p_language: params.language ?? null,
    p_content_rating: params.contentRating ?? null,
  });
  if (error) {
    console.warn(
      `[community] stories_by_genre(${params.genre}) failed:`,
      error.message,
    );
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
    .select(
      "user_id, score, review_text, created_at, profile:profiles!story_ratings_user_id_fkey(display_name, avatar_url)",
    )
    .eq("story_id", params.storyId);
  if (params.onlyWithReview ?? true) {
    q = q.not("review_text", "is", null);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 10);
  if (error || !data) return [];
  return data.map((r) => {
    const profile = (r as { profile?: { display_name?: string | null; avatar_url?: string | null } | null }).profile;
    return {
      user_id: r.user_id as string,
      score: r.score as number,
      review_text: r.review_text as string | null,
      created_at: r.created_at as string,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
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
    .select(
      "id, user_id, body, parent_id, deleted, created_at, updated_at, profile:profiles!story_comments_user_id_fkey(display_name, avatar_url)",
    )
    .eq("story_id", params.storyId)
    .is("parent_id", null)
    .eq("deleted", false)
    .order("created_at", { ascending: false })
    .range(
      params.offset ?? 0,
      (params.offset ?? 0) + (params.limit ?? 20) - 1,
    );
  if (error || !data) return [];
  return data.map((c) => {
    const profile = (c as { profile?: { display_name?: string | null; avatar_url?: string | null } | null }).profile;
    return {
      id: c.id as string,
      user_id: c.user_id as string,
      body: c.body as string,
      parent_id: c.parent_id as string | null,
      deleted: c.deleted as boolean,
      created_at: c.created_at as string,
      updated_at: c.updated_at as string,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
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
    .select(
      "id, user_id, body, parent_id, deleted, created_at, updated_at, profile:profiles!story_comments_user_id_fkey(display_name, avatar_url)",
    )
    .eq("parent_id", params.parentId)
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(params.limit ?? 50);
  if (error || !data) return [];
  return data.map((c) => {
    const profile = (c as { profile?: { display_name?: string | null; avatar_url?: string | null } | null }).profile;
    return {
      id: c.id as string,
      user_id: c.user_id as string,
      body: c.body as string,
      parent_id: c.parent_id as string | null,
      deleted: c.deleted as boolean,
      created_at: c.created_at as string,
      updated_at: c.updated_at as string,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
    };
  });
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
    .select(
      "user_id, score, review_text, created_at, profile:profiles!story_ratings_user_id_fkey(display_name, avatar_url)",
    )
    .eq("story_id", params.storyId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error || !data) return null;
  const profile = (data as { profile?: { display_name?: string | null; avatar_url?: string | null } | null }).profile;
  return {
    user_id: data.user_id as string,
    score: data.score as number,
    review_text: data.review_text as string | null,
    created_at: data.created_at as string,
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
  };
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
      "id, story_id, character_name, turn_count, status, last_played_at, story:stories!playthroughs_story_id_fkey(title, genre, cover_image_url)",
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
    type StoryJoinShape = {
      title?: string;
      genre?: string | null;
      cover_image_url?: string | null;
    };
    const storyJoin = (r as { story?: StoryJoinShape | StoryJoinShape[] | null }).story;
    const storyRow: StoryJoinShape | null = Array.isArray(storyJoin)
      ? (storyJoin[0] ?? null)
      : (storyJoin ?? null);
    return {
      id: r.id as string,
      story_id: r.story_id as string,
      story_title: storyRow?.title ?? "(無標題)",
      story_genre: storyRow?.genre ?? null,
      story_cover_image_url: storyRow?.cover_image_url ?? null,
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
