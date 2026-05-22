"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { moderateText } from "@/lib/moderation/openai-moderation";

/**
 * Phase 5 Community — server actions.
 *
 * Every exported function = public Server Action endpoint. Each MUST do its
 * own auth check (we learned this the hard way in P3-SEC-C-01). RLS provides
 * a second defense layer, but auth in the action prevents pointless DB
 * round-trips and gives friendly error UX.
 *
 * Categories:
 *   - Story owner: publishStory / unpublishStory
 *   - Authenticated public: rateStory / upsertComment / softDeleteComment /
 *     reportContent / forkStoryToPlaythrough
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Story owner actions ────────────────────────────────────────────────

/**
 * Flip story visibility to 'public' — anyone can discover via library.
 * Owner-only via RLS (and explicit auth check here for friendly UX).
 */
export async function publishStory(
  storyId: string,
): Promise<ActionResult<{ visibility: "public" }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // Verify ownership before flipping
  const { data: story } = await supabase
    .from("stories")
    .select("owner_id, visibility")
    .eq("id", storyId)
    .single();
  if (!story) return { ok: false, error: "story_not_found" };
  if (story.owner_id !== user.id) {
    return { ok: false, error: "not_story_owner" };
  }

  const { error } = await supabase
    .from("stories")
    .update({ visibility: "public" })
    .eq("id", storyId);
  if (error) {
    console.error("[publishStory] update failed:", error.message);
    return { ok: false, error: "publish_failed" };
  }

  revalidatePath("/library");
  return { ok: true, data: { visibility: "public" } };
}

/**
 * Revert visibility to 'private' — story disappears from library + search.
 * Existing playthroughs by other users are NOT deleted (their data is
 * theirs); they just can't fork it again.
 */
export async function unpublishStory(
  storyId: string,
): Promise<ActionResult<{ visibility: "private" }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: story } = await supabase
    .from("stories")
    .select("owner_id")
    .eq("id", storyId)
    .single();
  if (!story) return { ok: false, error: "story_not_found" };
  if (story.owner_id !== user.id) {
    return { ok: false, error: "not_story_owner" };
  }

  const { error } = await supabase
    .from("stories")
    .update({ visibility: "private" })
    .eq("id", storyId);
  if (error) {
    console.error("[unpublishStory] update failed:", error.message);
    return { ok: false, error: "unpublish_failed" };
  }
  revalidatePath("/library");
  return { ok: true, data: { visibility: "private" } };
}

// ─── Public authenticated actions ───────────────────────────────────────

/**
 * Rate a public story 1-5 with optional review. UPSERT semantics —
 * re-rating updates the existing row (PK on story_id + user_id).
 *
 * Trigger `story_ratings_aggregate` automatically recomputes
 * stories.rating_avg + rating_count after this row changes.
 */
export async function rateStory(params: {
  storyId: string;
  score: number;
  reviewText?: string;
}): Promise<ActionResult<{ score: number }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  if (
    !Number.isInteger(params.score) ||
    params.score < 1 ||
    params.score > 5
  ) {
    return { ok: false, error: "invalid_score" };
  }
  if (
    params.reviewText !== undefined &&
    params.reviewText !== null &&
    params.reviewText.length > 2000
  ) {
    return { ok: false, error: "review_too_long" };
  }

  // P5-SEC-C-02 defense-in-depth — RLS in Migration 0010 also blocks owner
  // self-rating, but checking here gives a clear 繁中 error instead of the
  // generic "violates row-level security" mapping below.
  const { data: storyOwner } = await supabase
    .from("stories")
    .select("owner_id, content_rating")
    .eq("id", params.storyId)
    .single();
  if (!storyOwner) {
    return { ok: false, error: "story_not_found" };
  }
  if (storyOwner.owner_id === user.id) {
    return { ok: false, error: "唔可以俾自己嘅故事評分。" };
  }

  // P5-SEC-C-01 — moderate review text before persist (CSAM / illegal pre-filter).
  if (params.reviewText && params.reviewText.trim().length > 0) {
    const verdict = await moderateText(
      params.reviewText,
      (storyOwner.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
    );
    if (!verdict.allowed) {
      console.warn(
        `[rateStory] moderation blocked review on story ${params.storyId} for user ${user.id}: ${verdict.categories.join(", ")}`,
      );
      return { ok: false, error: verdict.reason };
    }
  }

  const { error } = await supabase
    .from("story_ratings")
    .upsert(
      {
        story_id: params.storyId,
        user_id: user.id,
        score: params.score,
        review_text: params.reviewText ?? null,
      },
      { onConflict: "story_id,user_id" },
    );

  if (error) {
    console.error("[rateStory] upsert failed:", error.message);
    // Most likely RLS reject (story not public + not owner)
    if (/violates row-level security/i.test(error.message)) {
      return { ok: false, error: "story_not_public" };
    }
    return { ok: false, error: "rate_failed" };
  }

  revalidatePath(`/library/${params.storyId}` as never);
  return { ok: true, data: { score: params.score } };
}

/**
 * Add a comment on a public story. Optional parent_id for replies.
 * Body 1-2000 chars. Auth + RLS enforce ownership and visibility.
 */
