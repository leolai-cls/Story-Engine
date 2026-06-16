/**
 * Phase 8 · Image generation client · CrazyRouter aggregator.
 *
 * Model routing (founder rule 2026-05-29):
 *   - ALL images (illustration / comic / wallpaper) → gpt-image-2
 *   - ONLY NSFW (adult-rated) images → grok-4-image (gpt-image-2 can't do
 *     explicit NSFW; grok-4-image is the most permissive available)
 *
 * Verified 2026-05-29: CrazyRouter /v1/images/generations returns 200 + a `url`
 * (NOT b64_json — do NOT send response_format, gpt-image-2 400s on it). The
 * response handler below fetches that url → base64.
 *
 * Routed through CrazyRouter (CRAZYROUTER_API_KEY). Generic fetch (not
 * @ai-sdk/openai images) keeps full control over the OpenAI-compatible
 * /v1/images/generations body + reference-image fields.
 */

import type { StyleKey } from "./image-styles";

export type ImageType = "illustration" | "comic" | "wallpaper";

export type ImageGenRequest = {
  /** Story content_rating · drives provider routing for NSFW */
  contentRating: "sfw" | "soft" | "adult";
  /** Image output type · drives provider selection for CJK text + aspect */
  imageType: ImageType;
  /** Composed prompt (style + scene + characters · see composeStyledPrompt) */
  prompt: string;
  /** Optional · provider-supported negative prompt */
  negativePrompt?: string;
  /** Optional · style reference image URL (upload mode) · NULL for preset / custom */
  styleReferenceUrl?: string | null;
  /** Optional · character reference images (lazy portraits · per-NPC face anchors) */
  characterReferenceUrls?: string[];
  /** Aspect ratio · {width, height} */
  width: number;
  height: number;
};

export type ImageGenResult =
  | {
      ok: true;
      /** base64 PNG · caller uploads to Storage */
      imageBase64: string;
      provider: string;       // 'openrouter:google/gemini-2.5-flash-image'
      modelId: string;        // 'google/gemini-2.5-flash-image'
      promptUsed: string;
    }
  | {
      ok: false;
      reason:
        | "provider_unavailable"
        | "content_filter"
        | "rate_limited"
        | "config_error"
        | "unknown";
      message: string;
      provider?: string;
      modelId?: string;
    };

/**
 * Pick a CrazyRouter image model chain (primary + optional fallback).
 *
 * Founder rule (2026-06-04 — reverts the 2026-06-01 nano-banana experiment that
 * silently broke non-adult image gen):
 *   non-adult (any imageType) →  gpt-image-2    (proven · no fallback · keep it simple)
 *   adult (any imageType)     →  grok-4-image   (only NSFW-capable · no fallback)
 *
 * History: 2026-05-29 = "all gpt-image-2 · only NSFW grok"; 2026-06-01 (PR #51)
 * tried nano-banana-2/pro for speed but that path never produced a non-adult
 * image; 2026-06-04 founder reverted to gpt-image-2 only.
 */
export type ImageModelChain = {
  primary: string;
  fallback?: string;
};

export function pickImageModelChain(
  contentRating: "sfw" | "soft" | "adult",
  _imageType: ImageType,
): ImageModelChain {
  // 2026-06-07 (founder · "still can't generate image" · Vercel-log-confirmed):
  // CrazyRouter returns a non-200 for `gpt-image-2` (the !response.ok error path
  // fired). The API key is fine (adult Grok narrator + embeddings + other
  // CrazyRouter calls all work), so `gpt-image-2` is simply NOT a valid/working
  // CrazyRouter image slug (same failure class as the nano-banana-2 experiment).
  // The only CONFIRMED-working image model is grok-4-image. So non-adult now
  // FALLS BACK to grok-4-image: keep gpt-image-2 as primary (cheap·SFW·founder's
  // pick · in case CrazyRouter adds it), but a fast 4xx instantly fails over to
  // grok-4-image so images ALWAYS render. If founder finds the real SFW slug
  // (gpt-image / dall-e / flux …) on their CrazyRouter dashboard, swap primary.
  if (contentRating === "adult") return { primary: "grok-4-image" };
  return { primary: "gpt-image-2", fallback: "grok-4-image" };
}

/**
 * Backwards-compat thin wrapper (still imported by visualize-actions.ts).
 * Returns the primary model only — fallback is handled inside generateSceneImage.
 */
export function pickImageModel(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
): string {
  return pickImageModelChain(contentRating, imageType).primary;
}

/**
 * Per-model fetch timeout. Google Gemini family (nano-banana-*) finishes in
 * seconds · gpt-image-2 has been timing out at 90s lately (P99 closer to
 * 120-180s) · grok needs medium. Lambda ceiling is 300s (page.tsx maxDuration),
 * so chain primary(180) + fallback(90) + upload/DB(~15) = ~285s · inside budget.
 */
