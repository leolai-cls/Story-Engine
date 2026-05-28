"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidatePath } from "next/cache";
import { ModerationConfigError, moderateText, verdictToCode } from "@/lib/moderation/openai-moderation";
import { MODELS } from "@/lib/ai/models";

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

  // P5-SEC-C-02 defense-in-depth — Wave 1.5 Migration 0011 RPC also blocks
  // owner self-rating, but checking here gives a clear 繁中 error instead
  // of the generic RPC exception mapping below.
  const { data: storyOwner } = await supabase
    .from("stories")
    .select("owner_id, content_rating")
    .eq("id", params.storyId)
    .single();
  if (!storyOwner) {
    return { ok: false, error: "story_not_found" };
  }
  if (storyOwner.owner_id === user.id) {
    // Wave 1 audit C-02 fix (2026-05-27): error code instead of 繁中 (client localizes via t("errors.community.cannotRateOwnStory"))
    return { ok: false, error: "cannot_rate_own_story" };
  }

  // P5-SEC-C-01 + W1-MOD-C-02 — moderate review text before persist with
  // failClosed:true so OpenAI outage doesn't silently bypass CSAM filter.
  // ModerationConfigError (missing API key) propagates → surfaced as 500
  // deployment error below.
  if (params.reviewText && params.reviewText.trim().length > 0) {
    try {
      const verdict = await moderateText(
        params.reviewText,
        (storyOwner.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
        { failClosed: true },
      );
      if (!verdict.allowed) {
        console.warn(
          `[rateStory] moderation blocked review on story ${params.storyId} for user ${user.id}: ${verdict.categories.join(", ")}`,
        );
        return { ok: false, error: verdictToCode(verdict.categories) };
      }
    } catch (e) {
      if (e instanceof ModerationConfigError) {
        console.error("[rateStory] moderation config error:", e.message);
        // Wave 1 audit C-02 fix: code instead of 繁中 (client localizes via t("errors.community.moderationConfigError")).
        return { ok: false, error: "moderation_config_error" };
      }
      throw e;
    }
  }

  // W1-MOD-C-01 fix: direct supabase.from("story_ratings").upsert() is now
  // REVOKEd from authenticated. Use service-role client to call the new
  // SECURITY DEFINER RPC. Browser users cannot call this RPC (granted to
  // service_role only) → moderation above is mandatory enforcement.
  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient.rpc("upsert_story_rating_secure", {
    p_story_id: params.storyId,
    p_user_id: user.id,
    p_score: params.score,
    p_review_text: params.reviewText ?? null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/cannot_rate_own_story/i.test(msg)) {
      // Wave 1 audit C-02 fix: code (client localizes).
      return { ok: false, error: "cannot_rate_own_story" };
    }
    if (/story_not_public/i.test(msg)) {
      return { ok: false, error: "story_not_public" };
    }
    if (/story_not_found/i.test(msg)) {
      return { ok: false, error: "story_not_found" };
    }
    if (/invalid_score|review_too_long/i.test(msg)) {
      return { ok: false, error: "invalid_input" };
    }
    console.error("[rateStory] RPC failed:", msg);
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

  // P5-SEC-C-01 + W1-MOD-C-02 — moderate body fail-closed.
  try {
    const verdict = await moderateText(
      trimmed,
      (story.content_rating as "sfw" | "soft" | "adult") ?? "sfw",
      { failClosed: true },
    );
    if (!verdict.allowed) {
      console.warn(
        `[upsertComment] moderation blocked comment on story ${params.storyId} for user ${user.id}: ${verdict.categories.join(", ")}`,
      );
      // Session 16 PM Review #2 (C-01) fix: was returning verdict.reason (繁中-only
      // string from openai-moderation.ts) which leaked Cantonese to EN / zh-Hans
      // users. rateStory at L188 was correctly using verdictToCode but this sibling
      // path was missed in the original MED-04 sweep.
      return { ok: false, error: verdictToCode(verdict.categories) };
    }
  } catch (e) {
    if (e instanceof ModerationConfigError) {
      console.error("[upsertComment] moderation config error:", e.message);
      return { ok: false, error: "moderation_config_error" };
    }
    throw e;
  }

  // W1-MOD-C-01 fix: direct INSERT REVOKEd from authenticated. Use
  // service-role RPC.
  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.rpc("insert_story_comment_secure", {
    p_story_id: params.storyId,
    p_user_id: user.id,
    p_body: trimmed,
    p_parent_id: params.parentId ?? null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/story_not_found/i.test(msg)) return { ok: false, error: "story_not_found" };
    if (/story_not_accessible/i.test(msg)) return { ok: false, error: "story_not_public" };
    if (/parent_mismatch/i.test(msg)) return { ok: false, error: "parent_mismatch" };
    if (/body_invalid_length/i.test(msg)) return { ok: false, error: "body_invalid_length" };
    console.error("[upsertComment] RPC failed:", msg);
    return { ok: false, error: "comment_failed" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.comment_id) {
    console.error("[upsertComment] RPC returned no comment_id");
    return { ok: false, error: "comment_failed" };
  }

  revalidatePath(`/library/${params.storyId}` as never);
  return { ok: true, data: { commentId: row.comment_id as string } };
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

  // W1-MOD-C-01 fix: direct UPDATE REVOKEd from authenticated. Use
  // service-role RPC which verifies caller owns the comment.
  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient.rpc("soft_delete_comment_secure", {
    p_comment_id: commentId,
    p_user_id: user.id,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/not_comment_owner/i.test(msg)) {
      return { ok: false, error: "not_comment_owner" };
    }
    if (/comment_not_found/i.test(msg)) {
      return { ok: false, error: "comment_not_found" };
    }
    console.error("[softDeleteComment] RPC failed:", msg);
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

  // W1-MOD-M-05 / W1-COST-M-08 (Wave 2 audit fix) — moderate details text
  // if non-empty. Admin moderation queue should NOT collect CSAM-flavored
  // payloads inside report bodies; that's both a queue-poisoning attack
  // vector and a legal-retention hazard. failClosed:true ensures we don't
  // silently accept abuse text on transient API errors.
  // Block fallback: file the report without details rather than reject the
  // whole report (legitimate reports shouldn't be denied because details
  // tripped the filter — keep the spam/harassment flag, drop the payload).
  let detailsForInsert: string | null = params.details?.trim() || null;
  if (detailsForInsert && detailsForInsert.length > 0) {
    try {
      const verdict = await moderateText(detailsForInsert, "sfw", { failClosed: true });
      if (!verdict.allowed) {
        console.warn(
          `[reportContent] moderation dropped details from user ${user.id} on ${params.contentType}/${params.contentId}: ${verdict.categories.join(", ")}`,
        );
        // Drop details, keep report — moderation team sees the flag without abuse payload.
        detailsForInsert = null;
      }
    } catch (e) {
      if (e instanceof ModerationConfigError) {
        console.error("[reportContent] moderation config error:", e.message);
        // Deployment misconfig — block to surface loudly.
        // Wave 1 audit C-02 fix: code instead of 繁中 (client localizes via t("errors.community.moderationConfigError")).
        return { ok: false, error: "moderation_config_error" };
      }
      throw e;
    }
  }

  const { data, error } = await supabase
    .from("moderation_flags")
    .insert({
      content_type: params.contentType,
      content_id: params.contentId,
      reporter_id: user.id,
      reason: params.reason,
      details: detailsForInsert,
    })
    .select("id")
    .single();

  if (error || !data) {
    const msg = error?.message ?? "";
    // P5-LOGIC-H-04 — Migration 0010 adds UNIQUE(reporter, content_type, content_id).
    // Duplicate report = friendly "already reported" message instead of generic fail.
    if (error?.code === "23505" || /duplicate key|unique/i.test(msg)) {
      // Wave 1 audit C-02 fix: code instead of 繁中 (client localizes).
      return { ok: false, error: "already_reported" };
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

  // AUDIT FIX P0A-HIGH-02 / P0B-CRIT-02 (2026-05-25): wire default_tier into
  // fork. If caller didn't supply explicit llmModel, read the user's
  // default_tier from profile · route to a pool model via pickModelForTier.
  // Legacy users (no default_tier yet) fall back to default_model · then to
  // Sonnet hard default.
  // ADR-022 fallback · gemini-3-5-flash (Standard pool · free-tier 允許) ·
  // 之前 hardcoded Sonnet · free user fork story 即時被 tier-gate reject.
  let resolvedModel: string = params.llmModel ?? "gemini-3-5-flash";
  if (!params.llmModel) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_tier, default_model")
      .eq("id", user.id)
      .maybeSingle();
    // ADR-022: legacy default_tier 可能仍係 "pro-max" / "adult" · narrow 落 valid 2-tier.
    const rawTierPref = profile?.default_tier as string | null | undefined;
    const tierPref: "standard" | "pro" | null =
      rawTierPref === "standard" || rawTierPref === "pro" ? rawTierPref : null;
    if (tierPref) {
      // Fork-specific: 用 CJK default routing (繁中 launch market) · 唔 pass storyId UUID 做 context.
      const { pickModelForTier } = await import("@/lib/ai/tier-router");
      resolvedModel = pickModelForTier(tierPref);
    } else if (profile?.default_model) {
      resolvedModel = profile.default_model;
    }
    // else: keep the Sonnet default already assigned above
  }

  // AUDIT FIX P0AW4-CRIT-01 (Wave 4 · 2026-05-25): tier-gate the resolved
  // model BEFORE writing to DB. Previously fork action accepted caller-
  // supplied llmModel without validation · a Free user could pass
  // 'claude-opus-4-7' (Pro Max only) and have it locked to their playthrough
  // until Migration 0022 trigger started blocking direct-writes.
  //
  // Now: caller-supplied llmModel goes through userTierAllowsModel · if
  // user's subscription tier doesn't unlock it · reject with 403-equivalent.
  // Tier-routed resolvedModel from pickModelForTier is always in user's
  // subscription pool so check is a no-op for that path · just defense in
  // depth for the caller-supplied path.
  const { userTierAllowsModel } = await import("@/lib/billing/credits");
  const forkTierCheck = await userTierAllowsModel(supabase, user.id, resolvedModel);
  if (!forkTierCheck.allowed) {
    console.warn(
      `[forkStoryToPlaythrough] user ${user.id} tier=${forkTierCheck.tier} blocked from fork with model=${resolvedModel} reason=${forkTierCheck.reason}`,
    );
    return { ok: false, error: "model_tier_required" };
  }

  // P6-HIGH-01: derive llm_provider from MODELS · pass to RPC (Migration 0016
  // added p_llm_provider param). Fixes mis-attribution where Llama (openrouter)
  // forked stories were stamped as anthropic. MODELS[unknown] is now
  // guaranteed defined post-tier-gate · so the fallback is defensive only.
  const resolvedProvider = MODELS[resolvedModel]?.provider ?? "openrouter";
  const { data, error } = await supabase.rpc("fork_story_to_playthrough", {
    p_story_id: params.storyId,
    p_character_name: params.characterName ?? null,
    p_llm_model: resolvedModel,
    p_llm_provider: resolvedProvider,
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
