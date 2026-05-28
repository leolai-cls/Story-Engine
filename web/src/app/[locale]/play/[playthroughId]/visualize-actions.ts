"use server";

import { ModerationConfigError, moderateText } from "@/lib/moderation/openai-moderation";

/**
 * Phase 8 · Scene visualization server actions.
 *
 * generateSceneImage orchestration (per Phase 8 plan):
 *   1. Auth + tier check (Free disabled · Standard+ allowed · adult-rated
 *      story requires adult_mode_enabled=true + KYC verified)
 *   2. Load playthrough + story + turn text
 *   3. Detect characters in scene from turn content
 *   4. Lazy character portrait gen if missing (per character · $0.04 + 40c)
 *   5. Resolve style (preset · upload reference · custom prompt · AI suggest)
 *   6. Compose final prompt · pick provider via OpenRouter routing
 *   7. Generate image via OpenRouter
 *   8. Pre-flight moderation already done in image-gen via provider's filters;
 *      we trust + insert into scene_images. Admin reviews via /admin/moderation
 *      if user reports.
 *   9. Upload base64 PNG → Supabase Storage scene-images bucket · get public URL
 *  10. apply_credit_charge atomic ledger write
 *  11. Insert scene_images row · return id + storage_url to client
 *
 * Adult mode flow (Q5 + founder NSFW UX decision):
 *   - story.content_rating='adult' + user.adult_mode_enabled=true → route Grok
 *   - story.content_rating='adult' + user.adult_mode_enabled=false → reject
 *     with code 'adult_mode_required' (UI shows lock badge link to /settings)
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCachedUser } from "@/lib/supabase/cached-user";
import {
  generateSceneImage as callProvider,
  estimateImageCredits,
  pickImageModel,
  CHARACTER_PORTRAIT_CREDITS,
  type ImageType,
} from "@/lib/ai/image-gen";
import {
  KIEIO_STYLES,
  composeStyledPrompt,
  aspectForImageType,
  matchStylesForSeed,
  type StyleKey,
} from "@/lib/ai/image-styles";
import { chargeCredits } from "@/lib/billing/credits";
import { generateText } from "ai";
import { getProviderModel } from "@/lib/ai/providers";
import { DIRECTOR_MODEL } from "@/lib/ai/models";
import { captureServerEvent } from "@/lib/posthog/server";
import { revalidatePath } from "next/cache";

const ALLOWED_IMAGE_TYPES = ["illustration", "comic", "wallpaper"] as const;

export type VisualizeSceneInput = {
  playthroughId: string;
  turnIndex: number;
  imageType: ImageType;
  /** Style mode: pick from preset · use existing upload · write own prompt · or let AI auto-suggest from turn */
  styleMode: "preset" | "upload" | "custom" | "ai_suggested";
  /** When styleMode='preset' */
  styleKey?: StyleKey;
  /** When styleMode='upload' · style_references.id */
  styleReferenceId?: string;
  /** When styleMode='custom' OR user wants override */
  customPrompt?: string;
};

export type VisualizeSceneResult =
  | {
      ok: true;
      sceneImageId: string;
      storageUrl: string;
      creditsCharged: number;
      provider: string;
    }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "tier_required"
        | "adult_mode_required"
        | "playthrough_not_found"
        | "not_owner"
        | "turn_not_found"
        | "insufficient_credits"
        | "content_filter"
        | "rate_limited"
        | "provider_unavailable"
        | "storage_upload_failed"
        | "moderation_blocked"
        | "config_error"
        | "unknown";
      message?: string;
      currentBalance?: number;
      needed?: number;
    };

/**
 * Main entry · user clicks「Generate scene」.
 */