function timeoutMsFor(modelId: string): number {
  if (modelId === "nano-banana-2") return 60_000;
  if (modelId === "nano-banana-pro") return 90_000; // premium may be slower
  if (modelId === "nano-banana") return 60_000; // legacy fallback ref
  if (modelId === "grok-4-image") return 120_000;
  // 2026-06-07: gpt-image-2 fails fast (CrazyRouter rejects the slug · ~instant
  // 4xx), but cap at 60s so a hang fails over to the grok-4-image fallback well
  // inside the 300s lambda budget (60 + 120 grok + ~15 upload = ~195s).
  if (modelId === "gpt-image-2") return 60_000;
  return 180_000; // anything else
}

/**
 * Generate a scene image · primary model + automatic fallback on transient failure.
 *
 * Real-world rejection rate < 1% per Phase 8 plan. On content_filter error ·
 * caller should refund credits + suggest user retry with different style or
 * rephrased prompt. On provider_unavailable / rate_limited from the primary,
 * we automatically retry with the fallback model from pickImageModelChain ·
 * gives the user a chance even when one CrazyRouter upstream is down.
 */
export async function generateSceneImage(
  req: ImageGenRequest,
): Promise<ImageGenResult> {
  const apiKey = process.env.CRAZYROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "config_error",
      message: "CRAZYROUTER_API_KEY not set",
    };
  }

  const chain = pickImageModelChain(req.contentRating, req.imageType);

  // Try primary
  const primaryResult = await callImageProvider(apiKey, chain.primary, req);
  if (primaryResult.ok) return primaryResult;

  // Fall back on ANY failure except content_filter (same content would fail
  // again) and config_error (missing key · fallback won't help). 2026-06-04:
  // widened from provider_unavailable|rate_limited only — a primary that fails
  // with "unknown" (e.g. provider returned no image data) should still let the
  // proven cross-provider fallback try, instead of dead-ending.
  const shouldFallback =
    !!chain.fallback &&
    primaryResult.reason !== "content_filter" &&
    primaryResult.reason !== "config_error";
  if (!shouldFallback) return primaryResult;

  console.warn(
    `[scene-image] primary ${chain.primary} failed (${primaryResult.reason}: ${primaryResult.message}) · trying fallback ${chain.fallback}`,
  );
  const fallbackResult = await callImageProvider(
    apiKey,
    chain.fallback!,
    req,
  );
  if (fallbackResult.ok) {
    console.log(
      `[scene-image] fallback ${chain.fallback} succeeded after primary ${chain.primary} failed`,
    );
  }
  return fallbackResult;
}

/**
 * Single-model image-gen call · POSTs to CrazyRouter /v1/images/generations
 * with per-model timeout. On success returns base64 PNG · on failure returns
 * a typed error so the orchestrator can decide whether to fall back.
 */
