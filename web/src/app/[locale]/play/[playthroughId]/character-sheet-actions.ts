"use server";

/**
 * Wave 3 · Character design-sheet generation (fal gpt-image-2).
 *
 * generateCharacterSheet orchestration:
 *   1. Auth + own-playthrough check + tier gate (Standard+)
 *   2. Content rating: sfw/soft only (adult → not supported on fal · hard rule
 *      #5; gpt-image refuses NSFW anyway)
 *   3. Lock the character's appearance (B1 · ensureCharacterVisualDescription)
 *   4. Compose the adaptive sheet prompt (character × world × style)
 *   5. Moderate the composed prompt (CSAM/legal floor · hard rule #6 · fail-closed)
 *   6. Balance pre-check (CHARACTER_SHEET_CREDITS · charge ONLY on success)
 *   7. Generate via fal queue API (single attempt · client retries on failure)
 *   8. Upload PNG → scene-images bucket · charge credits · insert row
 *      (rollback refund + storage cleanup on insert failure · hard rule #4)
 *
 * The sheet is the user's collectible AND the per-(playthrough, character)
 * consistency anchor reused by later scene gen (image-to-image reference).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { ModerationConfigError, moderateText } from "@/lib/moderation/openai-moderation";
import { generateFalImage } from "@/lib/ai/fal-image";
import { composeCharacterSheetPrompt } from "@/lib/ai/character-sheet-prompt";
import { ensureCharacterVisualDescription } from "@/lib/ai/character-appearance";
import { CHARACTER_SHEET_CREDITS } from "@/lib/ai/image-gen";
import type { StyleKey } from "@/lib/ai/image-styles";
import { chargeCredits, getActiveTier } from "@/lib/billing/credits";
import { captureServerEvent } from "@/lib/posthog/server";
import { after } from "next/server";

const SHEET_WIDTH = 1536;
const SHEET_HEIGHT = 1024;

export type GenerateSheetInput = {
  playthroughId: string;
  storyCharacterId: string;
};

export type GenerateSheetResult =
  | {
      ok: true;
      sheetId: string;
      storageUrl: string;
      creditsCharged: number;
      provider: string;
    }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "not_owner"
        | "playthrough_not_found"
        | "character_not_found"
        | "tier_required"
        | "adult_mode_required"
        | "adult_not_supported"
        | "insufficient_credits"
        | "content_filter"
        | "rate_limited"
        | "provider_unavailable"
        | "storage_upload_failed"
        | "config_error"
        | "unknown";
      message?: string;
      currentBalance?: number;
      needed?: number;
    };

export async function generateCharacterSheet(
  input: GenerateSheetInput,
): Promise<GenerateSheetResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();

  // ─── Load playthrough + ownership ───────────────────────────────────────
  const { data: pt, error: ptErr } = await supabase
    .from("playthroughs")
    .select("id, user_id, story_id")
    .eq("id", input.playthroughId)
    .maybeSingle();
  if (ptErr || !pt) return { ok: false, error: "playthrough_not_found" };
  if (pt.user_id !== user.id) return { ok: false, error: "not_owner" };

  const { data: story } = await supabase
    .from("stories")
    .select("id, title, description, content_rating, style_key")
    .eq("id", pt.story_id)
    .single();
  if (!story) return { ok: false, error: "playthrough_not_found" };

  const contentRating = (story.content_rating ?? "sfw") as "sfw" | "soft" | "adult";

  // ─── Tier + content-rating gate ─────────────────────────────────────────
  const tier = await getActiveTier(supabase, user.id);
  if (tier === "free") return { ok: false, error: "tier_required" };

  // Adult stories: sheets render on fal gpt-image-2 which refuses NSFW + hard
  // rule #5 keeps NSFW off this provider. Not supported for v1.
  if (contentRating === "adult") {
    return { ok: false, error: "adult_not_supported" };
  }
  if (contentRating === "soft") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("adult_mode_enabled")
      .eq("id", user.id)
      .single();
    if (!profile?.adult_mode_enabled) {
      return { ok: false, error: "adult_mode_required" };
    }
  }

  // ─── Load the character (must belong to this story) ─────────────────────
  const { data: character } = await supabase
    .from("story_characters")
    .select("id, name, role, backstory, personality_traits, core_motivation, visual_description")
    .eq("id", input.storyCharacterId)
    .eq("story_id", story.id)
    .maybeSingle();
  if (!character) return { ok: false, error: "character_not_found" };

  // ─── Lock appearance (B1) · then compose the adaptive sheet prompt ──────
  // Cache write goes through the user client so RLS scopes it to the owner
  // (audit #1 · same as visualize-actions).
  const lockedAppearance = await ensureCharacterVisualDescription({
    serviceClient: supabase,
    character: {
      id: character.id as string,
      name: character.name as string,
      role: character.role as string | null,
      visual_description: character.visual_description as string | null,
      backstory: character.backstory as string | null,
      personality_traits: character.personality_traits as string[] | null,
      core_motivation: character.core_motivation as string | null,
    },
    storyTitle: (story.title as string) ?? "",
    storyDescription: (story.description as string | null) ?? null,
    contentRating,
  });

  const prompt = await composeCharacterSheetPrompt({
    character: {
      name: character.name as string,
      role: character.role as string | null,
      backstory: character.backstory as string | null,
      personality_traits: character.personality_traits as string[] | null,
      core_motivation: character.core_motivation as string | null,
      visual_description: lockedAppearance,
    },
    storyTitle: (story.title as string) ?? "",
    storyDescription: (story.description as string | null) ?? null,
    styleKey: (story.style_key as StyleKey | null) ?? null,
    contentRating,
  });

  // ─── Moderate the composed prompt (CSAM/legal floor · fail-closed) ──────
  try {
    const verdict = await moderateText(prompt, contentRating, { failClosed: true });
    if (!verdict.allowed) {
      return {
        ok: false,
        error: "content_filter",
        message: "內容未能通過安全檢查 · 請調整角色設定後再試",
      };
    }
  } catch (e) {
    if (e instanceof ModerationConfigError) {
      return { ok: false, error: "config_error", message: e.message };
    }
    return {
      ok: false,
      error: "config_error",
      message: "內容審核暫時無法使用 · 請稍後再試",
    };
  }

  // ─── Balance pre-check (charge only on success) ─────────────────────────
  const { data: balanceRow } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", user.id)
    .single();
  const currentBalance = (balanceRow?.credit_balance ?? 0) as number;
  if (currentBalance < CHARACTER_SHEET_CREDITS) {
    return {
      ok: false,
      error: "insufficient_credits",
      currentBalance,
      needed: CHARACTER_SHEET_CREDITS,
    };
  }

  // ─── Generate via fal (single attempt · client retries on transient fail) ─
  const gen = await generateFalImage({
    prompt,
    width: SHEET_WIDTH,
    height: SHEET_HEIGHT,
    quality: "high",
    outputFormat: "png",
  });
  if (!gen.ok) {
    console.warn(
      `[character-sheet] fal failed user=${user.id} pt=${input.playthroughId} char=${input.storyCharacterId}: ${gen.reason} ${gen.message}`,
    );
    if (gen.reason === "content_filter") {
      return { ok: false, error: "content_filter", message: "圖像生成被安全過濾擋下 · 請調整後再試" };
    }
    if (gen.reason === "rate_limited") return { ok: false, error: "rate_limited" };
    if (gen.reason === "config_error" || gen.reason === "balance_exhausted") {
      // OUR fal account misconfig / out of funds — platform issue, not the user.
      return { ok: false, error: "provider_unavailable", message: "生圖服務暫時無法使用 · 請稍後再試" };
    }
    return { ok: false, error: "provider_unavailable", message: gen.message };
  }

  // ─── Upload to Storage (service role · unguessable path) ────────────────
  const serviceClient = createServiceRoleClient();
  const { randomUUID } = await import("node:crypto");
  const filename = `${user.id}/${input.playthroughId}/sheet-${input.storyCharacterId}-${randomUUID()}.png`;
  const imageBuffer = Buffer.from(gen.imageBase64, "base64");
  const { data: uploadData, error: uploadErr } = await serviceClient.storage
    .from("scene-images")
    .upload(filename, imageBuffer, { contentType: "image/png", upsert: false });
  if (uploadErr || !uploadData) {
    console.error("[character-sheet] storage upload failed:", uploadErr);
    return { ok: false, error: "storage_upload_failed", message: uploadErr?.message };
  }
  const { data: publicUrlData } = serviceClient.storage
    .from("scene-images")
    .getPublicUrl(uploadData.path);
  const storageUrl = publicUrlData.publicUrl;

  // ─── Charge credits (atomic · user client so auth.uid() check runs) ─────
  const charge = await chargeCredits(supabase, {
    userId: user.id,
    delta: -CHARACTER_SHEET_CREDITS,
    reason: "character_sheet_charge",
    refType: "character_sheet",
    refId: input.storyCharacterId,
    metadata: {
      playthrough_id: input.playthroughId,
      story_character_id: input.storyCharacterId,
      provider: gen.provider,
      style_key: story.style_key ?? null,
    },
  });
  if (!charge.ok) {
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

  // ─── Insert character_sheets row (service role) · rollback on failure ───
  const { data: sheetRow, error: insertErr } = await serviceClient
    .from("character_sheets")
    .insert({
      playthrough_id: input.playthroughId,
      story_character_id: input.storyCharacterId,
      user_id: user.id,
      storage_url: storageUrl,
      prompt_text: prompt.slice(0, 4000),
      style_key: story.style_key ?? null,
      provider: gen.provider,
      model_id: "gpt-image-2",
      credits_charged: CHARACTER_SHEET_CREDITS,
      ledger_id: charge.ledgerId,
      moderation_status: "approved",
    })
    .select("id")
    .single();

  if (insertErr || !sheetRow) {
    console.error("[character-sheet] DB insert failed · rolling back:", insertErr);
    // Refund + remove orphan storage (hard rule #4 · keep ledger honest)
    try {
      await chargeCredits(supabase, {
        userId: user.id,
        delta: +CHARACTER_SHEET_CREDITS,
        reason: "refund",
        refType: "character_sheet",
        refId: input.storyCharacterId,
        metadata: {
          original_ledger_id: charge.ledgerId,
          reason_detail: "character_sheets_insert_failed",
        },
      });
    } catch (refundErr) {
      console.error("[character-sheet] refund FAILED · MANUAL ATTENTION:", refundErr, {
        userId: user.id,
        credits: CHARACTER_SHEET_CREDITS,
        original_ledger_id: charge.ledgerId,
      });
    }
    try {
      await serviceClient.storage.from("scene-images").remove([uploadData.path]);
    } catch (cleanupErr) {
      console.error("[character-sheet] storage cleanup FAILED · orphan:", cleanupErr, {
        path: uploadData.path,
      });
    }
    return { ok: false, error: "unknown", message: insertErr?.message };
  }

  after(async () => {
    try {
      await captureServerEvent(user.id, "character_sheet_generated", {
        playthrough_id: input.playthroughId,
        story_character_id: input.storyCharacterId,
        provider: gen.provider,
        style_key: story.style_key ?? null,
        credits_charged: CHARACTER_SHEET_CREDITS,
        content_rating: contentRating,
      });
    } catch {
      // non-fatal
    }
  });

  return {
    ok: true,
    sheetId: sheetRow.id as string,
    storageUrl,
    creditsCharged: CHARACTER_SHEET_CREDITS,
    provider: gen.provider,
  };
}