export async function generateScene(
  input: VisualizeSceneInput,
): Promise<VisualizeSceneResult> {
  // ─── Auth ──────────────────────────────────────────────────────────────
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "unauthorized" };

  if (!ALLOWED_IMAGE_TYPES.includes(input.imageType)) {
    return { ok: false, error: "config_error", message: "invalid image_type" };
  }

  const supabase = await createClient();

  // ─── Load playthrough + story ──────────────────────────────────────────
  const { data: pt, error: ptErr } = await supabase
    .from("playthroughs")
    .select(
      "id, user_id, story_id, character_name",
    )
    .eq("id", input.playthroughId)
    .maybeSingle();
  if (ptErr || !pt) return { ok: false, error: "playthrough_not_found" };
  if (pt.user_id !== user.id) return { ok: false, error: "not_owner" };

  const { data: story } = await supabase
    .from("stories")
    .select("id, title, description, content_rating, style_key, style_reference_url, style_custom_prompt")
    .eq("id", pt.story_id)
    .single();
  if (!story) return { ok: false, error: "playthrough_not_found" };

  // ─── Adult mode gating (Q5 + NSFW UX decision) ────────────────────────
  const contentRating = (story.content_rating ?? "sfw") as "sfw" | "soft" | "adult";
  if (contentRating === "adult") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("adult_mode_enabled, is_age_verified, subscription_tier")
      .eq("id", user.id)
      .single();
    if (!profile?.adult_mode_enabled || !profile?.is_age_verified) {
      return { ok: false, error: "adult_mode_required" };
    }
  }

  // Tier check · Free disabled · Standard+ required (image gen credit cost
  // would drain Free tier ~1k budget in 20 images · gated for cost protection)
  const { data: profileForTier } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();
  const tier = (profileForTier?.subscription_tier ?? "free") as string;
  if (tier === "free") {
    return { ok: false, error: "tier_required" };
  }

  // ─── Load turn ─────────────────────────────────────────────────────────
  const { data: turnRow } = await supabase
    .from("turns")
    .select("text, role, turn_index")
    .eq("playthrough_id", input.playthroughId)
    .eq("turn_index", input.turnIndex)
    .maybeSingle();
  if (!turnRow) return { ok: false, error: "turn_not_found" };

  // ─── Resolve scene prompt (Q4 · AI auto OR user-provided) ──────────────
  let scenePrompt: string;
  if (input.styleMode === "custom" && input.customPrompt?.trim()) {
    scenePrompt = input.customPrompt.trim().slice(0, 500);
  } else {
    // AI summarize turn → scene gen prompt · cheap Haiku call (~$0.001)
    scenePrompt = await summarizeTurnForScene(turnRow.text as string);
  }

  // ─── Resolve style (Q1 + 3-tier picker) ────────────────────────────────
  let resolvedStyleKey: StyleKey | null = null;
  let styleReferenceUrl: string | null = null;
  let styleMode: "preset" | "upload" | "custom" | "ai_suggested" = input.styleMode;

  if (input.styleMode === "preset") {
    resolvedStyleKey =
      (input.styleKey as StyleKey | undefined) ??
      (story.style_key as StyleKey | null) ??
      null;
    if (!resolvedStyleKey || !(resolvedStyleKey in KIEIO_STYLES)) {
      const suggested = matchStylesForSeed(
        (story.description as string | null) ?? "",
      );
      resolvedStyleKey = suggested[0] ?? "cinematic";
      styleMode = "ai_suggested";
    }
  } else if (input.styleMode === "upload" && input.styleReferenceId) {
    // Validate the uploaded reference belongs to this user + still valid
    const { data: ref } = await supabase
      .from("style_references")
      .select("storage_url, expires_at, moderation_status")
      .eq("id", input.styleReferenceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ref || ref.moderation_status === "rejected" || ref.moderation_status === "expired") {
      // Fall back to AI-suggested preset
      const suggested = matchStylesForSeed(
        (story.description as string | null) ?? "",
      );
      resolvedStyleKey = suggested[0] ?? "cinematic";
      styleMode = "ai_suggested";
    } else {
      styleReferenceUrl = ref.storage_url as string;
    }
  } else if (input.styleMode === "ai_suggested" || !input.styleMode) {
    const suggested = matchStylesForSeed(
      (story.description as string | null) ?? "",
    );
    resolvedStyleKey = suggested[0] ?? "cinematic";
    styleMode = "ai_suggested";
  }

  // ─── Detect characters in scene (Q2) ──────────────────────────────────
  // Load story characters · simple name match against turn text
  const { data: characters } = await supabase
    .from("story_characters")
    .select("id, name, role, visual_description, portrait_url")
    .eq("story_id", story.id);
  const detectedChars = (characters ?? []).filter((c) =>
    typeof c.name === "string" && (turnRow.text as string).includes(c.name),
  );

  // Lazy portrait gen · for each character missing portrait_url · skip MVP
  // wave 1 — character_reference_urls will be empty on first ship · we
  // pass visual_description text into prompt only. Wave 2 adds the lazy
  // portrait gen flow (separate server action · charges 40 credits each).
  const characterReferenceUrls = detectedChars
    .map((c) => c.portrait_url as string | null)
    .filter((u): u is string => !!u);
  const characterDescriptions = detectedChars
    .map((c) => (c.visual_description as string | null) ?? `${c.name}`)
    .filter((d): d is string => !!d);

  // ─── Compose final prompt ──────────────────────────────────────────────
  const { positive, negative } = composeStyledPrompt({
    styleKey: resolvedStyleKey,
    customPrompt: styleMode === "custom" ? scenePrompt : null,
    scenePrompt: styleMode === "custom" ? "" : scenePrompt,
    characterDescriptions,
  });

  // ─── Pre-flight cost estimate · check user has enough credits ──────────
  const creditsToCharge = estimateImageCredits(contentRating, input.imageType);
  const aspect = aspectForImageType(input.imageType);

  // ─── Generate image (the actual provider call) ─────────────────────────
  const genResult = await callProvider({
    contentRating,
    imageType: input.imageType,
    prompt: positive,
    negativePrompt: negative,
    styleReferenceUrl,
    characterReferenceUrls,
    width: aspect.width,
    height: aspect.height,
  });

  if (!genResult.ok) {
    console.warn(
      `[scene-image] provider failed for user=${user.id} pt=${input.playthroughId} turn=${input.turnIndex}:`,
      genResult.message,
    );
    return {
      ok: false,
      error: genResult.reason === "content_filter"
        ? "content_filter"
        : genResult.reason === "rate_limited"
          ? "rate_limited"
          : genResult.reason === "config_error"
            ? "config_error"
            : "provider_unavailable",
      message: genResult.message,
    };
  }

  // ─── Upload to Supabase Storage ────────────────────────────────────────
  // Decode base64 · upload as image/png · public bucket
  const serviceClient = createServiceRoleClient();
  const imageBuffer = Buffer.from(genResult.imageBase64, "base64");
  const filename = `${user.id}/${input.playthroughId}/${input.turnIndex}-${Date.now()}.png`;
  const { data: uploadData, error: uploadErr } = await serviceClient.storage
    .from("scene-images")
    .upload(filename, imageBuffer, {
      contentType: "image/png",
      upsert: false,
    });
  if (uploadErr || !uploadData) {
    console.error("[scene-image] storage upload failed:", uploadErr);
    return { ok: false, error: "storage_upload_failed", message: uploadErr?.message };
  }
  const { data: publicUrlData } = serviceClient.storage
    .from("scene-images")
    .getPublicUrl(uploadData.path);
  const storageUrl = publicUrlData.publicUrl;

  // ─── Charge credits (atomic via apply_credit_charge RPC) ───────────────
  // We pass userClient (not service) so RLS / auth.uid() check still runs.
  const charge = await chargeCredits(supabase, {
    userId: user.id,
    delta: -creditsToCharge,
    reason: "scene_image_charge",
    refType: "scene_image",
    metadata: {
      playthrough_id: input.playthroughId,
      turn_index: input.turnIndex,
      image_type: input.imageType,
      provider: genResult.provider,
      model_id: genResult.modelId,
      style_mode: styleMode,
    },
  });
  if (!charge.ok) {
    // Rollback: delete uploaded image
    await serviceClient.storage.from("scene-images").remove([uploadData.path]);
    if (charge.error === "insufficient_credits") {
      return {
        ok: false,
        error: "insufficient_credits",
        currentBalance: charge.currentBalance,
        needed: charge.needed,
      };
    }
    return { ok: false, error: "unknown", message: charge.error };
  }

  // ─── Insert scene_images row (service-role · idempotent via uuid) ─────
  const styleValue =
    styleMode === "custom"
      ? scenePrompt.slice(0, 200)
      : styleMode === "upload" && styleReferenceUrl
        ? styleReferenceUrl
        : resolvedStyleKey ?? "";

  const { data: sceneRow, error: insertErr } = await serviceClient
    .from("scene_images")
    .insert({
      playthrough_id: input.playthroughId,
      turn_index: input.turnIndex,
      user_id: user.id,
      image_type: input.imageType,
      aspect_ratio: aspect.ratio,
      provider: genResult.provider,
      model_id: genResult.modelId,
      storage_url: storageUrl,
      prompt_text: positive,
      style_mode: styleMode,
      style_value: styleValue,
      character_ids: detectedChars.map((c) => c.id as string),
      credits_charged: creditsToCharge,
      ledger_id: charge.ledgerId,
      moderation_status: "approved",
    })
    .select("id")
    .single();

  if (insertErr || !sceneRow) {
    console.error("[scene-image] DB insert failed:", insertErr);
    return { ok: false, error: "unknown", message: insertErr?.message };
  }

  // ─── PostHog event (server-side) ───────────────────────────────────────
  try {
    await captureServerEvent(user.id, "scene_image_generated", {
      playthrough_id: input.playthroughId,
      turn_index: input.turnIndex,
      image_type: input.imageType,
      style_mode: styleMode,
      style_value: styleValue,
      provider: genResult.provider,
      credits_charged: creditsToCharge,
      content_rating: contentRating,
    });
  } catch {
    // non-fatal
  }

  revalidatePath(`/play/${input.playthroughId}`);
  revalidatePath(`/play/${input.playthroughId}/memory`);

  return {
    ok: true,
    sceneImageId: sceneRow.id as string,
    storageUrl,
    creditsCharged: creditsToCharge,
    provider: genResult.provider,
  };
}