export async function upsertComment(params: {
  storyId: string;
  body: string;
  parentId?: string;
}): Promise<ActionResult<{ commentId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const trimmed = params.body.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    return { ok: false, error: "body_invalid_length" };
  }

  // Load story for content_rating context (moderation block thresholds vary
  // by tier) + parent verification.
  const { data: story } = await supabase
    .from("stories")
    .select("content_rating")
    .eq("id", params.storyId)
    .single();
  if (!story) {
    return { ok: false, error: "story_not_found" };
  }

  // If reply: verify parent belongs to same story (defense in depth — RLS
  // would catch but app-level error message is clearer)
  if (params.parentId) {
    const { data: parent } = await supabase
      .from("story_comments")
      .select("story_id")
      .eq("id", params.parentId)
      .single();
    if (!parent || parent.story_id !== params.storyId) {
      return { ok: false, error: "parent_mismatch" };
    }
  }

  // P5-SEC-C-01 — moderate comment body before persist (CSAM / illegal pre-filter).
  const verdict = await moderateText(
    trimmed,
    (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
  );
  if (!verdict.allowed) {
    console.warn(
      `[upsertComment] moderation blocked comment on story ${params.storyId} for user ${user.id}: ${verdict.categories.join(", ")}`,
    );
    return { ok: false, error: verdict.reason };
  }

  const { data, error } = await supabase
    .from("story_comments")
    .insert({
      story_id: params.storyId,
      user_id: user.id,
      body: trimmed,
      parent_id: params.parentId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[upsertComment] insert failed:", error?.message);
    return { ok: false, error: "comment_failed" };
  }

  revalidatePath(`/library/${params.storyId}` as never);
  return { ok: true, data: { commentId: data.id } };
}

/**
 * Soft-delete own comment. Body is preserved as "[deleted]" placeholder
 * implicitly via the deleted=true flag — UI shouldn't render the body.
 */
export async function softDeleteComment(
  commentId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("story_comments")
    .update({ deleted: true })
    .eq("id", commentId)
    .eq("user_id", user.id); // RLS double-checks; extra app filter for safety

  if (error) {
    console.error("[softDeleteComment] update failed:", error.message);
    return { ok: false, error: "delete_failed" };
  }
  return { ok: true, data: undefined };
}

/**
 * Report a story / comment / playthrough for moderation review.
 * Anonymous can't report (RLS requires reporter_id = auth.uid()).
 *
 * `reason` is an enum: spam / hate / csam / illegal / harassment /
 * sexual_minor / other. CSAM and sexual_minor reports get fast-tracked
 * in the admin queue (Phase 5+ admin work).
 */
export type ReportReason =
  | "spam"
  | "hate"
  | "csam"
  | "illegal"
  | "harassment"
  | "sexual_minor"
  | "other";

export async function reportContent(params: {
  contentType: "story" | "comment" | "playthrough";
  contentId: string;
  reason: ReportReason;
  details?: string;
}): Promise<ActionResult<{ flagId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  if (params.details && params.details.length > 1000) {
    return { ok: false, error: "details_too_long" };
  }

  const { data, error } = await supabase
    .from("moderation_flags")
    .insert({
      content_type: params.contentType,
      content_id: params.contentId,
      reporter_id: user.id,
      reason: params.reason,
      details: params.details ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    const msg = error?.message ?? "";
    // P5-LOGIC-H-04 — Migration 0010 adds UNIQUE(reporter, content_type, content_id).
    // Duplicate report = friendly "already reported" message instead of generic fail.
    if (error?.code === "23505" || /duplicate key|unique/i.test(msg)) {
      return { ok: false, error: "你之前已經 report 過呢個內容了。Moderation team 會 review。" };
    }
    console.error("[reportContent] insert failed:", msg);
    return { ok: false, error: "report_failed" };
  }
  return { ok: true, data: { flagId: data.id } };
}

/**
 * Fork a public story into a new playthrough for the caller.
 * Wraps the SECURITY INVOKER RPC fork_story_to_playthrough — RPC handles
 * the atomic playthrough creation + character state initialization +
 * opening narrative turn insert.
 *
 * Returns the new playthrough id so caller can redirect to /play/[id].
 */
export async function forkStoryToPlaythrough(params: {
  storyId: string;
  characterName?: string;
  llmModel?: string;
}): Promise<ActionResult<{ playthroughId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data, error } = await supabase.rpc("fork_story_to_playthrough", {
    p_story_id: params.storyId,
    p_character_name: params.characterName ?? null,
    p_llm_model: params.llmModel ?? null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/story_not_found/i.test(msg)) {
      return { ok: false, error: "story_not_found" };
    }
    if (/story_not_accessible/i.test(msg)) {
      return { ok: false, error: "story_not_public" };
    }
    if (/not_authenticated/i.test(msg)) {
      return { ok: false, error: "unauthorized" };
    }
    console.error("[forkStoryToPlaythrough] RPC failed:", msg);
    return { ok: false, error: "fork_failed" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.playthrough_id) {
    return { ok: false, error: "fork_returned_empty" };
  }

  revalidatePath("/library");
  return { ok: true, data: { playthroughId: row.playthrough_id as string } };
}