async function callImageProvider(
  apiKey: string,
  modelId: string,
  req: ImageGenRequest,
): Promise<ImageGenResult> {
  const provider = `crazyrouter:${modelId}`;

  // CrazyRouter image gen body · OpenAI-compatible /v1/images/generations.
  // 2026-05-29 (verified): do NOT send `response_format` — CrazyRouter's
  // gpt-image-2 rejects it (400 "response_format is not supported for
  // gpt-image-2; use output_format instead"). Omitting it → CrazyRouter
  // returns a `url` which we then fetch → base64. Same shape works across
  // nano-banana-2 · nano-banana-pro · gpt-image-2 · grok-4-image.
  const body: Record<string, unknown> = {
    model: modelId,
    prompt: req.prompt,
    size: `${req.width}x${req.height}`,
    n: 1,
  };

  // Reference images (style + character) · best-effort. Providers that ignore
  // the field produce a text-only result · degradation, not failure.
  const referenceUrls = [
    ...(req.styleReferenceUrl ? [req.styleReferenceUrl] : []),
    ...(req.characterReferenceUrls ?? []),
  ].slice(0, 4);
  if (referenceUrls.length > 0) {
    body.reference_images = referenceUrls;
  }
  // negative_prompt intentionally dropped · Gemini / GPT / Grok image paths
  // reject or ignore it; SD-class models would need an explicit allow-list.
  void req.negativePrompt;

  let response: Response;
  try {
    response = await fetch("https://crazyrouter.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Kieio",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMsFor(modelId)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: msg.includes("aborted") ? "provider_unavailable" : "unknown",
      message: `image gen fetch failed: ${msg}`,
      provider,
      modelId,
    };
  }

  if (!response.ok) {
    let errBody: {
      error?: { message?: string; type?: string; code?: string };
    } = {};
    try {
      errBody = await response.json();
    } catch {
      // ignore
    }
    const errMsg = errBody.error?.message ?? `HTTP ${response.status}`;
    const errType = errBody.error?.type ?? "";
    const errCode = errBody.error?.code ?? "";
    // 2026-06-04 (founder debug · "can't generate image"): log the EXACT
    // CrazyRouter response so a non-adult image failure is diagnosable (the
    // client used to swallow this into a generic "failed").
    console.error(
      `[scene-image] ${modelId} → HTTP ${response.status} · type=${errType} code=${errCode} · ${errMsg}`.slice(0, 400),
    );

    // Map common errors via keyword detection (Wave 3 fix AI-HIGH-03 ·
    // drop blanket 400→content_filter mapping · CrazyRouter returns 400 for
    // malformed body / invalid model / oversized prompt too).
    const errBlob = `${errType} ${errCode} ${errMsg}`.toLowerCase();
    const isContentFilter =
      errBlob.includes("content_filter") ||
      errBlob.includes("safety") ||
      errBlob.includes("content_policy_violation") ||
      errBlob.includes("image_generation_user_error") ||
      errBlob.includes("policy") ||
      errBlob.includes("nsfw") ||
      errBlob.includes("csam") ||
      errBlob.includes("minor");
    if (isContentFilter) {
      return {
        ok: false,
        reason: "content_filter",
        message: errMsg,
        provider,
        modelId,
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        message: errMsg,
        provider,
        modelId,
      };
    }
    return {
      ok: false,
      reason: "provider_unavailable",
      message: `${response.status}: ${errMsg}`,
      provider,
      modelId,
    };
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    revised_prompt?: string;
  };

  const firstImage = data.data?.[0];
  if (!firstImage?.b64_json) {
    // URL-style response · fetch then base64-encode.
    if (firstImage?.url) {
      try {
        const imgResponse = await fetch(firstImage.url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (imgResponse.ok) {
          const buffer = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          return {
            ok: true,
            imageBase64: base64,
            provider,
            modelId,
            promptUsed: req.prompt,
          };
        }
      } catch {
        // fall through
      }
    }
    return {
      ok: false,
      reason: "provider_unavailable",
      message: "Provider returned no image data",
      provider,
      modelId,
    };
  }

  return {
    ok: true,
    imageBase64: firstImage.b64_json,
    provider,
    modelId,
    promptUsed: req.prompt,
  };
}

/**
 * Estimate credits to charge per image gen.
 *
 * 2026-06-08 (audit · hard rule #36 spec-vs-code): the old SFW prices assumed a
 * cheap Gemini provider ($0.005), but `gpt-image-2` is a non-working CrazyRouter
 * slug so ALL non-adult images actually fall back to grok-4-image (~$0.05/image,
 * the same provider+cost as adult). The 50/80-credit SFW prices were therefore
 * ~0% margin. Re-priced to match the real Grok cost (parity with adult), keeping
 * the platform's standard ~2× markup. If a genuinely cheaper SFW slug is found,
 * restore the lower numbers + the cheap-provider routing together.
 *
 * Real cost (CrazyRouter): grok-4-image ~$0.05/image · GPT-5.4-image-2 ~$0.045 (comic).
 * Pricing (≈2× markup):
 *   illustration (Grok $0.05) → 100 credits ($0.10)
 *   wallpaper    (Grok $0.05) → 120 credits ($0.12)
 *   comic        (GPT/Grok)   → 100 / Pro 200 credits
 *   Character portrait        → 40 credits
 */
export function estimateImageCredits(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
  proQuality: boolean = false,
): number {
  // Non-adult now runs on grok-4-image (same provider+cost as adult) — price at
  // parity rather than the retired cheap-Gemini assumption.
  if (imageType === "comic") return contentRating === "adult" || proQuality ? 200 : 100;
  if (imageType === "wallpaper") return 120;
  return 100; // illustration (all ratings · Grok)
}

/** Cost to generate one character portrait. Same for all providers. */
export const CHARACTER_PORTRAIT_CREDITS = 40;

/**
 * Cost to generate one character DESIGN SHEET (Wave 3 · fal gpt-image-2, high
 * quality 1536x1024). Real fal cost ≈ $0.15-0.18/image + the compose LLM call;
 * priced at 400 credits ($0.40) ≈ the platform's ~2× markup so it covers cost
 * even with an occasional transient retry (founder: "make sure cover the cost").
 * Charged ONLY on success. Re-baseline against real fal invoices (hard rule #20).
 */
export const CHARACTER_SHEET_CREDITS = 400;