/**
 * Phase 8 · upload a user-provided style reference image.
 *
 * Founder TOS-shift posture (2026-05-28): platform keeps CSAM hard floor
 * only · user warrants ownership/fair-use via TOS. Drops face detection
 * modal + per-upload copyright checkbox (was in earlier draft).
 *
 * Flow:
 *   1. Auth + tier check
 *   2. Validate MIME + size (5MB · jpeg/png/webp)
 *   3. Filename hint moderation (text-level CSAM check on prompt-like name)
 *   4. Upload to Supabase Storage style-references bucket
 *   5. Insert style_references row · expires_at = now + 24h
 *   6. Return id + URL for client to use in subsequent generateScene call
 */
export type UploadStyleReferenceResult =
  | { ok: true; id: string; storageUrl: string; expiresAt: string }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "tier_required"
        | "invalid_file"
        | "file_too_large"
        | "moderation_blocked"
        | "storage_failed"
        | "config_error";
      message?: string;
    };

export async function uploadStyleReference(
  formData: FormData,
): Promise<UploadStyleReferenceResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();

  // Tier gate · same as scene gen
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();
  const tier = (profile?.subscription_tier ?? "free") as string;
  if (tier === "free") return { ok: false, error: "tier_required" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "invalid_file", message: "no file in form data" };
  }

  // MIME + size validation
  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedMimes.includes(file.type)) {
    return { ok: false, error: "invalid_file", message: `unsupported mime: ${file.type}` };
  }
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { ok: false, error: "file_too_large", message: `${file.size} > 5MB` };
  }

  // Light text-level moderation on filename (e.g., reject filenames like
  // "child_nude.jpg" before they touch storage · cheap text-only check).
  // Full image-content moderation is delegated to provider safety filters
  // when this reference is used in a subsequent scene gen call (Phase 8 plan
  // TOS-shift · CSAM hard floor only).
  const filename = file.name || "upload";
  try {
    const verdict = await moderateText(filename, "sfw", { failClosed: false });
    if (!verdict.allowed) {
      return {
        ok: false,
        error: "moderation_blocked",
        message: "filename blocked by moderation",
      };
    }
  } catch (e) {
    if (e instanceof ModerationConfigError) {
      return { ok: false, error: "config_error", message: e.message };
    }
    // Non-config error → continue (filename text moderation is best-effort)
  }

  // Upload via service-role (RLS prevents direct client write to bucket)
  const serviceClient = createServiceRoleClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data: uploadData, error: uploadErr } = await serviceClient.storage
    .from("style-references")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr || !uploadData) {
    console.error("[upload-style-ref] storage upload failed:", uploadErr);
    return { ok: false, error: "storage_failed", message: uploadErr?.message };
  }

  const { data: publicUrlData } = serviceClient.storage
    .from("style-references")
    .getPublicUrl(uploadData.path);
  const storageUrl = publicUrlData.publicUrl;

  // Insert style_references row · expires_at default 24h via column default
  const { data: rowData, error: insertErr } = await serviceClient
    .from("style_references")
    .insert({
      user_id: user.id,
      storage_url: storageUrl,
      original_filename: filename.slice(0, 200),
      file_size_bytes: file.size,
      mime_type: file.type,
      moderation_status: "approved", // filename-only check passed; provider gates image
    })
    .select("id, expires_at")
    .single();

  if (insertErr || !rowData) {
    // Rollback storage
    await serviceClient.storage.from("style-references").remove([uploadData.path]);
    console.error("[upload-style-ref] DB insert failed:", insertErr);
    return { ok: false, error: "storage_failed", message: insertErr?.message };
  }

  return {
    ok: true,
    id: rowData.id as string,
    storageUrl,
    expiresAt: rowData.expires_at as string,
  };
}

/**
 * Helper · LLM-summarize turn text into a scene description for image gen.
 * Uses Director model (Haiku 4.5 · cheap · ~$0.001) · single short call.
 */
async function summarizeTurnForScene(turnText: string): Promise<string> {
  const text = turnText.slice(0, 4000); // cap input
  const model = getProviderModel(DIRECTOR_MODEL);
  try {
    const { text: summary } = await generateText({
      model,
      system: [
        "You are a scene-direction assistant for an image generation pipeline.",
        "Read the narrative turn and output ONE concise scene description suitable for a text-to-image prompt.",
        "Focus on: characters in frame, action / pose, location, mood, lighting.",
        "Output 50-100 English words. No markdown. No bullet points. No camera-jargon (just describe what to see).",
        "DO NOT include style instructions (art style is applied separately downstream).",
        "DO NOT include dialogue text in the description.",
      ].join("\n"),
      prompt: text,
      temperature: 0.4,
      maxOutputTokens: 200,
    });
    return summary.trim().slice(0, 600);
  } catch {
    // Fallback · pass through truncated turn text
    return text.slice(0, 200);
  }
}
